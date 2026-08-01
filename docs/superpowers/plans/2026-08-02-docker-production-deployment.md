# Docker 单机生产部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Point Quest 增加一套只向宿主机发布 `127.0.0.1:3001`、可构建并实际启动验证的 Docker Compose 单机生产部署方案。

**Architecture:** 使用根目录多阶段 Dockerfile 生成迁移、NestJS API 和 Next.js standalone 三个目标镜像；独立 `compose.prod.yaml` 编排 PostgreSQL、一次性迁移、内部 API 与单端口 Web。宿主机现有 HTTPS 网关只转发到 Web，公网 `/api/v1` 通过现有 Next.js 同源代理访问内部 API。

**Tech Stack:** Docker 29、Docker Compose 5、Node.js 24.14.0、pnpm 10.28.2、Next.js 16 standalone、NestJS 11、Prisma 7.9.1、PostgreSQL 17。

## Global Constraints

- 默认在当前 `master` 分支修改，不新建分支。
- Git 提交信息必须使用简体中文。
- 禁止在循环遍历中查询 SQL；验证迁移状态只允许执行单次集合查询。
- 现有 `compose.yaml` 保持不变，只继续提供开发库和测试库。
- 生产 Compose 只允许 Web 发布 `127.0.0.1:3001:3001`；API 和 PostgreSQL 不得发布宿主机端口。
- 生产部署不包含 Nginx、Caddy、TLS 证书、Kubernetes、演示种子或自动备份调度。
- 真实 `.env.production`、数据库密码、JWT 密钥和连接串不得进入 Git 或镜像层。
- API 商品图片卷只能由 API 写入，挂载点固定为 `/app/uploads`。
- Next.js 相关修改必须遵循仓库内 Next.js 16.2.12 文档；standalone 必须复制 `public` 和 `.next/static`，并把 `outputFileTracingRoot` 指向 Monorepo 根目录。
- 每个完成声明必须有当前会话中新鲜的验证输出支持。

---

### Task 1: 固化生产 Compose 配置契约

**Files:**
- Create: `scripts/docker-production.test.mjs`
- Create: `.env.production.example`
- Create: `compose.prod.yaml`
- Modify: `.gitignore`
- Test: `scripts/docker-production.test.mjs`

**Interfaces:**
- Consumes: API 健康端点 `GET /api/v1/health`；Web 代理内部地址 `API_SERVER_BASE_URL`；现有环境变量 `DATABASE_URL`、`AUTH_JWT_SECRET`、`WEB_ORIGIN`、`PRODUCT_UPLOAD_ROOT`。
- Produces: 四服务生产编排 `db`、`migrate`、`api`、`web`；命名卷 `point-postgres-data`、`point-upload-data`；可被后续镜像任务使用的 build targets `migrate`、`api`、`web`。

- [x] **Step 1: 先写生产环境与 Compose 契约测试**

创建 `scripts/docker-production.test.mjs`，使用项目已有 `dotenv` 和 Docker Compose JSON 展开结果断言生产边界：

```js
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parse } from "dotenv";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const productionEnvUrl = new URL("../.env.production.example", import.meta.url);
const productionComposeUrl = new URL("../compose.prod.yaml", import.meta.url);

async function readProductionEnvironment() {
  return parse(await readFile(productionEnvUrl, "utf8"));
}

function readProductionCompose() {
  return JSON.parse(
    execFileSync(
      "docker",
      [
        "compose",
        "--env-file",
        fileURLToPath(productionEnvUrl),
        "-f",
        fileURLToPath(productionComposeUrl),
        "config",
        "--format",
        "json",
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    ),
  );
}

test("生产环境模板要求强密钥和容器内数据库地址", async () => {
  const environment = await readProductionEnvironment();

  assert.ok(Buffer.byteLength(environment.AUTH_JWT_SECRET ?? "", "utf8") >= 32);
  assert.match(environment.AUTH_JWT_SECRET ?? "", /replace|example/i);
  assert.equal(new URL(environment.DATABASE_URL).hostname, "db");
  assert.match(environment.WEB_ORIGIN ?? "", /^https:\/\//);
});

test("生产 Compose 只把 Web 发布到宿主机回环地址", () => {
  const compose = readProductionCompose();
  assert.deepEqual(Object.keys(compose.services).sort(), ["api", "db", "migrate", "web"]);
  assert.equal(compose.services.db.ports, undefined);
  assert.equal(compose.services.api.ports, undefined);
  assert.deepEqual(compose.services.web.ports, [
    {
      host_ip: "127.0.0.1",
      mode: "ingress",
      protocol: "tcp",
      published: "3001",
      target: 3001,
    },
  ]);
});

test("生产服务按数据库、迁移、API、Web 顺序启动", () => {
  const { services } = readProductionCompose();
  assert.equal(services.migrate.depends_on.db.condition, "service_healthy");
  assert.equal(services.api.depends_on.migrate.condition, "service_completed_successfully");
  assert.equal(services.web.depends_on.api.condition, "service_healthy");
  assert.equal(services.migrate.restart, "no");
  assert.equal(services.api.environment.PRODUCT_UPLOAD_ROOT, "/app/uploads");
  assert.equal(services.web.environment.API_SERVER_BASE_URL, "http://api:3000/api/v1");
});

test("生产 Compose 隔离数据卷并启用基础运行时加固", () => {
  const compose = readProductionCompose();
  const apiUpload = compose.services.api.volumes.find(
    (volume) => volume.target === "/app/uploads",
  );

  assert.equal(apiUpload.source, "point-upload-data");
  assert.ok(compose.services.db.volumes.some((volume) => volume.source === "point-postgres-data"));
  assert.deepEqual(compose.services.api.cap_drop, ["ALL"]);
  assert.deepEqual(compose.services.web.cap_drop, ["ALL"]);
  assert.ok(compose.services.api.security_opt.includes("no-new-privileges:true"));
  assert.ok(compose.services.web.security_opt.includes("no-new-privileges:true"));
});
```

- [x] **Step 2: 运行测试确认因生产文件尚不存在而失败**

Run: `node --test scripts/docker-production.test.mjs`

Expected: FAIL，错误包含无法读取 `.env.production.example` 或 `compose.prod.yaml`。

- [x] **Step 3: 创建生产环境模板并允许模板进入 Git**

创建 `.env.production.example`：

```dotenv
POSTGRES_DB=point
POSTGRES_USER=point
POSTGRES_PASSWORD=replace-with-a-long-random-alphanumeric-password
DATABASE_URL=postgresql://point:replace-with-a-long-random-alphanumeric-password@db:5432/point
AUTH_JWT_SECRET=replace-with-at-least-32-random-bytes-before-deployment
WEB_ORIGIN=https://point.example.com

DB_CPU_LIMIT=1.0
DB_MEMORY_LIMIT=1g
MIGRATE_CPU_LIMIT=1.0
MIGRATE_MEMORY_LIMIT=512m
API_CPU_LIMIT=1.0
API_MEMORY_LIMIT=512m
WEB_CPU_LIMIT=1.0
WEB_MEMORY_LIMIT=512m
```

在 `.gitignore` 的环境文件规则后增加：

```gitignore
!.env.production.example
```

- [x] **Step 4: 创建完整生产 Compose 文件**

创建 `compose.prod.yaml`，使用 YAML anchor 复用日志配置；必填变量全部使用 `${VARIABLE:?message}`，资源变量保留规格中的默认值：

```yaml
name: point-quest-prod

x-logging: &default-logging
  driver: json-file
  options:
    max-size: 10m
    max-file: "3"

services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:?POSTGRES_DB is required}
      POSTGRES_USER: ${POSTGRES_USER:?POSTGRES_USER is required}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
    volumes:
      - point-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \"$$POSTGRES_USER\" -d \"$$POSTGRES_DB\""]
      interval: 5s
      timeout: 5s
      retries: 12
      start_period: 10s
    restart: unless-stopped
    cpus: ${DB_CPU_LIMIT:-1.0}
    mem_limit: ${DB_MEMORY_LIMIT:-1g}
    logging: *default-logging

  migrate:
    build:
      context: .
      target: migrate
    environment:
      DATABASE_URL: ${DATABASE_URL:?DATABASE_URL is required}
    depends_on:
      db:
        condition: service_healthy
    init: true
    restart: "no"
    cpus: ${MIGRATE_CPU_LIMIT:-1.0}
    mem_limit: ${MIGRATE_MEMORY_LIMIT:-512m}
    logging: *default-logging

  api:
    build:
      context: .
      target: api
    environment:
      NODE_ENV: production
      PORT: "3000"
      DATABASE_URL: ${DATABASE_URL:?DATABASE_URL is required}
      AUTH_JWT_SECRET: ${AUTH_JWT_SECRET:?AUTH_JWT_SECRET is required}
      WEB_ORIGIN: ${WEB_ORIGIN:?WEB_ORIGIN is required}
      PRODUCT_UPLOAD_ROOT: /app/uploads
    expose:
      - "3000"
    volumes:
      - point-upload-data:/app/uploads
    depends_on:
      migrate:
        condition: service_completed_successfully
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - fetch('http://127.0.0.1:3000/api/v1/health').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 15s
    init: true
    restart: unless-stopped
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    cpus: ${API_CPU_LIMIT:-1.0}
    mem_limit: ${API_MEMORY_LIMIT:-512m}
    logging: *default-logging

  web:
    build:
      context: .
      target: web
    environment:
      NODE_ENV: production
      PORT: "3001"
      HOSTNAME: 0.0.0.0
      API_SERVER_BASE_URL: http://api:3000/api/v1
    ports:
      - 127.0.0.1:3001:3001
    depends_on:
      api:
        condition: service_healthy
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - fetch('http://127.0.0.1:3001/api/v1/health').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 15s
    init: true
    restart: unless-stopped
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    cpus: ${WEB_CPU_LIMIT:-1.0}
    mem_limit: ${WEB_MEMORY_LIMIT:-512m}
    logging: *default-logging

volumes:
  point-postgres-data:
  point-upload-data:
```

- [x] **Step 5: 运行契约测试和 Compose 语义校验**

Run:

```bash
node --test scripts/docker-production.test.mjs
docker compose --env-file .env.production.example -f compose.prod.yaml config --quiet
```

Expected: Node 测试 4/4 PASS；Compose config exit 0，且不连接 Docker daemon。

- [ ] **Step 6: 提交生产编排契约**

```bash
git add .gitignore .env.production.example compose.prod.yaml scripts/docker-production.test.mjs
git commit -m "部署：增加生产 Compose 配置契约"
```

---

### Task 2: 构建精简的迁移、API 与 Web 镜像

**Files:**
- Create: `.dockerignore`
- Create: `Dockerfile`
- Modify: `package.json`
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/next.config.ts`
- Test: Docker Compose 三目标镜像构建
- Test: Next.js standalone 运行产物

**Interfaces:**
- Consumes: Task 1 的 Compose build targets `migrate`、`api`、`web`；Prisma schema `prisma/schema.prisma`；API 构建产物 `apps/api/dist`。
- Produces: 可直接被 Compose 构建的三个命名目标；Web standalone 入口 `/app/apps/web/server.js`；API 入口 `/app/dist/main.js`；迁移入口 `pnpm prisma migrate deploy`。

- [ ] **Step 1: 先执行真实构建断言并确认生产产物缺失**

分别运行：

```bash
docker compose --env-file .env.production.example -f compose.prod.yaml build migrate api web
pnpm build
test -f apps/web/.next/standalone/apps/web/server.js
```

Expected: Docker 构建因根目录没有 `Dockerfile` 而失败；现有 `pnpm build` 成功，但 standalone 文件断言失败。两个失败分别证明三目标镜像和 standalone 产物当前确实缺失。

- [ ] **Step 2: 修正生产依赖边界并刷新锁文件**

对清单作以下精确调整：

- 将根 `package.json` 的 `prisma: 7.9.1` 从 `devDependencies` 移到 `dependencies`，供迁移镜像执行生产迁移。
- 在 `apps/api/package.json` 的 `dependencies` 增加 `@prisma/adapter-pg: 7.9.1`、`@prisma/client: 7.9.1`、`pg: 8.22.0`。
- 在 `apps/api/package.json` 的 `devDependencies` 增加 `@types/pg: 8.20.0`。
- 根包继续保留相同 Prisma Client、adapter 和 pg 依赖，供根目录 seed 脚本使用。

Run: `pnpm install --lockfile-only --offline`

Expected: exit 0；`pnpm-lock.yaml` 的根 importer 把 `prisma` 归入 dependencies，API importer 出现上述四项声明，没有升级任何版本。

- [ ] **Step 3: 启用 Next.js standalone Monorepo 追踪**

把 `apps/web/next.config.ts` 调整为：

```ts
import path from "node:path";
import type { NextConfig } from "next";

const repositoryRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: repositoryRoot,
  turbopack: {
    root: repositoryRoot,
  },
};

export default nextConfig;
```

- [ ] **Step 4: 创建 Docker 构建上下文排除规则**

创建 `.dockerignore`：

```dockerignore
.git
.github
.superpowers
.planning
.env
.env.*
**/node_modules
**/.next
**/dist
.pnpm-store
coverage
test-results
playwright-report
blob-report
uploads
design-system
apps/api/test
apps/web/tests
playwright
**/*.spec.ts
**/*.test.mjs
*.tsbuildinfo
```

- [ ] **Step 5: 创建多阶段 Dockerfile**

创建根目录 `Dockerfile`。API deploy 阶段必须在 `pnpm deploy` 后显式把生成的 `.prisma` 目录复制到部署依赖树；最终 API 镜像只选择 `package.json`、`node_modules`、`dist` 和上传目录，不复制 deploy 目录中的源码或测试：

```dockerfile
# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.14.0

FROM node:${NODE_VERSION}-bookworm-slim AS pnpm-base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable \
  && corepack prepare pnpm@10.28.2 --activate \
  && pnpm config set store-dir /pnpm/store
WORKDIR /app

FROM pnpm-base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ui/package.json packages/ui/package.json

FROM manifests AS dependencies
RUN --mount=type=cache,id=point-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN pnpm db:generate
RUN pnpm build
RUN pnpm --filter @point-quest/api deploy --legacy --prod /opt/api \
  && source_prisma_root="$(dirname "$(dirname "$(readlink -f node_modules/@prisma/client)")")/.prisma" \
  && target_prisma_root="$(dirname "$(dirname "$(readlink -f /opt/api/node_modules/@prisma/client)")")/.prisma" \
  && mkdir -p "$target_prisma_root" \
  && cp -R "$source_prisma_root/." "$target_prisma_root/"

FROM manifests AS migrate-dependencies
RUN --mount=type=cache,id=point-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod --filter point-quest

FROM pnpm-base AS migrate
ENV NODE_ENV=production
COPY --from=migrate-dependencies /app/package.json ./package.json
COPY --from=migrate-dependencies /app/node_modules ./node_modules
COPY prisma.config.ts ./prisma.config.ts
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations
USER node
CMD ["pnpm", "prisma", "migrate", "deploy"]

FROM node:${NODE_VERSION}-bookworm-slim AS api
ENV NODE_ENV=production
ENV PORT=3000
ENV PRODUCT_UPLOAD_ROOT=/app/uploads
WORKDIR /app
COPY --from=build --chown=node:node /opt/api/package.json ./package.json
COPY --from=build --chown=node:node /opt/api/node_modules ./node_modules
COPY --from=build --chown=node:node /opt/api/dist ./dist
RUN mkdir -p /app/uploads/products \
  && chown -R node:node /app/uploads \
  && chmod 0700 /app/uploads /app/uploads/products
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM node:${NODE_VERSION}-bookworm-slim AS web
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
WORKDIR /app/apps/web
EXPOSE 3001
CMD ["node", "server.js"]
```

- [ ] **Step 6: 运行 Compose 契约测试和本地生产构建**

Run:

```bash
node --test scripts/docker-production.test.mjs
pnpm --filter @point-quest/api typecheck
pnpm --filter @point-quest/web typecheck
pnpm build
test -f apps/web/.next/standalone/apps/web/server.js
```

Expected: Docker Compose 契约测试 4/4 PASS；API/Web 类型检查通过；Next 输出存在 `apps/web/.next/standalone/apps/web/server.js`；全仓构建 exit 0。

- [ ] **Step 7: 构建三个 Docker 目标并验证镜像不使用 root**

Run:

```bash
docker compose --env-file .env.production.example -f compose.prod.yaml build migrate api web
docker image inspect point-quest-prod-api --format '{{.Config.User}}'
docker image inspect point-quest-prod-web --format '{{.Config.User}}'
```

Expected: 三个目标构建 exit 0；API 和 Web 镜像用户均为 `node`。如果 Compose 生成的镜像名包含本机 Compose 版本的规范化差异，先用 `docker compose ... images` 取得实际镜像名再执行只读 inspect。

- [ ] **Step 8: 提交镜像构建实现**

```bash
git add .dockerignore Dockerfile package.json apps/api/package.json pnpm-lock.yaml apps/web/next.config.ts
git commit -m "部署：构建生产 API Web 与迁移镜像"
```

---

### Task 3: 编写生产部署和运维文档

**Files:**
- Create: `docs/deployment/docker.md`
- Modify: `README.md`
- Test: 文档中的 Compose 配置、部署启动和健康检查命令

**Interfaces:**
- Consumes: Task 1 的 `.env.production.example`、`compose.prod.yaml` 和固定回环端口；Task 2 的镜像 targets。
- Produces: 运维人员可复制执行的首次部署、更新、网关、备份、恢复、轮换和排障说明；README 的稳定入口。

- [ ] **Step 1: 编写 Docker 部署文档**

创建 `docs/deployment/docker.md`，按以下顺序给出明确内容和命令：

1. 前置条件：Linux、Docker Engine 29 或兼容版本、Docker Compose、现有 HTTPS 网关、开放的回环端口 3001。
2. 首次部署：

```bash
cp .env.production.example .env.production
chmod 600 .env.production
docker compose --env-file .env.production -f compose.prod.yaml config --quiet
docker compose --env-file .env.production -f compose.prod.yaml up -d --build
docker compose --env-file .env.production -f compose.prod.yaml ps
curl --fail --show-error http://127.0.0.1:3001/api/v1/health
```

3. 网关示例：把全部路径转发到 `http://127.0.0.1:3001`，保留 `Host`、`X-Forwarded-For`、`X-Forwarded-Proto`；健康探测使用 `/api/v1/health`。明确 API、数据库和 Swagger 没有宿主机端口。
4. 更新部署：先做备份，再拉取已审核版本，重新执行 `up -d --build`；迁移失败时 API 不会启动。
5. 日志和状态：

```bash
docker compose --env-file .env.production -f compose.prod.yaml ps
docker compose --env-file .env.production -f compose.prod.yaml logs --tail=200 migrate api web db
docker compose --env-file .env.production -f compose.prod.yaml exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

6. PostgreSQL 备份与恢复：备份使用容器内变量，不在宿主机命令行重复真实密码；恢复前停止 Web 与 API，恢复后重新运行迁移并启动服务。

```bash
mkdir -p backups
docker compose --env-file .env.production -f compose.prod.yaml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/point.dump
docker compose --env-file .env.production -f compose.prod.yaml stop web api
docker compose --env-file .env.production -f compose.prod.yaml exec -T db sh -c 'pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backups/point.dump
docker compose --env-file .env.production -f compose.prod.yaml run --rm migrate
docker compose --env-file .env.production -f compose.prod.yaml up -d api web
```

7. 上传卷备份与恢复，默认项目名对应卷名 `point-quest-prod_point-upload-data`：

```bash
docker run --rm -v point-quest-prod_point-upload-data:/source:ro -v "$PWD/backups":/backup alpine:3.23 tar -czf /backup/point-uploads.tar.gz -C /source .
docker compose --env-file .env.production -f compose.prod.yaml stop api
docker run --rm -v point-quest-prod_point-upload-data:/target -v "$PWD/backups":/backup:ro alpine:3.23 sh -c 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar -xzf /backup/point-uploads.tar.gz -C /target'
docker compose --env-file .env.production -f compose.prod.yaml up -d api web
```

文档必须醒目标注恢复会覆盖目标卷，执行前必须确认项目名、卷名和备份文件。

8. 密钥轮换：修改 `.env.production` 后强制重建 API；说明 JWT 密钥轮换会使现有登录令牌失效。
9. 排障：分别覆盖变量缺失、数据库不健康、迁移非零退出、API unhealthy、Web 返回 `UPSTREAM_UNAVAILABLE`、3001 被占用和上传卷权限异常。
10. 停止服务：普通停止不删除卷；删除卷命令仅用于明确废弃环境，并用警告说明不可恢复。

- [ ] **Step 2: 在根 README 增加生产部署入口**

在本地启动说明之后新增“生产 Docker 部署”小节，明确只有 `127.0.0.1:3001` 发布到宿主机、需要现有 HTTPS 网关，并链接 `docs/deployment/docker.md`；不要把完整运维命令复制到 README。

- [ ] **Step 3: 验证文档引用的真实配置并检查 Markdown 差异**

Run:

```bash
docker compose --env-file .env.production.example -f compose.prod.yaml config --quiet
node --test scripts/docker-production.test.mjs
git diff --check
```

Expected: Compose 配置有效；Docker Compose 契约测试 4/4 PASS；无行尾空白或冲突标记。备份、恢复和网关命令的运行效果在 Task 4 的隔离栈中验证，不为人类文档增加源码文本匹配测试。

- [ ] **Step 4: 提交部署文档**

```bash
git add README.md docs/deployment/docker.md
git commit -m "文档：补充 Docker 生产部署与备份指南"
```

---

### Task 4: 真实启动、持久化与全仓回归验证

**Files:**
- Modify if verification exposes a defect: `Dockerfile`, `compose.prod.yaml`, `.dockerignore`, `.env.production.example`, `apps/web/next.config.ts`, `scripts/docker-production.test.mjs`, `docs/deployment/docker.md`, `README.md`
- Test: `scripts/docker-production.test.mjs`
- Test: Docker Compose 隔离生产栈
- Test: `scripts/verify.sh`

**Interfaces:**
- Consumes: 前三个任务的全部生产部署文件和现有 `pnpm verify` 门禁。
- Produces: 镜像构建、启动依赖、Web→API 代理、非公开端口、数据库迁移和命名卷持久化的运行证据。

- [ ] **Step 1: 执行静态契约、Compose 展开和镜像构建**

Run:

```bash
node --test scripts/docker-production.test.mjs
docker compose --env-file .env.production.example -f compose.prod.yaml config --quiet
docker compose --env-file .env.production.example -f compose.prod.yaml build migrate api web
```

Expected: 4/4 PASS；Compose config exit 0；三个镜像目标构建成功。

- [ ] **Step 2: 确认宿主机 3001 未被无关进程占用**

Run: `lsof -nP -iTCP:3001 -sTCP:LISTEN`

Expected: 无输出。如果端口已被无关服务占用，停止并向用户报告，不得终止或覆盖无关服务；可以继续完成不需要端口的验证，但不能声称完整烟测通过。

- [ ] **Step 3: 启动隔离的生产烟测栈**

Run:

```bash
docker compose --project-name point-quest-prod-smoke --env-file .env.production.example -f compose.prod.yaml up -d
docker compose --project-name point-quest-prod-smoke --env-file .env.production.example -f compose.prod.yaml ps --all
```

Expected: `db`、`api`、`web` 为 healthy；`migrate` 为 exited (0)。如果健康检查仍在启动期，每 5 秒读取一次 `docker compose ... ps --all`，最多等待 60 秒，不在等待循环中执行 SQL。

- [ ] **Step 4: 验证 Web 页面和完整 API 代理链路**

Run:

```bash
curl --fail --show-error --max-time 10 http://127.0.0.1:3001/
curl --fail --show-error --max-time 10 http://127.0.0.1:3001/api/v1/health
```

Expected: 首页返回成功响应；健康响应 JSON 同时包含 `"status":"ok"` 与 `"service":"point-quest-api"`。

- [ ] **Step 5: 验证 API 与 PostgreSQL 没有宿主机发布端口**

Run:

```bash
docker compose --project-name point-quest-prod-smoke --env-file .env.production.example -f compose.prod.yaml ps --format json
docker compose --project-name point-quest-prod-smoke --env-file .env.production.example -f compose.prod.yaml port web 3001
```

Expected: JSON 中只有 Web 包含 publisher，结果为 `127.0.0.1:3001`；API 和 db 没有 publisher。

- [ ] **Step 6: 验证迁移与两个命名卷在重建后持久化**

先执行一次集合查询取得迁移数，再在隔离上传卷写入无业务含义的标记文件：

```bash
docker compose --project-name point-quest-prod-smoke --env-file .env.production.example -f compose.prod.yaml exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL;"'
docker compose --project-name point-quest-prod-smoke --env-file .env.production.example -f compose.prod.yaml exec -T api node -e "require('node:fs').writeFileSync('/app/uploads/.persistence-check','ok')"
docker compose --project-name point-quest-prod-smoke --env-file .env.production.example -f compose.prod.yaml up -d --force-recreate db api web
docker compose --project-name point-quest-prod-smoke --env-file .env.production.example -f compose.prod.yaml exec -T api node -e "process.exit(require('node:fs').readFileSync('/app/uploads/.persistence-check','utf8') === 'ok' ? 0 : 1)"
docker compose --project-name point-quest-prod-smoke --env-file .env.production.example -f compose.prod.yaml exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL;"'
```

Expected: 重建前后迁移数都为 4；上传标记读取 exit 0。SQL 只作为两个独立命令各执行一次，不放入循环。

- [ ] **Step 7: 清理仅用于烟测的隔离容器和卷**

在确认项目名精确为 `point-quest-prod-smoke` 后运行：

```bash
docker compose --project-name point-quest-prod-smoke --env-file .env.production.example -f compose.prod.yaml down --volumes --remove-orphans
```

Expected: 只删除 `point-quest-prod-smoke` 的容器、网络和两个命名卷；不影响开发 `point-quest` 项目和任何其他 Docker 资源。

- [ ] **Step 8: 运行现有完整交付门禁**

Run:

```bash
docker compose up -d db-test
pnpm verify
```

Expected: OpenAPI/客户端生成零差异，lint、类型检查、单元测试、API 数据库 E2E、Playwright E2E 和生产构建全部通过。

- [ ] **Step 9: 对照规格逐项复核并提交验证中产生的修复**

逐项核对设计规格的 7 条验收标准，运行：

```bash
git diff --check
git status --short
```

如果验证阶段修改了实现，重新运行受影响的最小测试和 Task 4 Step 1–8，再提交：

```bash
git add Dockerfile compose.prod.yaml .dockerignore .env.production.example apps/web/next.config.ts scripts/docker-production.test.mjs docs/deployment/docker.md README.md package.json apps/api/package.json pnpm-lock.yaml
git commit -m "修复：完善 Docker 生产部署验证"
```

Expected: 所有规格项都有对应的新鲜证据；工作区只保留任务开始前已经存在的未跟踪规划与设计系统文件。

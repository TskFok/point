# Docker Compose 预构建镜像部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将生产部署改为使用预构建镜像的标准 `docker-compose.yml` + `.env`，使服务器可用 `docker compose up -d` 启动，且不包含镜像仓库发布流程。

**Architecture:** 保留 Dockerfile 三 target（migrate/api/web）；生产编排改为 `image: ${IMAGE_REGISTRY}/point-quest-*:${IMAGE_TAG}`；开发 Postgres 迁到 `compose.dev.yaml`；生产环境模板为 `.env.docker.example`（服务器复制为 `.env`）。删除 `compose.prod.yaml`、`compose.yaml`、`.env.production.example`。

**Tech Stack:** Docker Compose、现有 Node 24 Dockerfile、dotenv、`node --test`。

## Global Constraints

- 不新增镜像 push/release 脚本，文档不写阿里云登录/推送教程。
- 不合并为单应用镜像；不改业务代码与公网入口（网关 → `127.0.0.1:3001`）。
- 密钥不进 `docker-compose.yml`；真实 `.env` 不进 Git。
- 本地开发继续用根目录 `.env.example`（`pnpm`）；生产 Compose 用 `.env.docker.example`。
- 必填变量使用 `${VAR:?message}`；Web 仅绑定 `127.0.0.1:3001`。
- 添加/修改功能须带单元测试；相关测试必须通过。

## File Map

| 文件 | 职责 |
|------|------|
| `scripts/docker-production.test.mjs` | 生产 Compose / env 契约测试 |
| `.env.docker.example` | 生产 Compose 环境模板 |
| `docker-compose.yml` | 生产编排（image，无 build） |
| `compose.dev.yaml` | 本地 db / db-test |
| `.gitignore` | 允许提交 `.env.docker.example` |
| `docs/deployment/docker.md` | 生产运维文档 |
| `README.md` | 本地与生产入口说明 |
| 删除：`compose.prod.yaml`、`compose.yaml`、`.env.production.example` | 避免双入口 |

---

### Task 1: 更新契约测试（RED）

**Files:**
- Modify: `scripts/docker-production.test.mjs`
- Test: `scripts/docker-production.test.mjs`

**Interfaces:**
- Consumes: 尚不存在的 `.env.docker.example`、`docker-compose.yml`
- Produces: 失败的契约测试，锁定新文件路径与「无 build / 有 image」断言

- [ ] **Step 1: 重写契约测试指向新文件并增加 image 断言**

将 `scripts/docker-production.test.mjs` 全文替换为：

```js
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parse } from "dotenv";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const productionEnvUrl = new URL("../.env.docker.example", import.meta.url);
const productionComposeUrl = new URL("../docker-compose.yml", import.meta.url);

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

test("生产环境模板要求镜像坐标、强密钥和容器内数据库地址", async () => {
  const environment = await readProductionEnvironment();

  assert.ok(environment.IMAGE_REGISTRY);
  assert.doesNotMatch(environment.IMAGE_REGISTRY, /\/$/);
  assert.ok(environment.IMAGE_TAG);
  assert.ok(Buffer.byteLength(environment.AUTH_JWT_SECRET ?? "", "utf8") >= 32);
  assert.match(environment.AUTH_JWT_SECRET ?? "", /replace|example/i);
  assert.equal(new URL(environment.DATABASE_URL).hostname, "db");
  assert.match(environment.WEB_ORIGIN ?? "", /^https:\/\//);
});

test("生产 Compose 只把 Web 发布到宿主机回环地址", () => {
  const compose = readProductionCompose();
  assert.deepEqual(Object.keys(compose.services).sort(), [
    "api",
    "db",
    "migrate",
    "web",
  ]);
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
  assert.equal(
    services.api.depends_on.migrate.condition,
    "service_completed_successfully",
  );
  assert.equal(services.web.depends_on.api.condition, "service_healthy");
  assert.equal(services.migrate.restart, "no");
  assert.equal(services.api.environment.PRODUCT_UPLOAD_ROOT, "/app/uploads");
  assert.equal(
    services.web.environment.API_SERVER_BASE_URL,
    "http://api:3000/api/v1",
  );
});

test("生产 Compose 隔离数据卷并启用基础运行时加固", () => {
  const compose = readProductionCompose();
  const apiUpload = compose.services.api.volumes.find(
    (volume) => volume.target === "/app/uploads",
  );

  assert.equal(apiUpload.source, "point-upload-data");
  assert.ok(
    compose.services.db.volumes.some(
      (volume) => volume.source === "point-postgres-data",
    ),
  );
  assert.deepEqual(compose.services.api.cap_drop, ["ALL"]);
  assert.deepEqual(compose.services.web.cap_drop, ["ALL"]);
  assert.ok(
    compose.services.api.security_opt.includes("no-new-privileges:true"),
  );
  assert.ok(
    compose.services.web.security_opt.includes("no-new-privileges:true"),
  );
});

test("生产应用服务使用预构建镜像且不包含 build", async () => {
  const environment = await readProductionEnvironment();
  const compose = readProductionCompose();

  for (const name of ["migrate", "api", "web"]) {
    assert.equal(compose.services[name].build, undefined);
    assert.equal(
      compose.services[name].image,
      `${environment.IMAGE_REGISTRY}/point-quest-${name}:${environment.IMAGE_TAG}`,
    );
  }
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `node --test scripts/docker-production.test.mjs`

Expected: FAIL（无法读取 `.env.docker.example` 或 `docker-compose.yml`，或 Compose config 失败）。

- [ ] **Step 3: Commit**

```bash
git add scripts/docker-production.test.mjs
git commit -m "$(cat <<'EOF'
test: 锁定预构建镜像 Compose 契约

EOF
)"
```

---

### Task 2: 添加生产 env 模板与 docker-compose.yml（GREEN 部分）

**Files:**
- Create: `.env.docker.example`
- Create: `docker-compose.yml`
- Modify: `.gitignore`
- Delete: `.env.production.example`
- Delete: `compose.prod.yaml`
- Test: `scripts/docker-production.test.mjs`

**Interfaces:**
- Consumes: Task 1 测试期望的文件名与镜像命名
- Produces: 可 `docker compose config` 展开的生产编排

- [ ] **Step 1: 创建 `.env.docker.example`**

```bash
IMAGE_REGISTRY=registry.cn-hangzhou.aliyuncs.com/your-namespace
IMAGE_TAG=v0.0.0

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

- [ ] **Step 2: 创建 `docker-compose.yml`**

由原 `compose.prod.yaml` 改造：去掉三服务的 `build:`，改为 `image:`。完整内容：

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
      test:
        [
          "CMD-SHELL",
          'pg_isready -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"',
        ]
      interval: 5s
      timeout: 5s
      retries: 12
      start_period: 10s
    restart: unless-stopped
    cpus: ${DB_CPU_LIMIT:-1.0}
    mem_limit: ${DB_MEMORY_LIMIT:-1g}
    logging: *default-logging

  migrate:
    image: ${IMAGE_REGISTRY:?IMAGE_REGISTRY is required}/point-quest-migrate:${IMAGE_TAG:?IMAGE_TAG is required}
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
    image: ${IMAGE_REGISTRY:?IMAGE_REGISTRY is required}/point-quest-api:${IMAGE_TAG:?IMAGE_TAG is required}
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
    image: ${IMAGE_REGISTRY:?IMAGE_REGISTRY is required}/point-quest-web:${IMAGE_TAG:?IMAGE_TAG is required}
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

- [ ] **Step 3: 更新 `.gitignore`**

将：

```gitignore
!.env.example
!.env.production.example
```

改为：

```gitignore
!.env.example
!.env.docker.example
```

- [ ] **Step 4: 删除旧生产文件**

```bash
rm compose.prod.yaml .env.production.example
```

- [ ] **Step 5: 运行契约测试与 compose config**

Run:

```bash
node --test scripts/docker-production.test.mjs
docker compose --env-file .env.docker.example -f docker-compose.yml config --quiet
```

Expected: 测试 5/5 PASS；`config --quiet` exit 0。

- [ ] **Step 6: Commit**

```bash
git add .env.docker.example docker-compose.yml .gitignore scripts/docker-production.test.mjs
git rm compose.prod.yaml .env.production.example
git commit -m "$(cat <<'EOF'
deploy: 改用预构建镜像的 docker-compose.yml

EOF
)"
```

---

### Task 3: 开发 Compose 迁移与文档

**Files:**
- Create: `compose.dev.yaml`（内容来自原 `compose.yaml`）
- Delete: `compose.yaml`
- Modify: `docs/deployment/docker.md`
- Modify: `README.md`
- Test: `scripts/docker-production.test.mjs`（回归）

**Interfaces:**
- Consumes: Task 2 的生产入口与 `.env.docker.example`
- Produces: 本地 `docker compose -f compose.dev.yaml` 流程与更新后的部署文档

- [ ] **Step 1: 迁入 `compose.dev.yaml` 并删除 `compose.yaml`**

`compose.dev.yaml` 内容与当前 `compose.yaml` 相同：

```yaml
name: point-quest

services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: point
      POSTGRES_PASSWORD: point
      POSTGRES_USER: point
    ports:
      - '5432:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U point -d point']
      interval: 2s
      timeout: 5s
      retries: 10
    volumes:
      - point-postgres-data:/var/lib/postgresql/data

  db-test:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: point_test
      POSTGRES_PASSWORD: point
      POSTGRES_USER: point
    ports:
      - '5433:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U point -d point_test']
      interval: 2s
      timeout: 5s
      retries: 10
    tmpfs:
      - /var/lib/postgresql/data

volumes:
  point-postgres-data:
```

然后：`rm compose.yaml`

- [ ] **Step 2: 重写 `docs/deployment/docker.md` 关键流程段落**

将「首次部署」改为：

```markdown
## 首次部署

前置：应用镜像 `point-quest-migrate` / `point-quest-api` / `point-quest-web` 已按约定 tag 存在于可拉取的仓库（或本机）。本仓库不包含镜像构建推送流程。

复制环境模板并限制权限：

```bash
cp .env.docker.example .env
chmod 600 .env
```

编辑 `.env`，至少替换：

- `IMAGE_REGISTRY`：镜像仓库前缀，无尾斜杠，例如 `registry.cn-hangzhou.aliyuncs.com/<your-namespace>`
- `IMAGE_TAG`：版本 tag
- `POSTGRES_PASSWORD`、`DATABASE_URL`、`AUTH_JWT_SECRET`、`WEB_ORIGIN`（规则同前）

验证并启动：

```bash
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps --all
curl --fail --show-error http://127.0.0.1:3001/api/v1/health
```

若镜像已在本机，可跳过 `pull`。
```

将文档中所有：

- `docker compose --env-file .env.production -f compose.prod.yaml` → `docker compose`
- `.env.production` / `.env.production.example` → `.env` / `.env.docker.example`
- 去掉常规流程中的 `--build`
- 明确不写镜像仓库发布教程

网关、备份、恢复、排障章节保留语义，仅替换上述命令前缀。

- [ ] **Step 3: 更新 `README.md`**

「从空数据库启动」中：

- `docker compose up -d db` → `docker compose -f compose.dev.yaml up -d db`

「生产 Docker 部署」改为：

```markdown
## 生产 Docker 部署

生产使用根目录 `docker-compose.yml`：在已有 HTTPS 网关的服务器上运行 PostgreSQL、迁移、API 与 Web。编排只把 Web 发布到 `127.0.0.1:3001`；应用服务使用预构建镜像（`IMAGE_REGISTRY` / `IMAGE_TAG`），不再在服务器上 `build`。

```bash
cp .env.docker.example .env
# 编辑镜像坐标与密钥后：
docker compose pull
docker compose up -d
```

完整步骤见 [Docker 单机生产部署指南](docs/deployment/docker.md)。
```

测试库段落中所有 `docker compose up -d db-test` → `docker compose -f compose.dev.yaml up -d db-test`。

- [ ] **Step 4: 回归测试与开发 compose config**

Run:

```bash
node --test scripts/docker-production.test.mjs
docker compose -f compose.dev.yaml config --quiet
```

Expected: 生产契约 5/5 PASS；dev compose config exit 0。

- [ ] **Step 5: Commit**

```bash
git add compose.dev.yaml docs/deployment/docker.md README.md
git rm compose.yaml
git commit -m "$(cat <<'EOF'
docs: 简化 Docker 启动并分离开发 Compose

EOF
)"
```

---

## Spec Coverage Checklist

| Spec 要求 | Task |
|-----------|------|
| 三镜像 `image:`，无 `build:` | Task 2 |
| `IMAGE_REGISTRY` 占位 + `IMAGE_TAG` | Task 2 |
| 标准 `docker-compose.yml` + `.env` | Task 2–3 |
| 开发迁到 `compose.dev.yaml`，删除旧 compose | Task 3 |
| 删除 `compose.prod.yaml` / `.env.production.example` | Task 2 |
| 不含发布到镜像仓库流程 | Task 3 文档 |
| 安全边界与启动顺序不变 | Task 1–2 测试 |
| 契约测试更新 | Task 1–2 |

## Self-Review Notes

- 已修正 spec：生产模板为 `.env.docker.example`，避免覆盖本地 `.env.example`。
- 无 TBD/TODO；测试含完整源码；镜像命名与 Dockerfile target 一致（`migrate`/`api`/`web`）。

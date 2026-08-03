# Docker Compose 预构建镜像部署设计

**日期：** 2026-08-03  
**状态：** 已确认  
**相关：** 演进自 `2026-08-02-docker-production-deployment-design.md`；简化生产启动流程。

## 目标

把生产部署从「`--env-file` + `-f compose.prod.yaml` + `up --build`」简化为：

1. 应用镜像已预先构建并打 tag（可由运维自行 push/pull 到任意仓库，**本仓库不规定发布流程**）。
2. 服务器使用标准 `docker-compose.yml` + 同目录 `.env`（由生产模板复制而来）。
3. 日常启动命令为 `docker compose up -d`（需要更新镜像时再 `docker compose pull`）。

> **设计修正：** 仓库已有面向本地 `pnpm` 开发的 `.env.example`，不可被生产模板覆盖。生产 Compose 模板使用 `.env.docker.example`；服务器执行 `cp .env.docker.example .env`。

## 非目标

- 不提供推送到阿里云或其他镜像仓库的脚本/文档流程。
- 不合并 migrate / api / web 为单一应用镜像。
- 不把密钥写入 `docker-compose.yml`。
- 不改变业务代码、公网入口模型（网关 → `127.0.0.1:3001`）或数据库 schema。

## 架构

保留现有多阶段 `Dockerfile` 的三个 target，对应三个应用镜像：

| Compose 服务 | 镜像引用 | 说明 |
|--------------|----------|------|
| `db` | `postgres:17-alpine` | 官方镜像，不发布宿主机端口 |
| `migrate` | `${IMAGE_REGISTRY}/point-quest-migrate:${IMAGE_TAG}` | 一次性 `prisma migrate deploy`，`restart: "no"` |
| `api` | `${IMAGE_REGISTRY}/point-quest-api:${IMAGE_TAG}` | NestJS，内部 `3000`，上传卷 |
| `web` | `${IMAGE_REGISTRY}/point-quest-web:${IMAGE_TAG}` | Next.js，仅 `127.0.0.1:3001:3001` |

启动顺序：`db` healthy → `migrate` completed successfully → `api` healthy → `web`。

`IMAGE_REGISTRY` 使用占位说明（例如 `registry.cn-hangzhou.aliyuncs.com/<your-namespace>`），由部署方在 `.env` 中填写真实前缀；本设计不绑定具体云厂商登录或 push 步骤。

公网 `/api/v1` 仍经 Web 同源代理到 Compose 内部 `http://api:3000/api/v1`，API 与 PostgreSQL 不直接暴露到宿主机。

## 文件布局

| 路径 | 变更 |
|------|------|
| `docker-compose.yml` | 新建：由 `compose.prod.yaml` 演进；`migrate`/`api`/`web` 使用 `image:`，移除 `build:` |
| `compose.prod.yaml` | 删除，避免双份生产编排 |
| `compose.dev.yaml` | 由现有 `compose.yaml` 内容迁入（开发/测试 Postgres） |
| `compose.yaml` | 删除，避免与默认 `docker-compose.yml` 在无 `-f` 时被一并加载 |
| `.env.example` | 保留：本地 Node/pnpm 开发模板，不改用途 |
| `.env.docker.example` | 新建：生产 Compose 模板（镜像变量 + 必填密钥；吸收原 `.env.production.example`） |
| `.env.production.example` | 删除；`.gitignore` 中对应 `!` 例外改为 `!.env.docker.example` |
| `.env` | 服务器真实配置（由 `.env.docker.example` 复制）；已在 gitignore；建议 `chmod 600` |
| `Dockerfile` | 保留三 target；无发布脚本依赖 |
| `scripts/docker-production.test.mjs` | 改为断言 `docker-compose.yml` + `.env.example` |
| `docs/deployment/docker.md` | 按新流程重写启动/更新/备份命令；同步 README 中相关引用 |

不新增 `scripts/docker-release.sh` 或等价 push 脚本。

## 配置约定

`.env` / `.env.docker.example` 至少包含：

- `IMAGE_REGISTRY`：镜像仓库前缀占位，无尾斜杠
- `IMAGE_TAG`：版本 tag（如 `v1.0.0`）
- `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD`
- `DATABASE_URL`：主机固定为 `db`，凭据与 Postgres 变量一致
- `AUTH_JWT_SECRET`：至少 32 字节；模板值须可识别为占位
- `WEB_ORIGIN`：公网 HTTPS Origin，无路径、无尾斜杠

可选资源限制变量（`DB_CPU_LIMIT` 等）保留默认值，可写在 compose 或 `.env`。

`docker-compose.yml` 中：

- 镜像：`${IMAGE_REGISTRY}/point-quest-api:${IMAGE_TAG}`（migrate/web 同理）
- 必填业务变量继续用 `${VAR:?message}`，避免空配置静默启动
- 非敏感内部默认值（如 `API_SERVER_BASE_URL=http://api:3000/api/v1`、`PRODUCT_UPLOAD_ROOT=/app/uploads`）可直接写在 compose
- 保留日志轮转、`cap_drop`、`security_opt`、healthcheck、命名卷

Compose 自动读取项目目录 `.env`，生产命令不再要求 `--env-file`。

## 运维流程

**服务器首次/日常启动：**

```bash
cp .env.docker.example .env
chmod 600 .env
# 编辑 IMAGE_REGISTRY、IMAGE_TAG、密码、JWT、WEB_ORIGIN
docker compose pull    # 若镜像已在本机可跳过
docker compose up -d
docker compose ps --all
curl --fail --show-error http://127.0.0.1:3001/api/v1/health
```

**更新应用版本：** 修改 `.env` 中 `IMAGE_TAG`（及必要时 `IMAGE_REGISTRY`）→ `docker compose pull` → `docker compose up -d`。迁移失败时 `migrate` 非零退出，api/web 不启动。

**开发数据库：** `docker compose -f compose.dev.yaml up -d`。

**备份/恢复/密钥轮换：** 行为与现有生产文档一致，仅命令前缀改为 `docker compose`（无 `-f compose.prod.yaml`、无 `--env-file .env.production`）。

镜像如何构建与推送到仓库，由部署方自行负责；本仓库只保证：给定符合命名约定的已存在镜像时，上述 Compose 可启动整栈。

## 安全边界（不变）

- 仅 Web 发布到 `127.0.0.1:3001`
- 真实 `.env`、数据库密码、JWT 不得进入 Git 或镜像层
- API/Web 非 root、`cap_drop: ALL`、`no-new-privileges`
- 上传目录权限与卷备份警告保持现有文档强度

## 测试

更新 `scripts/docker-production.test.mjs`：

1. `.env.docker.example`：含 `IMAGE_REGISTRY`/`IMAGE_TAG`；强密钥占位、`DATABASE_URL` 主机为 `db`、`WEB_ORIGIN` 为 `https://`
2. Compose 服务集合为 `api`/`db`/`migrate`/`web`；仅 web 有 `127.0.0.1:3001`
3. 启动依赖顺序与内部 `API_SERVER_BASE_URL` / `PRODUCT_UPLOAD_ROOT` 正确
4. `migrate`/`api`/`web` 使用 `image` 而非 `build`；镜像名包含 `IMAGE_REGISTRY` 与 `IMAGE_TAG` 展开结果

契约测试可用 `docker compose --env-file .env.docker.example config` 展开模板；服务器日常仍只需同目录 `.env`，无需手写 `--env-file`。

## 成功标准

- 服务器在镜像已就绪且 `.env` 填妥后，可用 `docker compose up -d` 启动
- 开发库通过 `compose.dev.yaml` 使用，不与生产默认文件冲突
- 现有生产安全与启动顺序契约测试通过
- 文档不再要求 `--build` 作为常规启动步骤，也不包含镜像仓库发布教程

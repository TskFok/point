# Point Quest

Point Quest 是一个面向管理员与学员的英语答题积分商城。管理员可以维护英语单选题、积分倍率、商品库存和兑换订单；学员可以完成随机练习、重练错题、赚取积分并兑换商品。Web 与未来 Android 客户端共享同一套 `/api/v1` REST API 和 OpenAPI 契约。

## 环境要求

- Node.js 24
- pnpm 10.28.2
- Docker 与 Docker Compose
- PostgreSQL 17（由 Compose 提供）

## 从空数据库启动

以下六步会创建本地环境文件、启动开发数据库、安装依赖、执行迁移与演示种子，然后同时启动 API 和 Web：

1. `cp .env.example .env`
2. `docker compose up -d db`
3. `pnpm install`
4. `pnpm db:migrate`
5. `pnpm db:seed`
6. `pnpm dev`

默认端口：

- Web：`http://localhost:3001`
- API：`http://localhost:3000`
- Swagger UI：`http://localhost:3000/api/docs`
- PostgreSQL 开发库：`localhost:5432/point`

`.env` 中的 `PORT` 是 NestJS API 端口，`WEB_ORIGIN` 必须与浏览器实际访问的 Web Origin 完全一致，`API_SERVER_BASE_URL` 必须包含 `/api/v1`。生产部署前必须替换 `AUTH_JWT_SECRET`，并为 `PRODUCT_UPLOAD_ROOT` 使用仅服务账户可写的私有目录。

## 生产 Docker 部署

项目提供独立的 `compose.prod.yaml`，用于在已有 HTTPS 网关的单台服务器上运行 PostgreSQL、数据库迁移、API 和 Web。生产编排只把 Web 发布到 `127.0.0.1:3001`，API 与数据库仅在 Compose 内部网络可见；公网 `/api/v1` 由 Web 同源代理转发。

首次上线、更新、网关配置、备份恢复与排障步骤见 [Docker 单机生产部署指南](docs/deployment/docker.md)。

## 演示账号与种子

`pnpm db:seed` 可重复执行，并创建以下演示账号：

| 角色   | 用户名    | 密码          |
| ------ | --------- | ------------- |
| 管理员 | `admin`   | `Admin123!`   |
| 学员   | `student` | `Student123!` |

种子还包含 10 道英语单选题和 3 件演示商品。管理员从 `/admin` 进入运营台，学员从 `/learn` 进入学习首页。

## 常用命令

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm api:spec
pnpm api:client
```

API 契约位于 `openapi/openapi.json`，TypeScript 客户端位于 `packages/api-client`。修改 API DTO 或路由后必须依次运行 `pnpm api:spec` 和 `pnpm api:client`，并提交生成结果。

## 测试数据库与端到端测试

API 数据库 E2E 和 Playwright 浏览器 E2E 只允许使用 `localhost:5433/point_test`，不会连接或重置开发库：

```bash
docker compose up -d db-test
DATABASE_URL=postgresql://point:point@localhost:5433/point_test pnpm prisma migrate deploy
pnpm test:e2e
```

Playwright 会独立启动 API（`127.0.0.1:3100`）和 Web（`127.0.0.1:3101`），使用单 worker、PostgreSQL advisory lock 和集合清理隔离场景。每个测试文件使用独立确定性用户名和资产，不共享余额。浏览器测试需要先安装 Playwright Chromium：

```bash
pnpm exec playwright install chromium
```

完整交付验证：

```bash
docker compose up -d db-test
pnpm verify
```

`pnpm verify` 会先严格校验数据库目标、部署 `point_test` 迁移并在单个事务中清空业务数据，再生成并检查 OpenAPI/客户端零差异，然后按顺序执行 lint、TypeScript 类型检查、单元测试、API 数据库 E2E、Playwright E2E 和生产构建。测试库中的原有业务数据会被清空，数据库和 schema 不会被删除；脚本失败即停止。

## Android 接入

Android 使用 Bearer Access Token 和可轮换 Refresh Token，不使用 Web Cookie/CSRF 流程。完整说明与 Kotlin OpenAPI 客户端生成入口见 [Android API 集成指南](docs/api/android-integration.md)。

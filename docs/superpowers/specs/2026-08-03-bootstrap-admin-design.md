# API 启动时 Bootstrap 默认管理员设计

**日期：** 2026-08-03  
**状态：** 已确认  

## 目标

在 Docker 生产部署中，通过环境变量提供默认管理员账号；当数据库中**不存在任何** `ADMIN` 用户时，API 启动自动创建该管理员，便于首次登录运营台。

## 非目标

- 不运行完整 `pnpm db:seed`（不创建演示学员、题目、商品）。
- 不修改公开注册接口（注册仍只能创建 `STUDENT`）。
- 不在已有任意管理员时重置或覆盖密码。
- 不把密钥硬编码进业务源码（仅环境变量 / 模板占位）。

## 行为

API 在 Nest 应用就绪之后、`listen` 之前执行一次 bootstrap：

1. 若 `BOOTSTRAP_ADMIN_USERNAME` 与 `BOOTSTRAP_ADMIN_PASSWORD` **未同时设置** → 跳过（本地 `pnpm` 默认不受影响）。
2. 若已设置 → 查询 `User` 中是否存在 `role = ADMIN`。
3. 若已有至少一名管理员 → 跳过，不修改任何用户。
4. 若没有管理员 → 按与注册相同的规则校验用户名/密码：
   - 用户名：`^[a-z0-9_]{3,32}$`（规范化后）
   - 密码：至少 10 位，且同时包含字母与数字
5. 校验通过后创建 `ADMIN`，密码 bcrypt 成本 12。
6. 校验失败、用户名冲突或其他创建错误 → 记录错误并**阻止 API 启动**。

模板默认值：

- `BOOTSTRAP_ADMIN_USERNAME=admin`
- `BOOTSTRAP_ADMIN_PASSWORD=Admin123!x`

## 配置与编排

| 文件 | 变更 |
|------|------|
| `.env.docker.example` | 增加上述两个变量及默认值 |
| `docker-compose.yml` | `api.environment` 传入 `${BOOTSTRAP_ADMIN_USERNAME:?...}` 与 `${BOOTSTRAP_ADMIN_PASSWORD:?...}` |
| `.env.example` | 不增加（本地开发不启用 bootstrap） |
| `docs/deployment/docker.md` | 说明首次部署可使用默认管理员登录，并提醒登录后尽快修改密码 |
| `scripts/docker-production.test.mjs` | 断言 env/compose 包含这两个变量 |

## 代码结构

- 新增 `apps/api/src/auth/bootstrap-admin.ts`（或同等命名）：导出 `bootstrapAdminIfNeeded(prisma)`，封装查询与创建逻辑。
- 从 `main.ts` 或应用初始化路径调用；依赖已有 `PrismaService` / PrismaClient。
- 用户名规范化与校验复用 `auth.service` 中的规则（抽取共享常量/函数，避免漂移）。

## 测试

单元测试覆盖：

1. 未配置环境变量 → 不创建用户。
2. 已存在 ADMIN → 不创建、不改密码。
3. 无 ADMIN 且配置合法 → 创建一名 ADMIN。
4. 密码/用户名非法 → 抛错（启动失败）。

Docker 契约测试覆盖 compose 与 `.env.docker.example` 含 bootstrap 变量。

## 安全说明

- 默认密码仅用于空库首次接入；文档明确要求上线后立即修改密码或轮换环境变量后重建（已有管理员时不会自动改密，需运营自行改密）。
- 真实生产 `.env` 不得提交到 Git。

## 成功标准

- 生产 Compose 填妥 `.env` 后首次启动，可用模板默认管理员登录 `/admin`。
- 再次启动或已有其他管理员时，不会重复创建或覆盖。
- 本地不设置 bootstrap 变量时行为与现网一致。
- 相关单元测试与 Docker 契约测试通过。

# Docker 单机生产部署设计

**日期：** 2026-08-02
**状态：** 已确认，待实施

## 目标

为 Point Quest 增加一套可在单台 Linux 服务器上通过 Docker Compose 部署的生产方案。服务器已经运行独立 HTTPS 网关，因此项目自身不包含 Nginx 或 Caddy，只把 Web 服务绑定到宿主机回环地址 `127.0.0.1:3001`。API、PostgreSQL 和迁移服务只在 Compose 网络内可见。

部署方案必须保留现有本地开发流程，不得把测试数据库或开发端口带入生产编排。生产环境不自动执行演示种子。

## 总体架构

生产编排使用独立的 `compose.prod.yaml`，包含四个服务：

| 服务 | 职责 | 宿主机端口 | 持久化 |
| --- | --- | --- | --- |
| `db` | PostgreSQL 17 生产数据库 | 无 | PostgreSQL 命名卷 |
| `migrate` | 执行 `prisma migrate deploy` 后退出 | 无 | 无 |
| `api` | 运行编译后的 NestJS API | 无 | 商品图片命名卷 |
| `web` | 运行 Next.js standalone 服务和 `/api/v1` 同源代理 | `127.0.0.1:3001` | 无 |

宿主机现有网关把该站点的全部 HTTPS 请求转发到 `127.0.0.1:3001`。浏览器和未来 Android 客户端统一请求公网 `/api/v1`，Next.js 动态代理再把请求转发到 `http://api:3000/api/v1`。API 的 Swagger `/api/docs` 不经 Web 代理，因此默认不向公网开放。

## 镜像构建

根目录新增一个多阶段 `Dockerfile`，统一使用 Node.js 24 和项目锁定的 pnpm 10.28.2：

1. 依赖阶段先复制 workspace 清单和锁文件，以 `--frozen-lockfile` 安装依赖并利用 Docker 缓存。
2. 构建阶段复制源码，生成 Prisma Client，然后依次构建共享包、NestJS API 和 Next.js Web。
3. `migrate` 目标只保留 Prisma CLI、配置和迁移文件，不包含测试代码。
4. `api` 目标只保留生产依赖、生成的 Prisma Client、API 编译产物和运行所需文件。
5. `web` 目标只保留 Next.js standalone 输出、静态资源和 public 资源。

Next.js 配置增加 `output: "standalone"`。API 和 Web 运行镜像使用非 root 用户，不把密钥或环境专属地址写入镜像层。Compose 使用 `init: true` 处理容器 PID 1 的信号和子进程回收。

为了让迁移容器在仅安装生产依赖时仍可运行，根包中的 Prisma CLI 作为生产部署依赖保留；测试、Playwright、TypeScript 和 lint 工具不进入最终运行镜像。

## 配置契约

新增 `.env.production.example` 作为可提交模板。真实 `.env.production` 继续由 `.gitignore` 排除，并在服务器上设置为仅部署账户可读写的 `0600`。

生产编排要求以下变量：

| 变量 | 用途 | 约束 |
| --- | --- | --- |
| `POSTGRES_DB` | PostgreSQL 数据库名 | 非空 |
| `POSTGRES_USER` | PostgreSQL 用户名 | 非空 |
| `POSTGRES_PASSWORD` | PostgreSQL 服务密码 | 使用高强度随机值 |
| `DATABASE_URL` | Prisma 容器内连接串 | 主机必须为 `db`，密码中的 URI 保留字符必须编码 |
| `AUTH_JWT_SECRET` | Access/Refresh Token 签名 | 至少 32 字节的随机值 |
| `WEB_ORIGIN` | API 允许的 Web Origin | 精确的公网 HTTPS Origin，不含路径和结尾斜杠 |

容器内固定配置如下：

- API：`NODE_ENV=production`、`PORT=3000`、`PRODUCT_UPLOAD_ROOT=/app/uploads`。
- Web：`NODE_ENV=production`、`PORT=3001`、`HOSTNAME=0.0.0.0`、`API_SERVER_BASE_URL=http://api:3000/api/v1`。
- Web 的唯一端口映射为 `127.0.0.1:3001:3001`。

Compose 对所有必填变量使用缺失即报错的插值语法，使配置错误在创建容器前暴露。

## 启动和数据流

启动顺序由健康状态和一次性任务控制：

1. `db` 启动并通过 `pg_isready`。
2. `migrate` 在数据库健康后执行 `prisma migrate deploy`，成功后以状态码 0 退出。
3. `api` 只在迁移成功后启动，并通过 `GET /api/v1/health` 报告进程健康。
4. `web` 只在 API 健康后启动，其健康检查通过本机 Web 请求 `/api/v1/health`，同时验证 Next.js 与 API 代理链路。

迁移失败时不会启动 API。迁移服务设置 `restart: "no"`；数据库、API 和 Web 设置 `restart: unless-stopped`。生产部署不运行 `prisma db seed`，避免创建演示账户。

## 持久化与安全边界

- PostgreSQL 数据使用单独命名卷，只挂载给 `db`。
- 商品图片使用单独命名卷，只挂载给 `api` 的 `/app/uploads`。
- API 镜像预创建由应用非 root 用户拥有的上传根目录。首次创建命名卷时继承该目录的安全所有权，应用继续执行现有目录类型、符号链接和硬链接检查。
- `db` 和 `api` 不发布宿主机端口；`web` 只绑定回环地址，不能直接从服务器外部访问明文端口。
- API 和 Web 启用 `no-new-privileges`，移除不需要的 Linux capabilities，并使用可由 Compose 环境覆盖的合理 CPU、内存默认限制。
- 所有服务日志写到标准输出；Docker `json-file` 日志驱动限制单文件大小和保留数量，防止日志无限占用磁盘。
- JWT 密钥、数据库密码和真实连接串不进入 Git、Dockerfile、镜像构建参数或镜像层。

## 故障处理

- 数据库不健康：`migrate` 保持未启动，API 和 Web 不启动。
- 迁移失败：`migrate` 保留非零退出状态，API 不启动；运维人员通过 `docker compose logs migrate` 查看错误，修复后重新执行部署命令。
- API 启动失败：API 健康检查失败，Web 不启动。
- API 在运行期暂时不可用：现有 Next.js 代理返回 HTTP 502 和稳定的 `UPSTREAM_UNAVAILABLE` 错误结构，不泄漏内部容器地址。
- Web 不健康：Docker 标记容器为 unhealthy；宿主机网关应把 `GET /api/v1/health` 作为上游探测地址。
- 数据库升级或恢复：先停止 API 和 Web 写流量，完成备份或恢复，再运行迁移并恢复服务。

## 资源与日志默认值

Compose 为单机小规模部署提供保守默认值，并允许通过生产环境文件覆盖：

| 服务 | CPU 默认上限 | 内存默认上限 |
| --- | ---: | ---: |
| `db` | 1.0 | 1 GiB |
| `migrate` | 1.0 | 512 MiB |
| `api` | 1.0 | 512 MiB |
| `web` | 1.0 | 512 MiB |

覆盖变量分别为 `DB_CPU_LIMIT`、`DB_MEMORY_LIMIT`、`MIGRATE_CPU_LIMIT`、`MIGRATE_MEMORY_LIMIT`、`API_CPU_LIMIT`、`API_MEMORY_LIMIT`、`WEB_CPU_LIMIT` 和 `WEB_MEMORY_LIMIT`；未配置时使用上表默认值。

日志默认单文件最大 10 MiB，保留 3 个文件。资源上限只约束运行容器，不约束镜像构建阶段。

## 文件变更

实施阶段预计创建或修改以下文件：

- 创建 `Dockerfile`：API、Web、迁移的多阶段生产镜像。
- 创建 `.dockerignore`：排除本地依赖、构建产物、测试产物、环境文件和上传数据。
- 创建 `compose.prod.yaml`：生产服务、健康检查、依赖顺序、卷、资源和日志配置。
- 创建 `.env.production.example`：生产变量模板。
- 创建 `docs/deployment/docker.md`：首次部署、更新、网关、日志、备份、恢复和排障说明。
- 修改 `.gitignore`：允许提交 `.env.production.example`，继续忽略真实环境文件。
- 修改 `apps/web/next.config.ts`：启用 standalone 输出。
- 修改 `package.json` 和锁文件：保证生产迁移镜像可以安装 Prisma CLI。
- 修改 `README.md`：增加生产 Docker 部署入口。

现有开发 `compose.yaml` 保持不变，继续只提供开发库和测试库。

## 部署与运维文档

部署文档提供可复制的命令，覆盖：

- 从模板创建并保护 `.env.production`。
- 构建并启动：`docker compose --env-file .env.production -f compose.prod.yaml up -d --build`。
- 查看服务状态、健康状态和日志。
- 更新代码后重建镜像并运行前向迁移。
- 使用 `pg_dump`/`pg_restore` 备份和恢复 PostgreSQL。
- 以只读归档容器备份和恢复上传图片命名卷。
- 配置现有网关把全部站点流量转发到 `127.0.0.1:3001`，并保留 `Host`、`X-Forwarded-For`、`X-Forwarded-Proto` 请求头。
- 轮换 JWT 密钥、处理迁移失败、检查卷和清理旧镜像。

## 验收标准

实施完成后必须取得以下新鲜验证证据：

1. `docker compose --env-file <测试环境文件> -f compose.prod.yaml config` 成功，展开结果只有 Web 发布宿主机端口，地址为 `127.0.0.1`。
2. `migrate`、`api`、`web` 三个目标镜像构建成功。
3. 使用隔离 Compose 项目名启动全套生产服务，`db`、`api`、`web` 均进入 healthy，`migrate` 成功退出。
4. 宿主机请求 Web 首页成功；请求 Web 的 `/api/v1/health` 返回 `point-quest-api` 健康响应。
5. 宿主机无法通过生产 Compose 端口直接访问 API 或 PostgreSQL。
6. 重建服务后 PostgreSQL 命名卷、上传命名卷和迁移状态仍存在。
7. 现有 lint、类型检查、单元测试和生产构建通过。

## 非目标

- 不在 Compose 中部署 Nginx、Caddy 或 TLS 证书。
- 不增加 Kubernetes、Swarm、云托管数据库或对象存储配置。
- 不自动创建演示账户，不自动调度数据库备份。
- 不对公网开放 Swagger、PostgreSQL 或 NestJS 容器端口。

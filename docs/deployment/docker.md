# Docker 单机生产部署

本文档用于把 Point Quest 部署到一台已经运行 HTTPS 网关的 Linux 服务器。项目自身只发布 `127.0.0.1:3001`，由宿主机网关负责域名、TLS 和公网接入；NestJS API 与 PostgreSQL 不发布宿主机端口。

生产使用根目录 `docker-compose.yml`，应用服务通过预构建镜像启动（`IMAGE_REGISTRY` / `IMAGE_TAG`）。本仓库不包含把镜像推送到远程仓库的流程；部署前需确保 `point-quest-migrate`、`point-quest-api`、`point-quest-web` 已按约定 tag 存在于可拉取的仓库或本机。

本地可用根目录 `Makefile` 按平台构建三个应用镜像：

```bash
make help
make build-amd64 IMAGE_REGISTRY=registry.cn-hangzhou.aliyuncs.com/<your-namespace> IMAGE_TAG=v1.0.0
make build-arm64 IMAGE_REGISTRY=... IMAGE_TAG=...
make build   # 当前宿主机平台
```

## 前置条件

- Linux 服务器已安装 Docker Engine 29 或兼容版本，以及 Docker Compose。
- 宿主机的 `127.0.0.1:3001` 没有被其他进程占用。
- 已有 HTTPS 网关能够转发到宿主机回环地址。
- 部署账户可以读取仓库、执行 Docker 命令，并能以 `0600` 权限保存环境文件。
- 服务器应为数据库卷、上传卷和 Docker 镜像预留足够磁盘空间。
- 三个应用镜像已按 `.env` 中的 `IMAGE_REGISTRY` 与 `IMAGE_TAG` 就绪。

生产编排包含 `db`、`migrate`、`api`、`web` 四个服务。启动时先等待 PostgreSQL 健康，再执行一次 `prisma migrate deploy`；只有迁移成功后才会启动 API 和 Web。生产流程不会创建演示账户。

本地开发数据库请使用 `compose.dev.yaml`，不要与生产 `docker-compose.yml` 混用。

## 首次部署

复制环境模板并限制权限：

```bash
cp .env.docker.example .env
chmod 600 .env
```

编辑 `.env`，至少替换以下值：

- `IMAGE_REGISTRY`：镜像仓库前缀，无尾斜杠，例如 `registry.cn-hangzhou.aliyuncs.com/<your-namespace>`。
- `IMAGE_TAG`：版本 tag，例如 `v1.0.0`。
- `POSTGRES_PASSWORD`：使用高强度随机密码。为了避免连接串编码错误，建议只使用足够长的字母和数字组合。
- `DATABASE_URL`：用户名、密码和数据库名必须与 PostgreSQL 变量一致，主机固定为 `db`；密码包含 URI 保留字符时必须进行百分号编码。
- `AUTH_JWT_SECRET`：至少 32 字节的随机值，不得继续使用模板内容。
- `WEB_ORIGIN`：精确的公网 HTTPS Origin，例如 `https://point.example.com`，不能包含路径或结尾斜杠。
- `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD`：空库首次启动时，若库中尚无任何管理员，API 会用这两项创建默认管理员。模板默认值为 `admin` / `Admin123!x`。登录后应尽快修改密码；已有管理员时不会自动创建或覆盖。
- `AI_CONFIG_ENCRYPTION_KEY`：32 字节随机密钥的 base64，用于加密管理端 AI 模型 API Key；不得继续使用模板占位。

先验证配置，再拉取并启动（镜像已在本机时可跳过 `pull`）：

```bash
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps --all
curl --fail --show-error http://127.0.0.1:3001/api/v1/health
```

正常结果如下：

- `db`、`api`、`web` 显示为 `healthy`。
- `migrate` 显示为 `exited (0)`；它是一次性迁移任务，不应常驻运行。
- 健康接口返回 `status: ok` 和 `service: point-quest-api`。
- 只有 Web 显示 `127.0.0.1:3001->3001/tcp`，API 与数据库没有宿主机端口。
- 空库首次启动可用 `.env` 中的 bootstrap 管理员登录 Web `/admin`；登录后请立即修改密码。

## 网关转发

将该域名的全部路径转发到 `http://127.0.0.1:3001`。不要把 `/api/v1` 单独转发到 NestJS：Web 内置的同源代理负责把浏览器和 Android API 请求转发到 Compose 内部的 `api:3000`。

以宿主机 Nginx 为例：

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

网关健康探测使用 `/api/v1/health`，因为该地址同时检查 Web 进程、Web API 代理和内部 API。Swagger 位于内部 API 的 `/api/docs`，默认不对公网开放。

## 查看状态和日志

```bash
docker compose ps --all
docker compose logs --tail=200 migrate api web db
docker compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

持续跟踪 API 与 Web 日志：

```bash
docker compose logs --follow --tail=100 api web
```

Docker 日志默认单文件最多 10 MiB，保留 3 个文件。

## 更新部署

更新前先完成数据库和上传卷备份。将 `.env` 中的 `IMAGE_TAG`（及必要时 `IMAGE_REGISTRY`）改为目标版本后运行：

```bash
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps --all
curl --fail --show-error http://127.0.0.1:3001/api/v1/health
```

Compose 会先运行前向迁移。迁移失败时 `migrate` 以非零状态退出，API 和 Web 不会启动；查看日志、修复数据库或配置问题后再重新执行更新命令。不要通过手工修改 `_prisma_migrations` 表绕过失败迁移。

## PostgreSQL 备份

创建只允许部署账户访问的备份目录，然后从数据库容器导出自包含格式备份：

```bash
mkdir -p backups
chmod 700 backups
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/point.dump
chmod 600 backups/point.dump
```

确认 `pg_dump` 退出成功并把备份复制到服务器之外。Docker 命名卷不等同于备份。

## PostgreSQL 恢复

> 警告：以下恢复命令会清理目标数据库中的现有对象。必须先确认当前目录、环境文件和备份文件都属于正确的生产实例，并为当前数据另做备份。

停止业务写流量，恢复数据库，重新运行迁移后再启动服务：

```bash
docker compose stop web api
docker compose exec -T db sh -c 'pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backups/point.dump
docker compose run --rm migrate
docker compose up -d api web
curl --fail --show-error http://127.0.0.1:3001/api/v1/health
```

如果恢复目标是全新空数据库，可省略 `--clean --if-exists`，但仍需在恢复后执行迁移。

## 上传图片卷备份

默认 Compose 项目名是 `point-quest-prod`，对应上传卷名为 `point-quest-prod_point-upload-data`。如果部署时使用了 `--project-name`，先执行 `docker volume ls` 确认实际卷名。

使用只读挂载创建归档：

```bash
docker run --rm -v point-quest-prod_point-upload-data:/source:ro -v "$PWD/backups":/backup alpine:3.23 tar -czf /backup/point-uploads.tar.gz -C /source .
chmod 600 backups/point-uploads.tar.gz
```

归档应与数据库备份来自同一维护窗口，并一同复制到服务器之外。

## 上传图片卷恢复

> 严重警告：以下命令会删除上传卷中的所有现有文件，然后用归档覆盖。此操作不可撤销。执行前必须确认卷名、归档路径和数据库恢复点完全匹配。

```bash
docker compose stop api
docker run --rm -v point-quest-prod_point-upload-data:/target -v "$PWD/backups":/backup:ro alpine:3.23 sh -c 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar -xzf /backup/point-uploads.tar.gz -C /target'
docker compose up -d api web
```

恢复后检查 API 日志。如果出现上传目录权限错误，确认卷内目录归属运行镜像的 `node` 用户，并从可信备份重新恢复；不要把该卷同时挂载给其他可写服务。

## 密钥轮换

修改 `.env` 后重建相关容器：

```bash
docker compose up -d --force-recreate api web
```

轮换 `AUTH_JWT_SECRET` 会立即使现有 Access Token、Refresh Token 和 Web 登录 Cookie 失效，用户需要重新登录。轮换数据库密码时必须在同一维护窗口同步更新 `POSTGRES_PASSWORD`、`DATABASE_URL` 和数据库角色密码，否则应用无法连接。

## 常见故障

### 配置展开失败

`docker compose config --quiet` 会在必填变量为空时直接失败。确认项目目录存在已填写的 `.env`（可由 `.env.docker.example` 复制），权限仍为 `0600`，且 `IMAGE_REGISTRY` / `IMAGE_TAG` 已设置。

### 镜像拉取失败

确认 `.env` 中的镜像坐标正确，本机或仓库中已有对应 tag，并且当前 Docker 账户有权拉取。本仓库不规定远程仓库的登录与推送步骤。

### 数据库不健康

```bash
docker compose logs --tail=200 db
docker compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

检查磁盘空间、卷权限和数据库变量。数据库未健康时迁移、API、Web 都不会启动。

### 迁移失败

```bash
docker compose ps --all
docker compose logs --tail=200 migrate
```

修复原因后运行 `docker compose run --rm migrate`，成功后再启动 API 与 Web。

### API 或 Web 不健康

分别查看 `api`、`web` 日志。如果 Web 返回 `UPSTREAM_UNAVAILABLE`，表示 Next.js 无法访问内部 API；确认 API 为 healthy、迁移已成功，并且 `API_SERVER_BASE_URL` 仍是 `http://api:3000/api/v1`。

### 3001 端口被占用

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
```

不要终止来源不明的进程。确认现有服务归属后再安排端口或网关变更；生产 Compose 的默认安全边界要求继续绑定宿主机回环地址。

### 上传卷权限异常

```bash
docker compose exec -T api node -e "require('node:fs').accessSync('/app/uploads', require('node:fs').constants.R_OK | require('node:fs').constants.W_OK)"
```

该命令应以状态码 0 退出。不要通过放宽为全局可写权限解决问题；上传根目录应只允许 API 服务账户写入。

## 停止与移除

停止服务但保留数据库和上传卷：

```bash
docker compose stop
```

移除容器和网络但保留卷：

```bash
docker compose down
```

> 严重警告：`down --volumes` 会永久删除 PostgreSQL 与上传图片卷。只有在明确废弃整个部署、已经验证异机备份可恢复，并再次确认 Compose 项目名后，才可执行该操作。

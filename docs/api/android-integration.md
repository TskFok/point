# Android API 集成指南

Android 客户端直接使用 Point Quest 的版本化 REST API。默认开发基址为 `http://localhost:3000/api/v1`；模拟器访问宿主机时通常需要把主机名换成 `10.0.2.2`。生产环境必须使用 HTTPS。

## 契约与 Kotlin 客户端

唯一契约源是仓库根目录的 `openapi/openapi.json`。先在服务端仓库运行：

```bash
pnpm api:spec
```

Android 工程可使用 OpenAPI Generator 的 Gradle 插件生成 Kotlin/Retrofit 客户端：

```kotlin
plugins {
    id("org.openapi.generator") version "<团队锁定版本>"
}

openApiGenerate {
    generatorName.set("kotlin")
    inputSpec.set(file("../point-quest/openapi/openapi.json").absolutePath)
    outputDir.set(layout.buildDirectory.dir("generated/openapi").get().asFile.path)
    packageName.set("com.example.pointquest.api")
    library.set("jvm-retrofit2")
}
```

将生成目录加入 Android source set，并在 CI 中固定生成器版本。不要手写或复制服务端业务规则；题目判定、积分、库存和订单状态均由 API 决定。

## 登录与令牌保存

Android 登录：

```http
POST /api/v1/auth/token
Content-Type: application/json

{
  "username": "student",
  "password": "Student123!"
}
```

成功响应包含：

- `accessToken`：短期访问令牌。
- `accessTokenExpiresIn`：剩余有效秒数。
- `refreshToken`：用于轮换的新 Refresh Token。
- `refreshTokenExpiresAt`：Refresh Token 的过期时间。
- `user`：当前用户的公开资料。

Access Token 只保存在进程内或受保护的短期存储中；Refresh Token 使用 Android Keystore 支持的加密存储。不得写入日志、崩溃报告、普通 SharedPreferences 或 URL。

除 `/auth/token`、`/auth/refresh` 等公开接口外，请求携带：

```http
Authorization: Bearer <accessToken>
```

Bearer 模式不发送 `pq_access`、`pq_refresh`、`pq_csrf` Cookie，也不发送 `X-CSRF-Token`。

## Refresh Token 轮换

Access Token 即将过期或收到 `401 AUTH_TOKEN_EXPIRED` 时调用：

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<current-refresh-token>"
}
```

每次成功刷新都会返回新的 Access Token 和新的 Refresh Token，并撤销旧 Refresh Token。客户端必须以一次原子写入替换整组令牌；只有安全存储成功后才把新组设为当前值。旧 Refresh Token 不得再次使用。

同一账户上的并发刷新应在客户端合并为一个 single-flight 请求：

1. 第一个请求持有刷新互斥锁。
2. 其他请求等待同一结果。
3. 刷新成功后统一重放仍然有效的原业务请求。
4. 刷新失败、Refresh Token 过期或撤销时清除全部令牌并回到登录页。

不要无限刷新或无限重放；一次业务请求最多触发一次刷新恢复。

## 幂等写请求

以下资产写请求必须携带 `Idempotency-Key`：

- 首次答题：`POST /practice/questions/{questionId}/answer`
- 错题重练：`POST /practice/wrong-questions/{questionId}/answer`
- 商品兑换：`POST /orders`

推荐为一次用户操作生成 UUID：

```http
Idempotency-Key: 7c575e1c-6f7d-4a93-8c9e-f0e5e55a57cd
```

网络超时或 `409 CONCURRENT_MODIFICATION` 后重试同一操作时，必须复用原 key 和完全相同的请求体。用户重新选择答案、商品或主动发起下一次操作时生成新 key。相同 key 搭配不同载荷会返回 `IDEMPOTENCY_CONFLICT`。

## 分页

列表统一使用：

```http
GET /api/v1/orders?page=1&pageSize=20
```

- `page` 从 1 开始。
- `pageSize` 范围为 1–100。
- 响应包含 `data` 和 `meta`。
- `meta` 包含 `page`、`pageSize`、`total`、`totalPages`。

客户端应以服务端返回的 `meta` 为准；筛选条件变化时回到第 1 页。如果删除或状态变化导致当前页超出 `totalPages`，导航到最后一个有效页并重新查询。

## 稳定错误结构与错误码

所有 API 错误使用统一结构：

```json
{
  "code": "INSUFFICIENT_POINTS",
  "message": "积分不足",
  "requestId": "req_xxx",
  "details": {}
}
```

客户端逻辑只依赖 `code`，`message` 用于展示，`requestId` 用于服务端排障，`details` 提供余额等可恢复上下文。需要处理的稳定错误码至少包括：

| 错误码                      | 建议行为                                  |
| --------------------------- | ----------------------------------------- |
| `AUTH_INVALID_CREDENTIALS`  | 保留用户名，提示重新输入密码              |
| `AUTH_TOKEN_EXPIRED`        | 尝试一次 Refresh Token 轮换               |
| `FORBIDDEN`                 | 停止重试并隐藏无权限入口                  |
| `VALIDATION_FAILED`         | 显示字段问题，不自动重试                  |
| `QUESTION_ALREADY_ANSWERED` | 刷新首次答题队列                          |
| `QUESTION_ALREADY_MASTERED` | 从待练错题列表移除                        |
| `NO_UNANSWERED_QUESTIONS`   | 显示首次答题完成状态                      |
| `INSUFFICIENT_POINTS`       | 使用 `details.balance` 刷新余额并显示差额 |
| `OUT_OF_STOCK`              | 把商品库存更新为 0                        |
| `PRODUCT_INACTIVE`          | 从可兑换列表移除商品                      |
| `ORDER_INVALID_STATUS`      | 刷新订单状态                              |
| `IDEMPOTENCY_CONFLICT`      | 停止重试并生成新的用户操作                |
| `CONCURRENT_MODIFICATION`   | 使用相同 key 与载荷做有界重试             |

未知 4xx 不应自动重试；5xx 和网络错误使用指数退避并设置最大次数。日志只能记录错误码、HTTP 状态和 `requestId`，不得记录密码或令牌。

## Android 接入检查表

- 基址包含 `/api/v1`，生产环境使用 HTTPS。
- `/auth/token` 和带 body `refreshToken` 的 `/auth/refresh` 不使用 Cookie。
- 所有受保护请求携带 Bearer Header。
- Refresh Token 每次成功刷新后原子替换。
- 答题与兑换重试复用原 Idempotency-Key 和请求体。
- 列表使用服务端分页元数据。
- UI 分支使用稳定错误码，不解析中文 message。
- 生成代码来自已提交的 `openapi/openapi.json`。

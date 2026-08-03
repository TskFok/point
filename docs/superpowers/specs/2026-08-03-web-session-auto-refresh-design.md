# Web 会话 Access Token 自动续期设计

**日期：** 2026-08-03  
**状态：** 已确认  

## 目标

消除 Web 端「Access Token 约 15 分钟过期后被当成未登录、跳转登录页」的体验：在 Refresh Token 仍有效时自动续期，覆盖页面导航与浏览器 API 调用。

## 非目标

- 不延长 Access Token 默认有效期（仍为 15 分钟）。
- 不改变 Android Bearer + body `refreshToken` 的刷新协议。
- 不在 Refresh Token 失效时静默「假登录」；刷新失败仍应退出到登录页。
- 不引入滑动会话或服务端 session store。

## 问题根因

- Access Cookie `pq_access` 与 JWT 均为 15 分钟；Refresh Cookie `pq_refresh` 为 30 天。
- 后端已提供 Cookie 模式 `POST /api/v1/auth/refresh`。
- Web 在 Access 过期后既不主动刷新，也不在 401 后刷新重试；`getCurrentSession` 将 401/403 直接视为未登录并 `redirect("/login")`。

## 方案

采用双路径续期：

1. **页面导航 / RSC**：在 `apps/web/proxy.ts` 进入受保护路径前主动刷新（必要时），并把新 Cookie 同时写给浏览器与本次下游请求。
2. **浏览器 API**：在 `@point-quest/api-client` 对 Cookie 模式的 `authenticated` 请求，在 401 后自动 `refresh` 一次并重试原请求。

### 1. Proxy 主动续期

触发条件（同时满足）：

- 路径为受保护前缀：`/learn`、`/admin`（含子路径）
- 请求带有 `pq_refresh`
- 请求**没有** `pq_access`（浏览器在 Access Cookie `maxAge` 到期后不再发送）

行为：

1. 使用当前请求 Cookie 调用上游 `POST {API_SERVER_BASE_URL}/auth/refresh`（或等价绝对 URL）。
2. 携带 `X-CSRF-Token: <pq_csrf>`（与现有 Cookie 刷新 CSRF 规则一致）。
3. 刷新成功：
   - 解析上游 `Set-Cookie`，在 `NextResponse.next()` 上设置 `pq_access` / `pq_refresh` / `pq_csrf`（写回浏览器）。
   - 改写转发给 Next 的请求 `Cookie` 头，使同一次渲染中的 RSC / `createServerApiClient` 能立刻读到新令牌。
4. 刷新失败（非 2xx）：不设置新 Cookie；保持现有「无有效会话则由 layout/`requireRole` 导向登录」行为。若仅有失效 refresh、无 access，可继续放行到页面层处理，避免 proxy 与 layout 双重重定向逻辑分叉；**不在 proxy 内强制 redirect 到 `/login`**（除非当前已有「完全无 Cookie」的重定向逻辑需要保留）。

保留现有逻辑：受保护路径且 `pq_access` 与 `pq_refresh` 皆无 → redirect `/login`。

实现约束：

- Proxy 不得依赖 Node 专有/过重模块；用 `fetch` + 轻量 Cookie 解析即可。
- 不在每次有 `pq_access` 时无条件刷新，避免无谓轮换。
- 上游 base URL 复用 `getApiServerBaseUrl()` 或等价只读配置（若 proxy 运行环境无法 import 某模块，则抽共享纯函数）。

### 2. API Client Cookie 模式 401 自动续期

适用范围：`createApiClient` 发起的请求，且：

- `authMode === "authenticated"`
- 实际使用 Cookie credentials（未走 `Authorization: Bearer`）
- 响应状态为 `401`
- 该请求本身不是 refresh / login / logout / token 端点

行为：

1. 发起一次 Cookie 模式 refresh（等同现有 `refreshWeb` / `authMode: "refresh-cookie"`）。
2. **Single-flight**：并发多个 401 时合并为一次 refresh，其余等待同一 Promise。
3. Refresh 成功 → 用相同参数重试原请求**恰好一次**。
4. Refresh 失败 → 抛出原 401 或 refresh 错误（与现有 `ApiClientError` 一致），由页面/调用方处理。
5. Bearer / `body-refresh-token` 路径不启用该自动续期（Android 自行管理令牌）。

可选：为可测试性导出内部钩子或保持通过 mock `fetch` 断言调用序列即可。

### 3. 服务端 RSC 客户端

`createServerApiClient` **不**在 RSC 渲染路径上自行 `cookies().set`（Next 限制）。页面层依赖 proxy 在入口已写入请求 Cookie。  
服务端若经 Next `/api/v1` BFF 调用则天然带上浏览器 Cookie；当前直连 API 的路径在 proxy 改写 Cookie 后即可工作。

不强制在本变更中把 server client 改为走 BFF。

## 错误处理

| 场景 | 期望 |
|------|------|
| Access 过期，Refresh 有效，页面导航 | Proxy 刷新成功，页面正常渲染 |
| Access 过期，Refresh 有效，浏览器 API | Client 刷新 + 重试成功 |
| Refresh 过期或被撤销 | 刷新失败；会话校验失败 → 登录页 |
| Refresh 并发 | 只打一次 refresh，全部等待方共用结果 |
| CSRF 缺失导致 refresh 失败 | 视为未登录/需重新登录，不循环重试 |

## 测试

### Proxy

- 有 `pq_refresh`、无 `pq_access` 访问 `/learn` → 调用 refresh，响应与下游请求 Cookie 含新 access。
- 已有 `pq_access` → 不调用 refresh。
- 无任何会话 Cookie → 仍 redirect `/login`。
- Refresh 上游失败 → 不写坏 Cookie；不在 proxy 层发明新成功路径。

### API Client

- Cookie `authenticated` 首次 401 → refresh → 原请求重试成功（共 3 次网络调用：原、refresh、重试）。
- 并发两个 401 → refresh 只调用一次。
- Bearer 401 → 不自动 refresh。
- Refresh 本身 401 → 不重试 refresh，错误上抛。

### Web 会话（可选回归）

- `getCurrentSession`：在 Cookie 已被续期的前提下仍返回用户；刷新彻底失败时仍返回 `null`。

## 文件影响（预期）

| 区域 | 文件 |
|------|------|
| Web proxy | `apps/web/proxy.ts`（及可抽取的 refresh 辅助模块 + 测试） |
| API client | `packages/api-client/src/client.ts`（+ 现有/新增单测） |
| 文档 | 本设计；如 README/集成文档有「Web 须手动 refresh」表述则同步更正 |

## 验收标准

1. 登录 Web 后空闲超过 15 分钟，仅 Refresh 仍有效时，刷新受保护页面不掉登录。
2. 同条件下浏览器侧已登录 API 调用不因单次 Access 过期而失败（自动续期后成功）。
3. Refresh 失效后仍会回到登录页。
4. 相关单元测试通过；Android 刷新行为不变。

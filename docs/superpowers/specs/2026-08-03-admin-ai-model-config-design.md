# 管理端 AI 模型配置设计

**日期：** 2026-08-03  
**状态：** 已确认  

## 目标

在 Web 运营管理台提供 AI 模型配置能力，支持维护多套配置（模型名称、调用地址、API Key、启用状态），并为后续自动出题 / 判题 / 讲解等能力预留数据与接口。本期包含连通性测试，不接具体业务调用。

## 非目标

- 不实现默认模型选择或按场景绑定。
- 不在业务链路中实际调用模型（出题、判题等后续再做）。
- 不提供查看完整 API Key 明文。
- 不做配置变更历史。
- 不做依赖真实第三方与真实密钥的 E2E 联调。

## 方案选择

采用独立「AI 模型」管理页 + Admin CRUD API（对齐题库 / 商品模块），不挂到积分设置聚合页，也不改用纯环境变量配置。

## 数据模型

新增 Prisma 模型 `AiModelConfig`：

| 字段 | 说明 |
|------|------|
| `id` | cuid |
| `name` | 模型名称，必填，trim 后 ≤100 字，全局唯一 |
| `baseUrl` | 调用地址，必填，合法 `http`/`https` URL，≤500 字 |
| `apiKeyCiphertext` | API Key 密文（AES-256-GCM），库内不存明文 |
| `apiKeyLast4` | 明文末 4 位，用于脱敏展示 |
| `isEnabled` | 启用状态，默认 `true`；各记录独立，可全部启用或全部未启用 |
| `createdAt` / `updatedAt` | 时间戳 |
| `updatedBy` | 最近更新的管理员 `userId`（`onDelete: Restrict`） |

索引：`name` 唯一；列表按 `updatedAt`/`id` 分页。

加密密钥使用独立环境变量 `AI_CONFIG_ENCRYPTION_KEY`（32 字节密钥的 base64 或 hex 编码），**不**复用 `AUTH_JWT_SECRET`。本地 `.env.example` 与生产 `.env.docker.example` 提供占位说明；缺省或非法时写操作与连通性测试中的解密失败，返回明确配置错误。

## 对外 DTO

列表与详情统一脱敏，从不返回完整 API Key 或密文：

```ts
{
  id: string;
  name: string;
  baseUrl: string;
  apiKeyMasked: string; // 形如 "••••abcd"，基于 apiKeyLast4
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

连通性测试响应：

```ts
{
  ok: boolean;
  latencyMs: number;
  modelCount?: number; // 成功且响应可解析时可选
  message?: string;    // 失败时的脱敏说明
}
```

## Admin API

均需 `ADMIN` 角色，前缀 `/api/v1`：

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/admin/ai-models` | 分页列表；可选 `isEnabled` 筛选 |
| `POST` | `/admin/ai-models` | 创建；`name`/`baseUrl`/`apiKey` 必填；`isEnabled` 可选（默认 true） |
| `GET` | `/admin/ai-models/{id}` | 详情（脱敏） |
| `PATCH` | `/admin/ai-models/{id}` | 更新；`apiKey` 省略或空字符串表示不修改密钥 |
| `DELETE` | `/admin/ai-models/{id}` | 硬删除（本期无业务外键引用） |
| `POST` | `/admin/ai-models/test` | 测试草稿或编辑态（见下方密钥解析）；静态路径须注册在 `{id}` 路由之前 |
| `POST` | `/admin/ai-models/{id}/test` | 测试已保存配置：使用该行的 `baseUrl` + 库内解密密钥 |

草稿测试 `POST /admin/ai-models/test` 请求体：`baseUrl` 必填；可选 `apiKey`、`id`。密钥解析顺序：若 `apiKey` 非空则用请求体密钥；否则必须提供 `id` 并用库内解密密钥；两者皆无则 `400`。

校验与错误：

| 场景 | 行为 |
|------|------|
| `name` 唯一冲突 | `409` + 明确文案 |
| URL / 必填校验失败 | `400` `VALIDATION_FAILED` |
| 配置不存在 | `404` |
| 加密密钥未配置或非法 | 明确配置错误（写路径与需解密的测试路径） |
| 连通性失败（超时 / 对方 4xx/5xx / 网络错误） | HTTP 仍 `200`，body `{ ok: false, message }` |

修改 API 后必须执行 `pnpm api:spec` 与 `pnpm api:client`，并提交生成结果。

## 连通性测试

探测约定（OpenAI 兼容）：

1. 规范化 `baseUrl`：去掉尾部 `/`；若尚未以 `/models` 结尾则拼接 `/models`。
2. 服务端 `GET` 该 URL，Header：`Authorization: Bearer <apiKey>`。
3. 超时 **10 秒**。
4. 2xx → `{ ok: true, latencyMs, modelCount? }`；否则 → `{ ok: false, latencyMs, message }`。
5. 本期**不**校验配置中的「模型名称」是否出现在 `/models` 列表。
6. 出站仅由 API 发起；浏览器不直连第三方；日志与错误信息不得包含 API Key 或 Authorization 头。

## Web 管理端

- 侧栏「AI 模型」（置于「积分设置」下方），路由 `/admin/ai-models`。
- 列表：名称、调用地址、脱敏 Key、启用状态、更新时间；支持新建、编辑、启用/停用、删除（二次确认）、测试；筛选全部 / 已启用 / 未启用；分页复用现有组件。
- 表单：模型名称、调用地址（占位如 `https://api.example.com/v1`）、API Key（`type=password`；新建必填；编辑留空表示不改）、启用开关；「测试连通」可在未保存时触发草稿测试接口。
- 复用运营台现有 `Card` / `Button` / 表单样式与 `getApiErrorMessage`；成功/失败用页内提示或 toast。

## 安全

- API Key AES-256-GCM 入库；响应仅 `apiKeyMasked`。
- 禁止在日志、异常消息、测试响应中泄露密钥或密文。
- 全部接口 `@Roles('ADMIN')`；CSRF / Cookie 会话走现有 Web 代理与鉴权，不另开例外。

## 代码结构（预期）

- Prisma：`AiModelConfig` + migration。
- API：`apps/api/src/ai-models/`（module / admin controller / service / dto）+ 小型加解密工具（可测）。
- OpenAPI 模型与 `packages/api-client` 生成。
- Web：`/admin/ai-models` 页面、表单组件、侧栏导航项、相关单元测试。

## 测试

- API 单元：加密往返、脱敏、`apiKey` 留空不覆盖、名称唯一、URL 规范化、mock `fetch` 覆盖连通性成功 / 401 / 超时。
- Web 单元：列表脱敏渲染、表单校验、编辑留空密钥、测试按钮 loading 与结果展示。
- 契约：OpenAPI / api-client 生成结果纳入仓库。
- 不做真实第三方联调 E2E。

## 成功标准

- 管理员可在 `/admin/ai-models` 完成多套配置的增删改、启停与连通性测试。
- API Key 仅以脱敏形式出现在前端与 API 响应中；库内为密文。
- 启用状态互相独立，允许全部启用或全部未启用。
- 相关单元测试通过；OpenAPI 与 api-client 已更新。

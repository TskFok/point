# AI 任务运行记录完整 HTTP 响应体

**日期：** 2026-08-04  
**状态：** 已确认  

## 目标

将每次 AI `chat/completions` 请求的完整 HTTP 响应体写入 `AiTaskRun`，并通过环境变量控制是否落库。默认关闭，便于本地/生产按需开启排查。

## 非目标

- 不在管理端 API / DTO / OpenAPI / 页面暴露该字段。
- 不截断、不加密响应体；不单独建表；不存请求体。
- 不改变现有 `errorMessage` 摘要逻辑。

## 决策摘要

| 项 | 选择 |
|----|------|
| 存储内容 | 完整 HTTP 响应体原文（raw body） |
| 写入条件 | 只要读到响应体就准备写入（HTTP 2xx 与非 2xx）；网络超时/无 body 则为 `null` |
| 展示 | 仅入库，查库排查 |
| 开关默认 | 关闭 |

## 数据模型

`AiTaskRun` 新增：

```prisma
aiResponseBody String? @db.Text
```

迁移：`prisma/migrations/0008_add_ai_task_run_response_body/`  
`ALTER TABLE "AiTaskRun" ADD COLUMN "aiResponseBody" TEXT;`

## 环境变量

- 名：`AI_TASK_STORE_RESPONSE_BODY`
- 开启：`true` / `1` / `yes`（大小写不敏感）
- 未设置或其它值：关闭
- 落盘文件：
  - `.env.example`
  - `.env.docker`
  - `.env.docker.example`
  - 若本地存在 `.env` 则同步追加（仓库可不提交 `.env`）
- 示例值：`AI_TASK_STORE_RESPONSE_BODY=false`

## 代码路径

### `generateQuestionsWithChatCompletions`

扩展结果类型：

```ts
type GenerateQuestionsResult =
  | { ok: true; questions: GeneratedQuestion[]; responseBody?: string }
  | { ok: false; message: string; responseBody?: string };
```

- `response.text()` 成功后，将完整字符串作为 `responseBody` 附在后续成功/失败返回值上。
- fetch 超时、网络失败、读 body 失败：不附带 `responseBody`。
- content 解析/业务校验失败：仍附带此前拿到的完整 HTTP `rawBody`。

### `AiTasksService.runTask`

- 用辅助函数解析 `AI_TASK_STORE_RESPONSE_BODY`。
- `finish` 支持可选 `aiResponseBody`。
- **仅当开关开启且 `typeof generated.responseBody === 'string'` 时写入**（含空字符串）；`responseBody` 未定义时保持 `null`。
- 未发起 AI HTTP 或未拿到 body 的路径（模型停用、解密失败、写库失败、中断等）不写 body。
- 已拿到 AI 响应后的业务失败（如密推进）：开关开启时仍写入。

### API 视图

`toRunView` / `AiTaskRunView` / OpenAPI **不**包含 `aiResponseBody`。

## 安全

- 字段存响应体，不含请求 `Authorization`。
- 日志不额外 dump 完整 body。

## 测试

1. `generate-questions.spec.ts`：成功、HTTP 非 2xx 带 `responseBody`；网络失败不带。
2. `ai-tasks.service.spec.ts`：开关关不落库；开关开落库原文；开关开但无 body 为 `null`。
3. env 解析：`true`/`1`/`yes` 为开，其它为关。

## 实现范围文件（预期）

- `prisma/schema.prisma`
- `prisma/migrations/0008_add_ai_task_run_response_body/migration.sql`
- `apps/api/src/ai-tasks/generate-questions.ts` (+ spec)
- `apps/api/src/ai-tasks/ai-tasks.service.ts` (+ spec)
- `.env.example`、`.env.docker`、`.env.docker.example`（及可选本地 `.env`）

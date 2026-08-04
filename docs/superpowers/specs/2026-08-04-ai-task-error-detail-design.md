# AI 任务失败错误明细设计

**日期：** 2026-08-04  
**状态：** 已确认  

## 目标

AI 任务执行失败时，管理端 `errorMessage`（toast / 执行记录）展示更详细的 API / 底层错误信息，便于排查。

## 非目标

- 不新增 DB 字段或 API 字段。
- 不改前端展示结构。
- 不改业务校验失败文案（密推进、题干校验等）。
- 不在 `errorMessage` 中写入 apiKey 或 Authorization。

## 方案

在 `generateQuestionsWithChatCompletions` 内增强失败 `message`；仍写入现有 `AiTaskRun.errorMessage`（`TEXT`）。

## 文案规则

摘要截断上限约 **500** 字符；优先提取 JSON 的 `error.message` 或顶层 `message`。

| 失败路径 | 文案格式 |
|----------|----------|
| HTTP 非 2xx | `AI 调用失败 HTTP {status}：{body摘要}` |
| 超时 | `AI 调用超时：{error.message}`（无则仅前缀） |
| 网络失败 | `AI 调用网络失败：{error.message}`（无则仅前缀） |
| 响应非 JSON | `AI 响应不是 JSON：{原始文本摘要}` |
| 缺 choices / message / content 空 | 现有前缀 + `：{payload/content 摘要}` |

## 测试

`generate-questions.spec.ts` 覆盖上述路径；确保 message 含明细且不含 apiKey。

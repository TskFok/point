# 管理端 AI 任务（自动出题）设计

**日期：** 2026-08-03  
**状态：** 已确认  

## 目标

在 Web 运营管理台提供「AI 任务」能力：可配置多套定时出题任务，按 crontab 自动（或手动立即）调用已配置的 AI 模型，按英文单词字母序生成题目并写入题库。题干为英文，选项为中文；每个任务维护独立的 `lastWord` 游标，从上次生成到的单词之后继续。

## 非目标

- 不维护本地英文词库；下一词由 AI 按字母序续写。
- 不提供管理端手改 `lastWord` 的编辑入口（仅只读展示；执行记录可看前后游标）。
- 不引入 Redis / BullMQ 等外部队列（本期用 Nest 进程内调度）。
- 不做依赖真实第三方与真实密钥的 E2E 联调。
- 不做执行历史单条「重跑」；需要再出题时使用「立即执行」。

## 方案选择

采用 **Nest 进程内调度（`@nestjs/schedule`）+ `AiTask` / `AiTaskRun` 表**：

- 每分钟 tick，对已启用任务匹配 crontab；「立即执行」与 cron 共用同一生成流水线。
- 多任务各自独立配置与游标。
- 多实例防重：同一任务同一时刻最多一条 `RUNNING`（事务/唯一约束抢锁）。

备选（本期不采用）：BullMQ 可重复任务（运维更重）；外部系统 cron 调 API（与可配置多任务 crontab 不合）。

## 数据模型

### `AiTask`

| 字段 | 说明 |
|------|------|
| `id` | cuid |
| `name` | 任务名称，必填，trim 后 ≤100 字，全局唯一 |
| `aiModelConfigId` | 关联 `AiModelConfig` |
| `questionCount` | 每次生成题目数量 |
| `optionCount` | 每题选项数量（2–6，对齐现有题库约束） |
| `basePoints` | 每题基础积分（1–1000，对齐题库） |
| `cronExpression` | 5 段 crontab 表达式 |
| `isEnabled` | 是否参与自动调度；**不影响**「立即执行」 |
| `lastWord` | 游标，可空；空表示从字母序最前开始 |
| `createdBy` / `updatedBy` | 管理员 `userId`（`onDelete: Restrict`） |
| `createdAt` / `updatedAt` | 时间戳 |

索引：`name` 唯一；列表按 `updatedAt`/`id` 分页；`aiModelConfigId` 外键索引；`isEnabled` 便于调度扫描。

### `AiTaskRun`

| 字段 | 说明 |
|------|------|
| `id` | cuid |
| `aiTaskId` | 所属任务（删除任务时级联删除 runs） |
| `trigger` | `CRON` \| `MANUAL` |
| `status` | `RUNNING` \| `SUCCESS` \| `FAILED` |
| `startedAt` / `finishedAt` | 起止时间（`finishedAt` 可空至结束） |
| `questionsCreated` | 成功写入题库的数量 |
| `lastWordBefore` / `lastWordAfter` | 本次游标前后（可空） |
| `errorMessage` | 失败或部分失败时的脱敏说明 |

约束：同一 `aiTaskId` 在 `status = RUNNING` 时至多一条（用部分唯一索引或等价应用层事务抢锁实现）。

### 与既有模型的关系

- `AiModelConfig`：被 `AiTask` 引用后，删除模型须拒绝（`onDelete: Restrict`），提示先改绑或删除任务。本期起 AI 模型删除不再是「无业务外键」的硬删无阻。
- 生成结果写入现有 `Question` / `QuestionOption`。题目 `createdBy` 固定为：`MANUAL` → 触发执行的管理员；`CRON` → 任务的 `updatedBy`。

## 出题约定

- 题干（`stem`）：英文完整例句，必须按单词边界包含目标词 `word`（大小写不敏感），并点名考查该词（如 `What does "abhor" mean?`）；禁止 `___` / `[blank]` 等挖空。详见 `2026-08-03-ai-question-stem-must-include-word-design.md`。
- 选项（`content`）：中文词义；`label` 仍用 A/B/C…；恰 1 个 `isCorrect=true`，对应 `word` 的意思。
- `explanation`：中文简短解析。
- `basePoints` / `optionCount`：取自任务配置；`isActive` 默认 `true`。
- AI 返回严格 JSON 数组；每项至少包含：`word`（本题锚定的英文单词）、`stem`、`explanation`、`options`（`label`/`content`/`isCorrect`）。`word` 用于校验字母序与更新游标，**不**单独落库字段。入库前校验：stem 须含 `word` 且不得挖空，否则跳过该题。
- 游标：`lastWord` 为空 → 首次从字母序最前一带开始；成功写入至少 1 题后，将任务 `lastWord` 更新为本次成功题目中按字母序最大的 `word`（规范化小写）。
- 部分失败：单题 JSON/校验不过则跳过并记入错误摘要；若 0 题成功 → run `FAILED`，**游标不前进**；若 ≥1 题成功 → run `SUCCESS`（可在 `errorMessage` 附带跳过摘要），游标按上条规则前进。

## Admin API

均需 `ADMIN` 角色，前缀 `/api/v1`：

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/admin/ai-tasks` | 分页列表；可选 `isEnabled` |
| `POST` | `/admin/ai-tasks` | 创建 |
| `GET` | `/admin/ai-tasks/{id}` | 详情（含 `lastWord`、绑定模型 id/name） |
| `PATCH` | `/admin/ai-tasks/{id}` | 更新配置（不含手改 `lastWord`） |
| `DELETE` | `/admin/ai-tasks/{id}` | 删除任务及执行记录 |
| `POST` | `/admin/ai-tasks/{id}/run` | 立即执行；未启用也可；已有 `RUNNING` → `409` |
| `GET` | `/admin/ai-tasks/{id}/runs` | 执行历史分页 |

创建/更新校验：

| 字段 | 规则 |
|------|------|
| `name` | 非空，≤100 字，唯一 |
| `aiModelConfigId` | 存在且 `isEnabled=true` |
| `questionCount` | 整数 1–50 |
| `optionCount` | 整数 2–6 |
| `basePoints` | 整数 1–1000 |
| `cronExpression` | 合法 5 段 crontab |
| `isEnabled` | 布尔，可选（默认 true） |

执行时再次校验模型仍存在且启用；否则 run `FAILED`。

修改 API 后必须执行 `pnpm api:spec` 与 `pnpm api:client`，并提交生成结果。

## 调度与生成流水线

1. `@nestjs/schedule` 每分钟执行一次调度 tick。
2. 加载 `isEnabled=true` 的任务；用当前时间匹配 `cronExpression`；命中则尝试启动，`trigger=CRON`。
3. 启动步骤（cron / manual 共用）：
   1. 事务内尝试创建 `AiTaskRun(RUNNING)`（抢锁）；失败则跳过或对 manual 返回 `409`。
   2. 记录 `lastWordBefore`。
   3. 解密模型密钥，调用 OpenAI 兼容 `chat/completions`（超时 **60 秒**；单测 mock）。
   4. Prompt 要求：从 `lastWord` 之后按英文字母序生成 `questionCount` 道题；每题带 `word`；题干为含 `word` 的完整英文例句并点名考查该词（禁止挖空）、选项中文词义、`optionCount` 个选项、恰一正确项、中文解析；**严格 JSON** 数组。
   5. 校验每题（含 `word` 须严格大于 `lastWordBefore`、彼此按序不重复）并批量写入题库；更新 `questionsCreated`、`lastWordAfter`；成功时更新任务 `lastWord`。
   6. 标记 run `SUCCESS` / `FAILED`，写 `finishedAt` 与可选 `errorMessage`。
4. 出站仅由 API 发起；日志与 `errorMessage` 不得包含 API Key 或 Authorization。

## Web 管理端

- 侧栏「AI 任务」（置于「AI 模型」下方），路由 `/admin/ai-tasks`。
- 列表：名称、绑定模型、题目数、选项数、基础积分、crontab、启用、`lastWord`、最近执行状态/时间；筛选全部 / 已启用 / 未启用；操作含编辑、启停、立即执行、删除（二次确认）、查看执行记录。
- 表单：名称、AI 模型下拉（仅已启用）、题目数量、选项数、基础积分、crontab（附示例如 `0 8 * * *`）、启用开关；`lastWord` 只读展示。
- 执行记录页/面板：触发方式、状态、起止时间、生成题数、游标前后、错误信息；只读。
- 立即执行：loading 态；成功/失败页内提示；刷新列表与记录。
- 复用运营台现有样式与 `getApiErrorMessage`。

## 安全

- 复用 `AiModelConfig` 的密钥加密与解密；响应与日志永不回传明文 Key。
- 全部接口 `@Roles('ADMIN')`；CSRF / Cookie 会话走现有 Web 代理，不另开例外。

## 代码结构（预期）

- Prisma：`AiTask`、`AiTaskRun`、枚举 `AiTaskRunTrigger` / `AiTaskRunStatus` + migration；`AiModelConfig` 增加反向关系。
- API：`apps/api/src/ai-tasks/`（module / admin controller / service / scheduler / dto / AI 调用与 JSON 解析可测单元）。
- OpenAPI 模型与 `packages/api-client` 生成。
- Web：`/admin/ai-tasks` 页面与表单、执行记录、侧栏项、单元测试。

## 测试

- API 单元：CRUD 校验、模型引用/启停、crontab 非法、RUNNING 互斥、游标在成功时前进 / 全失败不前进、mock AI 成功与坏 JSON。
- Web 单元：列表渲染、表单字段、立即执行 loading、执行记录展示。
- 契约：OpenAPI / api-client 纳入仓库。
- 不做真实第三方联调 E2E。

## 成功标准

- 管理员可在 `/admin/ai-tasks` 维护多套任务，配置模型、数量、选项数、积分、crontab、启用状态，并立即执行。
- 已启用任务在 crontab 命中时自动出题；未启用仍可手动执行。
- 题目题干为含目标词的完整英文例句（禁止挖空）、选项中文词义，按单词字母序游标续写；执行历史可查。
- 相关单元测试通过；OpenAPI 与 api-client 已更新。

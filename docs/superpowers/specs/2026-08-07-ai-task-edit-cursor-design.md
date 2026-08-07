# AI 任务：编辑时修改游标 lastEntryId

## 背景

AI 任务用 `lastEntryId` 作为词库取词游标（`entry.id > lastEntryId`）。管理端编辑表单目前只读展示该字段，运维无法在跑偏、卡死或需要重扫时手动纠偏/重置，只能依赖执行结果自动推进。

## 目标

1. 编辑 AI 任务时可修改 `lastEntryId`。
2. 清空表示从最小 `entry.id` 重新开始；填正整数表示下次取 `id > 该值`。
3. 通过现有 `PATCH /admin/ai-tasks/:id` 与其他字段同一次保存。

## 非目标

- 新建任务不设初始游标。
- 不校验 id 是否存在于 `entry`，也不校验 `lang_code` / `pos`。
- 不因存在 RUNNING run 而拒绝修改；不改调度、取词、自动推进逻辑。
- 不做列表行内快捷编辑，不做独立 cursor API。

## 方案

### API / 后端

`UpdateAiTaskDto` / `UpdateAiTaskRequestDto` 新增可选字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `lastEntryId` | `string \| null`（可选） | 与 `AiTaskDto.lastEntryId` 一致，用字符串传 bigint |

`AiTasksService.update` 语义：

- 字段未出现（`undefined`）→ 不改游标
- `null` 或 trim 后空串 → 写成 `null`
- 非空：须匹配 `/^\d+$/` 且数值 ≥ 1，转 `BigInt` 写入
- 非法 → `400`，文案如「游标 lastEntryId 须为正整数字符串，或留空以重置」
- 不查 `entry`；不检查是否有 RUNNING run

OpenAPI / `@point-quest/api-client` 同步更新。

### 并发说明

若任务正在执行：本次 PATCH 立刻改库中游标；当前 run 仍用启动时读到的游标取词。run 成功结束时若推进游标，可能覆盖刚改的值——可接受，运维可在 run 结束后再改一次。

### 前端

编辑表单（`ai-task-form.tsx`）：

- 仅 `mode === "edit"` 显示游标字段
- 只读改为可编辑；初始值 `initialTask.lastEntryId ?? ""`
- 说明：留空 = 从最小 entry.id 开始；填数字 = 下次从该 id 之后取词
- 客户端校验与后端一致；非法则阻止提交
- 保存时编辑模式带上 `lastEntryId: 空串 ? null : 数字字符串`

列表页仅展示游标；保存成功后刷新即可看到新值。与其他字段同一「保存」按钮，无单独确认弹窗。

## 测试与验收

### API 单测

- `update` 设 `lastEntryId: "42"` → 游标为 `42n`
- `update` 设 `null` 或 `""` → 游标为 `null`
- 非法值（`"0"`、`"-1"`、`"abc"`、`"1.5"`）→ 校验失败
- 不带该字段 → 游标不变
- 既有取词/推进用例不回归

### 前端单测

- 编辑模式可改游标并随 `updateAdminAiTask` 提交；清空提交 `null`；非法值不调用 API
- 新建模式不出现游标字段 / 不提交该字段
- OpenAPI：`UpdateAiTaskRequestDto` 含可空 `lastEntryId`

### 验收

1. 编辑任务改游标并保存，列表与再次打开表单显示新值
2. 清空保存后游标为「—」/ 空，下次执行从最小 id 取
3. 非法输入前后端均拒绝

# AI 任务连续失败自动停用设计

**日期：** 2026-08-07  
**状态：** 已确认  

## 目标

为「AI 任务」增加可配置的连续失败阈值：当 **自动调度（cron）** 连续失败次数达到设定值时，将任务改为停用（`isEnabled=false`），直到管理员手动再次启用；重新启用后失败次数清零并重新计算。

## 非目标

- 不统计手动「立即执行」的失败/成功（不增、不清零连续失败计数）。
- 不引入独立的「因失败自动停用」标记字段；停用后与手动停用共用 `isEnabled`。
- 不从历史 `AiTaskRun` 回溯重算计数（以任务表上的派生计数为准）。
- 不改变「停用后仍可立即执行」的既有行为。
- 不做依赖真实第三方的 E2E 联调。

## 方案选择

采用 **任务表存阈值 + 当前连续失败数**：

| 方案 | 说明 | 取舍 |
|------|------|------|
| **1（采用）** | `AiTask` 增加 `maxConsecutiveFailures` 与 `consecutiveFailureCount`；cron run 结束时更新 | 实现简单、调度 O(1)、列表可直接展示 |
| 2 | 只存阈值，结束时从 `AiTaskRun` 回溯连续 cron `FAILED` | 无派生字段，但每次多查、列表展示更重 |
| 3 | 方案 1 + `disabledByFailures` 标记 | 可区分停用原因，本期可用计数/文案推断，非必须 |

## 确认的产品规则

1. **连续失败**：连续 N 次 cron `FAILED` 才停用；中间一次 cron `SUCCESS` 将计数清零。
2. **失败定义**：任意 `AiTaskRun.status = FAILED` 均计入（含 API 失败、词库耗尽、0 题成功、进程中断恢复等）。
3. **触发来源**：仅 `trigger = CRON` 计入；`MANUAL` 不影响计数与因失败产生的停用逻辑。
4. **阈值**：`maxConsecutiveFailures` 为整数 `0–100`，默认 `0`；`0` 表示不自动停用。
5. **重新启用**：`PATCH` 将 `isEnabled` 从 `false` → `true` 时，`consecutiveFailureCount = 0`。

## 数据模型

在 `AiTask` 上新增：

| 字段 | 类型 | 说明 |
|------|------|------|
| `maxConsecutiveFailures` | `Int` `@default(0)` | 连续 cron 失败上限；`0` = 不自动停用；创建/更新校验 `0–100` |
| `consecutiveFailureCount` | `Int` `@default(0)` | 当前连续 cron 失败次数；只读展示，客户端不可手改 |

Prisma 迁移后无需新索引（计数随主键行更新）。

### 更新语义

| 事件 | `consecutiveFailureCount` | `isEnabled` |
|------|---------------------------|-------------|
| cron run → `FAILED` | `+= 1` | 若 `maxConsecutiveFailures > 0` 且新计数 ≥ 阈值 → `false` |
| cron run → `SUCCESS` | `= 0` | 不变 |
| manual run → 任意 | 不变 | 不变 |
| `PATCH`：`isEnabled` `false`→`true` | `= 0` | 按请求 |
| `PATCH`：仅改阈值，或 `true`→`false` | 不变 | 按请求；**改阈值本身不立即停用**（仅在此后 cron run 结束时再判断） |
| 创建任务 | 默认 `0` | 默认 `true`（或按请求） |

## 执行流水线

在现有 `runTask` 结束路径（`finish` / 等价结算）中，**仅当本次 `trigger === 'CRON'`** 时，与 run 状态更新同一事务（或紧随其后的原子更新）调整任务字段：

1. `FAILED`：递增 `consecutiveFailureCount`；若达阈值则 `isEnabled = false`。
2. `SUCCESS`：将 `consecutiveFailureCount` 置 `0`。
3. `MANUAL`：不修改上述字段。

进程启动 `recoverInterruptedRuns` 与超时清理将遗留 `RUNNING` 标为 `FAILED` 时：若该 run 的 `trigger` 为 `CRON`，按失败规则累加（避免强杀/超时绕过计数）。实现时对每条受影响的 cron run 逐条更新对应任务计数（批量 `updateMany` 标 FAILED 后，再按 `aiTaskId` 聚合处理或逐任务原子递增）；达阈值则停用。

调度侧仍只加载 `isEnabled=true`；自动停用后不再参与 cron，直至手动启用。

## Admin API

沿用现有路径，扩展字段：

| 位置 | 变更 |
|------|------|
| `CreateAiTaskRequestDto` / `UpdateAiTaskRequestDto` | 可写 `maxConsecutiveFailures`（可选；整数 0–100） |
| `AiTaskDto` | 返回 `maxConsecutiveFailures`、`consecutiveFailureCount`（只读） |

`PATCH` 逻辑：若请求将 `isEnabled` 设为 `true` 且更新前为 `false`，同次更新将 `consecutiveFailureCount` 置 `0`。

修改 API 后必须执行 `pnpm api:spec` 与 `pnpm api:client`，并提交生成结果。

## 管理端 UI

- **表单**：增加「连续失败停用阈值」数字输入；说明文案：`0 = 不自动停用；仅统计自动调度失败`。
- **编辑**：只读展示「当前连续失败次数」。
- **列表**：展示当前连续失败 / 阈值（如 `2/3`）；阈值为 `0` 时显示「—」或「未启用」。
- 自动停用后列表/详情显示为未启用；勾选重新启用并保存后计数清零。

## 测试

**API（`ai-tasks.service.spec.ts` 等）：**

- 连续 cron `FAILED` 达阈值 → `isEnabled=false`，计数等于阈值。
- cron `SUCCESS` → 计数清零。
- 阈值 `0` → 多次 cron 失败也不停用（计数仍递增，或按实现约定：阈值 0 时可不递增；**本期约定：阈值 0 时仍递增计数以便展示，但不触发停用**）。
- manual `FAILED` / `SUCCESS` → 计数与 `isEnabled` 不变。
- `PATCH` 重新启用 → 计数清零。
- 中断恢复将 cron `RUNNING`→`FAILED` → 计入连续失败，达阈值则停用。

**Web：**

- 表单可提交 `maxConsecutiveFailures`；编辑页展示当前连续失败。
- 列表展示 `n/max` 或「未启用」类文案（单测覆盖）。

## 验收标准

1. 配置阈值 `3`，连续 3 次 cron 失败后任务变为停用，调度不再触发。
2. 停用期间手动执行失败不影响计数；手动重新启用后计数为 `0`。
3. 阈值 `0` 的任务行为与改前一致（永不因失败自动停用）。
4. 相关单元测试通过；OpenAPI / api-client 已同步。

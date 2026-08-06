# 管理端题库批量启停删

**日期：** 2026-08-06  
**状态：** 已确认  

## 目标

在题库管理列表支持对**当前页勾选**的题目进行批量启用、批量停用、批量删除；不可操作项跳过并汇总结果；交互与单条启停删规则一致。

## 非目标

- 跨页勾选 / 翻页保留选中
- 按当前筛选条件一键操作全部题目
- 软删除 / `deletedAt`
- 放宽「有答题记录不可启用 / 不可删除」规则
- 启用中题目的硬删除（仍跳过）

## 决策摘要

| 项 | 选择 |
|----|------|
| 选中范围 | 仅当前页勾选；翻页 / 筛选 / 刷新后清空 |
| 失败策略 | 尽力执行；返回 `succeeded` / `skipped` / `skippedByReason` |
| API | 单一 `POST /api/v1/admin/questions/batch` |
| 确认 UX | 批量停用、批量删除二次确认；批量启用不确认 |
| 写入 | 一次查出后 `updateMany` / `deleteMany`（禁止循环查库） |

## 架构

```
Admin Questions Page
  └─ 当前页勾选 → 批量工具条
       ├─ 批量启用 → batchAdminQuestions({ action: "enable", ids })
       ├─ 批量停用 → ConfirmDialog → batchAdminQuestions({ action: "disable", ids })
       └─ 批量删除 → ConfirmDialog → batchAdminQuestions({ action: "delete", ids })
            └─ POST /api/v1/admin/questions/batch
                 └─ QuestionsService.batch
                      ├─ 校验 ids（非空、去重后 ≤100）
                      ├─ findMany + attempts 计数，按 action 分类
                      ├─ updateMany / deleteMany
                      └─ { succeeded, skipped, skippedByReason }
```

## 接口

- `POST /api/v1/admin/questions/batch`
- 鉴权：`ADMIN`
- OpenAPI `operationId`：`adminBatchQuestions`
- Body：
  - `action`: `"enable" | "disable" | "delete"`
  - `ids`: 非空 `string[]`，去重后上限 100
- 成功：`200` +

```ts
{
  succeeded: number;
  skipped: number;
  skippedByReason: {
    notFound: number;
    alreadyTargetState: number;
    hasAttempts: number;
    stillActive: number;
  };
}
```

空 `ids` 或超限 → `400 VALIDATION_FAILED`。部分或全部跳过仍返回 `200`。

### 业务规则

| action | 执行 | 跳过 |
|--------|------|------|
| enable | `!isActive && attempts===0` → `isActive=true` | 不存在；已启用；有答题记录 |
| disable | `isActive` → `isActive=false` | 不存在；已停用 |
| delete | `!isActive && attempts===0` → 硬删除 | 不存在；仍启用；有答题记录 |

`skippedByReason` 中不适用项为 `0`。删除成功时选项与进度随 Cascade 清理（与单条删除一致）。

## 前端

文件：`apps/web/app/(admin)/admin/questions/page.tsx`

- 表头「全选当前页」+ 行 checkbox；`selectedIds` 仅当前页
- 有勾选时表格上方工具条：已选 N + 批量启用 / 停用 / 删除
- `ConfirmAction` 扩展：`disable | delete | batch-disable | batch-delete`
- 批量停用标题：`确认停用选中的 N 道题目？`
- 批量删除标题：`确认删除选中的 N 道题目？`；描述说明仅已停用且无答题记录会删除，其余跳过
- 成功文案：`已启用/已停用/已删除 X 道，跳过 Y 道`（`skipped===0` 时可省略跳过段）
- `mutatingBatch` 与 `mutatingId` 互斥；遵守 `apps/web/AGENTS.md` 确认弹窗失败约定
- api-client：`batchAdminQuestions`

## 测试

### 后端

- `questions.service.spec`：三种 action 成功/跳过；去重；空/超限；批量写入而非循环
- 控制器 / OpenAPI：`adminBatchQuestions` 契约
- e2e：启用（含有记录跳过）、停用、删除（含仍启用/有记录跳过）

### 前端

- 无勾选不显示工具条；勾选后显示
- 全选当前页；翻页清空勾选
- 批量启用不确认；停用/删除未确认不调 API
- 确认后调用 API，汇总文案，刷新并清空勾选
- 失败保留确认弹窗错误

## 验收

1. 当前页可勾选并批量启用 / 停用 / 删除
2. 不可操作项被跳过，汇总可读
3. 单条启停删行为不变
4. 相关单元测试与 e2e 通过

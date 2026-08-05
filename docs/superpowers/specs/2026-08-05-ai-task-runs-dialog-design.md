# AI 任务执行记录弹窗设计

**日期：** 2026-08-05  
**状态：** 已确认  

## 目标

将管理端「AI 任务」页的执行记录从页面内嵌 `Card` 改为弹窗展示，交互与视觉与同站其他管理页弹窗（`FormDialog`）一致。

## 非目标

- 不改执行记录表格字段、文案、加载/空态逻辑。
- 不改 `listAdminAiTaskRuns` API 或分页参数。
- 不新增专用弹窗组件或加宽 dialog CSS。
- 不做执行记录单条详情/重跑。

## 方案选择

采用 **复用现有 `FormDialog`**：

- 与新建/编辑 AI 任务、商品、模型配置等页面同一套遮罩、Esc、焦点陷阱、关闭按钮。
- 改动面最小：仅替换 `runsFor` 的展示容器。

备选（本期不采用）：独立 `AiTaskRunsDialog`（过度抽象）；加宽专用 class（破坏样式一致性）。

## UI / 交互

- 点击列表「执行记录」：设置 `runsFor`、调用现有 `loadRuns`，渲染 `FormDialog`。
- `title`：`执行记录 · {runsFor.name}`。
- `onClose`：`setRunsFor(null)`；可用 X、遮罩点击、Esc 关闭（`FormDialog` 默认行为）。
- 不向 `FormDialog` 传 `pending`（执行记录关闭不受表单提交中状态限制）。
- `children`：保留现有 loading / `EmptyState` / 表格结构与列（触发、状态、开始、结束、题数、游标、错误）。
- 移除：`Card`、`admin-drawer__header`、自定义「关闭」按钮。

## 数据流

不变：`loadRuns(task)` → `api.listAdminAiTaskRuns(task.id, { page: 1, pageSize: 20 })` → 写入 `runs` / `runsLoading`。

## 测试

更新 `apps/web/tests/admin-ai-tasks-page.test.tsx`：

- 点击「执行记录」后出现 `role="dialog"`，可访问名称匹配「执行记录」。
- 仍断言 `listAdminAiTaskRuns` 入参。
- 关闭弹窗后 dialog 从文档中消失。

## 涉及文件

- `apps/web/app/(admin)/admin/ai-tasks/page.tsx`
- `apps/web/tests/admin-ai-tasks-page.test.tsx`

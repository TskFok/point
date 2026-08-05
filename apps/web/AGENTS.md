<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 管理页页头约定

适用范围：`app/(admin)/admin/**/page.tsx`。新建或改版管理页时必须遵守，禁止再引入自定义 header 类（如 `admin-page__header`），禁止手写 `page-heading` 结构。

## 结构

页头统一使用 `AdminPageHeading`（见 `components/admin/admin-page-heading.tsx`）：

```tsx
import {
  AdminPageHeading,
  AdminPageHeadingStat,
} from "@/components/admin/admin-page-heading";

<AdminPageHeading
  kicker="分区/能力名"
  title="页面标题"
  description="一句说明当前页职责。"
>
  {/* 右侧槽位：见下方二选一 */}
</AdminPageHeading>
```

左侧固定为：`page-kicker` + `h1` + 说明文案。`children` 为右侧槽位，二选一，不要同时放两个，也不要留空。

## 右侧槽位

1. **有主操作时**：放 CTA 按钮（如「添加商品」「新建任务」），通常带 `Plus` 图标，点击打开新建弹窗或进入创建流程。
2. **无主操作、需展示关键指标时**：放 `AdminPageHeadingStat`（如订单「当前结果」、积分「当前倍率」）；加载中或未知用 `"—"`。

```tsx
{/* CTA */}
<AdminPageHeading kicker="…" title="…" description="…">
  <Button onClick={() => setEditing("create")}>
    <Plus aria-hidden="true" />
    添加商品
  </Button>
</AdminPageHeading>

{/* 或 stat */}
<AdminPageHeading kicker="…" title="…" description="…">
  <AdminPageHeadingStat
    icon={<ClipboardList aria-hidden="true" />}
    label="当前结果"
    value={meta?.total ?? "—"}
  />
</AdminPageHeading>
```

特殊右侧内容（如仪表盘时区）可直接作为 `children`；需要焦点回落时用 `headingRef` / `tabIndex`。

## 禁止

- 不要使用 `admin-page__header` 或其他自定义页头 class
- 不要手写 `page-heading` / `page-heading--split`（应通过 `AdminPageHeading`）
- 不要把主 CTA 放进筛选区、表格上方或页面底部来代替页头右侧槽位

# 确认弹窗失败约定

适用范围：管理端使用 `ConfirmDialog` 的危险操作（删除、停用、下架、立即执行等）。

- 确认请求失败时：**保留弹窗**，通过 `ConfirmDialog` 的 `error` 展示错误，允许重试或取消
- 仅在请求**成功**后关闭弹窗
- 取消或重新打开确认时清除 `error`
- 启用等无需确认的操作，错误仍写到页面级提示（如 `actionMessage` / `mutationError`）
- 列表页危险操作优先使用 `useConfirmAction`（见 `hooks/use-confirm-action.ts`），不要手写 `confirmAction` / `confirmError` 状态机
- 参考：`LogoutButton`、订单页 `OrderStatusDialog`、AI 模型/任务/题库列表页

```tsx
const { confirmAction, confirmError, openConfirm, closeConfirm, handleConfirm } =
  useConfirmAction<ConfirmAction>({
    blocked: Boolean(busyId),
    execute: async (action) => {
      // 成功返回 null，失败返回错误文案
      return action.kind === "delete"
        ? remove(action.target)
        : disable(action.target);
    },
  });

{confirmAction ? (
  <ConfirmDialog
    error={confirmError}
    onCancel={closeConfirm}
    onConfirm={() => void handleConfirm()}
    pending={busyId === confirmAction.target.id}
    /* title / description / confirmLabel 由页面按 action 决定 */
  />
) : null}
```

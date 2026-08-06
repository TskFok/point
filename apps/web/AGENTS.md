<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 管理页顶栏约定

适用范围：`app/(admin)/admin/**/page.tsx`。禁止再引入大块 `page-heading` / `AdminPageHeading`，禁止自定义 `admin-page__header`。

## 结构

列表页顶栏使用 `admin-filter-card` + `admin-filter-grid`（放在 `.list-page__chrome` 内）。行内顺序：

`[筛选项…] → [应用筛选/筛选] → [主 CTA 或关键指标]`

- **有主操作**：末尾放 CTA（如「添加商品」），带 `Plus` 图标，`type="button"`，打开新建弹窗。不得成为筛选 form 的默认 submit。
- **无主操作、需展示指标**：末尾放 `AdminPageHeadingStat`（如订单「当前结果」、积分「当前倍率」）；加载中或未知用 `"—"`。
- **无筛选项的页**（积分、仪表盘）：仍用单行 `admin-filter-card`，只放指标或时区信息。

```tsx
<Card className="admin-filter-card">
  <form className="admin-filter-grid" onSubmit={…}>
    {/* 筛选项 + 应用筛选 */}
    <Button type="button" onClick={() => setEditing("create")}>
      <Plus aria-hidden="true" />
      添加商品
    </Button>
  </form>
</Card>
```

侧栏导航标明当前页面，正文不再重复 kicker / 大标题 / 说明段。

## 禁止

- 不要使用 `AdminPageHeading` 或手写 `.page-heading` / `.page-heading--split`
- 不要把主 CTA 放到表格上方单独一行或页面底部来代替筛选行末尾槽位

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

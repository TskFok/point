# Web 端退出登录二次确认设计

**日期：** 2026-08-05  
**状态：** 已确认  

## 目标

在 Web 端侧栏「退出」上增加二次确认，避免误触直接注销会话。

本设计补充并覆盖 `2026-08-03-web-logout-design.md` 中「不增加退出二次确认弹窗」的非目标：此后退出必须经确认后才调用 logout API。

## 非目标

- 不改动后端 `POST /api/v1/auth/logout` 或 Cookie / CSRF 协议。
- 不改 Android / 其他非 Web 客户端。
- 不替换管理端现有 `window.confirm` 删除确认（后续可复用 `ConfirmDialog`，本轮不做）。
- 不抽取通用 Dialog 底座 / 焦点陷阱 hook（本轮对齐现有弹窗实现模式，避免大 refactor）。
- 不新增 Playwright e2e（以组件单元测试覆盖）。

## 决策摘要

| 项 | 选择 |
|----|------|
| 交互形态 | 自定义确认弹窗（非 `window.confirm`） |
| 文案 | 标题「确定要退出登录吗？」；确认「退出登录」；取消「取消」 |
| 关闭方式 | 取消按钮 + Esc + 点击遮罩（`pending` 时均不可关闭） |
| 实现 | 新增通用 `ConfirmDialog`，`LogoutButton` 接入 |
| 错误展示 | 弹窗内展示，保持打开以便重试 |

## 架构

### 1. 共享组件：`ConfirmDialog`

路径：`apps/web/components/ui/confirm-dialog.tsx`。

行为对齐现有 `FormDialog` / `OrderStatusDialog` / `RedeemDialog`：

- 由父级条件渲染（打开时挂载，关闭时卸载），不设独立 `open` prop
- portal 到 `document.body`，使用 `.dialog-layer`
- 遮罩 `.dialog-backdrop`：点击关闭（`pending` 时不关闭）
- `role="dialog"`、`aria-modal="true"`、`aria-labelledby` 指向标题
- 右上角关闭按钮、Esc 关闭（`pending` 时不关闭）
- 焦点陷阱；关闭后焦点回到打开前元素（可选 `fallbackFocusRef`）
- 打开期间锁定 `document.body` 滚动，并对背景节点设置 `aria-hidden` / `inert`

视觉：

- 新样式类 `.confirm-dialog`：轻量确认布局（标题 + 可选说明 + `dialog-actions`）
- 复用 `.dialog-backdrop`、`.dialog-close`、`.dialog-actions`、`.dialog-error` 等既有 token / 类名
- 确认按钮支持 `primary` / `danger`；退出登录使用 `danger`

Props：

```ts
type ConfirmDialogProps = {
  title: string;
  description?: string;
  confirmLabel?: string; // 默认「确认」
  cancelLabel?: string; // 默认「取消」
  confirmVariant?: "primary" | "danger";
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
};
```

### 2. `LogoutButton` 接入

路径：`apps/web/components/layout/logout-button.tsx`（`AdminShell` / `StudentShell` 继续共用，无需改 shell）。

交互流：

1. 点击侧栏「退出」→ 设置本地 state 打开 `ConfirmDialog`（此时不调用 API）。
2. 弹窗标题「确定要退出登录吗？」；确认按钮「退出登录」（`danger`）；取消「取消」。
3. 确认 → `api.logout()`；`pending` 期间确认文案为「退出中…」，禁用关闭与操作按钮。
4. 成功 → `router.replace("/login")`。
5. 失败 → 弹窗保持打开，`error` 仅在弹窗内展示；移除侧栏原有错误区，避免双份提示。
6. 取消 / Esc / 点遮罩 → 关闭弹窗，焦点回到「退出」按钮；清除错误态。

## 测试

### `confirm-dialog.test.tsx`

- 渲染标题与默认/自定义按钮文案
- 点确认触发 `onConfirm`
- 点取消、Esc、点遮罩触发 `onCancel`
- `pending` 时按钮禁用，且 Esc / 遮罩 / 关闭不触发 `onCancel`

### 更新 `logout-button.test.tsx`

- 仅点击「退出」不调用 `logout`，并出现确认弹窗
- 确认后才调用 `logout`，成功后 `replace("/login")`
- 取消后不调用 `logout`
- 失败时弹窗内展示错误、不跳转，可再次确认重试

## 验收标准

1. 管理端与学员端侧栏点「退出」均出现确认弹窗，未确认前不注销。
2. 确认后注销并进入 `/login`；取消 / Esc / 遮罩可安全关闭。
3. 请求进行中不可关闭弹窗，且按钮文案为「退出中…」。
4. 相关单元测试通过。

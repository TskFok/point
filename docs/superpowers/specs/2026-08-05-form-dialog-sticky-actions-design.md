# FormDialog 操作区固定底部

## 背景

管理端添加/编辑弹窗（`FormDialog`）内容过长时，保存等操作按钮在 `admin-form__actions` 内随表单一起滚动，用户需滚到底部才能提交。

目标：操作区固定在弹窗底部可视区域，字段区单独滚动。

## 决策摘要

| 项 | 选择 |
|----|------|
| 范围 | 题目、商品、AI 模型、AI 任务四个表单（凡嵌在 `FormDialog` 内的 `admin-form`） |
| 方案 | 表单内拆分「可滚动内容」+「固定操作区」（方案 C） |
| 不采用 | 仅 CSS `sticky`（嵌套 Card 易不稳）；`FormDialog` footer 槽（提交按钮离开 `<form>`，改动大） |
| 错误/成功提示 | 留在滚动区内（紧邻字段），不进操作区 |
| 范围外 | 确认弹窗、兑换弹窗、订单状态弹窗；非弹窗场景下的 `admin-form` |

## 布局

```
.form-dialog                    /* flex column, max-height, overflow hidden */
  .form-dialog__header          /* shrink 0 */
  .form-dialog__body            /* flex 1, min-height 0, overflow hidden */
    .admin-form-card            /* flex column, min-height 0, flex 1, overflow hidden */
      form.admin-form           /* flex column, min-height 0, flex 1, overflow hidden */
        .admin-form__scroll     /* flex 1, min-height 0, overflow auto — 字段/校验/成功 */
        .admin-form__actions    /* shrink 0 — 保存等按钮始终可见 */
```

## 实现要点

### CSS（`globals.css`）

- `.form-dialog`：确保为列 flex（已有），body 改为 `flex: 1; min-height: 0; overflow: hidden`（不再由 body 直接滚整表）
- 仅在弹窗内生效的选择器，例如 `.form-dialog__body .admin-form-card` / `.admin-form` / `.admin-form__scroll` / `.admin-form__actions`，避免影响非弹窗用法
- 操作区：`flex-shrink: 0`，顶部分割线 + 与卡片一致的背景，避免内容透过

### 表单 TSX

四个组件统一：

- `question-form.tsx`
- `product-form.tsx`
- `ai-model-form.tsx`
- `ai-task-form.tsx`

将 `admin-form__actions` 之外的表单内容包进 `<div className="admin-form__scroll">`；`ConfirmDialog` 等 portal 内容保持在 Card 内、滚动区外或现有位置即可（确认层不参与滚动布局）。

提交按钮仍为 `type="submit"`，留在同一 `<form>` 内。

### 测试

- 新增或扩展现有单测：断言 `admin-form__actions` 为 `admin-form__scroll` 的兄弟节点（不在滚动容器内）
- 覆盖至少一个表单（建议题目）+ FormDialog 冒烟；跑四个表单相关既有测试确保无回归

## 验收

1. 打开题目/商品/AI 模型/AI 任务的添加或编辑弹窗，拉长内容后操作按钮仍贴在弹窗底部可见
2. 仅中间字段区滚动；标题与关闭按钮不滚
3. 保存、校验失败、加载态行为与现网一致

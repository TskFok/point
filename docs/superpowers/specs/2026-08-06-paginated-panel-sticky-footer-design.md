# 分页固定底部（Paginated Panel）

**日期：** 2026-08-06  
**状态：** 已确认  

## 背景

管理端与学员端带分页的列表页中，分页控件跟在列表内容之后，整页滚动时会被顶出视口，翻页不便。

目标：分页始终贴在主内容区底部；仅列表/表格区域滚动，分页不随内容滑动。

## 非目标

- 合并 `Pagination` 与 `PaginationControls` 为单一组件（可后续做，本次只统一布局壳）
- 改分页 API / `page` / `pageSize` 行为
- 用 `position: fixed` 钉在视口（与学员底栏冲突）
- 仅 CSS `sticky`（短列表时无法始终贴底）

## 决策摘要

| 项 | 选择 |
|----|------|
| 范围 | 管理端 + 学员端所有带分页的列表页 |
| 方案 | flex 撑满 + 内容独立滚动 + 底栏分页（方案 B） |
| 壳类名 | `.paginated-panel` / `.paginated-panel__body` |
| 分页组件 | 继续用现有 `.pagination`（两端组件不变） |
| 无分页 | `totalPages <= 1` 仍不渲染分页（现状）；body 仍可滚 |
| 特殊页 | 积分页：仅「历史列表 + 分页」包进 panel；表单留在上方 |

## 覆盖页面

| 端 | 页面 | 列表容器 |
|----|------|----------|
| 管理 | 题库 | `admin-table-wrap` |
| 管理 | 商品 | `admin-product-grid` |
| 管理 | 订单 | `admin-table-wrap` |
| 管理 | AI 模型 | `admin-table-wrap` |
| 管理 | AI 任务 | 主任务表 `admin-table-wrap`（执行记录在弹窗内，不在本次范围） |
| 管理 | 积分倍率历史 | `config-history-list` |
| 学员 | 商城 | `product-grid` |
| 学员 | 错题 | `wrong-grid` |
| 学员 | 订单 | `order-list` |
| 学员 | 个人中心流水 | `ledger-list` |

加载中、错误、空列表：不强制包 panel；有非空列表的成功态才使用 panel。空态保持现有 `EmptyState`，不必为贴底引入空 panel。

题库页的批量工具条（`admin-batch-bar`）与筛选同属上方固定区，放在 `paginated-panel` 之外，不随表格滚动。

## 布局

```
section.admin-page | .student-page   /* 列 flex，min-height 撑满主内容区 */
  ├─ 页头 / 筛选 / 批量条 / 横幅（shrink 0，不滚）
  └─ .paginated-panel                /* flex: 1; min-height: 0; 列 flex */
       ├─ .paginated-panel__body     /* flex: 1; min-height: 0; overflow: auto */
       │    └─ 表格 / 卡片网格 / 列表
       └─ .pagination                /* shrink 0；无分页时不渲染 */
```

高度计算约定：

- `.admin-page` / `.student-page`：在带分页的页上通过 `min-height` 占满 `.app-content` 可用高度（扣 padding；管理端窄屏扣顶栏占位；学员端窄屏扣底栏占位）
- 不把整页 `overflow: hidden` 锁死到 body；滚动发生在 `__body` 内

## 实现要点

### CSS（`globals.css`）

- `.paginated-panel`：列 flex、`flex: 1`、`min-height: 0`
- `.paginated-panel__body`：`flex: 1`、`min-height: 0`、`overflow: auto`
- `.paginated-panel > .pagination`：`flex-shrink: 0`；顶部分割线 + `background: var(--surface-card)`（或等价表面色）；内边距替代原大 `margin-top`
- 学员端 `@media (max-width: 900px)`：panel 底部预留底栏 + `env(safe-area-inset-bottom)`，避免分页被挡
- 管理端窄屏：可用高度扣掉现有 `padding-top: 3.75rem` 的菜单按钮占位

### 页面 TSX

成功列表态将「列表容器 + Pagination」改为：

```tsx
<div className="paginated-panel">
  <div className="paginated-panel__body">{/* 原列表 */}</div>
  {meta ? (
    <Pagination /* 或 PaginationControls */ ... />
  ) : null}
</div>
```

`Pagination` / `PaginationControls` 实现与 `aria-label` / `aria-live` 不变。

### 测试

- 至少一个管理页 + 一个学员页单测：断言 `.pagination` 为 `.paginated-panel__body` 的兄弟节点（不在 body 内）
- 跑既有分页相关测试（`admin-pages`、`admin-questions-page`、`store`、`wrong-questions`、`student-pages` 等）确保无回归
- 不强制加视觉截图；布局以 DOM 结构断言为主

## 验收

1. 上述覆盖页：列表较长时，分页始终贴在主内容区底部可见；仅中间列表区滚动
2. 列表较短时，分页仍贴 panel 底（不悬在内容中间）
3. 学员窄屏：分页不被底部导航挡住，仍可点击翻页
4. 翻页、筛选、加载/错误/空态行为与现网一致
5. 无障碍：分页仍是文档流内的 `nav[aria-label="分页"]`

# 学生端删除 page-heading

**日期：** 2026-08-06  
**状态：** 已确认  
**关联：** 管理端已删除大块页头（`2026-08-06-admin-remove-page-heading-design.md`）；列表视口锁（`2026-08-06-list-page-viewport-lock-design.md`）。学生端侧栏已标明当前页与积分，正文大块 `.page-heading`（kicker + 标题 + 说明）冗余且挤占垂直空间。

## 决策摘要

| 项 | 选择 |
|----|------|
| 覆盖范围 | **A**：全部 7 个带 `.page-heading` 的学生页 |
| 商城「当前可用积分」卡 | **C**：本页不再单独展示；依赖侧栏积分 chip（及弹窗/商品卡内的余额逻辑） |
| 布局方案 | **1**：直接删除 heading；不抽学生 Toolbar；空 chrome 去掉；有 banner / summary 的保留 chrome |

## 非目标

- 不改侧栏积分 chip、兑换弹窗内余额文案、商品卡可兑校验逻辑
- 不抽 `StudentToolbar` / 新页头组件
- 不改管理端约定、组件与样式职责
- 不改筛选 / 分页 / 兑换 / 练习 / 预习业务行为
- 保留个人中心 `profile-summary`、错题重练 `wrong-practice__heading`、「积分明细」`section-heading`（这些不是 page-heading）

## 覆盖页面

| 页面 | 现况 | 改后 |
|------|------|------|
| `/learn` | 仅 heading | 删 heading；保留进度 hero 等正文 |
| `/learn/practice` | 仅 heading | 删 heading；保留 `PracticeSession` |
| `/learn/preview` | 仅 heading | 删 heading；保留 `PreviewSession` |
| `/learn/wrong-questions` | chrome 内 heading | 删 heading；空 chrome 删除；保留重练态 `wrong-practice__heading` |
| `/learn/store` | split + 余额卡 + focus | 删 heading 与 `.balance-card`；保留 chrome（成功 banner）；焦点改挂 chrome |
| `/learn/orders` | chrome 仅 heading | 删 heading；空 chrome 删除 |
| `/learn/profile` | chrome 内 heading + summary | 删 heading；保留 `profile-summary` 与「积分明细」`section-heading` |

## 布局

### 列表页

```
.list-page
  [.list-page__chrome]   /* 仅当仍有 banner / summary / section-heading 时保留 */
  列表 / 空态 / 会话 …
```

- **订单、错题**：去掉 heading 后 chrome 为空 → 删除整个 `list-page__chrome`。
- **商城**：保留 `list-page__chrome`，内仅成功 banner（无 heading / 余额卡）。
- **个人中心**：保留 chrome，内为 `profile-summary` +「积分明细」`section-heading`（有数据时）。

### 非列表页（首页 / 练习 / 预习）

直接删除 `.page-heading` 块，其余结构不变。

### 商城余额与焦点

- 移除页头 `.balance-card`；侧栏 `aria-label="当前积分 …"` 继续展示，并随 `publishPointBalance` 更新。
- 页面仍维护 `balance` 状态（兑换校验、`ProductCard`、`RedeemDialog` 需要），仅不再单独渲染余额卡。
- 兑换弹窗 `fallbackFocusRef`：原挂在 `.page-heading`；改为挂在可聚焦的 `list-page__chrome`（`tabIndex={-1}` + ref），与管理端焦点回落模式同类。

## 样式

- 学生端与管理端均无 `.page-heading` / `.page-heading--split` 引用后，清理 `globals.css` 对应规则。
- `.balance-card` 若仅商城页头使用且无其它引用，一并清理。

## 组件与约定

- 更新 `apps/web/AGENTS.md`，新增「学生页顶栏约定」：
  - 适用范围：`app/(student)/learn/**/page.tsx`
  - 禁止再引入 `.page-heading` / `.page-heading--split` / 商城页头 `.balance-card`
  - 当前页与积分由侧栏（及移动端导航）标明

## 测试

- `store.test.tsx`：去掉「存在 `.page-heading` / 页头标题 / `当前可用积分 …` 页头卡」断言；改为页面 **无** `.page-heading`、**无** `.balance-card`；兑换与余额不足等行为断言保留；焦点回落断言改为 chrome（或等价可聚焦节点）。
- `student-pages.test.tsx` 等：若断言 page-heading 文案则改为无 `.page-heading`；个人中心账户/余额、错题列表行为保持。
- 练习 / 预习相关测例以会话行为为主，仅在有 heading 断言时同步删除。

## 验收标准

1. 上述 7 页均无 `.page-heading`。
2. 商城无 `.balance-card`；兑换、余额校验、侧栏积分更新行为不变。
3. 订单 / 错题无空 chrome；商城 banner、个人中心 summary 仍在。
4. 相关单元测试通过；`AGENTS.md` 已更新。

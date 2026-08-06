# 管理端删除页头，动作/指标并入筛选行

**日期：** 2026-08-06  
**状态：** 已确认  
**关联：** 在 `2026-08-06-list-page-viewport-lock-design.md` 之上压缩顶部 chrome；侧栏已标明当前页面，大块 `AdminPageHeading`（kicker + 标题 + 说明 + 右侧槽）占用过多垂直空间且信息冗余。

## 背景

管理列表页顶部结构为：

1. `AdminPageHeading`（约 2–3 行文案 + 右侧 CTA 或指标）
2. `admin-filter-card`（筛选项 + 应用筛选）

页头对操作贡献低，却挤占列表视口。目标：删除页头，将原右侧槽位（主 CTA 或关键指标）并入筛选行（或等价单行 chrome）。

## 决策摘要

| 项 | 选择 |
|----|------|
| 覆盖范围 | **B**：所有带 `AdminPageHeading` 的管理页 |
| 指标（订单「当前结果」、积分「当前倍率」） | **A**：挪到筛选行 / chrome 行右侧 |
| 布局方案 | **1**：删 heading；动作/指标并入现有 `admin-filter-card`，不抽新 Toolbar 组件 |
| 学生端 page-heading | 不改 |

## 非目标

- 不改学生端任何 page-heading
- 不改筛选逻辑、URL 同步、分页、确认弹窗、表单弹窗
- 不抽通用 `AdminToolbar` 组件（YAGNI；若后续多页形态再分化再抽）
- 不改侧栏导航文案 / 路由标题策略以外的业务行为

## 覆盖页面

| 页面 | 原 heading 右侧 | 改后顶栏 |
|------|-----------------|----------|
| 题库 | CTA「添加题目」 | 筛选行末尾 CTA |
| 商品 | CTA「添加商品」 | 筛选行末尾 CTA |
| AI 模型 | CTA「添加模型」 | 筛选行末尾 CTA |
| AI 任务 | CTA「新建任务」 | 筛选行末尾 CTA |
| 订单 | Stat「当前结果」 | 筛选行末尾指标 |
| 积分倍率 | Stat「当前倍率」 | 单行 `admin-filter-card` 仅放指标（无筛选项） |
| 仪表盘 | 时区「今日口径 Asia/Shanghai」 | 单行 `admin-filter-card` 仅放时区信息 |

## 布局

### 有筛选的列表页

```
.list-page__chrome
  .admin-filter-card
    .admin-filter-grid
      [筛选项…]
      [应用筛选 / 筛选]   /* type=submit 或既有筛选按钮 */
      [主 CTA 或 Stat]    /* type=button；不触发筛选提交 */
  （可选）批量条 / banner
.paginated-panel …
```

行内顺序固定：筛选项 → 筛选按钮 → CTA/指标。窄屏沿用现有 `admin-filter-grid` 换行规则；CTA/指标跟在筛选按钮之后。

### 无筛选的管理页（积分、仪表盘）

```
（积分在 list-page__chrome 内 / 仪表盘在 admin-page 顶部）
  .admin-filter-card
    .admin-filter-grid   /* 或等价单行容器 */
      [Stat 或 时区信息]
```

视觉与筛选卡一致，避免第二套顶栏样式。

### CTA 与 form 提交

- 主 CTA 使用 `type="button"`，不得成为筛选 form 的默认 submit。
- 实现任选其一：放在 form 外但同属 filter card；或 form 内显式 `type="button"`。推荐 form 内末尾 + `type="button"`，保持单行 DOM 简单。

## 组件与约定

### 保留

- `AdminPageHeadingStat`（或等价轻量 Stat）：继续用于「当前结果 / 当前倍率」；样式需能在筛选行末尾正常显示（可复用 `.page-heading__stat` 或迁到中性 class，如 `.admin-filter-stat`）。
- `admin-filter-card` / `admin-filter-grid`：扩展为可容纳右侧 actions；必要时用 `margin-left: auto` 或 grid 末列把 CTA/指标顶到右侧。

### 删除或收缩

- 管理页全部移除 `AdminPageHeading` 用法。
- 若仓库内再无引用：删除 `AdminPageHeading` 组件及仅测该组件壳的用例；`AdminPageHeadingStat` 若仍用则保留并调整导出位置/命名（可不强行改名，以免无收益 diff）。
- 更新 `apps/web/AGENTS.md`「管理页页头约定」：
  - 禁止再引入大块 page-heading 作为管理列表顶栏
  - 主 CTA / 关键指标放在筛选行（或等价单行 chrome）右侧
  - 删除「不要把主 CTA 放进筛选区」的旧禁令

## 样式

- 优先复用现有 filter grid；仅在 CTA/指标与筛选项挤在一起时补少量 CSS（如 actions 右对齐、gap）。
- 仪表盘时区块可继续用 `.dashboard-timezone`，迁入 filter card 即可。
- 与视口锁规格兼容：`.list-page__chrome` 仍包裹顶栏；去掉 heading 后 chrome 更矮，列表可视区增大。

## 测试

- 凡断言 `.page-heading` / `page-heading--split` / `AdminPageHeading` 文案（kicker/标题/说明）出现在管理页的用例，改为：
  - 页面 **无** `.page-heading`
  - CTA 或指标文案仍可见，且位于 `.admin-filter-card` 内
- 更新：`admin-pages`、`admin-orders`、`admin-ai-tasks`、`admin-page-heading`、以及其它引用管理页 heading 的测试。
- 仪表盘：时区信息仍可见，无 page-heading。
- 不要求新增视觉回归截图；行为与 DOM 结构断言足够。

## 验收标准

1. 上述 7 个管理页均无 `AdminPageHeading` / `.page-heading`。
2. 原有主 CTA 均可从筛选行触发，行为不变。
3. 订单「当前结果」、积分「当前倍率」、仪表盘时区信息仍可见且在顶栏 chrome 内。
4. 筛选提交与 CTA 点击互不干扰。
5. 相关单元测试通过；`AGENTS.md` 约定已更新。

# 预习入口迁入学生导航

**日期：** 2026-08-06  
**状态：** 已确认  
**背景：** 「预习新题」目前只出现在学习首页 `action-grid` 卡片；桌面侧栏与移动底栏均无独立入口。用户要求将入口迁入导航（方案 1）。

## 决策摘要

| 项 | 选择 |
|----|------|
| 桌面侧栏 | 增加「预习」→ `/learn/preview`，插在「练习」之后 |
| 移动底栏 | 同步增加「预习」；底栏由 6 项扩为 7 项 |
| 学习首页卡片 | **删除**「预习新题」action 卡片（真正移动，非复制） |
| 导航文案 | 短标签「预习」（与「练习 / 错题」对齐） |

## 非目标

- 不改 `/learn/preview` 页内 `PreviewSession` 业务与样式
- 不改预习 API、积分逻辑
- 不新增右侧栏布局；沿用现有左侧 `app-sidebar` 与底部 `mobile-bottom-nav`
- 不调整「巩固错题」「看看积分奖励」等其余首页卡片语义（仅因删除预习卡片后网格少一格）

## 导航结构

### 桌面 `studentItems`

```
学习 → 练习 → 预习 → 错题 → 商城 → 订单
```

- `href`: `/learn/preview`
- `icon`: 与预习语义一致的 Lucide 图标（如 `BookMarked` / `Lightbulb`；实现时选一个未在同级导航重复的）
- 激活态：沿用现有规则（精确匹配，或非 `/learn` 时 `startsWith(`${href}/`)`）

### 移动 `studentMobileItems`

```
学习 → 练习 → 预习 → 错题 → 商城 → 订单 → 我的
```

- `MobileNav` 当前 `items.slice(0, 6)` 与 CSS `repeat(6, …)` 需改为容纳 **7** 项（去掉截断或改为 `slice(0, 7)`，并更新 grid）
- 窄屏可接受略挤；不为此隐藏「订单」或「我的」

## 学习首页

从 `apps/web/app/(student)/learn/page.tsx` 删除指向 `/learn/preview` 的「预习新题」`Link` + `action-card`。  
其余 hero / summary / 错题 / 商城入口不变。

## 样式

- `globals.css`：`.mobile-bottom-nav` 的 `grid-template-columns` 由 `repeat(6, …)` 改为 `repeat(7, …)`
- 若字号/间距因 7 列过挤，仅做最小必要微调（如略减 `font-size` / `gap`），不重做底栏视觉

## 测试

- `navigation.test.tsx`：
  - 桌面主导航链接数 **5 → 6**；断言含「预习」且 `href="/learn/preview"`
  - 移动导航链接数上限 **6 → 7**；断言含「预习」
  - `/learn/preview` 路径下桌面与移动「预习」均为 `aria-current="page"`
- `student-pages.test.tsx`：若依赖首页「预习新题」文案则删除或改为不出现
- Playwright `preview.spec.ts`：入口改为侧栏/底栏「预习」链接（不再依赖首页卡片）

## 验收标准

1. 桌面侧栏与移动底栏均可进入 `/learn/preview`，当前页高亮正确。
2. 学习首页不再展示「预习新题」卡片。
3. 移动底栏 7 项均可见，无被 `slice` 截断。
4. 相关单元测试与预习 E2E 通过。

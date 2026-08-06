# Student Preview Nav Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将「预习」入口从学习首页卡片迁入桌面侧栏与移动底栏，并让底栏容纳 7 项。

**Architecture:** 在 `StudentShell` 的 `studentItems` / `studentMobileItems` 中于「练习」后插入 `/learn/preview`；`MobileNav` 取消 6 项截断；CSS 底栏改为 7 列；首页删除预习 action 卡片；同步导航单测与 Playwright 入口。

**Tech Stack:** Next.js (`apps/web`)、Lucide React、Jest + Testing Library、Playwright、`globals.css`

**Spec:** `docs/superpowers/specs/2026-08-06-student-preview-nav-design.md`

## Global Constraints

- 桌面侧栏与移动底栏均增加「预习」→ `/learn/preview`，插在「练习」之后
- 导航短标签为「预习」；图标用 Lucide `BookMarked`（避免与 `BookOpen` / `BookOpenCheck` 重复）
- 学习首页删除「预习新题」action 卡片
- 移动底栏 7 项全部可见，不被 `slice(0, 6)` 截断；CSS `repeat(7, …)`
- 不改 `PreviewSession` 业务与预习 API
- 添加/修改须保证相关单元测试通过
- 未经用户明确要求不 `git commit` / 不 `git push`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/web/components/layout/student-shell.tsx` | 导航项插入「预习」 |
| `apps/web/components/layout/mobile-nav.tsx` | 取消 6 项截断 |
| `apps/web/app/globals.css` | 底栏 7 列 |
| `apps/web/app/(student)/learn/page.tsx` | 删除预习卡片 |
| `apps/web/tests/navigation.test.tsx` | 6 桌面入口 + 7 移动上限 + 预习激活 |
| `playwright/preview.spec.ts` | 从导航点「预习」进入 |

---

### Task 1: 导航测例先红

**Files:**
- Modify: `apps/web/tests/navigation.test.tsx`
- Test: `apps/web/tests/navigation.test.tsx`

**Interfaces:**
- Consumes: `StudentShell` 现有渲染
- Produces: 失败断言，驱动 Task 2–3

- [ ] **Step 1: 更新导航断言**

将「五个主入口」改为「六个主入口」，链接数 `5 → 6`，并断言预习：

```tsx
it("学员桌面端提供六个主入口且不暴露管理员菜单", () => {
  // ...
  expect(within(desktopNav).getAllByRole("link")).toHaveLength(6);
  expect(within(desktopNav).getByRole("link", { name: "预习" })).toHaveAttribute(
    "href",
    "/learn/preview",
  );
  // 保留练习 / 错题 / 个人中心 / 积分 / 退出等既有断言
});
```

移动导航上限改为 7，并增加路径激活测例：

```tsx
expect(within(mobileNav).getAllByRole("link").length).toBeLessThanOrEqual(7);

it("预习路径同时激活桌面和移动端入口", () => {
  mockUsePathname.mockReturnValue("/learn/preview");
  render(
    <StudentShell user={{ username: "learner_01", pointsBalance: 120 }}>
      <p>预习内容</p>
    </StudentShell>,
  );
  const desktopNav = screen.getByRole("navigation", { name: "学员主导航" });
  const mobileNav = screen.getByRole("navigation", { name: "学员移动导航" });
  expect(within(desktopNav).getByRole("link", { name: "预习" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(within(mobileNav).getByRole("link", { name: "预习" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(within(mobileNav).getAllByRole("link")).toHaveLength(7);
});
```

- [ ] **Step 2: 跑测确认失败**

Run: `cd apps/web && pnpm test -- tests/navigation.test.tsx`

Expected: FAIL（仍为 5 项 / 无「预习」链接）

---

### Task 2: StudentShell + MobileNav + CSS

**Files:**
- Modify: `apps/web/components/layout/student-shell.tsx`
- Modify: `apps/web/components/layout/mobile-nav.tsx`
- Modify: `apps/web/app/globals.css`（`.mobile-bottom-nav` 的 `grid-template-columns`）

**Interfaces:**
- Consumes: Task 1 失败测例
- Produces: 桌面 6 项、移动 7 项含「预习」

- [ ] **Step 1: 插入导航项**

在 `student-shell.tsx`：

```tsx
import {
  BookMarked,
  BookOpen,
  BookOpenCheck,
  // ...existing
} from "lucide-react";

const studentItems: NavigationItem[] = [
  { href: "/learn", icon: Sparkles, label: "学习" },
  { href: "/learn/practice", icon: BookOpen, label: "练习" },
  { href: "/learn/preview", icon: BookMarked, label: "预习" },
  { href: "/learn/wrong-questions", icon: BookOpenCheck, label: "错题" },
  { href: "/learn/store", icon: ShoppingBag, label: "商城" },
  { href: "/learn/orders", icon: ClipboardList, label: "订单" },
];
```

`studentMobileItems` 仍为 `[...studentItems, profile]`，自动含预习。

- [ ] **Step 2: MobileNav 渲染全部 items**

```tsx
{items.map((item) => {
```

删除 `items.slice(0, 6)`。

- [ ] **Step 3: CSS 7 列**

```css
.mobile-bottom-nav {
  /* ... */
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
```

若字号过挤，仅对 `.mobile-bottom-nav__link` 做最小 `font-size` 下调（可选，先跑测/肉眼再定）。

- [ ] **Step 4: 跑导航测例**

Run: `cd apps/web && pnpm test -- tests/navigation.test.tsx`

Expected: PASS

---

### Task 3: 首页去掉预习卡片 + E2E 入口

**Files:**
- Modify: `apps/web/app/(student)/learn/page.tsx`
- Modify: `playwright/preview.spec.ts`
- Test: `apps/web/tests/student-pages.test.tsx`（确认无需改；当前无「预习新题」断言）

**Interfaces:**
- Consumes: Task 2 导航「预习」链接
- Produces: 首页无预习卡片；E2E 从导航进入

- [ ] **Step 1: 删除首页预习卡片**

从 `learn/page.tsx` 的 `action-grid` 中删除整块：

```tsx
<Link href="/learn/preview">
  <Card className="action-card">
    <BookOpen aria-hidden="true" />
    <div>
      <h2>预习新题</h2>
      <p>先看题解学习，再答题赚积分</p>
    </div>
    <ArrowRight aria-hidden="true" />
  </Card>
</Link>
```

清理因此不再使用的 import（若 `BookOpen` 仍用于 summary-card「未回答」则保留）。

可选加固单测（非必须）：在 `student-pages.test.tsx` 的首页测例中加：

```tsx
expect(screen.queryByRole("heading", { name: "预习新题" })).toBeNull();
```

- [ ] **Step 2: 更新 Playwright**

```ts
await studentPage.goto("/learn");
await studentPage
  .getByRole("navigation", { name: "学员主导航" })
  .getByRole("link", { name: "预习" })
  .click();
await expect(studentPage).toHaveURL(/\/learn\/preview$/);
```

（若 E2E 默认移动视口，改用 `学员移动导航`。）

- [ ] **Step 3: 跑相关单测**

Run: `cd apps/web && pnpm test -- tests/navigation.test.tsx tests/student-pages.test.tsx`

Expected: PASS

- [ ] **Step 4: （可选）跑 Playwright 预习用例**

Run: `pnpm exec playwright test playwright/preview.spec.ts`（以仓库实际脚本为准）

Expected: PASS（需本地有测试环境时）

---

## Spec coverage (self-review)

| Spec 要求 | Task |
|-----------|------|
| 桌面侧栏加「预习」在练习后 | Task 2 |
| 移动底栏同步 + 7 项 | Task 2 |
| 首页删卡片 | Task 3 |
| CSS 7 列 / 取消 slice | Task 2 |
| 导航 + 激活测例 | Task 1–2 |
| Playwright 改入口 | Task 3 |

无 placeholder；图标锁定为 `BookMarked`。

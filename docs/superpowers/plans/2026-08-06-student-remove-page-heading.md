# Student Remove Page Heading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除学生端全部 `.page-heading`，商城去掉页头余额卡，释放列表与会话页垂直空间。

**Architecture:** 七页直接删除 `.page-heading`；商城移除 `.balance-card`，余额依赖侧栏 chip（页面仍维护 `balance` 状态供兑换逻辑）；兑换弹窗 `fallbackFocusRef` 改挂到 chrome 内可聚焦目标；订单/错题去掉变空的 `list-page__chrome`；同步 `AGENTS.md`、相关单测与无用 CSS。

**Tech Stack:** Next.js (`apps/web`)、React Testing Library、Jest、`globals.css`

**Spec:** `docs/superpowers/specs/2026-08-06-student-remove-page-heading-design.md`

## Global Constraints

- 覆盖：`/learn`、`/learn/practice`、`/learn/preview`、`/learn/wrong-questions`、`/learn/store`、`/learn/orders`、`/learn/profile`
- 商城本页不再渲染 `.balance-card`；侧栏积分 chip 为用户可见余额
- 保留：`profile-summary`、`wrong-practice__heading`、profile「积分明细」`section-heading`、首页 `summary-card` 内「当前积分」
- 不改兑换 / 分页 / 练习 / 预习业务逻辑；不抽学生 Toolbar
- 不改管理端页面与约定（除共享 CSS 清理时去掉已无引用的 `.page-heading*`）
- 添加/修改须保证相关单元测试通过
- 未经用户明确要求不 `git commit` / 不 `git push`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/web/AGENTS.md` | 新增「学生页顶栏约定」 |
| `apps/web/app/(student)/learn/store/page.tsx` | 删 heading + balance-card；焦点挂 chrome |
| `apps/web/app/(student)/learn/orders/page.tsx` | 删 heading；删空 chrome |
| `apps/web/app/(student)/learn/wrong-questions/page.tsx` | 删 heading；删空 chrome |
| `apps/web/app/(student)/learn/profile/page.tsx` | 删 heading；保留 summary |
| `apps/web/app/(student)/learn/page.tsx` | 删 heading |
| `apps/web/app/(student)/learn/practice/page.tsx` | 删 heading |
| `apps/web/app/(student)/learn/preview/page.tsx` | 删 heading |
| `apps/web/app/globals.css` | 清理无用 `.page-heading*` / `.balance-card` |
| `apps/web/tests/store.test.tsx` | 无 page-heading / balance-card；焦点断言 |
| `apps/web/tests/student-pages.test.tsx` | 首页/个人中心无 page-heading |
| `apps/web/tests/orders.test.tsx` | 无 page-heading / 无空 chrome |
| `apps/web/tests/wrong-questions.test.tsx` | 无 page-heading / 无空 chrome |
| `apps/web/tests/student-session-pages.test.tsx` | **新建**：练习/预习页无 page-heading |

**不改：** `StudentShell`、`RedeemDialog` API、`ProductCard`、管理端页面、`.page-kicker`（仍用于 section / wrong-practice / error 等）

---

### Task 1: AGENTS 约定 + 商城单测先红

**Files:**
- Modify: `apps/web/AGENTS.md`
- Modify: `apps/web/tests/store.test.tsx`
- Test: `apps/web/tests/store.test.tsx`

**Interfaces:**
- Consumes: 无
- Produces: 约定文案；商城测例期望 `.list-page-focus-target` 作为 `fallbackFocusRef` 节点；页面无 `.page-heading` / `.balance-card`

- [ ] **Step 1: 在 AGENTS.md「管理页顶栏约定」之后插入学生约定**

在 `# 确认弹窗失败约定` 之前插入：

```markdown
# 学生页顶栏约定

适用范围：`app/(student)/learn/**/page.tsx`。

侧栏 / 移动端导航标明当前页面与积分，正文不要再放冗余页头。

## 禁止

- 不要使用 `.page-heading` / `.page-heading--split`
- 不要在商城顶栏放 `.balance-card`（余额以侧栏积分为准；兑换校验仍用页面内 `balance` 状态）

## 允许保留

- 个人中心 `profile-summary`、错题重练 `wrong-practice__heading`、区块 `section-heading`
- 首页正文内的进度 / 摘要卡片（非 page-heading）
```

- [ ] **Step 2: 改写 store 测例中依赖页头 / 余额卡的断言**

在 `apps/web/tests/store.test.tsx`：

1. 「确认兑换…」成功用例：删除

```tsx
expect(screen.getByLabelText("当前可用积分 120")).toBeVisible();
```

保留「兑换成功，订单已生成」断言即可。

2. 「opener 不可用时将焦点移到稳定页面目标」：将 fallback 获取改为：

```tsx
const { container } = render(
  <StorePage api={api} initialBalance={200} />,
);
const fallback = container.querySelector<HTMLElement>(
  ".list-page-focus-target",
);
expect(fallback).not.toBeNull();
```

（替换原来的 `getByRole("heading", …).closest(".page-heading")`；`render` 若已存在则解构 `container`，不要双重 render。）

3. 「服务端发现积分变化…」：删除

```tsx
expect(
  await screen.findByLabelText("当前可用积分 50"),
).toBeVisible();
```

保留「还差 30 积分」与 dialog 关闭断言。另加：

```tsx
expect(screen.queryByLabelText(/当前可用积分/)).not.toBeInTheDocument();
```

4. 「商城分页在 paginated-panel…」：将

```tsx
expect(chrome?.querySelector(".page-heading")).not.toBeNull();
```

改为：

```tsx
expect(chrome?.querySelector(".page-heading")).toBeNull();
expect(chrome?.querySelector(".balance-card")).toBeNull();
expect(chrome?.querySelector(".list-page-focus-target")).not.toBeNull();
```

- [ ] **Step 3: 运行商城单测确认失败**

Run: `pnpm --filter @point-quest/web test -- store.test.tsx`

Expected: FAIL（仍存在 `.page-heading` / `.balance-card`，或缺 `.list-page-focus-target`）

- [ ] **Step 4: 实现商城页（本任务一并改页面，使测例变绿）**

将 `apps/web/app/(student)/learn/store/page.tsx` 的 return 顶栏改为：

```tsx
return (
  <section className="student-page list-page">
    <div className="list-page__chrome">
      <div
        className="list-page-focus-target"
        ref={fallbackFocusRef}
        tabIndex={-1}
      >
        {successMessage ? (
          <p className="success-banner" role="status">
            {successMessage}
          </p>
        ) : null}
      </div>
    </div>

    {/* 其余 loading / error / empty / paginated-panel / RedeemDialog 不变 */}
```

删除整个 `.page-heading.page-heading--split` 块（含 `.balance-card`）。若 `Sparkles` 仅用于余额卡，删除其 import。

保留：`balance` state、`publishPointBalance`、`ProductCard` 的 `balance`、`RedeemDialog` 的 `fallbackFocusRef={fallbackFocusRef}`。

- [ ] **Step 5: 再跑商城单测**

Run: `pnpm --filter @point-quest/web test -- store.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit（仅当用户明确要求时）**

```bash
git add apps/web/AGENTS.md \
  apps/web/app/\(student\)/learn/store/page.tsx \
  apps/web/tests/store.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): 学生商城移除页头与余额卡并固定焦点回落

EOF
)"
```

---

### Task 2: 订单与错题列表去 heading / 空 chrome

**Files:**
- Modify: `apps/web/app/(student)/learn/orders/page.tsx`
- Modify: `apps/web/app/(student)/learn/wrong-questions/page.tsx`
- Modify: `apps/web/tests/orders.test.tsx`
- Modify: `apps/web/tests/wrong-questions.test.tsx`
- Test: 上述两个测试文件

**Interfaces:**
- Consumes: Task 1 约定
- Produces: 两页无 `.page-heading`、无空 `.list-page__chrome`

- [ ] **Step 1: 在订单测例增加结构断言**

在 `apps/web/tests/orders.test.tsx` 任一已有成功渲染用例末尾（例如「三个订单状态…」在断言状态可见之后）追加：

```tsx
const { container } = render(<OrdersPage api={api} />);
// 若该用例已 render，改为解构既有 render 的 container，不要二次 render
await screen.findByText("待领取");
expect(container.querySelector(".page-heading")).toBeNull();
expect(container.querySelector(".list-page__chrome")).toBeNull();
```

推荐改「三个订单状态同时使用文字和可访问图标表达」为：

```tsx
const { container } = render(<OrdersPage api={api} />);
// …原有可见性断言…
expect(container.querySelector(".page-heading")).toBeNull();
expect(container.querySelector(".list-page__chrome")).toBeNull();
```

- [ ] **Step 2: 在错题测例增加结构断言**

在 `apps/web/tests/wrong-questions.test.tsx` 的空态用例（断言「暂时没有待练错题」的那个）中，解构 `container` 并追加：

```tsx
expect(container.querySelector(".page-heading")).toBeNull();
expect(container.querySelector(".list-page__chrome")).toBeNull();
```

重练态用例不要断言 chrome 为空以外的错误约束；可额外断言列表态无 page-heading。

- [ ] **Step 3: 跑测确认失败**

Run: `pnpm --filter @point-quest/web test -- orders.test.tsx wrong-questions.test.tsx`

Expected: FAIL（仍有 heading / chrome）

- [ ] **Step 4: 改订单页**

`apps/web/app/(student)/learn/orders/page.tsx` return 改为直接：

```tsx
return (
  <section className="student-page list-page">
    {loading ? (
      /* 原 loading */
    ) : error ? (
      /* 原 error */
    ) : orders.length === 0 ? (
      /* 原 EmptyState */
    ) : (
      /* 原 paginated-panel */
    )}
  </section>
);
```

删除整个 `<div className="list-page__chrome">…page-heading…</div>`。

- [ ] **Step 5: 改错题页**

`apps/web/app/(student)/learn/wrong-questions/page.tsx`：删除 `list-page__chrome` 及其内 `page-heading`。保留：

```tsx
<section className={selected ? "student-page" : "student-page list-page"}>
  {selected ? (
    <div className="wrong-practice">
      <div className="wrong-practice__heading">…</div>
      <PracticeSession … />
    </div>
  ) : loading ? (
    …
  ) : …}
</section>
```

- [ ] **Step 6: 再跑测**

Run: `pnpm --filter @point-quest/web test -- orders.test.tsx wrong-questions.test.tsx`

Expected: PASS

- [ ] **Step 7: Commit（仅当用户明确要求时）**

```bash
git add apps/web/app/\(student\)/learn/orders/page.tsx \
  apps/web/app/\(student\)/learn/wrong-questions/page.tsx \
  apps/web/tests/orders.test.tsx \
  apps/web/tests/wrong-questions.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): 学生订单与错题页移除 page-heading

EOF
)"
```

---

### Task 3: 首页、个人中心、练习、预习

**Files:**
- Modify: `apps/web/app/(student)/learn/page.tsx`
- Modify: `apps/web/app/(student)/learn/profile/page.tsx`
- Modify: `apps/web/app/(student)/learn/practice/page.tsx`
- Modify: `apps/web/app/(student)/learn/preview/page.tsx`
- Modify: `apps/web/tests/student-pages.test.tsx`
- Create: `apps/web/tests/student-session-pages.test.tsx`
- Test: `student-pages.test.tsx`、`student-session-pages.test.tsx`

**Interfaces:**
- Consumes: Task 1 约定
- Produces: 四页无 `.page-heading`；个人中心仍有账户/余额 summary

- [ ] **Step 1: 更新 student-pages 断言**

在「学习首页展示余额和三类学习进度」中：

```tsx
const { container } = render(<LearnPage api={api} />);
expect(await screen.findByText("160")).toBeVisible();
// …原有断言…
expect(container.querySelector(".page-heading")).toBeNull();
```

在「个人中心显示账户、余额与分页积分流水」中：

```tsx
const { container } = render(<ProfilePage api={api} />);
expect(await screen.findByText("learner")).toBeVisible();
expect(screen.getByText("当前余额 160 积分")).toBeVisible();
expect(container.querySelector(".page-heading")).toBeNull();
expect(container.querySelector(".profile-summary")).not.toBeNull();
```

- [ ] **Step 2: 新建练习/预习页结构测例**

创建 `apps/web/tests/student-session-pages.test.tsx`：

```tsx
import { render, screen } from "@testing-library/react";

import PracticePage from "@/app/(student)/learn/practice/page";
import PreviewPage from "@/app/(student)/learn/preview/page";

jest.mock("@/components/practice/practice-session", () => ({
  PracticeSession: () => <div data-testid="practice-session" />,
}));

jest.mock("@/components/preview/preview-session", () => ({
  PreviewSession: () => <div data-testid="preview-session" />,
}));

describe("学员练习与预习页顶栏", () => {
  it("随机练习页无 page-heading", () => {
    const { container } = render(<PracticePage />);
    expect(screen.getByTestId("practice-session")).toBeVisible();
    expect(container.querySelector(".page-heading")).toBeNull();
  });

  it("预习页无 page-heading", () => {
    const { container } = render(<PreviewPage />);
    expect(screen.getByTestId("preview-session")).toBeVisible();
    expect(container.querySelector(".page-heading")).toBeNull();
  });
});
```

- [ ] **Step 3: 跑测确认失败**

Run: `pnpm --filter @point-quest/web test -- student-pages.test.tsx student-session-pages.test.tsx`

Expected: FAIL（仍有 `.page-heading`）

- [ ] **Step 4: 删除四页 heading**

`learn/page.tsx`：删除 `.page-heading` 整块，保留 `<section className="student-page">` 与后续内容。

`profile/page.tsx`：删除 chrome 内 `.page-heading`，保留：

```tsx
<div className="list-page__chrome">
  {user && balance !== null ? (
    <>
      <div className="profile-summary">…</div>
      <div className="section-heading">…</div>
    </>
  ) : null}
</div>
```

`practice/page.tsx` / `preview/page.tsx` 改为：

```tsx
export default function PracticePage() {
  return (
    <section className="student-page">
      <PracticeSession />
    </section>
  );
}
```

（预习页同理用 `PreviewSession`。）

- [ ] **Step 5: 再跑测**

Run: `pnpm --filter @point-quest/web test -- student-pages.test.tsx student-session-pages.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit（仅当用户明确要求时）**

```bash
git add apps/web/app/\(student\)/learn/page.tsx \
  apps/web/app/\(student\)/learn/profile/page.tsx \
  apps/web/app/\(student\)/learn/practice/page.tsx \
  apps/web/app/\(student\)/learn/preview/page.tsx \
  apps/web/tests/student-pages.test.tsx \
  apps/web/tests/student-session-pages.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): 学生首页/个人中心/练习/预习移除 page-heading

EOF
)"
```

---

### Task 4: CSS 清理与全量回归

**Files:**
- Modify: `apps/web/app/globals.css`
- Verify: 全仓学生端 `.page-heading` / `.balance-card` 引用
- Test: 相关 web 单测

**Interfaces:**
- Consumes: Tasks 1–3
- Produces: 无残留学生页 heading；无用 CSS 已删

- [ ] **Step 1: 搜索残留**

Run:

```bash
rg "page-heading|balance-card" apps/web --glob '!**/globals.css'
```

Expected: 仅测试里的 **否定** 断言（`toBeNull` / `querySelector(".balance-card")`）或注释；无页面 JSX 再使用这些 class。

- [ ] **Step 2: 清理 globals.css**

删除或收缩：

1. 独立规则块：

```css
.page-heading h1 { … }
.page-heading > div > p:last-child { … }
```

2. 选择器列表中的 `.page-heading--split`：

```css
.page-heading--split,
.section-heading,
.wrong-practice__heading {
```

改为只保留：

```css
.section-heading,
.wrong-practice__heading {
```

并删除：

```css
.page-heading--split > div:first-child {
  min-width: 0;
}
```

3. 媒体查询中：

```css
.page-heading--split,
.wrong-practice__heading,
.async-error {
```

改为：

```css
.wrong-practice__heading,
.async-error {
```

4. 删除整个 `.balance-card` 规则块及其媒体查询内 `.balance-card { width: 100%; }`。

保留 `.page-kicker`（仍有其它用途）。

可选：为 `.list-page-focus-target` 不加视觉样式（与 admin focus target 一样，仅作焦点容器）；若需避免 outline 怪异，可不加 CSS。

- [ ] **Step 3: 跑相关测试套件**

Run:

```bash
pnpm --filter @point-quest/web test -- \
  store.test.tsx \
  orders.test.tsx \
  wrong-questions.test.tsx \
  student-pages.test.tsx \
  student-session-pages.test.tsx
```

Expected: 全部 PASS

- [ ] **Step 4: Commit（仅当用户明确要求时）**

```bash
git add apps/web/app/globals.css
git commit -m "$(cat <<'EOF'
refactor(web): 清理学生页头与余额卡无用样式

EOF
)"
```

---

## Spec coverage checklist

| Spec 项 | Task |
|---------|------|
| 7 页删 `.page-heading` | 1–3 |
| 商城无 `.balance-card`，侧栏为准 | 1 |
| 订单/错题删空 chrome | 2 |
| 商城保留 chrome + banner + 焦点 | 1 |
| 个人中心保留 summary / section-heading | 3 |
| 错题保留 `wrong-practice__heading` | 2 |
| AGENTS 学生约定 | 1 |
| CSS 清理 | 4 |
| 测试更新 | 1–4 |

## Self-review notes

- 无 TBD；焦点 class 固定为 `.list-page-focus-target`
- 练习/预习用 mock session 的薄测例覆盖「无 page-heading」，避免拉起完整会话
- Commit 步骤默认不执行，除非用户明确要求

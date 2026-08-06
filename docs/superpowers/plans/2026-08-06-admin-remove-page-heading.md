# Admin Remove Page Heading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除管理端全部 `AdminPageHeading`，将主 CTA / 关键指标并入筛选行（或等价单行 `admin-filter-card`），释放列表视口。

**Architecture:** 保留 `AdminPageHeadingStat`；删除 `AdminPageHeading`。有筛选页把 CTA/Stat 放进 `admin-filter-grid` 末尾（`type="button"`）。无筛选页（积分、仪表盘）用同一 `admin-filter-card` 单行只放指标/时区。订单弹窗焦点回落改挂到筛选卡可聚焦包装上。同步改 `AGENTS.md` 与相关单测。

**Tech Stack:** Next.js (`apps/web`)、React Testing Library、Jest、`globals.css`

**Spec:** `docs/superpowers/specs/2026-08-06-admin-remove-page-heading-design.md`

## Global Constraints

- 覆盖：题库、商品、订单、AI 模型、AI 任务、积分倍率、仪表盘（全部原用 `AdminPageHeading` 的管理页）
- 学生端 page-heading **不改**
- 不改筛选逻辑、URL 同步、分页、确认/表单弹窗业务行为
- 不抽 `AdminToolbar` 组件
- CTA 必须 `type="button"`，不得误触发筛选 submit
- 添加功能须补单元测试；修改相关既有测试必须通过
- 未经用户明确要求不 `git commit` / 不 `git push`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/web/components/admin/admin-page-heading.tsx` | 删除 `AdminPageHeading`；仅保留 `AdminPageHeadingStat` |
| `apps/web/AGENTS.md` | 重写「管理页页头约定」→ 筛选行 chrome 约定 |
| `apps/web/app/globals.css` | filter grid 增加末尾 action/stat 列；必要时压缩 stat 在筛选行的内边距 |
| `apps/web/app/(admin)/admin/questions/page.tsx` | 删 heading；CTA 进筛选行 |
| `apps/web/app/(admin)/admin/products/page.tsx` | 同上 |
| `apps/web/app/(admin)/admin/ai-models/page.tsx` | 同上 |
| `apps/web/app/(admin)/admin/ai-tasks/page.tsx` | 同上 |
| `apps/web/app/(admin)/admin/orders/page.tsx` | 删 heading；Stat 进筛选行；焦点回落改挂筛选包装 |
| `apps/web/app/(admin)/admin/points/page.tsx` | 删 heading；单行 filter-card 放倍率 Stat |
| `apps/web/app/(admin)/admin/page.tsx` | 删 heading；单行 filter-card 放时区 |
| `apps/web/tests/admin-page-heading.test.tsx` | 只测 Stat（或改名为 stat 测试） |
| `apps/web/tests/admin-pages.test.tsx` | chrome / 积分 / 仪表盘断言 |
| `apps/web/tests/admin-ai-tasks-page.test.tsx` | 新建任务在 filter-card |
| `apps/web/tests/admin-orders.test.tsx` | 焦点回落目标更新 |

**不改：** 学生端页面、`store.test.tsx` 中学员 page-heading 断言、弹窗组件 API（仅换 orders 的 `fallbackFocusRef` 指向）

---

### Task 1: 收缩组件 + 更新 AGENTS 约定

**Files:**
- Modify: `apps/web/components/admin/admin-page-heading.tsx`
- Modify: `apps/web/tests/admin-page-heading.test.tsx`
- Modify: `apps/web/AGENTS.md`
- Test: `apps/web/tests/admin-page-heading.test.tsx`

**Interfaces:**
- Consumes: 无
- Produces: `export function AdminPageHeadingStat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode })` — class 仍为 `.page-heading__stat`（本任务不强制改名）

- [ ] **Step 1: 改写组件单测为只测 Stat**

将 `apps/web/tests/admin-page-heading.test.tsx` 替换为：

```tsx
import { render, screen } from "@testing-library/react";
import { ClipboardList } from "lucide-react";

import { AdminPageHeadingStat } from "@/components/admin/admin-page-heading";

describe("AdminPageHeadingStat", () => {
  it("渲染图标、标签与数值", () => {
    const { container } = render(
      <AdminPageHeadingStat
        icon={<ClipboardList aria-hidden="true" />}
        label="当前结果"
        value={12}
      />,
    );

    const stat = container.querySelector(".page-heading__stat");
    expect(stat).not.toBeNull();
    expect(screen.getByText("当前结果")).toBeVisible();
    expect(screen.getByText("12")).toBeVisible();
  });
});
```

- [ ] **Step 2: 运行单测确认失败（仍导出/依赖 AdminPageHeading 或旧用例路径）**

Run: `pnpm --filter @point-quest/web test -- admin-page-heading.test.tsx`

Expected: 若已改测但组件仍导出旧 API 则可能 PASS；若测试文件仍 import `AdminPageHeading` 而你尚未改文件则会 FAIL。本步以「新测试文件已就位」为准；下一步删掉 `AdminPageHeading` 后全仓会暂时红（后续任务修页面）。

- [ ] **Step 3: 删除 AdminPageHeading，仅保留 Stat**

将 `apps/web/components/admin/admin-page-heading.tsx` 改为：

```tsx
import type { ReactNode } from "react";

type AdminPageHeadingStatProps = {
  icon: ReactNode;
  label: string;
  value: ReactNode;
};

export function AdminPageHeadingStat({
  icon,
  label,
  value,
}: AdminPageHeadingStatProps) {
  return (
    <div className="page-heading__stat">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
```

- [ ] **Step 4: 重写 AGENTS.md 管理页顶栏约定**

把 `# 管理页页头约定` 整节替换为：

```markdown
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
```

（保留文件中其后的「确认弹窗失败约定」不动。）

- [ ] **Step 5: 跑 Stat 单测**

Run: `pnpm --filter @point-quest/web test -- admin-page-heading.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit（仅当用户明确要求时）**

```bash
git add apps/web/components/admin/admin-page-heading.tsx \
  apps/web/tests/admin-page-heading.test.tsx apps/web/AGENTS.md
git commit -m "$(cat <<'EOF'
refactor(web): 管理端移除 AdminPageHeading，保留 Stat 与顶栏约定

EOF
)"
```

---

### Task 2: Filter grid 容纳末尾 CTA/Stat 的样式

**Files:**
- Modify: `apps/web/app/globals.css`（`.admin-filter-grid`、`.admin-filter-grid--orders` 及相关 media query）

**Interfaces:**
- Consumes: 无
- Produces: 筛选行可容纳「筛选项 + 筛选按钮 + CTA/Stat」而不把 Stat 压成异常窄列；窄屏仍换行

- [ ] **Step 1: 扩展 grid 列定义**

在 `globals.css` 中把：

```css
.admin-filter-grid {
  display: grid;
  grid-template-columns: minmax(15rem, 2fr) minmax(10rem, 1fr) auto;
  align-items: end;
  gap: 0.75rem;
}

.admin-filter-grid--orders {
  grid-template-columns: repeat(5, minmax(9rem, 1fr)) auto;
}
```

改为：

```css
.admin-filter-grid {
  display: grid;
  grid-template-columns: minmax(15rem, 2fr) minmax(10rem, 1fr) auto auto;
  align-items: end;
  gap: 0.75rem;
}

.admin-filter-grid--orders {
  grid-template-columns: repeat(5, minmax(9rem, 1fr)) auto auto;
}

.admin-filter-grid--chrome-only {
  grid-template-columns: auto;
  justify-content: end;
}
```

在 `@media (max-width: 820px)` 中，现有规则已让 `.pq-button` 全宽；为 Stat 增加：

```css
.admin-filter-grid > .page-heading__stat,
.admin-filter-grid--orders > .page-heading__stat,
.admin-filter-grid--chrome-only > .page-heading__stat,
.admin-filter-grid--chrome-only > .dashboard-timezone {
  width: 100%;
  min-width: 0;
}
```

（若现有 media 块已有 `.admin-filter-grid > .pq-button`，紧挨其后追加上述规则。）

可选：略减筛选行内 Stat 的 padding，避免顶栏过高：

```css
.admin-filter-card .page-heading__stat,
.admin-filter-card .dashboard-timezone {
  padding: 0.55rem 0.85rem;
  min-width: 10rem;
  box-shadow: none;
}
```

- [ ] **Step 2: 目测 / 无独立单测** — 本任务无 Jest 断言；在 Task 3+ 页面落地后由页面测试覆盖 DOM。若担心回归，可先跳过 commit。

- [ ] **Step 3: Commit（仅当用户明确要求时）**

```bash
git add apps/web/app/globals.css
git commit -m "$(cat <<'EOF'
style(web): 筛选行支持末尾 CTA/指标列

EOF
)"
```

---

### Task 3: 题库 + 商品 — CTA 并入筛选行

**Files:**
- Modify: `apps/web/app/(admin)/admin/questions/page.tsx`
- Modify: `apps/web/app/(admin)/admin/products/page.tsx`
- Modify: `apps/web/tests/admin-pages.test.tsx`
- Test: `apps/web/tests/admin-pages.test.tsx`

**Interfaces:**
- Consumes: `AdminPageHeadingStat` 不需要；仅 `Button` + `Plus`
- Produces: 筛选 form 末尾 CTA；页面无 `.page-heading`

- [ ] **Step 1: 更新 chrome 结构断言（先写失败期望）**

在 `admin-pages.test.tsx` 中，把题库视口锁用例里的：

```tsx
expect(chrome?.querySelector(".page-heading")).not.toBeNull();
expect(chrome?.querySelector(".admin-filter-card")).not.toBeNull();
```

改为：

```tsx
expect(chrome?.querySelector(".page-heading")).toBeNull();
expect(chrome?.querySelector(".admin-filter-card")).not.toBeNull();
const filterCard = chrome?.querySelector(".admin-filter-card") as HTMLElement;
expect(
  within(filterCard).getByRole("button", { name: "添加题目" }),
).toBeVisible();
```

（确保文件顶部已 `import { within } from "@testing-library/react"`；若已有则复用。）

另增（或改现有商品相关用例）一条商品断言：渲染商品页后，

```tsx
expect(container.querySelector(".page-heading")).toBeNull();
expect(
  within(container.querySelector(".admin-filter-card") as HTMLElement).getByRole(
    "button",
    { name: "添加商品" },
  ),
).toBeVisible();
```

可挂在已有商品列表渲染用例末尾，避免重复 mock。

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter @point-quest/web test -- admin-pages.test.tsx -t "paginated-panel|添加"`

Expected: FAIL — `.page-heading` 仍存在，或 filter-card 内无「添加题目」

- [ ] **Step 3: 改 questions/page.tsx**

1. 删除 `AdminPageHeading` import 与 JSX 整块。
2. 在筛选 form 内、「应用筛选」按钮之后追加：

```tsx
<Button
  onClick={() => setEditing("create")}
  type="button"
>
  <Plus aria-hidden="true" />
  添加题目
</Button>
```

保留原有 `Plus` import；若 `AdminPageHeading` 是唯一使用者则去掉其 import。

- [ ] **Step 4: 改 products/page.tsx** — 同样删除 heading，在「应用筛选」后追加：

```tsx
<Button onClick={() => setEditing("create")} type="button">
  <Plus aria-hidden="true" />
  添加商品
</Button>
```

- [ ] **Step 5: 跑测**

Run: `pnpm --filter @point-quest/web test -- admin-pages.test.tsx`

Expected: 与本题库/商品相关的用例 PASS（积分/仪表盘用例若仍依赖 heading 会 FAIL，留给 Task 6）

- [ ] **Step 6: Commit（仅当用户明确要求时）**

```bash
git add apps/web/app/\(admin\)/admin/questions/page.tsx \
  apps/web/app/\(admin\)/admin/products/page.tsx \
  apps/web/tests/admin-pages.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): 题库与商品将添加按钮并入筛选行并移除页头

EOF
)"
```

---

### Task 4: AI 模型 + AI 任务 — CTA 并入筛选行

**Files:**
- Modify: `apps/web/app/(admin)/admin/ai-models/page.tsx`
- Modify: `apps/web/app/(admin)/admin/ai-tasks/page.tsx`
- Modify: `apps/web/tests/admin-ai-tasks-page.test.tsx`
- Modify: `apps/web/tests/admin-ai-models-page.test.tsx`（可选加强断言）
- Test: `apps/web/tests/admin-ai-tasks-page.test.tsx`、`admin-ai-models-page.test.tsx`

**Interfaces:**
- Consumes: Task 2 grid 样式
- Produces: 「添加模型」「新建任务」位于 `.admin-filter-card`

- [ ] **Step 1: 改写 AI 任务页头用例**

将 `admin-ai-tasks-page.test.tsx` 中：

```tsx
it("新建任务按钮在页头右上角，点击打开表单弹窗", async () => {
  ...
  const heading = container.querySelector(".page-heading--split");
  expect(heading).not.toBeNull();
  const createButton = within(heading as HTMLElement).getByRole("button", {
    name: "新建任务",
  });
```

改为：

```tsx
it("新建任务按钮在筛选行，点击打开表单弹窗", async () => {
  const user = userEvent.setup();
  const { container } = render(<AdminAiTasksPage api={createApi()} />);

  await screen.findByText("每日词汇");
  expect(container.querySelector(".page-heading")).toBeNull();
  const filterCard = container.querySelector(".admin-filter-card");
  expect(filterCard).not.toBeNull();
  const createButton = within(filterCard as HTMLElement).getByRole("button", {
    name: "新建任务",
  });
  await user.click(createButton);

  expect(
    await screen.findByRole("dialog", { name: "新建 AI 任务" }),
  ).toBeVisible();
});
```

在 `admin-ai-models-page.test.tsx` 的「点击添加模型」用例中追加：

```tsx
expect(container.querySelector(".page-heading")).toBeNull();
expect(
  within(container.querySelector(".admin-filter-card") as HTMLElement).getByRole(
    "button",
    { name: "添加模型" },
  ),
).toBeVisible();
```

（需解构 `const { container } = render(...)`，并确保 `within` 已导入。）

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter @point-quest/web test -- admin-ai-tasks-page.test.tsx admin-ai-models-page.test.tsx`

Expected: FAIL（按钮仍在 heading 或 heading 仍存在）

- [ ] **Step 3: 改 ai-models/page.tsx 与 ai-tasks/page.tsx**

两页均：删除 `AdminPageHeading` 块与 import；在筛选区「应用筛选」/「筛选」按钮后加入对应 CTA（`type="button"`），逻辑与原 onClick 一致。

AI 任务示例：

```tsx
<Button
  onClick={() => {
    setEditing("create");
    setActionMessage(null);
  }}
  type="button"
>
  <Plus aria-hidden="true" />
  新建任务
</Button>
```

注意：ai-tasks 当前筛选区是 `<div className="admin-filter-grid">` 而非 form——CTA 直接作为同级子节点即可。

- [ ] **Step 4: 跑测**

Run: `pnpm --filter @point-quest/web test -- admin-ai-tasks-page.test.tsx admin-ai-models-page.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit（仅当用户明确要求时）**

```bash
git add apps/web/app/\(admin\)/admin/ai-models/page.tsx \
  apps/web/app/\(admin\)/admin/ai-tasks/page.tsx \
  apps/web/tests/admin-ai-tasks-page.test.tsx \
  apps/web/tests/admin-ai-models-page.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): AI 模型与任务将创建按钮并入筛选行

EOF
)"
```

---

### Task 5: 订单 — Stat 进筛选行 + 焦点回落

**Files:**
- Modify: `apps/web/app/(admin)/admin/orders/page.tsx`
- Modify: `apps/web/tests/admin-orders.test.tsx`
- Test: `apps/web/tests/admin-orders.test.tsx`

**Interfaces:**
- Consumes: `AdminPageHeadingStat`；`fallbackFocusRef: RefObject<HTMLElement | null>`
- Produces: 筛选卡可聚焦包装（`tabIndex={-1}`）作为弹窗关闭后焦点回落点

- [ ] **Step 1: 改焦点回落断言**

将 `admin-orders.test.tsx` 中：

```tsx
const fallback = screen
  .getByRole("heading", { name: "订单管理" })
  .closest<HTMLElement>(".page-heading");
expect(opener).not.toBeInTheDocument();
await waitFor(() => expect(fallback).toHaveFocus());
```

改为：

```tsx
const fallback = container.querySelector(
  ".admin-filter-focus-target",
) as HTMLElement | null;
expect(fallback).not.toBeNull();
expect(opener).not.toBeInTheDocument();
await waitFor(() => expect(fallback).toHaveFocus());
```

该用例的 `render` 需保留 `const { container } = render(...)`（若尚无则补上）。同时可断言：

```tsx
expect(container.querySelector(".page-heading")).toBeNull();
expect(
  within(container.querySelector(".admin-filter-card") as HTMLElement).getByText(
    "当前结果",
  ),
).toBeVisible();
```

（可放在首次成功加载列表的用例或本用例开头。）

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter @point-quest/web test -- admin-orders.test.tsx`

Expected: FAIL（找不到 `.admin-filter-focus-target` 或仍有 heading）

- [ ] **Step 3: 改 orders/page.tsx**

1. 删除 `AdminPageHeading` import（保留 `AdminPageHeadingStat`）。
2. 用可聚焦包装替换 heading：

```tsx
<div
  className="admin-filter-focus-target"
  ref={fallbackFocusRef}
  tabIndex={-1}
>
  <Card className="admin-filter-card">
    <form
      className="admin-filter-grid admin-filter-grid--orders"
      onSubmit={(event) => {
        event.preventDefault();
        applyFilters();
      }}
    >
      {/* 既有筛选项与「应用筛选」按钮保持不变 */}
      <AdminPageHeadingStat
        icon={<ClipboardList aria-hidden="true" />}
        label="当前结果"
        value={meta?.total ?? "—"}
      />
    </form>
  </Card>
</div>
```

3. `OrderStatusDialog` 的 `fallbackFocusRef={fallbackFocusRef}` 保持不变。

- [ ] **Step 4: 跑测**

Run: `pnpm --filter @point-quest/web test -- admin-orders.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit（仅当用户明确要求时）**

```bash
git add apps/web/app/\(admin\)/admin/orders/page.tsx \
  apps/web/tests/admin-orders.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): 订单页移除页头，指标并入筛选行并保留焦点回落

EOF
)"
```

---

### Task 6: 积分 + 仪表盘 — 单行 chrome

**Files:**
- Modify: `apps/web/app/(admin)/admin/points/page.tsx`
- Modify: `apps/web/app/(admin)/admin/page.tsx`
- Modify: `apps/web/tests/admin-pages.test.tsx`
- Test: `apps/web/tests/admin-pages.test.tsx`

**Interfaces:**
- Consumes: `AdminPageHeadingStat`；`.admin-filter-grid--chrome-only`
- Produces: 无 `.page-heading`；倍率/时区在 `.admin-filter-card` 内

- [ ] **Step 1: 改积分页头用例**

将 `admin-pages.test.tsx` 中 `页头使用 page-heading--split 并展示当前倍率` 改为：

```tsx
it("筛选 chrome 展示当前倍率且无 page-heading", async () => {
  const config = {
    createdAt: "2026-07-31T08:00:00.000Z",
    id: "config-1",
    multiplier: 2,
    updatedBy: "admin-1",
    updater: { id: "admin-1", username: "admin" },
  };
  const api = {
    getAdminPointConfig: jest.fn().mockResolvedValue(config),
    listAdminPointConfigHistory: jest.fn().mockResolvedValue({
      data: [config],
      meta,
    }),
    updateAdminPointConfig: jest.fn(),
  };
  const { container } = render(<AdminPointsPage api={api} />);

  expect(container.querySelector(".page-heading")).toBeNull();
  const filterCard = container.querySelector(".admin-filter-card");
  expect(filterCard).not.toBeNull();
  expect(
    await within(filterCard as HTMLElement).findByText("2×"),
  ).toBeVisible();
  expect(within(filterCard as HTMLElement).getByText("当前倍率")).toBeVisible();
});
```

在「概览显示四项真实运营指标」用例末尾追加：

```tsx
expect(container.querySelector(".page-heading")).toBeNull();
expect(screen.getByText("今日口径")).toBeVisible();
expect(screen.getByText("Asia/Shanghai")).toBeVisible();
expect(
  container.querySelector(".admin-filter-card .dashboard-timezone"),
).not.toBeNull();
```

（该用例需 `const { container } = render(...)`。）

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter @point-quest/web test -- admin-pages.test.tsx -t "当前倍率|概览显示"`

Expected: FAIL

- [ ] **Step 3: 改 points/page.tsx**

删除 `AdminPageHeading`，在 `list-page__chrome` 顶部加入：

```tsx
<Card className="admin-filter-card">
  <div className="admin-filter-grid admin-filter-grid--chrome-only">
    <AdminPageHeadingStat
      icon={<Gauge aria-hidden="true" />}
      label="当前倍率"
      value={current ? `${current.multiplier}×` : "—"}
    />
  </div>
</Card>
```

保留其后的 `PointConfigForm` / 历史区。import 只留 `AdminPageHeadingStat`。

- [ ] **Step 4: 改 admin/page.tsx（仪表盘）**

删除 `AdminPageHeading`，改为：

```tsx
<Card className="admin-filter-card">
  <div className="admin-filter-grid admin-filter-grid--chrome-only">
    <div className="dashboard-timezone">
      <CircleGauge aria-hidden="true" />
      <span>今日口径</span>
      <strong>Asia/Shanghai</strong>
    </div>
  </div>
</Card>
```

删除对 `AdminPageHeading` 的 import；保留其余 dashboard 逻辑。

- [ ] **Step 5: 跑测**

Run: `pnpm --filter @point-quest/web test -- admin-pages.test.tsx`

Expected: PASS（含 Task 3 改过的 chrome 断言）

- [ ] **Step 6: Commit（仅当用户明确要求时）**

```bash
git add apps/web/app/\(admin\)/admin/points/page.tsx \
  apps/web/app/\(admin\)/admin/page.tsx \
  apps/web/tests/admin-pages.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): 积分与仪表盘用单行 filter chrome 替代页头

EOF
)"
```

---

### Task 7: 全量回归与引用清扫

**Files:**
- Verify: 全仓 `AdminPageHeading` / 管理端 `.page-heading` 引用
- Test: 相关 web 单测

**Interfaces:**
- Consumes: Tasks 1–6
- Produces: 无残留管理端 `AdminPageHeading` import；相关测试绿

- [ ] **Step 1: 搜索残留**

Run:

```bash
rg "AdminPageHeading[^S]|AdminPageHeading$|page-heading--split" apps/web --glob '!**/globals.css'
```

Expected: 管理端 page/test 无 `AdminPageHeading`（非 Stat）引用；学生端 `page-heading` 可保留。`admin-page-heading.tsx` 仅含 Stat。

- [ ] **Step 2: 跑相关测试套件**

Run:

```bash
pnpm --filter @point-quest/web test -- \
  admin-page-heading.test.tsx \
  admin-pages.test.tsx \
  admin-orders.test.tsx \
  admin-ai-tasks-page.test.tsx \
  admin-ai-models-page.test.tsx \
  admin-questions-page.test.tsx \
  admin-products-page.test.tsx
```

Expected: 全部 PASS

- [ ] **Step 3: Commit（仅当用户明确要求时；若前序未提交可一次提交全部）**

```bash
git add apps/web
git commit -m "$(cat <<'EOF'
feat(web): 管理端删除页头并将 CTA/指标并入筛选行

EOF
)"
```

---

## Self-Review

1. **Spec coverage:** 7 页覆盖（Task 3–6）；组件/AGENTS（Task 1）；样式（Task 2）；测试与验收（各 Task + Task 7）；学生端未改；CTA `type="button"` 已写明；订单焦点回落有专门任务。
2. **Placeholders:** 无 TBD/TODO；步骤含具体代码与命令。
3. **Type consistency:** `AdminPageHeadingStat` props 与现有一致；焦点包装 class 固定为 `.admin-filter-focus-target`；chrome-only grid class 为 `.admin-filter-grid--chrome-only`。

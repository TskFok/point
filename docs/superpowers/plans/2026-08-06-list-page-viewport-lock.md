# List Page Viewport Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 列表页视口高度锁：页头+筛选固定视口顶，分页钉视口底（学员小屏在 MobileNav 上方），仅列表内容区滚动。

**Architecture:** 在已有 `.paginated-panel` 之上，将 `app-shell` → `app-workspace` → `app-content` → `admin-page`/`student-page` 锁为 `100dvh` flex 高度链；用 `.list-page__chrome` 包裹顶部固定区（heading / 筛选 / 批量条 / banner / 特殊页摘要）。唯一 `overflow: auto` 在 `.paginated-panel__body`。无 panel 的页面允许 page 自身滚动。

**Tech Stack:** Next.js (`apps/web`)、React Testing Library、Jest、`globals.css`

**Spec:** `docs/superpowers/specs/2026-08-06-list-page-viewport-lock-design.md`

## Global Constraints

- 范围：管理端题库/商品/订单/AI 模型/AI 任务/积分历史 + 学员端商城/错题/订单/个人中心流水
- 顶部 chrome class：`.list-page__chrome`；列表壳沿用 `.paginated-panel` / `.paginated-panel__body`
- 不用 `position: fixed` 钉分页；不用整页 `position: sticky` 代替高度锁
- 不合并 / 不改 `Pagination` 与 `PaginationControls` API
- 空态 / 加载 / 错误：不强制包 panel
- 无分页页（学习首页、练习、预览、管理概览）：不套 chrome 钉底；page `overflow: auto`
- 添加功能须补单元测试；修改相关既有测试必须通过
- 未经用户明确要求不 `git commit` / 不 `git push`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/web/app/globals.css` | 视口高度链、`.list-page__chrome`、无 panel 时 page 可滚、学员底栏 `--student-bottom-nav-space` |
| `apps/web/app/(admin)/admin/questions/page.tsx` | chrome 包装 heading/筛选/批量条/banner |
| `apps/web/app/(admin)/admin/products/page.tsx` | chrome 包装 |
| `apps/web/app/(admin)/admin/orders/page.tsx` | chrome 包装 |
| `apps/web/app/(admin)/admin/ai-models/page.tsx` | chrome 包装 |
| `apps/web/app/(admin)/admin/ai-tasks/page.tsx` | chrome 包装（执行记录弹窗不动） |
| `apps/web/app/(admin)/admin/points/page.tsx` | chrome 含 heading + 表单 + 分区标题 |
| `apps/web/app/(student)/learn/store/page.tsx` | chrome 包装 |
| `apps/web/app/(student)/learn/wrong-questions/page.tsx` | chrome 包装 |
| `apps/web/app/(student)/learn/orders/page.tsx` | chrome 包装 |
| `apps/web/app/(student)/learn/profile/page.tsx` | chrome 含 heading + 摘要 + 分区标题 |
| `apps/web/tests/admin-pages.test.tsx` | 题库 chrome + 结构断言 |
| `apps/web/tests/store.test.tsx` | 商城 chrome + 结构断言 |

**不改：** `components/data/pagination.tsx`、`components/pagination-controls.tsx`、auth 页、shell 组件 TSX（仅 CSS）

---

### Task 1: Failing structure tests (chrome + scroll isolation)

**Files:**
- Modify: `apps/web/tests/admin-pages.test.tsx`
- Modify: `apps/web/tests/store.test.tsx`

**Interfaces:**
- Produces: 断言存在 `.list-page__chrome`；heading / 筛选在 chrome 内；chrome 与分页均非 `.paginated-panel__body` 子孙
- Consumes: 既有「分页在 panel 底栏」用例与 fixture（`totalPages >= 2`）

- [ ] **Step 1: Extend admin questions structure test**

找到 `admin-pages.test.tsx` 中已有用例 `题库分页在 paginated-panel 底栏且不在滚动体内`，在其断言末尾追加（不要删原有断言）：

```tsx
    const chrome = container.querySelector(".list-page__chrome");
    expect(chrome).not.toBeNull();
    expect(chrome?.querySelector(".page-heading")).not.toBeNull();
    expect(chrome?.querySelector(".admin-filter-card")).not.toBeNull();
    expect(body?.contains(chrome as Node)).toBe(false);
    expect(chrome?.contains(nav as Node)).toBe(false);
```

变量 `body` / `nav` / `container` 复用该用例已有查询结果。

- [ ] **Step 2: Extend store structure test**

找到 `store.test.tsx` 中已有用例 `商城分页在 paginated-panel 底栏且不在滚动体内`，追加：

```tsx
    const chrome = container.querySelector(".list-page__chrome");
    expect(chrome).not.toBeNull();
    expect(chrome?.querySelector(".page-heading")).not.toBeNull();
    expect(body?.contains(chrome as Node)).toBe(false);
    expect(chrome?.contains(nav as Node)).toBe(false);
```

- [ ] **Step 3: Run tests — expect FAIL**

Run:

```bash
cd apps/web && npm test -- --testPathPattern='admin-pages|store' --testNamePattern='分页在 paginated-panel'
```

Expected: FAIL（找不到 `.list-page__chrome`）

- [ ] **Step 4: Stop** — 先红灯；实现在后续 Task（未经用户要求不 commit）

---

### Task 2: CSS viewport height chain + chrome + mobile nav space

**Files:**
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces: shell/workspace/content/page 高度锁；`.list-page__chrome`；无 panel 时 page `overflow: auto`；`--student-bottom-nav-space`
- Consumes: 既有 `.paginated-panel*`、`.admin-page`、`.student-page`、学员 `@media (max-width: 900px)`

- [ ] **Step 1: Lock shell height chain**

更新（或替换等价规则）为：

```css
.app-shell {
  display: flex;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--surface-page);
}

.app-workspace {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  margin-left: 16.5rem;
  overflow: hidden;
}

.app-content {
  display: flex;
  width: min(100%, 92rem);
  min-height: 0;
  flex: 1;
  flex-direction: column;
  margin-inline: auto;
  padding: clamp(1.25rem, 3vw, 2.5rem);
  overflow: hidden;
}
```

注意：保留 `.app-sidebar` 的 `position: fixed` 与宽度；若原 `.app-shell` 无 `display: flex`，workspace 仍靠 `margin-left` 让出侧栏，shell 本身可不把 sidebar 当 flex 子项参与宽度计算——**侧栏仍 fixed，workspace 仍 `margin-left: 16.5rem`**。若加 `display: flex` 导致 workspace 被挤窄，则 **不要** 让 fixed sidebar 成为 flex item 的宽度参与者：保持 shell 为块级容器 + workspace 全宽减 margin，仅对 shell/workspace/content 设 height/overflow。

推荐更稳妥写法（避免 flex 与 fixed sidebar 打架）：

```css
.app-shell {
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--surface-page);
}

.app-workspace {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  margin-left: 16.5rem;
  overflow: hidden;
}

.app-content {
  display: flex;
  width: min(100%, 92rem);
  min-height: 0;
  flex: 1;
  flex-direction: column;
  margin-inline: auto;
  padding: clamp(1.25rem, 3vw, 2.5rem);
  overflow: hidden;
}
```

- [ ] **Step 2: Update page + chrome rules**

替换/扩展：

```css
.student-page,
.admin-page {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: clamp(1.25rem, 2.4vw, 2rem);
  width: min(100%, 92rem);
  margin-inline: auto;
  overflow: auto;
}

.student-page:has(.paginated-panel),
.admin-page:has(.paginated-panel) {
  overflow: hidden;
}

.list-page__chrome {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  gap: inherit;
}
```

说明：

- 有 `paginated-panel` 时 page `overflow: hidden`，滚动只在 `__body`
- 无 panel 时 page `overflow: auto`（首页/练习/概览）
- 若项目目标浏览器不支持 `:has()`，改为给列表页 section 增加修饰 class `list-page`（`admin-page list-page`），用 `.list-page { overflow: hidden }` 代替 `:has`。**优先检查现有 browserslist / 实际用法；若不明确，用修饰 class `list-page`，避免 `:has` 风险。**

采用修饰 class 时：

```css
.student-page,
.admin-page {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: clamp(1.25rem, 2.4vw, 2rem);
  width: min(100%, 92rem);
  margin-inline: auto;
  overflow: auto;
}

.admin-page.list-page,
.student-page.list-page {
  overflow: hidden;
}

.list-page__chrome {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  gap: inherit;
}
```

后续页面 TSX：列表页写 `className="admin-page list-page"` / `className="student-page list-page"`。

合并原 `.admin-page` 的 `min-height: calc(100vh - 5rem)` 与 `.student-page` 同类规则——高度改由 flex 链提供，删除会与 `height: 100dvh` 冲突的纯 `min-height: calc(100vh - …)` 撑开逻辑（窄屏 media 里同类 min-height 一并删或改为依赖 flex）。

保留既有：

```css
.paginated-panel { /* flex: 1; min-height: 0; column */ }
.paginated-panel__body { /* overflow: auto */ }
.paginated-panel > .pagination { /* flex-shrink: 0 */ }
```

- [ ] **Step 3: Student mobile bottom nav space**

在 `@media (max-width: 900px)` 内，用变量统一避让，避免 content padding 与分页 padding 双重叠加导致「分页悬空」或仍被挡：

```css
@media (max-width: 900px) {
  .app-shell--student {
    --student-bottom-nav-space: calc(5.6rem + env(safe-area-inset-bottom));
  }

  .app-shell--student .app-content {
    padding-bottom: 1rem; /* 内容区不再用大 padding 顶整页；改由 panel 底预留 */
  }

  .app-shell--student .list-page .paginated-panel {
    padding-bottom: var(--student-bottom-nav-space);
  }

  .app-shell--student .paginated-panel > .pagination {
    padding-bottom: 0.75rem; /* 安全区已计入 --student-bottom-nav-space */
  }

  /* 无 list-page 的学员页仍需底栏避让 */
  .app-shell--student .student-page:not(.list-page) {
    padding-bottom: var(--student-bottom-nav-space);
  }
}
```

`--student-bottom-nav-space` 数值按现有底栏 `min-height: 4.4rem` + 外边距约 `0.6rem` + safe-area 估算；实现后目视确认分页贴在导航上方。若原 `padding-bottom: 6.5rem` 仍被其它非 list 页依赖，保留对非 list 页的等价避让（见上 `:not(.list-page)`）。

管理端窄屏继续保留 `.app-shell--admin .app-content { padding-top: 3.75rem; }`；删除或改写依赖旧 `min-height: calc(100vh - 5rem - 2.5rem)` 的 `.admin-page` 规则，改为 flex 填满。

- [ ] **Step 4: Manual sanity（可选）** — 本地打开题库与商城，确认无整页滚动条、仅列表滚。自动化仍靠 Task 1 结构测试。

- [ ] **Step 5: Stop** — 未经用户要求不 commit

---

### Task 3: Wrap admin list pages with chrome + list-page

**Files:**
- Modify: `apps/web/app/(admin)/admin/questions/page.tsx`
- Modify: `apps/web/app/(admin)/admin/products/page.tsx`
- Modify: `apps/web/app/(admin)/admin/orders/page.tsx`
- Modify: `apps/web/app/(admin)/admin/ai-models/page.tsx`
- Modify: `apps/web/app/(admin)/admin/ai-tasks/page.tsx`
- Modify: `apps/web/app/(admin)/admin/points/page.tsx`

**Interfaces:**
- Consumes: `.list-page` / `.list-page__chrome` CSS from Task 2
- Produces: 管理端列表页 DOM 符合 spec 布局；弹窗仍在 section 内、chrome/panel 旁

- [ ] **Step 1: Questions page**

将 `section` 改为 `className="admin-page list-page"`。用 chrome 包裹：`AdminPageHeading`、筛选 `Card.admin-filter-card`、成功/错误 banner、批量条（若有）。**不要**把 `QuestionFormDialog` / `ConfirmDialog` 放进 chrome。

结构示意：

```tsx
<section className="admin-page list-page">
  <div className="list-page__chrome">
    <AdminPageHeading …>…</AdminPageHeading>
    <Card className="admin-filter-card">…</Card>
    {actionMessage ? <p className="success-banner" …>…</p> : null}
    {mutationError ? <p className="admin-form__errors" …>…</p> : null}
    {/* 批量条若在列表上方，放这里 */}
  </div>

  {editing ? <QuestionFormDialog … /> : null}
  {confirmAction ? <ConfirmDialog … /> : null}

  {loading ? (
    <Card className="page-loading" …>…</Card>
  ) : loadError ? (
    <AsyncError … />
  ) : questions.length === 0 ? (
    <EmptyState … />
  ) : (
    <div className="paginated-panel">
      <div className="paginated-panel__body">
        {/* 若批量条当前在表格上方且属固定区，已移入 chrome；此处仅表格 */}
        <div className="admin-table-wrap">…</div>
      </div>
      {meta ? <Pagination … /> : null}
    </div>
  )}
</section>
```

以文件实际 JSX 为准：批量条若目前在 `paginated-panel` 外、筛选下，移入 chrome；保持「不在 `__body` 内」。

- [ ] **Step 2: Products / orders / ai-models / ai-tasks**

同样模式：`admin-page list-page` + `list-page__chrome`（heading、筛选、banner）+ 既有 `paginated-panel`。弹窗不进 chrome。AI 任务执行记录弹窗范围不变。

- [ ] **Step 3: Points page**

```tsx
<section className="admin-page list-page">
  <div className="list-page__chrome">
    <AdminPageHeading …>…</AdminPageHeading>
    {/* loading/error for initial current 可留在 chrome 外或内；成功态： */}
    <PointConfigForm … />
    <div className="admin-section-heading">…</div>
  </div>
  {/* history loading inline / empty / paginated-panel 历史列表 */}
</section>
```

仅 `config-history-list` + 分页在 panel 内。

- [ ] **Step 4: Run admin structure test**

```bash
cd apps/web && npm test -- --testPathPattern=admin-pages --testNamePattern='题库分页在 paginated-panel'
```

Expected: PASS

- [ ] **Step 5: Run broader admin regression**

```bash
cd apps/web && npm test -- --testPathPattern='admin-pages|admin-questions-page|admin-products-page|admin-orders|admin-ai-models|admin-ai-tasks'
```

Expected: PASS（修复因 DOM 包裹导致的 query 失败时，优先改测试选择器为仍语义化的 role/label，或在 chrome 内查找）

- [ ] **Step 6: Stop** — 未经用户要求不 commit

---

### Task 4: Wrap student list pages with chrome + list-page

**Files:**
- Modify: `apps/web/app/(student)/learn/store/page.tsx`
- Modify: `apps/web/app/(student)/learn/wrong-questions/page.tsx`
- Modify: `apps/web/app/(student)/learn/orders/page.tsx`
- Modify: `apps/web/app/(student)/learn/profile/page.tsx`

**Interfaces:**
- Consumes: 同 Task 2 CSS
- Produces: 学员列表页 DOM 符合 spec

- [ ] **Step 1: Store page**

```tsx
<section className="student-page list-page">
  <div className="list-page__chrome">
    <div className="page-heading page-heading--split" …>…</div>
    {successMessage ? <p className="success-banner" …>…</p> : null}
  </div>
  {loading ? … : loadError ? … : products.length === 0 ? (
    <EmptyState … />
  ) : (
    <div className="paginated-panel">…</div>
  )}
  {redemption ? <RedeemDialog … /> : null}
</section>
```

- [ ] **Step 2: Wrong-questions + orders**

`student-page list-page` + chrome（heading）+ 既有 panel。

- [ ] **Step 3: Profile page**

```tsx
<section className="student-page list-page">
  <div className="list-page__chrome">
    <div className="page-heading">…</div>
    {/* 成功态账户摘要 + section-heading 进 chrome */}
    <div className="profile-summary">…</div>
    <div className="section-heading">…</div>
  </div>
  {/* empty / paginated ledger */}
</section>
```

加载/错误可在 chrome 外占满剩余区。仅 `ledger-list` + 分页在 panel。

- [ ] **Step 4: Run store structure test**

```bash
cd apps/web && npm test -- --testPathPattern=store --testNamePattern='商城分页在 paginated-panel'
```

Expected: PASS

- [ ] **Step 5: Student regression**

```bash
cd apps/web && npm test -- --testPathPattern='store|wrong-questions|student-pages|orders'
```

Expected: PASS

- [ ] **Step 6: Stop** — 未经用户要求不 commit

---

### Task 5: Full regression + acceptance checklist

**Files:**
- 无新文件（必要时微调 CSS/测试）

**Interfaces:**
- Consumes: Tasks 1–4 全部交付物

- [ ] **Step 1: Run combined targeted tests**

```bash
cd apps/web && npm test -- --testPathPattern='admin-pages|store|admin-questions-page|admin-products-page|admin-orders|admin-ai|wrong-questions|student-pages|orders'
```

Expected: 全部 PASS

- [ ] **Step 2: Acceptance checklist（对照 spec）**

手动或逻辑确认：

1. 列表长：头+筛选钉顶，分页钉底，仅 `__body` 滚  
2. 列表短：分页仍在 panel 底  
3. 学员 ≤900px：分页在 MobileNav 上方可点  
4. `/learn`、`/learn/practice`、`/admin`：整页可滚，未被锁死  
5. 翻页/筛选/空态/加载行为不变；`nav[aria-label="分页"]` 仍在  

- [ ] **Step 3: Report to user** — 列出改动文件与测试结果；**询问是否 commit**（默认不 commit）

---

## Self-Review (plan vs spec)

| Spec 要求 | Task |
|-----------|------|
| 视口高度锁 shell→content→page | Task 2 |
| `.list-page__chrome` 固定顶栏（含筛选/批量/banner） | Task 3–4 |
| `.paginated-panel` 仅列表滚 + 分页钉底 | 已有 + Task 2 校准 |
| 学员小屏分页在 MobileNav 上方 | Task 2 Step 3 |
| 全覆盖列表页 | Task 3–4 |
| 积分/个人中心特殊 chrome | Task 3 Step 3 / Task 4 Step 3 |
| 无分页页可滚 | Task 2 `overflow: auto` + 无 `list-page` |
| 结构测试题库+商城 | Task 1 + 3/4 变绿 |
| 不改分页 API / 不用 fixed 分页 | Global Constraints |
| 单元测试与回归 | Task 1, 3–5 |

Placeholder scan: 无 TBD；`:has` 已给出 `list-page` 修饰 class 兜底并定为推荐路径。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-06-list-page-viewport-lock.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — 每个 Task 派一个新子代理，Task 间人工审查  
2. **Inline Execution** — 本会话按 executing-plans 连续执行，设检查点  

Which approach?

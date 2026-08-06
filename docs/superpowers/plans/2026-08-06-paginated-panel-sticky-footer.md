# Paginated Panel Sticky Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让管理端与学员端所有带分页的列表页中，分页始终贴在主内容区底部，仅列表区域滚动。

**Architecture:** 用 `.paginated-panel`（列 flex）包住「可滚 body + 底栏 `.pagination`」；`.admin-page` / `.student-page` 改为列 flex 并 `min-height` 撑满主内容区，使 panel 能 `flex: 1` 占满剩余高度。不改分页组件逻辑与 API。

**Tech Stack:** Next.js (`apps/web`)、React Testing Library、Jest、`globals.css`

## Global Constraints

- 范围：管理端题库/商品/订单/AI 模型/AI 任务/积分历史 + 学员端商城/错题/订单/个人中心流水
- 壳类名：`.paginated-panel` / `.paginated-panel__body`；分页继续用 `.pagination`
- 无分页（`totalPages <= 1`）：组件仍返回 `null`，不渲染底栏
- 空态 / 加载 / 错误：不强制包 panel
- 题库批量条、筛选、页头：在 panel 外
- 积分页：仅历史列表 + 分页进 panel
- 添加功能须补单元测试；相关既有测试必须通过
- 未经用户要求不 commit

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/web/app/globals.css` | page 撑满高度、`paginated-panel` 布局、移动端底栏避让、分页底栏样式 |
| `apps/web/app/(admin)/admin/questions/page.tsx` | 表格 + 分页包进 panel |
| `apps/web/app/(admin)/admin/products/page.tsx` | 商品网格 + 分页 |
| `apps/web/app/(admin)/admin/orders/page.tsx` | 订单表 + 分页 |
| `apps/web/app/(admin)/admin/ai-models/page.tsx` | 模型表 + 分页 |
| `apps/web/app/(admin)/admin/ai-tasks/page.tsx` | 任务表 + 分页（执行记录弹窗不动） |
| `apps/web/app/(admin)/admin/points/page.tsx` | 历史列表 + 分页 |
| `apps/web/app/(student)/learn/store/page.tsx` | 商品网格 + 分页 |
| `apps/web/app/(student)/learn/wrong-questions/page.tsx` | 错题网格 + 分页 |
| `apps/web/app/(student)/learn/orders/page.tsx` | 订单列表 + 分页 |
| `apps/web/app/(student)/learn/profile/page.tsx` | 流水列表 + 分页 |
| `apps/web/tests/admin-pages.test.tsx` | 管理端结构断言 |
| `apps/web/tests/store.test.tsx` | 学员端结构断言 |
| 既有分页相关测试 | 回归 |

**不改：** `components/data/pagination.tsx`、`components/pagination-controls.tsx`（除非测试发现必须改 class）

---

### Task 1: Failing structure test (admin questions)

**Files:**
- Modify: `apps/web/tests/admin-pages.test.tsx`
- Modify later: `apps/web/app/(admin)/admin/questions/page.tsx`

**Interfaces:**
- Produces: 断言 `nav[aria-label="分页"]` 在 `.paginated-panel` 内、且不在 `.paginated-panel__body` 内；表格在 body 内
- Consumes: 列表返回 `meta.totalPages >= 2` 才会渲染分页

- [ ] **Step 1: Write the failing test**

在 `admin-pages.test.tsx` 的题库相关用例附近新增（可复用已有 `listAdminQuestions` mock，保证 `totalPages: 2`）：

```tsx
it("题库分页在 paginated-panel 底栏且不在滚动体内", async () => {
  const { container } = render(
    <AdminQuestionsPage
      api={{
        createAdminQuestion: jest.fn(),
        batchAdminQuestions: jest.fn(),
        deleteAdminQuestion: jest.fn(),
        getAdminQuestion: jest.fn(),
        listAdminQuestions: jest.fn().mockResolvedValue({
          data: [
            {
              /* 至少 1 条题目，字段对齐现有 fixture */
            },
          ],
          meta: { page: 1, pageSize: 20, total: 21, totalPages: 2 },
        }),
        updateAdminQuestion: jest.fn(),
      }}
    />,
  );

  await screen.findByRole("navigation", { name: "分页" });

  const panel = container.querySelector(".paginated-panel");
  const body = panel?.querySelector(":scope > .paginated-panel__body");
  const nav = panel?.querySelector(':scope > nav[aria-label="分页"]');
  expect(panel).not.toBeNull();
  expect(body).not.toBeNull();
  expect(nav).not.toBeNull();
  expect(body?.contains(nav as Node)).toBe(false);
  expect(body?.querySelector(".admin-table-wrap")).not.toBeNull();
});
```

题目 fixture 字段从同文件已有用例复制，勿手写残缺对象。

- [ ] **Step 2: Run test — expect FAIL**

Run:

```bash
cd apps/web && npm test -- --testPathPattern=admin-pages --testNamePattern="题库分页在 paginated-panel"
```

Expected: FAIL（找不到 `.paginated-panel`）

- [ ] **Step 3: Do not implement yet**（TDD：先红灯；实现在 Task 3）

---

### Task 2: CSS for fill height + paginated-panel

**Files:**
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces: `.paginated-panel`、`.paginated-panel__body`、`.paginated-panel > .pagination` 规则；`.admin-page` / `.student-page` 列 flex + 可用高度

- [ ] **Step 1: Update `.admin-page` and `.student-page`**

将现有 grid 改为列 flex（保留 gap），并撑满主内容区：

```css
.admin-page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: min(100%, 92rem);
  margin-inline: auto;
  min-height: calc(100vh - 5rem);
}

.student-page {
  display: flex;
  flex-direction: column;
  gap: clamp(1.25rem, 2.4vw, 2rem);
  min-height: calc(100vh - 5rem);
}
```

若现有 `.admin-page` / `.student-page` 另有属性，合并保留，不要删掉无关规则。

- [ ] **Step 2: Add paginated-panel rules**（放在 `.pagination` 规则附近或 Admin 区块）

```css
.paginated-panel {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 0;
}

.paginated-panel__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.paginated-panel > .pagination {
  flex-shrink: 0;
  margin-top: 0;
  border-top: 1px solid var(--color-border);
  padding: 0.75rem 0.5rem;
  background: var(--surface-card);
}
```

- [ ] **Step 3: Mobile student bottom-nav clearance**

在现有 `@media (max-width: 900px)`（含 `.mobile-bottom-nav`）内增加：

```css
.app-shell--student .paginated-panel > .pagination {
  padding-bottom: calc(0.75rem + 5.5rem + env(safe-area-inset-bottom));
}
```

数值与现有 `padding-bottom: 6.5rem` 的 `.app-shell--student .app-content` 对齐意图：分页可点、不被底栏挡住。若视觉重复留白过大，可改为只在 panel 上留 `padding-bottom: calc(5.5rem + env(safe-area-inset-bottom))` 并相应减小 content 的额外底距——以「分页可见可点」为准，避免双倍空白。

- [ ] **Step 4: Admin narrow top offset**

在现有 `@media (max-width: 1100px)`（或定义 `.admin-menu-button` 的断点）内，若 `.app-shell--admin .app-content` 已有 `padding-top: 3.75rem`，则：

```css
.app-shell--admin .admin-page {
  min-height: calc(100vh - 5rem - 2.5rem);
}
```

微调以页面不出现无意义双滚动条为准。

- [ ] **Step 5: Do not commit**（除非用户要求）

---

### Task 3: Wrap admin questions page (make Task 1 pass)

**Files:**
- Modify: `apps/web/app/(admin)/admin/questions/page.tsx`
- Test: `apps/web/tests/admin-pages.test.tsx`

**Interfaces:**
- Consumes: Task 2 CSS classes
- Produces: 题库成功列表态 DOM 符合 Task 1 断言；批量条仍在 panel 外

- [ ] **Step 1: Wrap table + Pagination**

将成功态中类似：

```tsx
<>
  <div className="admin-table-wrap">...</div>
  {meta ? <Pagination ... /> : null}
</>
```

改为：

```tsx
<div className="paginated-panel">
  <div className="paginated-panel__body">
    <div className="admin-table-wrap">...</div>
  </div>
  {meta ? (
    <Pagination
      disabled={loading}
      onPageChange={setPage}
      page={meta.page}
      totalPages={meta.totalPages}
    />
  ) : null}
</div>
```

保持：`AdminPageHeading`、筛选 Card、`admin-batch-bar`、成功/错误横幅、loading/error/empty 在 panel 外。

- [ ] **Step 2: Run Task 1 test — expect PASS**

```bash
cd apps/web && npm test -- --testPathPattern=admin-pages --testNamePattern="题库分页在 paginated-panel"
```

- [ ] **Step 3: Run related questions tests**

```bash
cd apps/web && npm test -- --testPathPattern="admin-pages|admin-questions-page"
```

Expected: PASS

- [ ] **Step 4: Do not commit**（除非用户要求）

---

### Task 4: Wrap remaining admin list pages

**Files:**
- Modify: `apps/web/app/(admin)/admin/products/page.tsx`
- Modify: `apps/web/app/(admin)/admin/orders/page.tsx`
- Modify: `apps/web/app/(admin)/admin/ai-models/page.tsx`
- Modify: `apps/web/app/(admin)/admin/ai-tasks/page.tsx`
- Modify: `apps/web/app/(admin)/admin/points/page.tsx`

**Interfaces:**
- Consumes: 同 Task 3 的 panel 结构
- Produces: 所有管理端带分页列表使用相同 DOM 约定

- [ ] **Step 1: products**

成功网格态：

```tsx
<div className="paginated-panel">
  <div className="paginated-panel__body">
    <div className="admin-product-grid">...</div>
  </div>
  {meta ? <Pagination ... /> : null}
</div>
```

- [ ] **Step 2: orders / ai-models**

与题库相同：`admin-table-wrap` 进 `__body`，`Pagination` 为 panel 直接子节点。

- [ ] **Step 3: ai-tasks**

当前分页在表格条件块外。改为仅在 `tasks.length > 0` 时：

```tsx
{!loading && !error && tasks.length > 0 ? (
  <div className="paginated-panel">
    <div className="paginated-panel__body">
      <div className="admin-table-wrap">...</div>
    </div>
    {meta ? (
      <Pagination
        disabled={loading}
        onPageChange={setPage}
        page={meta.page}
        totalPages={meta.totalPages}
      />
    ) : null}
  </div>
) : null}
```

删除原先落在 section 末尾、表格外的那份 `<Pagination />`。执行记录 `FormDialog` 不动。

- [ ] **Step 4: points**

仅包历史：

```tsx
<div className="paginated-panel">
  <div className="paginated-panel__body">
    <div className="config-history-list">...</div>
  </div>
  {meta ? <Pagination ... /> : null}
</div>
```

`PointConfigForm`、section heading、empty/loading 留在 panel 外。

- [ ] **Step 5: Run admin page tests**

```bash
cd apps/web && npm test -- --testPathPattern="admin-pages|admin-products-page|admin-orders|admin-ai-models-page|admin-ai-tasks-page"
```

Expected: PASS

- [ ] **Step 6: Do not commit**（除非用户要求）

---

### Task 5: Student pages + structure test

**Files:**
- Modify: `apps/web/app/(student)/learn/store/page.tsx`
- Modify: `apps/web/app/(student)/learn/wrong-questions/page.tsx`
- Modify: `apps/web/app/(student)/learn/orders/page.tsx`
- Modify: `apps/web/app/(student)/learn/profile/page.tsx`
- Modify: `apps/web/tests/store.test.tsx`

**Interfaces:**
- Consumes: 同 panel 结构；学员用 `PaginationControls`（仍是 `.pagination`）
- Produces: 学员列表页结构断言 + 回归绿

- [ ] **Step 1: Write failing student structure test**

在 `store.test.tsx` 已有双页用例附近增加，或扩展现有翻页用例末尾：

```tsx
it("商城分页在 paginated-panel 底栏且不在滚动体内", async () => {
  const { container } = render(
    <StorePage
      api={
        {
          /* 复用能返回 totalPages: 2 的现有 mock 写法 */
        } as never
      }
    />,
  );

  await screen.findByRole("navigation", { name: "分页" });

  const panel = container.querySelector(".paginated-panel");
  const body = panel?.querySelector(":scope > .paginated-panel__body");
  const nav = panel?.querySelector(':scope > nav[aria-label="分页"]');
  expect(body?.contains(nav as Node)).toBe(false);
  expect(body?.querySelector(".product-grid")).not.toBeNull();
});
```

Mock 与 fixture 从同文件「下一页」用例复制。

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/web && npm test -- --testPathPattern=store --testNamePattern="商城分页在 paginated-panel"
```

- [ ] **Step 3: Wrap store / wrong-questions / orders**

模式：

```tsx
<div className="paginated-panel">
  <div className="paginated-panel__body">
    <div className="product-grid">{/* 或 wrong-grid / order-list */}</div>
  </div>
  {meta ? <PaginationControls ... /> : null}
</div>
```

仅包非空列表成功态。

- [ ] **Step 4: Wrap profile ledger**

当 `ledger.length > 0`：

```tsx
<div className="paginated-panel">
  <div className="paginated-panel__body">
    <Card className="ledger-list">...</Card>
  </div>
  {meta ? <PaginationControls ... /> : null}
</div>
```

空态仍用 `EmptyState`，不包 panel；原先空态旁的独立 `PaginationControls`：若仅在有流水时需要翻页，移入 panel；空态不再渲染分页（与「空态不强制 panel」一致）。若现有逻辑依赖空态仍显示分页，保留空态下的分页但不包 panel。

- [ ] **Step 5: Run student tests — expect PASS**

```bash
cd apps/web && npm test -- --testPathPattern="store|wrong-questions|student-pages"
```

Expected: PASS

- [ ] **Step 6: Do not commit**（除非用户要求）

---

### Task 6: Full regression + manual checklist

**Files:**
- 无新文件；验证全部相关测试

- [ ] **Step 1: Run web unit tests for all touched areas**

```bash
cd apps/web && npm test -- --testPathPattern="admin-pages|admin-questions-page|admin-products-page|admin-orders|admin-ai-models-page|admin-ai-tasks-page|store|wrong-questions|student-pages"
```

Expected: 全部 PASS

- [ ] **Step 2: Manual acceptance**（本地 `pnpm`/`npm` 开 web）

1. 管理题库：多页数据时滚表格，分页贴底；批量条不随表滚
2. 学员商城窄屏：分页不被底栏挡住，可点「下一页」
3. 积分页：表单在上，历史列表滚动，分页贴 panel 底
4. 短列表：分页仍在内容区底部（不悬在中间）

- [ ] **Step 3: Do not commit**（除非用户要求）；若用户要求提交，分开或一次提交均可，message 示例：

```bash
git add apps/web/app/globals.css \
  apps/web/app/\(admin\)/admin/*/page.tsx \
  apps/web/app/\(student\)/learn/*/page.tsx \
  apps/web/tests/admin-pages.test.tsx \
  apps/web/tests/store.test.tsx \
  docs/superpowers/specs/2026-08-06-paginated-panel-sticky-footer-design.md \
  docs/superpowers/plans/2026-08-06-paginated-panel-sticky-footer.md
git commit -m "$(cat <<'EOF'
fix(web): pin list pagination below a scrollable panel

Keep pagination visible at the bottom of admin and student list pages while only the list body scrolls.
EOF
)"
```

---

## Spec coverage self-check

| Spec 要求 | Task |
|-----------|------|
| 方案 B panel + body 滚动 | 2, 3, 4, 5 |
| 管理端全部列表页 | 3, 4 |
| 学员端全部列表页 | 5 |
| 积分页仅历史进 panel | 4 Step 4 |
| 题库批量条在 panel 外 | 3 |
| 移动端底栏避让 | 2 Step 3 |
| 分页底栏样式 | 2 Step 2 |
| 结构单测管理+学员 | 1, 5 |
| 无障碍 nav 不变 | 组件不改；验收 Task 6 |
| 不改 API / 合并组件 | Global Constraints |

无 TBD / 无「similar to Task N」省略实现细节。

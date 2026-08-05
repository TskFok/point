# FormDialog Sticky Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让嵌在 `FormDialog` 内的四个管理端表单的操作区固定在弹窗底部，字段区单独滚动。

**Architecture:** 在各 `*Form` 内用 `admin-form__scroll` 包裹字段/错误/成功提示，`admin-form__actions` 作为兄弟节点留在底部；用 `.form-dialog__body …` 限定的 flex + overflow CSS 实现固定，不影响非弹窗场景。

**Tech Stack:** Next.js (apps/web)、React Testing Library、Jest、CSS in `globals.css`

## Global Constraints

- 范围：题目、商品、AI 模型、AI 任务四个表单
- 提交按钮必须仍在同一 `<form>` 内（`type="submit"`）
- 错误/成功提示留在滚动区
- 选择器限定在 `.form-dialog__body` 下
- 添加功能须补单元测试；相关既有测试必须通过
- 未经用户要求不 commit

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/web/app/globals.css` | 弹窗内 flex/scroll/actions 固定样式 |
| `apps/web/components/admin/question-form.tsx` | 加 `admin-form__scroll` |
| `apps/web/components/admin/product-form.tsx` | 同上 |
| `apps/web/components/admin/ai-model-form.tsx` | 同上 |
| `apps/web/components/admin/ai-task-form.tsx` | 同上 |
| `apps/web/tests/admin-question-form.test.tsx` | 结构断言（滚动区与操作区兄弟） |
| `apps/web/tests/admin-product-form.test.tsx` 等 | 回归；必要时补同样结构断言 |

---

### Task 1: Failing structure test (QuestionForm)

**Files:**
- Modify: `apps/web/tests/admin-question-form.test.tsx`
- Modify later: `apps/web/components/admin/question-form.tsx`

**Interfaces:**
- Produces: 断言 `.admin-form__actions` 是 `.admin-form` 的直接子节点，且与 `.admin-form__scroll` 为兄弟；字段（如题干）在 scroll 内

- [ ] **Step 1: Write failing test**

在 `admin-question-form.test.tsx` 增加：

```tsx
it("弹窗表单将操作区放在滚动区外", () => {
  const { container } = render(
    <QuestionForm
      api={{ createAdminQuestion: jest.fn(), updateAdminQuestion: jest.fn() }}
      mode="create"
    />,
  );
  const form = container.querySelector(".admin-form");
  const scroll = form?.querySelector(":scope > .admin-form__scroll");
  const actions = form?.querySelector(":scope > .admin-form__actions");
  expect(scroll).not.toBeNull();
  expect(actions).not.toBeNull();
  expect(scroll?.contains(screen.getByLabelText("题干"))).toBe(true);
  expect(scroll?.contains(actions as Node)).toBe(false);
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd apps/web && npm test -- --testPathPattern=admin-question-form --testNamePattern="操作区放在滚动区外"`

Expected: FAIL（无 `.admin-form__scroll`）

- [ ] **Step 3: Wrap QuestionForm content**

在 `question-form.tsx` 的 `<form>` 内：ConfirmDialog 保持原位；将 grid/选项/错误/成功包进 `<div className="admin-form__scroll">`；`admin-form__actions` 留在 scroll 外。

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Do not commit**（除非用户要求）

---

### Task 2: CSS layout under FormDialog

**Files:**
- Modify: `apps/web/app/globals.css`（`.form-dialog__body` 及新增规则）

- [ ] **Step 1: Update CSS**

```css
.form-dialog__body {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  margin-top: 1rem;
  padding-right: 0.25rem;
}

.form-dialog__body .admin-form-card {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.form-dialog__body .admin-form {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
}

.form-dialog__body .admin-form__scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 1.25rem;
  padding-right: 0.15rem;
  padding-bottom: 0.25rem;
}

.form-dialog__body .admin-form__actions {
  flex-shrink: 0;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-border);
  background: var(--surface-raised);
}
```

保留原 `.admin-form { display: grid; gap: 1.25rem; }` 给非弹窗场景；弹窗内用更具体选择器覆盖。

- [ ] **Step 2: Visual sanity**（本地打开任一弹窗，长内容时按钮贴底）

---

### Task 3: Apply scroll wrapper to remaining forms

**Files:**
- Modify: `product-form.tsx`, `ai-model-form.tsx`, `ai-task-form.tsx`
- Optionally mirror structure test in one more form test file

- [ ] **Step 1: Same markup pattern for three forms**
- [ ] **Step 2: Add one product-form structure test (optional but preferred)**
- [ ] **Step 3: Run related suites**

```bash
cd apps/web && npm test -- --testPathPattern="admin-question-form|admin-product-form|admin-ai-model-form|admin-ai-task-form|question-form-dialog|form-dialog"
```

Expected: all PASS

---

### Task 4: Verification

- [ ] **Step 1: Full relevant test pass evidence**
- [ ] **Step 2: Summarize + 后续开发建议**

# 题目表单基础积分与语言各占一行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让添加/编辑题目弹窗中「基础积分」与「语言」各占整行，不再并排半宽。

**Architecture:** 复用已有 `admin-field--wide`（`grid-column: 1 / -1`），在 `QuestionForm` 给两个字段的 `label` 加上该类；用 RTL 断言对齐现有「启用题目」用例。

**Tech Stack:** React、Jest、Testing Library；样式依赖现有 `globals.css` 的 `.admin-field--wide`

## Global Constraints

- 范围仅限 `QuestionForm`（添加/编辑共用）
- 不改语言选项、校验、提交逻辑
- 不改 `admin-form__grid` 列定义或其它表单
- 不新增 CSS
- 添加功能须补单元测试；相关既有测试必须通过
- 未经用户要求不 commit

**Spec:** `docs/superpowers/specs/2026-08-07-question-form-lang-row-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/web/tests/admin-question-form.test.tsx` | 断言基础积分、语言各占整行 |
| `apps/web/components/admin/question-form.tsx` | 给两字段 label 加 `admin-field--wide` |

---

### Task 1: 基础积分与语言整行布局

**Files:**
- Modify: `apps/web/tests/admin-question-form.test.tsx`
- Modify: `apps/web/components/admin/question-form.tsx`（约 296–327 行）

**Interfaces:**
- Consumes: 现有 `.admin-field--wide` CSS；`QuestionForm` / `createApi()` 测试辅助
- Produces: 两字段 label 带 `admin-field--wide`

- [ ] **Step 1: Write failing tests**

在「启用题目选项占据单独一行」用例旁增加：

```tsx
it("基础积分占据单独一行", () => {
  render(
    <QuestionForm
      api={createApi()}
      mode="create"
    />,
  );
  expect(screen.getByLabelText("基础积分").closest("label")).toHaveClass(
    "admin-field--wide",
  );
});

it("语言选项占据单独一行", () => {
  render(
    <QuestionForm
      api={createApi()}
      mode="create"
    />,
  );
  expect(screen.getByLabelText("语言").closest("label")).toHaveClass(
    "admin-field--wide",
  );
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd apps/web && npm test -- --testPathPattern=admin-question-form --testNamePattern="基础积分占据单独一行|语言选项占据单独一行"`

Expected: FAIL（label 仅有 `admin-field`，无 `admin-field--wide`）

- [ ] **Step 3: Minimal implementation**

将 `question-form.tsx` 中：

```tsx
<label className="admin-field">
  <span>基础积分</span>
```

与

```tsx
<label className="admin-field">
  <span>语言</span>
```

分别改为：

```tsx
<label className="admin-field admin-field--wide">
  <span>基础积分</span>
```

```tsx
<label className="admin-field admin-field--wide">
  <span>语言</span>
```

- [ ] **Step 4: Run new tests — expect PASS**

Run: `cd apps/web && npm test -- --testPathPattern=admin-question-form --testNamePattern="基础积分占据单独一行|语言选项占据单独一行|启用题目选项占据单独一行"`

Expected: PASS

- [ ] **Step 5: Run full question-form suite — expect PASS**

Run: `cd apps/web && npm test -- --testPathPattern=admin-question-form`

Expected: 全部 PASS

- [ ] **Step 6: Do not commit**（除非用户要求）

---

## Spec coverage (self-review)

| Spec 要求 | Task |
|-----------|------|
| 基础积分整行 | Task 1 |
| 语言整行 | Task 1 |
| 复用 `admin-field--wide`、不新增 CSS | Task 1 Step 3 |
| 单元测试断言 | Task 1 Step 1 |
| 既有用例通过 | Task 1 Step 5 |

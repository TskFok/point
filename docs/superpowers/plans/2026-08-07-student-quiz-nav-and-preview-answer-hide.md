# Student Quiz Nav Row & Preview Answer Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 练习与预习答题页将「上一题 · 提交答案 · 下一题」收成同一行；预习取消先看题解阶段，提交后才展示答案与解析。

**Architecture:** 在 `PracticeSession`（`FIRST`）与 `PreviewSession`（`quiz`）的 `practice-navigation` 内按序放入三钮；预习 `startPreview` 成功后直接进入 `quiz`，删除 `preview` 浏览 UI；提交后仍用 `AnswerFeedback`；CSS 让三钮同行。

**Tech Stack:** Next.js (`apps/web`)、Jest + Testing Library、Playwright、`globals.css`

**Spec:** `docs/superpowers/specs/2026-08-07-student-quiz-nav-and-preview-answer-hide-design.md`

## Global Constraints

- 按钮范围：练习 `FIRST` 与预习答题页；顺序固定为 `上一题` · `提交答案` · `下一题`
- 预习：`setup → quiz → summary`；无「先看题解」浏览阶段；无「完成预习，开始答题」
- 提交前不渲染正确答案 / 题解；提交后用 `AnswerFeedback`（基于 `result`）
- 不改答题 API、积分、幂等；不改 `WRONG_RETRY` 无翻题栏交互
- 添加/修改须保证相关单元测试通过
- 未经用户明确要求不 `git commit` / 不 `git push`（计划中 Commit 步骤获准前跳过）

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/web/components/practice/practice-session.tsx` | `FIRST` 模式三钮同行 |
| `apps/web/components/preview/preview-session.tsx` | 去掉 preview 阶段；quiz 三钮同行；设置文案 |
| `apps/web/app/globals.css` | 三钮导航布局；删除 `.preview-explanation*` |
| `apps/web/tests/practice-session.test.tsx` | 导航同行断言 |
| `apps/web/tests/preview-session.test.tsx` | 直接答题 + 提交前无答案 |
| `playwright/preview.spec.ts` | E2E 对齐新流程 |

---

### Task 1: 预习单测先红（直接答题 + 提交前无答案）

**Files:**
- Modify: `apps/web/tests/preview-session.test.tsx`
- Test: `apps/web/tests/preview-session.test.tsx`

**Interfaces:**
- Consumes: `PreviewSession` 现有公开行为
- Produces: 失败断言，驱动 Task 2

- [ ] **Step 1: 改写「开始预习后立即见答案」用例**

将 `it("选择预设数量后开始预习，展示正确答案与题解", …)` 改为：

```tsx
it("选择预设数量后开始预习，直接进入答题且提交前不展示答案", async () => {
  const user = userEvent.setup();
  const api = createApi();
  api.getPreviewQuestions.mockResolvedValue({
    data: [previewQuestionOne, previewQuestionTwo],
  });

  render(<PreviewSession api={api} />);

  await user.click(screen.getByRole("button", { name: "5 道" }));
  await user.click(screen.getByRole("button", { name: "开始预习" }));

  expect(await screen.findByText(previewQuestionOne.stem)).toBeVisible();
  expect(api.getPreviewQuestions).toHaveBeenCalledWith(5);
  expect(screen.getByText("答题第 1 / 2 题")).toBeVisible();
  expect(screen.queryByText("正确答案：A. had left")).not.toBeInTheDocument();
  expect(
    screen.queryByText(previewQuestionOne.explanation),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "完成预习，开始答题" }),
  ).not.toBeInTheDocument();

  const option = screen.getByRole("radio", { name: /A.*had left/ });
  expect(option).toBeEnabled();
  expect(option).not.toBeChecked();

  const nav = screen.getByRole("navigation", { name: "答题题目切换" });
  expect(within(nav).getByRole("button", { name: "上一题" })).toBeDisabled();
  expect(within(nav).getByRole("button", { name: "提交答案" })).toBeDisabled();
  expect(within(nav).getByRole("button", { name: "下一题" })).toBeDisabled();
});
```

在文件顶部确保已导入 `within`：

```tsx
import { render, screen, within } from "@testing-library/react";
```

- [ ] **Step 2: 删除或改写依赖 preview 浏览阶段的用例**

1. 删除 `it("预习可前后切换，完成预习后进入答题并从第一题开始", …)`（浏览阶段已不存在）。
2. 其余用例凡有：

```tsx
await user.click(
  await screen.findByRole("button", { name: "完成预习，开始答题" }),
);
```

一律删除该步；开始预习后直接作答。例如闸门用例：

```tsx
it("答题未完成前禁用下一题与查看成绩", async () => {
  const user = userEvent.setup();
  const api = createApi();
  api.getPreviewQuestions.mockResolvedValue({
    data: [previewQuestionOne, previewQuestionTwo],
  });

  render(<PreviewSession api={api} />);

  await user.click(screen.getByRole("button", { name: "开始预习" }));
  expect(await screen.findByText("答题第 1 / 2 题")).toBeVisible();
  expect(screen.getByRole("button", { name: "下一题" })).toBeDisabled();
});
```

3. 在「按预习范围逐题作答…」中，提交成功后断言导航内无「提交答案」，且三钮同区：

```tsx
await user.click(screen.getByRole("button", { name: "开始预习" }));
expect(await screen.findByText("答题第 1 / 2 题")).toBeVisible();

await user.click(screen.getByRole("radio", { name: /A.*had left/ }));
const nav = screen.getByRole("navigation", { name: "答题题目切换" });
await user.click(within(nav).getByRole("button", { name: "提交答案" }));
expect(await screen.findByText("回答正确")).toBeVisible();
expect(
  within(nav).queryByRole("button", { name: "提交答案" }),
).not.toBeInTheDocument();
```

（后续「下一题 / 提交 / 查看成绩」步骤保持，但提交按钮一律从 `nav` 内点。）

- [ ] **Step 3: 跑测确认失败**

Run:

```bash
pnpm --filter @point-quest/web test -- tests/preview-session.test.tsx
```

Expected: FAIL（仍进入「预习第 N 题」或仍可见正确答案 / 「完成预习，开始答题」）

- [ ] **Step 4: Commit（仅用户明确要求时）**

```bash
git add apps/web/tests/preview-session.test.tsx
git commit -m "$(cat <<'EOF'
test(web): 预习直接答题且提交前不展示答案

EOF
)"
```

---

### Task 2: 实现预习直接答题与三钮导航

**Files:**
- Modify: `apps/web/components/preview/preview-session.tsx`
- Modify: `apps/web/app/globals.css`（可先只删 explanation 样式，三列布局在 Task 4 统一；若本任务需要也可先改）
- Test: `apps/web/tests/preview-session.test.tsx`

**Interfaces:**
- Consumes: Task 1 失败断言
- Produces: `Phase = "setup" | "quiz" | "summary"`；`startPreview` → `quiz`；quiz 导航含提交钮

- [ ] **Step 1: 收窄 Phase 并直达 quiz**

```tsx
type Phase = "setup" | "quiz" | "summary";
```

`startPreview` 成功分支：

```tsx
setItems(response.data.map((question) => ({ question })));
setCurrentIndex(0);
setPhase("quiz");
```

删除整个 `if (phase === "preview" && currentItem) { … }` 块（含 `preview-explanation`、预勾选 `correctOptionId`、「完成预习，开始答题」、`startQuiz`）。

删除未再使用的 import（如仅浏览阶段用的 `Lightbulb` / `Check` 若提交钮仍用 `Check` 则保留）。

- [ ] **Step 2: 更新设置页文案**

```tsx
<p>
  随机抽取未作答的新题，作答后查看解析并获得积分。
</p>
```

- [ ] **Step 3: quiz 区把提交并入导航**

将当前「提交答案」独立 `Button` 与下方 `nav` 合并为：

```tsx
<nav aria-label="答题题目切换" className="practice-navigation">
  <Button
    disabled={currentIndex === 0}
    onClick={() => setCurrentIndex((index) => index - 1)}
    variant="secondary"
  >
    <ArrowLeft aria-hidden="true" />
    上一题
  </Button>

  {currentItem.result ||
  currentItem.submitError ||
  currentItem.alreadyAnswered ? null : (
    <Button
      className="practice-submit"
      disabled={!currentItem.selectedOptionId || submitting}
      onClick={() => void submitCurrent()}
    >
      {submitting ? (
        <LoaderCircle aria-hidden="true" className="spin" />
      ) : (
        <Check aria-hidden="true" />
      )}
      {submitting
        ? "正在提交"
        : currentItem.submission
          ? "重试提交"
          : "提交答案"}
    </Button>
  )}

  {isLast ? (
    <Button
      disabled={answeredCount < items.length}
      onClick={() => setPhase("summary")}
    >
      <Trophy aria-hidden="true" />
      查看本次成绩
    </Button>
  ) : (
    <Button
      disabled={!currentDone}
      onClick={() => setCurrentIndex((index) => index + 1)}
      variant="secondary"
    >
      <ArrowRight aria-hidden="true" />
      下一题
    </Button>
  )}
</nav>
```

保留：`submitError` 时错误区内的「重试提交」；`AnswerFeedback` / `alreadyAnswered` 提示位置在题目与 `nav` 之间。

- [ ] **Step 4: 删除无用 CSS**

从 `apps/web/app/globals.css` 删除：

```css
.preview-explanation { … }
.preview-explanation__answer { … }
.preview-explanation__answer > svg { … }
```

- [ ] **Step 5: 跑通预习单测**

Run:

```bash
pnpm --filter @point-quest/web test -- tests/preview-session.test.tsx
```

Expected: PASS

- [ ] **Step 6: Commit（仅用户明确要求时）**

```bash
git add apps/web/components/preview/preview-session.tsx apps/web/app/globals.css apps/web/tests/preview-session.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): 预习直接作答并在提交后揭晓答案

EOF
)"
```

---

### Task 3: 练习单测先红（三钮同行）

**Files:**
- Modify: `apps/web/tests/practice-session.test.tsx`
- Test: `apps/web/tests/practice-session.test.tsx`

**Interfaces:**
- Consumes: `PracticeSession` `FIRST` 导航
- Produces: 失败断言，驱动 Task 4

- [ ] **Step 1: 在既有提交用例中加导航同行断言**

在 `it("提交后锁定答案，并在上下题切换后保留只读结果", …)` 开头抽到题后、提交前插入：

```tsx
const nav = screen.getByRole("navigation", { name: "题目切换" });
expect(within(nav).getByRole("button", { name: "上一题" })).toBeVisible();
expect(within(nav).getByRole("button", { name: "提交答案" })).toBeVisible();
expect(within(nav).getByRole("button", { name: "下一题" })).toBeVisible();

await user.click(within(nav).getByRole("button", { name: "提交答案" }));
expect(await screen.findByText("回答正确")).toBeVisible();
expect(
  within(nav).queryByRole("button", { name: "提交答案" }),
).not.toBeInTheDocument();
```

（将原先在 `screen` 上点「提交答案」的调用改为 `within(nav)`；「下一题」「上一题」同理可从 `nav` 点。）

确保文件已 `import { within } from "@testing-library/react"`（若尚未导入则补上）。

- [ ] **Step 2: 跑测确认失败**

Run:

```bash
pnpm --filter @point-quest/web test -- tests/practice-session.test.tsx -t "提交后锁定答案"
```

Expected: FAIL（`within(nav).getByRole("button", { name: "提交答案" })` 找不到）

- [ ] **Step 3: Commit（仅用户明确要求时）**

```bash
git add apps/web/tests/practice-session.test.tsx
git commit -m "$(cat <<'EOF'
test(web): 练习导航同行包含提交答案

EOF
)"
```

---

### Task 4: 练习三钮同行 + 导航 CSS

**Files:**
- Modify: `apps/web/components/practice/practice-session.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/tests/practice-session.test.tsx`

**Interfaces:**
- Consumes: Task 3 失败断言
- Produces: `FIRST` 导航内含提交；`.practice-navigation` 支持三钮

- [ ] **Step 1: 合并提交进 FIRST 导航**

删除 `mode === "FIRST"` 时题目下方独立的提交 `Button`（保留 `WRONG_RETRY` 的独立提交块）。

`FIRST` 的 `nav` 改为：

```tsx
{mode === "FIRST" ? (
  <nav aria-label="题目切换" className="practice-navigation">
    <Button
      disabled={currentIndex === 0}
      onClick={goPrevious}
      variant="secondary"
    >
      <ArrowLeft aria-hidden="true" />
      上一题
    </Button>

    {currentItem.result || currentItem.submitError ? null : (
      <Button
        className="practice-submit"
        disabled={!currentItem.selectedOptionId || submitting}
        onClick={() => void submitCurrent()}
      >
        {submitting ? (
          <LoaderCircle aria-hidden="true" className="spin" />
        ) : (
          <Check aria-hidden="true" />
        )}
        {submitting
          ? "正在提交"
          : currentItem.submission
            ? "重试提交"
            : "提交答案"}
      </Button>
    )}

    <Button
      disabled={
        loadingNext || (completed && currentIndex === queue.length - 1)
      }
      onClick={() => void goNext()}
      variant="secondary"
    >
      {loadingNext ? (
        <LoaderCircle aria-hidden="true" className="spin" />
      ) : (
        <ArrowRight aria-hidden="true" />
      )}
      {loadingNext ? "正在取题" : "下一题"}
    </Button>
  </nav>
) : null}
```

`WRONG_RETRY` 分支保持原独立「提交重练答案」按钮（在 `nav` 之外、无翻题栏）。

`AnswerFeedback` / `submitError` 仍在 `nav` 之上。

- [ ] **Step 2: 更新 CSS**

将 `.practice-navigation` 与小屏规则改为三钮友好：

```css
.practice-navigation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.practice-navigation .practice-submit {
  justify-self: unset;
  min-width: 0;
  flex: 1 1 auto;
}

.practice-navigation .pq-button {
  min-width: 0;
}
```

在 `@media` 小屏段，把原来强制两列 grid 改为：

```css
.practice-navigation {
  display: flex;
  flex-wrap: wrap;
}

.practice-navigation .pq-button {
  min-width: 0;
  padding-inline: 0.6rem;
}

.practice-submit {
  width: auto;
  justify-self: stretch;
}
```

（保留小屏下独立 `.practice-submit` 在无 nav 场景如 `WRONG_RETRY` 仍可拉满宽的既有意图即可；以三钮不换行优先，过窄允许 wrap。）

- [ ] **Step 3: 跑练习 + 预习相关单测**

Run:

```bash
pnpm --filter @point-quest/web test -- tests/practice-session.test.tsx tests/preview-session.test.tsx
```

Expected: PASS

- [ ] **Step 4: Commit（仅用户明确要求时）**

```bash
git add apps/web/components/practice/practice-session.tsx apps/web/app/globals.css apps/web/tests/practice-session.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): 练习答题页上一题提交下一题同一行

EOF
)"
```

---

### Task 5: 更新 Playwright 预习 E2E

**Files:**
- Modify: `playwright/preview.spec.ts`
- Test: `playwright/preview.spec.ts`

**Interfaces:**
- Consumes: Task 2 预习流程
- Produces: E2E 覆盖直接答题 + 提交后见反馈

- [ ] **Step 1: 改写 E2E 步骤**

将测试名与主体改为（保留建题与导航入口）：

```ts
test("预习抽题后直接作答，提交见解析并获得积分", async ({
  database,
  studentPage,
}) => {
  // …既有建题逻辑不变…

  await studentPage.goto("/learn");
  await studentPage
    .getByRole("navigation", { name: "学员主导航" })
    .getByRole("link", { name: "预习" })
    .click();
  await expect(studentPage).toHaveURL(/\/learn\/preview$/);

  await studentPage.getByLabel("自定义数量").fill("2");
  await studentPage.getByRole("button", { name: "开始预习" }).click();

  await expect(
    studentPage.getByText("答题第 1 / 2 题", { exact: true }),
  ).toBeVisible();
  await expect(
    studentPage.getByText("正确答案：A. went", { exact: true }),
  ).toHaveCount(0);
  await expect(studentPage.getByText(explanation, { exact: true })).toHaveCount(
    0,
  );

  const nav = studentPage.getByRole("navigation", { name: "答题题目切换" });
  await studentPage.getByRole("radio", { name: /A.*went/ }).check();
  await nav.getByRole("button", { name: "提交答案" }).click();
  await expect(
    studentPage.getByText("回答正确", { exact: true }),
  ).toBeVisible();
  await expect(studentPage.getByText(explanation, { exact: true })).toBeVisible();

  await nav.getByRole("button", { name: "下一题" }).click();
  await expect(
    studentPage.getByText("答题第 2 / 2 题", { exact: true }),
  ).toBeVisible();
  await studentPage.getByRole("radio", { name: /A.*went/ }).check();
  await nav.getByRole("button", { name: "提交答案" }).click();
  await expect(
    studentPage.getByText("回答正确", { exact: true }),
  ).toBeVisible();

  await studentPage.getByRole("button", { name: "查看本次成绩" }).click();
  await expect(
    studentPage.getByText("本次预习答题完成", { exact: true }),
  ).toBeVisible();
  await expect(
    studentPage.getByText("共 2 题，答对 2 题", { exact: true }),
  ).toBeVisible();
  await expect(
    studentPage.getByText("本次获得 20 积分", { exact: true }),
  ).toBeVisible();
  await expect(studentPage.getByLabel("当前积分 20")).toBeVisible();
});
```

删除所有「预习第 N 题」「完成预习，开始答题」、提交前可见「正确答案」的步骤。

- [ ] **Step 2: 跑 E2E（需本地测试环境可用时）**

Run:

```bash
pnpm test:e2e -- playwright/preview.spec.ts
```

Expected: PASS

若环境未就绪：至少 `pnpm typecheck:e2e` 与单测已绿，并在 PR/交付说明中标注 E2E 待跑。

- [ ] **Step 3: Commit（仅用户明确要求时）**

```bash
git add playwright/preview.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): 预习流程改为直接作答后揭晓

EOF
)"
```

---

## Spec coverage (self-review)

| Spec 要求 | Task |
|-----------|------|
| 练习与预习三钮同行、顺序上一题·提交·下一题 | 2, 3, 4 |
| 预习取消先看题解 / 无「完成预习，开始答题」 | 1, 2 |
| 提交前无答案、提交后 AnswerFeedback | 1, 2, 5 |
| 设置页文案更新 | 2 |
| 删 `.preview-explanation*` | 2 |
| 不改 API / WRONG_RETRY | 4（显式保留） |
| 单测 + Playwright | 1–5 |

无 TBD / 占位步骤；导航 `aria-label` 与现网一致（练习「题目切换」、预习「答题题目切换」）。

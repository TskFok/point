# AI 出题解析须含整题译文 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 生成题目时，`explanation` 须同时包含题干整句中文译文与词义/考点说明（仅强化 prompt，不做结构硬校验）。

**Architecture:** 仅改 `apps/api/src/ai-tasks/generate-questions.ts` 的 `buildGeneratePrompt` 文案，并在 `generate-questions.spec.ts` 增加 prompt 断言。校验逻辑、入库流水线、Admin/练习 UI 均不变。

**Tech Stack:** NestJS / TypeScript / Jest（`pnpm --filter @point-quest/api test`）

## Global Constraints

- `explanation` = 题干整句中文译文 + 词义/考点说明。
- 仅改 Prompt；不做短解析/缺译文硬拒绝。
- 不改库表、Admin UI、练习页；不回溯已入库题目；不拆分新 JSON 字段。
- TDD：先写失败测试，再写实现。
- 禁止提交敏感信息。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `apps/api/src/ai-tasks/generate-questions.ts` | prompt 构建（本次改动点） |
| `apps/api/src/ai-tasks/generate-questions.spec.ts` | 单元测试 |
| `docs/superpowers/specs/2026-08-03-ai-question-explanation-include-stem-translation-design.md` | 设计对照（已提交，实现时只读） |

不新增文件；不改 `validateOneGeneratedQuestion` / `ai-tasks.service.ts`。

---

### Task 1: Prompt 要求 explanation 含整题译文（含单测）

**Files:**
- Modify: `apps/api/src/ai-tasks/generate-questions.ts`
- Modify: `apps/api/src/ai-tasks/generate-questions.spec.ts`
- Spec: `docs/superpowers/specs/2026-08-03-ai-question-explanation-include-stem-translation-design.md`（只读对照）

**Interfaces:**
- Consumes: 现有 `buildGeneratePrompt({ lastWord, questionCount, optionCount }): string`
- Produces: 同签名；prompt 字符串新增「整句译文 + 词义说明」约束与正例

- [ ] **Step 1: 先写失败测试**

在 `apps/api/src/ai-tasks/generate-questions.spec.ts` 的 `describe('generate-questions parse')` 内追加：

```typescript
  it('prompt 要求 explanation 含整句译文与词义说明', () => {
    const p = buildGeneratePrompt({
      lastWord: null,
      questionCount: 1,
      optionCount: 4,
    });
    const lower = p.toLowerCase();
    expect(lower).toMatch(/explanation/);
    expect(lower).toMatch(/translat/);
    expect(p).toMatch(/放弃|abandon|词义|meaning/i);
  });
```

说明：`translat` 匹配 `translation` / `translate`；中文正例关键词用 `/放弃|abandon|词义|meaning/i` 覆盖 prompt 中的示例句。

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
pnpm --filter @point-quest/api test -- generate-questions.spec.ts
```

Expected: 新建用例失败（当前 prompt 仅有 `Explanation must be Chinese.`，无 translation / 正例）。

- [ ] **Step 3: 实现最小改动**

在 `apps/api/src/ai-tasks/generate-questions.ts` 的 `buildGeneratePrompt` 中，将：

```typescript
    'Option contents must be Chinese meanings. Explanation must be Chinese.',
```

替换为：

```typescript
    'Option contents must be Chinese meanings.',
    'Explanation must be Chinese and MUST include: (1) a full Chinese translation of the entire stem sentence, and (2) a brief meaning note for the target word.',
    'Example explanation: 他们决定放弃这个计划。「abandon」表示放弃、抛弃。',
```

完整函数应为：

```typescript
export function buildGeneratePrompt(input: {
  lastWord: string | null;
  questionCount: number;
  optionCount: number;
}): string {
  const cursor =
    input.lastWord && input.lastWord.trim()
      ? `after the word "${input.lastWord.trim().toLowerCase()}" (exclusive)`
      : 'from the beginning of the English dictionary (letter a)';
  return [
    `Generate exactly ${input.questionCount} multiple-choice vocabulary questions.`,
    `Words must be in strict English alphabetical order ${cursor}.`,
    `Each question must have exactly ${input.optionCount} options.`,
    'Stem must be a complete English example sentence that MUST INCLUDE the target word itself (case-insensitive word boundary).',
    'Do NOT use blanks, underscores (___), ellipsis placeholders, or [blank] in the stem.',
    'End the stem by naming the word to test, e.g. What does "abhor" mean?',
    'Option contents must be Chinese meanings.',
    'Explanation must be Chinese and MUST include: (1) a full Chinese translation of the entire stem sentence, and (2) a brief meaning note for the target word.',
    'Example explanation: 他们决定放弃这个计划。「abandon」表示放弃、抛弃。',
    'Exactly one option isCorrect=true per question (the Chinese meaning of the target word).',
    'Return ONLY a JSON array. Each item: { "word", "stem", "explanation", "options": [{ "label", "content", "isCorrect" }] }.',
  ].join(' ');
}
```

不改 `validateOneGeneratedQuestion`。既有测试样例里的短 `explanation: '放弃'` 可保留（校验仍只要求非空）。

- [ ] **Step 4: 跑测试确认通过**

Run:

```bash
pnpm --filter @point-quest/api test -- generate-questions.spec.ts
```

Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai-tasks/generate-questions.ts \
  apps/api/src/ai-tasks/generate-questions.spec.ts
git commit -m "$(cat <<'EOF'
fix: AI 出题解析须含整题译文与词义说明

强化 prompt，要求 explanation 同时包含题干中文译文和考点说明。
EOF
)"
```

---

## Self-Review

1. **Spec coverage:** 译文+词义、仅改 prompt、无硬校验、单测、非目标（不改 UI/库表/回溯）均由 Task 1 覆盖；设计文档交叉引用已在 design 提交中完成。
2. **Placeholder scan:** 无 TBD/TODO。
3. **Type consistency:** 未改函数签名；仅改 prompt 字符串。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-03-ai-question-explanation-include-stem-translation.md`.

**两种执行方式：**

1. **Subagent-Driven（推荐）** — 每任务派生子代理，任务间评审  
2. **Inline Execution** — 本会话按 executing-plans 连续执行  

选哪种？

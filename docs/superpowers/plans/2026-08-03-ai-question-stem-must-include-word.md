# AI 出题题干须含完整目标词 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 生成的词汇选择题题干必须包含完整英文目标词（禁止挖空），选项仍为中文词义；通过 prompt 约束 + 校验拒绝保证入库质量。

**Architecture:** 仅改 `apps/api/src/ai-tasks/generate-questions.ts`：增强 `buildGeneratePrompt` 文案；在 `validateOneGeneratedQuestion` 增加挖空检测与单词边界包含校验。既有执行流水线的跳过摘要逻辑不变。

**Tech Stack:** NestJS / TypeScript / Jest（`pnpm --filter @point-quest/api test`）

## Global Constraints

- 题干英文完整例句，必须按单词边界包含 `word`（大小写不敏感）；禁止 `___` / `[blank]` 等挖空。
- 选项仍为中文词义；恰 1 个正确项对应 `word`。
- `word` 仅用于游标与校验，不单独落库。
- 不做自动改写 stem；不合格题拒绝/跳过。
- TDD：先写失败测试，再写实现。
- 禁止提交敏感信息。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `apps/api/src/ai-tasks/generate-questions.ts` | prompt 构建 + 单题校验 + AI 调用解析 |
| `apps/api/src/ai-tasks/generate-questions.spec.ts` | 单元测试 |

不新增文件；不改 `ai-tasks.service.ts`（已调用 `validateOneGeneratedQuestion`）。

---

### Task 1: Prompt 约束 + stem 校验（含单测）

**Files:**
- Modify: `apps/api/src/ai-tasks/generate-questions.ts`
- Modify: `apps/api/src/ai-tasks/generate-questions.spec.ts`
- Spec: `docs/superpowers/specs/2026-08-03-ai-question-stem-must-include-word-design.md`（只读对照）

**Interfaces:**
- Consumes: 现有 `validateOneGeneratedQuestion(value, optionCount, minWordExclusive)`、`buildGeneratePrompt({ lastWord, questionCount, optionCount })`
- Produces: 同签名；校验新增失败原因文案；prompt 新增约束句

- [ ] **Step 1: 先写失败测试**

在 `apps/api/src/ai-tasks/generate-questions.spec.ts` 的 `describe('generate-questions parse')` 内追加：

```typescript
  it('prompt 要求完整例句包含 word 且禁止挖空', () => {
    const p = buildGeneratePrompt({
      lastWord: null,
      questionCount: 1,
      optionCount: 4,
    });
    expect(p.toLowerCase()).toMatch(/must include/);
    expect(p.toLowerCase()).toMatch(/blank|___|placeholder/);
    expect(p.toLowerCase()).toMatch(/what does/);
  });

  it('拒绝 stem 含挖空占位', () => {
    const result = validateOneGeneratedQuestion(
      {
        word: 'abhor',
        stem: 'The scholar claimed to ___ violence in all forms.',
        explanation: '憎恶',
        options: [
          { label: 'A', content: '憎恶', isCorrect: true },
          { label: 'B', content: '崇拜', isCorrect: false },
        ],
      },
      2,
      null,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/挖空|blank|___/i);
  });

  it('拒绝 stem 未包含 word', () => {
    const result = validateOneGeneratedQuestion(
      {
        word: 'abhor',
        stem: 'What does this word mean in context?',
        explanation: '憎恶',
        options: [
          { label: 'A', content: '憎恶', isCorrect: true },
          { label: 'B', content: '崇拜', isCorrect: false },
        ],
      },
      2,
      null,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/未包含|不包含|word/i);
  });

  it('接受含完整 word 的例句题干', () => {
    const result = validateOneGeneratedQuestion(
      {
        word: 'abhor',
        stem: 'The scholar claimed to abhor violence in all forms. What does "abhor" mean?',
        explanation: '憎恶、痛恨',
        options: [
          { label: 'A', content: '憎恶', isCorrect: true },
          { label: 'B', content: '崇拜', isCorrect: false },
        ],
      },
      2,
      null,
    );
    expect(result.ok).toBe(true);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
pnpm --filter @point-quest/api test -- generate-questions.spec.ts
```

Expected: 新建用例失败（prompt 缺约束文案；含 `___` / 缺 word 的 stem 仍被接受）。

- [ ] **Step 3: 实现最小改动**

在 `generate-questions.ts` 中：

1. 更新 `buildGeneratePrompt`：

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
    'Option contents must be Chinese meanings. Explanation must be Chinese.',
    'Exactly one option isCorrect=true per question (the Chinese meaning of the target word).',
    'Return ONLY a JSON array. Each item: { "word", "stem", "explanation", "options": [{ "label", "content", "isCorrect" }] }.',
  ].join(' ');
}
```

2. 在 `validateOneGeneratedQuestion` 中，于 stem 非空校验之后、options 校验之前加入：

```typescript
  const stem = value.stem.trim();
  if (/\b_{2,}\b|___+|\[\s*blank\s*\]|\[\s*\]/i.test(stem)) {
    return { ok: false, message: `题目 ${word} stem 禁止挖空占位` };
  }
  const wordInStem = new RegExp(
    `(^|[^A-Za-z])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z]|$)`,
    'i',
  );
  if (!wordInStem.test(stem)) {
    return { ok: false, message: `题目 ${word} stem 未包含目标词` };
  }
```

并将后续返回里的 `stem: value.stem.trim()` 改为使用已 trim 的 `stem` 变量（若前面已有 `value.stem.trim()` 检查，合并为一次赋值即可）。

辅助：可将挖空检测与单词包含抽成同文件内小函数（可选），保持导出 API 不变。

- [ ] **Step 4: 跑测试确认通过**

Run:

```bash
pnpm --filter @point-quest/api test -- generate-questions.spec.ts
```

Expected: 全部 PASS。若旧样例 `What does "abandon" mean?` 因未构成「例句含 word」而失败：旧样例 stem 本身已含 `"abandon"`，单词边界应通过；若引号导致边界失败，放宽正则允许两侧为引号/标点：

```typescript
  const wordInStem = new RegExp(
    `(^|[^A-Za-z])${escapeRegExp(word)}(?![A-Za-z])`,
    'i',
  );
```

其中：

```typescript
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

同步修正已有测试样例 stem 为完整例句形式（推荐，与产品约定一致）：

```typescript
stem: 'They decided to abandon the plan. What does "abandon" mean?',
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai-tasks/generate-questions.ts \
  apps/api/src/ai-tasks/generate-questions.spec.ts
git commit -m "$(cat <<'EOF'
fix: AI 出题题干须含完整目标词并拒绝挖空

强化 prompt 与校验，避免 ___ 填空题入库，选项仍为中文词义。
EOF
)"
```

---

## Self-Review

1. **Spec coverage:** 完整例句含 word、禁止挖空、中文选项、prompt+校验、单测、非目标（不改写/不改 UI）均覆盖于 Task 1。
2. **Placeholder scan:** 无 TBD/TODO。
3. **Type consistency:** 未改函数签名；仅增强校验与 prompt 字符串。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-03-ai-question-stem-must-include-word.md`.

**两种执行方式：**

1. **Subagent-Driven（推荐）** — 每任务派生子代理，任务间评审  
2. **Inline Execution** — 本会话按 executing-plans 连续执行  

选哪种？

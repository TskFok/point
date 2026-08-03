# AI Question Option Shuffle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 出题解析成功后，对每题选项做 Fisher–Yates 洗牌并重标 A/B/C/...，使入库正确答案位置均匀分布。

**Architecture:** 在 `generate-questions.ts` 增加可注入 `rng` 的 `shuffleQuestionOptions`；于 `parseGeneratedQuestionsJson` 校验通过后调用，保证所有生成路径一致。不以 prompt 要求模型随机为主手段。

**Tech Stack:** NestJS API、Jest、TypeScript

## Global Constraints

- 入库时打乱；不回填已有题库；不改练习侧展示。
- `isCorrect` 跟随选项内容；洗牌后仍恰好一个正确项。
- 添加功能须同步单元测试；相关测试必须通过。
- 未经用户明确要求不创建 git commit。

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/api/src/ai-tasks/generate-questions.ts` | `shuffleQuestionOptions` + 解析出口调用 |
| `apps/api/src/ai-tasks/generate-questions.spec.ts` | 固定 `rng` 与解析集成测试 |

---

### Task 1: shuffleQuestionOptions + 解析出口接入

**Files:**
- Modify: `apps/api/src/ai-tasks/generate-questions.ts`
- Test: `apps/api/src/ai-tasks/generate-questions.spec.ts`

**Interfaces:**
- Produces:
  - `shuffleQuestionOptions(options: GeneratedQuestionOption[], rng?: () => number): GeneratedQuestionOption[]`
  - `parseGeneratedQuestionsJson` 对每题返回已洗牌并重标 label 的 options（默认 `Math.random`）
  - 可选：`parseGeneratedQuestionsJson(..., rng?)` 第 4 参便于测解析集成

- [x] **Step 1: Write the failing tests**

在 `generate-questions.spec.ts` 追加：

```typescript
describe('shuffleQuestionOptions', () => {
  it('按固定 rng 打乱并重标 A/B/C，正解跟随内容', () => {
    const options = [
      { label: 'A', content: '正确', isCorrect: true },
      { label: 'B', content: '错1', isCorrect: false },
      { label: 'C', content: '错2', isCorrect: false },
    ];
    // 依次返回 0.9, 0.1 → Fisher-Yates 可得到确定顺序
    const values = [0.9, 0.1];
    let i = 0;
    const rng = () => values[i++] ?? 0;
    const shuffled = shuffleQuestionOptions(options, rng);
    expect(shuffled.map((o) => o.content)).not.toEqual([
      '正确',
      '错1',
      '错2',
    ]);
    expect(shuffled.map((o) => o.label)).toEqual(['A', 'B', 'C']);
    expect(shuffled.filter((o) => o.isCorrect)).toHaveLength(1);
    expect(shuffled.find((o) => o.isCorrect)?.content).toBe('正确');
  });

  it('parseGeneratedQuestionsJson 出口已洗牌（固定 rng）', () => {
    const raw = JSON.stringify([
      {
        word: 'abandon',
        stem: 'They decided to abandon the plan. What does "abandon" mean?',
        explanation: '他们决定放弃这个计划。「abandon」表示放弃。',
        options: [
          { label: 'A', content: '放弃', isCorrect: true },
          { label: 'B', content: '获得', isCorrect: false },
          { label: 'C', content: '坚持', isCorrect: false },
          { label: 'D', content: '拒绝', isCorrect: false },
        ],
      },
    ]);
    const values = [0.99, 0.01, 0.5];
    let i = 0;
    const result = parseGeneratedQuestionsJson(raw, 4, null, () => values[i++] ?? 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const labels = result.questions[0]!.options.map((o) => o.label);
    expect(labels).toEqual(['A', 'B', 'C', 'D']);
    expect(
      result.questions[0]!.options.find((o) => o.isCorrect)?.content,
    ).toBe('放弃');
    expect(
      result.questions[0]!.options.map((o) => o.content),
    ).not.toEqual(['放弃', '获得', '坚持', '拒绝']);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/ai-tasks/generate-questions.spec.ts --no-coverage`

Expected: FAIL（`shuffleQuestionOptions` 未导出 / `parseGeneratedQuestionsJson` 不接受 rng）

- [x] **Step 3: Minimal implementation**

在 `generate-questions.ts`：

```typescript
const OPTION_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function shuffleQuestionOptions(
  options: GeneratedQuestionOption[],
  rng: () => number = Math.random,
): GeneratedQuestionOption[] {
  const shuffled = [...options];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled.map((option, index) => ({
    label: OPTION_LABELS[index] ?? String(index + 1),
    content: option.content,
    isCorrect: option.isCorrect,
  }));
}
```

更新 `parseGeneratedQuestionsJson` 签名，增加可选 `rng`；在 `questions.push` 前：

```typescript
questions.push({
  ...validated.question,
  options: shuffleQuestionOptions(validated.question.options, rng),
});
```

可选：在 `buildGeneratePrompt` 末尾加一句 `Option order does not matter; labels will be reassigned.`（非主手段）。

- [x] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest src/ai-tasks/generate-questions.spec.ts --no-coverage`

Expected: PASS（全部绿色）

- [ ] **Step 5: Commit only if user asks**

Do not commit unless explicitly requested.

---

## Spec coverage self-review

| Spec 要求 | Task |
|-----------|------|
| Fisher–Yates + 重标 A/B/C | Task 1 |
| 可注入 rng | Task 1 |
| 解析出口统一调用 | Task 1 |
| isCorrect 跟随内容 | Task 1 测试 |
| 不回填旧题 / 不改练习侧 | 无代码变更（非目标） |
| 单元测试通过 | Task 1 Step 4 |

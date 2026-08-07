# AI Prompt Exact Target Word Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加强 `buildGeneratePrompt`，要求题干含目标词原样拼写、禁止变形代替与换词，降低「stem 未包含目标词」失败率。

**Architecture:** 仅改 prompt 文案与单测；`stemIncludesWord` / fail-fast 解析不变。TDD：先写失败断言，再改 `buildGeneratePrompt`。

**Tech Stack:** NestJS / TypeScript / Jest（`pnpm --filter @point-quest/api test`）

## Global Constraints

- 不放宽校验；不做坏题跳过；不做 stem 自动改写。
- Prompt 用英文，与现有 `buildGeneratePrompt` 风格一致。
- 禁止提交敏感信息。
- TDD：先失败测试，再实现。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `apps/api/src/ai-tasks/generate-questions.ts` | `buildGeneratePrompt` 增加约束句 |
| `apps/api/src/ai-tasks/generate-questions.spec.ts` | prompt 文案断言 |
| Spec（只读）: `docs/superpowers/specs/2026-08-07-ai-prompt-exact-target-word-design.md` | 需求对照 |

---

### Task 1: Prompt 原样拼写约束 + 单测

**Files:**
- Modify: `apps/api/src/ai-tasks/generate-questions.spec.ts`
- Modify: `apps/api/src/ai-tasks/generate-questions.ts`（`buildGeneratePrompt`）
- Spec: `docs/superpowers/specs/2026-08-07-ai-prompt-exact-target-word-design.md`（只读）

**Interfaces:**
- Consumes: `buildGeneratePrompt({ words: DictionaryWord[]; optionCount: number }): string`
- Produces: 同签名；返回字符串新增 exact spelling / inflection / substitute 约束

- [ ] **Step 1: 先写失败测试**

在 `generate-questions.spec.ts` 中、现有 `prompt 要求完整例句包含 word 且禁止挖空` 测试附近追加：

```typescript
  it('prompt 要求目标词原样拼写且禁止变形与换词', () => {
    const p = buildGeneratePrompt({
      words: abandonWords,
      optionCount: 4,
    });
    const lower = p.toLowerCase();
    expect(lower).toMatch(/exact spelling|exact form/);
    expect(lower).toMatch(/inflect|inflection|conjugated|plural|variant/);
    expect(lower).toMatch(/substitut|replace|near[- ]?form|look[- ]?alike/);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
pnpm --filter @point-quest/api test -- generate-questions.spec.ts -t "原样拼写"
```

Expected: FAIL（prompt 尚无这些约束关键词）

- [ ] **Step 3: 最小实现**

在 `buildGeneratePrompt` 的 return 数组中，于现有 stem 约束句之后插入（保持英文、一句一条）：

```typescript
    'Stem must INCLUDE the target word in its EXACT spelling (case-insensitive word boundary). Do NOT use only an inflected/conjugated/plural/variant form instead (e.g. "whys" for "why", "running" for "run").',
    'Each question\'s "word" field and the tested word in the stem MUST match the listed word exactly. Never substitute a near-form or different word (e.g. "when" for "why").',
```

可酌情微调现有 “MUST INCLUDE the target word” 句，避免重复啰嗦，但测试断言必须仍通过既有 `must include` / `blank` / `what does` 用例。

- [ ] **Step 4: 跑相关测试确认通过**

Run:

```bash
pnpm --filter @point-quest/api test -- generate-questions.spec.ts
```

Expected: PASS（含新测与既有 prompt/校验测）

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai-tasks/generate-questions.ts apps/api/src/ai-tasks/generate-questions.spec.ts
git commit -m "$(cat <<'EOF'
fix(api): 加强 AI 出题 prompt 要求目标词原样拼写

EOF
)"
```

---

## Self-Review

1. **Spec coverage:** 原样拼写 ✓；禁止换词 ✓；点名考查已有、保留 ✓；非目标（不改校验/fail-fast）✓
2. **Placeholder scan:** 无 TBD
3. **Type consistency:** 仅改 prompt 字符串，无新 API

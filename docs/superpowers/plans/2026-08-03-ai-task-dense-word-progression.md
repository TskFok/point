# AI 任务单词游标密推进 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AI 出题游标按「同首字母且第 2 字母距离 ≤ 2（换字母仅允许下一字母且第 2 字母为 a–c）」密推进；违规则整轮 FAILED，不写题、不更新 `lastWord`。

**Architecture:** 在 `generate-questions.ts` 增加纯函数 `isDenseWordProgression`，由 `validateOneGeneratedQuestion` 在字母序校验后调用；同步强化 prompt；`AiTasksService.runTask` 对密度类校验失败立即整轮失败（禁止跳过收下）。

**Tech Stack:** NestJS、TypeScript、Jest。

## Global Constraints

- Spec：`docs/superpowers/specs/2026-08-03-ai-task-dense-word-progression-design.md`
- `MAX_SECOND_LETTER_DELTA = 2`；换字母时第 2 字母 ∈ `{a,b,c}`
- `word` 必须匹配 `^[a-z]+$`（规范化小写后）
- 密度违规 → 整轮 `FAILED`；不写题；不更新 `lastWord`
- `errorMessage` / 日志不得含 API Key
- 新增/修改功能必须带单元测试且通过
- 勿把无关未提交改动（如 recoverInterruptedRuns）混进本功能提交；若工作区已有该改动，本计划相关 commit 只 stage 密推进相关文件

## File Structure

| 路径 | 职责 |
|------|------|
| `apps/api/src/ai-tasks/generate-questions.ts` | `isDenseWordProgression`、校验、prompt |
| `apps/api/src/ai-tasks/generate-questions.spec.ts` | 密度与 prompt 单测 |
| `apps/api/src/ai-tasks/ai-tasks.service.ts` | runTask：密度失败整轮 FAILED |
| `apps/api/src/ai-tasks/ai-tasks.service.spec.ts` | runTask 密度失败不前进游标 |
| `docs/superpowers/specs/2026-08-03-admin-ai-tasks-design.md` | 出题约定同步密推进 |

---

### Task 1: `isDenseWordProgression` 纯函数

**Files:**
- Modify: `apps/api/src/ai-tasks/generate-questions.ts`
- Modify: `apps/api/src/ai-tasks/generate-questions.spec.ts`

**Interfaces:**
- Produces: `export const MAX_SECOND_LETTER_DELTA = 2`
- Produces: `export function isDenseWordProgression(prev: string, next: string): boolean`
- 约定：入参已是 trim + lower；两者均须 `^[a-z]+$` 且长度 ≥ 2，否则返回 `false`

- [ ] **Step 1: 写失败单测**

在 `generate-questions.spec.ts` 增加：

```typescript
import { isDenseWordProgression } from './generate-questions';

describe('isDenseWordProgression', () => {
  it('同首字母且第2字母距离≤2 通过', () => {
    expect(isDenseWordProgression('advocate', 'advice')).toBe(true);
    expect(isDenseWordProgression('advocate', 'affect')).toBe(true);
  });

  it('同首字母第2字母距离过大拒绝', () => {
    expect(isDenseWordProgression('advocate', 'airport')).toBe(false);
  });

  it('跨多个首字母拒绝', () => {
    expect(isDenseWordProgression('advocate', 'kindle')).toBe(false);
  });

  it('换至下一字母且第2字母为 a–c 通过', () => {
    expect(isDenseWordProgression('azure', 'baby')).toBe(true);
  });

  it('换字母但非下一字母或第2字母不在 a–c 拒绝', () => {
    expect(isDenseWordProgression('azure', 'kindle')).toBe(false);
    expect(isDenseWordProgression('azure', 'brown')).toBe(false);
  });

  it('非纯字母或过短拒绝', () => {
    expect(isDenseWordProgression('a', 'ab')).toBe(false);
    expect(isDenseWordProgression('well-known', 'wellness')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测确认失败**

Run: `cd apps/api && pnpm test -- generate-questions.spec.ts -t isDenseWordProgression`

Expected: FAIL（`isDenseWordProgression` 未导出 / 未定义）

- [ ] **Step 3: 最小实现**

在 `generate-questions.ts` 增加：

```typescript
export const MAX_SECOND_LETTER_DELTA = 2;

const WORD_PATTERN = /^[a-z]+$/;
const NEXT_LETTER_SECOND_MAX = 'c'; // a–c

export function isDenseWordProgression(prev: string, next: string): boolean {
  if (!WORD_PATTERN.test(prev) || !WORD_PATTERN.test(next)) {
    return false;
  }
  if (prev.length < 2 || next.length < 2) {
    return false;
  }
  const p0 = prev[0]!;
  const n0 = next[0]!;
  const p1 = prev[1]!;
  const n1 = next[1]!;

  if (n0 === p0) {
    return Math.abs(n1.charCodeAt(0) - p1.charCodeAt(0)) <= MAX_SECOND_LETTER_DELTA;
  }

  if (n0.charCodeAt(0) === p0.charCodeAt(0) + 1) {
    return n1 >= 'a' && n1 <= NEXT_LETTER_SECOND_MAX;
  }

  return false;
}
```

- [ ] **Step 4: 跑测确认通过**

Run: `cd apps/api && pnpm test -- generate-questions.spec.ts -t isDenseWordProgression`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai-tasks/generate-questions.ts apps/api/src/ai-tasks/generate-questions.spec.ts
git commit -m "$(cat <<'EOF'
feat: 增加 AI 出题单词密推进判定函数

EOF
)"
```

---

### Task 2: 校验接入 + prompt 文案

**Files:**
- Modify: `apps/api/src/ai-tasks/generate-questions.ts`
- Modify: `apps/api/src/ai-tasks/generate-questions.spec.ts`

**Interfaces:**
- Consumes: `isDenseWordProgression(prev, next): boolean`
- Modifies: `validateOneGeneratedQuestion` — 在「word 须大于游标」之后，若存在 `minWordExclusive`，调用密度校验；失败 message 必须含 `跨度过大` 与 `密推进`
- Modifies: `normalizeWord` 或校验入口 — `word` 须 `^[a-z]+$`，否则 `缺少 word` 或 `word 须为纯小写字母`
- Modifies: `buildGeneratePrompt` — 增加密推进说明

- [ ] **Step 1: 写失败单测**

```typescript
  it('validate 拒绝跨度过大的 word', () => {
    const result = validateOneGeneratedQuestion(
      {
        word: 'kindle',
        stem: 'Please kindle the fire carefully. What does "kindle" mean?',
        explanation: '他们小心地点燃了火。「kindle」表示点燃、激起。',
        options: [
          { label: 'A', content: '点燃', isCorrect: true },
          { label: 'B', content: '熄灭', isCorrect: false },
        ],
      },
      2,
      'advocate',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/跨度过大|密推进/);
  });

  it('validate 接受密推进 word', () => {
    const result = validateOneGeneratedQuestion(
      {
        word: 'advice',
        stem: 'She gave useful advice to the team. What does "advice" mean?',
        explanation: '她给团队提供了有用的建议。「advice」表示建议。',
        options: [
          { label: 'A', content: '建议', isCorrect: true },
          { label: 'B', content: '命令', isCorrect: false },
        ],
      },
      2,
      'advocate',
    );
    expect(result.ok).toBe(true);
  });

  it('prompt 要求密推进与跨度约束', () => {
    const p = buildGeneratePrompt({
      lastWord: 'advocate',
      questionCount: 3,
      optionCount: 4,
    });
    const lower = p.toLowerCase();
    expect(lower).toMatch(/dense|close|adjacent|紧|密/);
    expect(lower).toMatch(/second letter|第.?2/);
    expect(p).toMatch(/kindle|跨|jump/i);
  });

  it('parse 遇跨度过大整批失败', () => {
    const raw = JSON.stringify([
      {
        word: 'kindle',
        stem: 'Please kindle the fire carefully. What does "kindle" mean?',
        explanation: '点燃火。「kindle」表示点燃。',
        options: [
          { label: 'A', content: '点燃', isCorrect: true },
          { label: 'B', content: '熄灭', isCorrect: false },
        ],
      },
    ]);
    const result = parseGeneratedQuestionsJson(raw, 2, 'advocate');
    expect(result.ok).toBe(false);
  });
```

- [ ] **Step 2: 跑测确认失败**

Run: `cd apps/api && pnpm test -- generate-questions.spec.ts -t "跨度过大|密推进|parse 遇跨度"`

Expected: FAIL（尚未拒绝 kindle / prompt 无密推进文案）

- [ ] **Step 3: 实现校验与 prompt**

在 `normalizeWord` 之后增加纯字母约束（或在 `validateOneGeneratedQuestion` 内）：

```typescript
  if (!/^[a-z]+$/.test(word)) {
    return { ok: false, message: `word "${word}" 须为纯小写字母` };
  }
```

在「未大于游标」校验之后：

```typescript
  if (minWordExclusive && !isDenseWordProgression(minWordExclusive, word)) {
    return {
      ok: false,
      message: `word "${word}" 相对游标 "${minWordExclusive}" 跨度过大（须密推进）`,
    };
  }
```

在 `buildGeneratePrompt` 的返回数组中追加类似文案（英文即可，与现有 prompt 一致）：

```typescript
    'Choose the next words densely after the cursor: prefer near-consecutive common dictionary words.',
    'Adjacent words usually share the same first letter, and their second letters must differ by at most 2 (e.g. advocate→advice/affect OK; advocate→airport or advocate→kindle NOT OK).',
    'Only when finishing a letter, advance to the immediate next letter with second letter a–c (e.g. azure→baby OK; azure→brown/kindle NOT OK).',
    'Do not jump far ahead in the alphabet.',
```

- [ ] **Step 4: 跑测确认通过**

Run: `cd apps/api && pnpm test -- generate-questions.spec.ts`

Expected: 全部 PASS（含原有 stem/explanation 用例）

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai-tasks/generate-questions.ts apps/api/src/ai-tasks/generate-questions.spec.ts
git commit -m "$(cat <<'EOF'
feat: AI 出题校验与 prompt 强制单词密推进

EOF
)"
```

---

### Task 3: `runTask` 密度失败整轮 FAILED

**Files:**
- Modify: `apps/api/src/ai-tasks/ai-tasks.service.ts`
- Modify: `apps/api/src/ai-tasks/ai-tasks.service.spec.ts`

**Interfaces:**
- Consumes: `validateOneGeneratedQuestion` 返回的 `message`（密度失败含 `跨度过大`）
- Behavior: mock `generate` 直接返回已解析题目时，若任一带密度错误 → `FAILED`，`questionsCreated=0`，`lastWord` 不变，不调用 `question.create`

- [ ] **Step 1: 写失败单测**

在 `AiTasksService runTask` describe 中增加：

```typescript
  it('密度跨度过大时 FAILED 且游标不变', async () => {
    const { service, taskState, questionCreates } = createService({
      task: makeTask({ lastWord: 'advocate' }),
    });
    const result = await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate: async () => ({
        ok: true,
        questions: [
          {
            word: 'kindle',
            stem: 'Please kindle the fire carefully. What does "kindle" mean?',
            explanation: '点燃火。「kindle」表示点燃。',
            options: [
              { label: 'A', content: '点燃', isCorrect: true },
              { label: 'B', content: '熄灭', isCorrect: false },
            ],
          },
        ],
      }),
    });
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/跨度过大|密推进/);
    expect(result.questionsCreated).toBe(0);
    expect(taskState?.lastWord).toBe('advocate');
    expect(questionCreates).toHaveLength(0);
  });
```

注意：`makeTask` 默认 `optionCount` 须与假题目选项数一致（现有样例为 2；若默认是 4，改假题目或覆盖 `optionCount: 2`）。

- [ ] **Step 2: 跑测确认失败**

Run: `cd apps/api && pnpm test -- ai-tasks.service.spec.ts -t "密度跨度过大"`

Expected: FAIL（当前会 skip 坏题后因 `accepted.length===0` 失败，或错误信息不含密推进；若因 skip 导致 message 不同，仍应断言失败模式不符合「明确密度错误且不写题」——实现后以 `跨度过大` 为准）

- [ ] **Step 3: 改 `runTask` 校验循环**

将跳过逻辑改为密度错误立即失败：

```typescript
      const accepted: GeneratedQuestion[] = [];
      const skipMessages: string[] = [];
      let minWordExclusive = task.lastWord?.trim().toLowerCase() || null;
      for (const item of generated.questions) {
        const validated = validateOneGeneratedQuestion(
          item,
          task.optionCount,
          minWordExclusive,
        );
        if (!validated.ok) {
          if (/跨度过大|密推进/.test(validated.message)) {
            return await finish('FAILED', {
              errorMessage: validated.message,
            });
          }
          skipMessages.push(validated.message);
          continue;
        }
        accepted.push(validated.question);
        minWordExclusive = validated.question.word;
      }
```

- [ ] **Step 4: 跑测确认通过**

Run: `cd apps/api && pnpm test -- ai-tasks.service.spec.ts generate-questions.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai-tasks/ai-tasks.service.ts apps/api/src/ai-tasks/ai-tasks.service.spec.ts
git commit -m "$(cat <<'EOF'
fix: AI 任务遇单词跨度过大时整轮失败

EOF
)"
```

（若工作区还有 recoverInterruptedRuns 等无关 diff，**不要** `git add` 整个 service 文件中的无关意图；用 `git add -p` 或暂时 stash 无关改动后再提交。若无法分离，先与用户确认是否一并提交恢复 RUNNING 的改动。）

---

### Task 4: 同步 admin-ai-tasks 设计文档

**Files:**
- Modify: `docs/superpowers/specs/2026-08-03-admin-ai-tasks-design.md`

**Interfaces:**
- 无代码接口；文档与密推进 spec 对齐

- [ ] **Step 1: 更新出题约定**

在调度流水线第 4–5 步附近补充：

- Prompt / 校验要求单词**密推进**：同首字母且第 2 字母距离 ≤ 2；换字母仅允许下一字母且第 2 字母为 a–c
- 密度违规 → 整轮 `FAILED`，游标不前进
- 交叉引用：`2026-08-03-ai-task-dense-word-progression-design.md`

在「成功标准」中将「按单词字母序游标续写」改为「按单词字母序且密推进游标续写」。

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-08-03-admin-ai-tasks-design.md
git commit -m "$(cat <<'EOF'
docs: AI 任务设计补充单词密推进约定

EOF
)"
```

---

## Spec Coverage Self-Review

| Spec 要求 | Task |
|-----------|------|
| `isDenseWordProgression` + 常量 | Task 1 |
| 同字母 Δ≤2 / 换字母 a–c / 正反例 | Task 1–2 |
| `word` 须 `^[a-z]+$` | Task 2 |
| prompt 密推进说明 | Task 2 |
| validate + parse 整批失败 | Task 2 |
| runTask 整轮 FAILED、不写题、游标不变 | Task 3 |
| 同步 admin-ai-tasks 设计 | Task 4 |
| 不引入词表 / 不自动重试 | 未做（YAGNI） |

## Placeholder Scan

无 TBD/TODO；命令与代码均为可执行片段。

## Type Consistency

- `isDenseWordProgression(prev: string, next: string): boolean` 在 Task 1 定义，Task 2 消费
- 密度错误文案固定含 `跨度过大` 与 `密推进`，Task 3 用 `/跨度过大|密推进/` 匹配

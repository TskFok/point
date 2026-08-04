# AI 任务 entry.id 游标取词 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 去掉 AI 任务对 word 形态的限制，改为从 `entry` 按 `id` 升序取 `word`/`pos` 出题，并用 `entry.id` 作为跨轮游标。

**Architecture:** Prisma 将 `lastWord*` 迁移为 `lastEntryId*`（BigInt?）；`listNextEntryWords` 改为按 `id > cursor` 取行（保留 `lang_code='en'` 与 `pos IS NOT NULL`）；成功后游标推进为本批最大 `entry.id`。API/前端以十进制字符串暴露 id。校验删除 `WORD_PATTERN`，保留本批词表与题干质量校验。

**Tech Stack:** Prisma / PostgreSQL / NestJS / Jest / Next.js / OpenAPI / `@point-quest/api-client`

## Global Constraints

- 取词过滤仅保留：`lang_code = 'en'` 且 `pos IS NOT NULL`。
- 一行一题候选：无 `GROUP BY`、无 word 正则。
- 成功推进：`lastEntryId = max(本批取出的 entry.id)`（与部分题跳过无关）。
- 0 题成功或词库取尽：游标不变。
- API 视图中 `lastEntryId*` 用 `string | null`（BigInt → 十进制字符串）。
- `DictionaryWord`：`{ id: string; word: string; pos: string }`。
- 添加/修改功能须同步单元测试并通过。
- Spec：`docs/superpowers/specs/2026-08-04-ai-task-entry-id-cursor-design.md`

---

## File map

| 文件 | 职责 |
|------|------|
| `prisma/schema.prisma` | `lastWord*` → `lastEntryId*` |
| `prisma/migrations/0010_ai_task_last_entry_id/migration.sql` | 列迁移 + 可选索引 |
| `apps/api/src/ai-tasks/generate-questions.ts` | `DictionaryWord`、删 `WORD_PATTERN`、prompt 单 pos |
| `apps/api/src/ai-tasks/generate-questions.spec.ts` | 校验/prompt 单测 |
| `apps/api/src/ai-tasks/ai-tasks.service.ts` | 取词 SQL、游标推进、视图字段 |
| `apps/api/src/ai-tasks/ai-tasks.service.spec.ts` | runTask / 游标单测 |
| `apps/api/src/openapi/api-contract.models.ts` | DTO 字段改名 |
| `apps/api/src/openapi/create-openapi-document.spec.ts` | OpenAPI 断言 |
| `packages/api-client/src/schema.ts` | 由 `pnpm api:spec && pnpm api:client` 再生 |
| `apps/web/components/admin/ai-task-form.tsx` | 游标展示文案 |
| `apps/web/app/(admin)/admin/ai-tasks/page.tsx` | 列表/运行记录字段 |
| `apps/web/tests/admin-ai-task-form.test.tsx` | 表单单测 |
| `apps/web/tests/admin-ai-tasks-page.test.tsx` | 页面单测 |

---

### Task 1: Prisma 游标字段迁移

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/0010_ai_task_last_entry_id/migration.sql`

**Interfaces:**
- Produces: `AiTask.lastEntryId: BigInt | null`；`AiTaskRun.lastEntryIdBefore/After: BigInt | null`

- [ ] **Step 1: 更新 schema**

`model AiTask`：将 `lastWord String?` 替换为：

```prisma
  lastEntryId     BigInt?
```

`model AiTaskRun`：将 `lastWordBefore` / `lastWordAfter` 替换为：

```prisma
  lastEntryIdBefore BigInt?
  lastEntryIdAfter  BigInt?
```

- [ ] **Step 2: 写迁移 SQL**

`prisma/migrations/0010_ai_task_last_entry_id/migration.sql`：

```sql
-- AiTask: lastWord -> lastEntryId（存量清空，从最小 id 重新开始）
ALTER TABLE "AiTask" ADD COLUMN "lastEntryId" BIGINT;
ALTER TABLE "AiTask" DROP COLUMN "lastWord";

-- AiTaskRun: lastWordBefore/After -> lastEntryIdBefore/After
ALTER TABLE "AiTaskRun" ADD COLUMN "lastEntryIdBefore" BIGINT;
ALTER TABLE "AiTaskRun" ADD COLUMN "lastEntryIdAfter" BIGINT;
ALTER TABLE "AiTaskRun" DROP COLUMN "lastWordBefore";
ALTER TABLE "AiTaskRun" DROP COLUMN "lastWordAfter";

-- 按 lang_code + id 游标取词索引
CREATE INDEX IF NOT EXISTS entry_lang_id_idx ON entry (lang_code, id);
```

- [ ] **Step 3: 生成客户端**

Run: `pnpm exec prisma generate`  
Expected: 成功，无 error

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/0010_ai_task_last_entry_id/migration.sql
git commit -m "$(cat <<'EOF'
feat: AI 任务游标改为 lastEntryId

用 entry.id 替代字母序 lastWord，存量游标清空。
EOF
)"
```

---

### Task 2: DictionaryWord 与去掉 word 形态校验

**Files:**
- Modify: `apps/api/src/ai-tasks/generate-questions.ts`
- Modify: `apps/api/src/ai-tasks/generate-questions.spec.ts`

**Interfaces:**
- Produces: `DictionaryWord = { id: string; word: string; pos: string }`
- Consumes: 无

- [ ] **Step 1: 更新失败单测与夹具**

将 `abandonWords` 改为：

```ts
const abandonWords: DictionaryWord[] = [
  { id: '1', word: 'abandon', pos: 'verb' },
];
```

凡 `pos: ['verb']` / `pos: string[]` 的夹具改为单个 `pos: string`，并补上 `id`。

`buildGeneratePrompt` 相关断言：期望列表形如 `"abandon" (verb)`（不再是 `verb/noun` 拼接，除非单测自备多词性——本设计单行单 pos）。

新增/调整：

```ts
it('接受含连字符等非纯字母 word（不再强制 WORD_PATTERN）', () => {
  const result = validateOneGeneratedQuestion(
    {
      word: 'self-aware',
      stem: 'She became more self-aware after the talk. What does "self-aware" mean?',
      explanation: '她谈话后更有自我意识了。「self-aware」是形容词，表示有自我意识的。',
      options: [
        { label: 'A', content: '有自我意识的', isCorrect: true },
        { label: 'B', content: '疏忽的', isCorrect: false },
      ],
    },
    2,
    new Set(['self-aware']),
  );
  expect(result.ok).toBe(true);
});
```

删除任何断言「须为纯小写字母」且期望因 `WORD_PATTERN` 失败的用例（若有）。

- [ ] **Step 2: 跑单测确认失败**

Run: `pnpm --filter @point-quest/api test -- src/ai-tasks/generate-questions.spec.ts`  
Expected: FAIL（类型/pos 数组或新用例与旧实现不符）

- [ ] **Step 3: 改实现**

1. 类型：

```ts
export type DictionaryWord = {
  id: string;
  word: string;
  pos: string;
};
```

2. `buildGeneratePrompt` 中词列表改为：

```ts
`${index + 1}. "${item.word}" (${item.pos || 'unknown'})`
```

3. 删除 `const WORD_PATTERN = /^[a-z]+$/;` 及 `validateOneGeneratedQuestion` 中：

```ts
if (!WORD_PATTERN.test(word)) {
  return { ok: false, message: `word "${word}" 须为纯小写字母` };
}
```

其余校验（allowedWords、stem、options）保留。`normalizeWord` 仍 `trim().toLowerCase()`。

- [ ] **Step 4: 跑单测确认通过**

Run: `pnpm --filter @point-quest/api test -- src/ai-tasks/generate-questions.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai-tasks/generate-questions.ts apps/api/src/ai-tasks/generate-questions.spec.ts
git commit -m "$(cat <<'EOF'
feat: DictionaryWord 改为单行 pos 并去掉纯字母限制

entry 一行一题；校验不再拒绝非纯小写字母 word。
EOF
)"
```

---

### Task 3: listNextEntryWords 与 runTask 游标按 entry.id

**Files:**
- Modify: `apps/api/src/ai-tasks/ai-tasks.service.ts`
- Modify: `apps/api/src/ai-tasks/ai-tasks.service.spec.ts`

**Interfaces:**
- Consumes: `DictionaryWord`（Task 2）
- Produces:
  - `AiTaskView.lastEntryId: string | null`
  - `AiTaskRunView.lastEntryIdBefore/After: string | null`
  - `listNextEntryWords(lastEntryId: bigint | null, count: number): Promise<DictionaryWord[]>`

- [ ] **Step 1: 先改单测夹具与断言（TDD）**

1. `makeTask`：`lastWord` → `lastEntryId: null as bigint | null`（夹具用 `1n` / `100n` 等）。
2. mock update：`data.lastEntryId` 写入 `taskState.lastEntryId`。
3. run create / toRunView：`lastWordBefore/After` → `lastEntryIdBefore/After`（视图断言用字符串，如 `'10'`）。
4. `entryWords` 模拟 `$queryRaw` 返回：

```ts
Array<{ id: bigint; word: string; pos: string }>
// 默认：
[
  { id: 10n, word: 'abandon', pos: 'verb' },
  { id: 20n, word: 'ability', pos: 'noun' },
]
```

5. 关键断言替换：
   - 成功：`lastEntryIdAfter === '20'`，`taskState.lastEntryId === 20n`（本批最大 id，即使只接受 abandon）。
   - 「词表外跳过」成功后游标仍为本批最大 id `20n`（不再是已接受的 `abandon` word）。
   - 「游标推进」用例改名为「成功后游标推进到本批最大 entry.id」，断言 `20n` / `'20'`。
   - generate 收到的 words：

```ts
[
  { id: '10', word: 'abandon', pos: 'verb' },
  { id: '20', word: 'ability', pos: 'noun' },
]
```

6. 失败游标不变：`makeTask({ lastEntryId: 99n })` → 仍为 `99n`。

- [ ] **Step 2: 跑单测确认失败**

Run: `pnpm --filter @point-quest/api test -- src/ai-tasks/ai-tasks.service.spec.ts`  
Expected: FAIL（实现仍用 lastWord）

- [ ] **Step 3: 改 service 实现**

1. View 类型与 `toTaskView` / `toRunView`：

```ts
lastEntryId: row.lastEntryId?.toString() ?? null
// run:
lastEntryIdBefore: run.lastEntryIdBefore?.toString() ?? null
lastEntryIdAfter: run.lastEntryIdAfter?.toString() ?? null
```

2. `createRunningRun(..., lastEntryIdBefore: bigint | null)` 写入 `lastEntryIdBefore`。

3. `finish` 字段：`lastEntryIdAfter` / `nextLastEntryId`（bigint | null）；update task：`lastEntryId: fields.nextLastEntryId`。

4. 取词：

```ts
async listNextEntryWords(
  lastEntryId: bigint | null,
  count: number,
): Promise<DictionaryWord[]> {
  const rows = await this.prisma.$queryRaw<
    Array<{ id: bigint; word: string; pos: string }>
  >`
    SELECT e.id, e.word, e.pos
    FROM entry e
    WHERE e.lang_code = 'en'
      AND e.pos IS NOT NULL
      AND (${lastEntryId}::bigint IS NULL OR e.id > ${lastEntryId})
    ORDER BY e.id ASC
    LIMIT ${count}
  `;
  return rows.map((row) => ({
    id: row.id.toString(),
    word: row.word,
    pos: row.pos,
  }));
}
```

5. `runTask` 成功后：

```ts
const lastEntryIdAfter = words.reduce(
  (max, item) => {
    const id = BigInt(item.id);
    return id > max ? id : max;
  },
  BigInt(words[0]!.id),
);
return await finishAfterGenerate('SUCCESS', {
  questionsCreated: accepted.length,
  lastEntryIdAfter,
  nextLastEntryId: lastEntryIdAfter,
  errorMessage: /* 同前 skipMessages 摘要 */,
});
```

注意：游标取自**本批 `words`**，不是 `accepted`。

6. 错误文案可改为「entry 表 id 游标已到末尾」。

- [ ] **Step 4: 跑单测确认通过**

Run: `pnpm --filter @point-quest/api test -- src/ai-tasks/ai-tasks.service.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai-tasks/ai-tasks.service.ts apps/api/src/ai-tasks/ai-tasks.service.spec.ts
git commit -m "$(cat <<'EOF'
feat: AI 出题按 entry.id 升序取词并推进游标

去掉 word 正则与按词聚合；成功后游标为本批最大 id。
EOF
)"
```

---

### Task 4: OpenAPI DTO 与 api-client 再生

**Files:**
- Modify: `apps/api/src/openapi/api-contract.models.ts`
- Modify: `apps/api/src/openapi/create-openapi-document.spec.ts`
- Modify: `packages/api-client/src/schema.ts`（生成）

**Interfaces:**
- Produces: OpenAPI / client 中 `lastEntryId`、`lastEntryIdBefore`、`lastEntryIdAfter`（string | null）

- [ ] **Step 1: 改 DTO**

`AiTaskDto`：

```ts
@ApiPropertyOptional({ type: String, nullable: true, description: 'entry.id 游标' })
lastEntryId!: string | null;
```

`AiTaskRunDto`：

```ts
@ApiPropertyOptional({ type: String, nullable: true })
lastEntryIdBefore!: string | null;

@ApiPropertyOptional({ type: String, nullable: true })
lastEntryIdAfter!: string | null;
```

删除 `lastWord*`。

- [ ] **Step 2: 改 OpenAPI 单测断言**

将 `lastWord` / `lastWordBefore` / `lastWordAfter` 断言改为 `lastEntryId*`，类型仍为 string/nullable。

- [ ] **Step 3: 再生 spec 与 client**

Run:

```bash
pnpm api:spec && pnpm api:client
```

Expected: 成功；`packages/api-client/src/schema.ts` 出现 `lastEntryId*`，无 `lastWord*`。

- [ ] **Step 4: 跑相关单测**

Run:

```bash
pnpm --filter @point-quest/api test -- src/openapi/create-openapi-document.spec.ts
pnpm --filter @point-quest/api-client test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/openapi/api-contract.models.ts \
  apps/api/src/openapi/create-openapi-document.spec.ts \
  packages/api-client/src/schema.ts
# 若 generate 还改了其他 openapi 产物一并加入
git commit -m "$(cat <<'EOF'
feat: OpenAPI 将 AI 任务游标字段改为 lastEntryId

API 与 api-client 同步暴露 entry.id 游标字符串。
EOF
)"
```

---

### Task 5: 管理端展示 lastEntryId

**Files:**
- Modify: `apps/web/components/admin/ai-task-form.tsx`
- Modify: `apps/web/app/(admin)/admin/ai-tasks/page.tsx`
- Modify: `apps/web/tests/admin-ai-task-form.test.tsx`
- Modify: `apps/web/tests/admin-ai-tasks-page.test.tsx`

**Interfaces:**
- Consumes: api-client `lastEntryId*`（Task 4）

- [ ] **Step 1: 改页面与表单**

表单只读游标：

```tsx
<span>当前游标 lastEntryId</span>
<input
  readOnly
  value={initialTask?.lastEntryId ?? "（空，从最小 entry.id 开始）"}
/>
```

列表列：`task.lastEntryId ?? "—"`。

运行记录：`{run.lastEntryIdBefore ?? "∅"} → {run.lastEntryIdAfter ?? "∅"}`。

表头文案若写「lastWord」一并改为「lastEntryId」/「游标」。

- [ ] **Step 2: 改前端单测夹具**

`lastWord: "ability"` → `lastEntryId: "20"`；run 的 before/after 同理改为数字字符串。

- [ ] **Step 3: 跑前端单测**

Run:

```bash
pnpm --filter @point-quest/web test -- tests/admin-ai-task-form.test.tsx tests/admin-ai-tasks-page.test.tsx
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/admin/ai-task-form.tsx \
  apps/web/app/\(admin\)/admin/ai-tasks/page.tsx \
  apps/web/tests/admin-ai-task-form.test.tsx \
  apps/web/tests/admin-ai-tasks-page.test.tsx
git commit -m "$(cat <<'EOF'
feat: 管理端 AI 任务展示 lastEntryId 游标

列表、表单与运行记录对齐 entry.id 游标字段。
EOF
)"
```

---

### Task 6: 全量相关回归

**Files:** 无新文件（验证）

- [ ] **Step 1: API ai-tasks + openapi 单测**

Run:

```bash
pnpm --filter @point-quest/api test -- src/ai-tasks src/openapi/create-openapi-document.spec.ts
```

Expected: PASS

- [ ] **Step 2: Web 相关单测**

Run:

```bash
pnpm --filter @point-quest/web test -- tests/admin-ai-task-form.test.tsx tests/admin-ai-tasks-page.test.tsx
```

Expected: PASS

- [ ] **Step 3: 若有未提交的设计/计划文档，一并提交**

```bash
git add docs/superpowers/specs/2026-08-04-ai-task-entry-id-cursor-design.md \
  docs/superpowers/specs/2026-08-04-ai-task-entry-word-pos-design.md \
  docs/superpowers/plans/2026-08-04-ai-task-entry-id-cursor.md
git status
git commit -m "$(cat <<'EOF'
docs: AI 任务 entry.id 游标取词设计与实现计划

记录去掉 word 形态限制并按 id 推进的方案。
EOF
)"
```

（若已提交则跳过。）

---

## Spec coverage checklist

| Spec 要求 | Task |
|-----------|------|
| SQL 按 id 升序，仅 en + pos 非空 | Task 3 |
| 一行一题，无 GROUP BY / word 正则 | Task 2–3 |
| `lastEntryId*` 迁移，存量清空 | Task 1 |
| 成功游标 = 本批最大 id | Task 3 |
| 删 WORD_PATTERN | Task 2 |
| DictionaryWord `{id,word,pos}` | Task 2 |
| OpenAPI / api-client | Task 4 |
| 管理端展示 | Task 5 |
| 单元测试 | Task 2–6 |

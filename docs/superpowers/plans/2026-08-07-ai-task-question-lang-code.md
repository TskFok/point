# AI 任务 / 题目语言选项（langCode）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 任务与题目支持 `langCode`（en/ja/it/fr/de）：按语言从 entry 取词、切换 Prompt/点名校验，并把语言写入 Question。

**Architecture:** Prisma 为 `AiTask` / `Question` 增加 `langCode`（默认 `en`）。共享 `normalizeLangCode` 与 Prompt 模板表；`listNextEntryWords` 按语言过滤；改任务语言时强制清空 `lastEntryId`；管理端表单/列表/题目筛选暴露语言；学生 DTO 只读返回 `langCode`，不改分流。

**Tech Stack:** NestJS、Prisma、class-validator、Next.js、Jest、OpenAPI / `@point-quest/api-client`。

## Global Constraints

- Spec：`docs/superpowers/specs/2026-08-07-ai-task-question-lang-code-design.md`
- 语言枚举仅：`en` / `ja` / `it` / `fr` / `de`（展示：英语/日语/意大利语/法语/德语）
- 选项与 explanation 仍为中文；仅例句 + 点名问句随语言变
- `wordMatchRules` 不随语言自动切换默认值
- 改 `AiTask.langCode` 时强制 `lastEntryId = null`，并忽略同次请求的 `lastEntryId`
- 学生端不按语言过滤练题
- 改 API 后执行 `pnpm api:spec` 与 `pnpm api:client`
- 新增/修改功能必须带单元测试且通过
- 禁止循环内 N+1 查库；禁止写入真实敏感信息

## File Structure

| 路径 | 职责 |
|------|------|
| `apps/api/src/common/lang-code.ts` | 枚举、标签、`normalizeLangCode` |
| `apps/api/src/common/lang-code.spec.ts` | 归一化单测 |
| `prisma/schema.prisma` | `AiTask.langCode` / `Question.langCode` |
| `prisma/migrations/0013_ai_task_question_lang_code/migration.sql` | 加列 + 索引 |
| `apps/api/src/ai-tasks/generate-questions.ts` | Prompt 模板 + `stemNamesTargetWord(langCode)` |
| `apps/api/src/ai-tasks/generate-questions.spec.ts` | Prompt/校验多语言单测 |
| `apps/api/src/ai-tasks/dto/create-ai-task.dto.ts` | 可选 `langCode` |
| `apps/api/src/ai-tasks/dto/update-ai-task.dto.ts` | 可选 `langCode` |
| `apps/api/src/ai-tasks/ai-tasks.service.ts` | CRUD / 取词 / 出题写入语言 / 改语言清游标 |
| `apps/api/src/ai-tasks/ai-tasks.service.spec.ts` | 服务单测 |
| `apps/api/src/questions/dto/*.ts` | 题目 create/update/list `langCode` |
| `apps/api/src/questions/questions.service.ts` | 读写与列表筛选 |
| `apps/api/src/questions/questions.service.spec.ts` | 题目服务单测 |
| `apps/api/src/practice/practice-response.mapper.ts` | Learner/Preview 带 `langCode` |
| `apps/api/src/practice/practice.service.ts` | select 增加 `langCode` |
| `apps/api/src/openapi/api-contract.models.ts` | OpenAPI 模型 |
| `apps/api/src/openapi/create-openapi-document.spec.ts` | 契约断言 |
| `packages/api-client/src/schema.ts` | 生成客户端 |
| `apps/web/lib/lang-code.ts` | 前端枚举与标签 |
| `apps/web/components/admin/ai-task-form.tsx` | 语言下拉 |
| `apps/web/app/(admin)/admin/ai-tasks/page.tsx` | 列表展示语言 |
| `apps/web/components/admin/question-form.tsx` | 语言下拉 |
| `apps/web/app/(admin)/admin/questions/page.tsx` | 列表展示 + 筛选 |
| 对应 `apps/web/tests/*.test.tsx` | 前端单测 |

---

### Task 1: 共享 LangCode + Prisma 迁移

**Files:**
- Create: `apps/api/src/common/lang-code.ts`
- Create: `apps/api/src/common/lang-code.spec.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/0013_ai_task_question_lang_code/migration.sql`

**Interfaces:**
- Produces:
  - `export const LANG_CODES = ['en','ja','it','fr','de'] as const`
  - `export type LangCode = (typeof LANG_CODES)[number]`
  - `export const LANG_CODE_LABELS: Record<LangCode, string>`
  - `export const DEFAULT_LANG_CODE: LangCode = 'en'`
  - `export function normalizeLangCode(value: unknown, fieldName?: string): LangCode`
  - `export function isLangCode(value: unknown): value is LangCode`

- [ ] **Step 1: 写失败单测**

创建 `apps/api/src/common/lang-code.spec.ts`：

```ts
import { DEFAULT_LANG_CODE, isLangCode, normalizeLangCode } from './lang-code';

describe('lang-code', () => {
  it('接受五种语言码', () => {
    for (const code of ['en', 'ja', 'it', 'fr', 'de'] as const) {
      expect(normalizeLangCode(code)).toBe(code);
      expect(isLangCode(code)).toBe(true);
    }
  });

  it('省略或空串时默认 en', () => {
    expect(normalizeLangCode(undefined)).toBe(DEFAULT_LANG_CODE);
    expect(normalizeLangCode(null)).toBe(DEFAULT_LANG_CODE);
    expect(normalizeLangCode('')).toBe(DEFAULT_LANG_CODE);
    expect(normalizeLangCode('  ')).toBe(DEFAULT_LANG_CODE);
  });

  it('非法值抛 VALIDATION_FAILED 风格错误或 Error（与项目 validationFailed 一致）', () => {
    expect(() => normalizeLangCode('zh')).toThrow(/语言|lang/i);
    expect(() => normalizeLangCode(1)).toThrow(/语言|lang/i);
  });
});
```

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter @point-quest/api test -- src/common/lang-code.spec.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `lang-code.ts`**

```ts
import { BadRequestException } from '@nestjs/common';

export const LANG_CODES = ['en', 'ja', 'it', 'fr', 'de'] as const;
export type LangCode = (typeof LANG_CODES)[number];
export const DEFAULT_LANG_CODE: LangCode = 'en';

export const LANG_CODE_LABELS: Record<LangCode, string> = {
  en: '英语',
  ja: '日语',
  it: '意大利语',
  fr: '法语',
  de: '德语',
};

export function isLangCode(value: unknown): value is LangCode {
  return typeof value === 'string' && (LANG_CODES as readonly string[]).includes(value);
}

export function normalizeLangCode(
  value: unknown,
  fieldName = '语言',
): LangCode {
  if (value === undefined || value === null) return DEFAULT_LANG_CODE;
  if (typeof value !== 'string') {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: `${fieldName}不合法`,
    });
  }
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_LANG_CODE;
  if (!isLangCode(trimmed)) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: `${fieldName}须为 en/ja/it/fr/de 之一`,
    });
  }
  return trimmed;
}
```

若项目 AI/题目服务统一用本地 `validationFailed()` helper，则改用同一 helper，保持错误 shape 一致（`response.code === 'VALIDATION_FAILED'`）。

- [ ] **Step 4: 跑测通过**

Run: `pnpm --filter @point-quest/api test -- src/common/lang-code.spec.ts`
Expected: PASS

- [ ] **Step 5: Prisma schema + migration**

在 `Question` model 增加：

```prisma
  langCode    String             @default("en")
  // ... existing fields ...
  @@index([langCode, isActive])
```

在 `AiTask` model 增加：

```prisma
  langCode        String       @default("en")
```

Migration `prisma/migrations/0013_ai_task_question_lang_code/migration.sql`：

```sql
-- AiTask / Question: langCode (en|ja|it|fr|de), default en
ALTER TABLE "AiTask"
ADD COLUMN "langCode" TEXT NOT NULL DEFAULT 'en';

ALTER TABLE "Question"
ADD COLUMN "langCode" TEXT NOT NULL DEFAULT 'en';

CREATE INDEX "Question_langCode_isActive_idx" ON "Question" ("langCode", "isActive");
```

Run: `pnpm db:generate`

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common/lang-code.ts apps/api/src/common/lang-code.spec.ts prisma/schema.prisma prisma/migrations/0013_ai_task_question_lang_code/migration.sql
git commit -m "$(cat <<'EOF'
feat(db): AiTask/Question 增加 langCode

支持 en/ja/it/fr/de，存量默认英语，并加题目语言索引。

EOF
)"
```

---

### Task 2: Prompt 与 stemNamesTargetWord 多语言（TDD）

**Files:**
- Modify: `apps/api/src/ai-tasks/generate-questions.ts`
- Modify: `apps/api/src/ai-tasks/generate-questions.spec.ts`

**Interfaces:**
- Consumes: `LangCode` from `../common/lang-code`
- Produces:
  - `buildGeneratePrompt({ words, optionCount, wordMatchRules, langCode })`
  - `stemNamesTargetWord(stem, word, langCode = 'en')`
  - `validateOneGeneratedQuestion(..., langCode?)` / `parseGeneratedQuestionsJson(..., langCode?)` / `GenerateQuestionsInput.langCode` 贯通传递（默认 `en`）

- [ ] **Step 1: 写失败单测**

在 `generate-questions.spec.ts` 追加（保留既有 en 用例，给 `buildGeneratePrompt` / `stemNamesTargetWord` 补默认 `langCode: 'en'` 调用处）：

```ts
import { buildGeneratePrompt, stemNamesTargetWord } from './generate-questions';

it('ja prompt 要求日文例句与点名问句', () => {
  const p = buildGeneratePrompt({
    words: [{ id: '1', word: '食べる', pos: 'verb' }],
    optionCount: 4,
    wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    langCode: 'ja',
  });
  expect(p).toMatch(/Japanese|日語|日语|日本語|target language/i);
  expect(p).toContain('「WORD」はどういう意味ですか？');
  expect(p).not.toMatch(/What does \\"WORD\\" mean\?/);
});

it('stemNamesTargetWord 接受各语言点名问句', () => {
  expect(
    stemNamesTargetWord(
      'She left early. What does "leave" mean?',
      'leave',
      'en',
    ),
  ).toBe(true);
  expect(
    stemNamesTargetWord(
      '彼はパンを食べる。「食べる」はどういう意味ですか？',
      '食べる',
      'ja',
    ),
  ).toBe(true);
  expect(
    stemNamesTargetWord(
      'Lui mangia pane. Che cosa significa "mangiare"?',
      'mangiare',
      'it',
    ),
  ).toBe(true);
  expect(
    stemNamesTargetWord(
      'Il mange du pain. Que signifie "manger" ?',
      'manger',
      'fr',
    ),
  ).toBe(true);
  expect(
    stemNamesTargetWord(
      'Er isst Brot. Was bedeutet "essen"?',
      'essen',
      'de',
    ),
  ).toBe(true);
});

it('stemNamesTargetWord 拒绝错误语言点名问句', () => {
  expect(
    stemNamesTargetWord(
      '彼はパンを食べる。What does "食べる" mean?',
      '食べる',
      'ja',
    ),
  ).toBe(false);
});
```

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter @point-quest/api test -- src/ai-tasks/generate-questions.spec.ts`
Expected: FAIL（`langCode` 参数 / ja 模板不存在）

- [ ] **Step 3: 实现模板与校验**

在 `generate-questions.ts` 增加：

```ts
import { type LangCode, DEFAULT_LANG_CODE } from '../common/lang-code';

type StemPromptProfile = {
  languageNameEn: string;
  askSuffixInstruction: string; // Prompt 中 Exact 后缀说明
  goodStemExample: string;
};

const STEM_PROMPT_BY_LANG: Record<LangCode, StemPromptProfile> = {
  en: {
    languageNameEn: 'English',
    askSuffixInstruction:
      'Exactly What does \\"WORD\\" mean? (WORD = the listed target word with escaped quotes)',
    goodStemExample:
      'The scholar claimed to abhor violence in all forms. What does \\"abhor\\" mean?',
  },
  ja: {
    languageNameEn: 'Japanese',
    askSuffixInstruction:
      'Exactly 「WORD」はどういう意味ですか？ (WORD = the listed target word; use Japanese corner brackets)',
    goodStemExample:
      '彼は毎朝パンを食べる。「食べる」はどういう意味ですか？',
  },
  it: {
    languageNameEn: 'Italian',
    askSuffixInstruction:
      'Exactly Che cosa significa \\"WORD\\"? (WORD = the listed target word with escaped quotes)',
    goodStemExample:
      'Lui mangia il pane ogni mattina. Che cosa significa \\"mangiare\\"?',
  },
  fr: {
    languageNameEn: 'French',
    askSuffixInstruction:
      'Exactly Que signifie \\"WORD\\" ? (WORD = the listed target word with escaped quotes; keep the space before ?)',
    goodStemExample:
      'Il mange du pain chaque matin. Que signifie \\"manger\\" ?',
  },
  de: {
    languageNameEn: 'German',
    askSuffixInstruction:
      'Exactly Was bedeutet \\"WORD\\"? (WORD = the listed target word with escaped quotes)',
    goodStemExample:
      'Er isst jeden Morgen Brot. Was bedeutet \\"essen\\"?',
  },
};
```

`buildGeneratePrompt` 使用 `langCode`（默认 `DEFAULT_LANG_CODE`）拼装「例句须为 `${languageNameEn}`」+ 对应 `askSuffixInstruction` / `goodStemExample`；选项与 explanation 仍要求中文。

`stemNamesTargetWord`：

```ts
export function stemNamesTargetWord(
  stem: string,
  word: string,
  langCode: LangCode = DEFAULT_LANG_CODE,
): boolean {
  const base = word.trim();
  if (!base) return false;
  const escaped = escapeRegExp(base);
  const q = `["'\\u201c\\u201d\\u300c]?${escaped}["'\\u201c\\u201d\\u300d]?`;
  const patterns: Record<LangCode, RegExp> = {
    en: new RegExp(`what\\s+does\\s+${q}\\s+mean\\s*\\?`, 'i'),
    ja: new RegExp(`[「"']?${escaped}[」"']?はどういう意味ですか\\s*？?`),
    it: new RegExp(`che\\s+cosa\\s+significa\\s+${q}\\s*\\?`, 'i'),
    fr: new RegExp(`que\\s+signifie\\s+${q}\\s*\\?`, 'i'),
    de: new RegExp(`was\\s+bedeutet\\s+${q}\\s*\\?`, 'i'),
  };
  return patterns[langCode].test(stem);
}
```

将 `langCode` 传入 `validateOneGeneratedQuestion` → `stemNamesTargetWord`；`GenerateQuestionsInput` / `parseGeneratedQuestionsJson` / `alignGeneratedQuestions` 增加可选 `langCode`（默认 `en`）。

- [ ] **Step 4: 跑测通过**

Run: `pnpm --filter @point-quest/api test -- src/ai-tasks/generate-questions.spec.ts`
Expected: PASS（含既有 en 用例）

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai-tasks/generate-questions.ts apps/api/src/ai-tasks/generate-questions.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): AI 出题 Prompt/点名校验支持多语言

按 langCode 切换例句语言与点名问句，选项与解析仍为中文。

EOF
)"
```

---

### Task 3: AiTasksService — langCode CRUD、取词、出题写入、改语言清游标

**Files:**
- Modify: `apps/api/src/ai-tasks/dto/create-ai-task.dto.ts`
- Modify: `apps/api/src/ai-tasks/dto/update-ai-task.dto.ts`
- Modify: `apps/api/src/ai-tasks/ai-tasks.service.ts`
- Modify: `apps/api/src/ai-tasks/ai-tasks.service.spec.ts`

**Interfaces:**
- Consumes: `normalizeLangCode`, `LangCode`, `generateQuestionsWithChatCompletions(..., langCode)`
- Produces:
  - `AiTaskView.langCode: string`
  - `create` / `update` 读写 `langCode`
  - `listNextEntryWords(lastEntryId, count, langCode)`
  - `update`：若 `langCode` 变更 → `lastEntryId = null`（忽略同次 `lastEntryId`）
  - `runTask`：取词与 generate 传入 `task.langCode`；`question.create` 写 `langCode`

- [ ] **Step 1: 写失败单测**

在 `ai-tasks.service.spec.ts`：

1. `makeTask` 增加 `langCode: 'en'`
2. 追加：

```ts
it('create 可指定 langCode', async () => {
  const { service } = createService();
  const created = await service.create(
    {
      name: '日语任务',
      aiModelConfigId: 'model-1',
      questionCount: 2,
      optionCount: 2,
      basePoints: 10,
      cronExpression: '0 8 * * *',
      langCode: 'ja',
    },
    'admin-1',
  );
  expect(created.langCode).toBe('ja');
});

it('create 省略 langCode 默认 en', async () => {
  const { service } = createService();
  const created = await service.create(
    {
      name: '英语任务',
      aiModelConfigId: 'model-1',
      questionCount: 2,
      optionCount: 2,
      basePoints: 10,
      cronExpression: '0 8 * * *',
    },
    'admin-1',
  );
  expect(created.langCode).toBe('en');
});

it('update 改 langCode 时清空 lastEntryId 并忽略同次游标', async () => {
  const { service, taskState } = createService({
    task: makeTask({ langCode: 'en', lastEntryId: 99n }),
  });
  const updated = await service.update(
    'task-1',
    { langCode: 'ja', lastEntryId: '42' },
    'admin-1',
  );
  expect(updated.langCode).toBe('ja');
  expect(updated.lastEntryId).toBeNull();
  expect(taskState?.lastEntryId).toBeNull();
});

it('update 同语言不清空 lastEntryId', async () => {
  const { service } = createService({
    task: makeTask({ langCode: 'en', lastEntryId: 77n }),
  });
  const updated = await service.update(
    'task-1',
    { langCode: 'en', name: '同语言' },
    'admin-1',
  );
  expect(updated.lastEntryId).toBe('77');
});

it('listNextEntryWords 按 langCode 过滤', async () => {
  const calls: unknown[] = [];
  const { service } = createService({
    // 若现有 mock 捕获 $queryRaw，断言 SQL/参数含 lang
    onQueryRaw: (args) => { calls.push(args); return []; },
  });
  await service.listNextEntryWords(null, 3, 'ja');
  // 断言 mock 收到的查询绑定含 'ja'（按现有 createService mock 写法适配）
  expect(JSON.stringify(calls)).toMatch(/ja/);
});

it('成功出题写入 Question.langCode', async () => {
  const { service, questionCreates } = createService({
    task: makeTask({ langCode: 'fr' }),
  });
  await service.runTask('task-1', {
    trigger: 'MANUAL',
    actorUserId: 'admin-1',
    generate: async () => ({ ok: true, questions: sampleQuestions }),
  });
  expect(questionCreates[0]?.data?.langCode).toBe('fr');
});
```

按现有 `createService` mock 结构适配 `langCode` 字段与 `question.create` 捕获；若 `$queryRaw` mock 不便解析，可改为对 `listNextEntryWords` 做轻量集成式 spy：临时替换 `prisma.$queryRaw` 并检查 strings/values。

同时给 `generate` 调用断言传入 `langCode`（若 generate mock 记录 input）。

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter @point-quest/api test -- src/ai-tasks/ai-tasks.service.spec.ts`
Expected: FAIL

- [ ] **Step 3: DTO + service 实现**

`create-ai-task.dto.ts` / `update-ai-task.dto.ts`：

```ts
import { IsIn, IsOptional, IsString } from 'class-validator';
import { LANG_CODES } from '../../common/lang-code';

// Create + Update:
@IsOptional()
@IsString()
@IsIn([...LANG_CODES])
langCode?: string;
```

`AiTaskView` / `toTaskView` 增加 `langCode: row.langCode`。

`create`：`const langCode = normalizeLangCode(input.langCode);` 写入 create data。

`update`：

```ts
if (input.langCode !== undefined) {
  const next = normalizeLangCode(input.langCode);
  data.langCode = next;
  if (next !== existing.langCode) {
    data.lastEntryId = null;
  }
}
if (input.lastEntryId !== undefined) {
  const langChanging =
    input.langCode !== undefined &&
    normalizeLangCode(input.langCode) !== existing.langCode;
  if (!langChanging) {
    data.lastEntryId = normalizeLastEntryId(input.lastEntryId);
  }
}
```

注意：若先设了 `data.lastEntryId = null`（改语言），不要再被后面的 `lastEntryId` 分支覆盖。

`listNextEntryWords`：

```ts
async listNextEntryWords(
  lastEntryId: bigint | null,
  count: number,
  langCode: LangCode = DEFAULT_LANG_CODE,
): Promise<DictionaryWord[]> {
  const rows = await this.prisma.$queryRaw<
    Array<{ id: bigint; word: string; pos: string }>
  >`
    SELECT e.id, e.word, e.pos
    FROM entry e
    WHERE e.lang_code = ${langCode}
      AND e.pos IS NOT NULL
      AND (${lastEntryId}::bigint IS NULL OR e.id > ${lastEntryId})
    ORDER BY e.id ASC
    LIMIT ${count}
  `;
  // map 同现有
}
```

`runTask`：调用 `listNextEntryWords(task.lastEntryId, task.questionCount, task.langCode as LangCode)`；`generate({ ..., langCode: task.langCode })`；`question.create` data 加 `langCode: task.langCode`。

- [ ] **Step 4: 跑测通过**

Run: `pnpm --filter @point-quest/api test -- src/ai-tasks/ai-tasks.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai-tasks
git commit -m "$(cat <<'EOF'
feat(api): AI 任务按 langCode 取词出题

任务可配置语言；改语言清空游标；生成题写入 Question.langCode。

EOF
)"
```

---

### Task 4: QuestionsService — langCode 读写与列表筛选

**Files:**
- Modify: `apps/api/src/questions/dto/create-question.dto.ts`（`QuestionWriteDto`）
- Modify: `apps/api/src/questions/dto/update-question.dto.ts`（若独立字段则同步）
- Modify: `apps/api/src/questions/dto/list-questions.dto.ts`
- Modify: `apps/api/src/questions/questions.service.ts`
- Modify: `apps/api/src/questions/questions.service.spec.ts`

**Interfaces:**
- Produces:
  - 题目视图含 `langCode: string`
  - create/update 接受可选 `langCode`（默认 `en`）
  - `ListQuestionsDto.langCode?: string` → `where.langCode`

- [ ] **Step 1: 写失败单测**

```ts
it('create 可指定 langCode', async () => {
  // 按现有 questions.service.spec create mock 风格
  const created = await service.create(
    { ...validWriteBody, langCode: 'de' },
    'admin-1',
  );
  expect(created.langCode).toBe('de');
});

it('list 可按 langCode 筛选', async () => {
  const findMany = jest.fn().mockResolvedValue([]);
  // mock prisma.question.findMany / count
  await service.list({ page: 1, pageSize: 20, langCode: 'ja' });
  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ langCode: 'ja' }),
    }),
  );
});
```

非法 `langCode` 应 VALIDATION_FAILED（DTO `IsIn` 或 service `normalizeLangCode`）。

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter @point-quest/api test -- src/questions/questions.service.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

DTO：

```ts
@IsOptional()
@IsString()
@IsIn([...LANG_CODES])
langCode?: string;
```

`list-questions.dto.ts` 同样加可选 `langCode` + `@IsIn([...LANG_CODES])`。

Service：
- `normalizeQuestionWrite` / update：`langCode: normalizeLangCode(input.langCode)`（update 仅当 `!== undefined`）
- create data 写 `langCode`
- list `where`：`...(query.langCode ? { langCode: query.langCode } : {})`
- 映射到 admin 视图时返回 `langCode`

- [ ] **Step 4: 跑测通过**

Run: `pnpm --filter @point-quest/api test -- src/questions/questions.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/questions
git commit -m "$(cat <<'EOF'
feat(api): 题目支持 langCode 读写与筛选

管理端建题可设语言，列表可按语言过滤。

EOF
)"
```

---

### Task 5: 学生侧 DTO 返回 langCode

**Files:**
- Modify: `apps/api/src/practice/practice-response.mapper.ts`
- Modify: `apps/api/src/practice/practice.service.ts`（所有 `select`/`include` 题目字段加 `langCode: true`）
- Modify: `apps/api/src/practice/practice.service.spec.ts`（`mapLearnerQuestion` 期望含 `langCode`）

**Interfaces:**
- Produces: `mapLearnerQuestion` / `mapPreviewQuestion` 输出含 `langCode: string`

- [ ] **Step 1: 写失败单测**

更新 `practice.service.spec.ts` 中：

```ts
expect(mapLearnerQuestion(question)).toEqual({
  id: 'q1',
  stem: 'Choose one.',
  langCode: 'en',
  basePoints: 10,
  options: expect.any(Array),
});
```

给 fixture `question` 加 `langCode: 'en'`。

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter @point-quest/api test -- src/practice/practice.service.spec.ts`
Expected: FAIL（缺 langCode）

- [ ] **Step 3: 实现**

```ts
type LearnerQuestionInput = {
  id: string;
  stem: string;
  langCode: string;
  basePoints: number;
  options: Array<{ id: string; label: string; content: string; position: number }>;
};

export function mapLearnerQuestion(question: LearnerQuestionInput) {
  return {
    id: question.id,
    stem: question.stem,
    langCode: question.langCode,
    basePoints: question.basePoints,
    options: question.options.map(/* 同现有 */),
  };
}
```

`practice.service.ts` 所有题目 `select` 增加 `langCode: true`。

- [ ] **Step 4: 跑测通过**

Run: `pnpm --filter @point-quest/api test -- src/practice/practice.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/practice
git commit -m "$(cat <<'EOF'
feat(api): 学生题目 DTO 返回 langCode

练题/预览只读携带语言，不改变分流逻辑。

EOF
)"
```

---

### Task 6: OpenAPI 契约 + 生成客户端

**Files:**
- Modify: `apps/api/src/openapi/api-contract.models.ts`
- Modify: `apps/api/src/openapi/create-openapi-document.spec.ts`
- Generate: OpenAPI JSON + `packages/api-client/src/schema.ts`

**Interfaces:**
- Produces: 下列 schema 属性 `langCode`（enum `en|ja|it|fr|de`）
  - `AiTaskDto`, `CreateAiTaskRequestDto`, `UpdateAiTaskRequestDto`
  - `AdminQuestionDto`, `CreateQuestionRequestDto`, `UpdateQuestionRequestDto`
  - list questions query（若契约暴露 query）
  - `LearnerQuestionDto`, `PreviewQuestionDto`

- [ ] **Step 1: 写失败契约断言**

在 `create-openapi-document.spec.ts`：

```ts
expect(aiTask.properties?.langCode).toMatchObject({
  type: 'string',
  enum: ['en', 'ja', 'it', 'fr', 'de'],
});
expect(adminQuestion.properties?.langCode).toMatchObject({
  type: 'string',
  enum: ['en', 'ja', 'it', 'fr', 'de'],
});
expect(learnerQuestion.properties?.langCode).toMatchObject({
  type: 'string',
  enum: ['en', 'ja', 'it', 'fr', 'de'],
});
```

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter @point-quest/api test -- src/openapi/create-openapi-document.spec.ts`
Expected: FAIL

- [ ] **Step 3: 更新 api-contract.models.ts**

对相关 DTO 增加：

```ts
@ApiProperty({ enum: ['en', 'ja', 'it', 'fr', 'de'], default: 'en' })
langCode!: string;

// request optional:
@ApiPropertyOptional({ enum: ['en', 'ja', 'it', 'fr', 'de'] })
langCode?: string;
```

若 list questions 的 query 在 OpenAPI 中声明，同步加可选 `langCode`。

- [ ] **Step 4: 生成并测通**

```bash
pnpm api:spec
pnpm api:client
pnpm --filter @point-quest/api test -- src/openapi/create-openapi-document.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/openapi packages/api-client
git commit -m "$(cat <<'EOF'
feat(api): OpenAPI 暴露 langCode 并刷新客户端

AI 任务与题目契约增加语言枚举字段。

EOF
)"
```

---

### Task 7: 管理端 AI 任务表单与列表

**Files:**
- Create: `apps/web/lib/lang-code.ts`
- Modify: `apps/web/components/admin/ai-task-form.tsx`
- Modify: `apps/web/tests/admin-ai-task-form.test.tsx`
- Modify: `apps/web/app/(admin)/admin/ai-tasks/page.tsx`
- Modify: `apps/web/tests/admin-ai-tasks-page.test.tsx`（若有列表列断言）

**Interfaces:**
- Produces: 表单 state `langCode`，create/update payload 含 `langCode`；列表展示中文标签

- [ ] **Step 1: 写失败前端单测**

`apps/web/lib/lang-code.ts` 可先写常量（无测亦可）；表单测：

```tsx
it('提交包含 langCode', async () => {
  const createAdminAiTask = jest.fn().mockResolvedValue({
    id: 't1',
    langCode: 'ja',
    // ...最小 AiTaskDto 字段
  });
  render(
    <AiTaskForm
      mode="create"
      models={[{ id: 'm1', name: 'model' }]}
      api={{ createAdminAiTask, updateAdminAiTask: jest.fn() }}
    />,
  );
  await user.selectOptions(screen.getByLabelText('语言'), 'ja');
  // 填必填项后保存（沿用现有测试填法）
  await user.click(screen.getByRole('button', { name: /保存/ }));
  await waitFor(() =>
    expect(createAdminAiTask).toHaveBeenCalledWith(
      expect.objectContaining({ langCode: 'ja' }),
    ),
  );
});
```

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter @point-quest/web test -- tests/admin-ai-task-form.test.tsx`
Expected: FAIL（无语言控件）

- [ ] **Step 3: 实现**

`apps/web/lib/lang-code.ts`：

```ts
export const LANG_CODES = ['en', 'ja', 'it', 'fr', 'de'] as const;
export type LangCode = (typeof LANG_CODES)[number];
export const DEFAULT_LANG_CODE: LangCode = 'en';
export const LANG_CODE_LABELS: Record<LangCode, string> = {
  en: '英语',
  ja: '日语',
  it: '意大利语',
  fr: '法语',
  de: '德语',
};
```

表单：`useState(initialTask?.langCode ?? DEFAULT_LANG_CODE)`；`<select aria-label="语言">` 选项来自 `LANG_CODES`；payload 加 `langCode`。编辑时若用户改语言，保存成功后 `onSaved` 任务的 `lastEntryId` 应为 `null`（依赖后端）；前端不必本地抢清，但若回写 `initialTask` 应用服务端响应。

列表页表格增加「语言」列：`LANG_CODE_LABELS[task.langCode] ?? task.langCode`。

- [ ] **Step 4: 跑测通过**

Run: `pnpm --filter @point-quest/web test -- tests/admin-ai-task-form.test.tsx tests/admin-ai-tasks-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/lang-code.ts apps/web/components/admin/ai-task-form.tsx apps/web/tests/admin-ai-task-form.test.tsx apps/web/app/\(admin\)/admin/ai-tasks/page.tsx apps/web/tests/admin-ai-tasks-page.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): AI 任务管理支持语言选项

表单可选语言，列表展示语言标签。

EOF
)"
```

---

### Task 8: 管理端题目表单、列表展示与语言筛选

**Files:**
- Modify: `apps/web/components/admin/question-form.tsx`
- Modify: `apps/web/tests/question-form-dialog.test.tsx`（或对应表单测）
- Modify: `apps/web/app/(admin)/admin/questions/page.tsx`
- Modify: `apps/web/tests/` 下题库页相关测试（若存在）

**Interfaces:**
- Produces: 题目表单 `langCode`；列表列 + URL/`listAdminQuestions` 查询参数 `langCode`

- [ ] **Step 1: 写失败单测**

```tsx
it('创建题目提交 langCode', async () => {
  const createAdminQuestion = jest.fn().mockResolvedValue({
    id: 'q1',
    langCode: 'it',
    // ...
  });
  // render QuestionForm create；选择意大利语；填必填；保存
  await waitFor(() =>
    expect(createAdminQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ langCode: 'it' }),
    ),
  );
});
```

题库页：筛选选择「日语」后 `listAdminQuestions` 带 `langCode: 'ja'`（按现有 page 测试风格）。

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter @point-quest/web test -- tests/question-form-dialog.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现**

- `QuestionForm`：state `langCode`，默认 `initialQuestion?.langCode ?? 'en'`；下拉；create/update payload 含 `langCode`
- `questions/page.tsx`：
  - `Filters` 增加 `langCode: string`（空=全部）
  - URL 读写 `langCode`
  - `listAdminQuestions({ ..., langCode: applied || undefined })`
  - 筛选行增加语言 `<select aria-label="语言">`（含「全部」）
  - 表格增加语言列

- [ ] **Step 4: 跑测通过**

Run: `pnpm --filter @point-quest/web test -- tests/question-form-dialog.test.tsx`
（若有 questions page 测试一并跑）

Expected: PASS

- [ ] **Step 5: 回归相关 API/Web 测试**

```bash
pnpm --filter @point-quest/api test -- src/common/lang-code.spec.ts src/ai-tasks/generate-questions.spec.ts src/ai-tasks/ai-tasks.service.spec.ts src/questions/questions.service.spec.ts src/practice/practice.service.spec.ts src/openapi/create-openapi-document.spec.ts
pnpm --filter @point-quest/web test -- tests/admin-ai-task-form.test.tsx tests/admin-ai-tasks-page.test.tsx tests/question-form-dialog.test.tsx
```

Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/admin/question-form.tsx apps/web/app/\(admin\)/admin/questions/page.tsx apps/web/tests
git commit -m "$(cat <<'EOF'
feat(web): 题库管理支持语言与筛选

题目表单可选语言，列表展示并按语言筛选。

EOF
)"
```

---

## Spec Coverage Checklist

| Spec 要求 | Task |
|-----------|------|
| `AiTask.langCode` + 默认 en | 1, 3 |
| `Question.langCode` + 索引 + 默认 en | 1, 4 |
| 取词按 `entry.lang_code` | 3 |
| Prompt 五语言点名模板；选项/解析中文 | 2 |
| `stemNamesTargetWord` 多语言 | 2 |
| 出题写入 `Question.langCode` | 3 |
| 改语言清空游标并忽略同次游标 | 3 |
| 题目 CRUD + 列表筛选 | 4, 8 |
| 学生 DTO 只读 langCode | 5 |
| OpenAPI / api-client | 6 |
| AI 任务 / 题目管理 UI | 7, 8 |
| 不改 wordMatchRules 默认；不改学生分流 | 全局约束（无额外任务） |

## Self-Review Notes

- 无 TBD/占位步骤；`createService` / questions mock 细节要求实现者按现有测试 harness 适配断言，但行为与期望值已写明。
- `normalizeLangCode` 错误类型须与 `ai-tasks.service` / `questions.service` 既有 `validationFailed` 对齐（Task 1 允许改用 helper）。
- Task 3 的 update 分支顺序：改语言清游标必须优先于手动 `lastEntryId`。

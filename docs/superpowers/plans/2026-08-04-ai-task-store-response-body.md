# AI 任务响应体落库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在可配置开关下，将 AI `chat/completions` 完整 HTTP 响应体写入 `AiTaskRun.aiResponseBody`。

**Architecture:** `generateQuestionsWithChatCompletions` 在读到 `response.text()` 后把原文挂到结果的 `responseBody`；`AiTasksService.runTask` 根据 `AI_TASK_STORE_RESPONSE_BODY` 决定是否在 `finish` 时写入 DB。管理端 API / DTO 不暴露该字段。

**Tech Stack:** Prisma / PostgreSQL / NestJS / Jest

## Global Constraints

- 存完整 HTTP raw body；默认开关关闭。
- 开启判定：`true` / `1` / `yes`（大小写不敏感）；其余或未设置关闭。
- 写入条件：开关开且 `typeof responseBody === 'string'`（含空串）。
- API / OpenAPI / 管理端页面不暴露 `aiResponseBody`。
- 添加/修改功能须同步单元测试并通过。
- Spec：`docs/superpowers/specs/2026-08-04-ai-task-store-response-body-design.md`

---

## File map

| 文件 | 职责 |
|------|------|
| `prisma/schema.prisma` | `AiTaskRun.aiResponseBody` |
| `prisma/migrations/0008_add_ai_task_run_response_body/migration.sql` | 加列迁移 |
| `apps/api/src/ai-tasks/ai-response-body-config.ts` | 解析环境开关 |
| `apps/api/src/ai-tasks/ai-response-body-config.spec.ts` | 开关解析单测 |
| `apps/api/src/ai-tasks/generate-questions.ts` | 结果附带 `responseBody` |
| `apps/api/src/ai-tasks/generate-questions.spec.ts` | 响应体携带单测 |
| `apps/api/src/ai-tasks/ai-tasks.service.ts` | 按开关落库 |
| `apps/api/src/ai-tasks/ai-tasks.service.spec.ts` | 落库行为单测 |
| `.env.example` / `.env.docker` / `.env.docker.example` | 变量默认 `false` |
| 可选本地 `.env` | 若存在则追加同变量 |

---

### Task 1: Prisma 字段与迁移

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/0008_add_ai_task_run_response_body/migration.sql`

**Interfaces:**
- Produces: `AiTaskRun.aiResponseBody: string | null`（Prisma `String? @db.Text`）

- [ ] **Step 1: 更新 schema**

在 `model AiTaskRun` 的 `errorMessage` 后增加：

```prisma
  errorMessage     String?
  aiResponseBody   String?          @db.Text
  aiTask           AiTask           @relation(fields: [aiTaskId], references: [id], onDelete: Cascade)
```

- [ ] **Step 2: 写迁移 SQL**

`prisma/migrations/0008_add_ai_task_run_response_body/migration.sql`：

```sql
-- AlterTable
ALTER TABLE "AiTaskRun" ADD COLUMN "aiResponseBody" TEXT;
```

- [ ] **Step 3: 生成客户端**

Run: `pnpm exec prisma generate`  
Expected: 成功，无 error

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/0008_add_ai_task_run_response_body/migration.sql
git commit -m "$(cat <<'EOF'
feat: AiTaskRun 增加 aiResponseBody 字段

为可选落库 AI HTTP 完整响应体做准备。
EOF
)"
```

---

### Task 2: 环境开关解析

**Files:**
- Create: `apps/api/src/ai-tasks/ai-response-body-config.ts`
- Create: `apps/api/src/ai-tasks/ai-response-body-config.spec.ts`
- Modify: `.env.example`、`.env.docker`、`.env.docker.example`（及可选 `.env`）

**Interfaces:**
- Produces: `export function isAiTaskStoreResponseBodyEnabled(env?: NodeJS.ProcessEnv): boolean`
- Produces: env key `AI_TASK_STORE_RESPONSE_BODY`

- [ ] **Step 1: 写失败测试**

`apps/api/src/ai-tasks/ai-response-body-config.spec.ts`：

```ts
import { isAiTaskStoreResponseBodyEnabled } from './ai-response-body-config';

describe('isAiTaskStoreResponseBodyEnabled', () => {
  it.each(['true', 'TRUE', '1', 'yes', 'Yes'])(
    '开启值 %s',
    (value) => {
      expect(
        isAiTaskStoreResponseBodyEnabled({
          AI_TASK_STORE_RESPONSE_BODY: value,
        }),
      ).toBe(true);
    },
  );

  it.each(['false', '0', 'no', '', 'maybe', undefined])(
    '关闭值 %s',
    (value) => {
      expect(
        isAiTaskStoreResponseBodyEnabled(
          value === undefined
            ? {}
            : { AI_TASK_STORE_RESPONSE_BODY: value },
        ),
      ).toBe(false);
    },
  );
});
```

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter api test -- ai-response-body-config`  
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`apps/api/src/ai-tasks/ai-response-body-config.ts`：

```ts
const ENV_KEY = 'AI_TASK_STORE_RESPONSE_BODY';

export function isAiTaskStoreResponseBodyEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env[ENV_KEY]?.trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}
```

- [ ] **Step 4: 环境文件追加**

在 `.env.example`、`.env.docker`、`.env.docker.example` 末尾追加：

```bash
# 是否将 AI chat/completions 完整 HTTP 响应体写入 AiTaskRun.aiResponseBody（默认关闭）
AI_TASK_STORE_RESPONSE_BODY=false
```

若仓库根存在 `.env`，同样追加（勿提交含密钥的 `.env`）。

- [ ] **Step 5: 跑测通过并 Commit**

Run: `pnpm --filter api test -- ai-response-body-config`  
Expected: PASS

```bash
git add apps/api/src/ai-tasks/ai-response-body-config.ts \
  apps/api/src/ai-tasks/ai-response-body-config.spec.ts \
  .env.example .env.docker .env.docker.example
git commit -m "$(cat <<'EOF'
feat: 增加 AI_TASK_STORE_RESPONSE_BODY 开关解析

默认关闭，仅 true/1/yes 时启用响应体落库。
EOF
)"
```

---

### Task 3: generate 结果附带 responseBody

**Files:**
- Modify: `apps/api/src/ai-tasks/generate-questions.ts`
- Modify: `apps/api/src/ai-tasks/generate-questions.spec.ts`

**Interfaces:**
- Consumes: 现有 `generateQuestionsWithChatCompletions`
- Produces:

```ts
export type GenerateQuestionsResult =
  | { ok: true; questions: GeneratedQuestion[]; responseBody?: string }
  | { ok: false; message: string; responseBody?: string };
```

- [ ] **Step 1: 写/改测试**

1. 成功路径断言：`result.ok === true` 且 `result.responseBody` 等于 mock `text()` 返回的完整 JSON 字符串。
2. HTTP 401 路径：将现有 `toEqual` 改为同时期望 `responseBody` 为该次 body 原文（例如 `'{"error":{"message":"Invalid API key"}}'`）。
3. 超时路径：保持无 `responseBody`（`toEqual` 仅 `ok`+`message`，或不含该键）。

示例（成功）：

```ts
const rawBody = JSON.stringify({
  choices: [{ message: { content: JSON.stringify([/* ... */]) } }],
});
// fetchImpl text: async () => rawBody
const result = await generateQuestionsWithChatCompletions({ /* ... */ });
expect(result.ok).toBe(true);
if (result.ok) {
  expect(result.responseBody).toBe(rawBody);
}
```

示例（401，更新现有用例）：

```ts
const rawBody = JSON.stringify({ error: { message: 'Invalid API key' } });
expect(result).toEqual({
  ok: false,
  message: 'AI 调用失败 HTTP 401：Invalid API key',
  responseBody: rawBody,
});
```

示例（超时，确认无 body）：

```ts
expect(result).toEqual({
  ok: false,
  message: 'AI 调用超时：The operation was aborted due to timeout',
});
expect('responseBody' in result).toBe(false);
```

同步更新其它已用 `toEqual` 且实际读到 body 的失败用例（503、非 JSON 等），补上 `responseBody`。

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter api test -- generate-questions`  
Expected: FAIL（结果尚无 `responseBody`）

- [ ] **Step 3: 实现**

在 `generateQuestionsWithChatCompletions` 中：

1. 扩展 `GenerateQuestionsResult` 类型如上。
2. 读到 `rawBody` 后，所有后续 `return`（含 `parseGeneratedQuestionsJson` 包装）附带 `responseBody: rawBody`。
3. fetch catch / 读 body catch：不附带 `responseBody`。
4. `parseGeneratedQuestionsJson` 本身可不改签名；在调用处展开：

```ts
const parsed = parseGeneratedQuestionsJson(content, input.optionCount, input.lastWord);
if (!parsed.ok) {
  return { ...parsed, responseBody: rawBody };
}
return { ...parsed, responseBody: rawBody };
```

- [ ] **Step 4: 跑测通过并 Commit**

Run: `pnpm --filter api test -- generate-questions`  
Expected: PASS

```bash
git add apps/api/src/ai-tasks/generate-questions.ts \
  apps/api/src/ai-tasks/generate-questions.spec.ts
git commit -m "$(cat <<'EOF'
feat: AI 出题结果附带完整 HTTP 响应体

供 runTask 按开关决定是否写入 AiTaskRun。
EOF
)"
```

---

### Task 4: runTask 按开关落库

**Files:**
- Modify: `apps/api/src/ai-tasks/ai-tasks.service.ts`
- Modify: `apps/api/src/ai-tasks/ai-tasks.service.spec.ts`

**Interfaces:**
- Consumes: `isAiTaskStoreResponseBodyEnabled`、`GenerateQuestionsResult.responseBody`
- Produces: `finish` 在开关开启时写入 `aiResponseBody`；`toRunView` 仍不返回该字段

- [ ] **Step 1: 更新 mock 与写失败测试**

1. `createService` 里 `aiTaskRun.create` / `update` 的默认 run 对象增加 `aiResponseBody: null`。
2. `existingRuns` 样例对象同样补上该键（避免类型/断言漂移）。
3. 在 `describe('AiTasksService runTask')` 中增加：

```ts
it('开关关闭时不写入 aiResponseBody', async () => {
  const previous = process.env.AI_TASK_STORE_RESPONSE_BODY;
  process.env.AI_TASK_STORE_RESPONSE_BODY = 'false';
  try {
    const { service, runs } = createService();
    await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate: async () => ({
        ok: true,
        questions: sampleQuestions,
        responseBody: '{"choices":[]}',
      }),
    });
    expect(runs[0]?.aiResponseBody ?? null).toBeNull();
  } finally {
    if (previous === undefined) {
      delete process.env.AI_TASK_STORE_RESPONSE_BODY;
    } else {
      process.env.AI_TASK_STORE_RESPONSE_BODY = previous;
    }
  }
});

it('开关开启时写入完整 responseBody', async () => {
  const previous = process.env.AI_TASK_STORE_RESPONSE_BODY;
  process.env.AI_TASK_STORE_RESPONSE_BODY = 'true';
  try {
    const { service, runs } = createService();
    const body = '{"id":"chatcmpl-1","choices":[{"message":{"content":"[]"}}]}';
    await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate: async () => ({
        ok: true,
        questions: sampleQuestions,
        responseBody: body,
      }),
    });
    expect(runs[0]?.aiResponseBody).toBe(body);
  } finally {
    if (previous === undefined) {
      delete process.env.AI_TASK_STORE_RESPONSE_BODY;
    } else {
      process.env.AI_TASK_STORE_RESPONSE_BODY = previous;
    }
  }
});

it('开关开启但无 responseBody 时保持 null', async () => {
  const previous = process.env.AI_TASK_STORE_RESPONSE_BODY;
  process.env.AI_TASK_STORE_RESPONSE_BODY = '1';
  try {
    const { service, runs } = createService();
    await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate: async () => ({ ok: false, message: 'AI 调用超时' }),
    });
    expect(runs[0]?.status).toBe('FAILED');
    expect(runs[0]?.aiResponseBody ?? null).toBeNull();
  } finally {
    if (previous === undefined) {
      delete process.env.AI_TASK_STORE_RESPONSE_BODY;
    } else {
      process.env.AI_TASK_STORE_RESPONSE_BODY = previous;
    }
  }
});
```

说明：`runs[0]` 在 create 后即存在；`finish` 的 `update` 会 `Object.assign` 写入字段。若 create 未初始化 `aiResponseBody`，断言用 `?? null`。

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter api test -- ai-tasks.service.spec`  
Expected: 新用例 FAIL（尚未写入）

- [ ] **Step 3: 实现落库**

在 `ai-tasks.service.ts`：

1. `import { isAiTaskStoreResponseBodyEnabled } from './ai-response-body-config';`
2. `finish` 的 `fields` 增加 `aiResponseBody?: string | null`，并传入 `tx.aiTaskRun.update` 的 `data`（仅当 `fields.aiResponseBody !== undefined` 时设置，与 `errorMessage` 同模式）。
3. 在调用 `generate` 之后，计算：

```ts
const aiResponseBody =
  isAiTaskStoreResponseBodyEnabled() &&
  typeof generated.responseBody === 'string'
    ? generated.responseBody
    : undefined;
```

4. 所有基于 `generated` 的 `finish(...)`（成功、生成失败、密推进失败、无有效题、写库失败若发生在 generate 之后）传入 `aiResponseBody`（当为 `undefined` 时不更新该列，保持 null）。

推荐抽局部 helper，避免漏传：

```ts
const finishWithBody = (
  status: 'SUCCESS' | 'FAILED',
  fields: Omit<Parameters<typeof finish>[1], never>,
) =>
  finish(status, {
    ...fields,
    ...(aiResponseBody !== undefined
      ? { aiResponseBody }
      : {}),
  });
```

注意：`aiResponseBody` 变量须在 `generate` 返回后赋值；`generate` 之前的失败路径不传。

5. **不要** 修改 `toRunView` / `AiTaskRunView` / DTO。

- [ ] **Step 4: 跑测通过并 Commit**

Run: `pnpm --filter api test -- ai-tasks.service.spec generate-questions ai-response-body-config`  
Expected: PASS

```bash
git add apps/api/src/ai-tasks/ai-tasks.service.ts \
  apps/api/src/ai-tasks/ai-tasks.service.spec.ts
git commit -m "$(cat <<'EOF'
feat: 按开关将 AI 响应体写入 AiTaskRun

开启 AI_TASK_STORE_RESPONSE_BODY 时落库完整 HTTP body，默认关闭。
EOF
)"
```

---

## Spec coverage checklist

| Spec 要求 | Task |
|-----------|------|
| `aiResponseBody` TEXT 可空 | Task 1 |
| `AI_TASK_STORE_RESPONSE_BODY` 默认关，true/1/yes 开 | Task 2 |
| `.env.example` / `.env.docker` / `.env.docker.example` | Task 2 |
| generate 附带完整 raw body | Task 3 |
| 超时/无 body 不附带 | Task 3 |
| runTask 按开关落库 | Task 4 |
| API 不暴露字段 | Task 4（明确不改 view） |
| 单元测试 | Task 2–4 |

## Plan self-review

- 无 TBD / 占位步骤。
- 类型名 `responseBody`（结果）与列名 `aiResponseBody`（DB）已区分。
- 现有 `toEqual` 失败用例须在 Task 3 同步补 `responseBody`，避免误报。

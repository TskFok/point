# 管理端 AI 任务（自动出题）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在运营台提供多套 AI 出题任务的配置、crontab 自动执行、立即执行与执行历史；按英文单词字母序游标生成「英文题干 + 中文选项」题目并写入题库。

**Architecture:** Prisma `AiTask` / `AiTaskRun`；Nest `ai-tasks` 模块提供 Admin CRUD + run + runs；`@nestjs/schedule` 每分钟 tick 匹配 crontab；生成流水线调用 OpenAI 兼容 `chat/completions`（可注入 mock）；Web `/admin/ai-tasks` 对齐 AI 模型管理页交互。

**Tech Stack:** NestJS、`@nestjs/schedule`、`cron-parser`、Prisma、PostgreSQL、Next.js、Jest、OpenAPI / `@point-quest/api-client`。

## Global Constraints

- Spec：`docs/superpowers/specs/2026-08-03-admin-ai-tasks-design.md`
- 多任务；各自 `lastWord` 游标；空游标从字母序最前开始
- `isEnabled` 只控制 cron；`POST .../run` 未启用也可
- 同一任务同时最多一条 `RUNNING`（部分唯一索引）；manual 冲突 → `409`
- 题干英文、选项中文、`explanation` 中文；AI JSON 每项含 `word`
- 成功 ≥1 题才前进游标；0 题成功 → `FAILED`，游标不动
- `MANUAL` 出题人 = 触发管理员；`CRON` 出题人 = 任务 `updatedBy`
- AI 调用超时 60s；日志/`errorMessage` 禁止含 API Key
- 全部 Admin 接口 `@Roles('ADMIN')`；改 API 后执行 `pnpm api:spec` 与 `pnpm api:client`
- 新增/修改功能必须带单元测试且通过

## File Structure

| 路径 | 职责 |
|------|------|
| `prisma/schema.prisma` + `prisma/migrations/0006_add_ai_tasks/` | `AiTask` / `AiTaskRun` / 枚举 / FK / RUNNING 部分唯一索引 |
| `apps/api/src/ai-tasks/cron-expression.ts` | crontab 校验与「当前分钟是否命中」 |
| `apps/api/src/ai-tasks/generate-questions.ts` | OpenAI chat 调用 + JSON 解析校验 |
| `apps/api/src/ai-tasks/ai-tasks.service.ts` | CRUD + 执行流水线 |
| `apps/api/src/ai-tasks/ai-tasks.scheduler.ts` | 每分钟调度 |
| `apps/api/src/ai-tasks/admin-ai-tasks.controller.ts` | Admin HTTP |
| `apps/api/src/ai-tasks/ai-tasks.module.ts` | 模块注册 |
| `apps/api/src/ai-tasks/dto/*.ts` | class-validator DTO |
| `apps/api/src/openapi/api-contract.models.ts` | OpenAPI DTO |
| `apps/api/src/openapi/api-contract.decorator.ts` | query/param 辅助 |
| `apps/web/components/admin/ai-task-form.tsx` | 新建/编辑表单 |
| `apps/web/app/(admin)/admin/ai-tasks/page.tsx` | 列表 + 执行记录面板 |
| `apps/web/components/layout/admin-shell.tsx` | 侧栏「AI 任务」 |

---

### Task 1: Prisma — AiTask / AiTaskRun

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/0006_add_ai_tasks/migration.sql`
- Modify: `apps/api/src/ai-models/ai-models.service.ts`（`remove` 捕获 `P2003` → 明确冲突文案）
- Modify: `apps/api/src/ai-models/ai-models.service.spec.ts`
- Test: `apps/api/src/ai-models/ai-models.service.spec.ts`

**Interfaces:**
- Produces Prisma models: `AiTask`, `AiTaskRun`；enums `AiTaskRunTrigger`, `AiTaskRunStatus`
- Produces: `AiModelsService.remove` 在外键占用时抛 `ConflictException` code `AI_MODEL_IN_USE`

- [ ] **Step 1: 在 `schema.prisma` 增加枚举与模型**

在 `enum OrderStatus` 后增加：

```prisma
enum AiTaskRunTrigger {
  CRON
  MANUAL
}

enum AiTaskRunStatus {
  RUNNING
  SUCCESS
  FAILED
}
```

在 `User` 模型增加关系字段：

```prisma
  aiTasksCreated     AiTask[]           @relation("AiTaskCreator")
  aiTasksUpdated     AiTask[]           @relation("AiTaskUpdater")
```

在 `AiModelConfig` 增加：

```prisma
  aiTasks AiTask[]
```

在文件末尾增加：

```prisma
model AiTask {
  id               String      @id @default(cuid())
  name             String      @unique
  aiModelConfigId  String
  questionCount    Int
  optionCount      Int
  basePoints       Int
  cronExpression   String
  isEnabled        Boolean     @default(true)
  lastWord         String?
  createdBy        String
  updatedBy        String
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt
  aiModelConfig    AiModelConfig @relation(fields: [aiModelConfigId], references: [id], onDelete: Restrict)
  creator          User        @relation("AiTaskCreator", fields: [createdBy], references: [id], onDelete: Restrict)
  updater          User        @relation("AiTaskUpdater", fields: [updatedBy], references: [id], onDelete: Restrict)
  runs             AiTaskRun[]

  @@index([updatedAt, id])
  @@index([isEnabled])
  @@index([aiModelConfigId])
}

model AiTaskRun {
  id                String           @id @default(cuid())
  aiTaskId          String
  trigger           AiTaskRunTrigger
  status            AiTaskRunStatus
  startedAt         DateTime         @default(now())
  finishedAt        DateTime?
  questionsCreated  Int              @default(0)
  lastWordBefore    String?
  lastWordAfter     String?
  errorMessage      String?
  aiTask            AiTask           @relation(fields: [aiTaskId], references: [id], onDelete: Cascade)

  @@index([aiTaskId, startedAt])
  @@index([status])
}
```

- [ ] **Step 2: 写 migration SQL**

`prisma/migrations/0006_add_ai_tasks/migration.sql`：

```sql
-- CreateEnum
CREATE TYPE "AiTaskRunTrigger" AS ENUM ('CRON', 'MANUAL');

-- CreateEnum
CREATE TYPE "AiTaskRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "AiTask" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aiModelConfigId" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "optionCount" INTEGER NOT NULL,
    "basePoints" INTEGER NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastWord" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiTaskRun" (
    "id" TEXT NOT NULL,
    "aiTaskId" TEXT NOT NULL,
    "trigger" "AiTaskRunTrigger" NOT NULL,
    "status" "AiTaskRunStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "questionsCreated" INTEGER NOT NULL DEFAULT 0,
    "lastWordBefore" TEXT,
    "lastWordAfter" TEXT,
    "errorMessage" TEXT,
    CONSTRAINT "AiTaskRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiTask_name_key" ON "AiTask"("name");
CREATE INDEX "AiTask_updatedAt_id_idx" ON "AiTask"("updatedAt", "id");
CREATE INDEX "AiTask_isEnabled_idx" ON "AiTask"("isEnabled");
CREATE INDEX "AiTask_aiModelConfigId_idx" ON "AiTask"("aiModelConfigId");
CREATE INDEX "AiTaskRun_aiTaskId_startedAt_idx" ON "AiTaskRun"("aiTaskId", "startedAt");
CREATE INDEX "AiTaskRun_status_idx" ON "AiTaskRun"("status");

-- 同一任务同时最多一条 RUNNING
CREATE UNIQUE INDEX "AiTaskRun_one_running_per_task"
  ON "AiTaskRun"("aiTaskId")
  WHERE "status" = 'RUNNING';

ALTER TABLE "AiTask" ADD CONSTRAINT "AiTask_aiModelConfigId_fkey"
  FOREIGN KEY ("aiModelConfigId") REFERENCES "AiModelConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiTask" ADD CONSTRAINT "AiTask_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiTask" ADD CONSTRAINT "AiTask_updatedBy_fkey"
  FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiTaskRun" ADD CONSTRAINT "AiTaskRun_aiTaskId_fkey"
  FOREIGN KEY ("aiTaskId") REFERENCES "AiTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: 生成客户端并更新模型删除冲突**

Run: `pnpm exec prisma generate`（在仓库约定方式下，与现有脚本一致）

在 `ai-models.service.ts` 的 `remove`：

```ts
async remove(id: string): Promise<{ success: true }> {
  await this.requireRow(id);
  try {
    await this.prisma.aiModelConfig.delete({ where: { id } });
  } catch (error) {
    if (isPrismaError(error, 'P2003')) {
      throw new ConflictException({
        code: 'AI_MODEL_IN_USE',
        message: '该模型仍被 AI 任务引用，请先改绑或删除任务',
      });
    }
    throw error;
  }
  return { success: true };
}
```

单测：mock `delete` 抛 `{ code: 'P2003' }`，期望 `ConflictException` / `AI_MODEL_IN_USE`。

- [ ] **Step 4: 运行相关测试**

Run: `pnpm --filter @point-quest/api test -- ai-models.service.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/0006_add_ai_tasks \
  apps/api/src/ai-models/ai-models.service.ts \
  apps/api/src/ai-models/ai-models.service.spec.ts
git commit -m "feat: 增加 AiTask / AiTaskRun 数据表"
```

---

### Task 2: crontab 校验与命中判断

**Files:**
- Create: `apps/api/src/ai-tasks/cron-expression.ts`
- Create: `apps/api/src/ai-tasks/cron-expression.spec.ts`
- Modify: `apps/api/package.json`（依赖 `cron-parser`）
- Test: `apps/api/src/ai-tasks/cron-expression.spec.ts`

**Interfaces:**
- Produces:
  - `assertCronExpression(value: string): string` — trim；非法抛带中文的 Error（message 供上层转 `VALIDATION_FAILED`）
  - `cronMatchesDate(expression: string, date: Date): boolean` — 判断该时刻（精确到分钟）是否命中

- [ ] **Step 1: 安装依赖**

```bash
pnpm --filter @point-quest/api add cron-parser
```

- [ ] **Step 2: 写失败测试**

```ts
import { assertCronExpression, cronMatchesDate } from './cron-expression';

describe('cron-expression', () => {
  it('接受合法 5 段表达式', () => {
    expect(assertCronExpression(' 0 8 * * * ')).toBe('0 8 * * *');
  });

  it('拒绝非法表达式', () => {
    expect(() => assertCronExpression('not-a-cron')).toThrow(/crontab/);
  });

  it('命中每天 8:00', () => {
    const d = new Date('2026-08-03T08:00:00+08:00');
    expect(cronMatchesDate('0 8 * * *', d)).toBe(true);
    expect(cronMatchesDate('0 8 * * *', new Date('2026-08-03T08:01:00+08:00'))).toBe(false);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm --filter @point-quest/api test -- cron-expression.spec.ts`  
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现**

```ts
import { CronExpressionParser } from 'cron-parser';

export function assertCronExpression(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('crontab 表达式不能为空');
  }
  const parts = normalized.split(/\s+/);
  if (parts.length !== 5) {
    throw new Error('crontab 必须是 5 段表达式');
  }
  try {
    CronExpressionParser.parse(normalized);
  } catch {
    throw new Error('crontab 表达式不合法');
  }
  return normalized;
}

/** 以本地/传入 Date 的年-月-日-时-分为粒度判断是否命中 */
export function cronMatchesDate(expression: string, date: Date): boolean {
  const start = new Date(date);
  start.setSeconds(0, 0);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 1);
  try {
    const iter = CronExpressionParser.parse(expression, {
      currentDate: new Date(start.getTime() - 1),
      endDate: end,
    });
    const next = iter.next().toDate();
    return next >= start && next < end;
  } catch {
    return false;
  }
}
```

（若 `cron-parser` 导出名与版本不符，按安装版本的实际 API 调整，并保持上述测试行为。）

- [ ] **Step 5: 测试通过并 Commit**

```bash
pnpm --filter @point-quest/api test -- cron-expression.spec.ts
git add apps/api/package.json apps/api/src/ai-tasks/cron-expression.ts \
  apps/api/src/ai-tasks/cron-expression.spec.ts pnpm-lock.yaml
git commit -m "feat: 增加 AI 任务 crontab 校验工具"
```

---

### Task 3: AI 出题调用与 JSON 校验

**Files:**
- Create: `apps/api/src/ai-tasks/generate-questions.ts`
- Create: `apps/api/src/ai-tasks/generate-questions.spec.ts`
- Test: `apps/api/src/ai-tasks/generate-questions.spec.ts`

**Interfaces:**
- Produces types:

```ts
export type GeneratedQuestionOption = {
  label: string;
  content: string;
  isCorrect: boolean;
};

export type GeneratedQuestion = {
  word: string;
  stem: string;
  explanation: string;
  options: GeneratedQuestionOption[];
};

export type GenerateQuestionsInput = {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  lastWord: string | null;
  questionCount: number;
  optionCount: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number; // default 60_000
};

export type GenerateQuestionsResult =
  | { ok: true; questions: GeneratedQuestion[] }
  | { ok: false; message: string };

export function buildGeneratePrompt(input: {
  lastWord: string | null;
  questionCount: number;
  optionCount: number;
}): string;

export function parseGeneratedQuestionsJson(
  raw: string,
  optionCount: number,
  lastWordBefore: string | null,
): { ok: true; questions: GeneratedQuestion[] } | { ok: false; message: string };

export function generateQuestionsWithChatCompletions(
  input: GenerateQuestionsInput,
): Promise<GenerateQuestionsResult>;
```

- [ ] **Step 1: 写失败测试（解析与 prompt）**

```ts
import {
  buildGeneratePrompt,
  parseGeneratedQuestionsJson,
} from './generate-questions';

describe('generate-questions parse', () => {
  const sample = JSON.stringify([
    {
      word: 'abandon',
      stem: 'What does "abandon" mean?',
      explanation: '放弃',
      options: [
        { label: 'A', content: '放弃', isCorrect: true },
        { label: 'B', content: '获得', isCorrect: false },
      ],
    },
  ]);

  it('解析合法 JSON', () => {
    const result = parseGeneratedQuestionsJson(sample, 2, null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.questions[0]?.word).toBe('abandon');
  });

  it('拒绝 word 未大于 lastWord', () => {
    const result = parseGeneratedQuestionsJson(sample, 2, 'zebra');
    expect(result.ok).toBe(false);
  });

  it('prompt 包含游标与数量', () => {
    const p = buildGeneratePrompt({
      lastWord: 'cat',
      questionCount: 3,
      optionCount: 4,
    });
    expect(p).toMatch(/cat/);
    expect(p).toMatch(/3/);
    expect(p).toMatch(/4/);
  });
});
```

再补一条 `generateQuestionsWithChatCompletions` mock `fetch` 成功/超时测试。

- [ ] **Step 2: 运行确认失败 → 实现**

实现要点：
- `baseUrl` 去尾 `/`，POST `{baseUrl}/chat/completions`
- Body：`{ model: modelName, temperature: 0.2, messages: [{ role: 'system', content: '...' }, { role: 'user', content: prompt }] }`
- system：要求只输出 JSON 数组；题干英文；选项中文；每项含 `word`
- Header：`Authorization: Bearer ${apiKey}`；`Content-Type: application/json`
- `AbortSignal.timeout(timeoutMs ?? 60_000)`
- 从 `choices[0].message.content` 取文本；剥离可选 \`\`\`json 围栏后 `JSON.parse`
- `parseGeneratedQuestionsJson`：
  - 每题 `word` 小写 trim；须严格 `>` `lastWordBefore`（localeCompare）；题目间 `word` 严格递增
  - `options.length === optionCount`；恰一正确；label/content 非空
  - stem/explanation 非空
  - 单项失败时：本函数用于「整包解析」——若数组结构坏则整包 fail；单题字段坏可在 service 层逐题过滤（见 Task 5）。此处 **整包校验通过的题全部合格**，任一项不合格则返回 `ok: false`（简单可靠）。Task 5 若需部分成功，改为导出 `validateOneGeneratedQuestion` 并在 service 逐题过滤。

**采用部分成功策略（对齐 spec）：** 导出：

```ts
export function validateOneGeneratedQuestion(
  value: unknown,
  optionCount: number,
  minWordExclusive: string | null,
): { ok: true; question: GeneratedQuestion } | { ok: false; message: string };

export function extractJsonArray(raw: string): unknown[] | null;
```

service 对数组逐题 validate，维护 `minWordExclusive` 为上一成功 word。

- [ ] **Step 3: 测试通过并 Commit**

```bash
pnpm --filter @point-quest/api test -- generate-questions.spec.ts
git add apps/api/src/ai-tasks/generate-questions.ts \
  apps/api/src/ai-tasks/generate-questions.spec.ts
git commit -m "feat: 增加 AI 出题 JSON 解析与 chat 调用"
```

---

### Task 4: AiTasksService CRUD

**Files:**
- Create: `apps/api/src/ai-tasks/dto/create-ai-task.dto.ts`
- Create: `apps/api/src/ai-tasks/dto/update-ai-task.dto.ts`
- Create: `apps/api/src/ai-tasks/dto/list-ai-tasks.dto.ts`
- Create: `apps/api/src/ai-tasks/dto/list-ai-task-runs.dto.ts`
- Create: `apps/api/src/ai-tasks/ai-tasks.service.ts`
- Create: `apps/api/src/ai-tasks/ai-tasks.service.spec.ts`
- Test: `apps/api/src/ai-tasks/ai-tasks.service.spec.ts`

**Interfaces:**
- Produces view types:

```ts
export type AiTaskView = {
  id: string;
  name: string;
  aiModelConfigId: string;
  aiModelName: string;
  questionCount: number;
  optionCount: number;
  basePoints: number;
  cronExpression: string;
  isEnabled: boolean;
  lastWord: string | null;
  createdAt: string;
  updatedAt: string;
  latestRun?: {
    id: string;
    status: 'RUNNING' | 'SUCCESS' | 'FAILED';
    trigger: 'CRON' | 'MANUAL';
    startedAt: string;
    finishedAt: string | null;
    questionsCreated: number;
  } | null;
};

export type AiTaskRunView = {
  id: string;
  aiTaskId: string;
  trigger: 'CRON' | 'MANUAL';
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  startedAt: string;
  finishedAt: string | null;
  questionsCreated: number;
  lastWordBefore: string | null;
  lastWordAfter: string | null;
  errorMessage: string | null;
};
```

- Produces methods: `list`, `get`, `create`, `update`, `remove`, `listRuns`（`run` 在 Task 5）

- [ ] **Step 1: 写 CRUD 失败测试（mock Prisma）**

覆盖：
- create 成功返回 view（含 `aiModelName`）
- name 冲突 → `AI_TASK_NAME_CONFLICT`
- 模型不存在 → `AI_MODEL_NOT_FOUND`；模型未启用 → `VALIDATION_FAILED`
- cron 非法 → `VALIDATION_FAILED`
- `questionCount` 越界（1–50）、`optionCount`（2–6）、`basePoints`（1–1000）
- update 不接受/忽略 `lastWord` 字段
- remove 级联（prisma `delete` 即可，DB 侧 cascade）

DTO 示例 `create-ai-task.dto.ts`：

```ts
import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function trimText({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateAiTaskDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  aiModelConfigId!: string;

  @IsInt()
  @Min(1)
  @Max(50)
  questionCount!: number;

  @IsInt()
  @Min(2)
  @Max(6)
  optionCount!: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  basePoints!: number;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cronExpression!: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
```

`UpdateAiTaskDto`：全部字段 optional（同类校验）。  
`ListAiTasksDto` / `ListAiTaskRunsDto`：对齐现有 `page`/`pageSize`/`isEnabled?`。

- [ ] **Step 2: 实现 `ai-tasks.service.ts` CRUD**

要点：
- `create`/`update` 内调用 `assertCronExpression`；捕获 Error → `VALIDATION_FAILED`
- 查 `aiModelConfig`：`findUnique`；不存在 404；`!isEnabled` → validationFailed
- list include 最近一次 run：可用 `runs: { orderBy: { startedAt: 'desc' }, take: 1 }` + include model `name`
- **禁止循环内查库**：list 用 include/批量，勿对每行再查 runs

- [ ] **Step 3: 测试通过并 Commit**

```bash
pnpm --filter @point-quest/api test -- ai-tasks.service.spec.ts
git add apps/api/src/ai-tasks/
git commit -m "feat: 实现 AI 任务 CRUD 服务"
```

---

### Task 5: 执行流水线 `runTask`

**Files:**
- Modify: `apps/api/src/ai-tasks/ai-tasks.service.ts`
- Modify: `apps/api/src/ai-tasks/ai-tasks.service.spec.ts`
- Test: `apps/api/src/ai-tasks/ai-tasks.service.spec.ts`

**Interfaces:**
- Produces:

```ts
async runTask(
  taskId: string,
  options: {
    trigger: 'CRON' | 'MANUAL';
    actorUserId: string; // MANUAL=当前用户；CRON=task.updatedBy
    generate?: typeof generateQuestionsWithChatCompletions;
  },
): Promise<AiTaskRunView>;
```

- 已有 `RUNNING`（部分唯一索引 `P2002`）→ `ConflictException` code `AI_TASK_ALREADY_RUNNING`

- [ ] **Step 1: 写执行相关失败测试**

场景（均 mock prisma + mock generate）：
1. 成功：生成 2 题 → 创建 2 条 Question（可用 `prisma.$transaction` callback mock）→ `lastWord` 更新为最大 word → run `SUCCESS`
2. 生成 `ok: false` → run `FAILED`，游标不变
3. 模型停用 → run `FAILED`
4. 第二次 run 在已有 RUNNING 时 → `409 AI_TASK_ALREADY_RUNNING`
5. 部分题校验失败但 ≥1 成功 → `SUCCESS`，游标=成功最大 word，`errorMessage` 可含跳过摘要

- [ ] **Step 2: 实现 `runTask`**

伪流程：

```ts
// 1. load task + model
// 2. try create AiTaskRun RUNNING with lastWordBefore; catch P2002 → conflict
// 3. if !model.isEnabled → finish FAILED
// 4. decrypt key; call generate(... model.name as modelName, ...)
// 5. extractJsonArray + 逐题 validateOneGeneratedQuestion
// 6. 对成功题逐条 questions.create（含 options）；createdBy = actorUserId
//    注意：若循环内 create，须改为 createMany + 选项批量，或单次 transaction 内批量 create
//    推荐：transaction 内 for 循环 create 仅当 N≤50 且注释说明上限；更佳为逐题 create 仍在同一 transaction，避免 N+1 跨请求，但同事务内多次 insert 可接受（非循环内查询）
// 7. update task.lastWord；update run SUCCESS/FAILED
```

**禁止循环内查询**：循环内只允许 `create`，不允许 `find*`。

写入题目字段映射：
- `stem` / `explanation` / `basePoints`（任务配置）/ `isActive: true`
- options：`position` = 数组下标；`label`/`content`/`isCorrect`

- [ ] **Step 3: 测试通过并 Commit**

```bash
pnpm --filter @point-quest/api test -- ai-tasks.service.spec.ts
git add apps/api/src/ai-tasks/ai-tasks.service.ts \
  apps/api/src/ai-tasks/ai-tasks.service.spec.ts
git commit -m "feat: 实现 AI 任务出题执行流水线"
```

---

### Task 6: Scheduler + Module

**Files:**
- Create: `apps/api/src/ai-tasks/ai-tasks.scheduler.ts`
- Create: `apps/api/src/ai-tasks/ai-tasks.scheduler.spec.ts`
- Create: `apps/api/src/ai-tasks/ai-tasks.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/package.json`（`@nestjs/schedule`）
- Test: `apps/api/src/ai-tasks/ai-tasks.scheduler.spec.ts`

**Interfaces:**
- Produces: `AiTasksScheduler.tick(now?: Date): Promise<void>`
- Module exports `AiTasksService`；imports `PrismaModule`、`ScheduleModule.forRoot()`

- [ ] **Step 1: 安装 `@nestjs/schedule`**

```bash
pnpm --filter @point-quest/api add @nestjs/schedule
```

- [ ] **Step 2: 写 scheduler 测试**

```ts
describe('AiTasksScheduler', () => {
  it('仅对启用且 cron 命中的任务调用 runTask', async () => {
    const runTask = jest.fn().mockResolvedValue({});
    const listEnabled = jest.fn().mockResolvedValue([
      {
        id: 't1',
        isEnabled: true,
        cronExpression: '0 8 * * *',
        updatedBy: 'admin-1',
      },
      {
        id: 't2',
        isEnabled: true,
        cronExpression: '0 9 * * *',
        updatedBy: 'admin-1',
      },
    ]);
    const scheduler = new AiTasksScheduler({
      listEnabledForSchedule: listEnabled,
      runTask,
    } as never);
    await scheduler.tick(new Date('2026-08-03T08:00:00+08:00'));
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(runTask).toHaveBeenCalledWith('t1', {
      trigger: 'CRON',
      actorUserId: 'admin-1',
    });
  });

  it('runTask 抛错时不中断其他任务', async () => {
    // t1 reject, t2 still called
  });
});
```

在 service 增加 `listEnabledForSchedule(): Promise<Array<Pick<AiTask, 'id' | 'cronExpression' | 'updatedBy' | 'isEnabled'>>>`（仅 `isEnabled: true` 一次查出）。

- [ ] **Step 3: 实现 scheduler**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { cronMatchesDate } from './cron-expression';
import { AiTasksService } from './ai-tasks.service';

@Injectable()
export class AiTasksScheduler {
  private readonly logger = new Logger(AiTasksScheduler.name);

  constructor(private readonly aiTasksService: AiTasksService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron(): Promise<void> {
    await this.tick(new Date());
  }

  async tick(now: Date): Promise<void> {
    const tasks = await this.aiTasksService.listEnabledForSchedule();
    for (const task of tasks) {
      if (!cronMatchesDate(task.cronExpression, now)) continue;
      try {
        await this.aiTasksService.runTask(task.id, {
          trigger: 'CRON',
          actorUserId: task.updatedBy,
        });
      } catch (error) {
        this.logger.warn(
          `AI task ${task.id} schedule run skipped/failed: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    }
  }
}
```

`AiTasksModule`：

```ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAiTasksController } from './admin-ai-tasks.controller';
import { AiTasksScheduler } from './ai-tasks.scheduler';
import { AiTasksService } from './ai-tasks.service';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [AdminAiTasksController], // controller 在 Task 7 创建；若尚未存在可先不注册 controller
  providers: [AiTasksService, AiTasksScheduler],
  exports: [AiTasksService],
})
export class AiTasksModule {}
```

若 Task 7 尚未完成，本 Task 可先不挂 controller，仅挂 service+scheduler；Task 7 再补 controller。

`AppModule` imports 增加 `AiTasksModule`。

- [ ] **Step 4: 测试通过并 Commit**

```bash
pnpm --filter @point-quest/api test -- ai-tasks.scheduler.spec.ts
git add apps/api/package.json apps/api/src/ai-tasks apps/api/src/app.module.ts pnpm-lock.yaml
git commit -m "feat: 增加 AI 任务分钟级调度器"
```

---

### Task 7: Admin Controller + OpenAPI + api-client

**Files:**
- Create: `apps/api/src/ai-tasks/admin-ai-tasks.controller.ts`
- Modify: `apps/api/src/openapi/api-contract.models.ts`
- Modify: `apps/api/src/openapi/api-contract.decorator.ts`
- Modify: `apps/api/src/ai-tasks/ai-tasks.module.ts`
- Modify: `packages/api-client`（生成）
- Modify: `packages/api-client/src/client.test.ts`
- Test: `apps/api/src/openapi/create-openapi-document.spec.ts`（若有 operationId 断言则更新）

**Interfaces:**
- HTTP：

| method | path | operationId |
|--------|------|-------------|
| GET | `/admin/ai-tasks` | `adminListAiTasks` |
| POST | `/admin/ai-tasks` | `adminCreateAiTask` |
| GET | `/admin/ai-tasks/{id}` | `adminGetAiTask` |
| PATCH | `/admin/ai-tasks/{id}` | `adminUpdateAiTask` |
| DELETE | `/admin/ai-tasks/{id}` | `adminDeleteAiTask` |
| POST | `/admin/ai-tasks/{id}/run` | `adminRunAiTask` |
| GET | `/admin/ai-tasks/{id}/runs` | `adminListAiTaskRuns` |

- OpenAPI models：`AiTaskDto`、`AiTaskListResponseDto`、`AiTaskRunDto`、`AiTaskRunListResponseDto`、`CreateAiTaskRequestDto`、`UpdateAiTaskRequestDto`
- `adminRunAiTask`：`@CurrentUser()` → `runTask(id, { trigger: 'MANUAL', actorUserId: user.id })`

- [ ] **Step 1: 追加 OpenAPI DTO（对齐 AiModelConfigDto 风格）**

`AiTaskDto` 字段与 `AiTaskView` 一致（含嵌套 `latestRun?`、`aiModelName`）。  
`AiTaskRunDto` 对齐 `AiTaskRunView`。

decorator 增加：

```ts
export const aiTaskIdParam: ApiParamOptions = {
  name: 'id',
  description: 'AI 任务 ID',
};

export const aiTaskQueries: ApiQueryOptions[] = [
  {
    name: 'isEnabled',
    required: false,
    type: Boolean,
  },
  ...pageQueries,
];
```

- [ ] **Step 2: 实现 controller**

对齐 `AdminAiModelsController` 风格；`run` 与 `runs` 路由写在 `{id}` 的具体子路径。

- [ ] **Step 3: 生成契约**

```bash
pnpm api:spec
pnpm api:client
pnpm --filter @point-quest/api-client test
pnpm --filter @point-quest/api test -- create-openapi-document.spec.ts
```

更新 `client.test.ts` 中 operation 名称列表断言。

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/ai-tasks apps/api/src/openapi \
  packages/api-client
git commit -m "feat: 暴露 AI 任务管理 API 并更新契约客户端"
```

---

### Task 8: Web — 表单与列表页

**Files:**
- Create: `apps/web/components/admin/ai-task-form.tsx`
- Create: `apps/web/app/(admin)/admin/ai-tasks/page.tsx`
- Modify: `apps/web/components/layout/admin-shell.tsx`（侧栏，图标可用 `ListTodo` 或 `Sparkles`）
- Create: `apps/web/tests/admin-ai-task-form.test.tsx`
- Create: `apps/web/tests/admin-ai-tasks-page.test.tsx`
- Test: 上述两个测试文件

**Interfaces:**
- 页面 props 可注入 `api`（Pick client 方法），对齐 AI 模型页便于单测
- 表单 props：`initial?`、`models: {id,name}[]`、`onSubmit`、`onCancel`、`busy`

- [ ] **Step 1: 写表单失败测试**

```tsx
it('提交包含模型、数量、crontab、启用', async () => {
  const user = userEvent.setup();
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  render(
    <AiTaskForm
      models={[{ id: 'm1', name: 'gpt-test' }]}
      onSubmit={onSubmit}
      onCancel={() => undefined}
    />,
  );
  await user.type(screen.getByLabelText('任务名称'), '每日词汇');
  await user.selectOptions(screen.getByLabelText('AI 模型'), 'm1');
  // 填 questionCount/optionCount/basePoints/cronExpression
  await user.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
});
```

- [ ] **Step 2: 实现表单**（复用 `ai-model-form` 布局/class）

字段：名称、AI 模型 select、题目数量、选项数、基础积分、crontab（帮助文本 `例如 0 8 * * *`）、启用开关；编辑时只读展示 `lastWord`。

- [ ] **Step 3: 写列表页测试**

- 列表展示任务名、模型名、crontab、`lastWord`
- 点击「立即执行」调用 `runAdminAiTask`
- 展开/查看执行记录调用 `listAdminAiTaskRuns`

- [ ] **Step 4: 实现列表页**

对齐 `admin/ai-models/page.tsx`：URL 同步筛选分页；行内启停、删除确认、立即执行 loading、页内 `actionMessage`；抽屉/面板展示 runs。

加载模型下拉：`listAdminAiModels({ isEnabled: true, page: 1, pageSize: 100 })`。

侧栏：`adminItems` 在 AI 模型后插入 `{ href: '/admin/ai-tasks', icon: ListTodo, label: 'AI 任务' }`。

- [ ] **Step 5: 运行 Web 测试并 Commit**

```bash
pnpm --filter @point-quest/web test -- admin-ai-task
git add apps/web
git commit -m "feat: 增加运营台 AI 任务管理页"
```

---

### Task 9: 端到端接线冒烟（单测级）

**Files:**
- Modify（如需）: `apps/api/src/ai-tasks/*.ts`、`apps/web/**`
- Test: 跑全量相关单测

- [ ] **Step 1: 跑 API 相关单测**

```bash
pnpm --filter @point-quest/api test -- ai-tasks
pnpm --filter @point-quest/api test -- ai-models.service.spec.ts
pnpm --filter @point-quest/api-client test
```

Expected: PASS

- [ ] **Step 2: 跑 Web 相关单测**

```bash
pnpm --filter @point-quest/web test -- admin-ai-task
```

Expected: PASS

- [ ] **Step 3: 若有失败则修复并追加回归测试**

- [ ] **Step 4: 最终 Commit（仅当有修复时）**

```bash
git add -A
git commit -m "test: 补齐 AI 任务接线回归"
```

---

## Spec Coverage Checklist

| Spec 项 | Task |
|---------|------|
| AiTask / AiTaskRun 模型与 RUNNING 唯一 | Task 1 |
| 模型删除 Restrict + 文案 | Task 1 |
| crontab 校验 | Task 2 |
| 英文题干中文选项 + word 游标 JSON | Task 3 |
| 多任务 CRUD 配置项 | Task 4 |
| 立即执行 / 部分成功游标 / 互斥 | Task 5 |
| 分钟调度 + 未启用不自动跑 | Task 6 |
| Admin API + OpenAPI + client | Task 7 |
| Web 列表/表单/执行记录/侧栏 | Task 8 |
| 单元测试门禁 | Task 2–9 |

## Self-Review Notes

- 无 TBD/TODO 占位；超时固定 60s；出题人规则已写入 Task 5。
- `cron-parser` API 以安装版本为准，Task 2 允许按实际 export 微调但测试行为不变。
- Task 6 若先于 Task 7，module 可暂不注册 controller，Task 7 必须补上。

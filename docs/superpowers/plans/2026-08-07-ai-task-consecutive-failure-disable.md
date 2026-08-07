# AI 任务连续失败自动停用 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AI 任务增加可配置的连续 cron 失败阈值；达阈值自动停用，手动重新启用后计数清零。

**Architecture:** 在 `AiTask` 上存 `maxConsecutiveFailures`（阈值，默认 0）与 `consecutiveFailureCount`（派生计数）。`runTask` 结算时仅对 `CRON` 触发更新计数/停用；`recoverInterruptedRuns` / 超时释放同样处理 cron `FAILED`；`PATCH` `isEnabled` false→true 时清零计数。管理端表单可配阈值，列表展示 `n/max`。

**Tech Stack:** NestJS、Prisma、PostgreSQL、Next.js、Jest、OpenAPI / `@point-quest/api-client`。

## Global Constraints

- Spec：`docs/superpowers/specs/2026-08-07-ai-task-consecutive-failure-disable-design.md`
- 仅 `trigger=CRON` 计入；`MANUAL` 不增、不清零、不停用
- 任意 `FAILED` 均计入（含中断恢复）
- cron `SUCCESS` → 计数清零
- `maxConsecutiveFailures` 范围 `0–100`，默认 `0`（不自动停用）；阈值为 0 时仍递增计数但不触发停用
- `PATCH` `isEnabled` false→true → `consecutiveFailureCount=0`；改阈值不立即停用
- 停用后仍可「立即执行」
- 禁止循环内 N+1 查库；启动恢复可对少量任务各一次 `update`（须注释）
- 改 API 后执行 `pnpm api:spec` 与 `pnpm api:client`
- 新增/修改功能必须带单元测试且通过
- 日志/`errorMessage` 禁止含 API Key

## File Structure

| 路径 | 职责 |
|------|------|
| `prisma/schema.prisma` + `prisma/migrations/0012_ai_task_consecutive_failures/` | 新增两字段 |
| `apps/api/src/ai-tasks/dto/create-ai-task.dto.ts` | 可写阈值校验 |
| `apps/api/src/ai-tasks/dto/update-ai-task.dto.ts` | 可写阈值校验 |
| `apps/api/src/ai-tasks/ai-tasks.service.ts` | CRUD、结算计数、恢复计数、重新启用清零 |
| `apps/api/src/ai-tasks/ai-tasks.service.spec.ts` | 服务单测 + mock 扩展 |
| `apps/api/src/openapi/api-contract.models.ts` | OpenAPI DTO 字段 |
| `apps/api/src/openapi/create-openapi-document.spec.ts` | 契约断言（若需） |
| `packages/api-client/src/schema.ts`（生成） | 客户端类型 |
| `apps/web/components/admin/ai-task-form.tsx` | 阈值输入 + 当前计数只读 |
| `apps/web/app/(admin)/admin/ai-tasks/page.tsx` | 列表列展示 |
| `apps/web/tests/admin-ai-task-form.test.tsx` | 表单单测 |
| `apps/web/tests/admin-ai-tasks-page.test.tsx` | 列表单测 |

---

### Task 1: Prisma — 失败阈值与计数字段

**Files:**
- Modify: `prisma/schema.prisma`（`AiTask` 模型）
- Create: `prisma/migrations/0012_ai_task_consecutive_failures/migration.sql`

**Interfaces:**
- Produces on `AiTask`: `maxConsecutiveFailures Int @default(0)`、`consecutiveFailureCount Int @default(0)`

- [ ] **Step 1: 更新 `schema.prisma`**

在 `AiTask` 的 `isEnabled` 字段后增加：

```prisma
  maxConsecutiveFailures  Int          @default(0)
  consecutiveFailureCount Int          @default(0)
```

- [ ] **Step 2: 新增迁移 SQL**

创建 `prisma/migrations/0012_ai_task_consecutive_failures/migration.sql`：

```sql
-- AiTask: 连续 cron 失败阈值与当前计数
ALTER TABLE "AiTask"
ADD COLUMN "maxConsecutiveFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "consecutiveFailureCount" INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 3: 生成 Prisma Client**

Run: `pnpm exec prisma generate`  
（在仓库根目录；若项目惯用 `pnpm --filter` 等价命令亦可）  
Expected: 成功，无报错

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/0012_ai_task_consecutive_failures/migration.sql
git commit -m "$(cat <<'EOF'
feat(db): AiTask 增加连续失败阈值与计数字段

EOF
)"
```

---

### Task 2: Service — CRUD 字段 + cron 结算计数（TDD）

**Files:**
- Modify: `apps/api/src/ai-tasks/dto/create-ai-task.dto.ts`
- Modify: `apps/api/src/ai-tasks/dto/update-ai-task.dto.ts`
- Modify: `apps/api/src/ai-tasks/ai-tasks.service.ts`
- Modify: `apps/api/src/ai-tasks/ai-tasks.service.spec.ts`

**Interfaces:**
- Consumes: Prisma 字段 `maxConsecutiveFailures`、`consecutiveFailureCount`
- Produces:
  - `AiTaskView` 增加 `maxConsecutiveFailures: number`、`consecutiveFailureCount: number`
  - private `applyCronRunOutcome(tx, taskId, status: 'SUCCESS' | 'FAILED'): Promise<void>`
  - `create` / `update` 接受可选 `maxConsecutiveFailures`（0–100）
  - `update`：若将 `isEnabled` 从 false→true，同次写入 `consecutiveFailureCount: 0`

- [ ] **Step 1: 扩展测试 mock 与失败用例（先写失败测试）**

在 `makeTask` 默认值中增加：

```ts
maxConsecutiveFailures: 0,
consecutiveFailureCount: 0,
```

在 `aiTask.update` mock 中同步处理：

```ts
if (typeof data.maxConsecutiveFailures === 'number') {
  taskState.maxConsecutiveFailures = data.maxConsecutiveFailures;
}
if (typeof data.consecutiveFailureCount === 'number') {
  taskState.consecutiveFailureCount = data.consecutiveFailureCount;
}
```

在 `describe('AiTasksService runTask', …)`（或新建 `describe('连续失败停用')`）增加用例骨架：

```ts
describe('连续失败停用', () => {
  const previousKey = process.env.AI_CONFIG_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.AI_CONFIG_ENCRYPTION_KEY = encryptionKeyBase64;
  });
  afterEach(() => {
    process.env.AI_CONFIG_ENCRYPTION_KEY = previousKey;
    jest.restoreAllMocks();
  });

  it('连续 cron FAILED 达阈值后停用', async () => {
    const { service, taskState } = createService({
      task: makeTask({ maxConsecutiveFailures: 2, consecutiveFailureCount: 1 }),
      entryWords: [],
    });
    await service.runTask('task-1', {
      trigger: 'CRON',
      actorUserId: 'admin-1',
    });
    expect(taskState?.consecutiveFailureCount).toBe(2);
    expect(taskState?.isEnabled).toBe(false);
  });

  it('cron SUCCESS 清零连续失败计数', async () => {
    // mock generate 成功路径（沿用现有成功用例的 fetch mock 模式）
    // task: maxConsecutiveFailures: 3, consecutiveFailureCount: 2
    // 期望 consecutiveFailureCount === 0 且 isEnabled 仍为 true
  });

  it('阈值 0 时失败递增但不停用', async () => {
    const { service, taskState } = createService({
      task: makeTask({ maxConsecutiveFailures: 0, consecutiveFailureCount: 5 }),
      entryWords: [],
    });
    await service.runTask('task-1', {
      trigger: 'CRON',
      actorUserId: 'admin-1',
    });
    expect(taskState?.consecutiveFailureCount).toBe(6);
    expect(taskState?.isEnabled).toBe(true);
  });

  it('manual FAILED 不改变计数与启用状态', async () => {
    const { service, taskState } = createService({
      task: makeTask({
        maxConsecutiveFailures: 1,
        consecutiveFailureCount: 0,
        isEnabled: true,
      }),
      entryWords: [],
    });
    await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
    });
    expect(taskState?.consecutiveFailureCount).toBe(0);
    expect(taskState?.isEnabled).toBe(true);
  });

  it('重新启用时清零连续失败计数', async () => {
    const { service, taskState } = createService({
      task: makeTask({
        isEnabled: false,
        consecutiveFailureCount: 3,
        maxConsecutiveFailures: 3,
      }),
    });
    await service.update('task-1', { isEnabled: true }, 'admin-1');
    expect(taskState?.isEnabled).toBe(true);
    expect(taskState?.consecutiveFailureCount).toBe(0);
  });
});
```

成功清零用例须复用现有 `runTask` SUCCESS 的 mock（`jest.spyOn(global, 'fetch')` 等），断言 `consecutiveFailureCount === 0`。

- [ ] **Step 2: Run 测试确认失败**

Run: `pnpm --filter @point-quest/api test -- ai-tasks.service.spec.ts -t '连续失败停用'`  
Expected: FAIL（字段不存在或计数未更新）

- [ ] **Step 3: DTO 增加可选阈值**

`create-ai-task.dto.ts`：

```ts
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  maxConsecutiveFailures?: number;
```

`update-ai-task.dto.ts`：

```ts
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(100)
  maxConsecutiveFailures?: number;
```

- [ ] **Step 4: Service 实现**

1. `AiTaskView` / `toTaskView` 映射两字段。
2. `create`：`maxConsecutiveFailures = input.maxConsecutiveFailures === undefined ? 0 : normalizeInt(..., 0, 100)`，写入 create data。
3. `update`：
   - 先 `const existing = await this.requireTask(id)`（若现有已查，复用）。
   - 若 `input.maxConsecutiveFailures !== undefined` → `normalizeInt` 写入。
   - 若 `input.isEnabled !== undefined`：`data.isEnabled = normalizeBoolean(...)`；若 `existing.isEnabled === false && data.isEnabled === true` → `data.consecutiveFailureCount = 0`。
4. 新增 private 方法（在 `finish` 的事务回调内调用）：

```ts
private async applyCronRunOutcome(
  tx: Prisma.TransactionClient,
  taskId: string,
  status: 'SUCCESS' | 'FAILED',
): Promise<void> {
  if (status === 'SUCCESS') {
    await tx.aiTask.update({
      where: { id: taskId },
      data: { consecutiveFailureCount: 0 },
    });
    return;
  }
  const task = await tx.aiTask.findUnique({
    where: { id: taskId },
    select: {
      consecutiveFailureCount: true,
      maxConsecutiveFailures: true,
    },
  });
  if (!task) return;
  const next = task.consecutiveFailureCount + 1;
  const disable =
    task.maxConsecutiveFailures > 0 && next >= task.maxConsecutiveFailures;
  await tx.aiTask.update({
    where: { id: taskId },
    data: {
      consecutiveFailureCount: next,
      ...(disable ? { isEnabled: false } : {}),
    },
  });
}
```

5. 修改 `finish`：在 `$transaction` 内，更新 run 之前或之后，若 `options.trigger === 'CRON'`，调用 `await this.applyCronRunOutcome(tx, taskId, status)`。注意：`finish` 已有可选的 `lastEntryId` 任务更新，与计数更新合并到同一次 `aiTask.update` 亦可（SUCCESS 时清零 + 游标；FAILED 时只计数）。优先保持一次 update 可读性：可把 outcome 合并进现有 task update，或先 outcome 再游标——**不得在循环内查库**。

6. `finishAfterGenerate` 同样走 `finish`，无需重复。

- [ ] **Step 5: Run 测试确认通过**

Run: `pnpm --filter @point-quest/api test -- ai-tasks.service.spec.ts`  
Expected: PASS（含「连续失败停用」与既有用例）

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/ai-tasks/dto/create-ai-task.dto.ts \
  apps/api/src/ai-tasks/dto/update-ai-task.dto.ts \
  apps/api/src/ai-tasks/ai-tasks.service.ts \
  apps/api/src/ai-tasks/ai-tasks.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): AI 任务连续 cron 失败达阈值自动停用

EOF
)"
```

---

### Task 3: 中断恢复 / 超时释放计入 cron 失败

**Files:**
- Modify: `apps/api/src/ai-tasks/ai-tasks.service.ts`（`recoverInterruptedRuns`、`releaseStaleRunningLocks`）
- Modify: `apps/api/src/ai-tasks/ai-tasks.service.spec.ts`

**Interfaces:**
- Consumes: `applyCronRunOutcome` 或等价「按任务累加 N 次失败」批量逻辑
- Produces: 遗留/超时 `RUNNING` 标 `FAILED` 后，对 `trigger=CRON` 的任务递增计数并可能停用

- [ ] **Step 1: 写失败测试**

扩展 `aiTaskRun.findMany` mock：支持 `where.status`，返回匹配的 `runs`。  
扩展 `updateMany`：支持 `where.id: { in: string[] }`。

```ts
it('recoverInterruptedRuns 将 cron RUNNING 计为失败并可达阈值停用', async () => {
  const { service, taskState, runs } = createService({
    task: makeTask({ maxConsecutiveFailures: 1, consecutiveFailureCount: 0 }),
    existingRuns: [
      {
        id: 'stuck-cron',
        aiTaskId: 'task-1',
        trigger: 'CRON',
        status: 'RUNNING',
        startedAt: new Date('2026-08-03T01:00:00.000Z'),
        finishedAt: null,
        questionsCreated: 0,
        lastEntryIdBefore: null,
        lastEntryIdAfter: null,
        errorMessage: null,
        aiResponseBody: null,
      },
    ],
  });
  const count = await service.recoverInterruptedRuns();
  expect(count).toBe(1);
  expect(runs[0]?.status).toBe('FAILED');
  expect(taskState?.consecutiveFailureCount).toBe(1);
  expect(taskState?.isEnabled).toBe(false);
});

it('recoverInterruptedRuns 对 MANUAL RUNNING 不计失败次数', async () => {
  const { service, taskState } = createService({
    task: makeTask({ maxConsecutiveFailures: 1, consecutiveFailureCount: 0 }),
    existingRuns: [
      {
        id: 'stuck-manual',
        aiTaskId: 'task-1',
        trigger: 'MANUAL',
        status: 'RUNNING',
        startedAt: new Date('2026-08-03T01:00:00.000Z'),
        finishedAt: null,
        questionsCreated: 0,
        lastEntryIdBefore: null,
        lastEntryIdAfter: null,
        errorMessage: null,
        aiResponseBody: null,
      },
    ],
  });
  await service.recoverInterruptedRuns();
  expect(taskState?.consecutiveFailureCount).toBe(0);
  expect(taskState?.isEnabled).toBe(true);
});
```

另增一条：`releaseStaleRunningLocks` 间接覆盖——可通过制造 `P2002` + 一条超时 cron `RUNNING`（`startedAt` 早于阈值）触发释放，断言计数 +1（复用现有 stale lock 测试结构并扩展断言）。

- [ ] **Step 2: Run 确认失败**

Run: `pnpm --filter @point-quest/api test -- ai-tasks.service.spec.ts -t 'recoverInterruptedRuns'`  
Expected: FAIL

- [ ] **Step 3: 实现 `recoverInterruptedRuns`**

```ts
async recoverInterruptedRuns(): Promise<number> {
  const running = await this.prisma.aiTaskRun.findMany({
    where: { status: 'RUNNING' },
    select: { id: true, aiTaskId: true, trigger: true },
  });
  if (running.length === 0) return 0;

  await this.prisma.$transaction(async (tx) => {
    await tx.aiTaskRun.updateMany({
      where: { id: { in: running.map((r) => r.id) } },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorMessage: INTERRUPTED_RUN_MESSAGE,
      },
    });

    const cronAdds = new Map<string, number>();
    for (const run of running) {
      if (run.trigger !== 'CRON') continue;
      cronAdds.set(run.aiTaskId, (cronAdds.get(run.aiTaskId) ?? 0) + 1);
    }
    const taskIds = [...cronAdds.keys()];
    if (taskIds.length === 0) return;

    // 批量取出任务配置，避免循环内查库
    const tasks = await tx.aiTask.findMany({
      where: { id: { in: taskIds } },
      select: {
        id: true,
        consecutiveFailureCount: true,
        maxConsecutiveFailures: true,
      },
    });
    // 启动恢复：任务数通常极少；每任务一次 update（非循环内查询）
    for (const task of tasks) {
      const add = cronAdds.get(task.id) ?? 0;
      const next = task.consecutiveFailureCount + add;
      const disable =
        task.maxConsecutiveFailures > 0 &&
        next >= task.maxConsecutiveFailures;
      await tx.aiTask.update({
        where: { id: task.id },
        data: {
          consecutiveFailureCount: next,
          ...(disable ? { isEnabled: false } : {}),
        },
      });
    }
  });

  return running.length;
}
```

- [ ] **Step 4: 实现 `releaseStaleRunningLocks` 计入**

先 `findMany` 匹配 stale RUNNING（含 `trigger`），再 `updateMany` 标 FAILED，再对 cron 按 `aiTaskId` 聚合后批量 `findMany` + 每任务一次 `update`（与上相同模式；可抽 `private async applyCronFailureAdds(tx, adds: Map<string, number>)`）。

- [ ] **Step 5: Run 测试通过**

Run: `pnpm --filter @point-quest/api test -- ai-tasks.service.spec.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/ai-tasks/ai-tasks.service.ts \
  apps/api/src/ai-tasks/ai-tasks.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): 中断恢复的 cron 失败计入连续失败停用

EOF
)"
```

---

### Task 4: OpenAPI + api-client

**Files:**
- Modify: `apps/api/src/openapi/api-contract.models.ts`
- Modify: `apps/api/src/openapi/create-openapi-document.spec.ts`（可选断言）
- Generate: OpenAPI JSON、`packages/api-client/src/schema.ts`

**Interfaces:**
- Produces schemas: `AiTaskDto.maxConsecutiveFailures`、`AiTaskDto.consecutiveFailureCount`；Create/Update request 可选 `maxConsecutiveFailures`（int32, 0–100）

- [ ] **Step 1: 更新 contract models**

`AiTaskDto`：

```ts
  @ApiProperty({ ...int32, minimum: 0, maximum: 100 })
  maxConsecutiveFailures!: number;

  @ApiProperty({ ...int32, minimum: 0 })
  consecutiveFailureCount!: number;
```

`CreateAiTaskRequestDto` / `UpdateAiTaskRequestDto`：

```ts
  @ApiPropertyOptional({ ...int32, minimum: 0, maximum: 100 })
  maxConsecutiveFailures?: number;
```

- [ ] **Step 2: 契约单测（建议）**

在 `create-openapi-document.spec.ts` 的 AI 任务用例中增加：

```ts
expect(aiTask.properties?.maxConsecutiveFailures).toMatchObject({
  type: 'integer',
  minimum: 0,
  maximum: 100,
});
expect(aiTask.properties?.consecutiveFailureCount).toMatchObject({
  type: 'integer',
  minimum: 0,
});
```

- [ ] **Step 3: 生成**

```bash
pnpm api:spec
pnpm api:client
```

Expected: 成功；`packages/api-client/src/schema.ts` 含新字段

- [ ] **Step 4: Run 相关测试**

Run: `pnpm --filter @point-quest/api test -- create-openapi-document.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/openapi/api-contract.models.ts \
  apps/api/src/openapi/create-openapi-document.spec.ts \
  apps/api/openapi.json \
  packages/api-client/src/schema.ts
# 若 generate 还改动了其他生成文件一并加入
git commit -m "$(cat <<'EOF'
feat(api): 同步 AI 任务失败停用字段到 OpenAPI 与 client

EOF
)"
```

（实际 `openapi.json` 路径以仓库为准，常见为 `apps/api/openapi.json` 或根目录生成物。）

---

### Task 5: 管理端表单与列表

**Files:**
- Modify: `apps/web/components/admin/ai-task-form.tsx`
- Modify: `apps/web/app/(admin)/admin/ai-tasks/page.tsx`
- Modify: `apps/web/tests/admin-ai-task-form.test.tsx`
- Modify: `apps/web/tests/admin-ai-tasks-page.test.tsx`

**Interfaces:**
- Consumes: `AiTaskDto.maxConsecutiveFailures`、`consecutiveFailureCount`；create/update payload `maxConsecutiveFailures`
- Produces: 表单可编辑阈值；编辑页只读当前连续失败；列表列展示 `n/max` 或「未启用」

- [ ] **Step 1: 表单单测（失败）**

在 `admin-ai-task-form.test.tsx`：

1. 所有 mock 任务对象补上 `maxConsecutiveFailures: 0`、`consecutiveFailureCount: 0`。
2. 新建用例：填写阈值 `3` 后保存，期望 `createAdminAiTask` 含 `maxConsecutiveFailures: 3`。
3. 编辑用例：`initialTask` 带 `consecutiveFailureCount: 2`，期望页面有「当前连续失败次数」只读展示且值为 `2`。

- [ ] **Step 2: 实现表单**

- state：`maxConsecutiveFailures` 字符串，默认 `String(initialTask?.maxConsecutiveFailures ?? 0)`
- `validate`：整数 0–100，否则推入错误「连续失败停用阈值必须是 0–100 的整数」
- `payload` 增加 `maxConsecutiveFailures: Number(maxConsecutiveFailures)`
- UI：在启用开关附近增加输入「连续失败停用阈值」，hint：`0 = 不自动停用；仅统计自动调度失败`
- `mode === "edit"` 时只读展示「当前连续失败次数」：`initialTask?.consecutiveFailureCount ?? 0`

- [ ] **Step 3: 列表单测与实现**

`task` fixture 增加两字段。列表表头增加「连续失败」列：

```tsx
<th>连续失败</th>
// ...
<td>
  {task.maxConsecutiveFailures > 0
    ? `${task.consecutiveFailureCount}/${task.maxConsecutiveFailures}`
    : "未启用"}
</td>
```

单测：渲染后 `screen.getByText("0/3")` 或「未启用」。

列表「启用」按钮走现有 `updateAdminAiTask({ isEnabled: true })`，后端已清零，无需前端另传计数。

- [ ] **Step 4: Run Web 测试**

Run: `pnpm --filter @point-quest/web test -- admin-ai-task-form.test.tsx admin-ai-tasks-page.test.tsx`  
Expected: PASS  
（filter 名以 `apps/web/package.json` 的 `name` 为准）

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/admin/ai-task-form.tsx \
  apps/web/app/\(admin\)/admin/ai-tasks/page.tsx \
  apps/web/tests/admin-ai-task-form.test.tsx \
  apps/web/tests/admin-ai-tasks-page.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): AI 任务连续失败停用阈值配置与展示

EOF
)"
```

---

## Spec Coverage Checklist

| Spec 要求 | Task |
|-----------|------|
| `maxConsecutiveFailures` / `consecutiveFailureCount` 字段 | 1 |
| cron FAILED 递增；达阈值停用 | 2 |
| cron SUCCESS 清零 | 2 |
| 阈值 0 递增不停用 | 2 |
| MANUAL 不影响 | 2 |
| 重新启用清零 | 2 |
| 改阈值不立即停用 | 2（无额外逻辑） |
| 中断恢复 cron FAILED 计入 | 3 |
| 超时释放计入 | 3 |
| OpenAPI / api-client | 4 |
| 表单阈值 + 当前计数 | 5 |
| 列表 `n/max` / 未启用 | 5 |
| 单元测试 | 2、3、4、5 |

## Placeholder / Consistency Review

- 字段名全程使用 `maxConsecutiveFailures` / `consecutiveFailureCount`（与 spec 一致）
- `applyCronRunOutcome` 与批量 `applyCronFailureAdds` 语义一致：SUCCESS→0；FAILED→+N；阈值>0 且 ≥ 则停用
- 无 TBD /「类似 Task N」占位

# AI 任务编辑游标 lastEntryId Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理端编辑 AI 任务时可修改 `lastEntryId` 游标（可清空重置），经现有 PATCH 保存。

**Architecture:** 在 `UpdateAiTaskDto` / OpenAPI 增加可选可空 `lastEntryId`；`AiTasksService.update` 解析 `null`/空串为清空、正整数字符串为 `BigInt`，不查 entry、不挡 RUNNING。编辑表单将只读游标改为可编辑，保存时一并提交。

**Tech Stack:** NestJS、class-validator、Prisma、Next.js、Jest、OpenAPI / `@point-quest/api-client`。

## Global Constraints

- Spec：`docs/superpowers/specs/2026-08-07-ai-task-edit-cursor-design.md`
- 仅编辑可改游标；新建不设初始游标
- `undefined` → 不改；`null` 或 trim 空串 → `null`；非空须 `/^\d+$/` 且 ≥ 1
- 不校验 entry 存在；不因 RUNNING 拒绝
- 不改调度 / 取词 / 自动推进逻辑
- 改 API 后执行 `pnpm api:spec` 与 `pnpm api:client`
- 新增/修改功能必须带单元测试且通过
- 禁止循环内 N+1 查库；日志禁止含敏感信息

## File Structure

| 路径 | 职责 |
|------|------|
| `apps/api/src/ai-tasks/dto/update-ai-task.dto.ts` | 可选可空 `lastEntryId` 入参 |
| `apps/api/src/ai-tasks/ai-tasks.service.ts` | `normalizeLastEntryId` + `update` 写入 |
| `apps/api/src/ai-tasks/ai-tasks.service.spec.ts` | update 游标单测 |
| `apps/api/src/openapi/api-contract.models.ts` | `UpdateAiTaskRequestDto.lastEntryId` |
| `apps/api/src/openapi/create-openapi-document.spec.ts` | 契约断言 |
| `packages/api-client/src/schema.ts`（生成） | 客户端类型 |
| `apps/web/components/admin/ai-task-form.tsx` | 可编辑游标字段 |
| `apps/web/tests/admin-ai-task-form.test.tsx` | 表单单测 |

---

### Task 1: API — update 支持 lastEntryId（TDD）

**Files:**
- Modify: `apps/api/src/ai-tasks/dto/update-ai-task.dto.ts`
- Modify: `apps/api/src/ai-tasks/ai-tasks.service.ts`
- Modify: `apps/api/src/ai-tasks/ai-tasks.service.spec.ts`

**Interfaces:**
- Consumes: 既有 `AiTasksService.update(id, input, userId)`、`UpdateAiTaskDto`
- Produces:
  - `UpdateAiTaskDto.lastEntryId?: string | null`
  - `normalizeLastEntryId(value: string | null): bigint | null`（service 内私有/文件级函数）
  - `update`：当 `input.lastEntryId !== undefined` 时写入 `data.lastEntryId`

- [ ] **Step 1: 写失败单测**

在 `apps/api/src/ai-tasks/ai-tasks.service.spec.ts` 的 `describe('AiTasksService CRUD')` 内追加：

```ts
  it('update 可设置 lastEntryId', async () => {
    const { service } = createService({
      task: makeTask({ lastEntryId: 10n }),
    });
    const updated = await service.update(
      'task-1',
      { lastEntryId: '42' },
      'admin-1',
    );
    expect(updated.lastEntryId).toBe('42');
  });

  it('update 可用 null 或空串清空 lastEntryId', async () => {
    const { service: s1 } = createService({
      task: makeTask({ lastEntryId: 99n }),
    });
    const clearedNull = await s1.update(
      'task-1',
      { lastEntryId: null },
      'admin-1',
    );
    expect(clearedNull.lastEntryId).toBeNull();

    const { service: s2 } = createService({
      task: makeTask({ lastEntryId: 99n }),
    });
    const clearedEmpty = await s2.update(
      'task-1',
      { lastEntryId: '  ' },
      'admin-1',
    );
    expect(clearedEmpty.lastEntryId).toBeNull();
  });

  it('update 非法 lastEntryId 失败', async () => {
    const { service } = createService({
      task: makeTask({ lastEntryId: 10n }),
    });
    for (const bad of ['0', '-1', 'abc', '1.5']) {
      await expect(
        service.update('task-1', { lastEntryId: bad }, 'admin-1'),
      ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    }
  });

  it('update 不带 lastEntryId 时游标不变', async () => {
    const { service } = createService({
      task: makeTask({ lastEntryId: 77n }),
    });
    const updated = await service.update(
      'task-1',
      { name: '改名' },
      'admin-1',
    );
    expect(updated.lastEntryId).toBe('77');
    expect(updated.name).toBe('改名');
  });
```

- [ ] **Step 2: 跑测确认失败**

Run:

```bash
pnpm --filter @point-quest/api test -- ai-tasks.service.spec.ts -t "update 可设置 lastEntryId"
```

Expected: FAIL（DTO/service 尚未接受或写入 `lastEntryId`）

- [ ] **Step 3: 扩展 UpdateAiTaskDto**

在 `apps/api/src/ai-tasks/dto/update-ai-task.dto.ts` 的 `wordMatchRules` 字段前增加：

```ts
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @Transform(trimText)
  @IsString()
  lastEntryId?: string | null;
```

（`null` 跳过 `@IsString`；空串经 trim 后由 service 判为重置。）

- [ ] **Step 4: Service 解析并写入**

在 `apps/api/src/ai-tasks/ai-tasks.service.ts` 的 `normalizeInt` 附近增加：

```ts
function normalizeLastEntryId(value: string | null): bigint | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw validationFailed(
      '游标 lastEntryId 须为正整数字符串，或留空以重置',
    );
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  if (!/^\d+$/.test(trimmed)) {
    throw validationFailed(
      '游标 lastEntryId 须为正整数字符串，或留空以重置',
    );
  }
  const id = BigInt(trimmed);
  if (id < 1n) {
    throw validationFailed(
      '游标 lastEntryId 须为正整数字符串，或留空以重置',
    );
  }
  return id;
}
```

在 `update` 方法中、`wordMatchRules` 处理之前增加：

```ts
    if (input.lastEntryId !== undefined) {
      data.lastEntryId = normalizeLastEntryId(input.lastEntryId);
    }
```

- [ ] **Step 5: 跑测确认通过**

Run:

```bash
pnpm --filter @point-quest/api test -- ai-tasks.service.spec.ts
```

Expected: PASS（含新建的 4 个用例；既有取词/推进不回归）

- [ ] **Step 6: Commit**

```bash
git add \
  apps/api/src/ai-tasks/dto/update-ai-task.dto.ts \
  apps/api/src/ai-tasks/ai-tasks.service.ts \
  apps/api/src/ai-tasks/ai-tasks.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): AI 任务 PATCH 支持修改 lastEntryId 游标

EOF
)"
```

---

### Task 2: OpenAPI 与 api-client

**Files:**
- Modify: `apps/api/src/openapi/api-contract.models.ts`
- Modify: `apps/api/src/openapi/create-openapi-document.spec.ts`
- Generate: OpenAPI 产物 + `packages/api-client/src/schema.ts`

**Interfaces:**
- Consumes: Task 1 的 `UpdateAiTaskDto.lastEntryId?: string | null`
- Produces: `UpdateAiTaskRequestDto.lastEntryId?: string | null`（OpenAPI + 生成客户端）

- [ ] **Step 1: 写契约失败断言**

在 `apps/api/src/openapi/create-openapi-document.spec.ts` 中，于 AI 任务相关断言附近增加：

```ts
    const updateAiTask = document.components?.schemas
      ?.UpdateAiTaskRequestDto as SchemaObject;
    expect(updateAiTask.properties?.lastEntryId).toMatchObject({
      type: 'string',
      nullable: true,
    });
```

- [ ] **Step 2: 跑测确认失败**

Run:

```bash
pnpm --filter @point-quest/api test -- create-openapi-document.spec.ts -t "lastEntryId"
```

Expected: FAIL（`UpdateAiTaskRequestDto` 尚无该属性；若 `-t` 匹配不到则跑整份 spec 文件）

- [ ] **Step 3: 更新 OpenAPI 模型**

在 `apps/api/src/openapi/api-contract.models.ts` 的 `UpdateAiTaskRequestDto` 中增加：

```ts
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'entry.id 游标；null 或空串表示重置',
  })
  lastEntryId?: string | null;
```

- [ ] **Step 4: 重新生成 spec 与 client**

Run:

```bash
pnpm api:spec && pnpm api:client
```

Expected: 成功；`packages/api-client/src/schema.ts` 中 `UpdateAiTaskRequestDto` 含 `lastEntryId?: string | null`

- [ ] **Step 5: 跑契约测通过**

Run:

```bash
pnpm --filter @point-quest/api test -- create-openapi-document.spec.ts
pnpm --filter @point-quest/api-client test
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add \
  apps/api/src/openapi/api-contract.models.ts \
  apps/api/src/openapi/create-openapi-document.spec.ts \
  packages/api-client/src/schema.ts
git add -u
git commit -m "$(cat <<'EOF'
feat(api): OpenAPI UpdateAiTask 增加 lastEntryId

EOF
)"
```

（若 `api:spec` 还改动了其他 openapi 产物路径，一并 `git add`。）

---

### Task 3: 前端编辑表单可改游标（TDD）

**Files:**
- Modify: `apps/web/components/admin/ai-task-form.tsx`
- Modify: `apps/web/tests/admin-ai-task-form.test.tsx`

**Interfaces:**
- Consumes: `updateAdminAiTask(id, { ..., lastEntryId?: string | null })`
- Produces: 编辑模式可编辑游标；保存提交 `lastEntryId: null | string`；新建不展示、不提交

- [ ] **Step 1: 写失败前端单测**

在 `apps/web/tests/admin-ai-task-form.test.tsx` 追加：

```tsx
  it("新建模式不展示游标字段", () => {
    render(
      <AiTaskForm
        api={{ createAdminAiTask: jest.fn(), updateAdminAiTask: jest.fn() }}
        mode="create"
        models={[{ id: "m1", name: "gpt-test" }]}
      />,
    );
    expect(screen.queryByLabelText("当前游标")).not.toBeInTheDocument();
  });

  it("编辑模式可修改游标并随 update 提交", async () => {
    const user = userEvent.setup();
    const updateAdminAiTask = jest
      .fn()
      .mockResolvedValue(makeTaskResponse({ lastEntryId: "42" }));
    render(
      <AiTaskForm
        api={{ createAdminAiTask: jest.fn(), updateAdminAiTask }}
        initialTask={
          makeTaskResponse({ lastEntryId: "20" }) as never
        }
        mode="edit"
        models={[{ id: "m1", name: "gpt-test" }]}
      />,
    );

    const cursor = screen.getByLabelText("当前游标");
    expect(cursor).toHaveValue("20");
    expect(cursor).not.toHaveAttribute("readonly");

    await user.clear(cursor);
    await user.type(cursor, "42");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateAdminAiTask).toHaveBeenCalledWith(
        "task-1",
        expect.objectContaining({ lastEntryId: "42" }),
      );
    });
  });

  it("编辑模式清空游标时提交 null", async () => {
    const user = userEvent.setup();
    const updateAdminAiTask = jest
      .fn()
      .mockResolvedValue(makeTaskResponse({ lastEntryId: null }));
    render(
      <AiTaskForm
        api={{ createAdminAiTask: jest.fn(), updateAdminAiTask }}
        initialTask={
          makeTaskResponse({ lastEntryId: "20" }) as never
        }
        mode="edit"
        models={[{ id: "m1", name: "gpt-test" }]}
      />,
    );

    await user.clear(screen.getByLabelText("当前游标"));
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateAdminAiTask).toHaveBeenCalledWith(
        "task-1",
        expect.objectContaining({ lastEntryId: null }),
      );
    });
  });

  it("编辑模式非法游标不调用 API", async () => {
    const user = userEvent.setup();
    const updateAdminAiTask = jest.fn();
    render(
      <AiTaskForm
        api={{ createAdminAiTask: jest.fn(), updateAdminAiTask }}
        initialTask={
          makeTaskResponse({ lastEntryId: "20" }) as never
        }
        mode="edit"
        models={[{ id: "m1", name: "gpt-test" }]}
      />,
    );

    const cursor = screen.getByLabelText("当前游标");
    await user.clear(cursor);
    await user.type(cursor, "abc");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(updateAdminAiTask).not.toHaveBeenCalled();
    expect(
      screen.getByText(/游标 lastEntryId 须为正整数字符串/),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 2: 跑测确认失败**

Run:

```bash
pnpm --filter @point-quest/web test -- admin-ai-task-form.test.tsx
```

Expected: FAIL（仍为 `readOnly`；payload 无 `lastEntryId`）

- [ ] **Step 3: 实现可编辑游标**

在 `apps/web/components/admin/ai-task-form.tsx`：

1. 增加 state：

```tsx
  const [lastEntryId, setLastEntryId] = useState(
    initialTask?.lastEntryId ?? "",
  );
```

2. 在 `validate()` 中、`wordMatchRules` 校验前增加（仅 edit）：

```tsx
    if (mode === "edit") {
      const cursor = lastEntryId.trim();
      if (cursor !== "" && !/^\d+$/.test(cursor)) {
        next.push("游标 lastEntryId 须为正整数字符串，或留空以重置");
      } else if (cursor !== "" && BigInt(cursor) < 1n) {
        next.push("游标 lastEntryId 须为正整数字符串，或留空以重置");
      }
    }
```

3. 构造 payload 时，edit 模式附带游标：

```tsx
      const payload = {
        name: name.trim(),
        aiModelConfigId,
        questionCount: Number(questionCount),
        optionCount: Number(optionCount),
        basePoints: Number(basePoints),
        cronExpression: cronExpression.trim(),
        isEnabled,
        maxConsecutiveFailures: Number(maxConsecutiveFailures),
        wordMatchRules: rules.rules,
        ...(mode === "edit"
          ? {
              lastEntryId:
                lastEntryId.trim() === "" ? null : lastEntryId.trim(),
            }
          : {}),
      };
```

4. 将只读控件改为：

```tsx
          {mode === "edit" ? (
            <label className="admin-field">
              <span>当前游标 lastEntryId（留空=从最小 entry.id 开始）</span>
              <input
                aria-label="当前游标"
                inputMode="numeric"
                onChange={(event) => setLastEntryId(event.target.value)}
                placeholder="留空则从最小 entry.id 开始"
                value={lastEntryId}
              />
            </label>
          ) : null}
```

- [ ] **Step 4: 跑测确认通过**

Run:

```bash
pnpm --filter @point-quest/web test -- admin-ai-task-form.test.tsx
```

Expected: PASS（含新建不展示、提交/清空/非法四类）

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web/components/admin/ai-task-form.tsx \
  apps/web/tests/admin-ai-task-form.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): AI 任务编辑表单支持修改游标

EOF
)"
```

---

## Spec coverage（自检）

| Spec 要求 | Task |
|-----------|------|
| PATCH 可选 `lastEntryId` | Task 1 |
| null/空串清空；正整数 ≥1；非法 400 | Task 1 |
| 不查 entry；不挡 RUNNING | Task 1（刻意不做） |
| OpenAPI / api-client | Task 2 |
| 编辑可改、新建不设 | Task 3 |
| 前后端单测与验收用例 | Task 1–3 |

无独立 cursor API、无列表行内编辑、无调度逻辑变更——均未纳入计划（符合非目标）。

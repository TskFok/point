# Admin Clear Question Bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理端题库页提供「清理题库」：加强确认（须输入「清空题库」）后强制删除全部题目，保留积分流水与余额。

**Architecture:** 新增 `POST /api/v1/admin/questions/clear`，在 `QuestionsService.clearAll` 单事务内依次：断开 `PointLedger.answerAttemptId` → 删全部 `AnswerAttempt` → `Question.deleteMany`。前端扩展 `ConfirmDialog` 支持 challenge 输入，题库页筛选行增加危险按钮并联到 `useConfirmAction({ kind: "clear" })`。OpenAPI → api-client 暴露 `clearAdminQuestions`。

**Tech Stack:** NestJS、Prisma、Jest（API）、Next.js、RTL/Jest（Web）、`@point-quest/api-client`、`ConfirmDialog` / `useConfirmAction`

## Global Constraints

- 规格：`docs/superpowers/specs/2026-08-07-admin-clear-question-bank-design.md`
- 清空范围：全部题目，忽略筛选/分页；含启用中与有答题记录的题
- 积分：保留 `PointLedger` 与余额；仅将 `answerAttemptId` 置 `null`
- 成功：`{ deleted: number }`；空库允许，返回 `{ deleted: 0 }`
- 确认文案：须精确匹配 trim 后的 `清空题库`
- 前端失败：保留确认弹窗，经 `ConfirmDialog.error` 展示（见 `apps/web/AGENTS.md`）
- 禁止循环内查库/删库；单条删除与 batch 规则不变
- 添加/修改功能须补或更新单元测试，相关测试必须通过
- 未经用户明确要求不 `git commit` / `git push`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/api/src/questions/questions.service.ts` | `clearAll()` 事务清空 |
| `apps/api/src/questions/questions.service.spec.ts` | clearAll 单元测试 |
| `apps/api/src/openapi/api-contract.models.ts` | `ClearQuestionsResponseDto` |
| `apps/api/src/questions/admin-questions.controller.ts` | `POST clear` + OpenAPI |
| `apps/api/src/questions/admin-questions.controller.spec.ts` | clear 委托测试 |
| `apps/api/src/openapi/create-openapi-document.spec.ts` | `adminClearQuestions` 契约 |
| `openapi/openapi.json` | `pnpm api:spec` 生成 |
| `packages/api-client/src/schema.ts` | `pnpm api:client` 生成 |
| `packages/api-client/src/client.ts` | ROUTES + `clearAdminQuestions` |
| `packages/api-client/src/client.test.ts` | 方法清单纳入 `clearAdminQuestions` |
| `apps/api/test/admin-questions.e2e-spec.ts` | 清空成功 / 学员 403 |
| `apps/web/components/ui/confirm-dialog.tsx` | 可选 `challengePhrase` 输入 |
| `apps/web/tests/confirm-dialog.test.tsx` | challenge 行为测试 |
| `apps/web/app/globals.css` | challenge 字段样式 |
| `apps/web/lib/admin/questions-ui.ts` | `CLEAR_QUESTION_BANK_CHALLENGE` 常量 |
| `apps/web/app/(admin)/admin/questions/page.tsx` | 清理按钮与确认流 |
| `apps/web/tests/admin-questions-page.test.tsx` | 清理交互测试 |
| `apps/web/tests/admin-pages.test.tsx` | 题库 mock 补 `clearAdminQuestions` |

---

### Task 1: QuestionsService.clearAll（TDD）

**Files:**
- Modify: `apps/api/src/questions/questions.service.spec.ts`
- Modify: `apps/api/src/questions/questions.service.ts`

**Interfaces:**
- Produces: `QuestionsService.clearAll(): Promise<{ deleted: number }>`
- 事务内顺序：`pointLedger.updateMany` → `answerAttempt.deleteMany` → `question.deleteMany`

- [ ] **Step 1: 写入失败用例**

在 `questions.service.spec.ts` 追加：

```ts
describe('QuestionsService.clearAll', () => {
  function createClearService(questionCount: number) {
    const pointLedgerUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const answerAttemptDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const questionDeleteMany = jest
      .fn()
      .mockResolvedValue({ count: questionCount });
    const callOrder: string[] = [];

    pointLedgerUpdateMany.mockImplementation(async () => {
      callOrder.push('ledger');
      return { count: 1 };
    });
    answerAttemptDeleteMany.mockImplementation(async () => {
      callOrder.push('attempts');
      return { count: 1 };
    });
    questionDeleteMany.mockImplementation(async () => {
      callOrder.push('questions');
      return { count: questionCount };
    });

    const tx = {
      pointLedger: { updateMany: pointLedgerUpdateMany },
      answerAttempt: { deleteMany: answerAttemptDeleteMany },
      question: { deleteMany: questionDeleteMany },
    };
    const prisma = {
      $transaction: <T>(callback: (client: typeof tx) => Promise<T>) =>
        callback(tx),
    };
    return {
      service: new QuestionsService(prisma as unknown as PrismaService),
      pointLedgerUpdateMany,
      answerAttemptDeleteMany,
      questionDeleteMany,
      callOrder,
    };
  }

  it('按顺序断开流水、删答题、删题目并返回 deleted', async () => {
    const {
      service,
      pointLedgerUpdateMany,
      answerAttemptDeleteMany,
      questionDeleteMany,
      callOrder,
    } = createClearService(3);

    await expect(service.clearAll()).resolves.toEqual({ deleted: 3 });
    expect(callOrder).toEqual(['ledger', 'attempts', 'questions']);
    expect(pointLedgerUpdateMany).toHaveBeenCalledWith({
      where: { answerAttemptId: { not: null } },
      data: { answerAttemptId: null },
    });
    expect(answerAttemptDeleteMany).toHaveBeenCalledWith({});
    expect(questionDeleteMany).toHaveBeenCalledWith({});
  });

  it('空库返回 deleted: 0', async () => {
    const { service } = createClearService(0);
    await expect(service.clearAll()).resolves.toEqual({ deleted: 0 });
  });
});
```

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter @point-quest/api test -- questions.service.spec.ts -t "clearAll"`

Expected: FAIL（`clearAll` 未定义）

- [ ] **Step 3: 实现 clearAll**

在 `questions.service.ts` 的 `QuestionsService` 内追加（建议放在 `remove` / `batch` 附近）：

```ts
  async clearAll(): Promise<{ deleted: number }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.pointLedger.updateMany({
        where: { answerAttemptId: { not: null } },
        data: { answerAttemptId: null },
      });
      await tx.answerAttempt.deleteMany({});
      const result = await tx.question.deleteMany({});
      return { deleted: result.count };
    });
  }
```

- [ ] **Step 4: 跑测确认通过**

Run: `pnpm --filter @point-quest/api test -- questions.service.spec.ts -t "clearAll"`

Expected: PASS

- [ ] **Step 5: Commit**（仅当用户明确要求提交时）

```bash
git add apps/api/src/questions/questions.service.ts apps/api/src/questions/questions.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): 题库强制清理服务 clearAll

EOF
)"
```

---

### Task 2: Controller、OpenAPI 与 api-client

**Files:**
- Modify: `apps/api/src/openapi/api-contract.models.ts`
- Modify: `apps/api/src/questions/admin-questions.controller.ts`
- Modify: `apps/api/src/questions/admin-questions.controller.spec.ts`
- Modify: `apps/api/src/openapi/create-openapi-document.spec.ts`
- Modify: `packages/api-client/src/client.ts`
- Modify: `packages/api-client/src/client.test.ts`
- Generate: `openapi/openapi.json`、`packages/api-client/src/schema.ts`

**Interfaces:**
- Consumes: `QuestionsService.clearAll(): Promise<{ deleted: number }>`
- Produces:
  - `POST /api/v1/admin/questions/clear` → `adminClearQuestions`
  - `ClearQuestionsResponseDto { deleted: number }`
  - `ApiClient.clearAdminQuestions(): Promise<{ deleted: number }>`

- [ ] **Step 1: 追加响应 DTO**

在 `api-contract.models.ts` 的 `BatchQuestionsResponseDto` 后追加：

```ts
export class ClearQuestionsResponseDto {
  @ApiProperty({ ...int32, minimum: 0 })
  deleted!: number;
}
```

确认文件顶部已有 `int32` 辅助常量可用（与同文件其他 DTO 一致）。

- [ ] **Step 2: 控制器路由（必须在 `:questionId` 之前）**

在 `admin-questions.controller.ts` 的 `@Post('batch')` 方法之后、`@Get(':questionId')` 之前插入：

```ts
  @Post('clear')
  @HttpCode(200)
  @ApiContract({
    operationId: 'adminClearQuestions',
    summary: '清空题库全部题目',
    responseType: ClearQuestionsResponseDto,
    responseStatus: 200,
    authenticated: true,
    mutation: true,
  })
  clear() {
    return this.questionsService.clearAll();
  }
```

并补充导入 `ClearQuestionsResponseDto`。

- [ ] **Step 3: 控制器单测**

在 `admin-questions.controller.spec.ts` 追加：

```ts
  it('clear 委托 QuestionsService.clearAll', async () => {
    const questionsService = {
      clearAll: jest.fn().mockResolvedValue({ deleted: 2 }),
    };
    const controller = new AdminQuestionsController(
      questionsService as never,
    );
    await expect(controller.clear()).resolves.toEqual({ deleted: 2 });
    expect(questionsService.clearAll).toHaveBeenCalledWith();
  });
```

- [ ] **Step 4: OpenAPI 契约测试**

在 `create-openapi-document.spec.ts`「题库批量接口契约」附近追加：

```ts
  it('题库清空接口契约', () => {
    const operation = document.paths['/api/v1/admin/questions/clear']?.post;
    expect(operation?.operationId).toBe('adminClearQuestions');
    expect(responseSchema(operation!.responses!['200']!)).toEqual({
      $ref: '#/components/schemas/ClearQuestionsResponseDto',
    });
  });
```

- [ ] **Step 5: 生成 OpenAPI 与 client schema**

Run:

```bash
pnpm api:spec
pnpm api:client
```

Expected: `openapi/openapi.json` 与 `packages/api-client/src/schema.ts` 含 `adminClearQuestions` / `ClearQuestionsResponseDto`

- [ ] **Step 6: api-client 方法**

在 `packages/api-client/src/client.ts` 的 `ROUTES` 中，于 `adminBatchQuestions` 之后追加：

```ts
  adminClearQuestions: {
    path: "/api/v1/admin/questions/clear",
    method: "POST",
  },
```

在客户端方法对象中、`batchAdminQuestions` 之后追加：

```ts
    clearAdminQuestions: () =>
      request("adminClearQuestions", {
        authMode: "authenticated",
      }),
```

在 `client.test.ts` 的方法名数组中按字母序加入 `"clearAdminQuestions"`（应在 `"cancelAdminOrder"` 与 `"completeAdminOrder"` 之间，或按该数组既有排序规则插入到正确位置——当前数组为字母序：放在 `"cancelAdminOrder"` 之后、`"completeAdminOrder"` 之前）。

- [ ] **Step 7: 跑测**

Run:

```bash
pnpm --filter @point-quest/api test -- admin-questions.controller.spec.ts create-openapi-document.spec.ts -t "clear|清空"
pnpm --filter @point-quest/api-client test -- client.test.ts -t "完整暴露"
```

Expected: PASS

- [ ] **Step 8: Commit**（仅当用户明确要求提交时）

```bash
git add apps/api/src/openapi/api-contract.models.ts \
  apps/api/src/questions/admin-questions.controller.ts \
  apps/api/src/questions/admin-questions.controller.spec.ts \
  apps/api/src/openapi/create-openapi-document.spec.ts \
  openapi/openapi.json \
  packages/api-client/src/schema.ts \
  packages/api-client/src/client.ts \
  packages/api-client/src/client.test.ts
git commit -m "$(cat <<'EOF'
feat(api): 暴露清空题库 adminClearQuestions

EOF
)"
```

---

### Task 3: ConfirmDialog challenge 输入（TDD）

**Files:**
- Modify: `apps/web/tests/confirm-dialog.test.tsx`
- Modify: `apps/web/components/ui/confirm-dialog.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/lib/admin/questions-ui.ts`（常量可在本 Task 或 Task 4 加入；推荐本 Task 末尾）

**Interfaces:**
- Produces: `ConfirmDialogProps.challengePhrase?: string` — 有值时显示输入框；确认按钮在 `input.trim() !== challengePhrase` 时 `disabled`

- [ ] **Step 1: 写入失败用例**

在 `confirm-dialog.test.tsx` 追加：

```tsx
  it("challengePhrase 未匹配时禁用确认按钮", async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    render(
      <ConfirmDialog
        challengePhrase="清空题库"
        confirmLabel="清理题库"
        confirmVariant="danger"
        onCancel={() => undefined}
        onConfirm={onConfirm}
        title="确认清理题库？"
      />,
    );
    await screen.findByRole("dialog", { name: "确认清理题库？" });
    const confirm = screen.getByRole("button", { name: "清理题库" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText("确认文案"), "错");
    expect(confirm).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("challengePhrase 匹配后可确认", async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    render(
      <ConfirmDialog
        challengePhrase="清空题库"
        confirmLabel="清理题库"
        confirmVariant="danger"
        onCancel={() => undefined}
        onConfirm={onConfirm}
        title="确认清理题库？"
      />,
    );
    await screen.findByRole("dialog", { name: "确认清理题库？" });
    await user.type(screen.getByLabelText("确认文案"), "清空题库");
    const confirm = screen.getByRole("button", { name: "清理题库" });
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter @point-quest/web test -- confirm-dialog.test.tsx -t "challengePhrase"`

Expected: FAIL（prop 不存在 / 无输入框）

- [ ] **Step 3: 扩展 ConfirmDialog**

更新 `ConfirmDialogProps`：

```ts
export type ConfirmDialogProps = {
  title: string;
  description?: string;
  challengePhrase?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "danger";
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  closeLabel?: string;
};
```

在组件内：

```ts
  const [challengeValue, setChallengeValue] = useState("");
  const challengeMet =
    !challengePhrase || challengeValue.trim() === challengePhrase;
  const confirmDisabled = pending || !challengeMet;
```

在 `error` 区块与 `dialog-actions` 之间插入（仅当 `challengePhrase` 有值）：

```tsx
        {challengePhrase ? (
          <label className="confirm-dialog__challenge">
            <span>请输入「{challengePhrase}」以确认</span>
            <input
              aria-label="确认文案"
              autoComplete="off"
              disabled={pending}
              onChange={(event) => setChallengeValue(event.target.value)}
              value={challengeValue}
            />
          </label>
        ) : null}
```

确认按钮改为 `disabled={confirmDisabled}`。`focusable()` 已包含 `input:not(:disabled)`，无需改焦点逻辑。

- [ ] **Step 4: 样式**

在 `globals.css` `.confirm-dialog__header p` 规则后追加：

```css
.confirm-dialog__challenge {
  display: flex;
  margin-top: 1rem;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.92rem;
}

.confirm-dialog__challenge input {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.55rem 0.75rem;
  background: var(--surface);
  color: var(--color-text);
}
```

（若项目无 `--radius-md` / `--surface`，改用与邻近表单 input 相同的既有 token，保持视觉一致。）

- [ ] **Step 5: 常量**

在 `apps/web/lib/admin/questions-ui.ts` 追加：

```ts
export const CLEAR_QUESTION_BANK_CHALLENGE = "清空题库";
```

- [ ] **Step 6: 跑测确认通过**

Run: `pnpm --filter @point-quest/web test -- confirm-dialog.test.tsx`

Expected: PASS（含原有用例）

- [ ] **Step 7: Commit**（仅当用户明确要求提交时）

```bash
git add apps/web/components/ui/confirm-dialog.tsx \
  apps/web/tests/confirm-dialog.test.tsx \
  apps/web/app/globals.css \
  apps/web/lib/admin/questions-ui.ts
git commit -m "$(cat <<'EOF'
feat(web): ConfirmDialog 支持 challenge 输入确认

EOF
)"
```

---

### Task 4: 题库页「清理题库」UI（TDD）

**Files:**
- Modify: `apps/web/tests/admin-questions-page.test.tsx`
- Modify: `apps/web/tests/admin-pages.test.tsx`
- Modify: `apps/web/app/(admin)/admin/questions/page.tsx`

**Interfaces:**
- Consumes: `api.clearAdminQuestions(): Promise<{ deleted: number }>`
- Consumes: `ConfirmDialog` + `CLEAR_QUESTION_BANK_CHALLENGE`
- Produces: 筛选行危险按钮 + `ConfirmAction` 的 `{ kind: "clear" }`

- [ ] **Step 1: 扩展 createApi 与失败用例**

在 `admin-questions-page.test.tsx` 的 `createApi` 中增加 `clearAdminQuestions: jest.fn().mockResolvedValue({ deleted: 3 })`，并在 overrides 类型中加入该字段。

追加 describe：

```tsx
describe("AdminQuestionsPage 清理题库", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/admin/questions");
  });

  it("展示清理题库按钮", async () => {
    render(<AdminQuestionsPage api={createApi()} />);
    await screen.findByText("启用中的题目");
    expect(
      screen.getByRole("button", { name: "清理题库" }),
    ).toBeVisible();
  });

  it("须输入清空题库后才调用 clearAdminQuestions", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminQuestionsPage api={api} />);
    await screen.findByText("启用中的题目");
    await user.click(screen.getByRole("button", { name: "清理题库" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认清理题库？",
    });
    const confirm = within(dialog).getByRole("button", { name: "清理题库" });
    expect(confirm).toBeDisabled();
    expect(api.clearAdminQuestions).not.toHaveBeenCalled();
    await user.type(
      within(dialog).getByLabelText("确认文案"),
      "清空题库",
    );
    await user.click(confirm);
    await waitFor(() => {
      expect(api.clearAdminQuestions).toHaveBeenCalledTimes(1);
      expect(screen.getByText("已清理 3 道题目")).toBeVisible();
    });
  });

  it("清理失败保留弹窗并展示错误", async () => {
    const user = userEvent.setup();
    const api = createApi({
      clearAdminQuestions: jest
        .fn()
        .mockRejectedValue(
          new ApiNetworkError("/api/v1/admin/questions/clear", "offline"),
        ),
    });
    render(<AdminQuestionsPage api={api} />);
    await screen.findByText("启用中的题目");
    await user.click(screen.getByRole("button", { name: "清理题库" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认清理题库？",
    });
    await user.type(
      within(dialog).getByLabelText("确认文案"),
      "清空题库",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "清理题库" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络连接失败，请检查网络后重试",
    );
    expect(
      screen.getByRole("dialog", { name: "确认清理题库？" }),
    ).toBeVisible();
  });
});
```

同步：凡 `admin-pages.test.tsx` 中构造题库 `api` 对象处，增加 `clearAdminQuestions: jest.fn()`（与既有 `deleteAdminQuestion` / `batchAdminQuestions` 并列），避免缺方法导致渲染失败。

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm --filter @point-quest/web test -- admin-questions-page.test.tsx -t "清理题库"`

Expected: FAIL

- [ ] **Step 3: 实现页面**

1) `QuestionsApi` 增加 `"clearAdminQuestions"`。

2) `ConfirmAction` 联合类型增加 `| { kind: "clear" }`。

3) 新增：

```ts
  async function clearQuestionBank(): Promise<string | null> {
    if (busy) return "请等待当前操作完成";
    setMutatingBatch(true);
    setMutationError(null);
    setActionMessage(null);
    try {
      const result = await api.clearAdminQuestions();
      setActionMessage(`已清理 ${result.deleted} 道题目`);
      setSelectedIds([]);
      await load();
      return null;
    } catch (error) {
      return getApiErrorMessage(error);
    } finally {
      setMutatingBatch(false);
    }
  }
```

4) `useConfirmAction` 的 `execute`：

```ts
      execute: async (action) => {
        if (action.kind === "clear") return clearQuestionBank();
        if (action.kind === "delete") return removeQuestion(action.target);
        if (action.kind === "disable") return toggleStatus(action.target);
        if (action.kind === "batch-delete") {
          return runBatch("delete", action.ids);
        }
        return runBatch("disable", action.ids);
      },
```

5) 筛选行「添加题目」旁：

```tsx
            <Button
              disabled={busy || loading}
              onClick={() => openConfirm({ kind: "clear" })}
              type="button"
              variant="danger"
            >
              <Trash2 aria-hidden="true" />
              清理题库
            </Button>
```

6) 确认文案分支（在现有 `confirmTitle` / `confirmDescription` / `confirmLabel` 上扩展 `kind === "clear"`）：

- title: `确认清理题库？`
- description: `将永久删除全部题目及答题记录；积分流水与余额保留；此操作不可恢复。请输入「清空题库」以确认。`
- confirmLabel: `清理题库`

7) `ConfirmDialog` 传入：

```tsx
        <ConfirmDialog
          cancelLabel="取消"
          challengePhrase={
            confirmAction.kind === "clear"
              ? CLEAR_QUESTION_BANK_CHALLENGE
              : undefined
          }
          confirmLabel={confirmLabel}
          confirmVariant="danger"
          description={confirmDescription}
          error={confirmError}
          onCancel={closeConfirm}
          onConfirm={() => void handleConfirm()}
          pending={
            confirmAction.kind === "clear" ||
            confirmAction.kind === "batch-disable" ||
            confirmAction.kind === "batch-delete"
              ? mutatingBatch
              : mutatingId === confirmAction.target.id
          }
          title={confirmTitle}
        />
```

从 `@/lib/admin/questions-ui` 导入 `CLEAR_QUESTION_BANK_CHALLENGE`（与既有 `ADMIN_QUESTIONS_OPEN_CREATE_KEY` 同文件）。

注意：`confirmAction.kind === "clear"` 时没有 `target`，`pending` 分支不得访问 `confirmAction.target`。

- [ ] **Step 4: 跑测确认通过**

Run:

```bash
pnpm --filter @point-quest/web test -- admin-questions-page.test.tsx admin-pages.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**（仅当用户明确要求提交时）

```bash
git add apps/web/app/\(admin\)/admin/questions/page.tsx \
  apps/web/tests/admin-questions-page.test.tsx \
  apps/web/tests/admin-pages.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): 题库页增加加强确认的清理题库

EOF
)"
```

---

### Task 5: E2E 清空题库

**Files:**
- Modify: `apps/api/test/admin-questions.e2e-spec.ts`

**Interfaces:**
- Consumes: `POST /api/v1/admin/questions/clear`
- 验证：有答题记录 + 积分流水时仍可清空；流水保留且 `answerAttemptId` 为 null；题目与答题消失；学员 403

- [ ] **Step 1: 追加 e2e 用例**

在「删除：已停用无记录…」用例附近追加：

```ts
  it('清空题库：强制删除含答题记录的题目并保留积分流水', async () => {
    const created = await request(server)
      .post('/api/v1/admin/questions')
      .set('Authorization', adminBearer)
      .send(validQuestion({ stem: `Clear-all active ${testRunId}` }))
      .expect(201);
    const question = created.body as unknown as QuestionBody;

    const attempt = await prisma.answerAttempt.create({
      data: {
        id: `clear-attempt-${testRunId}`,
        userId: studentId,
        questionId: question.id,
        selectedOptionId: question.options[0].id,
        mode: 'FIRST_ATTEMPT',
        isCorrect: true,
        basePointsSnapshot: question.basePoints,
        multiplierSnapshot: 1,
        pointsAwarded: question.basePoints,
        balanceAfterSnapshot: question.basePoints,
        errorCountSnapshot: 0,
        idempotencyKey: `clear-answer-${testRunId}`,
      },
    });

    await prisma.pointLedger.create({
      data: {
        id: `clear-ledger-${testRunId}`,
        userId: studentId,
        type: 'ANSWER_REWARD',
        delta: question.basePoints,
        balanceAfter: question.basePoints,
        answerAttemptId: attempt.id,
      },
    });

    const clearResponse = await request(server)
      .post('/api/v1/admin/questions/clear')
      .set('Authorization', adminBearer)
      .expect(200);

    expect(clearResponse.body).toEqual(
      expect.objectContaining({
        deleted: expect.any(Number),
      }),
    );
    expect((clearResponse.body as { deleted: number }).deleted).toBeGreaterThanOrEqual(1);

    await request(server)
      .get(`/api/v1/admin/questions/${question.id}`)
      .set('Authorization', adminBearer)
      .expect(404);

    expect(
      await prisma.answerAttempt.findUnique({ where: { id: attempt.id } }),
    ).toBeNull();

    const ledger = await prisma.pointLedger.findUnique({
      where: { id: `clear-ledger-${testRunId}` },
    });
    expect(ledger).toMatchObject({
      delta: question.basePoints,
      answerAttemptId: null,
    });
  });

  it('学员清空题库返回稳定 403', async () => {
    await request(server)
      .post('/api/v1/admin/questions/clear')
      .set('Authorization', studentBearer)
      .expect(403)
      .expect((response) => {
        expectErrorContract(response, 'FORBIDDEN');
      });
  });
```

注意：若测试库中还有其他套件遗留题目，`deleted` 用 `toBeGreaterThanOrEqual(1)`；用例本身须断言目标 `question.id` 404。若 e2e 套件在 `beforeEach` 会清题库，则可用精确 `deleted` 计数——以该文件现有隔离策略为准，优先精确断言。

- [ ] **Step 2: 跑 e2e**

Run: `pnpm --filter @point-quest/api test:e2e -- admin-questions.e2e-spec.ts -t "清空题库|学员清空"`

（若项目 e2e 脚本名不同，使用 `package.json` / `apps/api/package.json` 中实际脚本。）

Expected: PASS

- [ ] **Step 3: Commit**（仅当用户明确要求提交时）

```bash
git add apps/api/test/admin-questions.e2e-spec.ts
git commit -m "$(cat <<'EOF'
test(api): 清空题库 e2e 覆盖强制删除与 403

EOF
)"
```

---

## Spec coverage（自检）

| Spec 要求 | Task |
|-----------|------|
| 强制清空全部题目（含启用/有记录） | 1, 5 |
| 断开 PointLedger、删 Attempt、删 Question | 1 |
| 保留流水与余额 | 1, 5 |
| `POST .../clear` + `adminClearQuestions` + `{ deleted }` | 2 |
| 空库 `deleted: 0` | 1 |
| 加强确认须输入「清空题库」 | 3, 4 |
| 筛选行危险按钮「清理题库」 | 4 |
| 失败保留弹窗 | 4 |
| 成功刷新与文案 | 4 |
| 学员 403 | 5 |
| 不改单条/batch 删除规则 | 未改动既有路径 |
| 单元测试 | 各 Task |

无 TBD/占位；`clearAll` / `clearAdminQuestions` / `ClearQuestionsResponseDto` / challenge 文案命名全计划一致。

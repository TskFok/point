# Admin Question Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理端题库页支持对已停用且无答题记录的题目二次确认后硬删除。

**Architecture:** 后端新增 `DELETE /api/v1/admin/questions/:questionId`，在 `QuestionsService.remove` 内校验「存在 / 已停用 / 无 AnswerAttempt」后 `prisma.question.delete`。前端扩展现有停用确认流：`useConfirmAction` 支持 `kind: "disable" | "delete"`，仅对符合条件的行显示删除按钮。OpenAPI → api-client 同步暴露 `deleteAdminQuestion`。

**Tech Stack:** NestJS、Prisma、Jest（API）、Next.js、RTL/Jest（Web）、`@point-quest/api-client`、`ConfirmDialog` / `useConfirmAction`

## Global Constraints

- 规格：`docs/superpowers/specs/2026-08-06-admin-question-delete-design.md`
- 可删条件：`isActive === false` 且无关联 `AnswerAttempt`（按 `questionId` 计数）
- 错误码：`QUESTION_NOT_FOUND`（404）、`QUESTION_ACTIVE`（409）、`QUESTION_HAS_ATTEMPTS`（409，删除文案：`已有答题记录，无法删除`）
- 成功：`{ success: true }`（`SuccessResponseDto`）
- 前端失败：保留确认弹窗，经 `ConfirmDialog.error` 展示（见 `apps/web/AGENTS.md`）
- 不引入软删除；不级联删除 `AnswerAttempt` / 积分流水（有记录时拒绝删除）
- 停用二次确认行为保持不变
- 添加/修改功能须补或更新单元测试，相关测试必须通过
- 未经用户明确要求不 `git commit` / `git push`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/api/src/questions/questions.service.ts` | `remove(questionId)` 业务校验与硬删除 |
| `apps/api/src/questions/questions.service.spec.ts` | remove 单元测试 |
| `apps/api/src/questions/admin-questions.controller.ts` | `DELETE :questionId` + OpenAPI 契约 |
| `apps/api/src/questions/admin-questions.controller.spec.ts` | controller 委托测试（新建） |
| `openapi/openapi.json` | 由 `pnpm api:spec` 生成 |
| `packages/api-client/src/schema.ts` | 由 `pnpm api:client` 生成 |
| `packages/api-client/src/client.ts` | ROUTES + `deleteAdminQuestion` |
| `packages/api-client/src/client.test.ts` | 方法清单纳入 `deleteAdminQuestion` |
| `apps/api/test/admin-questions.e2e-spec.ts` | 删除成功 / 启用拒绝 / 有答题记录拒绝；改写「不存在 DELETE」断言 |
| `apps/web/app/(admin)/admin/questions/page.tsx` | 删除按钮、扩展确认流、成功提示 |
| `apps/web/tests/admin-questions-page.test.tsx` | 页面删除交互测试（新建） |
| `apps/web/tests/admin-pages.test.tsx` | 题库页 mock 补上 `deleteAdminQuestion` |

---

### Task 1: QuestionsService.remove（TDD）

**Files:**
- Modify: `apps/api/src/questions/questions.service.spec.ts`
- Modify: `apps/api/src/questions/questions.service.ts`

**Interfaces:**
- Produces: `QuestionsService.remove(questionId: string): Promise<{ success: true }>`
- Errors:
  - `NotFoundException` `{ code: 'QUESTION_NOT_FOUND', message: '题目不存在' }`
  - `ConflictException` `{ code: 'QUESTION_ACTIVE', message: '请先停用再删除' }`
  - `ConflictException` `{ code: 'QUESTION_HAS_ATTEMPTS', message: '已有答题记录，无法删除' }`

- [ ] **Step 1: 写入失败用例**

在 `questions.service.spec.ts` 追加（文件顶部已有 `ConflictException`；补 `NotFoundException` 导入）：

```ts
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type HttpException,
} from '@nestjs/common';

describe('QuestionsService.remove', () => {
  const inactive = {
    id: 'question-1',
    stem: 'Choose the correct form.',
    explanation: 'Grammar.',
    basePoints: 10,
    isActive: false,
    createdBy: 'admin-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  function createRemoveService(options: {
    existing?: typeof inactive | null;
    attemptCount?: number;
  }) {
    const existing = options.existing === undefined ? inactive : options.existing;
    const prisma = {
      question: {
        findUnique: () => Promise.resolve(existing),
        delete: ({ where }: { where: { id: string } }) =>
          Promise.resolve({ id: where.id, ...existing }),
      },
      answerAttempt: {
        count: () => Promise.resolve(options.attemptCount ?? 0),
      },
    };
    return {
      service: new QuestionsService(prisma as unknown as PrismaService),
      prisma,
    };
  }

  it('已停用且无答题记录时删除成功', async () => {
    const { service, prisma } = createRemoveService({ attemptCount: 0 });
    const deleteSpy = jest.spyOn(prisma.question, 'delete');
    await expect(service.remove('question-1')).resolves.toEqual({
      success: true,
    });
    expect(deleteSpy).toHaveBeenCalledWith({ where: { id: 'question-1' } });
  });

  it('不存在时 QUESTION_NOT_FOUND', async () => {
    const { service } = createRemoveService({ existing: null });
    await expect(service.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove('missing')).rejects.toMatchObject({
      response: { code: 'QUESTION_NOT_FOUND' },
    });
  });

  it('仍启用时 QUESTION_ACTIVE', async () => {
    const { service } = createRemoveService({
      existing: { ...inactive, isActive: true },
    });
    await expect(service.remove('question-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.remove('question-1')).rejects.toMatchObject({
      response: {
        code: 'QUESTION_ACTIVE',
        message: '请先停用再删除',
      },
    });
  });

  it('有答题记录时 QUESTION_HAS_ATTEMPTS（删除文案）', async () => {
    const { service, prisma } = createRemoveService({ attemptCount: 1 });
    const deleteSpy = jest.spyOn(prisma.question, 'delete');
    await expect(service.remove('question-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.remove('question-1')).rejects.toMatchObject({
      response: {
        code: 'QUESTION_HAS_ATTEMPTS',
        message: '已有答题记录，无法删除',
      },
    });
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试 — 期望 FAIL**

Run: `pnpm --filter @point-quest/api test -- questions.service.spec`

Expected: FAIL（`remove` 不存在）

- [ ] **Step 3: 实现 remove**

在 `questions.service.ts` 增加删除专用冲突 helper（**保留**现有 `questionHasAttempts()` 供 update 使用，文案不变）：

```ts
function questionActiveConflict(): ConflictException {
  return new ConflictException({
    code: 'QUESTION_ACTIVE',
    message: '请先停用再删除',
  });
}

function questionHasAttemptsForDelete(): ConflictException {
  return new ConflictException({
    code: 'QUESTION_HAS_ATTEMPTS',
    message: '已有答题记录，无法删除',
  });
}
```

在 `QuestionsService` 类中，`update` 方法之后增加：

```ts
async remove(questionId: string): Promise<{ success: true }> {
  const existing = await this.prisma.question.findUnique({
    where: { id: questionId },
  });
  if (!existing) {
    throw questionNotFound();
  }
  if (existing.isActive) {
    throw questionActiveConflict();
  }
  const attemptCount = await this.prisma.answerAttempt.count({
    where: { questionId },
  });
  if (attemptCount > 0) {
    throw questionHasAttemptsForDelete();
  }
  await this.prisma.question.delete({ where: { id: questionId } });
  return { success: true };
}
```

注意：校验顺序为 存在 → 启用中 → 有答题记录 → 删除，与规格一致。不要在有记录时依赖裸 P2003。

- [ ] **Step 4: 跑测试 — 期望 PASS**

Run: `pnpm --filter @point-quest/api test -- questions.service.spec`

Expected: PASS

- [ ] **Step 5: 不 commit**（除非用户要求）

---

### Task 2: Admin DELETE 路由 + OpenAPI + api-client

**Files:**
- Modify: `apps/api/src/questions/admin-questions.controller.ts`
- Create: `apps/api/src/questions/admin-questions.controller.spec.ts`
- Generate: `openapi/openapi.json`、`packages/api-client/src/schema.ts`
- Modify: `packages/api-client/src/client.ts`
- Modify: `packages/api-client/src/client.test.ts`

**Interfaces:**
- Consumes: `QuestionsService.remove(questionId)`
- Produces: `DELETE /api/v1/admin/questions/{questionId}`，`operationId: adminDeleteQuestion`；客户端 `deleteAdminQuestion(questionId: string)`

- [ ] **Step 1: 写 controller 委托失败测试**

新建 `apps/api/src/questions/admin-questions.controller.spec.ts`：

```ts
import { AdminQuestionsController } from './admin-questions.controller';

describe('AdminQuestionsController', () => {
  it('remove 委托 QuestionsService.remove', async () => {
    const questionsService = {
      remove: jest.fn().mockResolvedValue({ success: true }),
    };
    const controller = new AdminQuestionsController(
      questionsService as never,
    );
    await expect(controller.remove('question-1')).resolves.toEqual({
      success: true,
    });
    expect(questionsService.remove).toHaveBeenCalledWith('question-1');
  });
});
```

- [ ] **Step 2: 跑测试 — 期望 FAIL**

Run: `pnpm --filter @point-quest/api test -- admin-questions.controller.spec`

Expected: FAIL（无 `remove`）

- [ ] **Step 3: 实现 controller DELETE**

在 `admin-questions.controller.ts`：

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiContract,
  questionIdParam,
  questionQueries,
} from '../openapi/api-contract.decorator';
import {
  AdminQuestionDto,
  CreateQuestionRequestDto,
  QuestionListResponseDto,
  SuccessResponseDto,
  UpdateQuestionRequestDto,
} from '../openapi/api-contract.models';

// 在 AdminQuestionsController 内 update 之后：
@Delete(':questionId')
@ApiContract({
  operationId: 'adminDeleteQuestion',
  summary: '删除已停用且无答题记录的题目',
  responseType: SuccessResponseDto,
  authenticated: true,
  mutation: true,
  params: [questionIdParam],
})
remove(@Param('questionId') questionId: string) {
  return this.questionsService.remove(questionId);
}
```

- [ ] **Step 4: 重新生成 OpenAPI 与 schema**

Run:

```bash
pnpm api:spec
pnpm api:client
```

Expected: `openapi/openapi.json` 含 `adminDeleteQuestion`；`packages/api-client/src/schema.ts` 更新。

- [ ] **Step 5: 手写 api-client 方法**

在 `packages/api-client/src/client.ts` 的 ROUTES 中，`adminUpdateQuestion` 旁增加：

```ts
adminDeleteQuestion: {
  path: "/api/v1/admin/questions/{questionId}",
  method: "DELETE",
},
```

在 `createApiClient` 返回对象中，题目相关方法旁增加：

```ts
deleteAdminQuestion: (questionId: string) =>
  request("adminDeleteQuestion", {
    authMode: "authenticated",
    pathParams: { questionId },
  }),
```

在 `client.test.ts` 的排序方法清单中按字母序插入 `"deleteAdminQuestion"`（位于 `deleteAdminProduct` 与 `getAdminAiModel` 之间）。

- [ ] **Step 6: 跑测试 — 期望 PASS**

Run:

```bash
pnpm --filter @point-quest/api test -- admin-questions.controller.spec
pnpm --filter @point-quest/api-client test
```

Expected: PASS

- [ ] **Step 7: 不 commit**（除非用户要求）

---

### Task 3: 题目删除 e2e

**Files:**
- Modify: `apps/api/test/admin-questions.e2e-spec.ts`

**Interfaces:**
- Consumes: `DELETE /api/v1/admin/questions/:questionId` 真实行为

- [ ] **Step 1: 改写「不存在 DELETE」并补场景**

将现有用例：

```ts
it('学员访问管理题库时返回稳定 403，且不存在 DELETE 接口', async () => {
  // ...
  await request(server)
    .delete('/api/v1/admin/questions/not-a-question')
    .set('Authorization', adminBearer)
    .expect(404);
});
```

拆改如下：

1. 学员 403 用例标题改为 `学员访问管理题库时返回稳定 403`，**去掉** DELETE 断言（或保留学员 DELETE 也期望 403）。
2. 新增独立用例：

```ts
it('删除：已停用无记录成功；启用或有记录拒绝；不存在 404', async () => {
  // 成功：创建停用题 → DELETE 200 { success: true } → GET 详情 404
  const created = await request(server)
    .post('/api/v1/admin/questions')
    .set('Authorization', adminBearer)
    .send(validQuestion({ stem: 'Deletable inactive', isActive: false }))
    .expect(201);
  const deletable = created.body as unknown as QuestionBody;

  await request(server)
    .delete(`/api/v1/admin/questions/${deletable.id}`)
    .set('Authorization', adminBearer)
    .expect(200)
    .expect({ success: true });

  await request(server)
    .get(`/api/v1/admin/questions/${deletable.id}`)
    .set('Authorization', adminBearer)
    .expect(404)
    .expect((response) => {
      expectErrorContract(response, 'QUESTION_NOT_FOUND');
    });

  // 启用拒绝
  const activeCreated = await request(server)
    .post('/api/v1/admin/questions')
    .set('Authorization', adminBearer)
    .send(validQuestion({ stem: 'Still active for delete' }))
    .expect(201);
  const active = activeCreated.body as unknown as QuestionBody;

  await request(server)
    .delete(`/api/v1/admin/questions/${active.id}`)
    .set('Authorization', adminBearer)
    .expect(409)
    .expect((response) => {
      expectErrorContract(response, 'QUESTION_ACTIVE');
    });

  // 有答题记录拒绝：创建停用题 + answerAttempt → DELETE 409 QUESTION_HAS_ATTEMPTS
  const withAttemptsCreated = await request(server)
    .post('/api/v1/admin/questions')
    .set('Authorization', adminBearer)
    .send(
      validQuestion({
        stem: 'Inactive with attempts',
        isActive: false,
      }),
    )
    .expect(201);
  const withAttempts = withAttemptsCreated.body as unknown as QuestionBody;
  await prisma.answerAttempt.create({
    data: {
      id: `task-del-attempt-${testRunId}`,
      userId: studentId,
      questionId: withAttempts.id,
      selectedOptionId: withAttempts.options[0].id,
      mode: 'FIRST_ATTEMPT',
      isCorrect: true,
      basePointsSnapshot: withAttempts.basePoints,
      multiplierSnapshot: 1,
      pointsAwarded: withAttempts.basePoints,
      balanceAfterSnapshot: withAttempts.basePoints,
      errorCountSnapshot: 0,
      idempotencyKey: `task-del-answer-${testRunId}`,
    },
  });

  await request(server)
    .delete(`/api/v1/admin/questions/${withAttempts.id}`)
    .set('Authorization', adminBearer)
    .expect(409)
    .expect((response) => {
      expectErrorContract(response, 'QUESTION_HAS_ATTEMPTS');
    });

  // 不存在
  await request(server)
    .delete('/api/v1/admin/questions/not-a-question')
    .set('Authorization', adminBearer)
    .expect(404)
    .expect((response) => {
      expectErrorContract(response, 'QUESTION_NOT_FOUND');
    });
});
```

注意：`validQuestion` 已支持 `isActive`（见同文件创建停用题用例）；`idempotencyKey` / attempt `id` 须相对 `testRunId` 唯一，避免与既有 `task4-answer` 冲突。清理逻辑沿用文件 `afterEach`/`afterAll` 中的 `answerAttempt.deleteMany` → options → questions。

- [ ] **Step 2: 跑 e2e**

Run: `pnpm --filter @point-quest/api test:e2e -- admin-questions.e2e-spec`

Expected: PASS（需本地 test DB；若环境未起，按仓库 README / `db:test:reset` 准备）

- [ ] **Step 3: 不 commit**（除非用户要求）

---

### Task 4: 管理端题库页删除 UI（TDD）

**Files:**
- Create: `apps/web/tests/admin-questions-page.test.tsx`
- Modify: `apps/web/app/(admin)/admin/questions/page.tsx`
- Modify: `apps/web/tests/admin-pages.test.tsx`（题库相关 api mock 增加 `deleteAdminQuestion: jest.fn()`）

**Interfaces:**
- Consumes: `api.deleteAdminQuestion(questionId: string) => Promise<{ success: true }>`
- Produces: 仅 `!isActive && !hasAttempts` 显示删除；确认后调用 API；失败保留弹窗；停用确认流不变

- [ ] **Step 1: 写失败前端测试**

新建 `apps/web/tests/admin-questions-page.test.tsx`，对齐 `admin-products-page.test.tsx`：

```tsx
import { ApiNetworkError } from "@point-quest/api-client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminQuestionsPage from "@/app/(admin)/admin/questions/page";

const meta = { page: 1, pageSize: 20, total: 3, totalPages: 1 };

const baseQuestion = {
  basePoints: 10,
  createdAt: "2026-07-31T08:00:00.000Z",
  createdBy: "admin-1",
  explanation: "Grammar.",
  options: [
    {
      content: "is",
      id: "option-1",
      isCorrect: true,
      label: "A",
      position: 0,
      questionId: "q-active",
    },
    {
      content: "are",
      id: "option-2",
      isCorrect: false,
      label: "B",
      position: 1,
      questionId: "q-active",
    },
  ],
  updatedAt: "2026-07-31T08:00:00.000Z",
};

const activeQuestion = {
  ...baseQuestion,
  hasAttempts: false,
  id: "q-active",
  isActive: true,
  stem: "启用中的题目",
};

const inactiveClean = {
  ...baseQuestion,
  hasAttempts: false,
  id: "q-inactive-clean",
  isActive: false,
  options: baseQuestion.options.map((option) => ({
    ...option,
    questionId: "q-inactive-clean",
  })),
  stem: "可删除的停用题",
};

const inactiveWithAttempts = {
  ...baseQuestion,
  hasAttempts: true,
  id: "q-inactive-used",
  isActive: false,
  options: baseQuestion.options.map((option) => ({
    ...option,
    questionId: "q-inactive-used",
  })),
  stem: "有记录的停用题",
};

function createApi(
  overrides: Partial<{
    listAdminQuestions: jest.Mock;
    deleteAdminQuestion: jest.Mock;
    updateAdminQuestion: jest.Mock;
  }> = {},
) {
  return {
    createAdminQuestion: jest.fn(),
    getAdminQuestion: jest.fn(),
    listAdminQuestions: jest.fn().mockResolvedValue({
      data: [activeQuestion, inactiveClean, inactiveWithAttempts],
      meta,
    }),
    updateAdminQuestion: jest.fn(),
    deleteAdminQuestion: jest.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

describe("AdminQuestionsPage 删除", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/admin/questions");
  });

  it("仅已停用且无答题记录显示删除", async () => {
    render(<AdminQuestionsPage api={createApi()} />);
    await screen.findByText("可删除的停用题");
    expect(screen.getAllByRole("button", { name: "删除" })).toHaveLength(1);
  });

  it("删除需确认后才调用 deleteAdminQuestion", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminQuestionsPage api={api} />);
    await screen.findByText("可删除的停用题");
    await user.click(screen.getByRole("button", { name: "删除" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认删除题目「可删除的停用题」？",
    });
    expect(api.deleteAdminQuestion).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "删除" }));
    await waitFor(() => {
      expect(api.deleteAdminQuestion).toHaveBeenCalledWith("q-inactive-clean");
      expect(screen.getByText("已删除")).toBeVisible();
    });
  });

  it("删除失败保留确认弹窗并展示错误", async () => {
    const user = userEvent.setup();
    const api = createApi({
      deleteAdminQuestion: jest
        .fn()
        .mockRejectedValue(
          new ApiNetworkError(
            "/api/v1/admin/questions/q-inactive-clean",
            "offline",
          ),
        ),
    });
    render(<AdminQuestionsPage api={api} />);
    await screen.findByText("可删除的停用题");
    await user.click(screen.getByRole("button", { name: "删除" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认删除题目「可删除的停用题」？",
    });
    await user.click(within(dialog).getByRole("button", { name: "删除" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络连接失败，请检查网络后重试",
    );
    expect(
      screen.getByRole("dialog", {
        name: "确认删除题目「可删除的停用题」？",
      }),
    ).toBeVisible();
  });

  it("取消删除不调用 deleteAdminQuestion", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminQuestionsPage api={api} />);
    await screen.findByText("可删除的停用题");
    await user.click(screen.getByRole("button", { name: "删除" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认删除题目「可删除的停用题」？",
    });
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "确认删除题目「可删除的停用题」？",
        }),
      ).toBeNull();
    });
    expect(api.deleteAdminQuestion).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试 — 期望 FAIL**

Run: `pnpm --filter @point-quest/web test -- admin-questions-page`

Expected: FAIL（无删除按钮 / 无确认流）

- [ ] **Step 3: 实现页面删除流**

在 `questions/page.tsx`：

1. 增加 import：`Trash2`
2. `QuestionsApi` 增加 `"deleteAdminQuestion"`
3. 扩展类型：

```ts
type ConfirmAction =
  | { kind: "disable"; target: Question }
  | { kind: "delete"; target: Question };
```

4. 增加成功提示状态（若尚无）：`actionMessage`；删除成功设为 `"已删除"`。停用路径可继续用现有 `mutationError`，不必强制改成功提示。

5. `removeQuestion`：

```ts
async function removeQuestion(question: Question): Promise<string | null> {
  if (mutatingId) return "请等待当前操作完成";
  setMutatingId(question.id);
  setMutationError(null);
  setActionMessage(null);
  try {
    await api.deleteAdminQuestion(question.id);
    setActionMessage("已删除");
    await load();
    return null;
  } catch (error) {
    return getApiErrorMessage(error);
  } finally {
    setMutatingId(null);
  }
}
```

6. `useConfirmAction`：

```ts
const { confirmAction, confirmError, openConfirm, closeConfirm, handleConfirm } =
  useConfirmAction<ConfirmAction>({
    blocked: Boolean(mutatingId),
    execute: async (action) =>
      action.kind === "delete"
        ? removeQuestion(action.target)
        : toggleStatus(action.target),
  });
```

7. 辅助截断（页面内函数即可）：

```ts
function stemPreview(stem: string, max = 40): string {
  const trimmed = stem.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}
```

8. `ConfirmDialog` 按 `kind` 分支：

```tsx
{confirmAction ? (
  <ConfirmDialog
    cancelLabel="取消"
    confirmLabel={confirmAction.kind === "delete" ? "删除" : "停用题目"}
    confirmVariant="danger"
    description={
      confirmAction.kind === "delete"
        ? "此操作不可撤销。仅已停用且无答题记录的题目可删除。"
        : "停用后该题目将不再进入练习池。"
    }
    error={confirmError}
    onCancel={closeConfirm}
    onConfirm={() => void handleConfirm()}
    pending={mutatingId === confirmAction.target.id}
    title={
      confirmAction.kind === "delete"
        ? `确认删除题目「${stemPreview(confirmAction.target.stem)}」？`
        : "确认停用该题目？"
    }
  />
) : null}
```

9. 操作列在停用/启用按钮旁增加：

```tsx
{!question.isActive && !question.hasAttempts ? (
  <Button
    disabled={mutatingId !== null}
    onClick={() => openConfirm({ kind: "delete", target: question })}
    variant="secondary"
  >
    <Trash2 aria-hidden="true" />
    删除
  </Button>
) : null}
```

10. 在筛选卡与列表之间渲染成功提示：

```tsx
{actionMessage ? (
  <p className="success-banner" role="status">
    {actionMessage}
  </p>
) : null}
```

- [ ] **Step 4: 修补 admin-pages 题库 mock**

凡构造题库页 `api` 对象处增加 `deleteAdminQuestion: jest.fn()`。

- [ ] **Step 5: 跑测试 — 期望 PASS**

Run:

```bash
pnpm --filter @point-quest/web test -- admin-questions-page
pnpm --filter @point-quest/web test -- admin-pages
```

Expected: PASS（含既有停用确认用例仍通过）

- [ ] **Step 6: 不 commit**（除非用户要求）

---

### Task 5: 回归核对

**Files:** 无新文件

- [ ] **Step 1: 跑相关测试套件**

```bash
pnpm --filter @point-quest/api test -- questions.service.spec
pnpm --filter @point-quest/api test -- admin-questions.controller.spec
pnpm --filter @point-quest/api-client test
pnpm --filter @point-quest/web test -- admin-questions-page
pnpm --filter @point-quest/web test -- admin-pages
```

可选（环境允许时）：

```bash
pnpm --filter @point-quest/api test:e2e -- admin-questions.e2e-spec
```

Expected: 全部 PASS

- [ ] **Step 2: 对照规格验收清单**

1. 仅已停用且无答题记录显示删除，二次确认后才请求  
2. 启用 / 有答题记录后端拒绝，弹窗可展示错误  
3. 停用二次确认不受影响  
4. 测试通过  

- [ ] **Step 3: 请用户决定是否 commit**

---

## Spec Coverage Checklist

| 规格要求 | Task |
|----------|------|
| `DELETE` + `adminDeleteQuestion` + `{ success: true }` | 2 |
| `QUESTION_NOT_FOUND` / `QUESTION_ACTIVE` / `QUESTION_HAS_ATTEMPTS`（删除文案） | 1, 3 |
| 硬删除；选项/进度 Cascade；有 Attempt 拒绝 | 1（实现边界） |
| 仅停用且无记录显示删除按钮 | 4 |
| 扩展 `useConfirmAction` + `ConfirmDialog`，失败保留弹窗 | 4 |
| 确认文案含截断题干与「已删除」提示 | 4 |
| 停用确认流不变 | 4 |
| service / controller / e2e / 前端 / api-client 测试 | 1–5 |
| 无软删、无批量、无编辑弹窗删除入口 | 非目标（不实现） |

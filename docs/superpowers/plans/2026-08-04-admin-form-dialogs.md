# Admin 添加/编辑改为弹窗 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将管理端商品、AI 模型、AI 任务、题目的添加/编辑统一为共享 `FormDialog` 居中弹窗，并移除题目独立新建/编辑路由。

**Architecture:** 新增可复用的 `FormDialog`（portal、焦点陷阱、Esc/遮罩关闭、`pending` 时锁定关闭）。各列表页用 `editing` state 条件渲染弹窗并挂载现有 `*Form`；表单通过 `onPendingChange` 把提交中状态回传给弹窗。题目编辑在弹窗内拉取详情；仪表盘经 `sessionStorage` 一次性打开创建弹窗。

**Tech Stack:** Next.js App Router 客户端组件、React 19、`createPortal`、Jest + Testing Library、Playwright、现有 `globals.css` dialog 样式 token。

## Global Constraints

- 不把 create/edit 状态写入 URL；筛选/分页 URL 行为保持不变。
- 不做未保存离开确认。
- 不改造积分配置页、订单确认弹窗、学生端兑换弹窗。
- 不强制把 `OrderStatusDialog` / `RedeemDialog` 迁到 `FormDialog`。
- 新增/修改功能必须带单元测试且通过。
- 未获用户明确要求时不要 `git commit`（计划中的 Commit 步骤改为「暂存说明」，由用户决定是否提交）。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `apps/web/components/ui/form-dialog.tsx` | 共享表单弹窗壳 |
| `apps/web/tests/form-dialog.test.tsx` | FormDialog 无障碍与关闭行为 |
| `apps/web/app/globals.css` | `.form-dialog` 等样式；可删未用的 `.admin-editor-panel` |
| `apps/web/lib/admin/questions-ui.ts` | `ADMIN_QUESTIONS_OPEN_CREATE_KEY` 常量 |
| `apps/web/components/admin/product-form.tsx` | 增加 `onPendingChange` |
| `apps/web/components/admin/ai-model-form.tsx` | 增加 `onPendingChange` |
| `apps/web/components/admin/ai-task-form.tsx` | 增加 `onPendingChange` |
| `apps/web/components/admin/question-form.tsx` | 增加 `onPendingChange` |
| `apps/web/components/admin/question-form-dialog.tsx` | 题目创建/编辑弹窗（含详情加载） |
| `apps/web/app/(admin)/admin/products/page.tsx` | 内嵌面板 → FormDialog |
| `apps/web/app/(admin)/admin/ai-models/page.tsx` | 同上 |
| `apps/web/app/(admin)/admin/ai-tasks/page.tsx` | 同上 |
| `apps/web/app/(admin)/admin/questions/page.tsx` | Link 路由 → 弹窗；读 sessionStorage |
| `apps/web/app/(admin)/admin/page.tsx` | 快捷入口写 sessionStorage 后跳转列表 |
| 删除 `questions/new/page.tsx`、`questions/[questionId]/page.tsx`、`question-editor.tsx` | 独立编辑路由下线 |
| `apps/web/tests/admin-pages.test.tsx` 等 | 断言 dialog；更新 returnTo 相关用例 |
| `playwright/auth-and-questions.spec.ts` | 列表页弹窗创建题目 |

---

### Task 1: FormDialog 组件（TDD）

**Files:**
- Create: `apps/web/components/ui/form-dialog.tsx`
- Create: `apps/web/tests/form-dialog.test.tsx`
- Modify: `apps/web/app/globals.css`（在 `.dialog-backdrop` 附近追加 `.form-dialog`）

**Interfaces:**
- Consumes: `createPortal`、`lucide-react` 的 `X`
- Produces:
  ```ts
  type FormDialogProps = {
    title: string;
    description?: string;
    pending?: boolean;
    onClose: () => void;
    children: React.ReactNode;
    fallbackFocusRef?: RefObject<HTMLElement | null>;
    closeLabel?: string; // 默认「关闭」
  };

  function FormDialog(props: FormDialogProps): JSX.Element | null;
  ```

- [ ] **Step 1: 写失败测试**

创建 `apps/web/tests/form-dialog.test.tsx`：

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { FormDialog } from "@/components/ui/form-dialog";

function Harness({
  pending = false,
}: {
  pending?: boolean;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return <button type="button">已关闭</button>;
  return (
    <FormDialog
      onClose={() => setOpen(false)}
      pending={pending}
      title="测试表单"
      description="用于单测的说明"
    >
      <label>
        名称
        <input aria-label="名称" />
      </label>
      <button type="button">提交</button>
    </FormDialog>
  );
}

describe("FormDialog", () => {
  it("渲染 dialog 标题与内容", async () => {
    render(<Harness />);
    const dialog = await screen.findByRole("dialog", { name: "测试表单" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent("用于单测的说明");
    expect(screen.getByLabelText("名称")).toBeVisible();
    expect(dialog.closest(".dialog-layer")?.parentElement).toBe(document.body);
  });

  it("点击关闭按钮后调用 onClose", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole("dialog", { name: "测试表单" });
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(await screen.findByRole("button", { name: "已关闭" })).toBeVisible();
  });

  it("按 Escape 关闭", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole("dialog", { name: "测试表单" });
    await user.keyboard("{Escape}");
    expect(await screen.findByRole("button", { name: "已关闭" })).toBeVisible();
  });

  it("pending 时 Escape 与关闭按钮不关闭", async () => {
    const user = userEvent.setup();
    render(<Harness pending />);
    const dialog = await screen.findByRole("dialog", { name: "测试表单" });
    await user.keyboard("{Escape}");
    expect(dialog).toBeVisible();
    expect(screen.getByRole("button", { name: "关闭" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.getByRole("dialog", { name: "测试表单" })).toBeVisible();
  });

  it("打开后焦点落在弹窗内", async () => {
    render(<Harness />);
    const dialog = await screen.findByRole("dialog", { name: "测试表单" });
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @point-quest/web test -- form-dialog.test.tsx`

Expected: FAIL（无法解析 `@/components/ui/form-dialog`）

- [ ] **Step 3: 实现 FormDialog**

创建 `apps/web/components/ui/form-dialog.tsx`，行为对齐 `order-status-dialog.tsx` 的 portal / inert / focus trap / Esc，结构如下（实现时保持完整 effect，勿省略 inert 与 Tab 循环）：

```tsx
"use client";

import { X } from "lucide-react";
import {
  Fragment,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type FormDialogProps = {
  title: string;
  description?: string;
  pending?: boolean;
  onClose: () => void;
  children: ReactNode;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  closeLabel?: string;
};

export function FormDialog({
  title,
  description,
  pending = false,
  onClose,
  children,
  fallbackFocusRef,
  closeLabel = "关闭",
}: FormDialogProps) {
  const titleId = useId();
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const latestClose = useRef(onClose);
  const pendingRef = useRef(pending);

  useEffect(() => {
    latestClose.current = onClose;
    pendingRef.current = pending;
  }, [onClose, pending]);

  useEffect(() => {
    let cancelled = false;
    const host = document.createElement("div");
    host.className = "dialog-layer";
    document.body.append(host);
    queueMicrotask(() => {
      if (!cancelled) setPortalHost(host);
    });
    return () => {
      cancelled = true;
      host.remove();
    };
  }, []);

  useEffect(() => {
    if (!portalHost || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const opener = document.activeElement as HTMLElement | null;
    const fallbackFocus = fallbackFocusRef?.current;
    const backgroundStates = Array.from(document.body.children)
      .filter((element) => element !== portalHost)
      .map((element) => {
        const htmlElement = element as HTMLElement;
        const state = {
          element: htmlElement,
          ariaHidden: htmlElement.getAttribute("aria-hidden"),
          hadInert: htmlElement.hasAttribute("inert"),
          inert: htmlElement.inert,
        };
        htmlElement.setAttribute("aria-hidden", "true");
        htmlElement.setAttribute("inert", "");
        htmlElement.inert = true;
        return state;
      });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function focusable() {
      return Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      );
    }

    function focusInside() {
      (focusable()[0] ?? dialog).focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!pendingRef.current) latestClose.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function onFocusIn(event: FocusEvent) {
      if (!dialog.contains(event.target as Node)) focusInside();
    }

    focusInside();
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      document.body.style.overflow = previousOverflow;
      for (const state of backgroundStates) {
        if (state.ariaHidden === null) {
          state.element.removeAttribute("aria-hidden");
        } else {
          state.element.setAttribute("aria-hidden", state.ariaHidden);
        }
        if (state.hadInert) state.element.setAttribute("inert", "");
        else state.element.removeAttribute("inert");
        state.element.inert = state.inert;
      }
      if (opener?.isConnected && !("disabled" in opener && opener.disabled)) {
        opener.focus();
      } else {
        fallbackFocus?.focus();
      }
    };
  }, [fallbackFocusRef, portalHost]);

  useEffect(() => {
    if (pending) dialogRef.current?.focus();
  }, [pending]);

  if (!portalHost) return null;

  function requestClose() {
    if (!pendingRef.current) latestClose.current();
  }

  return createPortal(
    <Fragment>
      <button
        aria-hidden="true"
        className="dialog-backdrop"
        disabled={pending}
        onClick={requestClose}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="form-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <button
          aria-label={closeLabel}
          className="dialog-close"
          disabled={pending}
          onClick={requestClose}
          type="button"
        >
          <X aria-hidden="true" />
        </button>
        <header className="form-dialog__header">
          <h2 id={titleId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </header>
        <div className="form-dialog__body">{children}</div>
      </div>
    </Fragment>,
    portalHost,
  );
}
```

在 `globals.css` 的 `.dialog-backdrop` 之后追加：

```css
.form-dialog {
  position: relative;
  z-index: 1;
  display: flex;
  width: min(100%, 48rem);
  max-height: calc(100vh - 2rem);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: clamp(1.25rem, 4vw, 2rem);
  padding-top: 2.75rem;
  background: var(--surface-raised);
  box-shadow: var(--shadow-float);
}

.form-dialog__header h2 {
  margin: 0;
  font-size: 1.35rem;
}

.form-dialog__header p {
  margin: 0.35rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.92rem;
}

.form-dialog__body {
  overflow: auto;
  margin-top: 1rem;
  padding-right: 0.25rem;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @point-quest/web test -- form-dialog.test.tsx`

Expected: PASS

- [ ] **Step 5: 暂存说明（勿自动 commit）**

```bash
git add apps/web/components/ui/form-dialog.tsx apps/web/tests/form-dialog.test.tsx apps/web/app/globals.css
# 待用户要求再 commit：feat: 新增管理端 FormDialog 弹窗组件
```

---

### Task 2: 商品页接入 FormDialog

**Files:**
- Modify: `apps/web/components/admin/product-form.tsx`
- Modify: `apps/web/app/(admin)/admin/products/page.tsx`
- Modify: `apps/web/tests/admin-pages.test.tsx`（商品相关用例）

**Interfaces:**
- Consumes: `FormDialog` from Task 1
- Produces: `ProductForm` 增加可选 `onPendingChange?: (pending: boolean) => void`；页面用 `formPending` 传给 `FormDialog.pending`

- [ ] **Step 1: 更新失败断言（商品打开后应为 dialog）**

在 `admin-pages.test.tsx` 的「可打开新增表单」用例中，在点击「添加商品」后增加：

```tsx
expect(
  screen.getByRole("dialog", { name: "添加新商品" }),
).toBeVisible();
```

并保留对「商品名称」字段的断言。编辑切换用例同样期望表单出现在 `role="dialog"` 内。

- [ ] **Step 2: 运行测试确认失败或行为不符**

Run: `pnpm --filter @point-quest/web test -- admin-pages.test.tsx -t "商品列表安全回退"`

Expected: FAIL（尚无 dialog）

- [ ] **Step 3: ProductForm 增加 onPendingChange**

在 `ProductFormProps` 增加 `onPendingChange?: (pending: boolean) => void`。在组件内：

```tsx
useEffect(() => {
  onPendingChange?.(pending);
  return () => onPendingChange?.(false);
}, [onPendingChange, pending]);
```

- [ ] **Step 4: products/page 用 FormDialog 替换 admin-editor-panel**

将页面中 `{editing ? ( <section className="admin-editor-panel" …> … ) : null}` 替换为：

```tsx
const [formPending, setFormPending] = useState(false);

// …
{editing ? (
  <FormDialog
    description={
      editing === "create"
        ? "维护商品图片、库存、积分价格和上架状态。"
        : `编辑 ${editing.name}`
    }
    onClose={() => {
      if (!formPending) setEditing(null);
    }}
    pending={formPending}
    title={editing === "create" ? "添加新商品" : `编辑 ${editing.name}`}
  >
    <ProductForm
      api={api}
      initialProduct={editing === "create" ? undefined : editing}
      key={editing === "create" ? "create" : editing.id}
      mode={editing === "create" ? "create" : "edit"}
      onPendingChange={setFormPending}
      onSaved={handleSaved}
      productId={editing === "create" ? undefined : editing.id}
    />
  </FormDialog>
) : null}
```

删除未再使用的 `X` 图标 import（若仅用于关闭表单）。`handleSaved` 保持：`setEditing(null); void load();`，并在其中 `setFormPending(false)`。

- [ ] **Step 5: 运行相关测试**

Run: `pnpm --filter @point-quest/web test -- admin-pages.test.tsx admin-product-form.test.tsx`

Expected: PASS

- [ ] **Step 6: 暂存说明（勿自动 commit）**

```bash
git add apps/web/components/admin/product-form.tsx \
  apps/web/app/\(admin\)/admin/products/page.tsx \
  apps/web/tests/admin-pages.test.tsx
# feat: 商品添加/编辑改为 FormDialog
```

---

### Task 3: AI 模型与 AI 任务页接入 FormDialog

**Files:**
- Modify: `apps/web/components/admin/ai-model-form.tsx`
- Modify: `apps/web/components/admin/ai-task-form.tsx`
- Modify: `apps/web/app/(admin)/admin/ai-models/page.tsx`
- Modify: `apps/web/app/(admin)/admin/ai-tasks/page.tsx`
- Modify: `apps/web/tests/admin-ai-models-page.test.tsx`
- Modify: `apps/web/tests/admin-ai-tasks-page.test.tsx`（若无打开表单用例则新增）

**Interfaces:**
- Consumes: `FormDialog`；各 Form 的 `onPendingChange`
- Produces: 两页添加/编辑均在 `role="dialog"` 中

- [ ] **Step 1: 为两页各写/改一条打开弹窗测试**

`admin-ai-models-page.test.tsx` 追加：

```tsx
it("点击添加模型打开表单弹窗", async () => {
  const user = userEvent.setup();
  render(<AdminAiModelsPage api={createApi()} />);
  await screen.findByText("gpt-test");
  await user.click(screen.getByRole("button", { name: "添加模型" }));
  expect(
    await screen.findByRole("dialog", { name: "新配置" }),
  ).toBeVisible();
});
```

（弹窗 `title` 实现时用「新配置」/「编辑 ${name}」，与现有 heading 文案对齐。）

`admin-ai-tasks-page.test.tsx`：点击「新建任务」后出现 `role="dialog"`，`name: "新建 AI 任务"`。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @point-quest/web test -- admin-ai-models-page.test.tsx admin-ai-tasks-page.test.tsx`

Expected: FAIL（无 dialog）

- [ ] **Step 3: 表单 onPendingChange**

`AiModelForm`：`pending = saving || testing`，`useEffect` 调用 `onPendingChange?.(pending)`。  
`AiTaskForm`：`pending = saving`，同样回传。

- [ ] **Step 4: 两页替换 admin-editor-panel**

模式同 Task 2：`formPending` + `FormDialog` + 现有 Form props（`initialModel` / `initialTask`、`mode`、`onSaved`、`onCancel` 若存在则改为关闭弹窗）。标题：

- 模型创建：`新配置` / 编辑：`编辑 ${name}`
- 任务创建：`新建 AI 任务` / 编辑：`编辑 AI 任务`（保持页面原有文案）

- [ ] **Step 5: 运行测试**

Run: `pnpm --filter @point-quest/web test -- admin-ai-models-page.test.tsx admin-ai-model-form.test.tsx admin-ai-tasks-page.test.tsx admin-ai-task-form.test.tsx`

Expected: PASS

- [ ] **Step 6: 暂存说明（勿自动 commit）**

```bash
git add apps/web/components/admin/ai-model-form.tsx \
  apps/web/components/admin/ai-task-form.tsx \
  apps/web/app/\(admin\)/admin/ai-models/page.tsx \
  apps/web/app/\(admin\)/admin/ai-tasks/page.tsx \
  apps/web/tests/admin-ai-models-page.test.tsx \
  apps/web/tests/admin-ai-tasks-page.test.tsx
# feat: AI 模型与任务添加/编辑改为 FormDialog
```

---

### Task 4: 题目列表弹窗 + 路由清理 + 仪表盘入口

**Files:**
- Create: `apps/web/lib/admin/questions-ui.ts`
- Create: `apps/web/components/admin/question-form-dialog.tsx`
- Create: `apps/web/tests/question-form-dialog.test.tsx`
- Modify: `apps/web/components/admin/question-form.tsx`（`onPendingChange`）
- Modify: `apps/web/app/(admin)/admin/questions/page.tsx`
- Modify: `apps/web/app/(admin)/admin/page.tsx`
- Modify: `apps/web/tests/admin-pages.test.tsx`（题库 returnTo / 编辑 link 断言）
- Delete: `apps/web/app/(admin)/admin/questions/new/page.tsx`
- Delete: `apps/web/app/(admin)/admin/questions/[questionId]/page.tsx`
- Delete: `apps/web/components/admin/question-editor.tsx`

**Interfaces:**
- Consumes: `FormDialog`、`QuestionForm`、`getAdminQuestion`
- Produces:
  ```ts
  export const ADMIN_QUESTIONS_OPEN_CREATE_KEY = "admin-questions-open-create";

  type QuestionFormDialogProps = {
    api?: Pick<ApiClient, "createAdminQuestion" | "updateAdminQuestion" | "getAdminQuestion">;
    mode: "create" | "edit";
    questionId?: string; // edit 必填
    onClose: () => void;
    onSaved: (question: AdminQuestion) => void;
  };

  function QuestionFormDialog(props: QuestionFormDialogProps): JSX.Element;
  ```

- [ ] **Step 1: 常量与 QuestionFormDialog 失败测试**

`apps/web/lib/admin/questions-ui.ts`：

```ts
export const ADMIN_QUESTIONS_OPEN_CREATE_KEY = "admin-questions-open-create";
```

`apps/web/tests/question-form-dialog.test.tsx`：

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { QuestionFormDialog } from "@/components/admin/question-form-dialog";

const question = {
  id: "question-1",
  stem: "She ___ finished.",
  explanation: "singular",
  basePoints: 10,
  isActive: true,
  options: [
    { label: "A", content: "has", position: 0, isCorrect: true },
    { label: "B", content: "have", position: 1, isCorrect: false },
  ],
};

describe("QuestionFormDialog", () => {
  it("创建模式直接展示表单弹窗", async () => {
    render(
      <QuestionFormDialog
        mode="create"
        onClose={jest.fn()}
        onSaved={jest.fn()}
        api={{
          createAdminQuestion: jest.fn(),
          updateAdminQuestion: jest.fn(),
          getAdminQuestion: jest.fn(),
        }}
      />,
    );
    expect(
      await screen.findByRole("dialog", { name: "添加英语选择题" }),
    ).toBeVisible();
    expect(screen.getByLabelText("题干")).toBeVisible();
  });

  it("编辑模式先拉取详情再展示表单", async () => {
    const getAdminQuestion = jest.fn().mockResolvedValue(question);
    render(
      <QuestionFormDialog
        mode="edit"
        questionId="question-1"
        onClose={jest.fn()}
        onSaved={jest.fn()}
        api={{
          createAdminQuestion: jest.fn(),
          updateAdminQuestion: jest.fn(),
          getAdminQuestion,
        }}
      />,
    );
    expect(screen.getByText(/正在加载题目/)).toBeVisible();
    await waitFor(() => {
      expect(getAdminQuestion).toHaveBeenCalledWith("question-1");
    });
    expect(
      await screen.findByRole("dialog", { name: "编辑英语选择题" }),
    ).toBeVisible();
    expect(screen.getByLabelText("题干")).toHaveValue(question.stem);
  });
});
```

同时改 `admin-pages.test.tsx`：将「编辑题目」为 `link` + `returnTo` 的断言改为 `button`：

```tsx
expect(screen.getByRole("button", { name: "编辑题目" })).toBeVisible();
```

并新增用例：设置 `sessionStorage` 后进入页面自动出现创建弹窗：

```tsx
it("读取 sessionStorage 后自动打开新建题目弹窗", async () => {
  sessionStorage.setItem("admin-questions-open-create", "1");
  const api = {
    listAdminQuestions: jest.fn().mockResolvedValue({ data: [question], meta }),
    updateAdminQuestion: jest.fn(),
    createAdminQuestion: jest.fn(),
    getAdminQuestion: jest.fn(),
  };
  window.history.replaceState(null, "", "/admin/questions");
  render(<AdminQuestionsPage api={api} />);
  expect(
    await screen.findByRole("dialog", { name: "添加英语选择题" }),
  ).toBeVisible();
  expect(sessionStorage.getItem("admin-questions-open-create")).toBeNull();
});
```

（`AdminQuestionsPage` 的 api 类型需包含 create/get；按页面实际 Pick 扩展。）

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @point-quest/web test -- question-form-dialog.test.tsx admin-pages.test.tsx -t "题库|sessionStorage|编辑题目|筛选"`

Expected: FAIL

- [ ] **Step 3: 实现 QuestionFormDialog + QuestionForm.onPendingChange**

`question-form.tsx`：与商品相同，`useEffect` 在 `saving` 变化时调用 `onPendingChange`。

`question-form-dialog.tsx` 要点：

- `mode === "create"`：立即 `FormDialog` + `QuestionForm mode="create"`
- `mode === "edit"`：先 loading；成功后 `FormDialog` + `QuestionForm mode="edit"`；失败显示 `AsyncError` 与关闭
- 加载态也可用轻量 `FormDialog`（`pending={false}`）展示「正在加载题目」，或 dialog 内 Card；推荐加载/错误也包在同一 `FormDialog`（标题「编辑英语选择题」）以免闪烁
- `formPending` 传给 `FormDialog.pending`

- [ ] **Step 4: 改造 questions/page.tsx**

- 增加 `editing: "create" | { id: string } | null`
- 「添加题目」「添加第一道题目」改为 `Button`：`setEditing("create")`
- 「编辑题目」改为 `Button`：`setEditing({ id: question.id })`
- 删除 `returnToHref` 与相关 `Link`/`sessionStorage` 滚动逻辑（若滚动恢复仅服务独立页，可删；若列表筛选仍需要可保留筛选 URL，不必再写 scroll）
- mount effect：

```tsx
useEffect(() => {
  if (sessionStorage.getItem(ADMIN_QUESTIONS_OPEN_CREATE_KEY) === "1") {
    sessionStorage.removeItem(ADMIN_QUESTIONS_OPEN_CREATE_KEY);
    setEditing("create");
  }
}, []);
```

- 渲染：

```tsx
{editing ? (
  <QuestionFormDialog
    api={api}
    mode={editing === "create" ? "create" : "edit"}
    questionId={editing === "create" ? undefined : editing.id}
    onClose={() => setEditing(null)}
    onSaved={() => {
      setEditing(null);
      void load();
    }}
  />
) : null}
```

扩展页面 `QuestionsApi`：加入 `createAdminQuestion`、`getAdminQuestion`。

- [ ] **Step 5: 仪表盘入口**

将 `admin/page.tsx` 中：

```tsx
<Link … href="/admin/questions/new">添加英语题目</Link>
```

改为按钮或带 onClick 的控件：

```tsx
<button
  className="pq-button pq-button--primary"
  type="button"
  onClick={() => {
    sessionStorage.setItem(ADMIN_QUESTIONS_OPEN_CREATE_KEY, "1");
    window.location.assign("/admin/questions");
  }}
>
  添加英语题目
</button>
```

（若项目惯用 `useRouter().push`，优先 `router.push("/admin/questions")`。）

- [ ] **Step 6: 删除独立路由与 QuestionEditor**

删除：

- `apps/web/app/(admin)/admin/questions/new/page.tsx`
- `apps/web/app/(admin)/admin/questions/[questionId]/page.tsx`
- `apps/web/components/admin/question-editor.tsx`

全局搜索 `questions/new`、`QuestionEditor`、`returnTo`（管理端题目）并清掉残留引用。

- [ ] **Step 7: 运行测试**

Run: `pnpm --filter @point-quest/web test -- question-form-dialog.test.tsx admin-pages.test.tsx admin-question-form.test.tsx`

Expected: PASS

- [ ] **Step 8: 暂存说明（勿自动 commit）**

```bash
git add apps/web/lib/admin/questions-ui.ts \
  apps/web/components/admin/question-form-dialog.tsx \
  apps/web/components/admin/question-form.tsx \
  apps/web/app/\(admin\)/admin/questions/page.tsx \
  apps/web/app/\(admin\)/admin/page.tsx \
  apps/web/tests/question-form-dialog.test.tsx \
  apps/web/tests/admin-pages.test.tsx
git add -u apps/web/app/\(admin\)/admin/questions/new \
  apps/web/app/\(admin\)/admin/questions/\[questionId\] \
  apps/web/components/admin/question-editor.tsx
# feat: 题目添加/编辑改为弹窗并移除独立路由
```

---

### Task 5: E2E 与收尾

**Files:**
- Modify: `playwright/auth-and-questions.spec.ts`
- Modify: `apps/web/app/globals.css`（若 `.admin-editor-panel` 已无引用则删除该规则）
- 全量相关单测回归

- [ ] **Step 1: 更新 Playwright**

将开头改为：

```ts
await adminPage.goto("/admin/questions");
await adminPage.getByRole("button", { name: "添加题目" }).click();
await expect(
  adminPage.getByRole("dialog", { name: "添加英语选择题" }),
).toBeVisible();
await adminPage.getByLabel("题干").fill(question.stem);
// …其余字段与保存断言不变
```

- [ ] **Step 2: 清理未用 CSS**

确认无 `admin-editor-panel` 引用后删除 `.admin-editor-panel { … }` 规则。

- [ ] **Step 3: Web 单测全量（或管理端相关）**

Run: `pnpm --filter @point-quest/web test`

Expected: PASS

- [ ] **Step 4: 类型检查**

Run: `pnpm --filter @point-quest/web typecheck`

Expected: PASS

- [ ] **Step 5: 暂存说明（勿自动 commit）**

```bash
git add playwright/auth-and-questions.spec.ts apps/web/app/globals.css
# test: 题目创建 E2E 改为列表弹窗流程
```

---

## Spec Coverage Checklist

| 规格要求 | 任务 |
|----------|------|
| 共享 FormDialog（portal/焦点/Esc/pending） | Task 1 |
| 商品弹窗 | Task 2 |
| AI 模型 / AI 任务弹窗 | Task 3 |
| 题目弹窗 + getAdminQuestion | Task 4 |
| 删除 `/new` 与 `/[questionId]` | Task 4 |
| sessionStorage 仪表盘入口 | Task 4 |
| 不写 URL create/edit | 全局约束 + Tasks 2–4 |
| 单元测试 | Tasks 1–4 |
| E2E 更新 | Task 5 |
| 范围外模块不动 | Global Constraints |

## Self-Review Notes

- 无 TBD/占位步骤；`FormDialog` / `QuestionFormDialog` 签名在 Tasks 间一致。
- `onPendingChange` 在四个 Form 上命名统一。
- `ADMIN_QUESTIONS_OPEN_CREATE_KEY` 值固定为 `admin-questions-open-create`。

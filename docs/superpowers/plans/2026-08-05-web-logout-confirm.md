# Web 端退出登录二次确认 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Web 侧栏「退出」上增加自定义确认弹窗，确认后才调用 logout，防止误触注销。

**Architecture:** 新增通用 `ConfirmDialog`（Portal + 焦点陷阱 + Esc/遮罩关闭，对齐现有 Dialog），改造 `LogoutButton` 在确认后才调用 `api.logout()`；错误仅在弹窗内展示。

**Tech Stack:** Next.js 客户端组件、`@point-quest/ui` Button、Jest + Testing Library、`lucide-react`。

## Global Constraints

- 文案固定：标题「确定要退出登录吗？」；确认「退出登录」；取消「取消」；pending「退出中…」。
- 关闭方式：取消按钮 + Esc + 点击遮罩；`pending` 时均不可关闭。
- 不改后端、不改 Android、不替换现有 `window.confirm`、不抽 Dialog 底座 hook。
- 新增/修改功能必须带单元测试且通过。
- 未获用户明确要求时不要 `git commit`（计划中的 Commit 步骤改为「暂存说明」，由用户决定是否提交）。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `apps/web/components/ui/confirm-dialog.tsx` | 通用确认弹窗 |
| `apps/web/tests/confirm-dialog.test.tsx` | ConfirmDialog 行为单测 |
| `apps/web/app/globals.css` | `.confirm-dialog` 轻量布局样式 |
| `apps/web/components/layout/logout-button.tsx` | 打开确认弹窗后才 logout |
| `apps/web/tests/logout-button.test.tsx` | 更新为二次确认交互 |

---

### Task 1: ConfirmDialog（TDD）

**Files:**
- Create: `apps/web/components/ui/confirm-dialog.tsx`
- Create: `apps/web/tests/confirm-dialog.test.tsx`
- Modify: `apps/web/app/globals.css`（在 `.form-dialog` 样式块附近新增 `.confirm-dialog`）

**Interfaces:**
- Consumes: `@point-quest/ui` 的 `Button`；`lucide-react` 的 `X`；`react-dom` 的 `createPortal`
- Produces:
  ```ts
  export type ConfirmDialogProps = {
    title: string;
    description?: string;
    confirmLabel?: string; // 默认「确认」
    cancelLabel?: string; // 默认「取消」
    confirmVariant?: "primary" | "danger"; // 默认 "primary"
    pending?: boolean;
    error?: string | null;
    onConfirm: () => void;
    onCancel: () => void;
    fallbackFocusRef?: RefObject<HTMLElement | null>;
    closeLabel?: string; // 右上角关闭按钮 aria-label，默认「关闭」
  };

  export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element | null;
  ```

- [ ] **Step 1: 写失败测试**

创建 `apps/web/tests/confirm-dialog.test.tsx`：

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function Harness({
  pending = false,
  error = null,
}: {
  pending?: boolean;
  error?: string | null;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return <button type="button">已关闭</button>;
  return (
    <ConfirmDialog
      cancelLabel="取消"
      confirmLabel="退出登录"
      confirmVariant="danger"
      error={error}
      onCancel={() => setOpen(false)}
      onConfirm={() => setOpen(false)}
      pending={pending}
      title="确定要退出登录吗？"
    />
  );
}

describe("ConfirmDialog", () => {
  it("渲染标题与操作按钮", async () => {
    render(<Harness />);
    const dialog = await screen.findByRole("dialog", {
      name: "确定要退出登录吗？",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "取消" })).toBeVisible();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeVisible();
    expect(dialog.closest(".dialog-layer")?.parentElement).toBe(document.body);
  });

  it("点击确认触发 onConfirm", async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmDialog
        onCancel={onCancel}
        onConfirm={onConfirm}
        title="确认操作"
      />,
    );
    await screen.findByRole("dialog", { name: "确认操作" });
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("点击取消触发 onCancel", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole("dialog", { name: "确定要退出登录吗？" });
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(await screen.findByRole("button", { name: "已关闭" })).toBeVisible();
  });

  it("按 Escape 关闭", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole("dialog", { name: "确定要退出登录吗？" });
    await user.keyboard("{Escape}");
    expect(await screen.findByRole("button", { name: "已关闭" })).toBeVisible();
  });

  it("点击遮罩关闭", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole("dialog", { name: "确定要退出登录吗？" });
    const backdrop = document.querySelector(".dialog-backdrop");
    expect(backdrop).toBeTruthy();
    await user.click(backdrop as Element);
    expect(await screen.findByRole("button", { name: "已关闭" })).toBeVisible();
  });

  it("pending 时禁用操作且 Esc/遮罩/关闭不触发 onCancel", async () => {
    const user = userEvent.setup();
    render(<Harness pending />);
    const dialog = await screen.findByRole("dialog", {
      name: "确定要退出登录吗？",
    });
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "关闭" })).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(dialog).toBeVisible();

    const backdrop = document.querySelector(".dialog-backdrop");
    expect(backdrop).toBeDisabled();
    await user.click(backdrop as Element);
    expect(dialog).toBeVisible();

    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.getByRole("dialog", { name: "确定要退出登录吗？" })).toBeVisible();
  });

  it("展示 error 文案", async () => {
    render(<Harness error="网络连接失败，请检查网络后重试" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络连接失败，请检查网络后重试",
    );
  });

  it("打开后焦点落在弹窗内", async () => {
    render(<Harness />);
    const dialog = await screen.findByRole("dialog", {
      name: "确定要退出登录吗？",
    });
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm --filter @point-quest/web test -- confirm-dialog.test.tsx
```

Expected: FAIL（无法解析 `@/components/ui/confirm-dialog` 或组件未导出）

- [ ] **Step 3: 实现 ConfirmDialog**

创建 `apps/web/components/ui/confirm-dialog.tsx`，行为对齐 `FormDialog`（Portal、inert、焦点陷阱、Esc/遮罩、pending 锁闭）。完整实现：

```tsx
"use client";

import { Button } from "@point-quest/ui";
import { X } from "lucide-react";
import {
  Fragment,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type ConfirmDialogProps = {
  title: string;
  description?: string;
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

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  confirmVariant = "primary",
  pending = false,
  error = null,
  onConfirm,
  onCancel,
  fallbackFocusRef,
  closeLabel = "关闭",
}: ConfirmDialogProps) {
  const titleId = useId();
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const latestCancel = useRef(onCancel);
  const pendingRef = useRef(pending);

  useEffect(() => {
    latestCancel.current = onCancel;
    pendingRef.current = pending;
  }, [onCancel, pending]);

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
        if (!pendingRef.current) latestCancel.current();
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

  function requestCancel() {
    if (!pendingRef.current) latestCancel.current();
  }

  return createPortal(
    <Fragment>
      <button
        aria-hidden="true"
        className="dialog-backdrop"
        disabled={pending}
        onClick={requestCancel}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="confirm-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <button
          aria-label={closeLabel}
          className="dialog-close"
          disabled={pending}
          onClick={requestCancel}
          type="button"
        >
          <X aria-hidden="true" />
        </button>
        <header className="confirm-dialog__header">
          <h2 id={titleId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </header>
        {error ? (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="dialog-actions">
          <Button disabled={pending} onClick={requestCancel} variant="secondary">
            {cancelLabel}
          </Button>
          <Button
            disabled={pending}
            onClick={onConfirm}
            variant={confirmVariant}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Fragment>,
    portalHost,
  );
}
```

在 `apps/web/app/globals.css` 的 `.form-dialog` 块之后新增：

```css
.confirm-dialog {
  position: relative;
  z-index: 1;
  display: flex;
  width: min(100%, 28rem);
  max-height: calc(100vh - 2rem);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: clamp(1.25rem, 4vw, 1.75rem);
  padding-top: 2.75rem;
  background: var(--surface-raised);
  box-shadow: var(--shadow-float);
}

.confirm-dialog__header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.confirm-dialog__header p {
  margin: 0.35rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.92rem;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
pnpm --filter @point-quest/web test -- confirm-dialog.test.tsx
```

Expected: PASS（全部用例绿色）

- [ ] **Step 5: 暂存说明（勿自动 commit）**

```bash
git add apps/web/components/ui/confirm-dialog.tsx \
  apps/web/tests/confirm-dialog.test.tsx \
  apps/web/app/globals.css
git status
```

等待用户明确要求后再 commit。

---

### Task 2: LogoutButton 接入二次确认（TDD）

**Files:**
- Modify: `apps/web/components/layout/logout-button.tsx`
- Modify: `apps/web/tests/logout-button.test.tsx`

**Interfaces:**
- Consumes: `ConfirmDialog`（Task 1 产出的 props）
- Produces: 更新后的 `LogoutButton` 行为——点击「退出」仅打开确认；确认后才 `api.logout()`

- [ ] **Step 1: 改写失败测试**

将 `apps/web/tests/logout-button.test.tsx` **整体替换**为：

```tsx
import { ApiNetworkError } from "@point-quest/api-client";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LogoutButton } from "@/components/layout/logout-button";

const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

describe("LogoutButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("仅点击退出不调用 logout，并出现确认弹窗", async () => {
    const logout = jest.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<LogoutButton api={{ logout }} />);
    await user.click(screen.getByRole("button", { name: "退出" }));

    expect(
      await screen.findByRole("dialog", { name: "确定要退出登录吗？" }),
    ).toBeVisible();
    expect(logout).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("确认后 logout 成功并 replace 到 /login", async () => {
    const logout = jest.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<LogoutButton api={{ logout }} />);
    await user.click(screen.getByRole("button", { name: "退出" }));
    await user.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(logout).toHaveBeenCalledWith();
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });

  it("取消确认不调用 logout", async () => {
    const logout = jest.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<LogoutButton api={{ logout }} />);
    await user.click(screen.getByRole("button", { name: "退出" }));
    await user.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "确定要退出登录吗？" }),
      ).toBeNull();
    });
    expect(logout).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("请求进行中禁用确认按钮并显示退出中…", async () => {
    let resolveLogout!: (value: { success: boolean }) => void;
    const logout = jest.fn(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          resolveLogout = resolve;
        }),
    );
    const user = userEvent.setup();

    render(<LogoutButton api={{ logout }} />);
    await user.click(screen.getByRole("button", { name: "退出" }));
    await user.click(screen.getByRole("button", { name: "退出登录" }));

    expect(screen.getByRole("button", { name: "退出中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();

    resolveLogout({ success: true });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });

  it("失败时弹窗内展示错误且不跳转", async () => {
    const logout = jest
      .fn()
      .mockRejectedValue(
        new ApiNetworkError("/api/v1/auth/logout", new Error("offline")),
      );
    const user = userEvent.setup();

    render(<LogoutButton api={{ logout }} />);
    await user.click(screen.getByRole("button", { name: "退出" }));
    await user.click(screen.getByRole("button", { name: "退出登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络连接失败，请检查网络后重试",
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "确定要退出登录吗？" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeEnabled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm --filter @point-quest/web test -- logout-button.test.tsx
```

Expected: FAIL（点击「退出」会立刻调用 `logout`，或找不到确认弹窗）

- [ ] **Step 3: 改造 LogoutButton**

将 `apps/web/components/layout/logout-button.tsx` **整体替换**为：

```tsx
"use client";

import type { ApiClient } from "@point-quest/api-client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

type LogoutApi = Pick<ApiClient, "logout">;

export function LogoutButton({
  api = browserApiClient,
}: {
  api?: LogoutApi;
} = {}) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function closeConfirm() {
    if (pending) return;
    setConfirmOpen(false);
    setError(null);
  }

  async function handleLogout() {
    setPending(true);
    setError(null);
    try {
      await api.logout();
      router.replace("/login");
    } catch (logoutError) {
      setError(getApiErrorMessage(logoutError));
      setPending(false);
    }
  }

  return (
    <div className="sidebar-logout">
      <button
        className="sidebar-logout__button"
        disabled={pending}
        onClick={() => {
          setError(null);
          setConfirmOpen(true);
        }}
        ref={triggerRef}
        type="button"
      >
        <LogOut aria-hidden="true" />
        <span>退出</span>
      </button>
      {confirmOpen ? (
        <ConfirmDialog
          cancelLabel="取消"
          confirmLabel={pending ? "退出中…" : "退出登录"}
          confirmVariant="danger"
          error={error}
          fallbackFocusRef={triggerRef}
          onCancel={closeConfirm}
          onConfirm={() => void handleLogout()}
          pending={pending}
          title="确定要退出登录吗？"
        />
      ) : null}
    </div>
  );
}
```

注意：侧栏原 `.sidebar-logout__error` 错误区删除；错误只走弹窗 `error` prop。侧栏按钮在确认前保持文案「退出」（不再在侧栏显示「退出中…」）。

- [ ] **Step 4: 运行相关测试确认通过**

Run:

```bash
pnpm --filter @point-quest/web test -- logout-button.test.tsx confirm-dialog.test.tsx
```

Expected: PASS

若仓库还有导航相关断言提到退出错误区，一并跑：

```bash
pnpm --filter @point-quest/web test -- navigation.test.tsx
```

Expected: PASS（或与本改动无关的既有失败需单独处理，不扩大范围）

- [ ] **Step 5: 暂存说明（勿自动 commit）**

```bash
git add apps/web/components/layout/logout-button.tsx \
  apps/web/tests/logout-button.test.tsx
git status
```

等待用户明确要求后再 commit。建议信息：

```text
feat: Web 退出登录增加二次确认弹窗
```

---

## Spec Coverage Checklist

| 规格要求 | 对应任务 |
|----------|----------|
| 自定义 ConfirmDialog | Task 1 |
| Esc / 遮罩 / 取消关闭；pending 锁闭 | Task 1 |
| 文案 A + danger 确认按钮 | Task 2 |
| 确认后才 logout + replace `/login` | Task 2 |
| 错误仅弹窗内展示 | Task 2 |
| 单元测试覆盖 ConfirmDialog + LogoutButton | Task 1、2 |
| 不改 API / Android / window.confirm | 全局约束，无任务触碰 |

## Self-Review Notes

- 无 TBD / 占位步骤；测试与实现代码完整给出。
- `ConfirmDialogProps` 在 Task 1 / Task 2 命名一致。
- pending 确认文案由 `LogoutButton` 传入 `confirmLabel`，不在 `ConfirmDialog` 内硬编码「退出中…」。

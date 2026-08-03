# Web 端用户退出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在学员与管理员桌面左侧栏底部提供「退出」，调用已有 Cookie 模式 logout 并跳转登录页。

**Architecture:** 共用客户端组件 `LogoutButton` 调用 `browserApiClient.logout()`，成功后 `router.replace("/login")`；挂到 `StudentShell` / `AdminShell` 的 `.sidebar-footer` 底部。窄屏不另加入口。

**Tech Stack:** Next.js App Router 客户端组件、`@point-quest/api-client`、Jest + Testing Library、`lucide-react`。

## Global Constraints

- 不新增后端接口或 Server Action；只用现有 `POST /api/v1/auth/logout` + CSRF Cookie 模式。
- 窄屏：管理员抽屉与学员底栏 / 个人中心均不放退出入口。
- 无二次确认弹窗。
- 新增/修改功能必须带单元测试且通过。
- 未获用户明确要求时不要 `git commit`（计划中的 Commit 步骤改为「暂存说明」，由用户决定是否提交）。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `apps/web/components/layout/logout-button.tsx` | 退出按钮：调 logout、状态、错误、跳转 |
| `apps/web/tests/logout-button.test.tsx` | LogoutButton 行为单测 |
| `apps/web/components/layout/student-shell.tsx` | 侧栏底部 footer：tip + LogoutButton |
| `apps/web/components/layout/admin-shell.tsx` | 桌面侧栏底部 footer：LogoutButton；抽屉不加 |
| `apps/web/app/globals.css` | `.sidebar-footer` / `.sidebar-logout` 样式；tip 去 `margin-top: auto` |
| `apps/web/tests/navigation.test.tsx` | 断言两端侧栏有退出；抽屉无退出 |

---

### Task 1: LogoutButton 组件（TDD）

**Files:**
- Create: `apps/web/components/layout/logout-button.tsx`
- Create: `apps/web/tests/logout-button.test.tsx`

**Interfaces:**
- Consumes: `browserApiClient.logout()`、`getApiErrorMessage`、`useRouter().replace`
- Produces:
  ```ts
  type LogoutApi = { logout: (input?: { refreshToken?: string }) => Promise<{ success: boolean }> };

  function LogoutButton(props?: {
    api?: LogoutApi;
  }): JSX.Element;
  ```

- [ ] **Step 1: 写失败测试**

创建 `apps/web/tests/logout-button.test.tsx`：

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

  it("成功退出后 replace 到 /login", async () => {
    const logout = jest.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<LogoutButton api={{ logout }} />);
    await user.click(screen.getByRole("button", { name: "退出" }));

    await waitFor(() => {
      expect(logout).toHaveBeenCalledWith();
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });

  it("请求进行中禁用按钮并显示退出中…", async () => {
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

    expect(screen.getByRole("button", { name: "退出中…" })).toBeDisabled();

    resolveLogout({ success: true });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });

  it("失败时不跳转并展示错误", async () => {
    const logout = jest
      .fn()
      .mockRejectedValue(new ApiNetworkError("/api/v1/auth/logout", new Error("offline")));
    const user = userEvent.setup();

    render(<LogoutButton api={{ logout }} />);
    await user.click(screen.getByRole("button", { name: "退出" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络连接失败，请检查网络后重试",
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "退出" })).toBeEnabled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd apps/web && pnpm test -- tests/logout-button.test.tsx
```

Expected: FAIL（模块或组件不存在）

- [ ] **Step 3: 实现 LogoutButton**

创建 `apps/web/components/layout/logout-button.tsx`：

```tsx
"use client";

import type { ApiClient } from "@point-quest/api-client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

type LogoutApi = Pick<ApiClient, "logout">;

export function LogoutButton({
  api = browserApiClient,
}: {
  api?: LogoutApi;
} = {}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        onClick={() => void handleLogout()}
        type="button"
      >
        <LogOut aria-hidden="true" />
        <span>{pending ? "退出中…" : "退出"}</span>
      </button>
      {error ? (
        <p aria-live="assertive" className="sidebar-logout__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
cd apps/web && pnpm test -- tests/logout-button.test.tsx
```

Expected: PASS（3 tests）

- [ ] **Step 5: 暂存说明（勿自动 commit）**

```bash
git add apps/web/components/layout/logout-button.tsx apps/web/tests/logout-button.test.tsx
# 等待用户要求再 commit
```

---

### Task 2: 侧栏样式与挂载到 StudentShell / AdminShell

**Files:**
- Modify: `apps/web/app/globals.css`（`.sidebar-tip`、新增 `.sidebar-footer` / `.sidebar-logout*`）
- Modify: `apps/web/components/layout/student-shell.tsx`
- Modify: `apps/web/components/layout/admin-shell.tsx`
- Modify: `apps/web/tests/navigation.test.tsx`

**Interfaces:**
- Consumes: `LogoutButton`（Task 1）
- Produces: 两端桌面侧栏底部可见「退出」；管理员抽屉内无「退出」

- [ ] **Step 1: 写失败的导航断言**

在 `apps/web/tests/navigation.test.tsx`：

1. 扩展 `next/navigation` mock，增加 `useRouter`（`replace` 可用 `jest.fn()`），避免挂载 `LogoutButton` 时崩溃。
2. 在「学员桌面端…」用例末尾增加：

```tsx
expect(screen.getByRole("button", { name: "退出" })).toBeInTheDocument();
```

3. 在「管理员真实路径激活侧栏菜单」用例末尾增加：

```tsx
expect(screen.getByRole("button", { name: "退出" })).toBeInTheDocument();
```

4. 在「管理员抽屉…」用例中，打开抽屉后断言：

```tsx
expect(
  within(dialog).queryByRole("button", { name: "退出" }),
).not.toBeInTheDocument();
// 桌面侧栏仍有退出（dialog 外）
expect(screen.getByRole("button", { name: "退出" })).toBeInTheDocument();
```

完整 mock 形态示例：

```tsx
const mockUsePathname = jest.fn(() => "/learn");
const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({
    replace: mockReplace,
  }),
}));
```

- [ ] **Step 2: 运行导航测试确认新断言失败或挂载失败**

Run:

```bash
cd apps/web && pnpm test -- tests/navigation.test.tsx
```

Expected: FAIL（找不到「退出」按钮，或尚未 mock `useRouter` 时报错）

- [ ] **Step 3: 更新 CSS**

在 `apps/web/app/globals.css`：

1. 将 `.sidebar-tip` 的 `margin-top: auto` **删除**（改由 footer 顶开）。
2. 在 `.sidebar-tip` 块附近新增：

```css
.sidebar-footer {
  display: grid;
  margin-top: auto;
  gap: 0.75rem;
}

.sidebar-logout__button {
  display: flex;
  min-height: 2.9rem;
  width: 100%;
  align-items: center;
  gap: 0.75rem;
  border: 0;
  border-radius: var(--radius-sm);
  padding: 0.7rem 0.8rem;
  color: rgb(255 255 255 / 56%);
  background: transparent;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 650;
  cursor: pointer;
  transition:
    color 180ms ease,
    background-color 180ms ease;
}

.sidebar-logout__button:hover:not(:disabled) {
  color: #fff;
  background: rgb(255 255 255 / 10%);
}

.sidebar-logout__button:disabled {
  cursor: wait;
  opacity: 0.72;
}

.sidebar-logout__error {
  margin: 0;
  color: #ffb4ab;
  font-size: 0.75rem;
  line-height: 1.4;
}
```

- [ ] **Step 4: 挂载到 StudentShell**

在 `student-shell.tsx`：

1. `import { LogoutButton } from "./logout-button";`
2. 将现有 `sidebar-tip` 包进 footer，并在 tip 后加 `LogoutButton`：

```tsx
<div className="sidebar-footer">
  <div className="sidebar-tip">
    <Sparkles aria-hidden="true" />
    <p>每一次认真作答，都在为目标积蓄能量。</p>
  </div>
  <LogoutButton />
</div>
```

- [ ] **Step 5: 挂载到 AdminShell（仅桌面侧栏）**

在 `admin-shell.tsx`：

1. `import { LogoutButton } from "./logout-button";`
2. 在桌面 `<aside className="app-sidebar">` 内、`AdminNavigation` **之后**添加：

```tsx
<div className="sidebar-footer">
  <LogoutButton />
</div>
```

3. **不要**在 `admin-drawer` 内添加 `LogoutButton`。

- [ ] **Step 6: 运行相关测试确认通过**

Run:

```bash
cd apps/web && pnpm test -- tests/logout-button.test.tsx tests/navigation.test.tsx
```

Expected: PASS

- [ ] **Step 7: 暂存说明（勿自动 commit）**

```bash
git add \
  apps/web/app/globals.css \
  apps/web/components/layout/student-shell.tsx \
  apps/web/components/layout/admin-shell.tsx \
  apps/web/tests/navigation.test.tsx
# 等待用户要求再 commit
```

---

## Spec Coverage Checklist

| Spec 要求 | Task |
|-----------|------|
| 共用 LogoutButton + browserApiClient.logout | Task 1 |
| 成功 replace `/login`；进行中禁用；失败 alert | Task 1 |
| 学员侧栏 tip 下方；管理员桌面侧栏底部 | Task 2 |
| 窄屏 / 抽屉无退出 | Task 2 导航 |
| CSS footer / logout 样式 | Task 2 |
| 单元测试覆盖 | Task 1 + Task 2 |

## Self-Review

- 无 TBD /「类似 Task N」占位。
- `LogoutApi` / `logout()` / `replace("/login")` 命名在两 Task 一致。
- 非目标（无 Playwright、无 Server Action、无确认框）未引入任务。

# Web 会话 Access Token 自动续期 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Access Cookie 过期后，在 Refresh Token 仍有效时自动续期，避免 Web 约 15 分钟被踢回登录页；覆盖页面导航与浏览器 API。

**Architecture:** `packages/api-client` 对 Cookie 模式 `authenticated` 请求在 401 后 single-flight 调用 refresh 并重试一次；`apps/web/proxy.ts` 在受保护路径缺少 `pq_access` 但有 `pq_refresh` 时主动 refresh，并把新 Cookie 写回浏览器与本次下游请求。

**Tech Stack:** Next.js 16 Proxy、`@point-quest/api-client`、Vitest、Jest、fetch Cookie/CSRF。

## Global Constraints

- Access 仍为 15 分钟；Refresh 仍为 30 天；不靠拉长 Access 掩盖问题。
- Android Bearer / body refresh 路径不启用自动续期。
- Refresh 失败不得循环重试；最终仍导向登录。
- Proxy 不依赖 `server-only` 模块；新增功能必须带单元测试且通过。
- 未获用户明确要求时不要 `git commit`（计划中的 Commit 步骤改为「暂存说明」，由用户决定是否提交）。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `packages/api-client/src/client.ts` | Cookie `authenticated` 401 → refresh → 重试；single-flight |
| `packages/api-client/src/client.test.ts` | 覆盖自动续期、并发、Bearer 不续期 |
| `apps/web/lib/auth/session-cookie-refresh.ts` | 纯函数：调上游 refresh、解析 Set-Cookie、合并 Cookie 头 |
| `apps/web/tests/session-cookie-refresh.test.tsx` | 辅助函数单测 |
| `apps/web/proxy.ts` | 受保护路径触发续期并改写请求/响应 Cookie |
| `apps/web/tests/session-proxy.test.tsx` | Proxy 行为单测 |
| `apps/web/lib/api/server-base-url.ts` | 可选：把 URL 规范化抽到无 `server-only` 的共享纯函数供 proxy 使用 |

---

### Task 1: API Client Cookie 401 自动 refresh 重试

**Files:**
- Modify: `packages/api-client/src/client.ts`
- Test: `packages/api-client/src/client.test.ts`

**Interfaces:**
- Consumes: 现有 `request`、`authMode`、`refreshWeb`/`authRefresh`、`getCsrfToken`
- Produces: `createApiClient` 对 Cookie 模式 `authenticated` 在 401 后自动续期并重试一次；对外方法签名不变

- [ ] **Step 1: 写失败测试（先 RED）**

在 `packages/api-client/src/client.test.ts` 增加：

```ts
it("Cookie authenticated 遇 401 时自动 refresh 并重试原请求", async () => {
  const user = {
    id: "user-1",
    username: "learner_01",
    role: "STUDENT" as const,
    pointsBalance: 10,
  };
  const fetchSpy = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: "AUTH_TOKEN_EXPIRED",
          message: "expired",
          requestId: "r1",
          details: {},
        }),
        { status: 401 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ user }), { status: 201 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ user }), { status: 200 }),
    );

  const client = createApiClient({
    baseUrl: "http://localhost:3001/api/v1",
    fetch: fetchSpy,
    getCsrfToken: () => "csrf-value",
  });

  const result = await client.getCurrentUser();

  expect(result).toEqual({ user });
  expect(fetchSpy).toHaveBeenCalledTimes(3);
  expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/auth/me");
  expect(String(fetchSpy.mock.calls[1]?.[0])).toContain("/auth/refresh");
  expect(String(fetchSpy.mock.calls[2]?.[0])).toContain("/auth/me");
  expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({
    method: "POST",
    credentials: "include",
    headers: expect.objectContaining({ "X-CSRF-Token": "csrf-value" }),
  });
});

it("并发 Cookie 401 只触发一次 refresh", async () => {
  const user = {
    id: "user-1",
    username: "learner_01",
    role: "STUDENT" as const,
    pointsBalance: 10,
  };
  let refreshCalls = 0;
  const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/auth/refresh")) {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return new Response(JSON.stringify({ user }), { status: 201 });
    }
    if (refreshCalls === 0) {
      return new Response(
        JSON.stringify({
          code: "AUTH_TOKEN_EXPIRED",
          message: "expired",
          requestId: "r1",
          details: {},
        }),
        { status: 401 },
      );
    }
    return new Response(JSON.stringify({ user }), { status: 200 });
  });

  const client = createApiClient({
    baseUrl: "http://localhost:3001/api/v1",
    fetch: fetchSpy,
    getCsrfToken: () => "csrf-value",
  });

  const [a, b] = await Promise.all([
    client.getCurrentUser(),
    client.getPointBalance(),
  ]);

  expect(a).toEqual({ user });
  expect(b).toEqual({ user });
  expect(refreshCalls).toBe(1);
});

it("Bearer authenticated 遇 401 不自动 refresh", async () => {
  const fetchSpy = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        code: "AUTH_TOKEN_EXPIRED",
        message: "expired",
        requestId: "r1",
        details: {},
      }),
      { status: 401 },
    ),
  );
  const client = createApiClient({
    baseUrl: "http://localhost:3001/api/v1",
    fetch: fetchSpy,
    getAccessToken: () => "access-token",
    getCsrfToken: () => "csrf-value",
  });

  await expect(client.getCurrentUser()).rejects.toMatchObject({ status: 401 });
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/auth/me");
});

it("refresh 失败时不再重试原请求且错误上抛", async () => {
  const fetchSpy = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: "AUTH_TOKEN_EXPIRED",
          message: "expired",
          requestId: "r1",
          details: {},
        }),
        { status: 401 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: "AUTH_INVALID_REFRESH_TOKEN",
          message: "invalid",
          requestId: "r2",
          details: {},
        }),
        { status: 401 },
      ),
    );

  const client = createApiClient({
    baseUrl: "http://localhost:3001/api/v1",
    fetch: fetchSpy,
    getCsrfToken: () => "csrf-value",
  });

  await expect(client.getCurrentUser()).rejects.toBeInstanceOf(ApiClientError);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @point-quest/api-client test`

Expected: 新用例 FAIL（当前无自动 refresh）

- [ ] **Step 3: 实现最小改动**

在 `createApiClient` 内重构 `request`：

1. 抽出「组装 headers/credentials/body 后执行一次 fetch 并解析」的内部逻辑，或在抛错前插入续期分支。
2. 维护 `let cookieRefreshInFlight: Promise<void> | null = null`。
3. 当且仅当：
   - `authMode === "authenticated"`
   - 未设置 `Authorization`（Cookie 模式）
   - `operationId !== "authRefresh"`
   - 首次响应 `status === 401`
   则：
   - 通过 single-flight 调用内部 `request("authRefresh", { authMode: "refresh-cookie", body: {} })`（注意：refresh 自身 401 不得再次进入该分支）
   - refresh 成功后用**相同** method/url/headers/body/credentials 再 fetch 一次
   - 若 refresh 抛错，将 refresh 错误上抛（不要用已消费 body 的旧 Response 再抛混乱错误；实现上可在判定 401 后先不 throw，等 refresh 失败再 throw 原始或 refresh 的 `ApiClientError`）
4. 重试仍然 401 → 按现有逻辑 throw，不再 refresh。

推荐结构（示意）：

```ts
export function createApiClient(options: ApiClientOptions) {
  const baseUrl = withoutTrailingSlash(options.baseUrl);
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  let cookieRefreshInFlight: Promise<void> | null = null;

  async function refreshCookieSession(): Promise<void> {
    if (!cookieRefreshInFlight) {
      cookieRefreshInFlight = request("authRefresh", {
        authMode: "refresh-cookie",
        body: {},
      })
        .then(() => undefined)
        .finally(() => {
          cookieRefreshInFlight = null;
        });
    }
    await cookieRefreshInFlight;
  }

  async function request<Name extends OperationName>(
    operationId: Name,
    requestOptions: TypedRequestOptions<Name>,
  ): Promise<SuccessBodyOf<Name>> {
    // ... build url/headers/credentials/body 同现有逻辑 ...

    const cookieAuthenticated =
      authMode === "authenticated" && credentials === "include";

    const send = async () => {
      try {
        return await fetchImplementation(url, {
          method: binding.method,
          credentials,
          headers,
          body,
        });
      } catch (cause) {
        throw new ApiNetworkError(url, cause);
      }
    };

    let response = await send();

    if (response.status === 401 && cookieAuthenticated) {
      await refreshCookieSession();
      // refresh 后重新读取 CSRF（cookie 可能已变）；若 getCsrfToken 可读到新值则更新 header
      if (needsCsrf) {
        const csrfToken = await options.getCsrfToken?.();
        if (csrfToken) {
          headers["X-CSRF-Token"] = csrfToken;
        } else {
          delete headers["X-CSRF-Token"];
        }
      }
      response = await send();
    }

    // ... 其余 204 / parse / throw ApiClientError 逻辑保持不变 ...
  }

  // return { ... } 不变
}
```

注意：`refreshCookieSession` 调用的 `request("authRefresh", ...)` 的 `authMode` 是 `refresh-cookie`，因此不会满足 `cookieAuthenticated`，不会递归。

并发测试里 `getPointBalance` 成功 body 是 `{ balance: number }`，上面示意写成了 `{ user }`——实现测试时第二请求成功响应应使用合法 balance JSON，例如 `{ balance: 10 }`，断言 `b` 为 `{ balance: 10 }`。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @point-quest/api-client test`

Expected: PASS（含既有 CSRF/Bearer/refresh 用例）

---

### Task 2: Session Cookie 刷新辅助函数

**Files:**
- Create: `apps/web/lib/auth/session-cookie-refresh.ts`
- Create: `apps/web/tests/session-cookie-refresh.test.tsx`
- Modify (可选): `apps/web/lib/api/server-base-url.ts` —— 若抽共享 URL 函数，保证 proxy 可 import 无 `server-only` 版本

**Interfaces:**
- Consumes: `API_SERVER_BASE_URL` / 默认 `http://localhost:3000/api/v1`；上游 `Set-Cookie`
- Produces:
  - `resolveApiServerBaseUrl(env?: NodeJS.ProcessEnv): string`
  - `parseSetCookieHeaders(headers: Headers): Array<{ name: string; value: string; path?: string; maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: "lax" | "strict" | "none" }>`
  - `mergeRequestCookieHeader(existing: string | undefined, updates: Record<string, string>): string`
  - `refreshWebSessionCookies(input: { apiBaseUrl: string; cookieHeader: string; csrfToken?: string; fetch?: typeof fetch }): Promise<{ ok: true; setCookies: ReturnType<typeof parseSetCookieHeaders>; cookieHeader: string } | { ok: false }>`

- [ ] **Step 1: 写失败测试**

```tsx
import {
  mergeRequestCookieHeader,
  parseSetCookieHeaders,
  refreshWebSessionCookies,
  resolveApiServerBaseUrl,
} from "@/lib/auth/session-cookie-refresh";

describe("session-cookie-refresh", () => {
  it("resolveApiServerBaseUrl 去掉尾部斜杠并提供默认值", () => {
    expect(resolveApiServerBaseUrl({})).toBe("http://localhost:3000/api/v1");
    expect(
      resolveApiServerBaseUrl({
        API_SERVER_BASE_URL: "http://api.internal:4100/api/v1/",
      }),
    ).toBe("http://api.internal:4100/api/v1");
  });

  it("parseSetCookieHeaders 解析多枚 Set-Cookie", () => {
    const headers = new Headers();
    headers.append(
      "set-cookie",
      "pq_access=access-1; Path=/; HttpOnly; SameSite=Lax; Max-Age=900",
    );
    headers.append(
      "set-cookie",
      "pq_refresh=refresh-1; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000",
    );
    headers.append(
      "set-cookie",
      "pq_csrf=csrf-1; Path=/; SameSite=Lax; Max-Age=2592000",
    );

    const parsed = parseSetCookieHeaders(headers);
    expect(parsed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "pq_access",
          value: "access-1",
          httpOnly: true,
          path: "/",
          maxAge: 900,
          sameSite: "lax",
        }),
        expect.objectContaining({ name: "pq_refresh", value: "refresh-1" }),
        expect.objectContaining({
          name: "pq_csrf",
          value: "csrf-1",
          httpOnly: false,
        }),
      ]),
    );
  });

  it("mergeRequestCookieHeader 覆盖同名 Cookie 并保留其余", () => {
    expect(
      mergeRequestCookieHeader("pq_access=old; pq_refresh=keep", {
        pq_access: "new",
        pq_csrf: "csrf",
      }),
    ).toBe("pq_access=new; pq_refresh=keep; pq_csrf=csrf");
  });

  it("refreshWebSessionCookies 成功时返回合并后的 Cookie 头", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: {
        getSetCookie: () => [
          "pq_access=access-new; Path=/; HttpOnly; SameSite=Lax; Max-Age=900",
          "pq_refresh=refresh-new; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000",
          "pq_csrf=csrf-new; Path=/; SameSite=Lax; Max-Age=2592000",
        ],
      },
    });

    const result = await refreshWebSessionCookies({
      apiBaseUrl: "http://api.internal:4100/api/v1",
      cookieHeader: "pq_refresh=refresh-old; pq_csrf=csrf-old",
      csrfToken: "csrf-old",
      fetch: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.internal:4100/api/v1/auth/refresh",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Cookie: "pq_refresh=refresh-old; pq_csrf=csrf-old",
          "X-CSRF-Token": "csrf-old",
          "Content-Type": "application/json",
        }),
        body: "{}",
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cookieHeader).toContain("pq_access=access-new");
      expect(result.cookieHeader).toContain("pq_refresh=refresh-new");
      expect(result.cookieHeader).toContain("pq_csrf=csrf-new");
    }
  });

  it("refreshWebSessionCookies 失败返回 ok:false", async () => {
    const result = await refreshWebSessionCookies({
      apiBaseUrl: "http://api.internal:4100/api/v1",
      cookieHeader: "pq_refresh=x; pq_csrf=y",
      csrfToken: "y",
      fetch: jest.fn().mockResolvedValue({ ok: false, status: 401, headers: { getSetCookie: () => [] } }),
    });
    expect(result).toEqual({ ok: false });
  });
});
```

若 Jest 环境的 `Headers` 无 `getSetCookie`，测试用手工对象或在 `parseSetCookieHeaders` 内同时支持 `getSetCookie?.()` 与单条 `get("set-cookie")`（与 `apps/web/app/api/v1/[...path]/route.ts` 一致）。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @point-quest/web test -- session-cookie-refresh`

Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `session-cookie-refresh.ts`**

```ts
export type ParsedSetCookie = {
  name: string;
  value: string;
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
};

export function resolveApiServerBaseUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const configured = env.API_SERVER_BASE_URL?.trim();
  return (configured || "http://localhost:3000/api/v1").replace(/\/+$/, "");
}

export function parseSetCookieHeaders(headers: Headers): ParsedSetCookie[] {
  const headersWithSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const raw =
    headersWithSetCookie.getSetCookie?.() ??
    (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);

  return raw.filter(Boolean).map((line) => {
    const parts = line.split(";").map((part) => part.trim());
    const [nameValue, ...attributes] = parts;
    const eq = nameValue.indexOf("=");
    const name = eq === -1 ? nameValue : nameValue.slice(0, eq);
    const value = eq === -1 ? "" : nameValue.slice(eq + 1);
    const parsed: ParsedSetCookie = { name, value };
    for (const attribute of attributes) {
      const [key, rawValue] = attribute.split("=");
      const normalized = key.trim().toLowerCase();
      if (normalized === "path") parsed.path = rawValue;
      if (normalized === "max-age") parsed.maxAge = Number(rawValue);
      if (normalized === "httponly") parsed.httpOnly = true;
      if (normalized === "secure") parsed.secure = true;
      if (normalized === "samesite") {
        const site = rawValue?.trim().toLowerCase();
        if (site === "lax" || site === "strict" || site === "none") {
          parsed.sameSite = site;
        }
      }
    }
    return parsed;
  });
}

export function mergeRequestCookieHeader(
  existing: string | undefined,
  updates: Record<string, string>,
): string {
  const map = new Map<string, string>();
  for (const pair of (existing ?? "").split(";")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    map.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  for (const [name, value] of Object.entries(updates)) {
    map.set(name, value);
  }
  return [...map.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

export async function refreshWebSessionCookies(input: {
  apiBaseUrl: string;
  cookieHeader: string;
  csrfToken?: string;
  fetch?: typeof fetch;
}): Promise<
  | { ok: true; setCookies: ParsedSetCookie[]; cookieHeader: string }
  | { ok: false }
> {
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Cookie: input.cookieHeader,
  };
  if (input.csrfToken) {
    headers["X-CSRF-Token"] = input.csrfToken;
  }

  let response: Response;
  try {
    response = await fetchImpl(`${input.apiBaseUrl.replace(/\/+$/, "")}/auth/refresh`, {
      method: "POST",
      headers,
      body: "{}",
      cache: "no-store",
    });
  } catch {
    return { ok: false };
  }

  if (!response.ok) {
    return { ok: false };
  }

  const setCookies = parseSetCookieHeaders(response.headers);
  const updates: Record<string, string> = {};
  for (const cookie of setCookies) {
    if (
      cookie.name === "pq_access" ||
      cookie.name === "pq_refresh" ||
      cookie.name === "pq_csrf"
    ) {
      updates[cookie.name] = cookie.value;
    }
  }
  return {
    ok: true,
    setCookies,
    cookieHeader: mergeRequestCookieHeader(input.cookieHeader, updates),
  };
}
```

若希望 `server-base-url.ts` DRY：让它 `import { resolveApiServerBaseUrl } from "../auth/session-cookie-refresh"` 或反过来把 `resolveApiServerBaseUrl` 放在无 `server-only` 的 `lib/api/api-base-url.ts`，`server-base-url.ts` 仅 re-export。任选其一，避免 proxy import `server-only`。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @point-quest/web test -- session-cookie-refresh`

Expected: PASS

---

### Task 3: Proxy 接入主动续期

**Files:**
- Modify: `apps/web/proxy.ts`
- Create: `apps/web/tests/session-proxy.test.tsx`

**Interfaces:**
- Consumes: `refreshWebSessionCookies`、`resolveApiServerBaseUrl`、`ParsedSetCookie`
- Produces: 受保护路径在「有 refresh、无 access」时续期；写响应 Cookie + 改写请求 Cookie

- [ ] **Step 1: 写失败测试**

将 `proxy` 保持可单测（已是命名导出）。在 `session-proxy.test.tsx`：

```tsx
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

const originalFetch = globalThis.fetch;

describe("session proxy refresh", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("有 pq_refresh 无 pq_access 时调用 refresh 并带上新 Cookie", async () => {
    process.env.API_SERVER_BASE_URL = "http://api.internal:4100/api/v1";
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: {
        getSetCookie: () => [
          "pq_access=access-new; Path=/; HttpOnly; SameSite=Lax; Max-Age=900",
          "pq_refresh=refresh-new; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000",
          "pq_csrf=csrf-new; Path=/; SameSite=Lax; Max-Age=2592000",
        ],
        get: () => null,
      },
    }) as unknown as typeof fetch;

    const request = new NextRequest("http://localhost:3001/learn", {
      headers: {
        cookie: "pq_refresh=refresh-old; pq_csrf=csrf-old",
      },
    });

    const response = await proxy(request);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://api.internal:4100/api/v1/auth/refresh",
      expect.any(Object),
    );
    expect(response.status).toBe(200);
    const setCookie = response.headers.getSetCookie?.() ?? [];
    expect(setCookie.join("\n")).toContain("pq_access=access-new");
    // 下游请求 Cookie：NextResponse.next({ request: { headers } }) 后可通过
    // 检查 request headers 是否被改写——若框架限制难以断言，至少断言响应 Set-Cookie。
  });

  it("已有 pq_access 时不调用 refresh", async () => {
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    const request = new NextRequest("http://localhost:3001/admin", {
      headers: {
        cookie: "pq_access=a; pq_refresh=r; pq_csrf=c",
      },
    });
    await proxy(request);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("无会话 Cookie 时仍重定向登录", async () => {
    const request = new NextRequest("http://localhost:3001/learn");
    const response = await proxy(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });
});
```

若 `proxy` 当前为同步函数，改为 `async function proxy`（Next 允许）。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @point-quest/web test -- session-proxy`

Expected: FAIL（尚未续期）

- [ ] **Step 3: 实现 proxy 续期**

```ts
import { type NextRequest, NextResponse } from "next/server";
import {
  refreshWebSessionCookies,
  resolveApiServerBaseUrl,
  type ParsedSetCookie,
} from "@/lib/auth/session-cookie-refresh";

const protectedPrefixes = ["/learn", "/admin"];

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function applyParsedCookies(
  response: NextResponse,
  cookies: ParsedSetCookie[],
) {
  for (const cookie of cookies) {
    if (
      cookie.name !== "pq_access" &&
      cookie.name !== "pq_refresh" &&
      cookie.name !== "pq_csrf"
    ) {
      continue;
    }
    response.cookies.set({
      name: cookie.name,
      value: cookie.value,
      path: cookie.path ?? "/",
      maxAge: cookie.maxAge,
      httpOnly: cookie.httpOnly ?? false,
      secure: cookie.secure ?? false,
      sameSite: cookie.sameSite ?? "lax",
    });
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = isProtectedPath(pathname);
  const access = request.cookies.get("pq_access")?.value;
  const refresh = request.cookies.get("pq_refresh")?.value;
  const csrf = request.cookies.get("pq_csrf")?.value;

  if (isProtected && !access && !refresh) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isProtected && !access && refresh) {
    const refreshed = await refreshWebSessionCookies({
      apiBaseUrl: resolveApiServerBaseUrl(),
      cookieHeader: request.headers.get("cookie") ?? "",
      csrfToken: csrf,
    });

    if (refreshed.ok) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("cookie", refreshed.cookieHeader);
      const response = NextResponse.next({
        request: { headers: requestHeaders },
      });
      applyParsedCookies(response, refreshed.setCookies);
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/register", "/learn/:path*", "/admin/:path*"],
};
```

说明：matcher 仍包含 `/login` `/register`（与现文件一致）；这两路径不会进入 refresh 分支。

- [ ] **Step 4: 跑 Web 相关测试**

Run:

```bash
pnpm --filter @point-quest/web test -- session-cookie-refresh session-proxy api-clients
```

Expected: PASS

若 `NextRequest` / `getSetCookie` 在 Jest 中不便用，可改为只单测 `refreshWebSessionCookies` + 把 proxy 分支抽成 `maybeRefreshProtectedSession(request): Promise<NextResponse | null>` 纯逻辑函数并测它；`proxy.ts` 变薄包装。以能稳定 RED/GREEN 为准。

---

### Task 4: 回归与文档对齐

**Files:**
- Modify (仅当存在过时表述): `docs/api/android-integration.md` 不改 Android；若 README/Web 文档写「须手动 refresh」则改正
- Spec 已存在：`docs/superpowers/specs/2026-08-03-web-session-auto-refresh-design.md`

- [ ] **Step 1: 跑全量相关包测试**

```bash
pnpm --filter @point-quest/api-client test
pnpm --filter @point-quest/web test
```

Expected: PASS

- [ ] **Step 2: 手动验收清单（实现者勾选）**

1. 登录 Web → 等待或手工删除 `pq_access` Cookie → 访问 `/learn` 或 `/admin` → 应仍停留在已登录页，且浏览器重新出现 `pq_access`。
2. 删除 `pq_access` 后在页面触发一次需登录的浏览器 API → 应成功而非强制登出。
3. 删除 `pq_refresh` 与 `pq_access` → 应进入登录页。

- [ ] **Step 3: 不自动 commit**；向用户汇报变更文件列表，询问是否提交。

---

## Spec Coverage Self-Review

| Spec 要求 | Task |
|-----------|------|
| Proxy：有 refresh 无 access 时 refresh | Task 3 |
| Proxy：写回浏览器 Cookie + 改写请求 Cookie | Task 3 |
| Proxy：已有 access 不刷新 | Task 3 |
| Proxy：无 Cookie redirect login | Task 3 |
| Proxy：refresh 失败不写坏 Cookie | Task 2/3（`ok: false` 时 `NextResponse.next()`） |
| API client Cookie 401 → refresh → retry | Task 1 |
| Single-flight | Task 1 |
| Bearer 不自动 refresh | Task 1 |
| Refresh 失败上抛 | Task 1 |
| 不改 Android 协议 | Task 1 排除 Bearer |
| 单元测试 | Task 1–3 |
| RSC 不 `cookies().set` | 由 Proxy 负责，无 Task 破坏此约束 |

## Placeholder Scan

无 TBD/TODO；测试与实现代码已给出可粘贴骨架；并发用例的 balance 响应在 Task 1 Step 3 已注明修正为 `{ balance: 10 }`。

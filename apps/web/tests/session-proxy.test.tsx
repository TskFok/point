/** @jest-environment node */

import { NextRequest } from "next/server";

import { proxy } from "../proxy";

const originalFetch = globalThis.fetch;
const originalApiServerBaseUrl = process.env.API_SERVER_BASE_URL;

describe("session proxy refresh", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiServerBaseUrl === undefined) {
      delete process.env.API_SERVER_BASE_URL;
    } else {
      process.env.API_SERVER_BASE_URL = originalApiServerBaseUrl;
    }
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

const mockCookieStore = {
  get: jest.fn(),
  toString: jest.fn(),
};

jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => mockCookieStore),
}));

import { browserApiClient } from "@/lib/api/browser-client";
import { createServerApiClient } from "@/lib/api/server-client";

const mockFetch: jest.MockedFunction<typeof fetch> = jest.fn();

class TestHeaders {
  private readonly values = new Map<string, string>();

  constructor(init?: HeadersInit) {
    if (!init) return;

    if (Array.isArray(init)) {
      for (const [name, value] of init) this.set(name, value);
      return;
    }

    if (init instanceof TestHeaders) {
      for (const [name, value] of init.values) this.set(name, value);
      return;
    }

    for (const [name, value] of Object.entries(init)) {
      this.set(name, String(value));
    }
  }

  get(name: string) {
    return this.values.get(name.toLowerCase()) ?? null;
  }

  set(name: string, value: string) {
    this.values.set(name.toLowerCase(), value);
  }
}

function jsonResponse(body: unknown, status = 200) {
  const responseText = JSON.stringify(body);
  return {
    headers: { get: () => null },
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: async () => responseText,
  } as unknown as Response;
}

describe("Web API 客户端", () => {
  const originalApiServerBaseUrl = process.env.API_SERVER_BASE_URL;

  beforeAll(() => {
    Object.defineProperty(globalThis, "Headers", {
      configurable: true,
      value: TestHeaders,
      writable: true,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: mockFetch,
      writable: true,
    });
    document.cookie = "pq_csrf=; Max-Age=0; path=/";
  });

  afterEach(() => {
    if (originalApiServerBaseUrl === undefined) {
      delete process.env.API_SERVER_BASE_URL;
    } else {
      process.env.API_SERVER_BASE_URL = originalApiServerBaseUrl;
    }
  });

  it("浏览器请求使用 Web 同源 /api/v1 并始终携带 Cookie", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          user: {
            id: "user-1",
            pointsBalance: 10,
            role: "STUDENT",
            username: "learner_01",
          },
        },
        201,
      ),
    );

    await browserApiClient.loginWeb({
      password: "password123",
      username: "learner_01",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
  });

  it("浏览器 Cookie 变更请求读取并发送 CSRF Token", async () => {
    document.cookie = "pq_csrf=csrf%20token; path=/";
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

    await browserApiClient.logout();

    const init = mockFetch.mock.calls[0]?.[1];
    expect(new TestHeaders(init?.headers).get("X-CSRF-Token")).toBe(
      "csrf token",
    );
    expect(init?.credentials).toBe("include");
  });

  it("服务端客户端精确转发当前请求 Cookie", async () => {
    process.env.API_SERVER_BASE_URL = "http://api.internal:4100/api/v1/";
    mockCookieStore.toString.mockReturnValue(
      "pq_access=access-value; pq_refresh=refresh-value",
    );
    mockCookieStore.get.mockReturnValue(undefined);
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        user: {
          id: "admin-1",
          pointsBalance: 0,
          role: "ADMIN",
          username: "admin",
        },
      }),
    );

    const serverClient = await createServerApiClient();
    await serverClient.getCurrentUser();

    const init = mockFetch.mock.calls[0]?.[1];
    expect(new TestHeaders(init?.headers).get("Cookie")).toBe(
      "pq_access=access-value; pq_refresh=refresh-value",
    );
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      "http://api.internal:4100/api/v1/auth/me",
    );
  });
});

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
        get: () => null,
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
      fetch: jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: { getSetCookie: () => [], get: () => null },
      }),
    });
    expect(result).toEqual({ ok: false });
  });
});

/** @jest-environment node */

import {
  DELETE,
  GET,
  HEAD,
  OPTIONS,
  PATCH,
  POST,
  PUT,
} from "@/app/api/v1/[...path]/route";

jest.mock("server-only", () => ({}), { virtual: true });

type RouteHandler = (
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) => Promise<Response>;

type HeadersWithSetCookie = Headers & {
  getSetCookie?: () => string[];
};

const originalFetch = globalThis.fetch;
const originalApiServerBaseUrl = process.env.API_SERVER_BASE_URL;
const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

function routeContext(...path: string[]) {
  return {
    params: Promise.resolve({ path }),
  };
}

describe("网页 API 运行时代理", () => {
  beforeAll(() => {
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    if (originalApiServerBaseUrl === undefined) {
      delete process.env.API_SERVER_BASE_URL;
    } else {
      process.env.API_SERVER_BASE_URL = originalApiServerBaseUrl;
    }
  });

  beforeEach(() => {
    fetchMock.mockReset();
    delete process.env.API_SERVER_BASE_URL;
  });

  afterEach(() => {
    delete process.env.API_SERVER_BASE_URL;
  });

  it("每次请求都读取最新的 API_SERVER_BASE_URL，并安全保留查询参数", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    process.env.API_SERVER_BASE_URL = "http://api-one:3000/api/v1/";
    await GET(
      new Request("http://web.local/api/v1/questions/random?limit=1&tag=a%20b"),
      routeContext("questions", "random"),
    );

    process.env.API_SERVER_BASE_URL = "https://api-two.internal/api/v1";
    await GET(
      new Request("http://web.local/api/v1/questions/random?limit=2"),
      routeContext("questions", "random"),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://api-one:3000/api/v1/questions/random?limit=1&tag=a%20b",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api-two.internal/api/v1/questions/random?limit=2",
      expect.any(Object),
    );
  });

  it("转发 Cookie、CSRF、请求体，并清理不应透传的请求头", async () => {
    const upstreamHeaders = new Headers({
      connection: "close",
      "content-encoding": "gzip",
      "content-length": "999",
      "content-type": "application/json; charset=utf-8",
    });
    upstreamHeaders.append(
      "set-cookie",
      "pq_access=access-token; Path=/; HttpOnly; SameSite=Lax",
    );
    upstreamHeaders.append(
      "set-cookie",
      "pq_refresh=refresh-token; Path=/; HttpOnly; SameSite=Lax",
    );
    let forwardedBody: BodyInit | null | undefined;
    let forwardedBodyText = "";
    fetchMock.mockImplementation(async (_input, init) => {
      forwardedBody = init?.body;
      forwardedBodyText = init?.body
        ? await new Response(init.body).text()
        : "";
      return new Response(JSON.stringify({ id: "order-1" }), {
        status: 201,
        headers: upstreamHeaders,
      });
    });

    const browserRequest = new Request(
      "http://web.local/api/v1/orders?source=mall",
      {
        method: "POST",
        headers: {
          "accept-encoding": "gzip, br",
          connection: "keep-alive",
          "content-length": "19",
          "content-type": "application/json",
          cookie: "pq_access=browser-token; pq_csrf=csrf-cookie",
          host: "web.local",
          "x-csrf-token": "csrf-header",
        },
        body: JSON.stringify({ productId: "p1" }),
      },
    );
    const browserBody = browserRequest.body;
    const response = await POST(browserRequest, routeContext("orders"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(url).toBe("http://localhost:3000/api/v1/orders?source=mall");
    expect(init?.method).toBe("POST");
    expect((init as RequestInit & { duplex?: string }).duplex).toBe("half");
    expect(headers.get("cookie")).toBe(
      "pq_access=browser-token; pq_csrf=csrf-cookie",
    );
    expect(headers.get("x-csrf-token")).toBe("csrf-header");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("accept-encoding")).toBe("identity");
    expect(headers.get("connection")).toBeNull();
    expect(headers.get("content-length")).toBeNull();
    expect(headers.get("host")).toBeNull();
    expect(forwardedBody).toBe(browserBody);
    expect(forwardedBodyText).toBe(JSON.stringify({ productId: "p1" }));

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("connection")).toBeNull();
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
    expect(
      (response.headers as HeadersWithSetCookie).getSetCookie?.(),
    ).toEqual([
      "pq_access=access-token; Path=/; HttpOnly; SameSite=Lax",
      "pq_refresh=refresh-token; Path=/; HttpOnly; SameSite=Lax",
    ]);
    await expect(response.json()).resolves.toEqual({ id: "order-1" });
  });

  it.each<[string, RouteHandler]>([
    ["GET", GET],
    ["HEAD", HEAD],
    ["POST", POST],
    ["PUT", PUT],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
    ["OPTIONS", OPTIONS],
  ])("转发 %s 请求", async (method, handler) => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const response = await handler(
      new Request("http://web.local/api/v1/health", { method }),
      routeContext("health"),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/health",
      expect.objectContaining({ method }),
    );
    expect(response.status).toBe(204);
  });

  it("上游不可用时返回不泄露内部信息的 502", async () => {
    process.env.API_SERVER_BASE_URL =
      "http://secret-api.internal:3000/api/v1";
    fetchMock.mockRejectedValue(
      new Error("connect ECONNREFUSED secret-api.internal"),
    );

    const response = await GET(
      new Request("http://web.local/api/v1/products"),
      routeContext("products"),
    );

    expect(response.status).toBe(502);
    const bodyText = await response.text();
    expect(JSON.parse(bodyText)).toEqual({
      code: "UPSTREAM_UNAVAILABLE",
      details: {},
      message: "服务暂时不可用，请稍后重试",
      requestId: "",
    });
    expect(bodyText).not.toContain("secret-api");
    expect(bodyText).not.toContain("ECONNREFUSED");
  });
});

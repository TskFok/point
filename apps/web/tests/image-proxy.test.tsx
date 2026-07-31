/** @jest-environment node */

import { GET, HEAD } from "@/app/uploads/[...path]/route";

jest.mock("server-only", () => ({}), { virtual: true });

const originalFetch = globalThis.fetch;
const originalApiServerBaseUrl = process.env.API_SERVER_BASE_URL;
const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
const imageUuid = "550e8400-e29b-41d4-a716-446655440000";
const imageFiles = {
  jpg: `${imageUuid}.jpg`,
  png: `${imageUuid}.png`,
  webp: `${imageUuid}.webp`,
};

function routeContext(...path: string[]) {
  return { params: Promise.resolve({ path }) };
}

describe("商品图片同源代理", () => {
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
    process.env.API_SERVER_BASE_URL = "https://api.internal/api/v1";
  });

  it("基于运行时 API origin 构造受限路径并只转发图片读取头", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: {
          "accept-ranges": "bytes",
          "cache-control": "public, max-age=3600",
          "content-length": "4",
          "content-range": "bytes 0-3/4",
          "content-type": "image/png",
          etag: '"image-etag"',
          "last-modified": "Thu, 30 Jul 2026 08:00:00 GMT",
        },
        status: 206,
      }),
    );

    const response = await GET(
      new Request(
        `https://web.example/uploads/products/${imageFiles.png}`,
        {
        headers: {
          authorization: "Bearer do-not-forward",
          cookie: "pq_access=do-not-forward",
          "if-none-match": '"browser-etag"',
          range: "bytes=0-3",
        },
        },
      ),
      routeContext("products", imageFiles.png),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.internal/uploads/products/${imageFiles.png}`,
      expect.objectContaining({ method: "GET", redirect: "manual" }),
    );
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("range")).toBe("bytes=0-3");
    expect(headers.get("if-none-match")).toBe('"browser-etag"');
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("authorization")).toBeNull();
    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("etag")).toBe('"image-etag"');
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=3600",
    );
    expect(response.headers.get("content-range")).toBe("bytes 0-3/4");
  });

  it.each([
    ["JPEG", imageFiles.jpg, "image/jpeg"],
    ["PNG", imageFiles.png, "image/png"],
    ["WebP", imageFiles.webp, "image/webp"],
  ])("允许后端契约内的 %s 商品图片", async (_name, filename, mime) => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": mime },
        status: 200,
      }),
    );

    const response = await GET(
      new Request(`https://web.example/uploads/products/${filename}`),
      routeContext("products", filename),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(mime);
  });

  it.each([
    ["上级目录", ["products", "..", "secret.png"]],
    ["编码斜杠", ["products", "nested/name.png"]],
    ["反斜杠", ["products", String.raw`nested\\name.png`]],
    ["非商品目录", ["avatars", imageFiles.png]],
    ["非 UUID 文件名", ["products", "plain-name.png"]],
    ["非 v4 UUID", ["products", "550e8400-e29b-31d4-a716-446655440000.png"]],
    ["非白名单扩展名", ["products", `${imageUuid}.svg`]],
  ])("拒绝%s路径且不访问上游", async (_name, path) => {
    const response = await GET(
      new Request("https://web.example/uploads/unsafe"),
      routeContext(...path),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_IMAGE_PATH",
      message: "图片路径无效",
    });
  });

  it("透传 HEAD、Range 与缓存协商状态且不返回响应体", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        headers: {
          "accept-ranges": "bytes",
          "cache-control": "public, max-age=3600",
          etag: '"image-etag"',
        },
        status: 304,
      }),
    );

    const response = await HEAD(
      new Request(
        `https://web.example/uploads/products/${imageFiles.png}`,
        {
        headers: { "if-modified-since": "Thu, 30 Jul 2026 08:00:00 GMT" },
        method: "HEAD",
        },
      ),
      routeContext("products", imageFiles.png),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.internal/uploads/products/${imageFiles.png}`,
      expect.objectContaining({ method: "HEAD" }),
    );
    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
  });

  it("上游非图片或连接失败时返回不泄露内部地址的安全错误", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>secret</html>", {
        headers: { "content-type": "text/html" },
        status: 200,
      }),
    );

    const wrongType = await GET(
      new Request(
        `https://web.example/uploads/products/${imageFiles.png}`,
      ),
      routeContext("products", imageFiles.png),
    );
    expect(wrongType.status).toBe(502);
    expect(await wrongType.text()).not.toContain("secret");

    fetchMock.mockRejectedValueOnce(
      new Error("connect ECONNREFUSED api.internal"),
    );
    const unavailable = await GET(
      new Request(
        `https://web.example/uploads/products/${imageFiles.png}`,
      ),
      routeContext("products", imageFiles.png),
    );
    expect(unavailable.status).toBe(502);
    const unavailableBody = await unavailable.text();
    expect(unavailableBody).not.toContain("api.internal");
    expect(unavailableBody).not.toContain("ECONNREFUSED");
  });

  it("拒绝后端规范之外可能包含活动内容的图片格式", async () => {
    fetchMock.mockResolvedValue(
      new Response("<svg><script>danger()</script></svg>", {
        headers: { "content-type": "image/svg+xml" },
        status: 200,
      }),
    );

    const response = await GET(
      new Request(
        `https://web.example/uploads/products/${imageFiles.png}`,
      ),
      routeContext("products", imageFiles.png),
    );

    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("<script>");
  });
});

import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  ApiClientError,
  ApiNetworkError,
  ApiProtocolError,
  createApiClient,
} from "./client.js";
import type { components } from "./schema.js";

describe("审查修复", () => {
  it("refreshWeb 和 refreshAndroid 暴露准确且不同的返回类型", () => {
    const client = createApiClient({
      baseUrl: "https://api.example.test/api/v1",
      fetch: vi.fn(),
    });

    expectTypeOf(client.refreshWeb).returns.resolves.toEqualTypeOf<
      components["schemas"]["WebSessionResponseDto"]
    >();
    expectTypeOf(client.refreshAndroid).returns.resolves.toEqualTypeOf<
      components["schemas"]["TokenResponseDto"]
    >();
  });

  it("网络失败包装为保留 cause 的 ApiNetworkError", async () => {
    const cause = new TypeError("network down");
    const client = createApiClient({
      baseUrl: "https://api.example.test/api/v1",
      fetch: vi.fn().mockRejectedValue(cause),
    });

    const error = await client.getHealth().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiNetworkError);
    expect(error).toMatchObject({ cause });
  });

  it("非 JSON 成功响应抛出 ApiProtocolError", async () => {
    const client = createApiClient({
      baseUrl: "https://api.example.test/api/v1",
      fetch: vi
        .fn()
        .mockResolvedValue(new Response("not-json", { status: 200 })),
    });

    await expect(client.getHealth()).rejects.toBeInstanceOf(ApiProtocolError);
  });

  it("非 JSON 错误响应仍抛出带状态和原文的 ApiClientError", async () => {
    const client = createApiClient({
      baseUrl: "https://api.example.test/api/v1",
      fetch: vi.fn().mockResolvedValue(
        new Response("upstream unavailable", {
          status: 502,
          statusText: "Bad Gateway",
        }),
      ),
    });

    const error = await client.getHealth().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      status: 502,
      body: {
        code: "HTTP_ERROR",
        message: "Bad Gateway",
        details: { responseText: "upstream unavailable" },
      },
    });
  });
});

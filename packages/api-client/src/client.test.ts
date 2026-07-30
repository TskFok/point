import { describe, expect, it, vi } from "vitest";
import { ApiClientError, createApiClient } from "./client.js";

describe("createApiClient", () => {
  it("完整暴露当前 33 个版本化 API 操作", () => {
    const client = createApiClient({
      baseUrl: "http://localhost:3001/api/v1",
      fetch: vi.fn(),
    });

    expect(Object.keys(client).sort()).toEqual(
      [
        "answerQuestion",
        "cancelAdminOrder",
        "completeAdminOrder",
        "createAdminProduct",
        "createAdminQuestion",
        "createOrder",
        "getAdminOrder",
        "getAdminPointConfig",
        "getAdminQuestion",
        "getCurrentUser",
        "getHealth",
        "getOrder",
        "getPointBalance",
        "getPracticeSummary",
        "getProduct",
        "getRandomQuestion",
        "issueAndroidToken",
        "listAdminOrders",
        "listAdminProducts",
        "listAdminQuestions",
        "listOrders",
        "listPointLedger",
        "listProducts",
        "listWrongQuestions",
        "loginWeb",
        "logout",
        "refresh",
        "register",
        "retryWrongQuestion",
        "updateAdminPointConfig",
        "updateAdminProduct",
        "updateAdminQuestion",
        "uploadAdminProductImage",
      ].sort(),
    );
  });

  it("Cookie 写请求自动携带 CSRF Header 和订单幂等键", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(orderResponse), { status: 201 }),
      );
    const client = createApiClient({
      baseUrl: "http://localhost:3001/api/v1",
      fetch: fetchSpy,
      getCsrfToken: () => "csrf-value",
    });

    await client.createOrder({
      productId: "product-1",
      idempotencyKey: "order-1",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/orders",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-CSRF-Token": "csrf-value",
          "Idempotency-Key": "order-1",
        }),
      }),
    );
  });

  it("Bearer 写请求不发送 Cookie credentials 或 CSRF，但保留幂等键", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(answerResponse), { status: 201 }),
      );
    const client = createApiClient({
      baseUrl: "http://localhost:3001/api/v1/",
      fetch: fetchSpy,
      getAccessToken: () => "access-token",
      getCsrfToken: () => "must-not-be-used",
    });

    await client.answerQuestion("question-1", {
      selectedOptionId: "option-1",
      idempotencyKey: "answer-1",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/practice/questions/question-1/answer",
      expect.objectContaining({
        method: "POST",
        credentials: "omit",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "Idempotency-Key": "answer-1",
        }),
      }),
    );
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).not.toHaveProperty("X-CSRF-Token");
  });

  it("GET 使用 Cookie credentials，但不附加 CSRF", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ balance: 10 }), { status: 200 }),
      );
    const client = createApiClient({
      baseUrl: "http://localhost:3001/api/v1",
      fetch: fetchSpy,
      getCsrfToken: () => "csrf-value",
    });

    await client.getPointBalance();

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe("include");
    expect(init.headers).not.toHaveProperty("X-CSRF-Token");
  });

  it("Web Refresh 使用 Cookie 与 CSRF，Android Refresh 不使用两者", async () => {
    const fetchSpy = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ user: userResponse }), { status: 201 }),
        ),
      );
    const client = createApiClient({
      baseUrl: "http://localhost:3001/api/v1",
      fetch: fetchSpy,
      getCsrfToken: () => "csrf-value",
    });

    await client.refresh();
    await client.refresh({ refreshToken: "r".repeat(32) });

    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
      headers: expect.objectContaining({ "X-CSRF-Token": "csrf-value" }),
    });
    expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({
      credentials: "omit",
    });
    expect(
      (fetchSpy.mock.calls[1]?.[1] as RequestInit).headers,
    ).not.toHaveProperty("X-CSRF-Token");
  });

  it("文件上传保留浏览器生成的 multipart boundary 并携带 Cookie CSRF", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          key: "products/550e8400-e29b-41d4-a716-446655440000.png",
          url: "/uploads/products/550e8400-e29b-41d4-a716-446655440000.png",
        }),
        { status: 201 },
      ),
    );
    const client = createApiClient({
      baseUrl: "http://localhost:3001/api/v1",
      fetch: fetchSpy,
      getCsrfToken: () => "csrf-value",
    });

    await client.uploadAdminProductImage(
      new Blob(["image"], { type: "image/png" }),
      "product.png",
    );

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toMatchObject({ "X-CSRF-Token": "csrf-value" });
    expect(init.headers).not.toHaveProperty("Content-Type");
  });

  it("204 空响应安全返回 undefined", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = createApiClient({
      baseUrl: "http://localhost:3001/api/v1",
      fetch: fetchSpy,
    });

    await expect(client.logout({})).resolves.toBeUndefined();
  });

  it("非 2xx 抛出保留状态和统一错误体的类型化错误", async () => {
    const errorBody = {
      code: "OUT_OF_STOCK",
      message: "商品库存不足",
      requestId: "request-1",
      details: { stock: 0 },
    };
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(errorBody), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = createApiClient({
      baseUrl: "http://localhost:3001/api/v1",
      fetch: fetchSpy,
    });

    const error = await client
      .createOrder({ productId: "product-1", idempotencyKey: "order-1" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ status: 409, body: errorBody });
  });
});

const orderResponse = {
  id: "order-1",
  orderNo: "PQ-1",
  userId: "user-1",
  productId: "product-1",
  productNameSnapshot: "商品",
  productImageKeySnapshot: "products/example.png",
  pointsCostSnapshot: 10,
  status: "PENDING_PICKUP",
  createdAt: "2026-07-30T00:00:00.000Z",
  completedAt: null,
  cancelledAt: null,
  updatedBy: null,
  balance: 90,
};

const answerResponse = {
  correct: true,
  selectedOptionId: "option-1",
  correctOptionId: "option-1",
  explanation: "解析",
  errorCount: 0,
  pointsAwarded: 10,
  balance: 10,
};

const userResponse = {
  id: "user-1",
  username: "student_01",
  role: "STUDENT" as const,
  pointsBalance: 10,
};

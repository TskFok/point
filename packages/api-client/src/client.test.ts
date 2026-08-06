import { describe, expect, it, vi } from "vitest";
import { ApiClientError, createApiClient } from "./client.js";

describe("createApiClient", () => {
  it("完整暴露当前版本化 API 客户端方法", () => {
    const client = createApiClient({
      baseUrl: "http://localhost:3001/api/v1",
      fetch: vi.fn(),
    });

    expect(Object.keys(client).sort()).toEqual(
      [
        "answerQuestion",
        "cancelAdminOrder",
        "completeAdminOrder",
        "createAdminAiModel",
        "createAdminAiTask",
        "createAdminProduct",
        "createAdminQuestion",
        "createOrder",
        "deleteAdminAiModel",
        "deleteAdminAiTask",
        "deleteAdminProduct",
        "getAdminAiModel",
        "getAdminAiTask",
        "getAdminDashboard",
        "getAdminOrder",
        "getAdminPointConfig",
        "getAdminQuestion",
        "getCurrentUser",
        "getHealth",
        "getOrder",
        "getPointBalance",
        "getPracticeSummary",
        "getPreviewQuestions",
        "getProduct",
        "getRandomQuestion",
        "issueAndroidToken",
        "listAdminAiModels",
        "listAdminAiTaskRuns",
        "listAdminAiTasks",
        "listAdminOrders",
        "listAdminPointConfigHistory",
        "listAdminProducts",
        "listAdminQuestions",
        "listOrders",
        "listPointLedger",
        "listProducts",
        "listWrongQuestions",
        "loginWeb",
        "logout",
        "refreshAndroid",
        "refreshWeb",
        "register",
        "retryWrongQuestion",
        "runAdminAiTask",
        "testAdminAiModel",
        "testAdminAiModelDraft",
        "updateAdminAiModel",
        "updateAdminAiTask",
        "updateAdminPointConfig",
        "updateAdminProduct",
        "updateAdminQuestion",
        "uploadAdminProductImage",
      ].sort(),
    );
  });

  it("管理员概览与倍率历史使用稳定的版本化 GET 路径", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            activeQuestionCount: 12,
            todayAnswerCount: 34,
            pendingOrderCount: 5,
            activeProductCount: 6,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [],
            meta: {
              page: 2,
              pageSize: 10,
              total: 0,
              totalPages: 0,
            },
          }),
          { status: 200 },
        ),
      );
    const client = createApiClient({
      baseUrl: "http://localhost:3001/api/v1",
      fetch: fetchSpy,
    });

    await client.getAdminDashboard();
    await client.listAdminPointConfigHistory({ page: 2, pageSize: 10 });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "http://localhost:3001/api/v1/admin/dashboard",
    );
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      "http://localhost:3001/api/v1/admin/points/config/history?page=2&pageSize=10",
    );
  });

  it("预习抽题使用版本化 GET 路径并携带可选数量参数", async () => {
    const fetchSpy = vi
      .fn()
      .mockImplementation(async () =>
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );
    const client = createApiClient({
      baseUrl: "http://localhost:3001/api/v1",
      fetch: fetchSpy,
    });

    await client.getPreviewQuestions(5);
    await client.getPreviewQuestions();

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "http://localhost:3001/api/v1/practice/preview?count=5",
    );
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      "http://localhost:3001/api/v1/practice/preview",
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
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: userResponse }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "access-token",
            accessTokenExpiresIn: 900,
            refreshToken: "r".repeat(32),
            refreshTokenExpiresAt: "2026-08-30T00:00:00.000Z",
            user: userResponse,
          }),
          { status: 201 },
        ),
      );
    const client = createApiClient({
      baseUrl: "http://localhost:3001/api/v1",
      fetch: fetchSpy,
      getCsrfToken: () => "csrf-value",
    });

    await client.refreshWeb();
    await client.refreshAndroid("r".repeat(32));

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

  it("logout 按真实契约读取 200 JSON 成功响应", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );
    const client = createApiClient({
      baseUrl: "http://localhost:3001/api/v1",
      fetch: fetchSpy,
    });

    await expect(client.logout({})).resolves.toEqual({ success: true });
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

  it("Cookie authenticated 遇 401 时自动 refresh 并重试原请求", async () => {
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
        new Response(JSON.stringify({ user: userResponse }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: userResponse }), { status: 200 }),
      );

    const client = createApiClient({
      baseUrl: "http://localhost:3001/api/v1",
      fetch: fetchSpy,
      getCsrfToken: () => "csrf-value",
    });

    const result = await client.getCurrentUser();

    expect(result).toEqual({ user: userResponse });
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
    let refreshCalls = 0;
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/refresh")) {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new Response(JSON.stringify({ user: userResponse }), {
          status: 201,
        });
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
      if (url.includes("/auth/me")) {
        return new Response(JSON.stringify({ user: userResponse }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ balance: 10 }), { status: 200 });
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

    expect(a).toEqual({ user: userResponse });
    expect(b).toEqual({ balance: 10 });
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

import type { components, operations, paths } from "./schema.js";

type MaybePromise<T> = T | Promise<T>;
type OperationName = keyof operations;
type BodyOf<Name extends OperationName> = operations[Name] extends {
  requestBody: {
    content: { "application/json": infer Body };
  };
}
  ? Body
  : never;
type QueryOf<Name extends OperationName> = NonNullable<
  operations[Name]["parameters"]["query"]
>;
type Idempotent<Body> = Body & { idempotencyKey: string };
type ApiPath = keyof paths;
type ApiErrorBody = components["schemas"]["ApiErrorDto"];
type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type ApiClientOptions = {
  baseUrl: string;
  fetch?: FetchImplementation;
  getAccessToken?: () => MaybePromise<string | null | undefined>;
  getCsrfToken?: () => MaybePromise<string | null | undefined>;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH";
  authenticated?: boolean;
  cookieCredentials?: boolean;
  mutation?: boolean;
  body?: unknown;
  formData?: FormData;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    typeof value.requestId === "string" &&
    isRecord(value.details)
  );
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function relativePath(path: ApiPath): string {
  return path.slice("/api/v1".length);
}

function serializeQuery(query: Record<string, unknown> | undefined): string {
  if (!query) {
    return "";
  }
  const parameters = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    parameters.set(
      name,
      Array.isArray(value) ? value.join(",") : String(value),
    );
  }
  const serialized = parameters.toString();
  return serialized ? `?${serialized}` : "";
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiClientError";
    this.status = status;
    this.body = body;
  }
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = withoutTrailingSlash(options.baseUrl);
  const fetchImplementation = options.fetch ?? globalThis.fetch;

  async function request<Result>(
    path: ApiPath,
    requestOptions: RequestOptions = {},
  ): Promise<Result> {
    const method = requestOptions.method ?? "GET";
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...requestOptions.headers,
    };
    let credentials: RequestCredentials = requestOptions.cookieCredentials
      ? "include"
      : "omit";

    if (requestOptions.authenticated) {
      const accessToken = await options.getAccessToken?.();
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
        credentials = "omit";
      } else {
        credentials = "include";
      }
    }

    const usesCookie =
      credentials === "include" &&
      (requestOptions.authenticated || requestOptions.cookieCredentials);
    if (usesCookie && requestOptions.mutation) {
      const csrfToken = await options.getCsrfToken?.();
      if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
      }
    }

    let body: BodyInit | undefined;
    if (requestOptions.formData) {
      body = requestOptions.formData;
    } else if (requestOptions.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(requestOptions.body);
    }

    const response = await fetchImplementation(
      `${baseUrl}${relativePath(path)}${serializeQuery(requestOptions.query)}`,
      {
        method,
        credentials,
        headers,
        body,
      },
    );
    const responseBody = await parseResponseBody(response);
    if (!response.ok) {
      const errorBody: ApiErrorBody = isApiErrorBody(responseBody)
        ? responseBody
        : {
            code: "HTTP_ERROR",
            message: response.statusText || `HTTP ${response.status}`,
            requestId: response.headers.get("x-request-id") ?? "",
            details: { response: responseBody },
          };
      throw new ApiClientError(response.status, errorBody);
    }
    return responseBody as Result;
  }

  return {
    getHealth: () =>
      request<components["schemas"]["HealthResponseDto"]>("/api/v1/health"),

    register: (input: BodyOf<"authRegister">) =>
      request<components["schemas"]["UserResponseDto"]>(
        "/api/v1/auth/register",
        { method: "POST", body: input },
      ),
    loginWeb: (input: BodyOf<"authLoginWeb">) =>
      request<components["schemas"]["UserResponseDto"]>("/api/v1/auth/login", {
        method: "POST",
        cookieCredentials: true,
        body: input,
      }),
    issueAndroidToken: (input: BodyOf<"authIssueAndroidToken">) =>
      request<components["schemas"]["TokenResponseDto"]>("/api/v1/auth/token", {
        method: "POST",
        body: input,
      }),
    refresh: (input: BodyOf<"authRefresh"> = {}) =>
      request<components["schemas"]["RefreshResponseDto"]>(
        "/api/v1/auth/refresh",
        {
          method: "POST",
          cookieCredentials: !input.refreshToken,
          mutation: !input.refreshToken,
          body: input,
        },
      ),
    logout: (input: BodyOf<"authLogout"> = {}) =>
      request<components["schemas"]["SuccessResponseDto"] | undefined>(
        "/api/v1/auth/logout",
        {
          method: "POST",
          cookieCredentials: !input.refreshToken,
          mutation: !input.refreshToken,
          body: input,
        },
      ),
    getCurrentUser: () =>
      request<components["schemas"]["UserResponseDto"]>("/api/v1/auth/me", {
        authenticated: true,
      }),

    listAdminQuestions: (query: QueryOf<"adminListQuestions"> = {}) =>
      request<components["schemas"]["QuestionListResponseDto"]>(
        "/api/v1/admin/questions",
        { authenticated: true, query },
      ),
    createAdminQuestion: (input: BodyOf<"adminCreateQuestion">) =>
      request<components["schemas"]["AdminQuestionDto"]>(
        "/api/v1/admin/questions",
        {
          method: "POST",
          authenticated: true,
          mutation: true,
          body: input,
        },
      ),
    getAdminQuestion: (questionId: string) =>
      request<components["schemas"]["AdminQuestionDto"]>(
        `/api/v1/admin/questions/${encodeURIComponent(questionId)}` as ApiPath,
        { authenticated: true },
      ),
    updateAdminQuestion: (
      questionId: string,
      input: BodyOf<"adminUpdateQuestion">,
    ) =>
      request<components["schemas"]["AdminQuestionDto"]>(
        `/api/v1/admin/questions/${encodeURIComponent(questionId)}` as ApiPath,
        {
          method: "PATCH",
          authenticated: true,
          mutation: true,
          body: input,
        },
      ),

    getRandomQuestion: (excludeIds: string[] = []) =>
      request<components["schemas"]["LearnerQuestionDto"]>(
        "/api/v1/practice/random",
        {
          authenticated: true,
          query: { excludeIds: excludeIds.length > 0 ? excludeIds : undefined },
        },
      ),
    answerQuestion: (
      questionId: string,
      input: Idempotent<BodyOf<"practiceAnswerQuestion">>,
    ) => {
      const { idempotencyKey, ...body } = input;
      return request<components["schemas"]["AnswerResultDto"]>(
        `/api/v1/practice/questions/${encodeURIComponent(questionId)}/answer` as ApiPath,
        {
          method: "POST",
          authenticated: true,
          mutation: true,
          body,
          headers: { "Idempotency-Key": idempotencyKey },
        },
      );
    },
    listWrongQuestions: (query: QueryOf<"practiceListWrongQuestions"> = {}) =>
      request<components["schemas"]["WrongQuestionListResponseDto"]>(
        "/api/v1/practice/wrong-questions",
        { authenticated: true, query },
      ),
    retryWrongQuestion: (
      questionId: string,
      input: Idempotent<BodyOf<"practiceRetryWrongQuestion">>,
    ) => {
      const { idempotencyKey, ...body } = input;
      return request<components["schemas"]["AnswerResultDto"]>(
        `/api/v1/practice/wrong-questions/${encodeURIComponent(questionId)}/answer` as ApiPath,
        {
          method: "POST",
          authenticated: true,
          mutation: true,
          body,
          headers: { "Idempotency-Key": idempotencyKey },
        },
      );
    },
    getPracticeSummary: () =>
      request<components["schemas"]["PracticeSummaryDto"]>(
        "/api/v1/practice/summary",
        { authenticated: true },
      ),

    getPointBalance: () =>
      request<components["schemas"]["PointBalanceDto"]>(
        "/api/v1/points/balance",
        { authenticated: true },
      ),
    listPointLedger: (query: QueryOf<"pointsListLedger"> = {}) =>
      request<components["schemas"]["PointLedgerListResponseDto"]>(
        "/api/v1/points/ledger",
        { authenticated: true, query },
      ),
    getAdminPointConfig: () =>
      request<components["schemas"]["PointConfigDto"]>(
        "/api/v1/admin/points/config",
        { authenticated: true },
      ),
    updateAdminPointConfig: (input: BodyOf<"adminUpdatePointConfig">) =>
      request<components["schemas"]["PointConfigDto"]>(
        "/api/v1/admin/points/config",
        {
          method: "PUT",
          authenticated: true,
          mutation: true,
          body: input,
        },
      ),

    listProducts: (query: QueryOf<"productsList"> = {}) =>
      request<components["schemas"]["ProductListResponseDto"]>(
        "/api/v1/products",
        { authenticated: true, query },
      ),
    getProduct: (productId: string) =>
      request<components["schemas"]["ProductDto"]>(
        `/api/v1/products/${encodeURIComponent(productId)}` as ApiPath,
        { authenticated: true },
      ),
    listAdminProducts: (query: QueryOf<"adminListProducts"> = {}) =>
      request<components["schemas"]["ProductListResponseDto"]>(
        "/api/v1/admin/products",
        { authenticated: true, query },
      ),
    createAdminProduct: (input: BodyOf<"adminCreateProduct">) =>
      request<components["schemas"]["ProductDto"]>("/api/v1/admin/products", {
        method: "POST",
        authenticated: true,
        mutation: true,
        body: input,
      }),
    updateAdminProduct: (
      productId: string,
      input: BodyOf<"adminUpdateProduct">,
    ) =>
      request<components["schemas"]["ProductDto"]>(
        `/api/v1/admin/products/${encodeURIComponent(productId)}` as ApiPath,
        {
          method: "PATCH",
          authenticated: true,
          mutation: true,
          body: input,
        },
      ),
    uploadAdminProductImage: (file: Blob, filename = "product-image") => {
      const body = new FormData();
      body.append("file", file, filename);
      return request<components["schemas"]["ProductImageUploadResponseDto"]>(
        "/api/v1/admin/uploads/product-images",
        {
          method: "POST",
          authenticated: true,
          mutation: true,
          formData: body,
        },
      );
    },

    createOrder: (input: Idempotent<BodyOf<"ordersCreate">>) => {
      const { idempotencyKey, ...body } = input;
      return request<components["schemas"]["OrderDto"]>("/api/v1/orders", {
        method: "POST",
        authenticated: true,
        mutation: true,
        body,
        headers: { "Idempotency-Key": idempotencyKey },
      });
    },
    listOrders: (query: QueryOf<"ordersList"> = {}) =>
      request<components["schemas"]["OrderListResponseDto"]>("/api/v1/orders", {
        authenticated: true,
        query,
      }),
    getOrder: (orderId: string) =>
      request<components["schemas"]["OrderDto"]>(
        `/api/v1/orders/${encodeURIComponent(orderId)}` as ApiPath,
        { authenticated: true },
      ),
    listAdminOrders: (query: QueryOf<"adminListOrders"> = {}) =>
      request<components["schemas"]["AdminOrderListResponseDto"]>(
        "/api/v1/admin/orders",
        { authenticated: true, query },
      ),
    getAdminOrder: (orderId: string) =>
      request<components["schemas"]["AdminOrderDto"]>(
        `/api/v1/admin/orders/${encodeURIComponent(orderId)}` as ApiPath,
        { authenticated: true },
      ),
    completeAdminOrder: (orderId: string) =>
      request<components["schemas"]["AdminOrderDto"]>(
        `/api/v1/admin/orders/${encodeURIComponent(orderId)}/complete` as ApiPath,
        { method: "POST", authenticated: true, mutation: true },
      ),
    cancelAdminOrder: (orderId: string) =>
      request<components["schemas"]["AdminOrderDto"]>(
        `/api/v1/admin/orders/${encodeURIComponent(orderId)}/cancel` as ApiPath,
        { method: "POST", authenticated: true, mutation: true },
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type ApiError = ApiErrorBody;

import type { components, operations, paths } from "./schema.js";

type MaybePromise<T> = T | Promise<T>;
type OperationName = keyof operations;
type ApiPath = keyof paths;
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type MethodKey<Method extends HttpMethod> = Lowercase<Method>;
type ApiErrorBody = components["schemas"]["ApiErrorDto"];
type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type ValidBinding = {
  [Path in ApiPath]: {
    [Method in HttpMethod]: [
      NonNullable<paths[Path][MethodKey<Method>]>,
    ] extends [never]
      ? never
      : { path: Path; method: Method };
  }[HttpMethod];
}[ApiPath];

export const operationRegistry = {
  adminGetDashboard: { path: "/api/v1/admin/dashboard", method: "GET" },
  adminListAiModels: { path: "/api/v1/admin/ai-models", method: "GET" },
  adminCreateAiModel: { path: "/api/v1/admin/ai-models", method: "POST" },
  adminTestAiModelDraft: {
    path: "/api/v1/admin/ai-models/test",
    method: "POST",
  },
  adminGetAiModel: { path: "/api/v1/admin/ai-models/{id}", method: "GET" },
  adminUpdateAiModel: {
    path: "/api/v1/admin/ai-models/{id}",
    method: "PATCH",
  },
  adminDeleteAiModel: {
    path: "/api/v1/admin/ai-models/{id}",
    method: "DELETE",
  },
  adminTestAiModel: {
    path: "/api/v1/admin/ai-models/{id}/test",
    method: "POST",
  },
  adminListAiTasks: { path: "/api/v1/admin/ai-tasks", method: "GET" },
  adminCreateAiTask: { path: "/api/v1/admin/ai-tasks", method: "POST" },
  adminGetAiTask: { path: "/api/v1/admin/ai-tasks/{id}", method: "GET" },
  adminUpdateAiTask: {
    path: "/api/v1/admin/ai-tasks/{id}",
    method: "PATCH",
  },
  adminDeleteAiTask: {
    path: "/api/v1/admin/ai-tasks/{id}",
    method: "DELETE",
  },
  adminRunAiTask: {
    path: "/api/v1/admin/ai-tasks/{id}/run",
    method: "POST",
  },
  adminListAiTaskRuns: {
    path: "/api/v1/admin/ai-tasks/{id}/runs",
    method: "GET",
  },
  adminListOrders: { path: "/api/v1/admin/orders", method: "GET" },
  adminGetOrder: {
    path: "/api/v1/admin/orders/{orderId}",
    method: "GET",
  },
  adminCancelOrder: {
    path: "/api/v1/admin/orders/{orderId}/cancel",
    method: "POST",
  },
  adminCompleteOrder: {
    path: "/api/v1/admin/orders/{orderId}/complete",
    method: "POST",
  },
  adminGetPointConfig: {
    path: "/api/v1/admin/points/config",
    method: "GET",
  },
  adminListPointConfigHistory: {
    path: "/api/v1/admin/points/config/history",
    method: "GET",
  },
  adminUpdatePointConfig: {
    path: "/api/v1/admin/points/config",
    method: "PUT",
  },
  adminListProducts: { path: "/api/v1/admin/products", method: "GET" },
  adminCreateProduct: { path: "/api/v1/admin/products", method: "POST" },
  adminUpdateProduct: {
    path: "/api/v1/admin/products/{productId}",
    method: "PATCH",
  },
  adminDeleteProduct: {
    path: "/api/v1/admin/products/{productId}",
    method: "DELETE",
  },
  adminListQuestions: { path: "/api/v1/admin/questions", method: "GET" },
  adminCreateQuestion: {
    path: "/api/v1/admin/questions",
    method: "POST",
  },
  adminGetQuestion: {
    path: "/api/v1/admin/questions/{questionId}",
    method: "GET",
  },
  adminUpdateQuestion: {
    path: "/api/v1/admin/questions/{questionId}",
    method: "PATCH",
  },
  adminDeleteQuestion: {
    path: "/api/v1/admin/questions/{questionId}",
    method: "DELETE",
  },
  adminUploadProductImage: {
    path: "/api/v1/admin/uploads/product-images",
    method: "POST",
  },
  authLoginWeb: { path: "/api/v1/auth/login", method: "POST" },
  authLogout: { path: "/api/v1/auth/logout", method: "POST" },
  authGetCurrentUser: { path: "/api/v1/auth/me", method: "GET" },
  authRefresh: { path: "/api/v1/auth/refresh", method: "POST" },
  authRegister: { path: "/api/v1/auth/register", method: "POST" },
  authIssueAndroidToken: { path: "/api/v1/auth/token", method: "POST" },
  healthGet: { path: "/api/v1/health", method: "GET" },
  ordersList: { path: "/api/v1/orders", method: "GET" },
  ordersCreate: { path: "/api/v1/orders", method: "POST" },
  ordersGet: { path: "/api/v1/orders/{orderId}", method: "GET" },
  pointsGetBalance: { path: "/api/v1/points/balance", method: "GET" },
  pointsListLedger: { path: "/api/v1/points/ledger", method: "GET" },
  practiceAnswerQuestion: {
    path: "/api/v1/practice/questions/{questionId}/answer",
    method: "POST",
  },
  practiceGetPreviewQuestions: {
    path: "/api/v1/practice/preview",
    method: "GET",
  },
  practiceGetRandomQuestion: {
    path: "/api/v1/practice/random",
    method: "GET",
  },
  practiceGetSummary: { path: "/api/v1/practice/summary", method: "GET" },
  practiceListWrongQuestions: {
    path: "/api/v1/practice/wrong-questions",
    method: "GET",
  },
  practiceRetryWrongQuestion: {
    path: "/api/v1/practice/wrong-questions/{questionId}/answer",
    method: "POST",
  },
  productsList: { path: "/api/v1/products", method: "GET" },
  productsGet: { path: "/api/v1/products/{productId}", method: "GET" },
} as const satisfies Record<OperationName, ValidBinding>;

type ParameterOf<
  Name extends OperationName,
  Kind extends "path" | "query" | "header",
> = NonNullable<operations[Name]["parameters"][Kind]>;

type JsonBodyOf<Name extends OperationName> = operations[Name] extends {
  requestBody: {
    content: { "application/json": infer Body };
  };
}
  ? Body
  : never;

type MultipartBodyOf<Name extends OperationName> = operations[Name] extends {
  requestBody: {
    content: { "multipart/form-data": infer Body };
  };
}
  ? Body
  : never;

type SuccessStatus = 200 | 201 | 202 | 204;
type SuccessResponseOf<Name extends OperationName> =
  operations[Name]["responses"][Extract<
    keyof operations[Name]["responses"],
    SuccessStatus
  >];
type JsonContentOf<Response> = Response extends {
  content: { "application/json": infer Body };
}
  ? Body
  : undefined;
type SuccessBodyOf<Name extends OperationName> = JsonContentOf<
  SuccessResponseOf<Name>
>;

type IsOptionalObject<Value> = object extends Value ? true : false;
type Option<Key extends string, Value, Optional extends boolean = false> = [
  Value,
] extends [never]
  ? { [Property in Key]?: never }
  : Optional extends true
    ? { [Property in Key]?: Value }
    : { [Property in Key]: Value };

type TypedRequestOptions<Name extends OperationName> = Option<
  "pathParams",
  ParameterOf<Name, "path">
> &
  Option<"query", ParameterOf<Name, "query">, true> &
  Option<
    "headers",
    ParameterOf<Name, "header">,
    IsOptionalObject<ParameterOf<Name, "header">>
  > &
  Option<"body", JsonBodyOf<Name>> &
  Option<"formData", MultipartBodyOf<Name> extends never ? never : FormData> & {
    authMode?:
      | "public"
      | "web-login"
      | "authenticated"
      | "refresh-cookie"
      | "body-refresh-token";
  };

type Idempotent<Body> = Body & { idempotencyKey: string };

export type ApiClientOptions = {
  baseUrl: string;
  fetch?: FetchImplementation;
  getAccessToken?: () => MaybePromise<string | null | undefined>;
  getCsrfToken?: () => MaybePromise<string | null | undefined>;
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

function isTokenResponse(
  value: unknown,
): value is components["schemas"]["TokenResponseDto"] {
  return (
    isRecord(value) &&
    typeof value.accessToken === "string" &&
    typeof value.refreshToken === "string" &&
    typeof value.accessTokenExpiresIn === "number" &&
    typeof value.refreshTokenExpiresAt === "string"
  );
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function relativePath(path: string): string {
  return path.slice("/api/v1".length);
}

function interpolatePath(
  template: ApiPath,
  parameters: Record<string, unknown> | undefined,
): string {
  return template.replace(/\{([^}]+)\}/g, (_placeholder, key: string) => {
    const value = parameters?.[key];
    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError(`缺少 path 参数：${key}`);
    }
    return encodeURIComponent(value);
  });
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

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
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

export class ApiNetworkError extends Error {
  override readonly cause: unknown;
  readonly url: string;

  constructor(url: string, cause: unknown) {
    super("网络请求失败", { cause });
    this.name = "ApiNetworkError";
    this.url = url;
    this.cause = cause;
  }
}

export class ApiProtocolError extends Error {
  readonly status: number;
  readonly responseText: string;

  constructor(status: number, responseText: string, message: string) {
    super(message);
    this.name = "ApiProtocolError";
    this.status = status;
    this.responseText = responseText;
  }
}

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
    const binding = operationRegistry[operationId];
    const path = interpolatePath(
      binding.path,
      requestOptions.pathParams as Record<string, unknown> | undefined,
    );
    const query = serializeQuery(
      requestOptions.query as Record<string, unknown> | undefined,
    );
    const url = `${baseUrl}${relativePath(path)}${query}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    for (const [name, value] of Object.entries(requestOptions.headers ?? {})) {
      if (value !== undefined) {
        headers[name] = String(value);
      }
    }

    const authMode = requestOptions.authMode ?? "public";
    let credentials: RequestCredentials =
      authMode === "web-login" || authMode === "refresh-cookie"
        ? "include"
        : "omit";
    if (authMode === "authenticated") {
      const accessToken = await options.getAccessToken?.();
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      } else {
        credentials = "include";
      }
    }
    const mutation = binding.method !== "GET";
    const needsCsrf =
      mutation &&
      credentials === "include" &&
      (authMode === "authenticated" || authMode === "refresh-cookie");
    if (needsCsrf) {
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

    if (response.status === 204) {
      return undefined as SuccessBodyOf<Name>;
    }
    const responseText = await response.text();
    const responseBody = responseText ? parseJson(responseText) : undefined;
    if (!response.ok) {
      const errorBody: ApiErrorBody = isApiErrorBody(responseBody)
        ? responseBody
        : {
            code: "HTTP_ERROR",
            message: response.statusText || `HTTP ${response.status}`,
            requestId: response.headers.get("x-request-id") ?? "",
            details:
              responseBody === undefined
                ? { responseText }
                : { response: responseBody },
          };
      throw new ApiClientError(response.status, errorBody);
    }
    if (responseBody === undefined) {
      throw new ApiProtocolError(
        response.status,
        responseText,
        "成功响应不是有效的 JSON",
      );
    }
    return responseBody as SuccessBodyOf<Name>;
  }

  return {
    getHealth: () => request("healthGet", {}),

    getAdminDashboard: () =>
      request("adminGetDashboard", { authMode: "authenticated" }),

    register: (input: JsonBodyOf<"authRegister">) =>
      request("authRegister", { body: input }),
    loginWeb: (input: JsonBodyOf<"authLoginWeb">) =>
      request("authLoginWeb", {
        authMode: "web-login",
        body: input,
      }),
    issueAndroidToken: (input: JsonBodyOf<"authIssueAndroidToken">) =>
      request("authIssueAndroidToken", { body: input }),
    refreshWeb: async () => {
      const response = await request("authRefresh", {
        authMode: "refresh-cookie",
        body: {},
      });
      if (isTokenResponse(response)) {
        throw new ApiProtocolError(
          201,
          JSON.stringify(response),
          "Web refresh 返回了 Android TokenPair",
        );
      }
      return response;
    },
    refreshAndroid: async (refreshToken: string) => {
      const response = await request("authRefresh", {
        authMode: "body-refresh-token",
        body: { refreshToken },
      });
      if (!isTokenResponse(response)) {
        throw new ApiProtocolError(
          201,
          JSON.stringify(response),
          "Android refresh 未返回 TokenPair",
        );
      }
      return response;
    },
    logout: (input: JsonBodyOf<"authLogout"> = {}) =>
      request("authLogout", {
        authMode: input.refreshToken ? "body-refresh-token" : "refresh-cookie",
        body: input,
      }),
    getCurrentUser: () =>
      request("authGetCurrentUser", { authMode: "authenticated" }),

    listAdminQuestions: (
      query: ParameterOf<"adminListQuestions", "query"> = {},
    ) =>
      request("adminListQuestions", {
        authMode: "authenticated",
        query,
      }),
    createAdminQuestion: (input: JsonBodyOf<"adminCreateQuestion">) =>
      request("adminCreateQuestion", {
        authMode: "authenticated",
        body: input,
      }),
    getAdminQuestion: (questionId: string) =>
      request("adminGetQuestion", {
        authMode: "authenticated",
        pathParams: { questionId },
      }),
    updateAdminQuestion: (
      questionId: string,
      input: JsonBodyOf<"adminUpdateQuestion">,
    ) =>
      request("adminUpdateQuestion", {
        authMode: "authenticated",
        pathParams: { questionId },
        body: input,
      }),
    deleteAdminQuestion: (questionId: string) =>
      request("adminDeleteQuestion", {
        authMode: "authenticated",
        pathParams: { questionId },
      }),

    getPreviewQuestions: (count?: number) =>
      request("practiceGetPreviewQuestions", {
        authMode: "authenticated",
        query: { count },
      }),
    getRandomQuestion: (excludeIds: string[] = []) =>
      request("practiceGetRandomQuestion", {
        authMode: "authenticated",
        query: {
          excludeIds: excludeIds.length ? excludeIds.join(",") : undefined,
        },
      }),
    answerQuestion: (
      questionId: string,
      input: Idempotent<JsonBodyOf<"practiceAnswerQuestion">>,
    ) => {
      const { idempotencyKey, ...body } = input;
      return request("practiceAnswerQuestion", {
        authMode: "authenticated",
        pathParams: { questionId },
        headers: { "Idempotency-Key": idempotencyKey },
        body,
      });
    },
    listWrongQuestions: (
      query: ParameterOf<"practiceListWrongQuestions", "query"> = {},
    ) =>
      request("practiceListWrongQuestions", {
        authMode: "authenticated",
        query,
      }),
    retryWrongQuestion: (
      questionId: string,
      input: Idempotent<JsonBodyOf<"practiceRetryWrongQuestion">>,
    ) => {
      const { idempotencyKey, ...body } = input;
      return request("practiceRetryWrongQuestion", {
        authMode: "authenticated",
        pathParams: { questionId },
        headers: { "Idempotency-Key": idempotencyKey },
        body,
      });
    },
    getPracticeSummary: () =>
      request("practiceGetSummary", { authMode: "authenticated" }),

    getPointBalance: () =>
      request("pointsGetBalance", { authMode: "authenticated" }),
    listPointLedger: (query: ParameterOf<"pointsListLedger", "query"> = {}) =>
      request("pointsListLedger", { authMode: "authenticated", query }),
    getAdminPointConfig: () =>
      request("adminGetPointConfig", { authMode: "authenticated" }),
    listAdminPointConfigHistory: (
      query: ParameterOf<"adminListPointConfigHistory", "query"> = {},
    ) =>
      request("adminListPointConfigHistory", {
        authMode: "authenticated",
        query,
      }),
    updateAdminPointConfig: (input: JsonBodyOf<"adminUpdatePointConfig">) =>
      request("adminUpdatePointConfig", {
        authMode: "authenticated",
        body: input,
      }),

    listAdminAiModels: (
      query: ParameterOf<"adminListAiModels", "query"> = {},
    ) =>
      request("adminListAiModels", {
        authMode: "authenticated",
        query,
      }),
    createAdminAiModel: (input: JsonBodyOf<"adminCreateAiModel">) =>
      request("adminCreateAiModel", {
        authMode: "authenticated",
        body: input,
      }),
    getAdminAiModel: (id: string) =>
      request("adminGetAiModel", {
        authMode: "authenticated",
        pathParams: { id },
      }),
    updateAdminAiModel: (
      id: string,
      input: JsonBodyOf<"adminUpdateAiModel">,
    ) =>
      request("adminUpdateAiModel", {
        authMode: "authenticated",
        pathParams: { id },
        body: input,
      }),
    deleteAdminAiModel: (id: string) =>
      request("adminDeleteAiModel", {
        authMode: "authenticated",
        pathParams: { id },
      }),
    testAdminAiModelDraft: (input: JsonBodyOf<"adminTestAiModelDraft">) =>
      request("adminTestAiModelDraft", {
        authMode: "authenticated",
        body: input,
      }),
    testAdminAiModel: (id: string) =>
      request("adminTestAiModel", {
        authMode: "authenticated",
        pathParams: { id },
      }),

    listAdminAiTasks: (
      query: ParameterOf<"adminListAiTasks", "query"> = {},
    ) =>
      request("adminListAiTasks", {
        authMode: "authenticated",
        query,
      }),
    createAdminAiTask: (input: JsonBodyOf<"adminCreateAiTask">) =>
      request("adminCreateAiTask", {
        authMode: "authenticated",
        body: input,
      }),
    getAdminAiTask: (id: string) =>
      request("adminGetAiTask", {
        authMode: "authenticated",
        pathParams: { id },
      }),
    updateAdminAiTask: (
      id: string,
      input: JsonBodyOf<"adminUpdateAiTask">,
    ) =>
      request("adminUpdateAiTask", {
        authMode: "authenticated",
        pathParams: { id },
        body: input,
      }),
    deleteAdminAiTask: (id: string) =>
      request("adminDeleteAiTask", {
        authMode: "authenticated",
        pathParams: { id },
      }),
    runAdminAiTask: (id: string) =>
      request("adminRunAiTask", {
        authMode: "authenticated",
        pathParams: { id },
      }),
    listAdminAiTaskRuns: (
      id: string,
      query: ParameterOf<"adminListAiTaskRuns", "query"> = {},
    ) =>
      request("adminListAiTaskRuns", {
        authMode: "authenticated",
        pathParams: { id },
        query,
      }),

    listProducts: (query: ParameterOf<"productsList", "query"> = {}) =>
      request("productsList", { authMode: "authenticated", query }),
    getProduct: (productId: string) =>
      request("productsGet", {
        authMode: "authenticated",
        pathParams: { productId },
      }),
    listAdminProducts: (
      query: ParameterOf<"adminListProducts", "query"> = {},
    ) =>
      request("adminListProducts", {
        authMode: "authenticated",
        query,
      }),
    createAdminProduct: (input: JsonBodyOf<"adminCreateProduct">) =>
      request("adminCreateProduct", {
        authMode: "authenticated",
        body: input,
      }),
    updateAdminProduct: (
      productId: string,
      input: JsonBodyOf<"adminUpdateProduct">,
    ) =>
      request("adminUpdateProduct", {
        authMode: "authenticated",
        pathParams: { productId },
        body: input,
      }),
    deleteAdminProduct: (productId: string) =>
      request("adminDeleteProduct", {
        authMode: "authenticated",
        pathParams: { productId },
      }),
    uploadAdminProductImage: (file: Blob, filename = "product-image") => {
      const formData = new FormData();
      formData.append("file", file, filename);
      return request("adminUploadProductImage", {
        authMode: "authenticated",
        formData,
      });
    },

    createOrder: (input: Idempotent<JsonBodyOf<"ordersCreate">>) => {
      const { idempotencyKey, ...body } = input;
      return request("ordersCreate", {
        authMode: "authenticated",
        headers: { "Idempotency-Key": idempotencyKey },
        body,
      });
    },
    listOrders: (query: ParameterOf<"ordersList", "query"> = {}) =>
      request("ordersList", { authMode: "authenticated", query }),
    getOrder: (orderId: string) =>
      request("ordersGet", {
        authMode: "authenticated",
        pathParams: { orderId },
      }),
    listAdminOrders: (query: ParameterOf<"adminListOrders", "query"> = {}) =>
      request("adminListOrders", { authMode: "authenticated", query }),
    getAdminOrder: (orderId: string) =>
      request("adminGetOrder", {
        authMode: "authenticated",
        pathParams: { orderId },
      }),
    completeAdminOrder: (orderId: string) =>
      request("adminCompleteOrder", {
        authMode: "authenticated",
        pathParams: { orderId },
      }),
    cancelAdminOrder: (orderId: string) =>
      request("adminCancelOrder", {
        authMode: "authenticated",
        pathParams: { orderId },
      }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type ApiError = ApiErrorBody;

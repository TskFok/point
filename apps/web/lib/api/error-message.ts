import { ApiClientError, ApiNetworkError } from "@point-quest/api-client";

const errorMessages: Record<string, string> = {
  AUTH_INVALID_CREDENTIALS: "用户名或密码错误",
  AUTH_USERNAME_TAKEN: "用户名已被使用",
  VALIDATION_FAILED: "请检查输入内容后重试",
  AUTH_INVALID_TOKEN: "登录状态已失效，请重新登录",
  AUTH_TOKEN_EXPIRED: "登录状态已过期，请重新登录",
};

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return errorMessages[error.body.code] ?? "请求未完成，请稍后重试";
  }

  if (error instanceof ApiNetworkError) {
    return "网络连接失败，请检查网络后重试";
  }

  return "暂时无法完成操作，请稍后重试";
}

export function shouldClearAuthSecrets(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    error.status < 500 &&
    (error.body.code === "AUTH_INVALID_CREDENTIALS" ||
      error.body.code === "AUTH_USERNAME_TAKEN")
  );
}

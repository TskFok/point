import { ApiClientError, ApiNetworkError } from "@point-quest/api-client";

const errorMessages: Record<string, string> = {
  AUTH_INVALID_CREDENTIALS: "用户名或密码错误",
  AUTH_USERNAME_TAKEN: "用户名已被使用",
  VALIDATION_FAILED: "请检查输入内容后重试",
  AUTH_INVALID_TOKEN: "登录状态已失效，请重新登录",
  AUTH_TOKEN_EXPIRED: "登录状态已过期，请重新登录",
  CONCURRENT_MODIFICATION: "数据刚刚发生变化，请使用原请求重试",
  IDEMPOTENCY_CONFLICT: "本次请求标识已被其他操作使用，请重新发起",
  INSUFFICIENT_POINTS: "积分余额不足，请刷新后再试",
  OUT_OF_STOCK: "商品刚刚售罄，请选择其他奖励",
  PRODUCT_INACTIVE: "商品已下架，请选择其他奖励",
  QUESTION_ALREADY_ANSWERED: "这道题已经完成首次作答",
  QUESTION_ALREADY_MASTERED: "这道错题已经掌握",
  WRONG_QUESTION_NOT_FOUND: "这道题已不在待练错题中",
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

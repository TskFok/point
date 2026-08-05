declare global {
  interface Window {
    __POINT_PRODUCT_IMAGE_BASE_URL__?: string;
  }
}

/** 服务端 / 容器运行时可读的公开图基址（不依赖构建期内联）。 */
export function resolveProductImagePublicBaseUrlFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const base =
    env.PRODUCT_IMAGE_PUBLIC_BASE_URL?.trim() ||
    env.NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL?.trim();
  if (!base) {
    return undefined;
  }
  return base.replace(/\/+$/, "");
}

/** 客户端优先读 layout 注入的运行时值，再回退到 process.env（测试 / 本地）。 */
export function resolveProductImagePublicBaseUrl(): string | undefined {
  if (typeof window !== "undefined") {
    const fromWindow = window.__POINT_PRODUCT_IMAGE_BASE_URL__?.trim();
    if (fromWindow) {
      return fromWindow.replace(/\/+$/, "");
    }
  }
  return resolveProductImagePublicBaseUrlFromEnv();
}

export function productImageRuntimeBootstrapScript(
  baseUrl: string | undefined = resolveProductImagePublicBaseUrlFromEnv(),
): string {
  return `window.__POINT_PRODUCT_IMAGE_BASE_URL__=${JSON.stringify(baseUrl ?? "")};`;
}

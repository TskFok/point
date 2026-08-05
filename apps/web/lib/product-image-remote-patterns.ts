import { resolveProductImagePublicBaseUrlFromEnv } from "./product-image-base-url";

type ProductImageRemotePattern = {
  protocol: "http" | "https";
  hostname: string;
  port?: string;
  pathname: string;
};

/** 从公开 CDN 基址生成 next/image remotePatterns。 */
export function productImageRemotePatterns(
  baseUrl: string | undefined = resolveProductImagePublicBaseUrlFromEnv(),
): ProductImageRemotePattern[] {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return [];
    }
    return [
      {
        protocol: url.protocol === "https:" ? "https" : "http",
        hostname: url.hostname,
        port: url.port || undefined,
        pathname: "/**",
      },
    ];
  } catch {
    return [];
  }
}

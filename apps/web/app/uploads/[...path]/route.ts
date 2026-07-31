import { getApiServerBaseUrl } from "@/lib/api/server-base-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImageProxyContext = {
  params: Promise<{ path: string[] }>;
};

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "if-modified-since",
  "if-none-match",
  "range",
] as const;

const FORWARDED_RESPONSE_HEADERS = [
  "accept-ranges",
  "cache-control",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
] as const;

const PRODUCT_IMAGE_FILENAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/;

const PRODUCT_IMAGE_MEDIA_TYPES = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

function invalidImagePath() {
  return Response.json(
    {
      code: "INVALID_IMAGE_PATH",
      message: "图片路径无效",
    },
    { status: 400 },
  );
}

function imageUnavailable(status = 502) {
  return Response.json(
    {
      code: status === 404 ? "IMAGE_NOT_FOUND" : "IMAGE_UPSTREAM_UNAVAILABLE",
      message: status === 404 ? "图片不存在" : "图片暂时无法加载",
    },
    { status },
  );
}

function isSafePath(path: string[]) {
  return (
    path.length === 2 &&
    path[0] === "products" &&
    PRODUCT_IMAGE_FILENAME_PATTERN.test(path[1])
  );
}

function expectedMediaType(filename: string) {
  const extension = filename.slice(filename.lastIndexOf(".") + 1) as
    | "jpg"
    | "png"
    | "webp";
  return PRODUCT_IMAGE_MEDIA_TYPES[extension];
}

function upstreamImageUrl(path: string[]) {
  const apiUrl = new URL(getApiServerBaseUrl());
  if (apiUrl.protocol !== "http:" && apiUrl.protocol !== "https:") {
    throw new TypeError("API origin protocol is not HTTP");
  }
  const encodedPath = path
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${apiUrl.origin}/uploads/${encodedPath}`;
}

function upstreamHeaders(request: Request) {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("accept-encoding", "identity");
  return headers;
}

function browserHeaders(headers: Headers) {
  const result = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = headers.get(name);
    if (value) result.set(name, value);
  }
  result.set("x-content-type-options", "nosniff");
  return result;
}

async function proxyImage(
  request: Request,
  context: ImageProxyContext,
) {
  const { path } = await context.params;
  if (!isSafePath(path)) return invalidImagePath();

  try {
    const method = request.method.toUpperCase();
    const upstream = await fetch(upstreamImageUrl(path), {
      cache: "no-store",
      headers: upstreamHeaders(request),
      method,
      redirect: "manual",
    });

    if (upstream.status === 404) return imageUnavailable(404);
    const mediaType = upstream.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (
      upstream.status !== 304 &&
      (!upstream.ok || mediaType !== expectedMediaType(path[1]))
    ) {
      return imageUnavailable();
    }

    return new Response(
      method === "HEAD" || upstream.status === 304 ? null : upstream.body,
      {
        headers: browserHeaders(upstream.headers),
        status: upstream.status,
        statusText: upstream.statusText,
      },
    );
  } catch {
    return imageUnavailable();
  }
}

export const GET = proxyImage;
export const HEAD = proxyImage;

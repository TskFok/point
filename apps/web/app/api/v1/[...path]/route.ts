import { getApiServerBaseUrl } from "@/lib/api/server-base-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProxyContext = {
  params: Promise<{ path: string[] }>;
};

type HeadersWithSetCookie = Headers & {
  getSetCookie?: () => string[];
};

type NodeRequestInit = RequestInit & {
  duplex?: "half";
};

const REQUEST_HEADER_BLOCKLIST = new Set([
  "accept-encoding",
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const RESPONSE_HEADER_BLOCKLIST = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function connectionHeaderNames(headers: Headers) {
  return new Set(
    (headers.get("connection") ?? "")
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  );
}

function createUpstreamRequestHeaders(headers: Headers) {
  const result = new Headers();
  const connectionHeaders = connectionHeaderNames(headers);

  headers.forEach((value, name) => {
    const normalizedName = name.toLowerCase();
    if (
      !REQUEST_HEADER_BLOCKLIST.has(normalizedName) &&
      !connectionHeaders.has(normalizedName)
    ) {
      result.append(name, value);
    }
  });

  result.set("accept-encoding", "identity");
  return result;
}

function createBrowserResponseHeaders(headers: Headers) {
  const result = new Headers();
  const connectionHeaders = connectionHeaderNames(headers);

  headers.forEach((value, name) => {
    const normalizedName = name.toLowerCase();
    if (
      normalizedName !== "set-cookie" &&
      !RESPONSE_HEADER_BLOCKLIST.has(normalizedName) &&
      !connectionHeaders.has(normalizedName)
    ) {
      result.append(name, value);
    }
  });

  const headersWithSetCookie = headers as HeadersWithSetCookie;
  const setCookies = headersWithSetCookie.getSetCookie?.();
  if (setCookies?.length) {
    setCookies.forEach((cookie) => result.append("set-cookie", cookie));
  } else {
    const setCookie = headers.get("set-cookie");
    if (setCookie) result.append("set-cookie", setCookie);
  }

  return result;
}

function createUpstreamUrl(request: Request, path: string[]) {
  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/");
  const upstreamUrl = new URL(`${getApiServerBaseUrl()}/${encodedPath}`);
  upstreamUrl.search = new URL(request.url).search;
  return upstreamUrl.toString();
}

function upstreamUnavailableResponse() {
  return Response.json(
    {
      code: "UPSTREAM_UNAVAILABLE",
      details: {},
      message: "服务暂时不可用，请稍后重试",
      requestId: "",
    },
    { status: 502 },
  );
}

function responseMustNotHaveBody(method: string, status: number) {
  return method === "HEAD" || status === 204 || status === 205 || status === 304;
}

async function proxyRequest(request: Request, context: ProxyContext) {
  try {
    const { path } = await context.params;
    const method = request.method.toUpperCase();
    const requestBody =
      method === "GET" || method === "HEAD" ? undefined : request.body;
    const upstreamRequestInit: NodeRequestInit = {
      body: requestBody ?? undefined,
      cache: "no-store",
      headers: createUpstreamRequestHeaders(request.headers),
      method,
      redirect: "manual",
    };
    if (requestBody) upstreamRequestInit.duplex = "half";

    const upstreamResponse = await fetch(
      createUpstreamUrl(request, path),
      upstreamRequestInit,
    );

    return new Response(
      responseMustNotHaveBody(method, upstreamResponse.status)
        ? null
        : upstreamResponse.body,
      {
        headers: createBrowserResponseHeaders(upstreamResponse.headers),
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
      },
    );
  } catch {
    return upstreamUnavailableResponse();
  }
}

export const GET = proxyRequest;
export const HEAD = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;

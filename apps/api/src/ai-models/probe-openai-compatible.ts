export type ProbeResult = {
  ok: boolean;
  latencyMs: number;
  modelCount?: number;
  message?: string;
};

export type ProbeFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export function normalizeModelsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/models')) {
    return trimmed;
  }
  return `${trimmed}/models`;
}

export async function probeOpenAiCompatibleModels(
  baseUrl: string,
  apiKey: string,
  options?: {
    fetchImpl?: ProbeFetch;
    timeoutMs?: number;
  },
): Promise<ProbeResult> {
  const url = normalizeModelsUrl(baseUrl);
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const started = Date.now();

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Date.now() - started;

    if (!response.ok) {
      return {
        ok: false,
        latencyMs,
        message: `HTTP ${response.status}`,
      };
    }

    let modelCount: number | undefined;
    try {
      const body: unknown = await response.json();
      if (
        typeof body === 'object' &&
        body !== null &&
        Array.isArray((body as { data?: unknown }).data)
      ) {
        modelCount = (body as { data: unknown[] }).data.length;
      }
    } catch {
      // 响应体非 JSON 时仍视为连通成功
    }

    return {
      ok: true,
      latencyMs,
      ...(modelCount === undefined ? {} : { modelCount }),
    };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const name =
      typeof error === 'object' && error !== null && 'name' in error
        ? String((error as { name: unknown }).name)
        : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return { ok: false, latencyMs, message: '请求超时' };
    }
    return { ok: false, latencyMs, message: '网络错误' };
  }
}

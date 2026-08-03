import {
  normalizeModelsUrl,
  probeOpenAiCompatibleModels,
} from './probe-openai-compatible';

describe('probe-openai-compatible', () => {
  it('规范化 URL', () => {
    expect(normalizeModelsUrl('https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/models',
    );
    expect(normalizeModelsUrl('https://api.example.com/v1/models')).toBe(
      'https://api.example.com/v1/models',
    );
  });

  it('2xx 成功并解析 modelCount', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'a' }, { id: 'b' }] }),
    });
    const result = await probeOpenAiCompatibleModels(
      'https://api.example.com/v1',
      'sk-x',
      { fetchImpl, timeoutMs: 10_000 },
    );
    expect(result.ok).toBe(true);
    expect(result.modelCount).toBe(2);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-x',
        }),
      }),
    );
  });

  it('401 返回 ok:false 且 message 不含密钥', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({}),
    });
    const result = await probeOpenAiCompatibleModels(
      'https://api.example.com/v1',
      'sk-secret',
      { fetchImpl },
    );
    expect(result.ok).toBe(false);
    expect(result.message).toBe('HTTP 401');
    expect(JSON.stringify(result)).not.toContain('sk-secret');
  });

  it('超时返回请求超时', async () => {
    const fetchImpl = jest.fn().mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal?.aborted) {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          return;
        }
        signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
        });
      });
    });

    const result = await probeOpenAiCompatibleModels(
      'https://api.example.com/v1',
      'sk-x',
      { fetchImpl, timeoutMs: 20 },
    );
    expect(result.ok).toBe(false);
    expect(result.message).toBe('请求超时');
  });
});

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AiModelsService } from './ai-models.service';
import {
  decryptSecret,
  encryptSecret,
  resolveEncryptionKey,
} from './secret-crypto';

const encryptionKeyBase64 = Buffer.alloc(32, 9).toString('base64');

function createService(options?: {
  existing?: Record<string, unknown> | null;
  createImpl?: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  updateImpl?: (args: {
    where: { id: string };
    data: Record<string, unknown>;
  }) => Promise<unknown>;
}) {
  const existing = options?.existing;
  const store = {
    findUnique: ({ where }: { where: { id: string } }) =>
      Promise.resolve(
        existing && existing.id === where.id ? existing : null,
      ),
    create:
      options?.createImpl ??
      (({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'model-1',
          createdAt: new Date('2026-08-03T00:00:00.000Z'),
          updatedAt: new Date('2026-08-03T00:00:00.000Z'),
          ...data,
        })),
    update:
      options?.updateImpl ??
      (({
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const next = { ...existing };
        if (typeof data.name === 'string') next.name = data.name;
        if (typeof data.baseUrl === 'string') next.baseUrl = data.baseUrl;
        if (typeof data.isEnabled === 'boolean') next.isEnabled = data.isEnabled;
        if (typeof data.apiKeyCiphertext === 'string') {
          next.apiKeyCiphertext = data.apiKeyCiphertext;
        }
        if (typeof data.apiKeyLast4 === 'string') {
          next.apiKeyLast4 = data.apiKeyLast4;
        }
        next.updatedAt = new Date('2026-08-03T01:00:00.000Z');
        return Promise.resolve(next);
      }),
    delete: () => Promise.resolve(existing),
    findMany: () => Promise.resolve(existing ? [existing] : []),
    count: () => Promise.resolve(existing ? 1 : 0),
  };

  return new AiModelsService({
    aiModelConfig: store,
    $transaction: (ops: unknown) => {
      if (Array.isArray(ops)) {
        return Promise.all(ops);
      }
      return Promise.reject(new Error('unexpected transaction callback'));
    },
  } as never);
}

describe('AiModelsService', () => {
  const previousKey = process.env.AI_CONFIG_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.AI_CONFIG_ENCRYPTION_KEY = encryptionKeyBase64;
  });

  afterEach(() => {
    if (previousKey === undefined) {
      delete process.env.AI_CONFIG_ENCRYPTION_KEY;
    } else {
      process.env.AI_CONFIG_ENCRYPTION_KEY = previousKey;
    }
  });

  it('create 加密写入并返回脱敏 DTO', async () => {
    const service = createService();
    const dto = await service.create(
      {
        name: '  gpt-test  ',
        baseUrl: 'https://api.example.com/v1/',
        apiKey: 'sk-secret-key-9999',
      },
      'admin-1',
    );

    expect(dto).toMatchObject({
      id: 'model-1',
      name: 'gpt-test',
      baseUrl: 'https://api.example.com/v1',
      apiKeyMasked: '••••9999',
      isEnabled: true,
    });
    expect(dto).not.toHaveProperty('apiKeyCiphertext');
  });

  it('update 不传 apiKey 时保留密文', async () => {
    const key = resolveEncryptionKey();
    const real = encryptSecret('old-key-1111', key);
    const existing = {
      id: 'model-1',
      name: 'gpt-test',
      baseUrl: 'https://api.example.com/v1',
      apiKeyCiphertext: real.ciphertext,
      apiKeyLast4: real.last4,
      isEnabled: true,
      updatedBy: 'admin-1',
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
      updatedAt: new Date('2026-08-03T00:00:00.000Z'),
    };
    let updateData: Record<string, unknown> | undefined;
    const service = createService({
      existing,
      updateImpl: ({ data }) => {
        updateData = data;
        return Promise.resolve({
          ...existing,
          name: typeof data.name === 'string' ? data.name : existing.name,
          updatedAt: new Date('2026-08-03T01:00:00.000Z'),
        });
      },
    });

    await service.update('model-1', { name: 'gpt-renamed', apiKey: '' }, 'admin-1');
    expect(updateData).not.toHaveProperty('apiKeyCiphertext');
    expect(updateData).not.toHaveProperty('apiKeyLast4');
  });

  it('update 传新 apiKey 时更新密文', async () => {
    const key = resolveEncryptionKey();
    const old = encryptSecret('old-key-1111', key);
    const existing = {
      id: 'model-1',
      name: 'gpt-test',
      baseUrl: 'https://api.example.com/v1',
      apiKeyCiphertext: old.ciphertext,
      apiKeyLast4: old.last4,
      isEnabled: true,
      updatedBy: 'admin-1',
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
      updatedAt: new Date('2026-08-03T00:00:00.000Z'),
    };
    let updateData: Record<string, unknown> | undefined;
    const service = createService({
      existing,
      updateImpl: ({ data }) => {
        updateData = data;
        return Promise.resolve({
          ...existing,
          apiKeyCiphertext: data.apiKeyCiphertext,
          apiKeyLast4: data.apiKeyLast4,
          updatedAt: new Date('2026-08-03T01:00:00.000Z'),
        });
      },
    });

    const dto = await service.update(
      'model-1',
      { apiKey: 'sk-new-key-2222' },
      'admin-1',
    );
    expect(dto.apiKeyMasked).toBe('••••2222');
    expect(typeof updateData?.apiKeyCiphertext).toBe('string');
    expect(updateData?.apiKeyCiphertext).not.toBe(old.ciphertext);
    expect(
      decryptSecret(String(updateData?.apiKeyCiphertext), key),
    ).toBe('sk-new-key-2222');
  });

  it('name 冲突抛出 ConflictException', async () => {
    const service = createService({
      createImpl: () =>
        Promise.reject(Object.assign(new Error('unique'), { code: 'P2002' })),
    });
    await expect(
      service.create(
        {
          name: 'dup',
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'sk-1',
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('不存在时 NotFoundException', async () => {
    const service = createService({ existing: null });
    await expect(service.get('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('非法 baseUrl 抛出 VALIDATION_FAILED', async () => {
    const service = createService();
    await expect(
      service.create(
        {
          name: 'bad',
          baseUrl: 'ftp://example.com',
          apiKey: 'sk-1',
        },
        'admin-1',
      ),
    ).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED' },
    });
    await expect(
      service.create(
        {
          name: 'bad',
          baseUrl: 'ftp://example.com',
          apiKey: 'sk-1',
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('testDraft 优先使用请求体 apiKey', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });
    const originalFetch = global.fetch;
    global.fetch = fetchImpl as unknown as typeof fetch;
    try {
      const service = createService({ existing: null });
      const result = await service.testDraft({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-draft',
      });
      expect(result.ok).toBe(true);
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://api.example.com/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-draft',
          }),
        }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});

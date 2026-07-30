import { BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';

const imageKey = 'products/123e4567-e89b-42d3-a456-426614174000.png';

function validProduct(overrides: Record<string, unknown> = {}) {
  return {
    name: '  Vocabulary Badge  ',
    description: '  A learner reward.  ',
    imageKey,
    stock: 3,
    pointsCost: 20,
    isActive: true,
    ...overrides,
  };
}

function createService(existing?: Record<string, unknown>) {
  const product = {
    create: ({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'task7-service-product',
        ...data,
      }),
    findUnique: () => Promise.resolve(existing ?? null),
    update: ({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        ...existing,
        ...data,
      }),
  };
  const transactionClient = {
    product,
    $queryRaw: () =>
      Promise.resolve(existing ? [{ id: existing.id as string }] : []),
  };
  return new ProductsService({
    product,
    $transaction: <T>(
      callback: (client: typeof transactionClient) => Promise<T>,
    ) => callback(transactionClient),
  } as never);
}

async function expectValidationFailure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    return;
  }
  throw new Error('预期商品领域校验失败');
}

describe('ProductsService 领域校验', () => {
  it.each([
    ['空白名称', { name: '   ' }],
    ['null 描述', { description: null }],
    ['任意图片 URL', { imageKey: 'https://example.test/a.png' }],
    ['路径穿越图片 key', { imageKey: 'products/../secret.png' }],
    [
      '非可信扩展名',
      { imageKey: 'products/123e4567-e89b-42d3-a456-426614174000.svg' },
    ],
    ['负库存', { stock: -1 }],
    ['小数库存', { stock: 1.5 }],
    ['超过 PostgreSQL integer 的库存', { stock: 2_147_483_648 }],
    ['负积分', { pointsCost: -1 }],
    ['非布尔上架状态', { isActive: 'true' }],
    ['上架但积分为零', { pointsCost: 0 }],
  ])('绕过 DTO 创建时仍拒绝%s', async (_name, override) => {
    const service = createService();

    await expectValidationFailure(service.create(validProduct(override)));
  });

  it('创建时规范化文本并保留可信图片 key', async () => {
    const service = createService();

    await expect(
      service.create(validProduct() as never),
    ).resolves.toMatchObject({
      name: 'Vocabulary Badge',
      description: 'A learner reward.',
      imageKey,
      stock: 3,
      pointsCost: 20,
      isActive: true,
    });
  });

  it.each([
    ['显式 null', { description: null }],
    ['与当前状态合并后上架零积分商品', { isActive: true }],
  ])('PATCH %s时由服务层拒绝', async (_name, patch) => {
    const service = createService({
      id: 'task7-service-product',
      name: 'Badge',
      description: 'Reward',
      imageKey,
      stock: 1,
      pointsCost: 0,
      isActive: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expectValidationFailure(
      service.update('task7-service-product', patch as never),
    );
  });

  it('PATCH 与当前状态合并、规范化后更新，不要求重复提交其余字段', async () => {
    const service = createService({
      id: 'task7-service-product',
      name: 'Badge',
      description: 'Reward',
      imageKey,
      stock: 1,
      pointsCost: 20,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(
      service.update('task7-service-product', {
        description: '  Updated reward.  ',
      }),
    ).resolves.toMatchObject({
      name: 'Badge',
      description: 'Updated reward.',
      pointsCost: 20,
      isActive: true,
    });
  });

  it('PATCH 只写请求实际提供的字段，不回写可能已并发变化的库存与状态', async () => {
    let updateData: Record<string, unknown> | undefined;
    const existing = {
      id: 'task7-service-product',
      name: 'Badge',
      description: 'Reward',
      imageKey,
      stock: 1,
      pointsCost: 20,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const transactionClient = {
      product: {
        findUnique: () => Promise.resolve(existing),
        update: ({ data }: { data: Record<string, unknown> }) => {
          updateData = data;
          return Promise.resolve({ ...existing, ...data });
        },
      },
      $queryRaw: () => Promise.resolve([{ id: existing.id }]),
    };
    const service = new ProductsService({
      $transaction: <T>(
        callback: (client: typeof transactionClient) => Promise<T>,
      ) => callback(transactionClient),
    } as never);

    await service.update('task7-service-product', {
      description: '  Concurrent-safe update.  ',
    });

    expect(updateData).toEqual({
      description: 'Concurrent-safe update.',
    });
  });

  it('服务层拒绝会产生不安全 offset 的超大页码', async () => {
    const service = createService();
    await expectValidationFailure(
      service.list({
        page: 1_000_001,
        pageSize: 20,
      }),
    );
  });

  it('并发上架与积分归零不能形成上架零积分商品', async () => {
    const state = {
      id: 'task7-concurrent-product',
      name: 'Badge',
      description: 'Reward',
      imageKey,
      stock: 1,
      pointsCost: 10,
      isActive: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    let topLevelReads = 0;
    let releaseTopLevelReads!: () => void;
    const bothTopLevelReads = new Promise<void>((resolve) => {
      releaseTopLevelReads = resolve;
    });
    const topLevelProduct = {
      findUnique: async () => {
        topLevelReads += 1;
        if (topLevelReads === 2) {
          releaseTopLevelReads();
        }
        await bothTopLevelReads;
        return { ...state };
      },
      update: ({ data }: { data: Partial<typeof state> }) => {
        Object.assign(state, data);
        return Promise.resolve({ ...state });
      },
    };
    const transactionProduct = {
      findUnique: () => Promise.resolve({ ...state }),
      update: ({ data }: { data: Partial<typeof state> }) => {
        Object.assign(state, data);
        return Promise.resolve({ ...state });
      },
    };
    let transactionQueue = Promise.resolve();
    const transactionClient = {
      product: transactionProduct,
      $queryRaw: () => Promise.resolve([{ id: state.id }]),
    };
    const prisma = {
      product: topLevelProduct,
      $transaction: <T>(
        callback: (client: typeof transactionClient) => Promise<T>,
      ) => {
        const result = transactionQueue.then(() => callback(transactionClient));
        transactionQueue = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    };
    const service = new ProductsService(prisma as never);

    const results = await Promise.allSettled([
      service.update(state.id, { isActive: true }),
      service.update(state.id, { pointsCost: 0 }),
    ]);

    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    expect(state.isActive && state.pointsCost === 0).toBe(false);
  });
});

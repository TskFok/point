import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiApp } from '../src/common/http/configure-api-app';
import { classifyOrderDatabaseConflict } from '../src/orders/orders.service';
import { PrismaService } from '../src/prisma/prisma.service';

const defaultTestDatabaseUrl =
  'postgresql://point:point@localhost:5433/point_test';
const userId = 'task8-concurrency-student';
const adminId = 'task8-concurrency-admin';
const imageKey = 'products/123e4567-e89b-42d3-a456-426614174000.png';

function assertAuthorizedTestDatabase(databaseUrl: string): void {
  const parsed = new URL(databaseUrl);
  if (
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    parsed.port !== '5433' ||
    parsed.pathname !== '/point_test'
  ) {
    throw new Error(
      'Task 8 并发 E2E 只允许使用 localhost:5433/point_test 测试数据库',
    );
  }
}

describe('订单资产并发', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let studentBearer: string;
  let adminBearer: string;
  let previousDatabaseUrl: string | undefined;
  let previousJwtSecret: string | undefined;
  let previousWebOrigin: string | undefined;

  async function cleanupDatabase(): Promise<void> {
    await prisma.pointLedger.deleteMany({
      where: { userId },
    });
    await prisma.order.deleteMany({
      where: {
        OR: [{ userId }, { productId: { startsWith: 'task8-concurrency-' } }],
      },
    });
    await prisma.product.deleteMany({
      where: { id: { startsWith: 'task8-concurrency-' } },
    });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: [userId, adminId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userId, adminId] } },
    });
  }

  async function login(username: string): Promise<string> {
    const response = await request(server)
      .post('/api/v1/auth/token')
      .send({ username, password: 'StrongPass123!' })
      .expect(201);
    return `Bearer ${
      (response.body as unknown as { accessToken: string }).accessToken
    }`;
  }

  async function createProduct(id: string, stock: number, pointsCost: number) {
    return prisma.product.create({
      data: {
        id,
        name: `Task 8 Concurrent ${id}`,
        description: 'Concurrent order reward',
        imageKey,
        stock,
        pointsCost,
        isActive: true,
      },
    });
  }

  function redeem(productId: string, key: string) {
    return request(server)
      .post('/api/v1/orders')
      .set('Authorization', studentBearer)
      .set('Idempotency-Key', key)
      .send({ productId });
  }

  function expectStableConcurrencyError(response: request.Response): void {
    const body = response.body as unknown as { code?: unknown };
    expect(['CONCURRENT_MODIFICATION', 'OUT_OF_STOCK']).toContain(body.code);
  }

  function expectStableTransitionError(response: request.Response): void {
    const body = response.body as unknown as { code?: unknown };
    expect(['CONCURRENT_MODIFICATION', 'ORDER_INVALID_STATUS']).toContain(
      body.code,
    );
  }

  async function countWaitingDatabaseLocks(): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>(
      Prisma.sql`
        SELECT COUNT(*)::integer AS "count"
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock'
      `,
    );
    return rows[0]?.count ?? 0;
  }

  beforeAll(async () => {
    previousDatabaseUrl = process.env.DATABASE_URL;
    previousJwtSecret = process.env.AUTH_JWT_SECRET;
    previousWebOrigin = process.env.WEB_ORIGIN;
    const testDatabaseUrl =
      process.env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl;
    assertAuthorizedTestDatabase(testDatabaseUrl);
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.AUTH_JWT_SECRET =
      'task8-concurrency-secret-at-least-thirty-two-bytes';
    process.env.WEB_ORIGIN = 'https://point-quest.example.test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApiApp(app, process.env.WEB_ORIGIN);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanupDatabase();
    const passwordHash = await hash('StrongPass123!', 4);
    await prisma.user.createMany({
      data: [
        {
          id: userId,
          username: 'task8_concurrency_student',
          passwordHash,
          role: 'STUDENT',
          pointsBalance: 200,
        },
        {
          id: adminId,
          username: 'task8_concurrency_admin',
          passwordHash,
          role: 'ADMIN',
        },
      ],
    });
    studentBearer = await login('task8_concurrency_student');
    adminBearer = await login('task8_concurrency_admin');
  });

  afterAll(async () => {
    try {
      await cleanupDatabase();
      await app.close();
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
      if (previousJwtSecret === undefined) {
        delete process.env.AUTH_JWT_SECRET;
      } else {
        process.env.AUTH_JWT_SECRET = previousJwtSecret;
      }
      if (previousWebOrigin === undefined) {
        delete process.env.WEB_ORIGIN;
      } else {
        process.env.WEB_ORIGIN = previousWebOrigin;
      }
    }
  });

  it('库存为一时两个兑换只有一个成功且资产不为负', async () => {
    const product = await createProduct('task8-concurrency-stock', 1, 80);
    const responses = await Promise.all([
      redeem(product.id, 'stock-race-a'),
      redeem(product.id, 'stock-race-b'),
    ]);
    expect(responses.filter(({ status }) => status === 201)).toHaveLength(1);
    expect(
      responses.every(({ status }) => status === 201 || status === 409),
    ).toBe(true);
    responses
      .filter(({ status }) => status === 409)
      .forEach(expectStableConcurrencyError);
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { stock: true },
      }),
    ).resolves.toEqual({ stock: 0 });
    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { pointsBalance: true },
      }),
    ).resolves.toEqual({ pointsBalance: 120 });
    expect(
      await prisma.order.count({
        where: { userId, productId: product.id },
      }),
    ).toBe(1);
    expect(
      await prisma.pointLedger.count({
        where: { userId, type: 'ORDER_REDEEM' },
      }),
    ).toBe(1);
  });

  it('相同幂等键并发兑换返回同一个订单且只扣减一次', async () => {
    const product = await createProduct('task8-concurrency-idempotency', 2, 80);
    const responses = await Promise.all([
      redeem(product.id, 'same-race-key'),
      redeem(product.id, 'same-race-key'),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    const ids = responses.map(
      ({ body }) => (body as unknown as { id: string }).id,
    );
    expect(new Set(ids).size).toBe(1);
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { stock: true },
      }),
    ).resolves.toEqual({ stock: 1 });
    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { pointsBalance: true },
      }),
    ).resolves.toEqual({ pointsBalance: 120 });
    expect(
      await prisma.pointLedger.count({
        where: { userId, type: 'ORDER_REDEEM' },
      }),
    ).toBe(1);
  });

  it('两个并发取消只有一次退款和库存回补', async () => {
    const product = await createProduct('task8-concurrency-cancel', 1, 80);
    const order = (await redeem(product.id, 'cancel-race-create').expect(201))
      .body as unknown as { id: string };
    const responses = await Promise.all([
      request(server)
        .post(`/api/v1/admin/orders/${order.id}/cancel`)
        .set('Authorization', adminBearer),
      request(server)
        .post(`/api/v1/admin/orders/${order.id}/cancel`)
        .set('Authorization', adminBearer),
    ]);
    expect(responses.filter(({ status }) => status === 201)).toHaveLength(1);
    expect(
      responses.every(({ status }) => status === 201 || status === 409),
    ).toBe(true);
    responses
      .filter(({ status }) => status === 409)
      .forEach(expectStableTransitionError);
    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { pointsBalance: true },
      }),
    ).resolves.toEqual({ pointsBalance: 200 });
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { stock: true },
      }),
    ).resolves.toEqual({ stock: 1 });
    expect(
      await prisma.pointLedger.count({
        where: { orderId: order.id, type: 'ORDER_REFUND' },
      }),
    ).toBe(1);
    const savedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: {
        status: true,
        updatedBy: true,
        cancelledAt: true,
        completedAt: true,
      },
    });
    expect(savedOrder).toMatchObject({
      status: 'CANCELLED',
      updatedBy: adminId,
      completedAt: null,
    });
    expect(savedOrder.cancelledAt).toBeInstanceOf(Date);
  });

  it('精确识别 Prisma PostgreSQL 适配器实际暴露的 40P01 死锁', async () => {
    const product = await createProduct(
      'task8-concurrency-driver-deadlock',
      1,
      80,
    );
    let confirmProductLocked!: () => void;
    let confirmUserLocked!: () => void;
    const productLocked = new Promise<void>((resolve) => {
      confirmProductLocked = resolve;
    });
    const userLocked = new Promise<void>((resolve) => {
      confirmUserLocked = resolve;
    });

    const productThenUser = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${product.id} FOR UPDATE`,
        );
        confirmProductLocked();
        await userLocked;
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`,
        );
      },
      { maxWait: 5_000, timeout: 10_000 },
    );
    const userThenProduct = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`,
        );
        confirmUserLocked();
        await productLocked;
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${product.id} FOR UPDATE`,
        );
      },
      { maxWait: 5_000, timeout: 10_000 },
    );

    const results = await Promise.allSettled([
      productThenUser,
      userThenProduct,
    ]);
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejected).toHaveLength(1);
    expect(classifyOrderDatabaseConflict(rejected[0].reason)).toBe('DEADLOCK');
  });

  it('兑换与取消交叉并发不暴露死锁错误且资产按成功操作守恒', async () => {
    const product = await createProduct('task8-concurrency-cross', 2, 80);
    const firstOrder = (
      await redeem(product.id, 'cross-first-order').expect(201)
    ).body as unknown as { id: string };

    let releaseProductLock!: () => void;
    let confirmProductLock!: () => void;
    const productLocked = new Promise<void>((resolve) => {
      confirmProductLock = resolve;
    });
    const releaseLock = new Promise<void>((resolve) => {
      releaseProductLock = resolve;
    });
    const blocker = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`
            SELECT "id"
            FROM "Product"
            WHERE "id" = ${product.id}
            FOR UPDATE
          `,
        );
        confirmProductLock();
        await releaseLock;
      },
      { maxWait: 5_000, timeout: 10_000 },
    );
    await productLocked;

    const redeemRequest = redeem(product.id, 'cross-second-order').then(
      (response) => response,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await countWaitingDatabaseLocks()).toBeGreaterThanOrEqual(1);
    const cancelRequest = request(server)
      .post(`/api/v1/admin/orders/${firstOrder.id}/cancel`)
      .set('Authorization', adminBearer)
      .then((response) => response);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await countWaitingDatabaseLocks()).toBeGreaterThanOrEqual(2);
    releaseProductLock();

    const [redeemResponse, cancelResponse] = await Promise.all([
      redeemRequest,
      cancelRequest,
    ]);
    await blocker;
    expect([201, 409]).toContain(redeemResponse.status);
    expect([201, 409]).toContain(cancelResponse.status);
    expect(redeemResponse.status).not.toBe(500);
    expect(cancelResponse.status).not.toBe(500);
    if (redeemResponse.status === 409) {
      expectStableConcurrencyError(redeemResponse);
    }
    if (cancelResponse.status === 409) {
      expectStableTransitionError(cancelResponse);
    }

    const successfulRedeems = redeemResponse.status === 201 ? 1 : 0;
    const successfulCancels = cancelResponse.status === 201 ? 1 : 0;
    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { pointsBalance: true },
      }),
    ).resolves.toEqual({
      pointsBalance: 120 - successfulRedeems * 80 + successfulCancels * 80,
    });
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { stock: true },
      }),
    ).resolves.toEqual({
      stock: 1 - successfulRedeems + successfulCancels,
    });
    expect(
      await prisma.order.count({
        where: { userId, productId: product.id },
      }),
    ).toBe(1 + successfulRedeems);
    expect(
      await prisma.pointLedger.count({
        where: { orderId: firstOrder.id, type: 'ORDER_REFUND' },
      }),
    ).toBe(successfulCancels);
  });

  it('完成与取消竞态只有一个终态且资产符合胜出操作', async () => {
    const product = await createProduct(
      'task8-concurrency-complete-cancel',
      1,
      80,
    );
    const order = (
      await redeem(product.id, 'complete-cancel-create').expect(201)
    ).body as unknown as { id: string };
    const responses = await Promise.all([
      request(server)
        .post(`/api/v1/admin/orders/${order.id}/complete`)
        .set('Authorization', adminBearer),
      request(server)
        .post(`/api/v1/admin/orders/${order.id}/cancel`)
        .set('Authorization', adminBearer),
    ]);
    expect(responses.filter(({ status }) => status === 201)).toHaveLength(1);
    expect(
      responses.every(({ status }) => status === 201 || status === 409),
    ).toBe(true);
    responses
      .filter(({ status }) => status === 409)
      .forEach(expectStableTransitionError);

    const saved = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: {
        status: true,
        completedAt: true,
        cancelledAt: true,
        updatedBy: true,
      },
    });
    expect(saved.updatedBy).toBe(adminId);
    if (saved.status === 'COMPLETED') {
      expect(saved.completedAt).toBeInstanceOf(Date);
      expect(saved.cancelledAt).toBeNull();
      await expect(
        prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { pointsBalance: true },
        }),
      ).resolves.toEqual({ pointsBalance: 120 });
      await expect(
        prisma.product.findUniqueOrThrow({
          where: { id: product.id },
          select: { stock: true },
        }),
      ).resolves.toEqual({ stock: 0 });
    } else {
      expect(saved.status).toBe('CANCELLED');
      expect(saved.cancelledAt).toBeInstanceOf(Date);
      expect(saved.completedAt).toBeNull();
      await expect(
        prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { pointsBalance: true },
        }),
      ).resolves.toEqual({ pointsBalance: 200 });
      await expect(
        prisma.product.findUniqueOrThrow({
          where: { id: product.id },
          select: { stock: true },
        }),
      ).resolves.toEqual({ stock: 1 });
    }
  });
});

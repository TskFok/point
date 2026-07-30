import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiApp } from '../src/common/http/configure-api-app';
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
});

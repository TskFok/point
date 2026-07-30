import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiApp } from '../src/common/http/configure-api-app';
import { PrismaService } from '../src/prisma/prisma.service';

const webOrigin = 'https://point-quest.example.test';
const jwtSecret = 'point-quest-orders-e2e-secret-at-least-32-bytes';
const defaultTestDatabaseUrl =
  'postgresql://point:point@localhost:5433/point_test';
const adminId = 'task8-admin';
const studentId = 'task8-student';
const otherStudentId = 'task8-other-student';
const imageKey = 'products/123e4567-e89b-42d3-a456-426614174000.png';

type ApiErrorBody = {
  code: string;
  message: string;
  requestId: string;
  details: Record<string, unknown>;
};

type OrderBody = {
  id: string;
  orderNo: string;
  userId: string;
  productId: string;
  productNameSnapshot: string;
  productImageKeySnapshot: string;
  pointsCostSnapshot: number;
  status: 'PENDING_PICKUP' | 'COMPLETED' | 'CANCELLED';
  balance: number;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  updatedBy: string | null;
  user?: { id: string; username: string };
};

function assertAuthorizedTestDatabase(databaseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('Task 8 E2E 数据库 URL 无效');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    parsed.port !== '5433' ||
    parsed.pathname !== '/point_test' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error(
      'Task 8 E2E 只允许使用 localhost:5433/point_test 测试数据库',
    );
  }
}

function expectErrorContract(response: request.Response, code: string): void {
  const body = response.body as unknown as ApiErrorBody;
  expect(Object.keys(body).sort()).toEqual(
    ['code', 'details', 'message', 'requestId'].sort(),
  );
  expect(body.code).toBe(code);
  expect(body.message).toEqual(expect.any(String));
  expect(body.details).toEqual(expect.any(Object));
  expect(body.requestId).toEqual(expect.any(String));
  expect(response.headers['x-request-id']).toBe(body.requestId);
}

describe('兑换订单 API', () => {
  let app: INestApplication | undefined;
  let server: Parameters<typeof request>[0] | undefined;
  let prisma: PrismaService | undefined;
  let previousDatabaseUrl: string | undefined;
  let previousJwtSecret: string | undefined;
  let previousWebOrigin: string | undefined;
  let adminBearer: string;
  let studentBearer: string;
  let otherStudentBearer: string;

  function requireServer(): Parameters<typeof request>[0] {
    if (!server) {
      throw new Error('Task 8 E2E HTTP 服务尚未初始化');
    }
    return server;
  }

  function requirePrisma(): PrismaService {
    if (!prisma) {
      throw new Error('Task 8 E2E Prisma 尚未初始化');
    }
    return prisma;
  }

  async function cleanupDatabase(): Promise<void> {
    if (!prisma) {
      return;
    }
    await prisma.pointLedger.deleteMany({
      where: { userId: { in: [studentId, otherStudentId] } },
    });
    await prisma.order.deleteMany({
      where: {
        OR: [
          { userId: { in: [studentId, otherStudentId] } },
          { productId: { startsWith: 'task8-' } },
        ],
      },
    });
    await prisma.product.deleteMany({
      where: { id: { startsWith: 'task8-' } },
    });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: [adminId, studentId, otherStudentId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminId, studentId, otherStudentId] } },
    });
  }

  async function login(username: string): Promise<string> {
    const response = await request(requireServer())
      .post('/api/v1/auth/token')
      .send({ username, password: 'StrongPass123!' })
      .expect(201);
    return `Bearer ${
      (response.body as unknown as { accessToken: string }).accessToken
    }`;
  }

  async function createProduct(
    id: string,
    overrides: Partial<{
      name: string;
      stock: number;
      pointsCost: number;
      isActive: boolean;
    }> = {},
  ) {
    return requirePrisma().product.create({
      data: {
        id,
        name: overrides.name ?? `Task 8 Product ${id}`,
        description: 'Order test reward',
        imageKey,
        stock: overrides.stock ?? 2,
        pointsCost: overrides.pointsCost ?? 80,
        isActive: overrides.isActive ?? true,
      },
    });
  }

  function redeem(productId: string, key: string, bearer = studentBearer) {
    return request(requireServer())
      .post('/api/v1/orders')
      .set('Authorization', bearer)
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
    process.env.AUTH_JWT_SECRET = jwtSecret;
    process.env.WEB_ORIGIN = webOrigin;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApiApp(app, webOrigin);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanupDatabase();
    const passwordHash = await hash('StrongPass123!', 4);
    await requirePrisma().user.createMany({
      data: [
        {
          id: adminId,
          username: 'task8_admin',
          passwordHash,
          role: 'ADMIN',
        },
        {
          id: studentId,
          username: 'task8_student',
          passwordHash,
          role: 'STUDENT',
          pointsBalance: 100,
        },
        {
          id: otherStudentId,
          username: 'task8_student_similar',
          passwordHash,
          role: 'STUDENT',
          pointsBalance: 100,
        },
      ],
    });
    adminBearer = await login('task8_admin');
    studentBearer = await login('task8_student');
    otherStudentBearer = await login('task8_student_similar');
  });

  afterAll(async () => {
    try {
      await cleanupDatabase();
      if (app) {
        await app.close();
      }
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

  it('兑换原子扣减积分和库存并创建快照订单，幂等重放返回原余额', async () => {
    const product = await createProduct('task8-redeem', {
      name: 'Task 8 Vocabulary Badge',
      stock: 1,
      pointsCost: 80,
    });

    const created = await redeem(product.id, 'redeem-1').expect(201);
    const order = created.body as unknown as OrderBody;
    expect(order).toMatchObject({
      userId: studentId,
      productId: product.id,
      productNameSnapshot: product.name,
      productImageKeySnapshot: product.imageKey,
      pointsCostSnapshot: 80,
      status: 'PENDING_PICKUP',
      balance: 20,
      completedAt: null,
      cancelledAt: null,
      updatedBy: null,
    });
    expect(order.orderNo).toMatch(/^PQ-[A-Z0-9]{26}$/);

    await requirePrisma().user.update({
      where: { id: studentId },
      data: { pointsBalance: 45 },
    });
    await requirePrisma().product.update({
      where: { id: product.id },
      data: { name: 'Changed', imageKey, isActive: false },
    });

    const replay = await redeem(product.id, 'redeem-1').expect(201);
    expect(replay.body).toEqual(created.body);
    expect(
      await requirePrisma().order.count({
        where: { userId: studentId, idempotencyKey: 'redeem-1' },
      }),
    ).toBe(1);
    expect(
      await requirePrisma().pointLedger.count({
        where: { orderId: order.id, type: 'ORDER_REDEEM' },
      }),
    ).toBe(1);
    await expect(
      requirePrisma().product.findUniqueOrThrow({
        where: { id: product.id },
        select: { stock: true },
      }),
    ).resolves.toEqual({ stock: 0 });
  });

  it.each([
    [
      '积分不足',
      'task8-insufficient',
      { stock: 1, pointsCost: 101, isActive: true },
      'INSUFFICIENT_POINTS',
    ],
    [
      '库存不足',
      'task8-out-of-stock',
      { stock: 0, pointsCost: 80, isActive: true },
      'OUT_OF_STOCK',
    ],
    [
      '商品下架',
      'task8-inactive',
      { stock: 1, pointsCost: 80, isActive: false },
      'PRODUCT_INACTIVE',
    ],
  ])('%s时回滚全部资产写入', async (_name, id, values, code) => {
    const product = await createProduct(id, values);
    await redeem(product.id, `${id}-key`)
      .expect(409)
      .expect((response) => {
        expectErrorContract(response, code);
      });

    await expect(
      requirePrisma().user.findUniqueOrThrow({
        where: { id: studentId },
        select: { pointsBalance: true },
      }),
    ).resolves.toEqual({ pointsBalance: 100 });
    await expect(
      requirePrisma().product.findUniqueOrThrow({
        where: { id: product.id },
        select: { stock: true },
      }),
    ).resolves.toEqual({ stock: values.stock });
    expect(
      await requirePrisma().order.count({
        where: { userId: studentId, productId: product.id },
      }),
    ).toBe(0);
    expect(
      await requirePrisma().pointLedger.count({
        where: { userId: studentId, type: 'ORDER_REDEEM' },
      }),
    ).toBe(0);
  });

  it('同一幂等键不能兑换不同商品，且不会额外扣减', async () => {
    const first = await createProduct('task8-idempotent-a', {
      stock: 1,
      pointsCost: 20,
    });
    const second = await createProduct('task8-idempotent-b', {
      stock: 1,
      pointsCost: 30,
    });
    await redeem(first.id, 'shared-redeem-key').expect(201);
    await redeem(second.id, 'shared-redeem-key')
      .expect(409)
      .expect((response) => {
        expectErrorContract(response, 'IDEMPOTENCY_CONFLICT');
      });
    await expect(
      requirePrisma().user.findUniqueOrThrow({
        where: { id: studentId },
        select: { pointsBalance: true },
      }),
    ).resolves.toEqual({ pointsBalance: 80 });
    await expect(
      requirePrisma().product.findUniqueOrThrow({
        where: { id: second.id },
        select: { stock: true },
      }),
    ).resolves.toEqual({ stock: 1 });
  });

  it('缺失或越界幂等键和非法商品 ID 返回稳定参数错误', async () => {
    await request(requireServer())
      .post('/api/v1/orders')
      .set('Authorization', studentBearer)
      .send({ productId: 'task8-any' })
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });
    await redeem('task8-any', 'k'.repeat(129))
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });
    await redeem('   ', 'valid-key')
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });
  });

  it('学员列表与详情始终隔离用户，越权详情伪装为不存在', async () => {
    const ownProduct = await createProduct('task8-own', {
      stock: 1,
      pointsCost: 20,
    });
    const otherProduct = await createProduct('task8-other', {
      stock: 1,
      pointsCost: 30,
    });
    const own = (await redeem(ownProduct.id, 'own-order').expect(201))
      .body as unknown as OrderBody;
    const other = (
      await redeem(otherProduct.id, 'other-order', otherStudentBearer).expect(
        201,
      )
    ).body as unknown as OrderBody;

    const list = await request(requireServer())
      .get('/api/v1/orders?page=1&pageSize=20')
      .set('Authorization', studentBearer)
      .expect(200);
    expect(
      (list.body as unknown as { data: OrderBody[] }).data.map(({ id }) => id),
    ).toEqual([own.id]);
    await request(requireServer())
      .get(`/api/v1/orders/${own.id}`)
      .set('Authorization', studentBearer)
      .expect(200);
    await request(requireServer())
      .get(`/api/v1/orders/${other.id}`)
      .set('Authorization', studentBearer)
      .expect(404)
      .expect((response) => {
        expectErrorContract(response, 'ORDER_NOT_FOUND');
      });
  });

  it('管理员按精确用户名、订单号、状态和包含日期边界筛选并稳定分页', async () => {
    const firstProduct = await createProduct('task8-filter-a', {
      stock: 1,
      pointsCost: 10,
    });
    const secondProduct = await createProduct('task8-filter-b', {
      stock: 1,
      pointsCost: 10,
    });
    const first = (await redeem(firstProduct.id, 'filter-a').expect(201))
      .body as unknown as OrderBody;
    const second = (
      await redeem(secondProduct.id, 'filter-b', otherStudentBearer).expect(201)
    ).body as unknown as OrderBody;
    const boundary = new Date('2026-07-15T08:30:00.000Z');
    await requirePrisma().order.update({
      where: { id: first.id },
      data: { createdAt: boundary },
    });
    await requirePrisma().order.update({
      where: { id: second.id },
      data: { createdAt: new Date('2026-07-16T08:30:00.000Z') },
    });

    const filtered = await request(requireServer())
      .get('/api/v1/admin/orders')
      .query({
        username: 'task8_student',
        orderNo: first.orderNo,
        status: 'PENDING_PICKUP',
        createdFrom: boundary.toISOString(),
        createdTo: boundary.toISOString(),
        page: 1,
        pageSize: 1,
      })
      .set('Authorization', adminBearer)
      .expect(200);
    const body = filtered.body as unknown as {
      data: OrderBody[];
      meta: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
    };
    expect(body.meta).toEqual({
      page: 1,
      pageSize: 1,
      total: 1,
      totalPages: 1,
    });
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: first.id,
      user: { id: studentId, username: 'task8_student' },
    });

    await request(requireServer())
      .get(`/api/v1/admin/orders/${first.id}`)
      .set('Authorization', adminBearer)
      .expect(200)
      .expect(({ body: detail }) => {
        expect(detail).toMatchObject({
          id: first.id,
          user: { id: studentId, username: 'task8_student' },
        });
      });
  });

  it.each([
    ['仅日期', '2026-07-15'],
    ['无时区时间', '2026-07-15T08:30:00'],
  ])('管理员订单筛选拒绝%s输入', async (_name, value) => {
    await request(requireServer())
      .get('/api/v1/admin/orders')
      .query({ createdFrom: value })
      .set('Authorization', adminBearer)
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });
  });

  it('管理员订单日期筛选接受带偏移时区的完整时间点', async () => {
    const product = await createProduct('task8-timezone-filter', {
      stock: 1,
      pointsCost: 10,
    });
    const order = (
      await redeem(product.id, 'timezone-filter-order').expect(201)
    ).body as unknown as OrderBody;
    const boundary = new Date('2026-07-15T08:30:00.000Z');
    await requirePrisma().order.update({
      where: { id: order.id },
      data: { createdAt: boundary },
    });

    const response = await request(requireServer())
      .get('/api/v1/admin/orders')
      .query({
        createdFrom: '2026-07-15T16:30:00+08:00',
        createdTo: '2026-07-15T16:30:00.000+08:00',
      })
      .set('Authorization', adminBearer)
      .expect(200);
    expect(
      (response.body as unknown as { data: OrderBody[] }).data.map(
        ({ id }) => id,
      ),
    ).toContain(order.id);
  });

  it('管理员完成订单写入同一操作人和时间，完成后不可取消', async () => {
    const product = await createProduct('task8-complete', {
      stock: 1,
      pointsCost: 20,
    });
    const order = (await redeem(product.id, 'complete-order').expect(201))
      .body as unknown as OrderBody;
    const completed = await request(requireServer())
      .post(`/api/v1/admin/orders/${order.id}/complete`)
      .set('Authorization', adminBearer)
      .expect(201);
    const completedBody = completed.body as unknown as OrderBody;
    expect(completedBody).toMatchObject({
      id: order.id,
      status: 'COMPLETED',
      cancelledAt: null,
      updatedBy: adminId,
    });
    expect(typeof completedBody.completedAt).toBe('string');
    await expect(
      requirePrisma().order.findUniqueOrThrow({
        where: { id: order.id },
        select: {
          status: true,
          completedAt: true,
          cancelledAt: true,
          updatedBy: true,
        },
      }),
    ).resolves.toEqual({
      status: 'COMPLETED',
      completedAt: new Date(completedBody.completedAt as string),
      cancelledAt: null,
      updatedBy: adminId,
    });
    await request(requireServer())
      .post(`/api/v1/admin/orders/${order.id}/cancel`)
      .set('Authorization', adminBearer)
      .expect(409)
      .expect((response) => {
        expectErrorContract(response, 'ORDER_INVALID_STATUS');
      });
    await expect(
      requirePrisma().user.findUniqueOrThrow({
        where: { id: studentId },
        select: { pointsBalance: true },
      }),
    ).resolves.toEqual({ pointsBalance: 80 });
  });

  it('管理员取消待领取订单仅退款一次并回补库存', async () => {
    const product = await createProduct('task8-cancel', {
      stock: 1,
      pointsCost: 80,
    });
    const order = (await redeem(product.id, 'cancel-order').expect(201))
      .body as unknown as OrderBody;
    const cancelled = await request(requireServer())
      .post(`/api/v1/admin/orders/${order.id}/cancel`)
      .set('Authorization', adminBearer)
      .expect(201);
    const cancelledBody = cancelled.body as unknown as OrderBody;
    expect(cancelledBody).toMatchObject({
      id: order.id,
      status: 'CANCELLED',
      completedAt: null,
      updatedBy: adminId,
    });
    expect(typeof cancelledBody.cancelledAt).toBe('string');
    await request(requireServer())
      .post(`/api/v1/admin/orders/${order.id}/cancel`)
      .set('Authorization', adminBearer)
      .expect(409)
      .expect((response) => {
        expectErrorContract(response, 'ORDER_INVALID_STATUS');
      });
    await expect(
      requirePrisma().user.findUniqueOrThrow({
        where: { id: studentId },
        select: { pointsBalance: true },
      }),
    ).resolves.toEqual({ pointsBalance: 100 });
    await expect(
      requirePrisma().product.findUniqueOrThrow({
        where: { id: product.id },
        select: { stock: true },
      }),
    ).resolves.toEqual({ stock: 1 });
    expect(
      await requirePrisma().pointLedger.count({
        where: { orderId: order.id, type: 'ORDER_REFUND' },
      }),
    ).toBe(1);
  });

  it('退款会使余额溢出时回滚状态、库存与流水', async () => {
    const product = await createProduct('task8-refund-overflow', {
      stock: 1,
      pointsCost: 80,
    });
    const order = (await redeem(product.id, 'refund-overflow').expect(201))
      .body as unknown as OrderBody;
    await requirePrisma().user.update({
      where: { id: studentId },
      data: { pointsBalance: 2_147_483_647 },
    });

    await request(requireServer())
      .post(`/api/v1/admin/orders/${order.id}/cancel`)
      .set('Authorization', adminBearer)
      .expect(409)
      .expect((response) => {
        expectErrorContract(response, 'CONCURRENT_MODIFICATION');
      });
    await expect(
      requirePrisma().order.findUniqueOrThrow({
        where: { id: order.id },
        select: {
          status: true,
          cancelledAt: true,
          updatedBy: true,
        },
      }),
    ).resolves.toEqual({
      status: 'PENDING_PICKUP',
      cancelledAt: null,
      updatedBy: null,
    });
    await expect(
      requirePrisma().product.findUniqueOrThrow({
        where: { id: product.id },
        select: { stock: true },
      }),
    ).resolves.toEqual({ stock: 0 });
    expect(
      await requirePrisma().pointLedger.count({
        where: { orderId: order.id, type: 'ORDER_REFUND' },
      }),
    ).toBe(0);
  });

  it('不存在的商品与管理员订单详情返回稳定不存在错误', async () => {
    await redeem('task8-missing-product', 'missing-product')
      .expect(404)
      .expect((response) => {
        expectErrorContract(response, 'PRODUCT_NOT_FOUND');
      });
    await request(requireServer())
      .get('/api/v1/admin/orders/task8-missing-order')
      .set('Authorization', adminBearer)
      .expect(404)
      .expect((response) => {
        expectErrorContract(response, 'ORDER_NOT_FOUND');
      });
  });

  it('角色不能跨越学员与管理员订单接口', async () => {
    await request(requireServer())
      .get('/api/v1/admin/orders')
      .set('Authorization', studentBearer)
      .expect(403)
      .expect((response) => {
        expectErrorContract(response, 'FORBIDDEN');
      });
    await request(requireServer())
      .get('/api/v1/orders')
      .set('Authorization', adminBearer)
      .expect(403)
      .expect((response) => {
        expectErrorContract(response, 'FORBIDDEN');
      });
  });
});

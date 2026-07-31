import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { asiaShanghaiDayRange } from '../src/admin/admin-dashboard.service';
import { AppModule } from '../src/app.module';
import { configureApiApp } from '../src/common/http/configure-api-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { createE2eRunId } from './e2e-run-id';

const defaultTestDatabaseUrl =
  'postgresql://point:point@localhost:5433/point_test';
const configuredWebOrigin = 'https://point-quest.example.test';
const testJwtSecret = 'point-quest-dashboard-e2e-secret-at-least-32-bytes';
const testRunId = createE2eRunId();
const adminId = `dashboard-admin-${testRunId}`;
const studentId = `dashboard-student-${testRunId}`;
const adminUsername = `dashboard_admin_${testRunId}`;
const studentUsername = `dashboard_student_${testRunId}`;
const questionIds = [
  `dashboard-question-a-${testRunId}`,
  `dashboard-question-b-${testRunId}`,
];
const optionIds = [
  `dashboard-option-a-${testRunId}`,
  `dashboard-option-b-${testRunId}`,
];
const productIds = [
  `dashboard-product-a-${testRunId}`,
  `dashboard-product-b-${testRunId}`,
];
const orderIds = [
  `dashboard-order-a-${testRunId}`,
  `dashboard-order-b-${testRunId}`,
];
const pointConfigIds = [
  `dashboard-config-a-${testRunId}`,
  `dashboard-config-b-${testRunId}`,
  `dashboard-config-c-${testRunId}`,
];

type DashboardBody = {
  activeQuestionCount: number;
  todayAnswerCount: number;
  pendingOrderCount: number;
  activeProductCount: number;
};

function assertAuthorizedTestDatabase(databaseUrl: string): void {
  const parsed = new URL(databaseUrl);
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    parsed.port !== '5433' ||
    parsed.pathname !== '/point_test' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error(
      '管理员概览 E2E 只允许使用 localhost:5433/point_test 测试数据库',
    );
  }
}

describe('管理员运营概览与倍率历史 API', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;
  let adminBearer: string;
  let studentBearer: string;

  async function cleanup(): Promise<void> {
    await prisma.pointLedger.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.answerAttempt.deleteMany({
      where: { questionId: { in: questionIds } },
    });
    await prisma.questionProgress.deleteMany({
      where: { questionId: { in: questionIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.questionOption.deleteMany({
      where: { questionId: { in: questionIds } },
    });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.pointConfig.deleteMany({
      where: { id: { in: pointConfigIds } },
    });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: [adminId, studentId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminId, studentId] } },
    });
  }

  beforeAll(async () => {
    const testDatabaseUrl =
      process.env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl;
    assertAuthorizedTestDatabase(testDatabaseUrl);
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.AUTH_JWT_SECRET = testJwtSecret;
    process.env.WEB_ORIGIN = configuredWebOrigin;
    process.env.NODE_ENV = 'test';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApiApp(app, configuredWebOrigin);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);

    await cleanup();
    const passwordHash = await hash('StrongPass123!', 4);
    await prisma.user.createMany({
      data: [
        {
          id: adminId,
          username: adminUsername,
          passwordHash,
          role: 'ADMIN',
        },
        {
          id: studentId,
          username: studentUsername,
          passwordHash,
          role: 'STUDENT',
        },
      ],
    });
    const adminLogin = await request(server)
      .post('/api/v1/auth/token')
      .send({ username: adminUsername, password: 'StrongPass123!' })
      .expect(201);
    const studentLogin = await request(server)
      .post('/api/v1/auth/token')
      .send({ username: studentUsername, password: 'StrongPass123!' })
      .expect(201);
    adminBearer = `Bearer ${
      (adminLogin.body as { accessToken: string }).accessToken
    }`;
    studentBearer = `Bearer ${
      (studentLogin.body as { accessToken: string }).accessToken
    }`;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('仅管理员可读取两个运营接口', async () => {
    for (const path of [
      '/api/v1/admin/dashboard',
      '/api/v1/admin/points/config/history',
    ]) {
      await request(server).get(path).expect(401);
      await request(server)
        .get(path)
        .set('Authorization', studentBearer)
        .expect(403);
      await request(server)
        .get(path)
        .set('Authorization', adminBearer)
        .expect(200);
    }
  });

  it('按 Asia/Shanghai 今日左闭右开边界统计四项指标', async () => {
    const baselineResponse = await request(server)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', adminBearer)
      .expect(200);
    const baseline = baselineResponse.body as DashboardBody;
    const { start, end } = asiaShanghaiDayRange(new Date());

    await prisma.question.createMany({
      data: [
        {
          id: questionIds[0],
          stem: 'Active dashboard question',
          explanation: 'Dashboard boundary fixture',
          basePoints: 10,
          isActive: true,
          createdBy: adminId,
        },
        {
          id: questionIds[1],
          stem: 'Inactive dashboard question',
          explanation: 'Dashboard boundary fixture',
          basePoints: 10,
          isActive: false,
          createdBy: adminId,
        },
      ],
    });
    await prisma.questionOption.createMany({
      data: [
        {
          id: optionIds[0],
          questionId: questionIds[0],
          label: 'A',
          content: 'is',
          position: 0,
          isCorrect: true,
        },
        {
          id: optionIds[1],
          questionId: questionIds[0],
          label: 'B',
          content: 'are',
          position: 1,
          isCorrect: false,
        },
      ],
    });
    await prisma.answerAttempt.createMany({
      data: [
        {
          id: `dashboard-attempt-start-${testRunId}`,
          userId: studentId,
          questionId: questionIds[0],
          selectedOptionId: optionIds[0],
          mode: 'FIRST_ATTEMPT',
          isCorrect: true,
          basePointsSnapshot: 10,
          multiplierSnapshot: 1,
          pointsAwarded: 10,
          balanceAfterSnapshot: 10,
          errorCountSnapshot: 0,
          idempotencyKey: `dashboard-start-${testRunId}`,
          createdAt: start,
        },
        {
          id: `dashboard-attempt-end-before-${testRunId}`,
          userId: studentId,
          questionId: questionIds[0],
          selectedOptionId: optionIds[0],
          mode: 'WRONG_RETRY',
          isCorrect: true,
          basePointsSnapshot: 10,
          multiplierSnapshot: 1,
          pointsAwarded: 0,
          balanceAfterSnapshot: 10,
          errorCountSnapshot: 1,
          idempotencyKey: `dashboard-end-before-${testRunId}`,
          createdAt: new Date(end.getTime() - 1),
        },
        {
          id: `dashboard-attempt-end-${testRunId}`,
          userId: studentId,
          questionId: questionIds[0],
          selectedOptionId: optionIds[0],
          mode: 'WRONG_RETRY',
          isCorrect: true,
          basePointsSnapshot: 10,
          multiplierSnapshot: 1,
          pointsAwarded: 0,
          balanceAfterSnapshot: 10,
          errorCountSnapshot: 1,
          idempotencyKey: `dashboard-end-${testRunId}`,
          createdAt: end,
        },
      ],
    });
    await prisma.product.createMany({
      data: [
        {
          id: productIds[0],
          name: 'Active dashboard product',
          description: 'Dashboard fixture',
          imageKey: `products/${testRunId}-active.png`,
          stock: 2,
          pointsCost: 20,
          isActive: true,
        },
        {
          id: productIds[1],
          name: 'Inactive dashboard product',
          description: 'Dashboard fixture',
          imageKey: `products/${testRunId}-inactive.png`,
          stock: 2,
          pointsCost: 20,
          isActive: false,
        },
      ],
    });
    await prisma.order.createMany({
      data: [
        {
          id: orderIds[0],
          orderNo: `PQ-DASH-PENDING-${testRunId}`,
          userId: studentId,
          productId: productIds[0],
          productNameSnapshot: 'Active dashboard product',
          productImageKeySnapshot: `products/${testRunId}-active.png`,
          pointsCostSnapshot: 20,
          status: 'PENDING_PICKUP',
          idempotencyKey: `dashboard-order-pending-${testRunId}`,
        },
        {
          id: orderIds[1],
          orderNo: `PQ-DASH-DONE-${testRunId}`,
          userId: studentId,
          productId: productIds[0],
          productNameSnapshot: 'Active dashboard product',
          productImageKeySnapshot: `products/${testRunId}-active.png`,
          pointsCostSnapshot: 20,
          status: 'COMPLETED',
          idempotencyKey: `dashboard-order-done-${testRunId}`,
          completedAt: new Date(),
          updatedBy: adminId,
        },
      ],
    });

    const response = await request(server)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', adminBearer)
      .expect(200);

    expect(response.body).toEqual({
      activeQuestionCount: baseline.activeQuestionCount + 1,
      todayAnswerCount: baseline.todayAnswerCount + 2,
      pendingOrderCount: baseline.pendingOrderCount + 1,
      activeProductCount: baseline.activeProductCount + 1,
    });
  });

  it('倍率历史稳定倒序分页并拒绝非法分页', async () => {
    const createdAt = new Date('2099-01-01T00:00:00.000Z');
    await prisma.pointConfig.createMany({
      data: [
        {
          id: pointConfigIds[0],
          multiplier: 2,
          updatedBy: adminId,
          createdAt,
        },
        {
          id: pointConfigIds[1],
          multiplier: 3,
          updatedBy: adminId,
          createdAt,
        },
        {
          id: pointConfigIds[2],
          multiplier: 4,
          updatedBy: adminId,
          createdAt: new Date('2098-12-31T23:59:59.000Z'),
        },
      ],
    });

    const response = await request(server)
      .get('/api/v1/admin/points/config/history?page=1&pageSize=2')
      .set('Authorization', adminBearer)
      .expect(200);

    expect(
      (response.body as { data: Array<{ id: string }> }).data.map(
        ({ id }) => id,
      ),
    ).toEqual([pointConfigIds[1], pointConfigIds[0]]);
    expect(response.body).toMatchObject({
      meta: {
        page: 1,
        pageSize: 2,
      },
    });
    await request(server)
      .get('/api/v1/admin/points/config/history?page=0&pageSize=20')
      .set('Authorization', adminBearer)
      .expect(400);
    await request(server)
      .get('/api/v1/admin/points/config/history?page=1&pageSize=101')
      .set('Authorization', adminBearer)
      .expect(400);
  });
});

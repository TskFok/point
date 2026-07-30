import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiApp } from '../src/common/http/configure-api-app';
import { PrismaService } from '../src/prisma/prisma.service';

const configuredWebOrigin = 'https://point-quest.example.test';
const testJwtSecret = 'point-quest-question-e2e-secret-at-least-32-bytes';
const adminId = 'task4-admin';
const studentId = 'task4-student';
const defaultTestDatabaseUrl =
  'postgresql://point:point@localhost:5433/point_test';

type ApiErrorBody = {
  code: string;
  message: string;
  requestId: string;
  details: Record<string, unknown>;
};

type QuestionBody = {
  id: string;
  stem: string;
  explanation: string;
  basePoints: number;
  isActive: boolean;
  createdBy: string;
  options: Array<{
    id: string;
    label: string;
    content: string;
    position: number;
    isCorrect: boolean;
  }>;
};

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

function validQuestionOptions() {
  return [
    {
      label: 'A',
      content: 'is',
      position: 0,
      isCorrect: true,
    },
    {
      label: 'B',
      content: 'are',
      position: 1,
      isCorrect: false,
    },
  ];
}

function validQuestion(overrides: Record<string, unknown> = {}) {
  return {
    stem: 'Choose the correct form.',
    explanation: 'Only one form agrees with the subject.',
    basePoints: 10,
    options: validQuestionOptions(),
    ...overrides,
  };
}

const explicitNullWriteCases: Array<{
  field: string;
  payload: () => Record<string, unknown>;
}> = [
  { field: 'stem', payload: () => ({ stem: null }) },
  { field: 'explanation', payload: () => ({ explanation: null }) },
  { field: 'basePoints', payload: () => ({ basePoints: null }) },
  { field: 'isActive', payload: () => ({ isActive: null }) },
  { field: 'options', payload: () => ({ options: null }) },
  {
    field: 'options[0].label',
    payload: () => ({
      options: [
        { ...validQuestionOptions()[0], label: null },
        validQuestionOptions()[1],
      ],
    }),
  },
  {
    field: 'options[0].content',
    payload: () => ({
      options: [
        { ...validQuestionOptions()[0], content: null },
        validQuestionOptions()[1],
      ],
    }),
  },
  {
    field: 'options[0].position',
    payload: () => ({
      options: [
        { ...validQuestionOptions()[0], position: null },
        validQuestionOptions()[1],
      ],
    }),
  },
  {
    field: 'options[0].isCorrect',
    payload: () => ({
      options: [
        { ...validQuestionOptions()[0], isCorrect: null },
        validQuestionOptions()[1],
      ],
    }),
  },
];

function assertAuthorizedTestDatabase(databaseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('Task 4 E2E 数据库 URL 无效');
  }
  const isPostgresProtocol = ['postgres:', 'postgresql:'].includes(
    parsed.protocol,
  );
  const isAuthorizedHost = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (
    !isPostgresProtocol ||
    !isAuthorizedHost ||
    parsed.port !== '5433' ||
    parsed.pathname !== '/point_test' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error(
      'Task 4 E2E 只允许使用 localhost:5433/point_test 测试数据库',
    );
  }
}

const invalidTestDatabaseUrls = [
  ['错误协议', 'mysql://point:point@localhost:5433/point_test'],
  ['hash', `${defaultTestDatabaseUrl}#unsafe`],
  ['query', `${defaultTestDatabaseUrl}?host=remote.example&port=5432`],
  ['IPv6', 'postgresql://point:point@[::1]:5433/point_test'],
  ['编码 host', 'postgresql://point:point@%6cocalhost:5433/point_test'],
  ['编码 path', 'postgresql://point:point@localhost:5433/%70oint_test'],
  ['非 5433 端口', 'postgresql://point:point@localhost:5432/point_test'],
  ['非 point_test 数据库', 'postgresql://point:point@localhost:5433/point'],
] as const;

describe('Task 4 E2E 数据库安全边界', () => {
  it.each(invalidTestDatabaseUrls)('拒绝%s', (_name, databaseUrl) => {
    expect(() => assertAuthorizedTestDatabase(databaseUrl)).toThrow();
  });

  it.each([
    defaultTestDatabaseUrl,
    'postgresql://point:point@127.0.0.1:5433/point_test',
  ])('允许已授权数据库 %s', (databaseUrl) => {
    expect(() => assertAuthorizedTestDatabase(databaseUrl)).not.toThrow();
  });
});

describe('管理员题库与积分倍率 API', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;
  let adminBearer: string;
  let studentBearer: string;

  async function cleanup(): Promise<void> {
    const taskQuestionIds = (
      await prisma.question.findMany({
        where: { createdBy: adminId },
        select: { id: true },
      })
    ).map(({ id }) => id);
    await prisma.answerAttempt.deleteMany({
      where: {
        OR: [{ userId: studentId }, { questionId: { in: taskQuestionIds } }],
      },
    });
    await prisma.questionProgress.deleteMany({
      where: {
        OR: [{ userId: studentId }, { questionId: { in: taskQuestionIds } }],
      },
    });
    await prisma.questionOption.deleteMany({
      where: { questionId: { in: taskQuestionIds } },
    });
    await prisma.question.deleteMany({ where: { createdBy: adminId } });
    await prisma.pointConfig.deleteMany({ where: { updatedBy: adminId } });
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
  });

  beforeEach(async () => {
    await cleanup();
    const passwordHash = await hash('StrongPass123!', 4);
    await prisma.user.createMany({
      data: [
        {
          id: adminId,
          username: 'task4_admin',
          passwordHash,
          role: 'ADMIN',
        },
        {
          id: studentId,
          username: 'task4_student',
          passwordHash,
          role: 'STUDENT',
        },
      ],
    });

    const adminLogin = await request(server)
      .post('/api/v1/auth/token')
      .send({ username: 'task4_admin', password: 'StrongPass123!' })
      .expect(201);
    const studentLogin = await request(server)
      .post('/api/v1/auth/token')
      .send({ username: 'task4_student', password: 'StrongPass123!' })
      .expect(201);
    adminBearer = `Bearer ${
      (adminLogin.body as unknown as { accessToken: string }).accessToken
    }`;
    studentBearer = `Bearer ${
      (studentLogin.body as unknown as { accessToken: string }).accessToken
    }`;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('拒绝没有唯一正确选项、重复标识和空白文本的题目', async () => {
    await request(server)
      .post('/api/v1/admin/questions')
      .set('Authorization', adminBearer)
      .send(
        validQuestion({
          options: [
            {
              label: 'A',
              content: 'is',
              position: 0,
              isCorrect: true,
            },
            {
              label: 'B',
              content: 'are',
              position: 1,
              isCorrect: true,
            },
          ],
        }),
      )
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });

    await request(server)
      .post('/api/v1/admin/questions')
      .set('Authorization', adminBearer)
      .send(
        validQuestion({
          options: [
            {
              label: 'A',
              content: 'is',
              position: 0,
              isCorrect: false,
            },
            {
              label: 'A',
              content: 'are',
              position: 0,
              isCorrect: false,
            },
          ],
        }),
      )
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });

    await request(server)
      .post('/api/v1/admin/questions')
      .set('Authorization', adminBearer)
      .send(validQuestion({ stem: '   ' }))
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });
  });

  it.each(explicitNullWriteCases)(
    '创建题目时显式 null 字段 $field 返回稳定 400',
    async ({ payload }) => {
      await request(server)
        .post('/api/v1/admin/questions')
        .set('Authorization', adminBearer)
        .send(validQuestion(payload()))
        .expect(400)
        .expect((response) => {
          expectErrorContract(response, 'VALIDATION_FAILED');
        });
    },
  );

  it.each(explicitNullWriteCases)(
    '更新题目时显式 null 字段 $field 返回稳定 400',
    async ({ payload }) => {
      const createResponse = await request(server)
        .post('/api/v1/admin/questions')
        .set('Authorization', adminBearer)
        .send(validQuestion())
        .expect(201);
      const question = createResponse.body as unknown as QuestionBody;

      await request(server)
        .patch(`/api/v1/admin/questions/${question.id}`)
        .set('Authorization', adminBearer)
        .send(payload())
        .expect(400)
        .expect((response) => {
          expectErrorContract(response, 'VALIDATION_FAILED');
        });
    },
  );

  it('创建和更新题目时仍允许合法省略可选字段', async () => {
    const createResponse = await request(server)
      .post('/api/v1/admin/questions')
      .set('Authorization', adminBearer)
      .send(validQuestion())
      .expect(201);
    const question = createResponse.body as unknown as QuestionBody;
    expect(question.isActive).toBe(true);

    await request(server)
      .patch(`/api/v1/admin/questions/${question.id}`)
      .set('Authorization', adminBearer)
      .send({ explanation: 'Updated explanation only.' })
      .expect(200)
      .expect(({ body }) => {
        expect(body as unknown as QuestionBody).toMatchObject({
          id: question.id,
          stem: question.stem,
          explanation: 'Updated explanation only.',
          basePoints: question.basePoints,
        });
      });
  });

  it('学员访问管理题库时返回稳定 403，且不存在 DELETE 接口', async () => {
    await request(server)
      .get('/api/v1/admin/questions')
      .set('Authorization', studentBearer)
      .expect(403)
      .expect((response) => {
        expectErrorContract(response, 'FORBIDDEN');
      });

    await request(server)
      .delete('/api/v1/admin/questions/not-a-question')
      .set('Authorization', adminBearer)
      .expect(404);
  });

  it('创建、分页筛选、读取并原子替换未作答题目的全部选项', async () => {
    const firstCreate = await request(server)
      .post('/api/v1/admin/questions')
      .set('Authorization', adminBearer)
      .send(validQuestion({ stem: '  Present simple question  ' }))
      .expect(201);
    const first = firstCreate.body as unknown as QuestionBody;
    expect(first).toMatchObject({
      stem: 'Present simple question',
      explanation: 'Only one form agrees with the subject.',
      basePoints: 10,
      isActive: true,
      createdBy: adminId,
    });
    expect(first.options).toHaveLength(2);
    expect(first.options.map((option) => option.isCorrect)).toEqual([
      true,
      false,
    ]);

    await request(server)
      .post('/api/v1/admin/questions')
      .set('Authorization', adminBearer)
      .send(validQuestion({ stem: 'Past tense question', isActive: false }))
      .expect(201);

    const listResponse = await request(server)
      .get('/api/v1/admin/questions')
      .query({
        search: 'present',
        isActive: true,
        page: 1,
        pageSize: 1,
      })
      .set('Authorization', adminBearer)
      .expect(200);
    expect(listResponse.body).toMatchObject({
      meta: {
        page: 1,
        pageSize: 1,
        total: 1,
        totalPages: 1,
      },
    });
    expect(
      (listResponse.body as unknown as { data: QuestionBody[] }).data,
    ).toHaveLength(1);
    expect(
      (listResponse.body as unknown as { data: QuestionBody[] }).data[0].id,
    ).toBe(first.id);

    await request(server)
      .get(`/api/v1/admin/questions/${first.id}`)
      .set('Authorization', adminBearer)
      .expect(200)
      .expect(({ body }) => {
        expect((body as unknown as QuestionBody).id).toBe(first.id);
      });

    const patchResponse = await request(server)
      .patch(`/api/v1/admin/questions/${first.id}`)
      .set('Authorization', adminBearer)
      .send({
        stem: '  Updated present simple question  ',
        basePoints: 25,
        options: [
          {
            label: 'A',
            content: 'have',
            position: 0,
            isCorrect: false,
          },
          {
            label: 'B',
            content: 'has',
            position: 1,
            isCorrect: true,
          },
          {
            label: 'C',
            content: 'having',
            position: 2,
            isCorrect: false,
          },
        ],
      })
      .expect(200);
    const patched = patchResponse.body as unknown as QuestionBody;
    expect(patched).toMatchObject({
      id: first.id,
      stem: 'Updated present simple question',
      basePoints: 25,
    });
    expect(
      patched.options.map(({ label, isCorrect }) => [label, isCorrect]),
    ).toEqual([
      ['A', false],
      ['B', true],
      ['C', false],
    ]);
    expect(
      await prisma.questionOption.count({ where: { questionId: first.id } }),
    ).toBe(3);
  });

  it('已有答题记录的题目只允许停用，内容修改和重新启用返回稳定冲突', async () => {
    const createResponse = await request(server)
      .post('/api/v1/admin/questions')
      .set('Authorization', adminBearer)
      .send(validQuestion())
      .expect(201);
    const question = createResponse.body as unknown as QuestionBody;
    await prisma.answerAttempt.create({
      data: {
        id: 'task4-attempt',
        userId: studentId,
        questionId: question.id,
        selectedOptionId: question.options[0].id,
        mode: 'FIRST_ATTEMPT',
        isCorrect: true,
        basePointsSnapshot: question.basePoints,
        multiplierSnapshot: 1,
        pointsAwarded: question.basePoints,
        idempotencyKey: 'task4-answer',
      },
    });

    await request(server)
      .patch(`/api/v1/admin/questions/${question.id}`)
      .set('Authorization', adminBearer)
      .send({ stem: 'Changed after use' })
      .expect(409)
      .expect((response) => {
        expectErrorContract(response, 'QUESTION_HAS_ATTEMPTS');
      });

    await request(server)
      .patch(`/api/v1/admin/questions/${question.id}`)
      .set('Authorization', adminBearer)
      .send({ isActive: false, basePoints: 99 })
      .expect(409)
      .expect((response) => {
        expectErrorContract(response, 'QUESTION_HAS_ATTEMPTS');
      });

    await request(server)
      .patch(`/api/v1/admin/questions/${question.id}`)
      .set('Authorization', adminBearer)
      .send({ isActive: false })
      .expect(200)
      .expect(({ body }) => {
        expect((body as unknown as QuestionBody).isActive).toBe(false);
      });

    await request(server)
      .patch(`/api/v1/admin/questions/${question.id}`)
      .set('Authorization', adminBearer)
      .send({ isActive: true })
      .expect(409)
      .expect((response) => {
        expectErrorContract(response, 'QUESTION_HAS_ATTEMPTS');
      });
  });

  it('并发答题先持有外键锁时内容更新等待提交并按已有记录拒绝', async () => {
    const createResponse = await request(server)
      .post('/api/v1/admin/questions')
      .set('Authorization', adminBearer)
      .send(validQuestion())
      .expect(201);
    const question = createResponse.body as unknown as QuestionBody;

    let releaseAttempt!: () => void;
    let markAttemptInserted!: () => void;
    const holdAttempt = new Promise<void>((resolve) => {
      releaseAttempt = resolve;
    });
    const attemptInserted = new Promise<void>((resolve) => {
      markAttemptInserted = resolve;
    });
    const answerTransaction = prisma.$transaction(
      async (tx) => {
        await tx.answerAttempt.create({
          data: {
            id: 'task4-race-attempt',
            userId: studentId,
            questionId: question.id,
            selectedOptionId: question.options[0].id,
            mode: 'FIRST_ATTEMPT',
            isCorrect: true,
            basePointsSnapshot: question.basePoints,
            multiplierSnapshot: 1,
            pointsAwarded: question.basePoints,
            idempotencyKey: 'task4-race-answer',
          },
        });
        markAttemptInserted();
        await holdAttempt;
      },
      { maxWait: 2000, timeout: 3000 },
    );
    await attemptInserted;

    const patchRequest = request(server)
      .patch(`/api/v1/admin/questions/${question.id}`)
      .set('Authorization', adminBearer)
      .send({ stem: 'Must not change after the concurrent answer' })
      .timeout({ response: 2000, deadline: 3000 });
    const patchResponse = patchRequest.then((response) => response);
    try {
      const earlyResponse = await Promise.race([
        patchResponse,
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 200);
        }),
      ]);
      expect(earlyResponse).toBeNull();
    } finally {
      releaseAttempt();
      await answerTransaction;
    }

    const response = await patchResponse;
    expect(response.status).toBe(409);
    expectErrorContract(response, 'QUESTION_HAS_ATTEMPTS');
    expect(
      await prisma.question.findUniqueOrThrow({
        where: { id: question.id },
        select: { stem: true },
      }),
    ).toEqual({ stem: 'Choose the correct form.' });
  });

  it('不存在的题目读取和更新返回稳定未找到错误', async () => {
    await request(server)
      .get('/api/v1/admin/questions/task4-missing')
      .set('Authorization', adminBearer)
      .expect(404)
      .expect((response) => {
        expectErrorContract(response, 'QUESTION_NOT_FOUND');
      });

    await request(server)
      .patch('/api/v1/admin/questions/task4-missing')
      .set('Authorization', adminBearer)
      .send({ isActive: false })
      .expect(404)
      .expect((response) => {
        expectErrorContract(response, 'QUESTION_NOT_FOUND');
      });
  });

  it('倍率仅接受整数 1–10，读取默认值并追加新配置', async () => {
    await request(server)
      .put('/api/v1/admin/points/config')
      .set('Authorization', adminBearer)
      .send({ multiplier: 0 })
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });
    await request(server)
      .put('/api/v1/admin/points/config')
      .set('Authorization', adminBearer)
      .send({ multiplier: 11 })
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });
    await request(server)
      .put('/api/v1/admin/points/config')
      .set('Authorization', adminBearer)
      .send({ multiplier: 1.5 })
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });

    await request(server)
      .get('/api/v1/admin/points/config')
      .set('Authorization', adminBearer)
      .expect(200, {
        multiplier: 1,
        id: null,
        updatedBy: null,
        createdAt: null,
        updater: null,
      });

    await request(server)
      .put('/api/v1/admin/points/config')
      .set('Authorization', adminBearer)
      .send({ multiplier: 3 })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          multiplier: 3,
          updatedBy: adminId,
          updater: { id: adminId, username: 'task4_admin' },
        });
      });
    await request(server)
      .put('/api/v1/admin/points/config')
      .set('Authorization', adminBearer)
      .send({ multiplier: 5 })
      .expect(200);

    await request(server)
      .get('/api/v1/admin/points/config')
      .set('Authorization', adminBearer)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          multiplier: 5,
          updatedBy: adminId,
          updater: { id: adminId, username: 'task4_admin' },
        });
      });
    expect(
      await prisma.pointConfig.count({ where: { updatedBy: adminId } }),
    ).toBe(2);
  });
});

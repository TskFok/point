import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiApp } from '../src/common/http/configure-api-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { createE2eRunId } from './e2e-run-id';

const configuredWebOrigin = 'https://point-quest.example.test';
const testJwtSecret = 'point-quest-practice-e2e-secret-at-least-32-bytes';
const testRunId = createE2eRunId();
const adminId = `task5-admin-${testRunId}`;
const studentId = `task5-student-${testRunId}`;
const otherStudentId = `task5-other-student-${testRunId}`;
const adminUsername = `task5_admin_${testRunId}`;
const studentUsername = `task5_student_${testRunId}`;
const otherStudentUsername = `task5_other_${testRunId}`;
const defaultTestDatabaseUrl =
  'postgresql://point:point@localhost:5433/point_test';

type ApiErrorBody = {
  code: string;
  message: string;
  requestId: string;
  details: Record<string, unknown>;
};

type AnswerResultBody = {
  correct: boolean;
  selectedOptionId: string;
  correctOptionId: string;
  explanation: string;
  errorCount: number;
  pointsAwarded: number;
  balance: number;
};

type QuestionFixture = {
  id: string;
  correctOptionId: string;
  wrongOptionId: string;
};

function assertAuthorizedTestDatabase(databaseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('Task 5 E2E 数据库 URL 无效');
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
      'Task 5 E2E 只允许使用 localhost:5433/point_test 测试数据库',
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

describe('Task 5 E2E 数据库安全边界', () => {
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

describe('随机首次答题与积分 API', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;
  let adminBearer: string;
  let studentBearer: string;
  let questionSequence = 0;

  async function cleanup(): Promise<void> {
    const taskQuestionIds = (
      await prisma.question.findMany({
        where: { createdBy: adminId },
        select: { id: true },
      })
    ).map(({ id }) => id);
    await prisma.pointLedger.deleteMany({
      where: {
        OR: [
          { userId: { in: [studentId, otherStudentId] } },
          { answerAttempt: { questionId: { in: taskQuestionIds } } },
        ],
      },
    });
    await prisma.answerAttempt.deleteMany({
      where: {
        OR: [
          { userId: { in: [studentId, otherStudentId] } },
          { questionId: { in: taskQuestionIds } },
        ],
      },
    });
    await prisma.questionProgress.deleteMany({
      where: {
        OR: [
          { userId: { in: [studentId, otherStudentId] } },
          { questionId: { in: taskQuestionIds } },
        ],
      },
    });
    await prisma.questionOption.deleteMany({
      where: { questionId: { in: taskQuestionIds } },
    });
    await prisma.question.deleteMany({ where: { createdBy: adminId } });
    await prisma.pointConfig.deleteMany({ where: { updatedBy: adminId } });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: [adminId, studentId, otherStudentId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminId, studentId, otherStudentId] } },
    });
  }

  async function createQuestion(
    options: {
      basePoints?: number;
      isActive?: boolean;
    } = {},
  ): Promise<QuestionFixture> {
    questionSequence += 1;
    const id = `task5-question-${testRunId}-${questionSequence}`;
    const correctOptionId = `${id}-correct`;
    const wrongOptionId = `${id}-wrong`;
    await prisma.question.create({
      data: {
        id,
        stem: `Task 5 question ${questionSequence}`,
        explanation: `Task 5 explanation ${questionSequence}`,
        basePoints: options.basePoints ?? 10,
        isActive: options.isActive ?? true,
        createdBy: adminId,
        options: {
          createMany: {
            data: [
              {
                id: correctOptionId,
                label: 'A',
                content: 'Correct answer',
                position: 0,
                isCorrect: true,
              },
              {
                id: wrongOptionId,
                label: 'B',
                content: 'Wrong answer',
                position: 1,
                isCorrect: false,
              },
            ],
          },
        },
      },
    });
    return { id, correctOptionId, wrongOptionId };
  }

  async function setMultiplier(multiplier: number): Promise<void> {
    await prisma.pointConfig.create({
      data: { multiplier, updatedBy: adminId },
    });
  }

  async function answer(
    questionId: string,
    selectedOptionId: string,
    idempotencyKey: string,
  ): Promise<AnswerResultBody> {
    const response = await request(server)
      .post(`/api/v1/practice/questions/${questionId}/answer`)
      .set('Authorization', studentBearer)
      .set('Idempotency-Key', idempotencyKey)
      .send({ selectedOptionId })
      .expect(201);
    const body: unknown = response.body;
    return body as AnswerResultBody;
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
    questionSequence = 0;
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
        {
          id: otherStudentId,
          username: otherStudentUsername,
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

  it('随机接口只返回未答启用题目且不泄露答案或解析', async () => {
    const question = await createQuestion();
    await createQuestion({ isActive: false });

    const response = await request(server)
      .get('/api/v1/practice/random')
      .set('Authorization', studentBearer)
      .expect(200);

    expect(response.body).toMatchObject({
      id: question.id,
      stem: 'Task 5 question 1',
      basePoints: 10,
      options: [
        {
          id: question.correctOptionId,
          label: 'A',
          content: 'Correct answer',
          position: 0,
        },
        {
          id: question.wrongOptionId,
          label: 'B',
          content: 'Wrong answer',
          position: 1,
        },
      ],
    });
    expect(response.body).not.toHaveProperty('explanation');
    for (const option of (response.body as { options: object[] }).options) {
      expect(option).not.toHaveProperty('isCorrect');
    }

    await request(server)
      .get('/api/v1/practice/random')
      .query({ excludeIds: question.id })
      .set('Authorization', studentBearer)
      .expect(404)
      .expect((notFoundResponse) => {
        expectErrorContract(notFoundResponse, 'NO_UNANSWERED_QUESTIONS');
      });
  });

  it('首次答对按当前倍率奖励且同键重放保持完整原始结果', async () => {
    await setMultiplier(2);
    const firstQuestion = await createQuestion({ basePoints: 10 });
    const first = await answer(
      firstQuestion.id,
      firstQuestion.correctOptionId,
      'answer-key-correct',
    );
    expect(first).toEqual({
      correct: true,
      selectedOptionId: firstQuestion.correctOptionId,
      correctOptionId: firstQuestion.correctOptionId,
      explanation: 'Task 5 explanation 1',
      errorCount: 0,
      pointsAwarded: 20,
      balance: 20,
    });

    await setMultiplier(1);
    const laterQuestion = await createQuestion({ basePoints: 10 });
    await answer(
      laterQuestion.id,
      laterQuestion.correctOptionId,
      'answer-key-later-correct',
    );

    const duplicate = await answer(
      firstQuestion.id,
      firstQuestion.correctOptionId,
      'answer-key-correct',
    );
    expect(duplicate).toEqual(first);
    expect(
      await prisma.pointLedger.count({
        where: {
          answerAttempt: {
            userId: studentId,
            questionId: firstQuestion.id,
          },
          type: 'ANSWER_REWARD',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.answerAttempt.findUniqueOrThrow({
        where: {
          userId_idempotencyKey: {
            userId: studentId,
            idempotencyKey: 'answer-key-correct',
          },
        },
        select: {
          basePointsSnapshot: true,
          multiplierSnapshot: true,
          pointsAwarded: true,
        },
      }),
    ).toMatchObject({
      basePointsSnapshot: 10,
      multiplierSnapshot: 2,
      pointsAwarded: 20,
    });
  });

  it('首次答错不奖励，并在余额变化后以原键重放原始余额', async () => {
    const wrongQuestion = await createQuestion({ basePoints: 15 });
    const firstWrong = await answer(
      wrongQuestion.id,
      wrongQuestion.wrongOptionId,
      'answer-key-wrong',
    );
    expect(firstWrong).toEqual({
      correct: false,
      selectedOptionId: wrongQuestion.wrongOptionId,
      correctOptionId: wrongQuestion.correctOptionId,
      explanation: 'Task 5 explanation 1',
      errorCount: 1,
      pointsAwarded: 0,
      balance: 0,
    });

    const rewardQuestion = await createQuestion({ basePoints: 10 });
    await answer(
      rewardQuestion.id,
      rewardQuestion.correctOptionId,
      'answer-key-after-wrong',
    );

    const duplicate = await answer(
      wrongQuestion.id,
      wrongQuestion.wrongOptionId,
      'answer-key-wrong',
    );
    expect(duplicate).toEqual(firstWrong);
    expect(
      await prisma.pointLedger.count({
        where: {
          answerAttempt: {
            userId: studentId,
            questionId: wrongQuestion.id,
          },
        },
      }),
    ).toBe(0);
    expect(
      await prisma.questionProgress.findUniqueOrThrow({
        where: {
          userId_questionId: {
            userId: studentId,
            questionId: wrongQuestion.id,
          },
        },
        select: {
          firstCorrect: true,
          errorCount: true,
          masteredAt: true,
        },
      }),
    ).toEqual({
      firstCorrect: false,
      errorCount: 1,
      masteredAt: null,
    });

    await request(server)
      .post(`/api/v1/practice/questions/${wrongQuestion.id}/answer`)
      .set('Authorization', studentBearer)
      .set('Idempotency-Key', 'answer-key-wrong-different')
      .send({ selectedOptionId: wrongQuestion.wrongOptionId })
      .expect(409)
      .expect((response) => {
        expectErrorContract(response, 'QUESTION_ALREADY_ANSWERED');
      });
  });

  it('同一用户复用幂等键提交不同题目或选项返回冲突', async () => {
    const firstQuestion = await createQuestion();
    const secondQuestion = await createQuestion();
    await answer(
      firstQuestion.id,
      firstQuestion.correctOptionId,
      'answer-key-conflict',
    );

    await request(server)
      .post(`/api/v1/practice/questions/${firstQuestion.id}/answer`)
      .set('Authorization', studentBearer)
      .set('Idempotency-Key', 'answer-key-conflict')
      .send({ selectedOptionId: firstQuestion.wrongOptionId })
      .expect(409)
      .expect((response) => {
        expectErrorContract(response, 'IDEMPOTENCY_CONFLICT');
      });

    await request(server)
      .post(`/api/v1/practice/questions/${secondQuestion.id}/answer`)
      .set('Authorization', studentBearer)
      .set('Idempotency-Key', 'answer-key-conflict')
      .send({ selectedOptionId: secondQuestion.correctOptionId })
      .expect(409)
      .expect((response) => {
        expectErrorContract(response, 'IDEMPOTENCY_CONFLICT');
      });
  });

  it('数据库拒绝负数答题余额快照', async () => {
    const question = await createQuestion();
    await expect(
      prisma.answerAttempt.create({
        data: {
          userId: studentId,
          questionId: question.id,
          selectedOptionId: question.wrongOptionId,
          mode: 'FIRST_ATTEMPT',
          isCorrect: false,
          basePointsSnapshot: 10,
          multiplierSnapshot: 1,
          pointsAwarded: 0,
          balanceAfterSnapshot: -1,
          errorCountSnapshot: 1,
          idempotencyKey: 'negative-balance-snapshot',
        },
      }),
    ).rejects.toBeDefined();
    expect(
      await prisma.answerAttempt.count({
        where: {
          userId: studentId,
          idempotencyKey: 'negative-balance-snapshot',
        },
      }),
    ).toBe(0);
  });

  it('校验幂等键、答案和随机排除列表边界', async () => {
    const question = await createQuestion();

    await request(server)
      .post(`/api/v1/practice/questions/${question.id}/answer`)
      .set('Authorization', studentBearer)
      .send({ selectedOptionId: question.correctOptionId })
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });

    await request(server)
      .post(`/api/v1/practice/questions/${question.id}/answer`)
      .set('Authorization', studentBearer)
      .set('Idempotency-Key', '   ')
      .send({ selectedOptionId: question.correctOptionId })
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });

    await request(server)
      .post(`/api/v1/practice/questions/${question.id}/answer`)
      .set('Authorization', studentBearer)
      .set('Idempotency-Key', 'k'.repeat(129))
      .send({ selectedOptionId: question.correctOptionId })
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });

    await request(server)
      .post(`/api/v1/practice/questions/${question.id}/answer`)
      .set('Authorization', studentBearer)
      .set('Idempotency-Key', 'answer-key-missing-option')
      .send({})
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });

    await request(server)
      .get('/api/v1/practice/random')
      .query({
        excludeIds: Array.from(
          { length: 51 },
          (_, index) => `question-${index}`,
        ).join(','),
      })
      .set('Authorization', studentBearer)
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });

    await request(server)
      .get('/api/v1/points/ledger')
      .query({ page: 100_001 })
      .set('Authorization', studentBearer)
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });

    await request(server)
      .get('/api/v1/points/ledger')
      .query({ pageSize: 101 })
      .set('Authorization', studentBearer)
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });
  });

  it('练习和个人积分接口只允许学员访问', async () => {
    await request(server)
      .get('/api/v1/practice/random')
      .set('Authorization', adminBearer)
      .expect(403)
      .expect((response) => {
        expectErrorContract(response, 'FORBIDDEN');
      });

    await request(server)
      .get('/api/v1/practice/summary')
      .set('Authorization', adminBearer)
      .expect(403)
      .expect((response) => {
        expectErrorContract(response, 'FORBIDDEN');
      });

    await request(server)
      .get('/api/v1/points/balance')
      .set('Authorization', adminBearer)
      .expect(403)
      .expect((response) => {
        expectErrorContract(response, 'FORBIDDEN');
      });

    await request(server)
      .get('/api/v1/points/ledger')
      .set('Authorization', adminBearer)
      .expect(403)
      .expect((response) => {
        expectErrorContract(response, 'FORBIDDEN');
      });
  });

  it('汇总和积分流水稳定分页且仅返回当前学员资产', async () => {
    const firstCorrect = await createQuestion({ basePoints: 10 });
    const pendingWrong = await createQuestion();
    const masteredWrong = await createQuestion();
    await createQuestion();
    const inactive = await createQuestion({ isActive: false });

    await answer(
      firstCorrect.id,
      firstCorrect.correctOptionId,
      'summary-correct',
    );
    await answer(
      pendingWrong.id,
      pendingWrong.wrongOptionId,
      'summary-pending',
    );
    await answer(
      masteredWrong.id,
      masteredWrong.wrongOptionId,
      'summary-mastered',
    );
    await prisma.questionProgress.update({
      where: {
        userId_questionId: {
          userId: studentId,
          questionId: masteredWrong.id,
        },
      },
      data: { masteredAt: new Date('2026-07-30T00:00:00.000Z') },
    });
    await prisma.questionProgress.create({
      data: {
        userId: studentId,
        questionId: inactive.id,
        firstCorrect: false,
        errorCount: 1,
      },
    });
    await prisma.user.update({
      where: { id: otherStudentId },
      data: { pointsBalance: 99 },
    });

    await request(server)
      .get('/api/v1/practice/summary')
      .set('Authorization', studentBearer)
      .expect(200)
      .expect({
        activeTotal: 4,
        firstAnsweredCount: 3,
        unansweredCount: 1,
        pendingWrongCount: 1,
        masteredWrongCount: 1,
        balance: 10,
      });

    await request(server)
      .get('/api/v1/points/balance')
      .set('Authorization', studentBearer)
      .expect(200)
      .expect({ balance: 10 });

    const ledgerResponse = await request(server)
      .get('/api/v1/points/ledger')
      .query({ page: 1, pageSize: 1 })
      .set('Authorization', studentBearer)
      .expect(200);
    expect(ledgerResponse.body).toMatchObject({
      meta: {
        page: 1,
        pageSize: 1,
        total: 1,
        totalPages: 1,
      },
      data: [
        {
          userId: studentId,
          type: 'ANSWER_REWARD',
          delta: 10,
          balanceAfter: 10,
        },
      ],
    });
    expect(
      (ledgerResponse.body as { data: Array<{ userId: string }> }).data,
    ).toHaveLength(1);
  });
});

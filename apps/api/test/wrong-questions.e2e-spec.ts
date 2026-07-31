import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiApp } from '../src/common/http/configure-api-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { createE2eRunId } from './e2e-run-id';

const configuredWebOrigin = 'https://point-quest.example.test';
const testJwtSecret = 'point-quest-task6-e2e-secret-at-least-32-bytes';
const testRunId = createE2eRunId();
const adminId = `task6-admin-${testRunId}`;
const studentId = `task6-student-${testRunId}`;
const otherStudentId = `task6-other-student-${testRunId}`;
const adminUsername = `task6_admin_${testRunId}`;
const studentUsername = `task6_student_${testRunId}`;
const otherStudentUsername = `task6_other_student_${testRunId}`;
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

type WrongQuestionItem = {
  question: {
    id: string;
    stem: string;
    basePoints: number;
    options: Array<{
      id: string;
      label: string;
      content: string;
      position: number;
    }>;
  };
  errorCount: number;
  firstAnsweredAt: string;
  masteredAt: string | null;
};

type WrongQuestionListBody = {
  data: WrongQuestionItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type RequestBarrier = {
  bothArrived: Promise<void>;
  arrive: () => void;
  releasePromise: Promise<void>;
  release: () => void;
};

type CriticalSectionBarrier = {
  reached: Promise<void>;
  claim: () => boolean;
  releasePromise: Promise<void>;
  release: () => void;
};

let activeReplayBarrier: RequestBarrier | null = null;
let activeProgressLockBarrier: CriticalSectionBarrier | null = null;
let activeReplaySignal: CriticalSectionBarrier | null = null;

function createRequestBarrier(): RequestBarrier {
  let arrivals = 0;
  let markBothArrived!: () => void;
  let release!: () => void;
  const bothArrived = new Promise<void>((resolve) => {
    markBothArrived = resolve;
  });
  const releasePromise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    bothArrived,
    arrive: () => {
      arrivals += 1;
      if (arrivals === 2) {
        markBothArrived();
      }
    },
    releasePromise,
    release,
  };
}

function createCriticalSectionBarrier(): CriticalSectionBarrier {
  let claimed = false;
  let markReached!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => {
    markReached = resolve;
  });
  const releasePromise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    reached,
    claim: () => {
      if (claimed) {
        return false;
      }
      claimed = true;
      markReached();
      return true;
    },
    releasePromise,
    release,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function synchronizedTransactionClient(
  transaction: Prisma.TransactionClient,
): Prisma.TransactionClient {
  const originalFindUnique = transaction.answerAttempt.findUnique.bind(
    transaction.answerAttempt,
  );
  const synchronizedFindUnique = (async (
    args: Prisma.AnswerAttemptFindUniqueArgs,
  ) => {
    const result: unknown = await originalFindUnique(args);
    const signal = activeReplaySignal;
    if (signal?.claim()) {
      signal.release();
    }
    const barrier = activeReplayBarrier;
    if (barrier) {
      barrier.arrive();
      await barrier.releasePromise;
    }
    return result;
  }) as unknown as typeof transaction.answerAttempt.findUnique;
  const answerAttempt = new Proxy(transaction.answerAttempt, {
    get(target, property, receiver): unknown {
      if (property === 'findUnique') {
        return synchronizedFindUnique;
      }
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  const originalQueryRaw = transaction.$queryRaw.bind(transaction) as (
    ...args: unknown[]
  ) => Promise<unknown>;
  const synchronizedQueryRaw = async (...args: unknown[]) => {
    const result = await originalQueryRaw(...args);
    const rows = Array.isArray(result) ? result : [];
    const firstRow: unknown = rows[0];
    const barrier = activeProgressLockBarrier;
    if (
      barrier &&
      isRecord(firstRow) &&
      Object.hasOwn(firstRow, 'firstCorrect') &&
      barrier.claim()
    ) {
      await barrier.releasePromise;
    }
    return result;
  };
  return new Proxy(transaction, {
    get(target, property, receiver): unknown {
      if (property === 'answerAttempt') {
        return answerAttempt;
      }
      if (property === '$queryRaw') {
        return synchronizedQueryRaw;
      }
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

type InteractiveTransactionOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

type TransactionInput =
  | ((transaction: Prisma.TransactionClient) => Promise<unknown>)
  | Prisma.PrismaPromise<unknown>[];

type TransactionRunner = (
  input: TransactionInput,
  options?: InteractiveTransactionOptions,
) => Promise<unknown>;

function createSynchronizedPrismaService(): PrismaService {
  const service = new PrismaService();
  const originalTransaction = service.$transaction.bind(
    service,
  ) as unknown as TransactionRunner;
  const synchronizedTransaction: TransactionRunner = (input, options) => {
    if (
      Array.isArray(input) ||
      (!activeReplayBarrier &&
        !activeProgressLockBarrier &&
        !activeReplaySignal)
    ) {
      return originalTransaction(input, options);
    }
    return originalTransaction(
      (transaction) => input(synchronizedTransactionClient(transaction)),
      options,
    );
  };
  Object.defineProperty(service, '$transaction', {
    configurable: true,
    value: synchronizedTransaction,
  });
  return service;
}

async function withTimeout<T>(
  operation: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function assertAuthorizedTestDatabase(databaseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('Task 6 E2E 数据库 URL 无效');
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
      'Task 6 E2E 只允许使用 localhost:5433/point_test 测试数据库',
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

describe('错题列表与重练 API', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;
  let adminBearer: string;
  let studentBearer: string;
  let otherStudentBearer: string;
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

  async function createQuestion(): Promise<QuestionFixture> {
    questionSequence += 1;
    const id = `task6-question-${testRunId}-${questionSequence}`;
    const correctOptionId = `${id}-correct`;
    const wrongOptionId = `${id}-wrong`;
    await prisma.question.create({
      data: {
        id,
        stem: `Task 6 question ${questionSequence}`,
        explanation: `Task 6 explanation ${questionSequence}`,
        basePoints: 10 + questionSequence,
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

  function firstAnswer(
    bearer: string,
    questionId: string,
    selectedOptionId: string,
    idempotencyKey: string,
  ) {
    return request(server)
      .post(`/api/v1/practice/questions/${questionId}/answer`)
      .set('Authorization', bearer)
      .set('Idempotency-Key', idempotencyKey)
      .send({ selectedOptionId });
  }

  async function firstAnswerWrong(
    question: QuestionFixture,
    key: string,
    bearer = studentBearer,
  ): Promise<AnswerResultBody> {
    const response = await firstAnswer(
      bearer,
      question.id,
      question.wrongOptionId,
      key,
    ).expect(201);
    const body: unknown = response.body;
    return body as AnswerResultBody;
  }

  function retryRequest(
    questionId: string,
    selectedOptionId: string,
    idempotencyKey?: string,
  ) {
    const pending = request(server)
      .post(`/api/v1/practice/wrong-questions/${questionId}/answer`)
      .set('Authorization', studentBearer);
    if (idempotencyKey !== undefined) {
      pending.set('Idempotency-Key', idempotencyKey);
    }
    return pending.send({ selectedOptionId });
  }

  async function retryWrong(
    question: QuestionFixture,
    key: string,
  ): Promise<AnswerResultBody> {
    const response = await retryRequest(
      question.id,
      question.wrongOptionId,
      key,
    ).expect(201);
    const body: unknown = response.body;
    return body as AnswerResultBody;
  }

  async function listWrongQuestions(
    query: { page?: number; pageSize?: number } = {},
  ): Promise<WrongQuestionListBody> {
    const response = await request(server)
      .get('/api/v1/practice/wrong-questions')
      .query(query)
      .set('Authorization', studentBearer)
      .expect(200);
    const body: unknown = response.body;
    return body as WrongQuestionListBody;
  }

  beforeAll(async () => {
    const testDatabaseUrl =
      process.env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl;
    assertAuthorizedTestDatabase(testDatabaseUrl);
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.AUTH_JWT_SECRET = testJwtSecret;
    process.env.WEB_ORIGIN = configuredWebOrigin;
    process.env.NODE_ENV = 'test';

    const synchronizedPrisma = createSynchronizedPrismaService();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(synchronizedPrisma)
      .compile();
    app = moduleRef.createNestApplication();
    configureApiApp(app, configuredWebOrigin);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    activeReplayBarrier = null;
    activeProgressLockBarrier = null;
    activeReplaySignal = null;
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

    const [adminLogin, studentLogin, otherStudentLogin] = await Promise.all([
      request(server)
        .post('/api/v1/auth/token')
        .send({ username: adminUsername, password: 'StrongPass123!' })
        .expect(201),
      request(server)
        .post('/api/v1/auth/token')
        .send({ username: studentUsername, password: 'StrongPass123!' })
        .expect(201),
      request(server)
        .post('/api/v1/auth/token')
        .send({
          username: otherStudentUsername,
          password: 'StrongPass123!',
        })
        .expect(201),
    ]);
    adminBearer = `Bearer ${
      (adminLogin.body as unknown as { accessToken: string }).accessToken
    }`;
    studentBearer = `Bearer ${
      (studentLogin.body as unknown as { accessToken: string }).accessToken
    }`;
    otherStudentBearer = `Bearer ${
      (otherStudentLogin.body as unknown as { accessToken: string }).accessToken
    }`;
  });

  afterEach(() => {
    activeReplayBarrier?.release();
    activeReplayBarrier = null;
    activeProgressLockBarrier?.release();
    activeProgressLockBarrier = null;
    activeReplaySignal?.release();
    activeReplaySignal = null;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('只分页列出当前学员未掌握错题且不泄露答案与解析', async () => {
    const older = await createQuestion();
    const newer = await createQuestion();
    const otherStudentQuestion = await createQuestion();
    await firstAnswerWrong(older, 'task6-list-older');
    await firstAnswerWrong(newer, 'task6-list-newer');
    await firstAnswerWrong(
      otherStudentQuestion,
      'task6-list-other',
      otherStudentBearer,
    );
    await prisma.questionProgress.update({
      where: {
        userId_questionId: { userId: studentId, questionId: older.id },
      },
      data: { firstAnsweredAt: new Date('2026-01-01T00:00:00.000Z') },
    });
    await prisma.questionProgress.update({
      where: {
        userId_questionId: { userId: studentId, questionId: newer.id },
      },
      data: { firstAnsweredAt: new Date('2026-01-02T00:00:00.000Z') },
    });

    const firstPage = await listWrongQuestions({ page: 1, pageSize: 1 });
    expect(firstPage.meta).toEqual({
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(firstPage.data).toHaveLength(1);
    expect(firstPage.data[0]).toMatchObject({
      question: {
        id: newer.id,
        stem: 'Task 6 question 2',
        basePoints: 12,
        options: [
          {
            id: newer.correctOptionId,
            label: 'A',
            content: 'Correct answer',
            position: 0,
          },
          {
            id: newer.wrongOptionId,
            label: 'B',
            content: 'Wrong answer',
            position: 1,
          },
        ],
      },
      errorCount: 1,
      masteredAt: null,
    });
    expect(firstPage.data[0]?.firstAnsweredAt).toEqual(expect.any(String));
    expect(firstPage.data[0]?.question).not.toHaveProperty('explanation');
    expect(firstPage.data[0]?.question).not.toHaveProperty('correctOptionId');
    for (const option of firstPage.data[0]?.question.options ?? []) {
      expect(option).not.toHaveProperty('isCorrect');
    }

    const secondPage = await listWrongQuestions({ page: 2, pageSize: 1 });
    expect(secondPage.data.map(({ question }) => question.id)).toEqual([
      older.id,
    ]);
  });

  it('重练答错累计、答对掌握且不奖励积分，并精确重放原错误次数', async () => {
    const question = await createQuestion();
    expect(await firstAnswerWrong(question, 'task6-first-wrong')).toMatchObject(
      {
        correct: false,
        errorCount: 1,
        pointsAwarded: 0,
        balance: 0,
      },
    );

    const secondWrong = await retryWrong(question, 'task6-retry-1');
    expect(secondWrong).toMatchObject({
      correct: false,
      errorCount: 2,
      pointsAwarded: 0,
      balance: 0,
    });
    const thirdWrong = await retryWrong(question, 'task6-retry-2');
    expect(thirdWrong).toMatchObject({
      correct: false,
      errorCount: 3,
      pointsAwarded: 0,
      balance: 0,
    });
    expect(await retryWrong(question, 'task6-retry-1')).toEqual(secondWrong);

    const masteredResponse = await retryRequest(
      question.id,
      question.correctOptionId,
      'task6-retry-master',
    ).expect(201);
    const mastered = masteredResponse.body as unknown as AnswerResultBody;
    expect(mastered).toMatchObject({
      correct: true,
      errorCount: 3,
      pointsAwarded: 0,
      balance: 0,
    });
    expect(
      (
        await retryRequest(
          question.id,
          question.correctOptionId,
          'task6-retry-master',
        ).expect(201)
      ).body,
    ).toEqual(mastered);

    expect((await listWrongQuestions()).data).toHaveLength(0);
    expect(
      await prisma.user.findUniqueOrThrow({
        where: { id: studentId },
        select: { pointsBalance: true },
      }),
    ).toEqual({ pointsBalance: 0 });
    expect(
      await prisma.pointLedger.count({ where: { userId: studentId } }),
    ).toBe(0);
    expect(
      await prisma.answerAttempt.findMany({
        where: { userId: studentId, questionId: question.id },
        select: {
          mode: true,
          isCorrect: true,
          pointsAwarded: true,
          balanceAfterSnapshot: true,
          errorCountSnapshot: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ).toEqual([
      {
        mode: 'FIRST_ATTEMPT',
        isCorrect: false,
        pointsAwarded: 0,
        balanceAfterSnapshot: 0,
        errorCountSnapshot: 1,
      },
      {
        mode: 'WRONG_RETRY',
        isCorrect: false,
        pointsAwarded: 0,
        balanceAfterSnapshot: 0,
        errorCountSnapshot: 2,
      },
      {
        mode: 'WRONG_RETRY',
        isCorrect: false,
        pointsAwarded: 0,
        balanceAfterSnapshot: 0,
        errorCountSnapshot: 3,
      },
      {
        mode: 'WRONG_RETRY',
        isCorrect: true,
        pointsAwarded: 0,
        balanceAfterSnapshot: 0,
        errorCountSnapshot: 3,
      },
    ]);
  });

  it('拒绝非错题、已掌握题和幂等键跨模式或跨载荷复用', async () => {
    const firstCorrectQuestion = await createQuestion();
    await firstAnswer(
      studentBearer,
      firstCorrectQuestion.id,
      firstCorrectQuestion.correctOptionId,
      'task6-first-correct',
    ).expect(201);
    await retryRequest(
      firstCorrectQuestion.id,
      firstCorrectQuestion.wrongOptionId,
      'task6-not-wrong',
    )
      .expect(404)
      .expect((response) => {
        expectErrorContract(response, 'WRONG_QUESTION_NOT_FOUND');
      });

    const wrongQuestion = await createQuestion();
    await firstAnswerWrong(wrongQuestion, 'task6-mode-conflict');
    await retryRequest(
      wrongQuestion.id,
      wrongQuestion.wrongOptionId,
      'task6-mode-conflict',
    )
      .expect(409)
      .expect((response) => {
        expectErrorContract(response, 'IDEMPOTENCY_CONFLICT');
      });

    await retryWrong(wrongQuestion, 'task6-payload-conflict');
    await retryRequest(
      wrongQuestion.id,
      wrongQuestion.correctOptionId,
      'task6-payload-conflict',
    )
      .expect(409)
      .expect((response) => {
        expectErrorContract(response, 'IDEMPOTENCY_CONFLICT');
      });
    await retryRequest(
      wrongQuestion.id,
      wrongQuestion.correctOptionId,
      'task6-master',
    ).expect(201);
    await retryRequest(
      wrongQuestion.id,
      wrongQuestion.correctOptionId,
      'task6-after-mastered',
    )
      .expect(409)
      .expect((response) => {
        expectErrorContract(response, 'QUESTION_ALREADY_MASTERED');
      });
  });

  it('错题接口要求学员认证并校验分页、答案与幂等键边界', async () => {
    const question = await createQuestion();
    await request(server).get('/api/v1/practice/wrong-questions').expect(401);
    await request(server)
      .get('/api/v1/practice/wrong-questions')
      .set('Authorization', adminBearer)
      .expect(403);
    await request(server)
      .get('/api/v1/practice/wrong-questions')
      .query({ page: 0, pageSize: 101 })
      .set('Authorization', studentBearer)
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });

    await firstAnswerWrong(question, 'task6-validation-first');
    await retryRequest(question.id, question.wrongOptionId)
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });
    await retryRequest(question.id, question.wrongOptionId, '   ')
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });
    await retryRequest(question.id, question.wrongOptionId, 'k'.repeat(129))
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });
    await retryRequest(question.id, 'missing-option', 'task6-missing-option')
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });
  });

  it('相同幂等键并发重练收敛为同一响应且只累计一次', async () => {
    const question = await createQuestion();
    await firstAnswerWrong(question, 'task6-same-key-first');
    activeReplayBarrier = createRequestBarrier();
    const firstRequest = retryRequest(
      question.id,
      question.wrongOptionId,
      'task6-same-key-retry',
    ).then((response) => response);
    const secondRequest = retryRequest(
      question.id,
      question.wrongOptionId,
      'task6-same-key-retry',
    ).then((response) => response);
    try {
      await withTimeout(
        activeReplayBarrier.bothArrived,
        2_000,
        '两个相同键请求未在期限内完成幂等预查',
      );
      activeReplayBarrier.release();
      const responses = await withTimeout(
        Promise.all([firstRequest, secondRequest]),
        8_000,
        '相同键并发重练未在期限内完成',
      );
      expect(responses.map(({ statusCode }) => statusCode)).toEqual([201, 201]);
      expect(responses[0]?.body).toEqual(responses[1]?.body);
      expect(responses[0]?.body).toMatchObject({
        correct: false,
        errorCount: 2,
        pointsAwarded: 0,
      });
    } finally {
      activeReplayBarrier?.release();
      activeReplayBarrier = null;
    }
    expect(
      await prisma.questionProgress.findUniqueOrThrow({
        where: {
          userId_questionId: { userId: studentId, questionId: question.id },
        },
        select: { errorCount: true },
      }),
    ).toEqual({ errorCount: 2 });
    expect(
      await prisma.answerAttempt.count({
        where: {
          userId: studentId,
          questionId: question.id,
          mode: 'WRONG_RETRY',
        },
      }),
    ).toBe(1);
  });

  it('不同幂等键竞争同一进度时每个提交请求只改变一次状态', async () => {
    const question = await createQuestion();
    await firstAnswerWrong(question, 'task6-different-key-first');
    activeProgressLockBarrier = createCriticalSectionBarrier();
    const wrongRequest = retryRequest(
      question.id,
      question.wrongOptionId,
      'task6-race-wrong',
    ).then((response) => response);
    try {
      await withTimeout(
        activeProgressLockBarrier.reached,
        2_000,
        '答错请求未在期限内取得进度行锁',
      );
      activeReplaySignal = createCriticalSectionBarrier();
      const correctRequest = retryRequest(
        question.id,
        question.correctOptionId,
        'task6-race-correct',
      ).then((response) => response);
      await withTimeout(
        activeReplaySignal.reached,
        2_000,
        '答对请求未在期限内进入并发事务',
      );
      activeProgressLockBarrier.release();
      const [wrongResponse, correctResponse] = await withTimeout(
        Promise.all([wrongRequest, correctRequest]),
        8_000,
        '不同键并发重练未在期限内完成',
      );
      expect(wrongResponse.statusCode).toBe(201);
      expect(correctResponse.statusCode).toBe(409);
      expectErrorContract(correctResponse, 'CONCURRENT_MODIFICATION');
    } finally {
      activeProgressLockBarrier?.release();
      activeProgressLockBarrier = null;
      activeReplaySignal?.release();
      activeReplaySignal = null;
    }

    expect(
      await prisma.questionProgress.findUniqueOrThrow({
        where: {
          userId_questionId: { userId: studentId, questionId: question.id },
        },
        select: { errorCount: true, masteredAt: true },
      }),
    ).toEqual({ errorCount: 2, masteredAt: null });
    await retryRequest(
      question.id,
      question.correctOptionId,
      'task6-race-correct',
    )
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          correct: true,
          errorCount: 2,
          pointsAwarded: 0,
        });
      });
    expect(
      await prisma.answerAttempt.findMany({
        where: {
          userId: studentId,
          questionId: question.id,
          mode: 'WRONG_RETRY',
        },
        select: { isCorrect: true, errorCountSnapshot: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ).toEqual([
      { isCorrect: false, errorCountSnapshot: 2 },
      { isCorrect: true, errorCountSnapshot: 2 },
    ]);
  });
});

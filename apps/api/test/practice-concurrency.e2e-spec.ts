import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiApp } from '../src/common/http/configure-api-app';
import { PrismaService } from '../src/prisma/prisma.service';

const configuredWebOrigin = 'https://point-quest.example.test';
const testJwtSecret =
  'point-quest-practice-concurrency-secret-at-least-32-bytes';
const adminId = 'task5-concurrency-admin';
const studentId = 'task5-concurrency-student';
const questionId = 'task5-concurrency-question';
const correctOptionId = 'task5-concurrency-correct';
const wrongOptionId = 'task5-concurrency-wrong';
const defaultTestDatabaseUrl =
  'postgresql://point:point@localhost:5433/point_test';

type AnswerResultBody = {
  correct: boolean;
  selectedOptionId: string;
  correctOptionId: string;
  explanation: string;
  errorCount: number;
  pointsAwarded: number;
  balance: number;
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

function assertAuthorizedTestDatabase(databaseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('Task 5 并发 E2E 数据库 URL 无效');
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
      'Task 5 并发 E2E 只允许使用 localhost:5433/point_test 测试数据库',
    );
  }
}

let activeBarrier: RequestBarrier | null = null;
let activeQuestionLockBarrier: CriticalSectionBarrier | null = null;

function createBarrier(): RequestBarrier {
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
    const barrier = activeBarrier;
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
    const barrier = activeQuestionLockBarrier;
    if (barrier?.claim()) {
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
      (!activeBarrier && !activeQuestionLockBarrier)
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

describe('首次答题真实数据库并发', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;
  let adminBearer: string;
  let studentBearer: string;

  async function cleanup(): Promise<void> {
    await prisma.pointLedger.deleteMany({
      where: {
        OR: [{ userId: studentId }, { answerAttempt: { questionId } }],
      },
    });
    await prisma.answerAttempt.deleteMany({
      where: { OR: [{ userId: studentId }, { questionId }] },
    });
    await prisma.questionProgress.deleteMany({
      where: { OR: [{ userId: studentId }, { questionId }] },
    });
    await prisma.questionOption.deleteMany({ where: { questionId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
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
    activeBarrier = null;
    activeQuestionLockBarrier = null;
    await cleanup();
    const passwordHash = await hash('StrongPass123!', 4);
    await prisma.user.createMany({
      data: [
        {
          id: adminId,
          username: 'task5_concurrency_admin',
          passwordHash,
          role: 'ADMIN',
        },
        {
          id: studentId,
          username: 'task5_concurrency_student',
          passwordHash,
          role: 'STUDENT',
        },
      ],
    });
    await prisma.question.create({
      data: {
        id: questionId,
        stem: 'Task 5 concurrency question',
        explanation: 'Only one concurrent first answer may win.',
        basePoints: 10,
        createdBy: adminId,
        options: {
          createMany: {
            data: [
              {
                id: correctOptionId,
                label: 'A',
                content: 'Correct',
                position: 0,
                isCorrect: true,
              },
              {
                id: wrongOptionId,
                label: 'B',
                content: 'Wrong',
                position: 1,
                isCorrect: false,
              },
            ],
          },
        },
      },
    });
    const login = await request(server)
      .post('/api/v1/auth/token')
      .send({
        username: 'task5_concurrency_student',
        password: 'StrongPass123!',
      })
      .expect(201);
    studentBearer = `Bearer ${
      (login.body as unknown as { accessToken: string }).accessToken
    }`;
    const adminLogin = await request(server)
      .post('/api/v1/auth/token')
      .send({
        username: 'task5_concurrency_admin',
        password: 'StrongPass123!',
      })
      .expect(201);
    adminBearer = `Bearer ${
      (adminLogin.body as unknown as { accessToken: string }).accessToken
    }`;
  });

  afterEach(() => {
    activeBarrier?.release();
    activeBarrier = null;
    activeQuestionLockBarrier?.release();
    activeQuestionLockBarrier = null;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  function answer(key: string) {
    return request(server)
      .post(`/api/v1/practice/questions/${questionId}/answer`)
      .set('Authorization', studentBearer)
      .set('Idempotency-Key', key)
      .send({ selectedOptionId: correctOptionId })
      .timeout({ response: 4_000, deadline: 5_000 });
  }

  function answerExpectCreated(key: string) {
    return answer(key).then((response) => {
      if (response.statusCode !== 201) {
        throw response.body as unknown;
      }
      return response;
    });
  }

  it('不同幂等键并发首次答题只有一个成功且只奖励一次', async () => {
    activeBarrier = createBarrier();
    const firstRequest = answerExpectCreated('concurrent-a');
    const secondRequest = answerExpectCreated('concurrent-b');
    await withTimeout(
      activeBarrier.bothArrived,
      2_000,
      '两个不同键请求未在期限内到达并发屏障',
    );
    activeBarrier.release();

    const results = await withTimeout(
      Promise.allSettled([firstRequest, secondRequest]),
      6_000,
      '不同键并发答题未在期限内完成',
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect((rejected?.reason as { code?: string }).code).toEqual(
      expect.stringMatching(
        /^(QUESTION_ALREADY_ANSWERED|CONCURRENT_MODIFICATION)$/,
      ),
    );
    expect(
      await prisma.user.findUniqueOrThrow({
        where: { id: studentId },
        select: { pointsBalance: true },
      }),
    ).toEqual({ pointsBalance: 10 });
    expect(
      await prisma.pointLedger.count({
        where: { userId: studentId, type: 'ANSWER_REWARD' },
      }),
    ).toBe(1);
    expect(
      await prisma.answerAttempt.count({
        where: { userId: studentId, questionId },
      }),
    ).toBe(1);
    expect(
      await prisma.questionProgress.count({
        where: { userId: studentId, questionId },
      }),
    ).toBe(1);
  });

  it('相同幂等键并发重复请求收敛为一个原始响应', async () => {
    activeBarrier = createBarrier();
    const firstRequest = answerExpectCreated('concurrent-same');
    const secondRequest = answerExpectCreated('concurrent-same');
    await withTimeout(
      activeBarrier.bothArrived,
      2_000,
      '两个同键请求未在期限内到达并发屏障',
    );
    activeBarrier.release();

    const responses = await withTimeout(
      Promise.all([firstRequest, secondRequest]),
      6_000,
      '同键并发答题未在期限内完成',
    );
    const firstBody = responses[0].body as unknown as AnswerResultBody;
    const secondBody = responses[1].body as unknown as AnswerResultBody;
    expect(firstBody).toEqual({
      correct: true,
      selectedOptionId: correctOptionId,
      correctOptionId,
      explanation: 'Only one concurrent first answer may win.',
      errorCount: 0,
      pointsAwarded: 10,
      balance: 10,
    });
    expect(secondBody).toEqual(firstBody);
    expect(
      await prisma.user.findUniqueOrThrow({
        where: { id: studentId },
        select: { pointsBalance: true },
      }),
    ).toEqual({ pointsBalance: 10 });
    expect(
      await prisma.pointLedger.count({
        where: { userId: studentId, type: 'ANSWER_REWARD' },
      }),
    ).toBe(1);
    expect(
      await prisma.answerAttempt.count({
        where: { userId: studentId, questionId },
      }),
    ).toBe(1);
  });

  it('答题取得 KEY SHARE 后管理员内容更新等待提交并按已有记录拒绝', async () => {
    activeQuestionLockBarrier = createCriticalSectionBarrier();
    const answerRequest = answer('answer-holds-question-lock').then(
      (response) => response,
    );
    await withTimeout(
      activeQuestionLockBarrier.reached,
      2_000,
      '答题请求未在期限内取得题目 KEY SHARE 锁',
    );

    const patchRequest = request(server)
      .patch(`/api/v1/admin/questions/${questionId}`)
      .set('Authorization', adminBearer)
      .send({
        stem: 'Changed by concurrent admin',
        explanation: 'Changed explanation',
        basePoints: 99,
        options: [
          {
            label: 'A',
            content: 'Changed wrong',
            position: 0,
            isCorrect: false,
          },
          {
            label: 'B',
            content: 'Changed correct',
            position: 1,
            isCorrect: true,
          },
        ],
      })
      .timeout({ response: 4_000, deadline: 5_000 });
    const patchResponse = patchRequest.then((response) => response);

    let earlyPatchResponse: request.Response | null = null;
    try {
      earlyPatchResponse = await Promise.race([
        patchResponse,
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 800);
        }),
      ]);
    } finally {
      activeQuestionLockBarrier.release();
    }

    const [answerResponse, completedPatchResponse] = await withTimeout(
      Promise.all([answerRequest, patchResponse]),
      6_000,
      '答题与管理员更新未在期限内完成',
    );
    expect(earlyPatchResponse).toBeNull();
    expect(answerResponse.status).toBe(201);
    expect(answerResponse.body).toEqual({
      correct: true,
      selectedOptionId: correctOptionId,
      correctOptionId,
      explanation: 'Only one concurrent first answer may win.',
      errorCount: 0,
      pointsAwarded: 10,
      balance: 10,
    });
    expect(completedPatchResponse.status).toBe(409);
    expect(completedPatchResponse.body).toMatchObject({
      code: 'QUESTION_HAS_ATTEMPTS',
    });
    expect(
      await prisma.question.findUniqueOrThrow({
        where: { id: questionId },
        select: {
          stem: true,
          explanation: true,
          basePoints: true,
          options: {
            select: {
              id: true,
              label: true,
              content: true,
              position: true,
              isCorrect: true,
            },
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
          },
        },
      }),
    ).toEqual({
      stem: 'Task 5 concurrency question',
      explanation: 'Only one concurrent first answer may win.',
      basePoints: 10,
      options: [
        {
          id: correctOptionId,
          label: 'A',
          content: 'Correct',
          position: 0,
          isCorrect: true,
        },
        {
          id: wrongOptionId,
          label: 'B',
          content: 'Wrong',
          position: 1,
          isCorrect: false,
        },
      ],
    });
  });
});

import {
  BadRequestException,
  ConflictException,
  type HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PointsService } from '../points/points.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListWrongQuestionsDto } from './dto/list-wrong-questions.dto';
import { PreviewQuestionsQueryDto } from './dto/preview-questions-query.dto';
import { RandomQuestionQueryDto } from './dto/random-question-query.dto';
import {
  mapAnswerResult,
  mapLearnerQuestion,
  mapPreviewQuestion,
} from './practice-response.mapper';
import { PracticeService } from './practice.service';

async function caughtHttpException(
  operation: Promise<unknown>,
): Promise<HttpException> {
  try {
    await operation;
    throw new Error('预期操作抛出 HttpException');
  } catch (error) {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof NotFoundException
    ) {
      return error;
    }
    throw error;
  }
}

describe('PracticeService', () => {
  it('重练序列化冲突只执行一次事务并返回稳定并发错误', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue({ code: 'P2034' }),
      answerAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new PracticeService(
      prisma as unknown as PrismaService,
      {} as PointsService,
    );

    const error = await caughtHttpException(
      service.answerWrongRetry(
        'student-1',
        'question-1',
        'option-1',
        'retry-key-1',
      ),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      code: 'CONCURRENT_MODIFICATION',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    );
  });

  it('重练只把精确的原始 SQL 40001 写冲突映射为并发错误', async () => {
    const writeConflict = {
      code: 'P2010',
      meta: {
        driverAdapterError: {
          cause: {
            kind: 'TransactionWriteConflict',
            originalCode: '40001',
          },
        },
      },
    };
    const conflictPrisma = {
      $transaction: jest.fn().mockRejectedValue(writeConflict),
      answerAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const conflictService = new PracticeService(
      conflictPrisma as unknown as PrismaService,
      {} as PointsService,
    );

    const error = await caughtHttpException(
      conflictService.answerWrongRetry(
        'student-1',
        'question-1',
        'option-1',
        'retry-key-1',
      ),
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      code: 'CONCURRENT_MODIFICATION',
    });
    expect(conflictPrisma.$transaction).toHaveBeenCalledTimes(1);

    const unrelatedRawError = {
      code: 'P2010',
      meta: {
        driverAdapterError: {
          cause: {
            kind: 'TransactionWriteConflict',
            originalCode: '23505',
          },
        },
      },
    };
    const unrelatedPrisma = {
      $transaction: jest.fn().mockRejectedValue(unrelatedRawError),
      answerAttempt: {
        findUnique: jest.fn(),
      },
    };
    const unrelatedService = new PracticeService(
      unrelatedPrisma as unknown as PrismaService,
      {} as PointsService,
    );
    await expect(
      unrelatedService.answerWrongRetry(
        'student-1',
        'question-1',
        'option-1',
        'retry-key-1',
      ),
    ).rejects.toBe(unrelatedRawError);
    expect(unrelatedPrisma.answerAttempt.findUnique).not.toHaveBeenCalled();
  });

  it('重练只把答题幂等唯一约束作为并发收敛候选', async () => {
    const attemptConflict = {
      code: 'P2002',
      meta: {
        modelName: 'AnswerAttempt',
        target: ['userId', 'idempotencyKey'],
      },
    };
    const conflictPrisma = {
      $transaction: jest.fn().mockRejectedValue(attemptConflict),
      answerAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const conflictService = new PracticeService(
      conflictPrisma as unknown as PrismaService,
      {} as PointsService,
    );
    const mapped = await caughtHttpException(
      conflictService.answerWrongRetry(
        'student-1',
        'question-1',
        'option-1',
        'retry-key-1',
      ),
    );
    expect(mapped).toBeInstanceOf(ConflictException);
    expect(mapped.getResponse()).toMatchObject({
      code: 'CONCURRENT_MODIFICATION',
    });
    expect(conflictPrisma.answerAttempt.findUnique).toHaveBeenCalledTimes(1);

    const unrelatedConflict = {
      code: 'P2002',
      meta: {
        modelName: 'QuestionProgress',
        target: ['userId', 'questionId'],
      },
    };
    const unrelatedPrisma = {
      $transaction: jest.fn().mockRejectedValue(unrelatedConflict),
      answerAttempt: {
        findUnique: jest.fn(),
      },
    };
    const unrelatedService = new PracticeService(
      unrelatedPrisma as unknown as PrismaService,
      {} as PointsService,
    );
    await expect(
      unrelatedService.answerWrongRetry(
        'student-1',
        'question-1',
        'option-1',
        'retry-key-1',
      ),
    ).rejects.toBe(unrelatedConflict);
    expect(unrelatedPrisma.answerAttempt.findUnique).not.toHaveBeenCalled();
  });

  it('序列化冲突只执行一次事务并返回稳定并发错误', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue({ code: 'P2034' }),
      answerAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new PracticeService(
      prisma as unknown as PrismaService,
      {} as PointsService,
    );

    const error = await caughtHttpException(
      service.answerFirst(
        'student-1',
        'question-1',
        'option-1',
        'idempotency-1',
      ),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      code: 'CONCURRENT_MODIFICATION',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    );
  });

  it('只把进度唯一约束映射为已经作答，不吞掉无关 P2002', async () => {
    const progressConflict = {
      code: 'P2002',
      meta: {
        modelName: 'QuestionProgress',
        driverAdapterError: {
          cause: {
            constraint: {
              fields: ['"userId"', '"questionId"'],
            },
          },
        },
      },
    };
    const progressPrisma = {
      $transaction: jest.fn().mockRejectedValue(progressConflict),
      answerAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const progressService = new PracticeService(
      progressPrisma as unknown as PrismaService,
      {} as PointsService,
    );
    const answered = await caughtHttpException(
      progressService.answerFirst(
        'student-1',
        'question-1',
        'option-1',
        'idempotency-1',
      ),
    );
    expect(answered).toBeInstanceOf(ConflictException);
    expect(answered.getResponse()).toMatchObject({
      code: 'QUESTION_ALREADY_ANSWERED',
    });

    const unrelatedConflict = {
      code: 'P2002',
      meta: {
        modelName: 'PointLedger',
        target: ['answerAttemptId'],
      },
    };
    const unrelatedPrisma = {
      $transaction: jest.fn().mockRejectedValue(unrelatedConflict),
      answerAttempt: {
        findUnique: jest.fn(),
      },
    };
    const unrelatedService = new PracticeService(
      unrelatedPrisma as unknown as PrismaService,
      {} as PointsService,
    );
    await expect(
      unrelatedService.answerFirst(
        'student-1',
        'question-1',
        'option-1',
        'idempotency-1',
      ),
    ).rejects.toBe(unrelatedConflict);
    expect(unrelatedPrisma.answerAttempt.findUnique).not.toHaveBeenCalled();
  });

  it('精确字符串约束名映射为已经作答', async () => {
    const progressConflict = {
      code: 'P2002',
      meta: {
        modelName: 'QuestionProgress',
        target: 'QuestionProgress_userId_questionId_key',
      },
    };
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(progressConflict),
      answerAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new PracticeService(
      prisma as unknown as PrismaService,
      {} as PointsService,
    );

    const error = await caughtHttpException(
      service.answerFirst(
        'student-1',
        'question-1',
        'option-1',
        'idempotency-1',
      ),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      code: 'QUESTION_ALREADY_ANSWERED',
    });
  });

  it.each([
    ['合法约束名追加 suffix', 'QuestionProgress_userId_questionId_key_suffix'],
    ['相似字段名', 'QuestionProgress_userIdentifier_questionIdentifier_key'],
    ['字段顺序拼接', 'QuestionProgress_questionId_userId_key'],
  ])('字符串 target 为%s时不做业务冲突映射', async (_name, target) => {
    const ambiguousConflict = {
      code: 'P2002',
      meta: {
        modelName: 'QuestionProgress',
        target,
      },
    };
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(ambiguousConflict),
      answerAttempt: {
        findUnique: jest.fn(),
      },
    };
    const service = new PracticeService(
      prisma as unknown as PrismaService,
      {} as PointsService,
    );

    await expect(
      service.answerFirst(
        'student-1',
        'question-1',
        'option-1',
        'idempotency-1',
      ),
    ).rejects.toBe(ambiguousConflict);
    expect(prisma.answerAttempt.findUnique).not.toHaveBeenCalled();
  });

  it('P2002 缺失 modelName 时即使字段相同也不做业务冲突映射', async () => {
    const incompleteConflict = {
      code: 'P2002',
      meta: {
        driverAdapterError: {
          cause: {
            constraint: {
              fields: ['"userId"', '"questionId"'],
            },
          },
        },
      },
    };
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(incompleteConflict),
      answerAttempt: {
        findUnique: jest.fn(),
      },
    };
    const service = new PracticeService(
      prisma as unknown as PrismaService,
      {} as PointsService,
    );

    await expect(
      service.answerFirst(
        'student-1',
        'question-1',
        'option-1',
        'idempotency-1',
      ),
    ).rejects.toBe(incompleteConflict);
    expect(prisma.answerAttempt.findUnique).not.toHaveBeenCalled();
  });

  it('题目锁查询无结果时稳定返回 QUESTION_NOT_FOUND 且不读取详情', async () => {
    const transactionClient = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      answerAttempt: {
        findUnique: jest.fn(),
      },
      question: {
        findUnique: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(
          (callback: (client: typeof transactionClient) => Promise<unknown>) =>
            callback(transactionClient),
        ),
      answerAttempt: {
        findUnique: jest.fn(),
      },
    };
    const service = new PracticeService(
      prisma as unknown as PrismaService,
      {} as PointsService,
    );

    const error = await caughtHttpException(
      service.answerFirst(
        'student-1',
        'missing-question',
        'option-1',
        'idempotency-1',
      ),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toMatchObject({ code: 'QUESTION_NOT_FOUND' });
    expect(transactionClient.answerAttempt.findUnique).not.toHaveBeenCalled();
    expect(transactionClient.question.findUnique).not.toHaveBeenCalled();
  });

  it('在任何写入前拒绝超出 PostgreSQL Int 范围的积分结果', async () => {
    const transactionClient = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'question-1' }]),
      answerAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      question: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'question-1',
          explanation: 'Explanation',
          basePoints: 2_147_483_647,
          isActive: true,
          options: [
            { id: 'option-1', isCorrect: true },
            { id: 'option-2', isCorrect: false },
          ],
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ pointsBalance: 1 }),
      },
      questionProgress: {
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(
          (callback: (client: typeof transactionClient) => Promise<unknown>) =>
            callback(transactionClient),
        ),
      answerAttempt: {
        findUnique: jest.fn(),
      },
    };
    const points = {
      getCurrentMultiplier: jest.fn().mockResolvedValue(10),
    };
    const service = new PracticeService(
      prisma as unknown as PrismaService,
      points as unknown as PointsService,
    );

    const error = await caughtHttpException(
      service.answerFirst(
        'student-1',
        'question-1',
        'option-1',
        'idempotency-1',
      ),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      code: 'POINTS_VALUE_INVALID',
    });
    expect(transactionClient.questionProgress.create).not.toHaveBeenCalled();
    expect(transactionClient.answerAttempt.create).not.toHaveBeenCalled();
  });

  it('余额达到 Int 上限时答错仍保存零奖励和原余额快照', async () => {
    const transactionClient = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'question-1' }]),
      answerAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'attempt-1' }),
      },
      question: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'question-1',
          explanation: 'Explanation',
          basePoints: 1,
          isActive: true,
          options: [
            { id: 'option-correct', isCorrect: true },
            { id: 'option-wrong', isCorrect: false },
          ],
        }),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ pointsBalance: 2_147_483_647 }),
      },
      questionProgress: {
        create: jest.fn().mockResolvedValue({ id: 'progress-1' }),
      },
      pointLedger: {
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(
          (callback: (client: typeof transactionClient) => Promise<unknown>) =>
            callback(transactionClient),
        ),
      answerAttempt: {
        findUnique: jest.fn(),
      },
    };
    const points = {
      getCurrentMultiplier: jest.fn().mockResolvedValue(1),
    };
    const service = new PracticeService(
      prisma as unknown as PrismaService,
      points as unknown as PointsService,
    );

    await expect(
      service.answerFirst(
        'student-1',
        'question-1',
        'option-wrong',
        'idempotency-wrong',
      ),
    ).resolves.toEqual({
      correct: false,
      selectedOptionId: 'option-wrong',
      correctOptionId: 'option-correct',
      explanation: 'Explanation',
      errorCount: 1,
      pointsAwarded: 0,
      balance: 2_147_483_647,
    });
    expect(transactionClient.answerAttempt.create).toHaveBeenCalledTimes(1);
    const createCalls = transactionClient.answerAttempt.create.mock
      .calls as unknown as Array<
      [
        {
          data: {
            pointsAwarded: number;
            balanceAfterSnapshot: number;
          };
        },
      ]
    >;
    expect(createCalls[0]?.[0].data).toMatchObject({
      pointsAwarded: 0,
      balanceAfterSnapshot: 2_147_483_647,
    });
    expect(transactionClient.pointLedger.create).not.toHaveBeenCalled();
  });

  it('随机排除列表执行 trim、去重与数量边界验证', async () => {
    const valid = plainToInstance(RandomQuestionQueryDto, {
      excludeIds: ' question-1, question-2 ',
    });
    expect(await validate(valid)).toHaveLength(0);
    expect(valid.excludeIds).toEqual(['question-1', 'question-2']);

    const duplicates = plainToInstance(RandomQuestionQueryDto, {
      excludeIds: 'question-1,question-1',
    });
    expect(await validate(duplicates)).not.toHaveLength(0);

    const overLimit = plainToInstance(RandomQuestionQueryDto, {
      excludeIds: Array.from(
        { length: 51 },
        (_, index) => `question-${index}`,
      ).join(','),
    });
    expect(await validate(overLimit)).not.toHaveLength(0);
  });

  it('错题分页 DTO 只接受有界正整数', async () => {
    const valid = plainToInstance(ListWrongQuestionsDto, {
      page: '2',
      pageSize: '100',
    });
    expect(await validate(valid)).toHaveLength(0);
    expect(valid).toMatchObject({ page: 2, pageSize: 100 });

    const invalid = plainToInstance(ListWrongQuestionsDto, {
      page: 0,
      pageSize: 101,
    });
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('响应映射只公开学员题目和显式答题结果字段', () => {
    const question = {
      id: 'question-1',
      stem: 'Choose one.',
      langCode: 'en',
      explanation: 'Must stay hidden.',
      basePoints: 10,
      options: [
        {
          id: 'option-1',
          label: 'A',
          content: 'Answer',
          position: 0,
          isCorrect: true,
        },
      ],
    };
    expect(mapLearnerQuestion(question)).toEqual({
      id: 'question-1',
      stem: 'Choose one.',
      langCode: 'en',
      basePoints: 10,
      options: [
        {
          id: 'option-1',
          label: 'A',
          content: 'Answer',
          position: 0,
        },
      ],
    });
    expect(
      mapAnswerResult({
        isCorrect: false,
        selectedOptionId: 'option-2',
        correctOptionId: 'option-1',
        explanation: 'Explanation',
        errorCount: 1,
        pointsAwarded: 0,
        balanceAfterSnapshot: 7,
      }),
    ).toEqual({
      correct: false,
      selectedOptionId: 'option-2',
      correctOptionId: 'option-1',
      explanation: 'Explanation',
      errorCount: 1,
      pointsAwarded: 0,
      balance: 7,
    });
  });

  it('预习抽题数量必须为 1–50 的整数', async () => {
    const prisma = {
      $queryRaw: jest.fn(),
    };
    const service = new PracticeService(
      prisma as unknown as PrismaService,
      {} as PointsService,
    );

    for (const count of [0, 51, 1.5, Number.NaN]) {
      const error = await caughtHttpException(
        service.getPreviewQuestions('student-1', count),
      );
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    }
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('预习按随机结果顺序返回题解与正确选项且不泄漏 isCorrect', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: 'question-2' }, { id: 'question-1' }]),
      question: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'question-1',
            stem: 'Stem 1',
            langCode: 'en',
            explanation: 'Explanation 1',
            basePoints: 5,
            options: [
              {
                id: 'option-1a',
                label: 'A',
                content: 'Right',
                position: 0,
                isCorrect: true,
              },
              {
                id: 'option-1b',
                label: 'B',
                content: 'Wrong',
                position: 1,
                isCorrect: false,
              },
            ],
          },
          {
            id: 'question-2',
            stem: 'Stem 2',
            langCode: 'ja',
            explanation: 'Explanation 2',
            basePoints: 8,
            options: [
              {
                id: 'option-2a',
                label: 'A',
                content: 'Wrong',
                position: 0,
                isCorrect: false,
              },
              {
                id: 'option-2b',
                label: 'B',
                content: 'Right',
                position: 1,
                isCorrect: true,
              },
            ],
          },
        ]),
      },
    };
    const service = new PracticeService(
      prisma as unknown as PrismaService,
      {} as PointsService,
    );

    const result = await service.getPreviewQuestions('student-1', 2);
    expect(result.data).toEqual([
      {
        id: 'question-2',
        stem: 'Stem 2',
        langCode: 'ja',
        basePoints: 8,
        options: [
          { id: 'option-2a', label: 'A', content: 'Wrong', position: 0 },
          { id: 'option-2b', label: 'B', content: 'Right', position: 1 },
        ],
        explanation: 'Explanation 2',
        correctOptionId: 'option-2b',
      },
      {
        id: 'question-1',
        stem: 'Stem 1',
        langCode: 'en',
        basePoints: 5,
        options: [
          { id: 'option-1a', label: 'A', content: 'Right', position: 0 },
          { id: 'option-1b', label: 'B', content: 'Wrong', position: 1 },
        ],
        explanation: 'Explanation 1',
        correctOptionId: 'option-1a',
      },
    ]);
    expect(prisma.question.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.question.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['question-2', 'question-1'] },
          isActive: true,
        },
      }),
    );
  });

  it('预习跳过没有唯一正确选项的题目', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: 'question-bad' }, { id: 'question-ok' }]),
      question: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'question-bad',
            stem: 'Bad',
            langCode: 'en',
            explanation: 'Bad',
            basePoints: 5,
            options: [
              {
                id: 'option-x',
                label: 'A',
                content: 'X',
                position: 0,
                isCorrect: true,
              },
              {
                id: 'option-y',
                label: 'B',
                content: 'Y',
                position: 1,
                isCorrect: true,
              },
            ],
          },
          {
            id: 'question-ok',
            stem: 'Ok',
            langCode: 'fr',
            explanation: 'Ok explanation',
            basePoints: 3,
            options: [
              {
                id: 'option-ok',
                label: 'A',
                content: 'Right',
                position: 0,
                isCorrect: true,
              },
              {
                id: 'option-no',
                label: 'B',
                content: 'Wrong',
                position: 1,
                isCorrect: false,
              },
            ],
          },
        ]),
      },
    };
    const service = new PracticeService(
      prisma as unknown as PrismaService,
      {} as PointsService,
    );

    const result = await service.getPreviewQuestions('student-1', 2);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'question-ok',
      correctOptionId: 'option-ok',
    });
  });

  it('预习空题池时抛出 NO_UNANSWERED_QUESTIONS', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      question: {
        findMany: jest.fn(),
      },
    };
    const service = new PracticeService(
      prisma as unknown as PrismaService,
      {} as PointsService,
    );

    const error = await caughtHttpException(
      service.getPreviewQuestions('student-1', 5),
    );
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toMatchObject({
      code: 'NO_UNANSWERED_QUESTIONS',
    });
    expect(prisma.question.findMany).not.toHaveBeenCalled();
  });

  it('预习数量 DTO 只接受 1–50 的整数并默认 10', async () => {
    const fallback = plainToInstance(PreviewQuestionsQueryDto, {});
    expect(await validate(fallback)).toHaveLength(0);
    expect(fallback.count).toBe(10);

    const valid = plainToInstance(PreviewQuestionsQueryDto, { count: '20' });
    expect(await validate(valid)).toHaveLength(0);
    expect(valid.count).toBe(20);

    for (const count of [0, 51, 1.5, 'abc']) {
      const invalid = plainToInstance(PreviewQuestionsQueryDto, { count });
      expect(await validate(invalid)).not.toHaveLength(0);
    }
  });

  it('预习映射公开题解与正确选项，异常题返回 null', () => {
    const question = {
      id: 'question-1',
      stem: 'Choose one.',
      langCode: 'en',
      explanation: 'Preview explanation',
      basePoints: 10,
      options: [
        {
          id: 'option-1',
          label: 'A',
          content: 'Right',
          position: 0,
          isCorrect: true,
        },
        {
          id: 'option-2',
          label: 'B',
          content: 'Wrong',
          position: 1,
          isCorrect: false,
        },
      ],
    };
    expect(mapPreviewQuestion(question)).toEqual({
      id: 'question-1',
      stem: 'Choose one.',
      langCode: 'en',
      basePoints: 10,
      options: [
        { id: 'option-1', label: 'A', content: 'Right', position: 0 },
        { id: 'option-2', label: 'B', content: 'Wrong', position: 1 },
      ],
      explanation: 'Preview explanation',
      correctOptionId: 'option-1',
    });
    expect(
      mapPreviewQuestion({
        ...question,
        options: question.options.map((option) => ({
          ...option,
          isCorrect: false,
        })),
      }),
    ).toBeNull();
  });

  it('服务层拒绝空白或超长幂等键', async () => {
    const service = new PracticeService(
      {} as PrismaService,
      {} as PointsService,
    );
    await expect(
      service.answerFirst('student-1', 'question-1', 'option-1', '   '),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.answerFirst(
        'student-1',
        'question-1',
        'option-1',
        'k'.repeat(129),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

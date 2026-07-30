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
import { RandomQuestionQueryDto } from './dto/random-question-query.dto';
import {
  mapAnswerResult,
  mapLearnerQuestion,
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

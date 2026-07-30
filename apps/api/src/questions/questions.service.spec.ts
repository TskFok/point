import {
  BadRequestException,
  ConflictException,
  type HttpException,
} from '@nestjs/common';
import { PointsService } from '../points/points.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionsService } from './questions.service';

describe('QuestionsService', () => {
  it('服务层独立拒绝非唯一正确选项，避免绕过 DTO 破坏题目完整性', async () => {
    const prisma = {
      question: {
        create: () => {
          throw new Error('不应写入无效题目');
        },
      },
    };
    const service = new QuestionsService(prisma as unknown as PrismaService);

    await expect(
      service.create(
        {
          stem: 'Choose the correct form.',
          explanation: 'Only one form agrees with the subject.',
          basePoints: 10,
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
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('并发答题导致选项外键冲突时返回稳定题目冲突而不是数据库错误', async () => {
    const transactionClient = {
      $queryRaw: () => Promise.resolve([{ id: 'question-1' }]),
      question: {
        findUnique: () =>
          Promise.resolve({
            id: 'question-1',
            _count: { attempts: 0 },
          }),
        update: () => Promise.resolve({ id: 'question-1' }),
      },
      questionOption: {
        deleteMany: () =>
          Promise.reject(
            Object.assign(new Error('Foreign key constraint failed'), {
              code: 'P2003',
            }),
          ),
        createMany: () => Promise.resolve({ count: 2 }),
      },
    };
    const prisma = {
      $transaction: (
        operation: (tx: typeof transactionClient) => Promise<unknown>,
      ) => operation(transactionClient),
    };
    const service = new QuestionsService(prisma as unknown as PrismaService);

    const error = await service
      .update('question-1', {
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
            isCorrect: false,
          },
        ],
      })
      .catch((caught: HttpException) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as HttpException).getResponse()).toMatchObject({
      code: 'QUESTION_HAS_ATTEMPTS',
    });
  });

  it('数据库事务冲突时不循环重试并返回稳定并发冲突', async () => {
    const prisma = {
      $transaction: () =>
        Promise.reject(
          Object.assign(new Error('Transaction write conflict'), {
            code: 'P2034',
          }),
        ),
    };
    const service = new QuestionsService(prisma as unknown as PrismaService);

    const error = await service
      .update('question-1', { isActive: false })
      .catch((caught: HttpException) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as HttpException).getResponse()).toMatchObject({
      code: 'CONCURRENT_MODIFICATION',
    });
  });
});

describe('PointsService', () => {
  it('无倍率配置时返回默认值 1', async () => {
    const prisma = {
      pointConfig: {
        findFirst: () => Promise.resolve(null),
      },
    };
    const service = new PointsService(prisma as unknown as PrismaService);

    await expect(service.getCurrentMultiplier()).resolves.toBe(1);
  });

  it('传入事务客户端时从该事务读取当前倍率', async () => {
    const prisma = {
      pointConfig: {
        findFirst: () => Promise.resolve({ multiplier: 2 }),
      },
    };
    const transactionClient = {
      pointConfig: {
        findFirst: () => Promise.resolve({ multiplier: 7 }),
      },
    };
    const service = new PointsService(prisma as unknown as PrismaService);

    await expect(
      service.getCurrentMultiplier(
        transactionClient as Parameters<
          PointsService['getCurrentMultiplier']
        >[0],
      ),
    ).resolves.toBe(7);
  });
});

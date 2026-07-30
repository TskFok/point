import {
  BadRequestException,
  ConflictException,
  type HttpException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PointsService } from '../points/points.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QuestionsService } from './questions.service';

const validOptions = () => [
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

const validQuestionInput = () => ({
  stem: 'Choose the correct form.',
  explanation: 'Only one form agrees with the subject.',
  basePoints: 10,
  options: validOptions(),
});

const invalidWriteCases: Array<{
  name: string;
  patch: Record<string, unknown>;
}> = [
  { name: '题干缺失', patch: { stem: undefined } },
  { name: '题干显式 null', patch: { stem: null } },
  { name: '题干 trim 后为空', patch: { stem: '   ' } },
  { name: '题干超过 2000 字符', patch: { stem: 's'.repeat(2001) } },
  { name: '解析缺失', patch: { explanation: undefined } },
  { name: '解析显式 null', patch: { explanation: null } },
  { name: '解析 trim 后为空', patch: { explanation: '   ' } },
  {
    name: '解析超过 5000 字符',
    patch: { explanation: 'e'.repeat(5001) },
  },
  { name: '基础积分缺失', patch: { basePoints: undefined } },
  { name: '基础积分显式 null', patch: { basePoints: null } },
  { name: '基础积分不是整数', patch: { basePoints: 1.5 } },
  { name: '基础积分小于下限', patch: { basePoints: 0 } },
  { name: '基础积分超过上限', patch: { basePoints: 1001 } },
  { name: '启用状态显式 null', patch: { isActive: null } },
  { name: '启用状态不是布尔值', patch: { isActive: 'true' } },
  { name: '选项缺失', patch: { options: undefined } },
  { name: '选项显式 null', patch: { options: null } },
  { name: '选项少于 2 个', patch: { options: [validOptions()[0]] } },
  {
    name: '选项超过 6 个',
    patch: {
      options: [
        ...validOptions(),
        {
          label: 'C',
          content: 'c',
          position: 2,
          isCorrect: false,
        },
        {
          label: 'D',
          content: 'd',
          position: 3,
          isCorrect: false,
        },
        {
          label: 'E',
          content: 'e',
          position: 4,
          isCorrect: false,
        },
        {
          label: 'F',
          content: 'f',
          position: 5,
          isCorrect: false,
        },
        {
          label: 'G',
          content: 'g',
          position: 0,
          isCorrect: false,
        },
      ],
    },
  },
  {
    name: '选项标签显式 null',
    patch: {
      options: [{ ...validOptions()[0], label: null }, validOptions()[1]],
    },
  },
  {
    name: '选项标签 trim 后为空',
    patch: {
      options: [{ ...validOptions()[0], label: '   ' }, validOptions()[1]],
    },
  },
  {
    name: '选项标签超过 16 字符',
    patch: {
      options: [
        { ...validOptions()[0], label: 'A'.repeat(17) },
        validOptions()[1],
      ],
    },
  },
  {
    name: '选项标签 trim 后重复',
    patch: {
      options: [{ ...validOptions()[0], label: ' B ' }, validOptions()[1]],
    },
  },
  {
    name: '选项内容显式 null',
    patch: {
      options: [{ ...validOptions()[0], content: null }, validOptions()[1]],
    },
  },
  {
    name: '选项内容 trim 后为空',
    patch: {
      options: [{ ...validOptions()[0], content: '   ' }, validOptions()[1]],
    },
  },
  {
    name: '选项内容超过 1000 字符',
    patch: {
      options: [
        { ...validOptions()[0], content: 'c'.repeat(1001) },
        validOptions()[1],
      ],
    },
  },
  {
    name: '选项位置显式 null',
    patch: {
      options: [{ ...validOptions()[0], position: null }, validOptions()[1]],
    },
  },
  {
    name: '选项位置不是整数',
    patch: {
      options: [{ ...validOptions()[0], position: 0.5 }, validOptions()[1]],
    },
  },
  {
    name: '选项位置小于下限',
    patch: {
      options: [{ ...validOptions()[0], position: -1 }, validOptions()[1]],
    },
  },
  {
    name: '选项位置超过上限',
    patch: {
      options: [{ ...validOptions()[0], position: 6 }, validOptions()[1]],
    },
  },
  {
    name: '选项位置重复',
    patch: {
      options: [{ ...validOptions()[0], position: 1 }, validOptions()[1]],
    },
  },
  {
    name: '正确标记显式 null',
    patch: {
      options: [{ ...validOptions()[0], isCorrect: null }, validOptions()[1]],
    },
  },
  {
    name: '正确标记不是布尔值',
    patch: {
      options: [{ ...validOptions()[0], isCorrect: 'true' }, validOptions()[1]],
    },
  },
  {
    name: '没有正确选项',
    patch: {
      options: validOptions().map((option) => ({
        ...option,
        isCorrect: false,
      })),
    },
  },
  {
    name: '存在多个正确选项',
    patch: {
      options: validOptions().map((option) => ({
        ...option,
        isCorrect: true,
      })),
    },
  },
];

async function expectValidationFailed(
  operation: Promise<unknown>,
): Promise<void> {
  const error = await operation.catch((caught: HttpException) => caught);
  expect(error).toBeInstanceOf(BadRequestException);
  expect((error as HttpException).getResponse()).toMatchObject({
    code: 'VALIDATION_FAILED',
  });
}

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

  it.each(invalidWriteCases)(
    'create 服务层拒绝无效写入：$name',
    async ({ patch }) => {
      const prisma = {
        question: {
          create: () => Promise.reject(new Error('不应访问 Prisma')),
        },
      };
      const service = new QuestionsService(prisma as unknown as PrismaService);

      await expectValidationFailed(
        service.create(
          {
            ...validQuestionInput(),
            ...patch,
          },
          'admin-1',
        ),
      );
    },
  );

  it.each(
    invalidWriteCases.filter(
      ({ name }) =>
        !['题干缺失', '解析缺失', '基础积分缺失', '选项缺失'].includes(name),
    ),
  )('update 服务层拒绝无效写入：$name', async ({ patch }) => {
    const prisma = {
      $transaction: () => Promise.reject(new Error('不应访问 Prisma')),
    };
    const service = new QuestionsService(prisma as unknown as PrismaService);

    await expectValidationFailed(service.update('question-1', patch));
  });

  it('服务层对 create 的文本与选项文本执行 trim 后再写入', async () => {
    const prisma = {
      question: {
        create: ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(data),
      },
    };
    const service = new QuestionsService(prisma as unknown as PrismaService);

    const result = await service.create(
      {
        stem: '  Choose the correct form.  ',
        explanation: '  Grammar explanation.  ',
        basePoints: 10,
        options: [
          {
            label: '  A  ',
            content: '  is  ',
            position: 0,
            isCorrect: true,
          },
          {
            label: '  B  ',
            content: '  are  ',
            position: 1,
            isCorrect: false,
          },
        ],
      },
      'admin-1',
    );

    expect(result).toMatchObject({
      stem: 'Choose the correct form.',
      explanation: 'Grammar explanation.',
      options: {
        createMany: {
          data: [
            { label: 'A', content: 'is' },
            { label: 'B', content: 'are' },
          ],
        },
      },
    });
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

describe('题目 DTO 显式 null 校验', () => {
  it('create 的可选 isActive 显式 null 仍产生验证错误', async () => {
    const dto = plainToInstance(CreateQuestionDto, {
      ...validQuestionInput(),
      isActive: null,
    });

    const errors = await validate(dto);

    expect(errors.map(({ property }) => property)).toContain('isActive');
  });

  it.each(['stem', 'explanation', 'basePoints', 'isActive', 'options'])(
    'update 的 %s 显式 null 仍产生验证错误',
    async (field) => {
      const dto = plainToInstance(UpdateQuestionDto, { [field]: null });

      const errors = await validate(dto);

      expect(errors.map(({ property }) => property)).toContain(field);
    },
  );
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

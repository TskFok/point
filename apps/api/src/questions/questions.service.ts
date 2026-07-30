import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  type CreateQuestionDto,
  type QuestionOptionWriteDto,
} from './dto/create-question.dto';
import { type ListQuestionsDto } from './dto/list-questions.dto';
import { type UpdateQuestionDto } from './dto/update-question.dto';

const questionInclude = {
  options: {
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.QuestionInclude;

function validationFailed(message: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message,
  });
}

function questionNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'QUESTION_NOT_FOUND',
    message: '题目不存在',
  });
}

function questionHasAttempts(): ConflictException {
  return new ConflictException({
    code: 'QUESTION_HAS_ATTEMPTS',
    message: '已有答题记录的题目只能停用',
  });
}

function concurrentModification(): ConflictException {
  return new ConflictException({
    code: 'CONCURRENT_MODIFICATION',
    message: '题目正被其他请求修改，请重试',
  });
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

function assertOptionsIntegrity(options: QuestionOptionWriteDto[]): void {
  const labels = new Set(options.map(({ label }) => label));
  const positions = new Set(options.map(({ position }) => position));
  const correctCount = options.filter(({ isCorrect }) => isCorrect).length;
  if (
    options.length < 2 ||
    options.length > 6 ||
    labels.size !== options.length ||
    positions.size !== options.length ||
    correctCount !== 1
  ) {
    throw validationFailed(
      '题目需要 2–6 个标签和位置唯一的选项，且只能有一个正确选项',
    );
  }
}

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateQuestionDto, createdBy: string) {
    assertOptionsIntegrity(data.options);
    return this.prisma.question.create({
      data: {
        stem: data.stem,
        explanation: data.explanation,
        basePoints: data.basePoints,
        isActive: data.isActive ?? true,
        createdBy,
        options: {
          createMany: {
            data: data.options,
          },
        },
      },
      include: questionInclude,
    });
  }

  async list(query: ListQuestionsDto) {
    const where: Prisma.QuestionWhereInput = {
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search
        ? {
            OR: [
              {
                stem: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                explanation: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.question.findMany({
        where,
        include: questionInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.question.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async get(questionId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: questionInclude,
    });
    if (!question) {
      throw questionNotFound();
    }
    return question;
  }

  async update(questionId: string, data: UpdateQuestionDto) {
    const changes = Object.entries(data).filter(
      ([, value]) => value !== undefined,
    );
    if (changes.length === 0) {
      throw validationFailed('至少需要提供一个待更新字段');
    }
    if (data.options) {
      assertOptionsIntegrity(data.options);
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const lockedQuestions = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "Question"
            WHERE "id" = ${questionId}
            FOR UPDATE
          `;
          if (lockedQuestions.length === 0) {
            throw questionNotFound();
          }
          const existing = await tx.question.findUnique({
            where: { id: questionId },
            include: {
              _count: {
                select: { attempts: true },
              },
            },
          });
          if (!existing) {
            throw questionNotFound();
          }

          if (existing._count.attempts > 0) {
            if (
              changes.length !== 1 ||
              changes[0][0] !== 'isActive' ||
              data.isActive !== false
            ) {
              throw questionHasAttempts();
            }
            return tx.question.update({
              where: { id: questionId },
              data: { isActive: false },
              include: questionInclude,
            });
          }

          const scalarData = {
            ...(data.stem === undefined ? {} : { stem: data.stem }),
            ...(data.explanation === undefined
              ? {}
              : { explanation: data.explanation }),
            ...(data.basePoints === undefined
              ? {}
              : { basePoints: data.basePoints }),
            ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
          };
          await tx.question.update({
            where: { id: questionId },
            data: scalarData,
          });
          if (data.options) {
            await tx.questionOption.deleteMany({
              where: { questionId },
            });
            await tx.questionOption.createMany({
              data: data.options.map((option) => ({
                ...option,
                questionId,
              })),
            });
          }
          const updated = await tx.question.findUnique({
            where: { id: questionId },
            include: questionInclude,
          });
          if (!updated) {
            throw questionNotFound();
          }
          return updated;
        },
        {
          isolationLevel: 'ReadCommitted',
        },
      );
    } catch (error) {
      if (hasPrismaCode(error, 'P2003')) {
        throw questionHasAttempts();
      }
      if (hasPrismaCode(error, 'P2034')) {
        throw concurrentModification();
      }
      throw error;
    }
  }
}

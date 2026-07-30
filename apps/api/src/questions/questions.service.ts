import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { type CreateQuestionDto } from './dto/create-question.dto';
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

type NormalizedQuestionOption = {
  label: string;
  content: string;
  position: number;
  isCorrect: boolean;
};

type NormalizedQuestionWrite = {
  stem: string;
  explanation: string;
  basePoints: number;
  options: NormalizedQuestionOption[];
  isActive: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeText(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    throw validationFailed(`${fieldName}必须是字符串`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw validationFailed(`${fieldName}不能为空`);
  }
  if (Array.from(normalized).length > maxLength) {
    throw validationFailed(`${fieldName}不能超过 ${maxLength} 个字符`);
  }
  return normalized;
}

function normalizeBasePoints(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 1000
  ) {
    throw validationFailed('基础积分必须是 1–1000 的整数');
  }
  return value;
}

function normalizeBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw validationFailed(`${fieldName}必须是布尔值`);
  }
  return value;
}

function normalizeOptions(value: unknown): NormalizedQuestionOption[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 6) {
    throw validationFailed('题目需要 2–6 个选项');
  }
  const options = Array.from(value, (rawOption, index) => {
    if (!Object.hasOwn(value, index)) {
      throw validationFailed('题目选项不能包含缺失项');
    }
    if (!isRecord(rawOption)) {
      throw validationFailed('每个题目选项必须是对象');
    }
    const position = rawOption.position;
    if (
      typeof position !== 'number' ||
      !Number.isInteger(position) ||
      position < 0 ||
      position > 5
    ) {
      throw validationFailed('选项位置必须是 0–5 的整数');
    }
    return {
      label: normalizeText(rawOption.label, '选项标签', 16),
      content: normalizeText(rawOption.content, '选项内容', 1000),
      position,
      isCorrect: normalizeBoolean(rawOption.isCorrect, '正确选项标记'),
    };
  });
  const labels = new Set(options.map(({ label }) => label));
  const positions = new Set(options.map(({ position }) => position));
  const correctCount = options.filter(({ isCorrect }) => isCorrect).length;
  if (
    labels.size !== options.length ||
    positions.size !== options.length ||
    correctCount !== 1
  ) {
    throw validationFailed(
      '题目需要 2–6 个标签和位置唯一的选项，且只能有一个正确选项',
    );
  }
  return options;
}

function asWriteInput(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw validationFailed('题目写入参数必须是对象');
  }
  return value;
}

function normalizeCreateQuestion(
  value: CreateQuestionDto,
): NormalizedQuestionWrite {
  const input = asWriteInput(value);
  return {
    stem: normalizeText(input.stem, '题干', 2000),
    explanation: normalizeText(input.explanation, '题目解析', 5000),
    basePoints: normalizeBasePoints(input.basePoints),
    options: normalizeOptions(input.options),
    isActive:
      input.isActive === undefined
        ? true
        : normalizeBoolean(input.isActive, '启用状态'),
  };
}

function normalizeUpdateQuestion(
  value: UpdateQuestionDto,
): Partial<NormalizedQuestionWrite> {
  const input = asWriteInput(value);
  const normalized: Partial<NormalizedQuestionWrite> = {};
  if (input.stem !== undefined) {
    normalized.stem = normalizeText(input.stem, '题干', 2000);
  }
  if (input.explanation !== undefined) {
    normalized.explanation = normalizeText(input.explanation, '题目解析', 5000);
  }
  if (input.basePoints !== undefined) {
    normalized.basePoints = normalizeBasePoints(input.basePoints);
  }
  if (input.options !== undefined) {
    normalized.options = normalizeOptions(input.options);
  }
  if (input.isActive !== undefined) {
    normalized.isActive = normalizeBoolean(input.isActive, '启用状态');
  }
  if (Object.keys(normalized).length === 0) {
    throw validationFailed('至少需要提供一个待更新字段');
  }
  return normalized;
}

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateQuestionDto, createdBy: string) {
    const normalized = normalizeCreateQuestion(data);
    return this.prisma.question.create({
      data: {
        stem: normalized.stem,
        explanation: normalized.explanation,
        basePoints: normalized.basePoints,
        isActive: normalized.isActive,
        createdBy,
        options: {
          createMany: {
            data: normalized.options,
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
    const normalized = normalizeUpdateQuestion(data);
    const changes = Object.entries(normalized);

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
              normalized.isActive !== false
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
            ...(normalized.stem === undefined ? {} : { stem: normalized.stem }),
            ...(normalized.explanation === undefined
              ? {}
              : { explanation: normalized.explanation }),
            ...(normalized.basePoints === undefined
              ? {}
              : { basePoints: normalized.basePoints }),
            ...(normalized.isActive === undefined
              ? {}
              : { isActive: normalized.isActive }),
          };
          await tx.question.update({
            where: { id: questionId },
            data: scalarData,
          });
          if (normalized.options) {
            await tx.questionOption.deleteMany({
              where: { questionId },
            });
            await tx.questionOption.createMany({
              data: normalized.options.map((option) => ({
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

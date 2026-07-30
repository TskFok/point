import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PointsService } from '../points/points.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  type AnswerResultDto,
  mapAnswerResult,
  mapLearnerQuestion,
} from './practice-response.mapper';

const MAX_DATABASE_INTEGER = 2_147_483_647;
const MAX_ID_LENGTH = 191;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const MAX_EXCLUDED_QUESTIONS = 50;

const attemptResultSelection = {
  mode: true,
  questionId: true,
  selectedOptionId: true,
  isCorrect: true,
  pointsAwarded: true,
  balanceAfterSnapshot: true,
  question: {
    select: {
      explanation: true,
      options: {
        where: { isCorrect: true },
        select: { id: true },
        orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
        take: 2,
      },
    },
  },
} satisfies Prisma.AnswerAttemptSelect;

type AttemptResultRecord = Prisma.AnswerAttemptGetPayload<{
  select: typeof attemptResultSelection;
}>;

type PracticeClient = PrismaService | Prisma.TransactionClient;

type SummaryRow = {
  activeTotal: number;
  firstAnsweredCount: number;
  unansweredCount: number;
  pendingWrongCount: number;
  masteredWrongCount: number;
  balance: number | null;
};

function validationFailed(message: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message,
  });
}

function noUnansweredQuestions(): NotFoundException {
  return new NotFoundException({
    code: 'NO_UNANSWERED_QUESTIONS',
    message: '没有可继续作答的未答题目',
  });
}

function questionNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'QUESTION_NOT_FOUND',
    message: '题目不存在或当前不可作答',
  });
}

function questionAlreadyAnswered(): ConflictException {
  return new ConflictException({
    code: 'QUESTION_ALREADY_ANSWERED',
    message: '该题已经完成首次作答',
  });
}

function idempotencyConflict(): ConflictException {
  return new ConflictException({
    code: 'IDEMPOTENCY_CONFLICT',
    message: '幂等键已用于不同的答题请求',
  });
}

function concurrentModification(): ConflictException {
  return new ConflictException({
    code: 'CONCURRENT_MODIFICATION',
    message: '答题状态正被其他请求修改，请使用原幂等键重试',
  });
}

function invalidQuestionState(): ConflictException {
  return new ConflictException({
    code: 'QUESTION_INVALID',
    message: '题目没有且仅有一个正确选项，暂时无法作答',
  });
}

function invalidPointsState(): ConflictException {
  return new ConflictException({
    code: 'POINTS_VALUE_INVALID',
    message: '积分数值超出安全范围，暂时无法完成答题',
  });
}

function normalizeBoundedString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    throw validationFailed(`${fieldName}不能为空`);
  }
  const normalized = value.trim();
  if (!normalized || Array.from(normalized).length > maxLength) {
    throw validationFailed(`${fieldName}长度必须为 1–${maxLength} 个字符`);
  }
  return normalized;
}

function normalizeExcludeIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_EXCLUDED_QUESTIONS) {
    throw validationFailed(
      `排除题目列表最多包含 ${MAX_EXCLUDED_QUESTIONS} 个 ID`,
    );
  }
  const normalized = value.map((id) =>
    normalizeBoundedString(id, '排除题目 ID', MAX_ID_LENGTH),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw validationFailed('排除题目 ID 不能重复');
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function isUniqueConflictFor(
  error: unknown,
  modelName: string,
  fields: string[],
  constraintName: string,
): boolean {
  if (!isRecord(error) || error.code !== 'P2002' || !isRecord(error.meta)) {
    return false;
  }
  const metaModel = error.meta.modelName;
  if (typeof metaModel === 'string' && metaModel !== modelName) {
    return false;
  }
  const driverError = error.meta.driverAdapterError;
  const driverCause = isRecord(driverError) ? driverError.cause : undefined;
  const driverConstraint = isRecord(driverCause)
    ? driverCause.constraint
    : undefined;
  const target =
    error.meta.target ??
    (isRecord(driverConstraint) ? driverConstraint.fields : undefined);
  if (Array.isArray(target)) {
    const targetFields = target
      .filter((field): field is string => typeof field === 'string')
      .map((field) => field.replace(/^"|"$/g, ''));
    return (
      targetFields.length === fields.length &&
      fields.every((field) => targetFields.includes(field))
    );
  }
  if (typeof target === 'string') {
    return (
      target === constraintName ||
      (target.includes(modelName) &&
        fields.every((field) => target.includes(field)))
    );
  }
  return false;
}

function toAnswerResult(attempt: AttemptResultRecord): AnswerResultDto {
  const correctOption = attempt.question.options[0];
  if (attempt.question.options.length !== 1 || !correctOption) {
    throw invalidQuestionState();
  }
  return mapAnswerResult({
    isCorrect: attempt.isCorrect,
    selectedOptionId: attempt.selectedOptionId,
    correctOptionId: correctOption.id,
    explanation: attempt.question.explanation,
    errorCount: attempt.isCorrect ? 0 : 1,
    pointsAwarded: attempt.pointsAwarded,
    balanceAfterSnapshot: attempt.balanceAfterSnapshot,
  });
}

function assertPointCalculation(
  basePoints: number,
  multiplier: number,
  currentBalance: number,
  shouldAward: boolean,
): number {
  if (
    !Number.isInteger(basePoints) ||
    basePoints < 1 ||
    basePoints > MAX_DATABASE_INTEGER ||
    !Number.isInteger(multiplier) ||
    multiplier < 1 ||
    multiplier > 10 ||
    !Number.isInteger(currentBalance) ||
    currentBalance < 0 ||
    currentBalance > MAX_DATABASE_INTEGER
  ) {
    throw invalidPointsState();
  }
  const pointsAwarded = basePoints * multiplier;
  if (
    !Number.isSafeInteger(pointsAwarded) ||
    pointsAwarded > MAX_DATABASE_INTEGER
  ) {
    throw invalidPointsState();
  }
  if (!shouldAward) {
    return 0;
  }
  if (currentBalance + pointsAwarded > MAX_DATABASE_INTEGER) {
    throw invalidPointsState();
  }
  return pointsAwarded;
}

@Injectable()
export class PracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pointsService: PointsService,
  ) {}

  async getRandomQuestion(userId: string, rawExcludeIds: unknown) {
    const normalizedUserId = normalizeBoundedString(
      userId,
      '用户 ID',
      MAX_ID_LENGTH,
    );
    const excludeIds = normalizeExcludeIds(rawExcludeIds);
    const selected = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT question.id
        FROM "Question" AS question
        WHERE question."isActive" = true
          AND NOT EXISTS (
            SELECT 1
            FROM "QuestionProgress" AS progress
            WHERE progress."questionId" = question.id
              AND progress."userId" = ${normalizedUserId}
          )
          AND NOT (question.id = ANY(${excludeIds}::text[]))
        ORDER BY random()
        LIMIT 1
      `,
    );
    const selectedId = selected[0]?.id;
    if (!selectedId) {
      throw noUnansweredQuestions();
    }

    const question = await this.prisma.question.findFirst({
      where: { id: selectedId, isActive: true },
      select: {
        id: true,
        stem: true,
        basePoints: true,
        options: {
          select: {
            id: true,
            label: true,
            content: true,
            position: true,
          },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!question) {
      throw noUnansweredQuestions();
    }
    return mapLearnerQuestion(question);
  }

  async answerFirst(
    userId: string,
    questionId: string,
    selectedOptionId: string,
    idempotencyKey: unknown,
  ): Promise<AnswerResultDto> {
    const normalizedUserId = normalizeBoundedString(
      userId,
      '用户 ID',
      MAX_ID_LENGTH,
    );
    const normalizedQuestionId = normalizeBoundedString(
      questionId,
      '题目 ID',
      MAX_ID_LENGTH,
    );
    const normalizedOptionId = normalizeBoundedString(
      selectedOptionId,
      '选项 ID',
      MAX_ID_LENGTH,
    );
    const normalizedKey = normalizeBoundedString(
      idempotencyKey,
      'Idempotency-Key',
      MAX_IDEMPOTENCY_KEY_LENGTH,
    );

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const replay = await this.findReplay(
            tx,
            normalizedUserId,
            normalizedQuestionId,
            normalizedOptionId,
            normalizedKey,
          );
          if (replay) {
            return replay;
          }

          const question = await tx.question.findUnique({
            where: { id: normalizedQuestionId },
            select: {
              id: true,
              explanation: true,
              basePoints: true,
              isActive: true,
              options: {
                select: { id: true, isCorrect: true },
                orderBy: [{ position: 'asc' }, { id: 'asc' }],
              },
            },
          });
          if (!question?.isActive) {
            throw questionNotFound();
          }
          const selectedOption = question.options.find(
            ({ id }) => id === normalizedOptionId,
          );
          if (!selectedOption) {
            throw validationFailed('所选选项不属于当前题目');
          }
          const correctOptions = question.options.filter(
            ({ isCorrect }) => isCorrect,
          );
          if (correctOptions.length !== 1) {
            throw invalidQuestionState();
          }
          const correctOption = correctOptions[0];

          const multiplier = await this.pointsService.getCurrentMultiplier(tx);
          const user = await tx.user.findUnique({
            where: { id: normalizedUserId },
            select: { pointsBalance: true },
          });
          if (!user) {
            throw new NotFoundException({
              code: 'USER_NOT_FOUND',
              message: '用户不存在',
            });
          }
          const reward = assertPointCalculation(
            question.basePoints,
            multiplier,
            user.pointsBalance,
            selectedOption.isCorrect,
          );
          const pointsAwarded = reward;
          const balanceAfterSnapshot = user.pointsBalance + pointsAwarded;

          await tx.questionProgress.create({
            data: {
              userId: normalizedUserId,
              questionId: normalizedQuestionId,
              firstCorrect: selectedOption.isCorrect,
              errorCount: selectedOption.isCorrect ? 0 : 1,
            },
          });
          const attempt = await tx.answerAttempt.create({
            data: {
              userId: normalizedUserId,
              questionId: normalizedQuestionId,
              selectedOptionId: normalizedOptionId,
              mode: 'FIRST_ATTEMPT',
              isCorrect: selectedOption.isCorrect,
              basePointsSnapshot: question.basePoints,
              multiplierSnapshot: multiplier,
              pointsAwarded,
              balanceAfterSnapshot,
              idempotencyKey: normalizedKey,
            },
            select: { id: true },
          });

          if (selectedOption.isCorrect) {
            const updatedUser = await tx.user.update({
              where: { id: normalizedUserId },
              data: { pointsBalance: { increment: pointsAwarded } },
              select: { pointsBalance: true },
            });
            if (updatedUser.pointsBalance !== balanceAfterSnapshot) {
              throw invalidPointsState();
            }
            await tx.pointLedger.create({
              data: {
                userId: normalizedUserId,
                type: 'ANSWER_REWARD',
                delta: pointsAwarded,
                balanceAfter: balanceAfterSnapshot,
                answerAttemptId: attempt.id,
              },
            });
          }

          return mapAnswerResult({
            isCorrect: selectedOption.isCorrect,
            selectedOptionId: normalizedOptionId,
            correctOptionId: correctOption.id,
            explanation: question.explanation,
            errorCount: selectedOption.isCorrect ? 0 : 1,
            pointsAwarded,
            balanceAfterSnapshot,
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 10_000,
        },
      );
    } catch (error) {
      const attemptConflict = isUniqueConflictFor(
        error,
        'AnswerAttempt',
        ['userId', 'idempotencyKey'],
        'AnswerAttempt_userId_idempotencyKey_key',
      );
      const progressConflict = isUniqueConflictFor(
        error,
        'QuestionProgress',
        ['userId', 'questionId'],
        'QuestionProgress_userId_questionId_key',
      );
      if (
        attemptConflict ||
        progressConflict ||
        hasPrismaCode(error, 'P2034')
      ) {
        const replay = await this.findReplay(
          this.prisma,
          normalizedUserId,
          normalizedQuestionId,
          normalizedOptionId,
          normalizedKey,
        );
        if (replay) {
          return replay;
        }
        if (progressConflict) {
          throw questionAlreadyAnswered();
        }
        throw concurrentModification();
      }
      throw error;
    }
  }

  async getSummary(userId: string) {
    const normalizedUserId = normalizeBoundedString(
      userId,
      '用户 ID',
      MAX_ID_LENGTH,
    );
    const rows = await this.prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
      WITH active_questions AS (
        SELECT
          question.id,
          progress.id AS "progressId",
          progress."firstCorrect",
          progress."masteredAt"
        FROM "Question" AS question
        LEFT JOIN "QuestionProgress" AS progress
          ON progress."questionId" = question.id
          AND progress."userId" = ${normalizedUserId}
        WHERE question."isActive" = true
      )
      SELECT
        COUNT(*)::integer AS "activeTotal",
        COUNT(*) FILTER (WHERE "progressId" IS NOT NULL)::integer
          AS "firstAnsweredCount",
        COUNT(*) FILTER (WHERE "progressId" IS NULL)::integer
          AS "unansweredCount",
        COUNT(*) FILTER (
          WHERE "firstCorrect" = false AND "masteredAt" IS NULL
        )::integer AS "pendingWrongCount",
        COUNT(*) FILTER (
          WHERE "firstCorrect" = false AND "masteredAt" IS NOT NULL
        )::integer AS "masteredWrongCount",
        (
          SELECT "pointsBalance"
          FROM "User"
          WHERE id = ${normalizedUserId}
        ) AS balance
      FROM active_questions
    `);
    const summary = rows[0];
    if (!summary || summary.balance === null) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: '用户不存在',
      });
    }
    return summary;
  }

  private async findReplay(
    client: PracticeClient,
    userId: string,
    questionId: string,
    selectedOptionId: string,
    idempotencyKey: string,
  ): Promise<AnswerResultDto | null> {
    const attempt = await client.answerAttempt.findUnique({
      where: {
        userId_idempotencyKey: {
          userId,
          idempotencyKey,
        },
      },
      select: attemptResultSelection,
    });
    if (!attempt) {
      return null;
    }
    if (
      attempt.mode !== 'FIRST_ATTEMPT' ||
      attempt.questionId !== questionId ||
      attempt.selectedOptionId !== selectedOptionId
    ) {
      throw idempotencyConflict();
    }
    return toAnswerResult(attempt);
  }
}

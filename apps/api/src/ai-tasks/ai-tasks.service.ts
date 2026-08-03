import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AiModelConfig,
  type AiTask,
  type AiTaskRun,
  type Prisma,
} from '@prisma/client';
import {
  decryptSecret,
  resolveEncryptionKey,
} from '../ai-models/secret-crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertCronExpression } from './cron-expression';
import { type CreateAiTaskDto } from './dto/create-ai-task.dto';
import { type ListAiTaskRunsDto } from './dto/list-ai-task-runs.dto';
import { type ListAiTasksDto } from './dto/list-ai-tasks.dto';
import { type UpdateAiTaskDto } from './dto/update-ai-task.dto';
import {
  generateQuestionsWithChatCompletions,
  validateOneGeneratedQuestion,
  type GenerateQuestionsResult,
  type GeneratedQuestion,
} from './generate-questions';

export type AiTaskLatestRunView = {
  id: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  trigger: 'CRON' | 'MANUAL';
  startedAt: string;
  finishedAt: string | null;
  questionsCreated: number;
};

export type AiTaskView = {
  id: string;
  name: string;
  aiModelConfigId: string;
  aiModelName: string;
  questionCount: number;
  optionCount: number;
  basePoints: number;
  cronExpression: string;
  isEnabled: boolean;
  lastWord: string | null;
  createdAt: string;
  updatedAt: string;
  latestRun?: AiTaskLatestRunView | null;
};

export type AiTaskRunView = {
  id: string;
  aiTaskId: string;
  trigger: 'CRON' | 'MANUAL';
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  startedAt: string;
  finishedAt: string | null;
  questionsCreated: number;
  lastWordBefore: string | null;
  lastWordAfter: string | null;
  errorMessage: string | null;
};

type TaskWithModelAndLatestRun = AiTask & {
  aiModelConfig: Pick<AiModelConfig, 'id' | 'name'>;
  runs: AiTaskRun[];
};

function validationFailed(message: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message,
  });
}

function taskNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'AI_TASK_NOT_FOUND',
    message: 'AI 任务不存在',
  });
}

function modelNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'AI_MODEL_NOT_FOUND',
    message: 'AI 模型配置不存在',
  });
}

function nameConflict(): ConflictException {
  return new ConflictException({
    code: 'AI_TASK_NAME_CONFLICT',
    message: '任务名称已存在',
  });
}

function alreadyRunning(): ConflictException {
  return new ConflictException({
    code: 'AI_TASK_ALREADY_RUNNING',
    message: '该任务正在执行中',
  });
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
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

function normalizeInt(
  value: unknown,
  fieldName: string,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw validationFailed(`${fieldName}必须是整数`);
  }
  if (value < min || value > max) {
    throw validationFailed(`${fieldName}必须是 ${min}–${max} 的整数`);
  }
  return value;
}

function normalizeBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw validationFailed(`${fieldName}必须是布尔值`);
  }
  return value;
}

function assertPage(query: { page: number; pageSize: number }) {
  if (
    !Number.isInteger(query.page) ||
    query.page < 1 ||
    query.page > 1_000_000 ||
    !Number.isInteger(query.pageSize) ||
    query.pageSize < 1 ||
    query.pageSize > 100
  ) {
    throw validationFailed('分页参数超出允许范围');
  }
}

function toRunView(run: AiTaskRun): AiTaskRunView {
  return {
    id: run.id,
    aiTaskId: run.aiTaskId,
    trigger: run.trigger,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    questionsCreated: run.questionsCreated,
    lastWordBefore: run.lastWordBefore,
    lastWordAfter: run.lastWordAfter,
    errorMessage: run.errorMessage,
  };
}

function toTaskView(row: TaskWithModelAndLatestRun): AiTaskView {
  const latest = row.runs[0];
  return {
    id: row.id,
    name: row.name,
    aiModelConfigId: row.aiModelConfigId,
    aiModelName: row.aiModelConfig.name,
    questionCount: row.questionCount,
    optionCount: row.optionCount,
    basePoints: row.basePoints,
    cronExpression: row.cronExpression,
    isEnabled: row.isEnabled,
    lastWord: row.lastWord,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    latestRun: latest
      ? {
          id: latest.id,
          status: latest.status,
          trigger: latest.trigger,
          startedAt: latest.startedAt.toISOString(),
          finishedAt: latest.finishedAt?.toISOString() ?? null,
          questionsCreated: latest.questionsCreated,
        }
      : null,
  };
}

const taskInclude = {
  aiModelConfig: { select: { id: true, name: true } },
  runs: {
    orderBy: [{ startedAt: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
  },
} satisfies Prisma.AiTaskInclude;

@Injectable()
export class AiTasksService {
  constructor(private readonly prisma: PrismaService) {}

  private encryptionKey(): Buffer {
    try {
      return resolveEncryptionKey();
    } catch {
      throw validationFailed('AI_CONFIG_ENCRYPTION_KEY 未配置或无效');
    }
  }

  async list(query: ListAiTasksDto) {
    assertPage(query);
    const where: Prisma.AiTaskWhereInput =
      query.isEnabled === undefined ? {} : { isEnabled: query.isEnabled };
    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.aiTask.findMany({
        where,
        include: taskInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.aiTask.count({ where }),
    ]);
    return {
      data: data.map((row) => toTaskView(row)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async get(id: string): Promise<AiTaskView> {
    const row = await this.prisma.aiTask.findUnique({
      where: { id },
      include: taskInclude,
    });
    if (!row) {
      throw taskNotFound();
    }
    return toTaskView(row);
  }

  async create(input: CreateAiTaskDto, userId: string): Promise<AiTaskView> {
    const name = normalizeText(input.name, '任务名称', 100);
    const aiModelConfigId = normalizeText(
      input.aiModelConfigId,
      'AI 模型',
      64,
    );
    const questionCount = normalizeInt(input.questionCount, '题目数量', 1, 50);
    const optionCount = normalizeInt(input.optionCount, '选项数量', 2, 6);
    const basePoints = normalizeInt(input.basePoints, '基础积分', 1, 1000);
    let cronExpression: string;
    try {
      cronExpression = assertCronExpression(
        normalizeText(input.cronExpression, 'crontab', 100),
      );
    } catch (error) {
      throw validationFailed(
        error instanceof Error ? error.message : 'crontab 表达式不合法',
      );
    }
    const isEnabled =
      input.isEnabled === undefined
        ? true
        : normalizeBoolean(input.isEnabled, '启用状态');
    await this.requireEnabledModel(aiModelConfigId);
    try {
      const row = await this.prisma.aiTask.create({
        data: {
          name,
          aiModelConfigId,
          questionCount,
          optionCount,
          basePoints,
          cronExpression,
          isEnabled,
          createdBy: userId,
          updatedBy: userId,
        },
        include: taskInclude,
      });
      return toTaskView(row);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw nameConflict();
      }
      throw error;
    }
  }

  async update(
    id: string,
    input: UpdateAiTaskDto,
    userId: string,
  ): Promise<AiTaskView> {
    await this.requireTask(id);
    const data: Prisma.AiTaskUpdateInput = {
      updater: { connect: { id: userId } },
    };
    if (input.name !== undefined) {
      data.name = normalizeText(input.name, '任务名称', 100);
    }
    if (input.aiModelConfigId !== undefined) {
      const aiModelConfigId = normalizeText(
        input.aiModelConfigId,
        'AI 模型',
        64,
      );
      await this.requireEnabledModel(aiModelConfigId);
      data.aiModelConfig = { connect: { id: aiModelConfigId } };
    }
    if (input.questionCount !== undefined) {
      data.questionCount = normalizeInt(input.questionCount, '题目数量', 1, 50);
    }
    if (input.optionCount !== undefined) {
      data.optionCount = normalizeInt(input.optionCount, '选项数量', 2, 6);
    }
    if (input.basePoints !== undefined) {
      data.basePoints = normalizeInt(input.basePoints, '基础积分', 1, 1000);
    }
    if (input.cronExpression !== undefined) {
      try {
        data.cronExpression = assertCronExpression(
          normalizeText(input.cronExpression, 'crontab', 100),
        );
      } catch (error) {
        throw validationFailed(
          error instanceof Error ? error.message : 'crontab 表达式不合法',
        );
      }
    }
    if (input.isEnabled !== undefined) {
      data.isEnabled = normalizeBoolean(input.isEnabled, '启用状态');
    }
    try {
      const row = await this.prisma.aiTask.update({
        where: { id },
        data,
        include: taskInclude,
      });
      return toTaskView(row);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw nameConflict();
      }
      throw error;
    }
  }

  async remove(id: string): Promise<{ success: true }> {
    await this.requireTask(id);
    await this.prisma.aiTask.delete({ where: { id } });
    return { success: true };
  }

  async listRuns(taskId: string, query: ListAiTaskRunsDto) {
    assertPage(query);
    await this.requireTask(taskId);
    const skip = (query.page - 1) * query.pageSize;
    const where = { aiTaskId: taskId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.aiTaskRun.findMany({
        where,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.aiTaskRun.count({ where }),
    ]);
    return {
      data: data.map(toRunView),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async listEnabledForSchedule(): Promise<
    Array<Pick<AiTask, 'id' | 'cronExpression' | 'updatedBy' | 'isEnabled'>>
  > {
    return this.prisma.aiTask.findMany({
      where: { isEnabled: true },
      select: {
        id: true,
        cronExpression: true,
        updatedBy: true,
        isEnabled: true,
      },
    });
  }

  async runTask(
    taskId: string,
    options: {
      trigger: 'CRON' | 'MANUAL';
      actorUserId: string;
      generate?: (
        input: Parameters<typeof generateQuestionsWithChatCompletions>[0],
      ) => Promise<GenerateQuestionsResult>;
    },
  ): Promise<AiTaskRunView> {
    const task = await this.prisma.aiTask.findUnique({
      where: { id: taskId },
      include: { aiModelConfig: true },
    });
    if (!task) {
      throw taskNotFound();
    }

    let run: AiTaskRun;
    try {
      run = await this.prisma.aiTaskRun.create({
        data: {
          aiTaskId: taskId,
          trigger: options.trigger,
          status: 'RUNNING',
          lastWordBefore: task.lastWord,
        },
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw alreadyRunning();
      }
      throw error;
    }

    const finish = async (
      status: 'SUCCESS' | 'FAILED',
      fields: {
        questionsCreated?: number;
        lastWordAfter?: string | null;
        errorMessage?: string | null;
        nextLastWord?: string | null;
      },
    ): Promise<AiTaskRunView> => {
      const finished = await this.prisma.$transaction(async (tx) => {
        if (fields.nextLastWord !== undefined) {
          await tx.aiTask.update({
            where: { id: taskId },
            data: { lastWord: fields.nextLastWord },
          });
        }
        return tx.aiTaskRun.update({
          where: { id: run.id },
          data: {
            status,
            finishedAt: new Date(),
            questionsCreated: fields.questionsCreated ?? 0,
            lastWordAfter:
              fields.lastWordAfter === undefined
                ? undefined
                : fields.lastWordAfter,
            errorMessage:
              fields.errorMessage === undefined
                ? undefined
                : fields.errorMessage,
          },
        });
      });
      return toRunView(finished);
    };

    if (!task.aiModelConfig.isEnabled) {
      return finish('FAILED', {
        errorMessage: '绑定的 AI 模型已停用',
      });
    }

    let apiKey: string;
    try {
      apiKey = decryptSecret(
        task.aiModelConfig.apiKeyCiphertext,
        this.encryptionKey(),
      );
    } catch {
      return finish('FAILED', {
        errorMessage: 'AI 模型密钥解密失败',
      });
    }

    const generate =
      options.generate ?? generateQuestionsWithChatCompletions;
    const generated = await generate({
      baseUrl: task.aiModelConfig.baseUrl,
      apiKey,
      modelName: task.aiModelConfig.name,
      lastWord: task.lastWord,
      questionCount: task.questionCount,
      optionCount: task.optionCount,
    });

    if (!generated.ok) {
      return finish('FAILED', {
        errorMessage: generated.message,
      });
    }

    const accepted: GeneratedQuestion[] = [];
    const skipMessages: string[] = [];
    let minWordExclusive = task.lastWord?.trim().toLowerCase() || null;
    for (const item of generated.questions) {
      const validated = validateOneGeneratedQuestion(
        item,
        task.optionCount,
        minWordExclusive,
      );
      if (!validated.ok) {
        skipMessages.push(validated.message);
        continue;
      }
      accepted.push(validated.question);
      minWordExclusive = validated.question.word;
    }

    if (accepted.length === 0) {
      return finish('FAILED', {
        errorMessage: skipMessages[0] ?? '未生成任何有效题目',
      });
    }

    try {
      // N≤50：同事务内逐题写入（无循环查询）
      await this.prisma.$transaction(async (tx) => {
        for (const question of accepted) {
          await tx.question.create({
            data: {
              stem: question.stem,
              explanation: question.explanation,
              basePoints: task.basePoints,
              isActive: true,
              createdBy: options.actorUserId,
              options: {
                create: question.options.map((option, index) => ({
                  label: option.label,
                  content: option.content,
                  position: index,
                  isCorrect: option.isCorrect,
                })),
              },
            },
          });
        }
      });
    } catch {
      return finish('FAILED', {
        errorMessage: '写入题库失败',
      });
    }

    const lastWordAfter = accepted[accepted.length - 1]!.word;
    return finish('SUCCESS', {
      questionsCreated: accepted.length,
      lastWordAfter,
      nextLastWord: lastWordAfter,
      errorMessage:
        skipMessages.length > 0
          ? `跳过 ${skipMessages.length} 题：${skipMessages.slice(0, 3).join('；')}`
          : null,
    });
  }

  private async requireTask(id: string): Promise<AiTask> {
    const row = await this.prisma.aiTask.findUnique({ where: { id } });
    if (!row) {
      throw taskNotFound();
    }
    return row;
  }

  private async requireEnabledModel(id: string): Promise<AiModelConfig> {
    const model = await this.prisma.aiModelConfig.findUnique({ where: { id } });
    if (!model) {
      throw modelNotFound();
    }
    if (!model.isEnabled) {
      throw validationFailed('只能绑定已启用的 AI 模型');
    }
    return model;
  }
}

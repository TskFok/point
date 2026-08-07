import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
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
import { isAiTaskStoreResponseBodyEnabled } from './ai-response-body-config';
import { assertCronExpression } from './cron-expression';
import { type CreateAiTaskDto } from './dto/create-ai-task.dto';
import { type ListAiTaskRunsDto } from './dto/list-ai-task-runs.dto';
import { type ListAiTasksDto } from './dto/list-ai-tasks.dto';
import { type UpdateAiTaskDto } from './dto/update-ai-task.dto';
import {
  generateQuestionsWithChatCompletions,
  type DictionaryWord,
  type GenerateQuestionsResult,
} from './generate-questions';

const INTERRUPTED_RUN_MESSAGE = '服务中断，执行未完成';
/** AI 调用超时 60s；超过该阈值的 RUNNING 视为陈旧锁，可被后续调度释放 */
const STALE_RUNNING_MS = 90_000;

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
  lastEntryId: string | null;
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
  lastEntryIdBefore: string | null;
  lastEntryIdAfter: string | null;
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
    lastEntryIdBefore: run.lastEntryIdBefore?.toString() ?? null,
    lastEntryIdAfter: run.lastEntryIdAfter?.toString() ?? null,
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
    lastEntryId: row.lastEntryId?.toString() ?? null,
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
export class AiTasksService implements OnModuleInit {
  private readonly logger = new Logger(AiTasksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const recovered = await this.recoverInterruptedRuns();
    if (recovered > 0) {
      this.logger.warn(
        `Recovered ${recovered} interrupted AI task run(s) left in RUNNING`,
      );
    }
  }

  /**
   * 进程被 docker compose down / SIGKILL 等强杀后，RUNNING 记录会遗留并挡住后续执行。
   * 服务启动时将全部遗留 RUNNING 标记为 FAILED，释放部分唯一索引锁。
   */
  async recoverInterruptedRuns(): Promise<number> {
    const result = await this.prisma.aiTaskRun.updateMany({
      where: { status: 'RUNNING' },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorMessage: INTERRUPTED_RUN_MESSAGE,
      },
    });
    return result.count;
  }

  /**
   * 释放超时仍为 RUNNING 的抢锁记录（例如进程崩溃后未走 onModuleInit 恢复）。
   * @returns 是否释放了至少一条
   */
  private async releaseStaleRunningLocks(taskId: string): Promise<boolean> {
    const result = await this.prisma.aiTaskRun.updateMany({
      where: {
        aiTaskId: taskId,
        status: 'RUNNING',
        startedAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) },
      },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorMessage: INTERRUPTED_RUN_MESSAGE,
      },
    });
    if (result.count > 0) {
      this.logger.warn(
        `Released ${result.count} stale RUNNING run(s) for AI task ${taskId}`,
      );
    }
    return result.count > 0;
  }

  private async createRunningRun(
    taskId: string,
    trigger: 'CRON' | 'MANUAL',
    lastEntryIdBefore: bigint | null,
  ): Promise<AiTaskRun> {
    const data = {
      aiTaskId: taskId,
      trigger,
      status: 'RUNNING' as const,
      lastEntryIdBefore,
    };
    try {
      return await this.prisma.aiTaskRun.create({ data });
    } catch (error) {
      if (!isPrismaError(error, 'P2002')) {
        throw error;
      }
      const released = await this.releaseStaleRunningLocks(taskId);
      if (!released) {
        throw alreadyRunning();
      }
      try {
        return await this.prisma.aiTaskRun.create({ data });
      } catch (retryError) {
        if (isPrismaError(retryError, 'P2002')) {
          throw alreadyRunning();
        }
        throw retryError;
      }
    }
  }

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

    const run = await this.createRunningRun(
      taskId,
      options.trigger,
      task.lastEntryId,
    );

    let settled = false;
    const finish = async (
      status: 'SUCCESS' | 'FAILED',
      fields: {
        questionsCreated?: number;
        lastEntryIdAfter?: bigint | null;
        errorMessage?: string | null;
        nextLastEntryId?: bigint | null;
        aiResponseBody?: string | null;
      },
    ): Promise<AiTaskRunView> => {
      const finished = await this.prisma.$transaction(async (tx) => {
        if (fields.nextLastEntryId !== undefined) {
          await tx.aiTask.update({
            where: { id: taskId },
            data: { lastEntryId: fields.nextLastEntryId },
          });
        }
        return tx.aiTaskRun.update({
          where: { id: run.id },
          data: {
            status,
            finishedAt: new Date(),
            questionsCreated: fields.questionsCreated ?? 0,
            lastEntryIdAfter:
              fields.lastEntryIdAfter === undefined
                ? undefined
                : fields.lastEntryIdAfter,
            errorMessage:
              fields.errorMessage === undefined
                ? undefined
                : fields.errorMessage,
            aiResponseBody:
              fields.aiResponseBody === undefined
                ? undefined
                : fields.aiResponseBody,
          },
        });
      });
      settled = true;
      return toRunView(finished);
    };

    try {
      if (!task.aiModelConfig.isEnabled) {
        return await finish('FAILED', {
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
        return await finish('FAILED', {
          errorMessage: 'AI 模型密钥解密失败',
        });
      }

      const words = await this.listNextEntryWords(
        task.lastEntryId,
        task.questionCount,
      );
      if (words.length === 0) {
        return await finish('FAILED', {
          errorMessage: '词库中没有更多可出题的单词（entry 表 id 游标已到末尾）',
        });
      }

      const generate =
        options.generate ?? generateQuestionsWithChatCompletions;
      const generated = await generate({
        baseUrl: task.aiModelConfig.baseUrl,
        apiKey,
        modelName: task.aiModelConfig.name,
        words,
        optionCount: task.optionCount,
      });

      const aiResponseBody =
        isAiTaskStoreResponseBodyEnabled() &&
        typeof generated.responseBody === 'string'
          ? generated.responseBody
          : undefined;

      const finishAfterGenerate = (
        status: 'SUCCESS' | 'FAILED',
        fields: {
          questionsCreated?: number;
          lastEntryIdAfter?: bigint | null;
          errorMessage?: string | null;
          nextLastEntryId?: bigint | null;
        },
      ) =>
        finish(status, {
          ...fields,
          ...(aiResponseBody !== undefined ? { aiResponseBody } : {}),
        });

      if (!generated.ok) {
        return await finishAfterGenerate('FAILED', {
          errorMessage: generated.message,
        });
      }

      // generate 已按本批词表 1:1 对齐并跳过坏题；此处不再二次 align，避免过滤后错位
      const accepted = generated.questions;
      const skipMessages = generated.skipMessages ?? [];
      const wordMismatchNotes = [...(generated.wordMismatchNotes ?? [])];

      if (accepted.length === 0) {
        return await finishAfterGenerate('FAILED', {
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
        return await finishAfterGenerate('FAILED', {
          errorMessage: '写入题库失败',
        });
      }

      // 游标推进到本批已取出的最大 entry.id（与部分题跳过无关）
      const lastEntryIdAfter = words.reduce((max, item) => {
        const id = BigInt(item.id);
        return id > max ? id : max;
      }, BigInt(words[0]!.id));
      const summaryParts: string[] = [];
      if (skipMessages.length > 0) {
        summaryParts.push(
          `跳过 ${skipMessages.length} 题：${skipMessages.slice(0, 3).join('；')}`,
        );
      }
      if (wordMismatchNotes.length > 0) {
        summaryParts.push(
          `词不一致 ${wordMismatchNotes.length} 处：${wordMismatchNotes.slice(0, 3).join('；')}`,
        );
      }
      return await finishAfterGenerate('SUCCESS', {
        questionsCreated: accepted.length,
        lastEntryIdAfter,
        nextLastEntryId: lastEntryIdAfter,
        errorMessage: summaryParts.length > 0 ? summaryParts.join('。') : null,
      });
    } catch (error) {
      try {
        return await finish('FAILED', {
          errorMessage:
            error instanceof Error ? error.message : '执行异常',
        });
      } catch {
        return {
          id: run.id,
          aiTaskId: taskId,
          trigger: options.trigger,
          status: 'FAILED',
          startedAt: run.startedAt.toISOString(),
          finishedAt: new Date().toISOString(),
          questionsCreated: 0,
          lastEntryIdBefore: task.lastEntryId?.toString() ?? null,
          lastEntryIdAfter: null,
          errorMessage:
            error instanceof Error ? error.message : '执行异常',
        };
      }
    } finally {
      if (!settled) {
        await this.prisma.aiTaskRun.updateMany({
          where: { id: run.id, status: 'RUNNING' },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            errorMessage: INTERRUPTED_RUN_MESSAGE,
          },
        });
      }
    }
  }

  /**
   * 从英文词库 entry 表取游标之后的下一批词条（按 id 升序）。
   * 游标（id > lastEntryId）保证跨轮不重复扫描已取过的行。
   */
  async listNextEntryWords(
    lastEntryId: bigint | null,
    count: number,
  ): Promise<DictionaryWord[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: bigint; word: string; pos: string }>
    >`
      SELECT e.id, e.word, e.pos
      FROM entry e
      WHERE e.lang_code = 'en'
        AND e.pos IS NOT NULL
        AND (${lastEntryId}::bigint IS NULL OR e.id > ${lastEntryId})
      ORDER BY e.id ASC
      LIMIT ${count}
    `;
    return rows.map((row) => ({
      id: row.id.toString(),
      word: row.word,
      pos: row.pos,
    }));
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

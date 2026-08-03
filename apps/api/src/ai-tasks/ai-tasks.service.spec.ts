import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  encryptSecret,
  resolveEncryptionKey,
} from '../ai-models/secret-crypto';
import { AiTasksService } from './ai-tasks.service';

const encryptionKeyBase64 = Buffer.alloc(32, 9).toString('base64');

function makeModel(overrides: Record<string, unknown> = {}) {
  const key = resolveEncryptionKey({
    AI_CONFIG_ENCRYPTION_KEY: encryptionKeyBase64,
  });
  const { ciphertext, last4 } = encryptSecret('sk-test-key-1234', key);
  return {
    id: 'model-1',
    name: 'gpt-test',
    baseUrl: 'https://api.example.com/v1',
    apiKeyCiphertext: ciphertext,
    apiKeyLast4: last4,
    isEnabled: true,
    updatedBy: 'admin-1',
    createdAt: new Date('2026-08-03T00:00:00.000Z'),
    updatedAt: new Date('2026-08-03T00:00:00.000Z'),
    ...overrides,
  };
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    name: '每日词汇',
    aiModelConfigId: 'model-1',
    questionCount: 2,
    optionCount: 2,
    basePoints: 10,
    cronExpression: '0 8 * * *',
    isEnabled: true,
    lastWord: null as string | null,
    createdBy: 'admin-1',
    updatedBy: 'admin-1',
    createdAt: new Date('2026-08-03T00:00:00.000Z'),
    updatedAt: new Date('2026-08-03T00:00:00.000Z'),
    ...overrides,
  };
}

function createService(options?: {
  model?: Record<string, unknown> | null;
  task?: Record<string, unknown> | null;
  runCreateImpl?: (args: {
    data: Record<string, unknown>;
  }) => Promise<unknown>;
  questionCreates?: unknown[];
}) {
  const model = options?.model === undefined ? makeModel() : options.model;
  const task = options?.task === undefined ? makeTask() : options.task;
  const taskState = task ? { ...task } : null;
  const runs: Record<string, unknown>[] = [];
  const questionCreates = options?.questionCreates ?? [];

  const prisma = {
    aiModelConfig: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(model && model.id === where.id ? model : null),
    },
    aiTask: {
      findUnique: ({
        where,
        include,
      }: {
        where: { id: string };
        include?: Record<string, unknown>;
      }) => {
        if (!taskState || taskState.id !== where.id) {
          return Promise.resolve(null);
        }
        if (include?.aiModelConfig) {
          return Promise.resolve({
            ...taskState,
            aiModelConfig: model,
            runs: [],
          });
        }
        if (include) {
          return Promise.resolve({
            ...taskState,
            aiModelConfig: model
              ? { id: model.id, name: model.name }
              : { id: 'missing', name: '' },
            runs: [],
          });
        }
        return Promise.resolve(taskState);
      },
      findMany: () =>
        Promise.resolve(
          taskState
            ? [
                {
                  ...taskState,
                  aiModelConfig: model
                    ? { id: model.id, name: model.name }
                    : { id: 'x', name: '' },
                  runs: [],
                },
              ]
            : [],
        ),
      count: () => Promise.resolve(taskState ? 1 : 0),
      create: ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...makeTask(data),
          id: 'task-1',
          aiModelConfig: { id: model?.id, name: model?.name },
          runs: [],
        }),
      update: ({
        where,
        data,
        include,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
        include?: unknown;
      }) => {
        if (!taskState || taskState.id !== where.id) {
          return Promise.reject(new Error('missing'));
        }
        if (typeof data.lastWord === 'string' || data.lastWord === null) {
          taskState.lastWord = data.lastWord as string | null;
        }
        if (typeof data.name === 'string') taskState.name = data.name;
        if (typeof data.isEnabled === 'boolean') {
          taskState.isEnabled = data.isEnabled;
        }
        if (typeof data.cronExpression === 'string') {
          taskState.cronExpression = data.cronExpression;
        }
        if (data.aiModelConfig && typeof data.aiModelConfig === 'object') {
          const connect = (data.aiModelConfig as { connect?: { id: string } })
            .connect;
          if (connect?.id) taskState.aiModelConfigId = connect.id;
        }
        const view = {
          ...taskState,
          aiModelConfig: model
            ? { id: model.id, name: model.name }
            : { id: 'x', name: '' },
          runs: [],
        };
        return Promise.resolve(include ? view : taskState);
      },
      delete: () => Promise.resolve(taskState),
    },
    aiTaskRun: {
      create:
        options?.runCreateImpl ??
        (({ data }: { data: Record<string, unknown> }) => {
          const run = {
            id: `run-${runs.length + 1}`,
            startedAt: new Date('2026-08-03T02:00:00.000Z'),
            finishedAt: null,
            questionsCreated: 0,
            lastWordAfter: null,
            errorMessage: null,
            ...data,
          };
          runs.push(run);
          return Promise.resolve(run);
        }),
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const run = runs.find((item) => item.id === where.id) ?? {
          id: where.id,
          aiTaskId: 'task-1',
          trigger: 'MANUAL',
          status: 'RUNNING',
          startedAt: new Date('2026-08-03T02:00:00.000Z'),
          questionsCreated: 0,
          lastWordBefore: null,
          lastWordAfter: null,
          errorMessage: null,
        };
        Object.assign(run, data);
        return Promise.resolve(run);
      },
      findMany: () => Promise.resolve([]),
      count: () => Promise.resolve(0),
    },
    question: {
      create: (args: unknown) => {
        questionCreates.push(args);
        return Promise.resolve({ id: `q-${questionCreates.length}` });
      },
    },
    $transaction: async (ops: unknown) => {
      if (Array.isArray(ops)) {
        return Promise.all(ops);
      }
      if (typeof ops === 'function') {
        return ops(prisma);
      }
      return Promise.reject(new Error('unexpected transaction'));
    },
  };

  return {
    service: new AiTasksService(prisma as never),
    taskState,
    questionCreates,
    runs,
  };
}

describe('AiTasksService CRUD', () => {
  const previousKey = process.env.AI_CONFIG_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.AI_CONFIG_ENCRYPTION_KEY = encryptionKeyBase64;
  });

  afterEach(() => {
    process.env.AI_CONFIG_ENCRYPTION_KEY = previousKey;
  });

  it('create 成功返回含模型名的 view', async () => {
    const { service } = createService();
    const created = await service.create(
      {
        name: '每日词汇',
        aiModelConfigId: 'model-1',
        questionCount: 2,
        optionCount: 2,
        basePoints: 10,
        cronExpression: '0 8 * * *',
      },
      'admin-1',
    );
    expect(created.aiModelName).toBe('gpt-test');
    expect(created.cronExpression).toBe('0 8 * * *');
  });

  it('模型未启用时创建失败', async () => {
    const { service } = createService({
      model: makeModel({ isEnabled: false }),
    });
    await expect(
      service.create(
        {
          name: 'x',
          aiModelConfigId: 'model-1',
          questionCount: 1,
          optionCount: 2,
          basePoints: 10,
          cronExpression: '0 8 * * *',
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('非法 crontab 失败', async () => {
    const { service } = createService();
    await expect(
      service.create(
        {
          name: 'x',
          aiModelConfigId: 'model-1',
          questionCount: 1,
          optionCount: 2,
          basePoints: 10,
          cronExpression: 'bad',
        },
        'admin-1',
      ),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
  });

  it('不存在时 NotFound', async () => {
    const { service } = createService({ task: null });
    await expect(service.get('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AiTasksService runTask', () => {
  const previousKey = process.env.AI_CONFIG_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.AI_CONFIG_ENCRYPTION_KEY = encryptionKeyBase64;
  });

  afterEach(() => {
    process.env.AI_CONFIG_ENCRYPTION_KEY = previousKey;
  });

  const sampleQuestions = [
    {
      word: 'abandon',
      stem: 'What does abandon mean?',
      explanation: '放弃',
      options: [
        { label: 'A', content: '放弃', isCorrect: true },
        { label: 'B', content: '获得', isCorrect: false },
      ],
    },
    {
      word: 'ability',
      stem: 'What does ability mean?',
      explanation: '能力',
      options: [
        { label: 'A', content: '能力', isCorrect: true },
        { label: 'B', content: '无力', isCorrect: false },
      ],
    },
  ];

  it('成功生成题目并前进游标', async () => {
    const { service, taskState, questionCreates } = createService();
    const result = await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate: async () => ({ ok: true, questions: sampleQuestions }),
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.questionsCreated).toBe(2);
    expect(result.lastWordAfter).toBe('ability');
    expect(taskState?.lastWord).toBe('ability');
    expect(questionCreates).toHaveLength(2);
  });

  it('生成失败时游标不变', async () => {
    const { service, taskState } = createService({
      task: makeTask({ lastWord: 'cat' }),
    });
    const result = await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate: async () => ({ ok: false, message: 'AI 调用失败' }),
    });
    expect(result.status).toBe('FAILED');
    expect(taskState?.lastWord).toBe('cat');
  });

  it('模型停用时 FAILED', async () => {
    const { service } = createService({
      model: makeModel({ isEnabled: false }),
    });
    const result = await service.runTask('task-1', {
      trigger: 'CRON',
      actorUserId: 'admin-1',
      generate: async () => ({ ok: true, questions: sampleQuestions }),
    });
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/停用/);
  });

  it('已有 RUNNING 时冲突', async () => {
    const { service } = createService({
      runCreateImpl: async () => {
        const error = new Error('unique') as Error & { code: string };
        error.code = 'P2002';
        throw error;
      },
    });
    await expect(
      service.runTask('task-1', {
        trigger: 'MANUAL',
        actorUserId: 'admin-1',
        generate: async () => ({ ok: true, questions: sampleQuestions }),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

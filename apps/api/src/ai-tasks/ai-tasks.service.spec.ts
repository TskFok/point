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

const defaultWordMatchRules = {
  suffixes: [
    's',
    'es',
    'ed',
    'ing',
    'er',
    'est',
    'ies',
    'ied',
    'ying',
    "'s",
  ],
  irregulars: {} as Record<string, string[]>,
};

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
    maxConsecutiveFailures: 0,
    consecutiveFailureCount: 0,
    lastEntryId: null as bigint | null,
    wordMatchRules: { ...defaultWordMatchRules, irregulars: {} },
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
  existingRuns?: Record<string, unknown>[];
  questionCreates?: unknown[];
  /** 模拟 entry 表取词结果（$queryRaw 返回行） */
  entryWords?: Array<{ id: bigint; word: string; pos: string }>;
}) {
  const model = options?.model === undefined ? makeModel() : options.model;
  const task = options?.task === undefined ? makeTask() : options.task;
  const taskState = task ? { ...task } : null;
  const runs: Record<string, unknown>[] = [...(options?.existingRuns ?? [])];
  const questionCreates = options?.questionCreates ?? [];
  const entryWords = options?.entryWords ?? [
    { id: 10n, word: 'abandon', pos: 'verb' },
    { id: 20n, word: 'ability', pos: 'noun' },
  ];

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
      findMany: (args?: {
        where?: { id?: string | { in?: string[] }; isEnabled?: boolean };
        select?: Record<string, unknown>;
        include?: Record<string, unknown>;
      }) => {
        if (!taskState) return Promise.resolve([]);
        if (
          args?.where?.id !== undefined &&
          typeof args.where.id === 'object' &&
          Array.isArray(args.where.id.in) &&
          !args.where.id.in.includes(taskState.id as string)
        ) {
          return Promise.resolve([]);
        }
        if (
          args?.where?.isEnabled !== undefined &&
          taskState.isEnabled !== args.where.isEnabled
        ) {
          return Promise.resolve([]);
        }
        if (args?.select) {
          return Promise.resolve([
            {
              id: taskState.id,
              consecutiveFailureCount: taskState.consecutiveFailureCount,
              maxConsecutiveFailures: taskState.maxConsecutiveFailures,
              cronExpression: taskState.cronExpression,
              updatedBy: taskState.updatedBy,
              isEnabled: taskState.isEnabled,
            },
          ]);
        }
        return Promise.resolve([
          {
            ...taskState,
            aiModelConfig: model
              ? { id: model.id, name: model.name }
              : { id: 'x', name: '' },
            runs: [],
          },
        ]);
      },
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
        if (
          typeof data.lastEntryId === 'bigint' ||
          data.lastEntryId === null
        ) {
          taskState.lastEntryId = data.lastEntryId as bigint | null;
        }
        if (typeof data.name === 'string') taskState.name = data.name;
        if (typeof data.isEnabled === 'boolean') {
          taskState.isEnabled = data.isEnabled;
        }
        if (typeof data.maxConsecutiveFailures === 'number') {
          taskState.maxConsecutiveFailures = data.maxConsecutiveFailures;
        }
        if (typeof data.consecutiveFailureCount === 'number') {
          taskState.consecutiveFailureCount = data.consecutiveFailureCount;
        }
        if (typeof data.cronExpression === 'string') {
          taskState.cronExpression = data.cronExpression;
        }
        if (data.wordMatchRules && typeof data.wordMatchRules === 'object') {
          taskState.wordMatchRules = data.wordMatchRules;
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
          const aiTaskId = String(data.aiTaskId);
          if (
            data.status === 'RUNNING' &&
            runs.some(
              (item) =>
                item.aiTaskId === aiTaskId && item.status === 'RUNNING',
            )
          ) {
            const error = new Error('unique') as Error & { code: string };
            error.code = 'P2002';
            return Promise.reject(error);
          }
          const run = {
            id: `run-${runs.length + 1}`,
            startedAt: new Date('2026-08-03T02:00:00.000Z'),
            finishedAt: null,
            questionsCreated: 0,
            lastEntryIdAfter: null,
            errorMessage: null,
            aiResponseBody: null,
            ...data,
          };
          runs.push(run);
          return Promise.resolve(run);
        }),
      findFirst: ({
        where,
      }: {
        where: { aiTaskId?: string; status?: string };
      }) => {
        const found = runs.find((item) => {
          if (
            where.aiTaskId !== undefined &&
            item.aiTaskId !== where.aiTaskId
          ) {
            return false;
          }
          if (where.status !== undefined && item.status !== where.status) {
            return false;
          }
          return true;
        });
        return Promise.resolve(found ?? null);
      },
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
          lastEntryIdBefore: null,
          lastEntryIdAfter: null,
          errorMessage: null,
          aiResponseBody: null,
        };
        if (!runs.includes(run)) {
          runs.push(run);
        }
        Object.assign(run, data);
        return Promise.resolve(run);
      },
      updateMany: ({
        where,
        data,
      }: {
        where: {
          id?: string | { in?: string[] };
          status?: string;
          aiTaskId?: string;
          startedAt?: { lt?: Date };
        };
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const run of runs) {
          if (typeof where.id === 'string' && run.id !== where.id) {
            continue;
          }
          if (
            where.id !== undefined &&
            typeof where.id === 'object' &&
            Array.isArray(where.id.in) &&
            !where.id.in.includes(String(run.id))
          ) {
            continue;
          }
          if (
            where.aiTaskId !== undefined &&
            run.aiTaskId !== where.aiTaskId
          ) {
            continue;
          }
          if (where.status !== undefined && run.status !== where.status) {
            continue;
          }
          if (where.startedAt?.lt instanceof Date) {
            const startedAt = run.startedAt;
            if (!(startedAt instanceof Date) || !(startedAt < where.startedAt.lt)) {
              continue;
            }
          }
          Object.assign(run, data);
          count += 1;
        }
        return Promise.resolve({ count });
      },
      findMany: (args?: {
        where?: {
          id?: string | { in?: string[] };
          status?: string;
          aiTaskId?: string;
          startedAt?: { lt?: Date };
        };
      }) => {
        const where = args?.where ?? {};
        const matched = runs.filter((item) => {
          if (where.status !== undefined && item.status !== where.status) {
            return false;
          }
          if (
            where.aiTaskId !== undefined &&
            item.aiTaskId !== where.aiTaskId
          ) {
            return false;
          }
          if (
            where.id !== undefined &&
            typeof where.id === 'object' &&
            Array.isArray(where.id.in) &&
            !where.id.in.includes(String(item.id))
          ) {
            return false;
          }
          if (typeof where.id === 'string' && item.id !== where.id) {
            return false;
          }
          if (where.startedAt?.lt instanceof Date) {
            const startedAt = item.startedAt;
            if (
              !(startedAt instanceof Date) ||
              !(startedAt < where.startedAt.lt)
            ) {
              return false;
            }
          }
          return true;
        });
        return Promise.resolve(matched);
      },
      count: () => Promise.resolve(0),
    },
    question: {
      create: (args: unknown) => {
        questionCreates.push(args);
        return Promise.resolve({ id: `q-${questionCreates.length}` });
      },
    },
    $queryRaw: () => Promise.resolve(entryWords),
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
    expect(created.wordMatchRules.suffixes).toContain('s');
  });

  it('create 可写入自定义 wordMatchRules，空规则表示仅原词', async () => {
    const { service } = createService();
    const created = await service.create(
      {
        name: '严格原词',
        aiModelConfigId: 'model-1',
        questionCount: 2,
        optionCount: 2,
        basePoints: 10,
        cronExpression: '0 8 * * *',
        wordMatchRules: { suffixes: [], irregulars: { go: ['went'] } },
      },
      'admin-1',
    );
    expect(created.wordMatchRules).toEqual({
      suffixes: [],
      irregulars: { go: ['went'] },
    });
  });

  it('update 可清空屈折后缀', async () => {
    const { service } = createService();
    const updated = await service.update(
      'task-1',
      { wordMatchRules: { suffixes: [], irregulars: {} } },
      'admin-1',
    );
    expect(updated.wordMatchRules).toEqual({
      suffixes: [],
      irregulars: {},
    });
  });

  it('update 可设置 lastEntryId', async () => {
    const { service } = createService({
      task: makeTask({ lastEntryId: 10n }),
    });
    const updated = await service.update(
      'task-1',
      { lastEntryId: '42' },
      'admin-1',
    );
    expect(updated.lastEntryId).toBe('42');
  });

  it('update 可用 null 或空串清空 lastEntryId', async () => {
    const { service: s1 } = createService({
      task: makeTask({ lastEntryId: 99n }),
    });
    const clearedNull = await s1.update(
      'task-1',
      { lastEntryId: null },
      'admin-1',
    );
    expect(clearedNull.lastEntryId).toBeNull();

    const { service: s2 } = createService({
      task: makeTask({ lastEntryId: 99n }),
    });
    const clearedEmpty = await s2.update(
      'task-1',
      { lastEntryId: '  ' },
      'admin-1',
    );
    expect(clearedEmpty.lastEntryId).toBeNull();
  });

  it('update 非法 lastEntryId 失败', async () => {
    const { service } = createService({
      task: makeTask({ lastEntryId: 10n }),
    });
    for (const bad of ['0', '-1', 'abc', '1.5']) {
      await expect(
        service.update('task-1', { lastEntryId: bad }, 'admin-1'),
      ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    }
  });

  it('update 不带 lastEntryId 时游标不变', async () => {
    const { service } = createService({
      task: makeTask({ lastEntryId: 77n }),
    });
    const updated = await service.update(
      'task-1',
      { name: '改名' },
      'admin-1',
    );
    expect(updated.lastEntryId).toBe('77');
    expect(updated.name).toBe('改名');
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
    expect(result.lastEntryIdAfter).toBe('20');
    expect(taskState?.lastEntryId).toBe(20n);
    expect(questionCreates).toHaveLength(2);
  });

  it('生成失败时游标不变', async () => {
    const { service, taskState } = createService({
      task: makeTask({ lastEntryId: 99n }),
    });
    const result = await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate: async () => ({ ok: false, message: 'AI 调用失败' }),
    });
    expect(result.status).toBe('FAILED');
    expect(taskState?.lastEntryId).toBe(99n);
  });

  it('generate 收到来自 entry 表的词表与词性', async () => {
    const { service } = createService({
      entryWords: [
        { id: 11n, word: 'affect', pos: 'verb' },
        { id: 12n, word: 'afford', pos: 'verb' },
      ],
    });
    const generate = jest.fn().mockResolvedValue({
      ok: false,
      message: 'stop here',
    });
    await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate,
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        words: [
          { id: '11', word: 'affect', pos: 'verb' },
          { id: '12', word: 'afford', pos: 'verb' },
        ],
        optionCount: 2,
      }),
    );
  });

  it('词库无更多单词时 FAILED 且游标不变', async () => {
    const { service, taskState, questionCreates } = createService({
      task: makeTask({ lastEntryId: 999n }),
      entryWords: [],
    });
    const result = await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate: () => Promise.resolve({ ok: true, questions: sampleQuestions }),
    });
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/词库|entry/);
    expect(taskState?.lastEntryId).toBe(999n);
    expect(questionCreates).toHaveLength(0);
  });

  it('runTask 将任务 wordMatchRules 传给 generate', async () => {
    const rules = {
      suffixes: ['ed'],
      irregulars: { go: ['went'] },
    };
    const { service } = createService({
      task: makeTask({ wordMatchRules: rules }),
    });
    let seen: unknown;
    await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate: (input) => {
        seen = input.wordMatchRules;
        return Promise.resolve({
          ok: true as const,
          questions: sampleQuestions,
        });
      },
    });
    expect(seen).toEqual(rules);
  });

  it('按顺序 1:1 对齐：AI word 不一致仍写入期望词并记监控', async () => {
    const { service, taskState, questionCreates } = createService();
    const result = await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate: () =>
        Promise.resolve({
          ok: true as const,
          // generate 层已强制对齐为期望词，并附带 mismatch 监控
          questions: [
            {
              word: 'abandon',
              stem: 'They decided to abandon the plan. What does "abandon" mean?',
              explanation: '他们决定放弃这个计划。「abandon」是动词，表示放弃。',
              options: [
                { label: 'A', content: '放弃', isCorrect: true },
                { label: 'B', content: '获得', isCorrect: false },
              ],
            },
            sampleQuestions[1],
          ],
          wordMismatchNotes: ['abandon: AI返回"kindle"'],
        }),
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.questionsCreated).toBe(2);
    expect(result.errorMessage).toMatch(/词不一致/);
    expect(taskState?.lastEntryId).toBe(20n);
    expect(questionCreates).toHaveLength(2);
    const firstCreate = questionCreates[0] as {
      data: { stem: string };
    };
    expect(firstCreate.data.stem).toMatch(/abandon/i);
  });

  it('按顺序对齐时结构合法的重复返回均可写入', async () => {
    const { service, questionCreates } = createService();
    const result = await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate: () =>
        Promise.resolve({
          ok: true as const,
          questions: [sampleQuestions[0], sampleQuestions[1]],
        }),
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.questionsCreated).toBe(2);
    expect(questionCreates).toHaveLength(2);
  });

  it('同批多个相同 word（不同 entry）按顺序均可出题', async () => {
    const { service, questionCreates, taskState } = createService({
      entryWords: [
        { id: 10n, word: 'dictionary', pos: 'noun' },
        { id: 11n, word: 'Dictionary', pos: 'verb' },
      ],
    });
    const q = {
      word: 'dictionary',
      stem: 'I looked up the word in a dictionary. What does "dictionary" mean?',
      explanation: '我在词典里查了这个词。「dictionary」是名词，表示词典。',
      options: [
        { label: 'A', content: '词典', isCorrect: true },
        { label: 'B', content: '小说', isCorrect: false },
      ],
    };
    const result = await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate: () =>
        Promise.resolve({
          ok: true as const,
          questions: [q, { ...q, explanation: '「dictionary」也可作动词。' }],
        }),
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.questionsCreated).toBe(2);
    expect(questionCreates).toHaveLength(2);
    expect(taskState?.lastEntryId).toBe(11n);
  });

  it('stem 未包含期望词时跳过，全部非法则 FAILED 且游标不变', async () => {
    const { service, taskState, questionCreates } = createService({
      task: makeTask({ lastEntryId: 50n }),
      entryWords: [{ id: 51n, word: 'affect', pos: 'verb' }],
    });
    const result = await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate: () =>
        Promise.resolve({
          ok: false as const,
          message: '题目 affect stem 未包含目标词',
        }),
    });
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/未包含|不包含|word/i);
    expect(result.questionsCreated).toBe(0);
    expect(taskState?.lastEntryId).toBe(50n);
    expect(questionCreates).toHaveLength(0);
  });

  it('部分题 stem 非法时写入合法题并附带跳过摘要', async () => {
    const { service, questionCreates, taskState } = createService();
    const result = await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate: () =>
        Promise.resolve({
          ok: true as const,
          questions: [sampleQuestions[0]],
          skipMessages: [
            '第 2 题（ability）：题目 ability stem 未包含目标词',
          ],
        }),
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.questionsCreated).toBe(1);
    expect(result.errorMessage).toMatch(/跳过 1 题/);
    expect(result.errorMessage).toMatch(/未包含目标词/);
    expect(questionCreates).toHaveLength(1);
    expect(taskState?.lastEntryId).toBe(20n);
  });

  it('超出本批长度的题目被忽略', async () => {
    const { service, questionCreates } = createService({
      entryWords: [{ id: 10n, word: 'abandon', pos: 'verb' }],
      task: makeTask({ questionCount: 1 }),
    });
    const result = await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate: () =>
        Promise.resolve({
          ok: true as const,
          questions: [sampleQuestions[0]],
          skipMessages: ['忽略超出本批的 1 题'],
        }),
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.questionsCreated).toBe(1);
    expect(result.errorMessage).toMatch(/忽略超出本批/);
    expect(questionCreates).toHaveLength(1);
  });

  it('成功后游标推进到本批最大 entry.id', async () => {
    const { service, taskState } = createService();
    const result = await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate: () =>
        Promise.resolve({
          ok: true as const,
          // 按本批顺序 1:1 对位
          questions: [sampleQuestions[0], sampleQuestions[1]],
        }),
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.lastEntryIdAfter).toBe('20');
    expect(taskState?.lastEntryId).toBe(20n);
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

  it('启动恢复会将遗留 RUNNING 标记为 FAILED', async () => {
    const { service, runs } = createService({
      existingRuns: [
        {
          id: 'stale-run',
          aiTaskId: 'task-1',
          trigger: 'CRON',
          status: 'RUNNING',
          startedAt: new Date('2026-08-03T01:00:00.000Z'),
          finishedAt: null,
          questionsCreated: 0,
          lastEntryIdBefore: null,
          lastEntryIdAfter: null,
          errorMessage: null,
          aiResponseBody: null,
        },
        {
          id: 'done-run',
          aiTaskId: 'task-1',
          trigger: 'MANUAL',
          status: 'SUCCESS',
          startedAt: new Date('2026-08-03T00:00:00.000Z'),
          finishedAt: new Date('2026-08-03T00:01:00.000Z'),
          questionsCreated: 2,
          lastEntryIdBefore: null,
          lastEntryIdAfter: '20',
          errorMessage: null,
          aiResponseBody: null,
        },
      ],
    });

    const recovered = await service.recoverInterruptedRuns();

    expect(recovered).toBe(1);
    expect(runs[0]).toMatchObject({
      id: 'stale-run',
      status: 'FAILED',
      errorMessage: expect.stringMatching(/中断|未完成/),
    });
    expect(runs[0]?.finishedAt).toBeInstanceOf(Date);
    expect(runs[1]).toMatchObject({ id: 'done-run', status: 'SUCCESS' });
  });

  it('onModuleInit 会恢复遗留 RUNNING，使后续任务可执行', async () => {
    let createCalls = 0;
    const { service } = createService({
      existingRuns: [
        {
          id: 'stale-run',
          aiTaskId: 'task-1',
          trigger: 'CRON',
          status: 'RUNNING',
          // 未超时：不应被 releaseStaleRunningLocks 自动释放
          startedAt: new Date(),
          finishedAt: null,
          questionsCreated: 0,
          lastEntryIdBefore: null,
          lastEntryIdAfter: null,
          errorMessage: null,
          aiResponseBody: null,
        },
      ],
      runCreateImpl: async ({ data }) => {
        createCalls += 1;
        if (createCalls === 1) {
          const error = new Error('unique') as Error & { code: string };
          error.code = 'P2002';
          throw error;
        }
        return {
          id: 'run-new',
          startedAt: new Date('2026-08-03T02:00:00.000Z'),
          finishedAt: null,
          questionsCreated: 0,
          lastEntryIdAfter: null,
          errorMessage: null,
          aiResponseBody: null,
          ...data,
        };
      },
    });

    await expect(
      service.runTask('task-1', {
        trigger: 'MANUAL',
        actorUserId: 'admin-1',
        generate: async () => ({ ok: true, questions: sampleQuestions }),
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    await service.onModuleInit();

    const result = await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate: async () => ({ ok: true, questions: sampleQuestions }),
    });
    expect(result.status).toBe('SUCCESS');
  });

  it('generate 抛错时将 run 标记为 FAILED 而非遗留 RUNNING', async () => {
    const { service, runs } = createService();
    const result = await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
      generate: async () => {
        throw new Error('unexpected boom');
      },
    });
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/unexpected boom|执行异常/);
    expect(runs[0]).toMatchObject({ status: 'FAILED' });
  });

  it('上次 FAILED 后再次执行不被 ALREADY_RUNNING 拦截', async () => {
    const { service, runs } = createService();
    const first = await service.runTask('task-1', {
      trigger: 'CRON',
      actorUserId: 'admin-1',
      generate: async () => ({ ok: false, message: '模型超时' }),
    });
    expect(first.status).toBe('FAILED');
    expect(runs.filter((run) => run.status === 'RUNNING')).toHaveLength(0);

    const second = await service.runTask('task-1', {
      trigger: 'CRON',
      actorUserId: 'admin-1',
      generate: async () => ({ ok: true, questions: sampleQuestions }),
    });
    expect(second.status).toBe('SUCCESS');
    expect(runs.filter((run) => run.status === 'RUNNING')).toHaveLength(0);
  });

  it('存在陈旧 RUNNING 时自动释放后允许再次执行', async () => {
    const { service, runs } = createService({
      existingRuns: [
        {
          id: 'stale-run',
          aiTaskId: 'task-1',
          trigger: 'CRON',
          status: 'RUNNING',
          startedAt: new Date(Date.now() - 5 * 60 * 1000),
          finishedAt: null,
          questionsCreated: 0,
          lastEntryIdBefore: null,
          lastEntryIdAfter: null,
          errorMessage: null,
          aiResponseBody: null,
        },
      ],
    });

    const result = await service.runTask('task-1', {
      trigger: 'CRON',
      actorUserId: 'admin-1',
      generate: async () => ({ ok: true, questions: sampleQuestions }),
    });

    expect(result.status).toBe('SUCCESS');
    expect(runs.find((run) => run.id === 'stale-run')).toMatchObject({
      status: 'FAILED',
    });
  });

  it('开关关闭时不写入 aiResponseBody', async () => {
    const previous = process.env.AI_TASK_STORE_RESPONSE_BODY;
    process.env.AI_TASK_STORE_RESPONSE_BODY = 'false';
    try {
      const { service, runs } = createService();
      await service.runTask('task-1', {
        trigger: 'MANUAL',
        actorUserId: 'admin-1',
        generate: async () => ({
          ok: true,
          questions: sampleQuestions,
          responseBody: '{"choices":[]}',
        }),
      });
      expect(runs[0]?.aiResponseBody ?? null).toBeNull();
    } finally {
      if (previous === undefined) {
        delete process.env.AI_TASK_STORE_RESPONSE_BODY;
      } else {
        process.env.AI_TASK_STORE_RESPONSE_BODY = previous;
      }
    }
  });

  it('开关开启时写入完整 responseBody', async () => {
    const previous = process.env.AI_TASK_STORE_RESPONSE_BODY;
    process.env.AI_TASK_STORE_RESPONSE_BODY = 'true';
    try {
      const { service, runs } = createService();
      const body =
        '{"id":"chatcmpl-1","choices":[{"message":{"content":"[]"}}]}';
      await service.runTask('task-1', {
        trigger: 'MANUAL',
        actorUserId: 'admin-1',
        generate: async () => ({
          ok: true,
          questions: sampleQuestions,
          responseBody: body,
        }),
      });
      expect(runs[0]?.aiResponseBody).toBe(body);
    } finally {
      if (previous === undefined) {
        delete process.env.AI_TASK_STORE_RESPONSE_BODY;
      } else {
        process.env.AI_TASK_STORE_RESPONSE_BODY = previous;
      }
    }
  });

  it('开关开启但无 responseBody 时保持 null', async () => {
    const previous = process.env.AI_TASK_STORE_RESPONSE_BODY;
    process.env.AI_TASK_STORE_RESPONSE_BODY = '1';
    try {
      const { service, runs } = createService();
      await service.runTask('task-1', {
        trigger: 'MANUAL',
        actorUserId: 'admin-1',
        generate: async () => ({ ok: false, message: 'AI 调用超时' }),
      });
      expect(runs[0]?.status).toBe('FAILED');
      expect(runs[0]?.aiResponseBody ?? null).toBeNull();
    } finally {
      if (previous === undefined) {
        delete process.env.AI_TASK_STORE_RESPONSE_BODY;
      } else {
        process.env.AI_TASK_STORE_RESPONSE_BODY = previous;
      }
    }
  });
});

describe('连续失败停用', () => {
  const previousKey = process.env.AI_CONFIG_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.AI_CONFIG_ENCRYPTION_KEY = encryptionKeyBase64;
  });

  afterEach(() => {
    process.env.AI_CONFIG_ENCRYPTION_KEY = previousKey;
    jest.restoreAllMocks();
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

  it('连续 cron FAILED 达阈值后停用', async () => {
    const { service, taskState } = createService({
      task: makeTask({ maxConsecutiveFailures: 2, consecutiveFailureCount: 1 }),
      entryWords: [],
    });
    await service.runTask('task-1', {
      trigger: 'CRON',
      actorUserId: 'admin-1',
    });
    expect(taskState?.consecutiveFailureCount).toBe(2);
    expect(taskState?.isEnabled).toBe(false);
  });

  it('cron SUCCESS 清零连续失败计数', async () => {
    const { service, taskState } = createService({
      task: makeTask({
        maxConsecutiveFailures: 3,
        consecutiveFailureCount: 2,
      }),
    });
    const result = await service.runTask('task-1', {
      trigger: 'CRON',
      actorUserId: 'admin-1',
      generate: async () => ({ ok: true, questions: sampleQuestions }),
    });
    expect(result.status).toBe('SUCCESS');
    expect(taskState?.consecutiveFailureCount).toBe(0);
    expect(taskState?.isEnabled).toBe(true);
  });

  it('阈值 0 时失败递增但不停用', async () => {
    const { service, taskState } = createService({
      task: makeTask({ maxConsecutiveFailures: 0, consecutiveFailureCount: 5 }),
      entryWords: [],
    });
    await service.runTask('task-1', {
      trigger: 'CRON',
      actorUserId: 'admin-1',
    });
    expect(taskState?.consecutiveFailureCount).toBe(6);
    expect(taskState?.isEnabled).toBe(true);
  });

  it('manual FAILED 不改变计数与启用状态', async () => {
    const { service, taskState } = createService({
      task: makeTask({
        maxConsecutiveFailures: 1,
        consecutiveFailureCount: 0,
        isEnabled: true,
      }),
      entryWords: [],
    });
    await service.runTask('task-1', {
      trigger: 'MANUAL',
      actorUserId: 'admin-1',
    });
    expect(taskState?.consecutiveFailureCount).toBe(0);
    expect(taskState?.isEnabled).toBe(true);
  });

  it('重新启用时清零连续失败计数', async () => {
    const { service, taskState } = createService({
      task: makeTask({
        isEnabled: false,
        consecutiveFailureCount: 3,
        maxConsecutiveFailures: 3,
      }),
    });
    await service.update('task-1', { isEnabled: true }, 'admin-1');
    expect(taskState?.isEnabled).toBe(true);
    expect(taskState?.consecutiveFailureCount).toBe(0);
  });

  it('recoverInterruptedRuns 将 cron RUNNING 计为失败并可达阈值停用', async () => {
    const { service, taskState, runs } = createService({
      task: makeTask({ maxConsecutiveFailures: 1, consecutiveFailureCount: 0 }),
      existingRuns: [
        {
          id: 'stuck-cron',
          aiTaskId: 'task-1',
          trigger: 'CRON',
          status: 'RUNNING',
          startedAt: new Date('2026-08-03T01:00:00.000Z'),
          finishedAt: null,
          questionsCreated: 0,
          lastEntryIdBefore: null,
          lastEntryIdAfter: null,
          errorMessage: null,
          aiResponseBody: null,
        },
      ],
    });
    const count = await service.recoverInterruptedRuns();
    expect(count).toBe(1);
    expect(runs[0]?.status).toBe('FAILED');
    expect(taskState?.consecutiveFailureCount).toBe(1);
    expect(taskState?.isEnabled).toBe(false);
  });

  it('recoverInterruptedRuns 对 MANUAL RUNNING 不计失败次数', async () => {
    const { service, taskState } = createService({
      task: makeTask({ maxConsecutiveFailures: 1, consecutiveFailureCount: 0 }),
      existingRuns: [
        {
          id: 'stuck-manual',
          aiTaskId: 'task-1',
          trigger: 'MANUAL',
          status: 'RUNNING',
          startedAt: new Date('2026-08-03T01:00:00.000Z'),
          finishedAt: null,
          questionsCreated: 0,
          lastEntryIdBefore: null,
          lastEntryIdAfter: null,
          errorMessage: null,
          aiResponseBody: null,
        },
      ],
    });
    await service.recoverInterruptedRuns();
    expect(taskState?.consecutiveFailureCount).toBe(0);
    expect(taskState?.isEnabled).toBe(true);
  });
});

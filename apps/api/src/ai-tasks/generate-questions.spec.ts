import {
  buildGeneratePrompt,
  generateQuestionsWithChatCompletions,
  parseGeneratedQuestionsJson,
  shuffleQuestionOptions,
  summarizeApiErrorBody,
  summarizeNonJsonResponse,
  truncateErrorDetail,
  validateOneGeneratedQuestion,
  type DictionaryWord,
} from './generate-questions';
import {
  DEFAULT_WORD_MATCH_RULES,
  EMPTY_WORD_MATCH_RULES,
} from './word-match-rules';

const abandonWords: DictionaryWord[] = [
  { id: '1', word: 'abandon', pos: 'verb' },
];

describe('error detail helpers', () => {
  it('truncateErrorDetail 超过上限时截断并加省略号', () => {
    const long = 'a'.repeat(520);
    const result = truncateErrorDetail(long, 500);
    expect(result.length).toBe(501);
    expect(result.endsWith('…')).toBe(true);
  });

  it('summarizeApiErrorBody 优先取 error.message', () => {
    expect(
      summarizeApiErrorBody(
        JSON.stringify({ error: { message: 'rate limited' } }),
      ),
    ).toBe('rate limited');
  });

  it('summarizeNonJsonResponse 空体时标明并附带 Content-Type', () => {
    expect(
      summarizeNonJsonResponse('  ', new SyntaxError('Unexpected end of JSON'), 'text/plain'),
    ).toBe(
      'Unexpected end of JSON；响应体为空；Content-Type: text/plain',
    );
  });

  it('summarizeNonJsonResponse 附带 body 与解析错误', () => {
    expect(
      summarizeNonJsonResponse(
        '<html>oops</html>',
        new SyntaxError("Unexpected token '<'"),
        'text/html',
      ),
    ).toBe(
      "Unexpected token '<'；<html>oops</html>；Content-Type: text/html",
    );
  });
});

describe('generate-questions parse', () => {
  const sample = JSON.stringify([
    {
      word: 'abandon',
      stem: 'They decided to abandon the plan. What does "abandon" mean?',
      explanation: '放弃',
      options: [
        { label: 'A', content: '放弃', isCorrect: true },
        { label: 'B', content: '获得', isCorrect: false },
      ],
    },
  ]);

  it('解析合法 JSON', () => {
    const result = parseGeneratedQuestionsJson(sample, 2, abandonWords,
      DEFAULT_WORD_MATCH_RULES,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.questions[0]?.word).toBe('abandon');
  });

  it('非 JSON 数组时附带返回内容', () => {
    const raw = '{"error":"I cannot generate questions"}';
    const result = parseGeneratedQuestionsJson(raw, 2, abandonWords,
      DEFAULT_WORD_MATCH_RULES,
    );
    expect(result).toEqual({
      ok: false,
      message: `AI 返回不是 JSON 数组：${raw}`,
    });
  });

  it('无法提取数组时附带返回内容并截断过长文本', () => {
    const raw = `Sorry, here is prose. ${'x'.repeat(520)}`;
    const result = parseGeneratedQuestionsJson(raw, 2, abandonWords,
      DEFAULT_WORD_MATCH_RULES,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.startsWith('AI 返回不是 JSON 数组：')).toBe(true);
      expect(result.message).toContain('Sorry, here is prose.');
      expect(result.message.endsWith('…')).toBe(true);
      expect(result.message.length).toBe('AI 返回不是 JSON 数组：'.length + 501);
    }
  });

  it('AI word 与期望不一致时强制对齐并记录 mismatch', () => {
    const raw = JSON.stringify([
      {
        word: 'wrong',
        stem: 'They decided to abandon the plan. What does "abandon" mean?',
        explanation: '放弃',
        options: [
          { label: 'A', content: '放弃', isCorrect: true },
          { label: 'B', content: '获得', isCorrect: false },
        ],
      },
    ]);
    const result = parseGeneratedQuestionsJson(raw, 2, abandonWords,
      DEFAULT_WORD_MATCH_RULES,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.questions[0]?.word).toBe('abandon');
      expect(result.wordMismatchNotes.join(' ')).toMatch(/wrong/);
    }
  });

  it('按顺序对齐时同批重复返回也接受（word 强制为本批对应词）', () => {
    const item = {
      word: 'abandon',
      stem: 'They decided to abandon the plan. What does "abandon" mean?',
      explanation: '放弃',
      options: [
        { label: 'A', content: '放弃', isCorrect: true },
        { label: 'B', content: '获得', isCorrect: false },
      ],
    };
    const words: DictionaryWord[] = [
      { id: '1', word: 'abandon', pos: 'verb' },
      { id: '2', word: 'abandon', pos: 'noun' },
    ];
    const result = parseGeneratedQuestionsJson(
      JSON.stringify([item, item]),
      2,
      words,
      DEFAULT_WORD_MATCH_RULES,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.questions).toHaveLength(2);
      expect(result.questions.map((q) => q.word)).toEqual([
        'abandon',
        'abandon',
      ]);
    }
  });

  it('prompt 包含词表、词性与数量', () => {
    const p = buildGeneratePrompt({
      words: [
        { id: '1', word: 'cat', pos: 'noun' },
        { id: '2', word: 'catch', pos: 'verb' },
        { id: '3', word: 'cater', pos: 'verb' },
      ],
      optionCount: 4,
      wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    });
    expect(p).toMatch(/"cat" \(noun\)/);
    expect(p).toMatch(/"catch" \(verb\)/);
    expect(p).toMatch(/"cater" \(verb\)/);
    expect(p).toMatch(/exactly 3/);
    expect(p).toMatch(/4 options/);
  });

  it('prompt 要求仅使用给定词表且不得增删重复', () => {
    const p = buildGeneratePrompt({
      words: abandonWords,
      optionCount: 4,
      wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    });
    const lower = p.toLowerCase();
    expect(lower).toMatch(/only the words/);
    expect(lower).toMatch(/never invent|never replace|never skip/);
  });

  it('prompt 要求按给定词性出题且解析说明词性', () => {
    const p = buildGeneratePrompt({
      words: abandonWords,
      optionCount: 4,
      wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    });
    const lower = p.toLowerCase();
    expect(lower).toMatch(/part of speech/);
    expect(p).toMatch(/名词|动词|形容词/);
    expect(p).toMatch(/是动词/);
  });

  it('validateOneGeneratedQuestion 按期望词对齐并接受结构合法题目', () => {
    const result = validateOneGeneratedQuestion(
      {
        word: 'able',
        stem: 'She is able to finish the work. What does "able" mean?',
        explanation: '能够的',
        options: [
          { label: 'A', content: '能够的', isCorrect: true },
          { label: 'B', content: '无能的', isCorrect: false },
        ],
      },
      2,
      'able',
      DEFAULT_WORD_MATCH_RULES,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.question.word).toBe('able');
      expect(result.wordMismatch).toBe(false);
    }
  });

  it('validate 强制使用期望词，AI 回传不同则标记 mismatch', () => {
    const result = validateOneGeneratedQuestion(
      {
        word: 'kindle',
        stem: 'I looked up the word in a dictionary. What does "dictionary" mean?',
        explanation: '我在词典里查了这个词。「dictionary」是名词，表示词典。',
        options: [
          { label: 'A', content: '词典', isCorrect: true },
          { label: 'B', content: '小说', isCorrect: false },
        ],
      },
      2,
      'Dictionary',
      DEFAULT_WORD_MATCH_RULES,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.question.word).toBe('dictionary');
      expect(result.wordMismatch).toBe(true);
      expect(result.returnedWord).toBe('kindle');
    }
  });

  it('prompt 要求完整例句包含 word 且禁止挖空', () => {
    const p = buildGeneratePrompt({
      words: abandonWords,
      optionCount: 4,
      wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    });
    expect(p.toLowerCase()).toMatch(/must include/);
    expect(p.toLowerCase()).toMatch(/blank|___|placeholder/);
    expect(p.toLowerCase()).toMatch(/what does/);
  });

  it('prompt 要求按配置后缀允许变形且禁止换词', () => {
    const p = buildGeneratePrompt({
      words: abandonWords,
      optionCount: 4,
      wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    });
    const lower = p.toLowerCase();
    expect(lower).toMatch(/suffix/);
    expect(p).toContain('"s"');
    expect(lower).toMatch(/substitut|replace|near[- ]?form|look[- ]?alike/);
  });

  it('空规则时 prompt 要求 exact form', () => {
    const p = buildGeneratePrompt({
      words: abandonWords,
      optionCount: 4,
      wordMatchRules: { suffixes: [], irregulars: {} },
    });
    expect(p.toLowerCase()).toMatch(/exact/);
  });

  it('prompt 要求 explanation 含整句译文与词义说明', () => {
    const p = buildGeneratePrompt({
      words: abandonWords,
      optionCount: 4,
      wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    });
    const lower = p.toLowerCase();
    expect(lower).toMatch(/explanation/);
    expect(lower).toMatch(/translat/);
    expect(p).toMatch(/放弃|abandon|词义|meaning/i);
  });

  it('prompt 要求 JSON 字符串内双引号必须转义', () => {
    const p = buildGeneratePrompt({
      words: abandonWords,
      optionCount: 4,
      wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    });
    expect(p).toMatch(/escape/i);
    expect(p).toContain('What does \\"abhor\\" mean?');
    expect(p).toContain('\\"');
  });

  it('拒绝 stem 含挖空占位', () => {
    const result = validateOneGeneratedQuestion(
      {
        word: 'abhor',
        stem: 'The scholar claimed to ___ violence in all forms.',
        explanation: '憎恶',
        options: [
          { label: 'A', content: '憎恶', isCorrect: true },
          { label: 'B', content: '崇拜', isCorrect: false },
        ],
      },
      2,
      'abhor',
      DEFAULT_WORD_MATCH_RULES,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/挖空|blank|___/i);
  });

  it('拒绝 stem 未包含期望词', () => {
    const result = validateOneGeneratedQuestion(
      {
        word: 'abhor',
        stem: 'What does this word mean in context?',
        explanation: '憎恶',
        options: [
          { label: 'A', content: '憎恶', isCorrect: true },
          { label: 'B', content: '崇拜', isCorrect: false },
        ],
      },
      2,
      'abhor',
      DEFAULT_WORD_MATCH_RULES,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/未包含|不包含|word/i);
  });

  it('接受 stem 含目标词常见变形（如 whys）', () => {
    const result = validateOneGeneratedQuestion(
      {
        word: 'why',
        stem: 'She whys at every decision, which annoys her boss.',
        explanation: '她对每个决定都问为什么。「why」作动词，表示问为什么。',
        options: [
          { label: 'A', content: '问为什么', isCorrect: true },
          { label: 'B', content: '解释', isCorrect: false },
        ],
      },
      2,
      'why',
      DEFAULT_WORD_MATCH_RULES,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.question.word).toBe('why');
  });

  it('空规则时拒绝 stem 仅含变形 whys', () => {
    const result = validateOneGeneratedQuestion(
      {
        word: 'why',
        stem: 'She whys at every decision, which annoys her boss.',
        explanation: '问为什么',
        options: [
          { label: 'A', content: '问为什么', isCorrect: true },
          { label: 'B', content: '解释', isCorrect: false },
        ],
      },
      2,
      'why',
      EMPTY_WORD_MATCH_RULES,
    );
    expect(result.ok).toBe(false);
  });

  it('不规则映射接受 went 作为 go', () => {
    const result = validateOneGeneratedQuestion(
      {
        word: 'go',
        stem: 'He went home early. What does "go" mean?',
        explanation: '他早早回家了。「go」是动词，表示去。',
        options: [
          { label: 'A', content: '去', isCorrect: true },
          { label: 'B', content: '来', isCorrect: false },
        ],
      },
      2,
      'go',
      { suffixes: [], irregulars: { go: ['went', 'gone'] } },
    );
    expect(result.ok).toBe(true);
  });

  it('接受 stem 含复数变形 whys 的整批解析', () => {
    const words: DictionaryWord[] = [
      { id: '1', word: 'why', pos: 'verb' },
      { id: '2', word: 'why', pos: 'noun' },
    ];
    const raw = JSON.stringify([
      {
        word: 'why',
        stem: 'She whys at every decision, which annoys her boss.',
        explanation: '问为什么',
        options: [
          { label: 'A', content: '问为什么', isCorrect: true },
          { label: 'B', content: '解释', isCorrect: false },
        ],
      },
      {
        word: 'why',
        stem: 'The whys of the accident remain unknown.',
        explanation: '原因',
        options: [
          { label: 'A', content: '原因', isCorrect: true },
          { label: 'B', content: '结果', isCorrect: false },
        ],
      },
    ]);
    const result = parseGeneratedQuestionsJson(raw, 2, words,
      DEFAULT_WORD_MATCH_RULES,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.questions).toHaveLength(2);
    expect(result.skipMessages).toEqual([]);
  });

  it('拒绝无关近形词（如 catch 不能当作 cat）', () => {
    const result = validateOneGeneratedQuestion(
      {
        word: 'cat',
        stem: 'He tried to catch the ball. What does "catch" mean?',
        explanation: '抓住',
        options: [
          { label: 'A', content: '猫', isCorrect: true },
          { label: 'B', content: '狗', isCorrect: false },
        ],
      },
      2,
      'cat',
      DEFAULT_WORD_MATCH_RULES,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/未包含目标词/);
  });

  it('全部 stem 未含目标词时解析失败', () => {
    const words: DictionaryWord[] = [
      { id: '1', word: 'why', pos: 'verb' },
    ];
    const raw = JSON.stringify([
      {
        word: 'why',
        stem: 'She always questions every decision.',
        explanation: '问为什么',
        options: [
          { label: 'A', content: '问为什么', isCorrect: true },
          { label: 'B', content: '解释', isCorrect: false },
        ],
      },
    ]);
    const result = parseGeneratedQuestionsJson(raw, 2, words,
      DEFAULT_WORD_MATCH_RULES,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/未包含目标词/);
  });

  it('接受含完整期望词的例句题干', () => {
    const result = validateOneGeneratedQuestion(
      {
        word: 'abhor',
        stem: 'The scholar claimed to abhor violence in all forms. What does "abhor" mean?',
        explanation: '憎恶、痛恨',
        options: [
          { label: 'A', content: '憎恶', isCorrect: true },
          { label: 'B', content: '崇拜', isCorrect: false },
        ],
      },
      2,
      'abhor',
      DEFAULT_WORD_MATCH_RULES,
    );
    expect(result.ok).toBe(true);
  });

  it('接受含连字符等非纯字母期望词', () => {
    const result = validateOneGeneratedQuestion(
      {
        word: 'self-aware',
        stem: 'She became more self-aware after the talk. What does "self-aware" mean?',
        explanation:
          '她谈话后更有自我意识了。「self-aware」是形容词，表示有自我意识的。',
        options: [
          { label: 'A', content: '有自我意识的', isCorrect: true },
          { label: 'B', content: '疏忽的', isCorrect: false },
        ],
      },
      2,
      'self-aware',
      DEFAULT_WORD_MATCH_RULES,
    );
    expect(result.ok).toBe(true);
  });
});

describe('shuffleQuestionOptions', () => {
  it('按固定 rng 打乱并重标 A/B/C，正解跟随内容', () => {
    const options = [
      { label: 'A', content: '正确', isCorrect: true },
      { label: 'B', content: '错1', isCorrect: false },
      { label: 'C', content: '错2', isCorrect: false },
    ];
    const values = [0.9, 0.1];
    let i = 0;
    const rng = () => values[i++] ?? 0;
    const shuffled = shuffleQuestionOptions(options, rng);
    expect(shuffled.map((o) => o.content)).not.toEqual([
      '正确',
      '错1',
      '错2',
    ]);
    expect(shuffled.map((o) => o.label)).toEqual(['A', 'B', 'C']);
    expect(shuffled.filter((o) => o.isCorrect)).toHaveLength(1);
    expect(shuffled.find((o) => o.isCorrect)?.content).toBe('正确');
  });

  it('parseGeneratedQuestionsJson 出口已洗牌（固定 rng）', () => {
    const raw = JSON.stringify([
      {
        word: 'abandon',
        stem: 'They decided to abandon the plan. What does "abandon" mean?',
        explanation: '他们决定放弃这个计划。「abandon」表示放弃。',
        options: [
          { label: 'A', content: '放弃', isCorrect: true },
          { label: 'B', content: '获得', isCorrect: false },
          { label: 'C', content: '坚持', isCorrect: false },
          { label: 'D', content: '拒绝', isCorrect: false },
        ],
      },
    ]);
    const values = [0.99, 0.01, 0.5];
    let i = 0;
    const result = parseGeneratedQuestionsJson(
      raw,
      4,
      abandonWords,
      DEFAULT_WORD_MATCH_RULES,
      () => values[i++] ?? 0,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const labels = result.questions[0]!.options.map((o) => o.label);
    expect(labels).toEqual(['A', 'B', 'C', 'D']);
    expect(
      result.questions[0]!.options.find((o) => o.isCorrect)?.content,
    ).toBe('放弃');
    expect(result.questions[0]!.options.map((o) => o.content)).not.toEqual([
      '放弃',
      '获得',
      '坚持',
      '拒绝',
    ]);
  });
});

describe('generateQuestionsWithChatCompletions', () => {
  it('mock fetch 成功返回题目', async () => {
    const rawBody = JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                word: 'abandon',
                stem: 'They decided to abandon the plan. What does "abandon" mean?',
                explanation: '放弃',
                options: [
                  { label: 'A', content: '放弃', isCorrect: true },
                  { label: 'B', content: '获得', isCorrect: false },
                ],
              },
            ]),
          },
        },
      ],
    });
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => rawBody,
    });
    const result = await generateQuestionsWithChatCompletions({
      baseUrl: 'https://api.example.com/v1/',
      apiKey: 'test-key',
      modelName: 'gpt-test',
      words: abandonWords,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responseBody).toBe(rawBody);
    }
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    );
  });

  it('system prompt 要求 JSON 字符串内双引号必须转义', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  {
                    word: 'abandon',
                    stem: 'They decided to abandon the plan. What does "abandon" mean?',
                    explanation: '放弃',
                    options: [
                      { label: 'A', content: '放弃', isCorrect: true },
                      { label: 'B', content: '获得', isCorrect: false },
                    ],
                  },
                ]),
              },
            },
          ],
        }),
    });
    await generateQuestionsWithChatCompletions({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'test-key',
      modelName: 'gpt-test',
      words: abandonWords,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    });
    const init = fetchImpl.mock.calls[0]?.[1] as { body: string };
    const body = JSON.parse(init.body) as {
      messages: Array<{ role: string; content: string }>;
    };
    const system = body.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(system).toMatch(/escape/i);
    expect(system).toContain('\\"');
  });

  it('HTTP 非 2xx 返回失败并附带 API error.message', async () => {
    const rawBody = JSON.stringify({ error: { message: 'Invalid API key' } });
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => rawBody,
    });
    const result = await generateQuestionsWithChatCompletions({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'test-key',
      modelName: 'gpt-test',
      words: abandonWords,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    });
    expect(result).toEqual({
      ok: false,
      message: 'AI 调用失败 HTTP 401：Invalid API key',
      responseBody: rawBody,
    });
  });

  it('HTTP 非 2xx 无结构化 message 时附带原始 body 摘要', async () => {
    const rawBody = 'service unavailable';
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => rawBody,
    });
    const result = await generateQuestionsWithChatCompletions({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'test-key',
      modelName: 'gpt-test',
      words: abandonWords,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    });
    expect(result).toEqual({
      ok: false,
      message: 'AI 调用失败 HTTP 503：service unavailable',
      responseBody: rawBody,
    });
  });

  it('超时时附带底层 Error.message', async () => {
    const timeoutError = new Error('The operation was aborted due to timeout');
    timeoutError.name = 'TimeoutError';
    const fetchImpl = jest.fn().mockRejectedValue(timeoutError);
    const result = await generateQuestionsWithChatCompletions({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'test-key',
      modelName: 'gpt-test',
      words: abandonWords,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    });
    expect(result).toEqual({
      ok: false,
      message:
        'AI 调用超时：The operation was aborted due to timeout',
    });
    expect('responseBody' in result).toBe(false);
  });

  it('网络失败时附带底层 Error.message', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValue(new Error('fetch failed'));
    const result = await generateQuestionsWithChatCompletions({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'test-key',
      modelName: 'gpt-test',
      words: abandonWords,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    });
    expect(result).toEqual({
      ok: false,
      message: 'AI 调用网络失败：fetch failed',
    });
    expect('responseBody' in result).toBe(false);
  });

  it('响应非 JSON 时附带解析错误与原始文本摘要', async () => {
    const rawBody = '<html>bad gateway</html>';
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      text: async () => rawBody,
    });
    const result = await generateQuestionsWithChatCompletions({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'test-key',
      modelName: 'gpt-test',
      words: abandonWords,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('AI 响应不是 JSON');
      expect(result.message).toContain('<html>bad gateway</html>');
      expect(result.message).toMatch(/Unexpected token|is not valid JSON/i);
      expect(result.message).toContain('Content-Type: text/html');
      expect(result.responseBody).toBe(rawBody);
    }
  });

  it('响应体为空时标明空体并附带 Content-Type', async () => {
    const rawBody = '   ';
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/plain' },
      text: async () => rawBody,
    });
    const result = await generateQuestionsWithChatCompletions({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'test-key',
      modelName: 'gpt-test',
      words: abandonWords,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('AI 响应不是 JSON');
      expect(result.message).toContain('响应体为空');
      expect(result.message).toContain('Content-Type: text/plain');
      expect(result.responseBody).toBe(rawBody);
    }
  });

  it('响应缺少 choices 时附带 payload 摘要', async () => {
    const rawBody = JSON.stringify({ error: 'no choices' });
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => rawBody,
    });
    const result = await generateQuestionsWithChatCompletions({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'test-key',
      modelName: 'gpt-test',
      words: abandonWords,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('AI 响应缺少 choices');
      expect(result.message).toContain('no choices');
      expect(result.responseBody).toBe(rawBody);
    }
  });

  it('响应内容为空时附带摘要', async () => {
    const rawBody = JSON.stringify({
      choices: [{ message: { content: '   ' } }],
    });
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => rawBody,
    });
    const result = await generateQuestionsWithChatCompletions({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'test-key',
      modelName: 'gpt-test',
      words: abandonWords,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    });
    expect(result).toEqual({
      ok: false,
      message: 'AI 响应内容为空："   "',
      responseBody: rawBody,
    });
  });

  it('失败信息不包含 apiKey', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({ error: { message: 'unauthorized' } }),
    });
    const result = await generateQuestionsWithChatCompletions({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-secret-should-not-leak',
      modelName: 'gpt-test',
      words: abandonWords,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      wordMatchRules: DEFAULT_WORD_MATCH_RULES,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain('sk-secret-should-not-leak');
    }
  });
});

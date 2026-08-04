import {
  buildGeneratePrompt,
  generateQuestionsWithChatCompletions,
  isDenseWordProgression,
  parseGeneratedQuestionsJson,
  shuffleQuestionOptions,
  summarizeApiErrorBody,
  summarizeNonJsonResponse,
  truncateErrorDetail,
  validateOneGeneratedQuestion,
} from './generate-questions';

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

describe('isDenseWordProgression', () => {
  it('同首字母且第2字母距离≤2 通过', () => {
    expect(isDenseWordProgression('advocate', 'adze')).toBe(true);
    expect(isDenseWordProgression('advocate', 'affect')).toBe(true);
  });

  it('同首字母第2字母距离过大拒绝', () => {
    expect(isDenseWordProgression('advocate', 'airport')).toBe(false);
  });

  it('跨多个首字母拒绝', () => {
    expect(isDenseWordProgression('advocate', 'kindle')).toBe(false);
  });

  it('换至下一字母且第2字母为 a–c 通过', () => {
    expect(isDenseWordProgression('azure', 'baby')).toBe(true);
  });

  it('换字母但非下一字母或第2字母不在 a–c 拒绝', () => {
    expect(isDenseWordProgression('azure', 'kindle')).toBe(false);
    expect(isDenseWordProgression('azure', 'brown')).toBe(false);
  });

  it('非纯字母或过短拒绝', () => {
    expect(isDenseWordProgression('a', 'ab')).toBe(false);
    expect(isDenseWordProgression('well-known', 'wellness')).toBe(false);
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
    const result = parseGeneratedQuestionsJson(sample, 2, null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.questions[0]?.word).toBe('abandon');
  });

  it('非 JSON 数组时附带返回内容', () => {
    const raw = '{"error":"I cannot generate questions"}';
    const result = parseGeneratedQuestionsJson(raw, 2, null);
    expect(result).toEqual({
      ok: false,
      message: `AI 返回不是 JSON 数组：${raw}`,
    });
  });

  it('无法提取数组时附带返回内容并截断过长文本', () => {
    const raw = `Sorry, here is prose. ${'x'.repeat(520)}`;
    const result = parseGeneratedQuestionsJson(raw, 2, null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.startsWith('AI 返回不是 JSON 数组：')).toBe(true);
      expect(result.message).toContain('Sorry, here is prose.');
      expect(result.message.endsWith('…')).toBe(true);
      expect(result.message.length).toBe('AI 返回不是 JSON 数组：'.length + 501);
    }
  });

  it('拒绝 word 未大于 lastWord', () => {
    const result = parseGeneratedQuestionsJson(sample, 2, 'zebra');
    expect(result.ok).toBe(false);
  });

  it('prompt 包含游标与数量', () => {
    const p = buildGeneratePrompt({
      lastWord: 'cat',
      questionCount: 3,
      optionCount: 4,
    });
    expect(p).toMatch(/cat/);
    expect(p).toMatch(/3/);
    expect(p).toMatch(/4/);
  });

  it('prompt 强调 word 须严格大于游标且不得相等', () => {
    const p = buildGeneratePrompt({
      lastWord: 'annual',
      questionCount: 2,
      optionCount: 4,
    });
    const lower = p.toLowerCase();
    expect(lower).toMatch(/strictly after/);
    expect(lower).toMatch(/never equal|must not (?:be )?equal|not equal/);
    expect(p).toMatch(/annual/);
  });

  it('validateOneGeneratedQuestion 接受递增 word', () => {
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
      'abandon',
    );
    expect(result.ok).toBe(true);
  });

  it('validate 拒绝跨度过大的 word', () => {
    const result = validateOneGeneratedQuestion(
      {
        word: 'kindle',
        stem: 'Please kindle the fire carefully. What does "kindle" mean?',
        explanation: '他们小心地点燃了火。「kindle」表示点燃、激起。',
        options: [
          { label: 'A', content: '点燃', isCorrect: true },
          { label: 'B', content: '熄灭', isCorrect: false },
        ],
      },
      2,
      'advocate',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/跨度过大|密推进/);
  });

  it('validate 接受密推进 word', () => {
    const result = validateOneGeneratedQuestion(
      {
        word: 'affect',
        stem: 'The news will affect the market soon. What does "affect" mean?',
        explanation: '这条新闻很快会影响市场。「affect」表示影响。',
        options: [
          { label: 'A', content: '影响', isCorrect: true },
          { label: 'B', content: '忽略', isCorrect: false },
        ],
      },
      2,
      'advocate',
    );
    expect(result.ok).toBe(true);
  });

  it('prompt 要求密推进与跨度约束', () => {
    const p = buildGeneratePrompt({
      lastWord: 'advocate',
      questionCount: 3,
      optionCount: 4,
    });
    const lower = p.toLowerCase();
    expect(lower).toMatch(/dense|close|adjacent|紧|密/);
    expect(lower).toMatch(/second letter|第.?2/);
    expect(p).toMatch(/kindle|跨|jump/i);
  });

  it('parse 遇跨度过大整批失败', () => {
    const raw = JSON.stringify([
      {
        word: 'kindle',
        stem: 'Please kindle the fire carefully. What does "kindle" mean?',
        explanation: '点燃火。「kindle」表示点燃。',
        options: [
          { label: 'A', content: '点燃', isCorrect: true },
          { label: 'B', content: '熄灭', isCorrect: false },
        ],
      },
    ]);
    const result = parseGeneratedQuestionsJson(raw, 2, 'advocate');
    expect(result.ok).toBe(false);
  });

  it('prompt 要求完整例句包含 word 且禁止挖空', () => {
    const p = buildGeneratePrompt({
      lastWord: null,
      questionCount: 1,
      optionCount: 4,
    });
    expect(p.toLowerCase()).toMatch(/must include/);
    expect(p.toLowerCase()).toMatch(/blank|___|placeholder/);
    expect(p.toLowerCase()).toMatch(/what does/);
  });

  it('prompt 要求 explanation 含整句译文与词义说明', () => {
    const p = buildGeneratePrompt({
      lastWord: null,
      questionCount: 1,
      optionCount: 4,
    });
    const lower = p.toLowerCase();
    expect(lower).toMatch(/explanation/);
    expect(lower).toMatch(/translat/);
    expect(p).toMatch(/放弃|abandon|词义|meaning/i);
  });

  it('prompt 要求 JSON 字符串内双引号必须转义', () => {
    const p = buildGeneratePrompt({
      lastWord: null,
      questionCount: 1,
      optionCount: 4,
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
      null,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/挖空|blank|___/i);
  });

  it('拒绝 stem 未包含 word', () => {
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
      null,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/未包含|不包含|word/i);
  });

  it('接受含完整 word 的例句题干', () => {
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
      null,
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
      null,
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
      lastWord: null,
      questionCount: 1,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
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
      lastWord: null,
      questionCount: 1,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
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
      lastWord: null,
      questionCount: 1,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
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
      lastWord: null,
      questionCount: 1,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
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
      lastWord: null,
      questionCount: 1,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
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
      lastWord: null,
      questionCount: 1,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
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
      lastWord: null,
      questionCount: 1,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
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
      lastWord: null,
      questionCount: 1,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
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
      lastWord: null,
      questionCount: 1,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
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
      lastWord: null,
      questionCount: 1,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
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
      lastWord: null,
      questionCount: 1,
      optionCount: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain('sk-secret-should-not-leak');
    }
  });
});

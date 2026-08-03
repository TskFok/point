import {
  buildGeneratePrompt,
  generateQuestionsWithChatCompletions,
  parseGeneratedQuestionsJson,
  validateOneGeneratedQuestion,
} from './generate-questions';

describe('generate-questions parse', () => {
  const sample = JSON.stringify([
    {
      word: 'abandon',
      stem: 'What does "abandon" mean?',
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

  it('validateOneGeneratedQuestion 接受递增 word', () => {
    const result = validateOneGeneratedQuestion(
      {
        word: 'able',
        stem: 'What does able mean?',
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
});

describe('generateQuestionsWithChatCompletions', () => {
  it('mock fetch 成功返回题目', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  word: 'abandon',
                  stem: 'What does "abandon" mean?',
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

  it('HTTP 非 2xx 返回失败', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
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
      message: 'AI 调用失败 HTTP 401',
    });
  });
});

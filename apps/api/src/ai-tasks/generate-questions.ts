export type GeneratedQuestionOption = {
  label: string;
  content: string;
  isCorrect: boolean;
};

export type GeneratedQuestion = {
  word: string;
  stem: string;
  explanation: string;
  options: GeneratedQuestionOption[];
};

export type GenerateQuestionsInput = {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  lastWord: string | null;
  questionCount: number;
  optionCount: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type GenerateQuestionsResult =
  | { ok: true; questions: GeneratedQuestion[] }
  | { ok: false; message: string };

const DEFAULT_TIMEOUT_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function buildGeneratePrompt(input: {
  lastWord: string | null;
  questionCount: number;
  optionCount: number;
}): string {
  const cursor =
    input.lastWord && input.lastWord.trim()
      ? `after the word "${input.lastWord.trim().toLowerCase()}" (exclusive)`
      : 'from the beginning of the English dictionary (letter a)';
  return [
    `Generate exactly ${input.questionCount} multiple-choice vocabulary questions.`,
    `Words must be in strict English alphabetical order ${cursor}.`,
    `Each question must have exactly ${input.optionCount} options.`,
    'Stem must be English. Option contents must be Chinese. Explanation must be Chinese.',
    'Exactly one option isCorrect=true per question.',
    'Return ONLY a JSON array. Each item: { "word", "stem", "explanation", "options": [{ "label", "content", "isCorrect" }] }.',
  ].join(' ');
}

export function extractJsonArray(raw: string): unknown[] | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const text = fenced?.[1]?.trim() ?? trimmed;
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start < 0 || end <= start) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(text.slice(start, end + 1));
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function normalizeWord(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const word = value.trim().toLowerCase();
  return word || null;
}

export function validateOneGeneratedQuestion(
  value: unknown,
  optionCount: number,
  minWordExclusive: string | null,
): { ok: true; question: GeneratedQuestion } | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: '题目不是对象' };
  }
  const word = normalizeWord(value.word);
  if (!word) {
    return { ok: false, message: '缺少 word' };
  }
  if (
    minWordExclusive &&
    word.localeCompare(minWordExclusive, 'en') <= 0
  ) {
    return {
      ok: false,
      message: `word "${word}" 未大于游标 "${minWordExclusive}"`,
    };
  }
  if (typeof value.stem !== 'string' || !value.stem.trim()) {
    return { ok: false, message: `题目 ${word} 缺少 stem` };
  }
  if (typeof value.explanation !== 'string' || !value.explanation.trim()) {
    return { ok: false, message: `题目 ${word} 缺少 explanation` };
  }
  if (!Array.isArray(value.options) || value.options.length !== optionCount) {
    return {
      ok: false,
      message: `题目 ${word} 选项数量必须为 ${optionCount}`,
    };
  }
  const options: GeneratedQuestionOption[] = [];
  let correctCount = 0;
  for (const option of value.options) {
    if (!isRecord(option)) {
      return { ok: false, message: `题目 ${word} 选项格式错误` };
    }
    if (typeof option.label !== 'string' || !option.label.trim()) {
      return { ok: false, message: `题目 ${word} 选项缺少 label` };
    }
    if (typeof option.content !== 'string' || !option.content.trim()) {
      return { ok: false, message: `题目 ${word} 选项缺少 content` };
    }
    if (typeof option.isCorrect !== 'boolean') {
      return { ok: false, message: `题目 ${word} 选项缺少 isCorrect` };
    }
    if (option.isCorrect) {
      correctCount += 1;
    }
    options.push({
      label: option.label.trim(),
      content: option.content.trim(),
      isCorrect: option.isCorrect,
    });
  }
  if (correctCount !== 1) {
    return { ok: false, message: `题目 ${word} 必须恰好一个正确选项` };
  }
  return {
    ok: true,
    question: {
      word,
      stem: value.stem.trim(),
      explanation: value.explanation.trim(),
      options,
    },
  };
}

export function parseGeneratedQuestionsJson(
  raw: string,
  optionCount: number,
  lastWordBefore: string | null,
): { ok: true; questions: GeneratedQuestion[] } | { ok: false; message: string } {
  const array = extractJsonArray(raw);
  if (!array) {
    return { ok: false, message: 'AI 返回不是 JSON 数组' };
  }
  const questions: GeneratedQuestion[] = [];
  let minWordExclusive = lastWordBefore?.trim().toLowerCase() || null;
  for (const item of array) {
    const validated = validateOneGeneratedQuestion(
      item,
      optionCount,
      minWordExclusive,
    );
    if (!validated.ok) {
      return validated;
    }
    questions.push(validated.question);
    minWordExclusive = validated.question.word;
  }
  return { ok: true, questions };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export async function generateQuestionsWithChatCompletions(
  input: GenerateQuestionsInput,
): Promise<GenerateQuestionsResult> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `${normalizeBaseUrl(input.baseUrl)}/chat/completions`;
  const prompt = buildGeneratePrompt({
    lastWord: input.lastWord,
    questionCount: input.questionCount,
    optionCount: input.optionCount,
  });
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.modelName,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You generate English vocabulary multiple-choice questions. Reply with JSON array only. No markdown.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'AI 调用超时'
        : 'AI 调用网络失败';
    return { ok: false, message };
  }
  if (!response.ok) {
    return {
      ok: false,
      message: `AI 调用失败 HTTP ${response.status}`,
    };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, message: 'AI 响应不是 JSON' };
  }
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return { ok: false, message: 'AI 响应缺少 choices' };
  }
  const first = payload.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) {
    return { ok: false, message: 'AI 响应缺少 message' };
  }
  const content = first.message.content;
  if (typeof content !== 'string' || !content.trim()) {
    return { ok: false, message: 'AI 响应内容为空' };
  }
  return parseGeneratedQuestionsJson(
    content,
    input.optionCount,
    input.lastWord,
  );
}

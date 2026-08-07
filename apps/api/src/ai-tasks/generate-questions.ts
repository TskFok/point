import {
  formatWordMatchRulesForPrompt,
  stemIncludesWord,
  type WordMatchRules,
} from './word-match-rules';

export type { WordMatchRules } from './word-match-rules';
export {
  DEFAULT_WORD_MATCH_RULES,
  EMPTY_WORD_MATCH_RULES,
} from './word-match-rules';

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

/** 来自英文词库 entry 表的待出题词条（一行一题） */
export type DictionaryWord = {
  id: string;
  word: string;
  pos: string;
};

export type GenerateQuestionsInput = {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  words: DictionaryWord[];
  optionCount: number;
  wordMatchRules: WordMatchRules;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type GenerateQuestionsResult =
  | {
      ok: true;
      questions: GeneratedQuestion[];
      responseBody?: string;
      wordMismatchNotes?: string[];
      skipMessages?: string[];
    }
  | { ok: false; message: string; responseBody?: string };

const DEFAULT_TIMEOUT_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function buildGeneratePrompt(input: {
  words: DictionaryWord[];
  optionCount: number;
  wordMatchRules: WordMatchRules;
}): string {
  const wordList = input.words
    .map(
      (item, index) =>
        `${index + 1}. "${item.word}" (${item.pos || 'unknown'})`,
    )
    .join('; ');
  return [
    `Generate exactly ${input.words.length} multiple-choice vocabulary questions, one per word listed below, in the same order.`,
    `Words with their part of speech: ${wordList}.`,
    'Use ONLY the words listed above. Never invent, replace, skip or repeat words.',
    'Each question must test the word as the given part of speech; the example sentence must use the word as that part of speech (if several are listed, pick the most common one).',
    `Each question must have exactly ${input.optionCount} options.`,
    formatWordMatchRulesForPrompt(input.wordMatchRules),
    'Each question\'s "word" field MUST match the listed word exactly. Never substitute a near-form or different word (e.g. "when" for "why", "catch" for "cat").',
    'Do NOT use blanks, underscores (___), ellipsis placeholders, or [blank] in the stem.',
    'End the stem by naming the word to test, e.g. What does \\"abhor\\" mean?',
    'In JSON string values, every double quote MUST be escaped as \\". Never write raw " inside a string (invalid JSON).',
    'Example stem JSON fragment: "stem":"What does \\"abhor\\" mean?"',
    'Option contents must be Chinese meanings matching the tested part of speech.',
    'Explanation must be Chinese and MUST include: (1) a full Chinese translation of the entire stem sentence, (2) the part of speech in Chinese (如 名词/动词/形容词), and (3) a brief meaning note for the target word.',
    'Example explanation: 他们决定放弃这个计划。「abandon」是动词，表示放弃、抛弃。',
    'Exactly one option isCorrect=true per question (the Chinese meaning of the target word).',
    'Option order does not matter; labels will be reassigned.',
    'Return ONLY a JSON array. Each item: { "word", "stem", "explanation", "options": [{ "label", "content", "isCorrect" }] }.',
  ].join(' ');
}

const OPTION_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function shuffleQuestionOptions(
  options: GeneratedQuestionOption[],
  rng: () => number = Math.random,
): GeneratedQuestionOption[] {
  const shuffled = [...options];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled.map((option, index) => ({
    label: OPTION_LABELS[index] ?? String(index + 1),
    content: option.content,
    isCorrect: option.isCorrect,
  }));
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

function stemHasBlankPlaceholder(stem: string): boolean {
  return /\b_{2,}\b|___+|\[\s*blank\s*\]|\[\s*\]/i.test(stem);
}

/**
 * 校验一道生成的题目结构，并与期望词（本批 entry.word）1:1 对齐。
 * - 入库 word 强制为 expectedWord（trim+小写）
 * - stem 必须包含 expectedWord（按 wordMatchRules 允许变形）
 * - AI 回传 word 不一致时 wordMismatch=true（不因此失败）
 */
export function validateOneGeneratedQuestion(
  value: unknown,
  optionCount: number,
  expectedWord: string,
  wordMatchRules: WordMatchRules,
):
  | {
      ok: true;
      question: GeneratedQuestion;
      wordMismatch: boolean;
      returnedWord: string | null;
    }
  | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: '题目不是对象' };
  }
  const expected = normalizeWord(expectedWord);
  if (!expected) {
    return { ok: false, message: '期望 word 无效' };
  }
  const returnedWord = normalizeWord(value.word);
  const wordMismatch = returnedWord !== expected;
  if (typeof value.stem !== 'string' || !value.stem.trim()) {
    return { ok: false, message: `题目 ${expected} 缺少 stem` };
  }
  const stem = value.stem.trim();
  if (stemHasBlankPlaceholder(stem)) {
    return { ok: false, message: `题目 ${expected} stem 禁止挖空占位` };
  }
  if (!stemIncludesWord(stem, expected, wordMatchRules)) {
    return { ok: false, message: `题目 ${expected} stem 未包含目标词` };
  }
  if (typeof value.explanation !== 'string' || !value.explanation.trim()) {
    return { ok: false, message: `题目 ${expected} 缺少 explanation` };
  }
  if (!Array.isArray(value.options) || value.options.length !== optionCount) {
    return {
      ok: false,
      message: `题目 ${expected} 选项数量必须为 ${optionCount}`,
    };
  }
  const options: GeneratedQuestionOption[] = [];
  let correctCount = 0;
  for (const option of value.options) {
    if (!isRecord(option)) {
      return { ok: false, message: `题目 ${expected} 选项格式错误` };
    }
    if (typeof option.label !== 'string' || !option.label.trim()) {
      return { ok: false, message: `题目 ${expected} 选项缺少 label` };
    }
    if (typeof option.content !== 'string' || !option.content.trim()) {
      return { ok: false, message: `题目 ${expected} 选项缺少 content` };
    }
    if (typeof option.isCorrect !== 'boolean') {
      return { ok: false, message: `题目 ${expected} 选项缺少 isCorrect` };
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
    return { ok: false, message: `题目 ${expected} 必须恰好一个正确选项` };
  }
  return {
    ok: true,
    question: {
      word: expected,
      stem,
      explanation: value.explanation.trim(),
      options,
    },
    wordMismatch,
    returnedWord,
  };
}

/** 按本批词表顺序 1:1 对齐并做结构校验；多出的题忽略，结构失败则跳过该题 */
export function alignGeneratedQuestions(
  items: unknown[],
  optionCount: number,
  words: DictionaryWord[],
  wordMatchRules: WordMatchRules,
): {
  accepted: GeneratedQuestion[];
  skipMessages: string[];
  wordMismatchNotes: string[];
} {
  const accepted: GeneratedQuestion[] = [];
  const skipMessages: string[] = [];
  const wordMismatchNotes: string[] = [];
  const paired = Math.min(items.length, words.length);
  for (let i = 0; i < paired; i += 1) {
    const expected = words[i]!;
    const validated = validateOneGeneratedQuestion(
      items[i],
      optionCount,
      expected.word,
      wordMatchRules,
    );
    if (!validated.ok) {
      skipMessages.push(
        `第 ${i + 1} 题（${expected.word}）：${validated.message}`,
      );
      continue;
    }
    if (validated.wordMismatch) {
      wordMismatchNotes.push(
        `${expected.word}: AI返回"${validated.returnedWord ?? '∅'}"`,
      );
    }
    accepted.push(validated.question);
  }
  if (items.length > words.length) {
    skipMessages.push(
      `忽略超出本批的 ${items.length - words.length} 题`,
    );
  }
  return { accepted, skipMessages, wordMismatchNotes };
}

export function parseGeneratedQuestionsJson(
  raw: string,
  optionCount: number,
  words: DictionaryWord[],
  wordMatchRules: WordMatchRules,
  rng: () => number = Math.random,
):
  | {
      ok: true;
      questions: GeneratedQuestion[];
      wordMismatchNotes: string[];
      skipMessages: string[];
    }
  | { ok: false; message: string } {
  const array = extractJsonArray(raw);
  if (!array) {
    return { ok: false, message: withDetail('AI 返回不是 JSON 数组', raw) };
  }
  if (words.length === 0) {
    return { ok: false, message: '本批词表为空' };
  }
  const { accepted, skipMessages, wordMismatchNotes } = alignGeneratedQuestions(
    array,
    optionCount,
    words,
    wordMatchRules,
  );
  if (accepted.length === 0) {
    return {
      ok: false,
      message: skipMessages[0] ?? '未生成任何有效题目',
    };
  }
  const questions = accepted.map((question) => ({
    ...question,
    options: shuffleQuestionOptions(question.options, rng),
  }));
  return { ok: true, questions, wordMismatchNotes, skipMessages };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

const ERROR_DETAIL_MAX_LEN = 500;

export function truncateErrorDetail(
  value: string,
  maxLen: number = ERROR_DETAIL_MAX_LEN,
): string {
  if (value.length <= maxLen) {
    return value;
  }
  return `${value.slice(0, maxLen)}…`;
}

function withDetail(prefix: string, detail: string | null | undefined): string {
  const trimmed = detail?.trim() ?? '';
  if (!trimmed) {
    return prefix;
  }
  return `${prefix}：${truncateErrorDetail(trimmed)}`;
}

/** 从 API 原始 body 提取可读错误摘要（优先 error.message / message）。 */
export function summarizeApiErrorBody(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (isRecord(parsed)) {
      const nested = parsed.error;
      if (isRecord(nested) && typeof nested.message === 'string') {
        return nested.message.trim();
      }
      if (typeof parsed.message === 'string') {
        return parsed.message.trim();
      }
    }
  } catch {
    // 非 JSON：原样截断
  }
  return truncateErrorDetail(trimmed);
}

/** 组装「响应不是 JSON」时的可读明细：解析错误 + 响应体 + Content-Type。 */
export function summarizeNonJsonResponse(
  rawBody: string,
  parseError: unknown,
  contentType?: string | null,
): string {
  const parts: string[] = [];
  if (parseError instanceof Error && parseError.message.trim()) {
    parts.push(truncateErrorDetail(parseError.message.trim()));
  }
  const body = summarizeApiErrorBody(rawBody);
  parts.push(body || '响应体为空');
  const ct = contentType?.trim();
  if (ct) {
    parts.push(`Content-Type: ${ct}`);
  }
  return parts.join('；');
}

function summarizeUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return truncateErrorDetail(value);
  }
  try {
    return truncateErrorDetail(JSON.stringify(value));
  } catch {
    return '';
  }
}

export async function generateQuestionsWithChatCompletions(
  input: GenerateQuestionsInput,
): Promise<GenerateQuestionsResult> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `${normalizeBaseUrl(input.baseUrl)}/chat/completions`;
  const prompt = buildGeneratePrompt({
    words: input.words,
    optionCount: input.optionCount,
    wordMatchRules: input.wordMatchRules,
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
              'You generate English vocabulary multiple-choice questions. Reply with JSON array only. No markdown. Escape every double quote inside JSON string values as \\".',
          },
          { role: 'user', content: prompt },
        ],
        thinking: {
          type: 'disabled',
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const detail =
      error instanceof Error && error.message.trim()
        ? error.message
        : null;
    const prefix =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'AI 调用超时'
        : 'AI 调用网络失败';
    return { ok: false, message: withDetail(prefix, detail) };
  }

  let rawBody = '';
  let responseBody: string | undefined;
  try {
    rawBody = await response.text();
    responseBody = rawBody;
  } catch {
    rawBody = '';
  }

  if (!response.ok) {
    return {
      ok: false,
      message: withDetail(
        `AI 调用失败 HTTP ${response.status}`,
        summarizeApiErrorBody(rawBody),
      ),
      ...(responseBody !== undefined ? { responseBody } : {}),
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch (parseError) {
    const contentType =
      typeof response.headers?.get === 'function'
        ? response.headers.get('content-type')
        : null;
    return {
      ok: false,
      message: withDetail(
        'AI 响应不是 JSON',
        summarizeNonJsonResponse(rawBody, parseError, contentType),
      ),
      ...(responseBody !== undefined ? { responseBody } : {}),
    };
  }
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return {
      ok: false,
      message: withDetail('AI 响应缺少 choices', summarizeUnknown(payload)),
      ...(responseBody !== undefined ? { responseBody } : {}),
    };
  }
  const first = payload.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) {
    return {
      ok: false,
      message: withDetail('AI 响应缺少 message', summarizeUnknown(payload)),
      ...(responseBody !== undefined ? { responseBody } : {}),
    };
  }
  const content = first.message.content;
  if (typeof content !== 'string' || !content.trim()) {
    return {
      ok: false,
      message: withDetail(
        'AI 响应内容为空',
        typeof content === 'string'
          ? JSON.stringify(content)
          : summarizeUnknown(content),
      ),
      ...(responseBody !== undefined ? { responseBody } : {}),
    };
  }
  const parsed = parseGeneratedQuestionsJson(
    content,
    input.optionCount,
    input.words,
    input.wordMatchRules,
  );
  return {
    ...parsed,
    ...(responseBody !== undefined ? { responseBody } : {}),
  };
}

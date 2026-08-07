export type WordMatchRules = {
  suffixes: string[];
  /** base word (lowercase) → allowed alternate forms in stem */
  irregulars: Record<string, string[]>;
};

/** 新建任务 / 迁移种子；运行时不隐式回落 */
export const DEFAULT_WORD_MATCH_SUFFIXES = [
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
] as const;

export const DEFAULT_WORD_MATCH_RULES: WordMatchRules = {
  suffixes: [...DEFAULT_WORD_MATCH_SUFFIXES],
  irregulars: {},
};

export const EMPTY_WORD_MATCH_RULES: WordMatchRules = {
  suffixes: [],
  irregulars: {},
};

const MAX_SUFFIXES = 50;
const MAX_SUFFIX_LEN = 16;
const MAX_IRREGULAR_BASES = 200;
const MAX_FORMS_PER_BASE = 20;
const MAX_WORD_LEN = 64;

const SUFFIX_PATTERN = /^[a-z']+$/;
const WORD_PATTERN = /^[a-z]+(?:'[a-z]+)?$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenBoundaryPattern(token: string): RegExp {
  return new RegExp(`(^|[^A-Za-z])${escapeRegExp(token)}(?![A-Za-z])`, 'i');
}

export function stemHasWordToken(stem: string, token: string): boolean {
  if (!token) return false;
  return tokenBoundaryPattern(token).test(stem);
}

/**
 * stem 是否包含目标词：原词、配置后缀变形、或该词的不规则 forms。
 * 空 rules = 仅原词。
 */
export function stemIncludesWord(
  stem: string,
  word: string,
  rules: WordMatchRules,
): boolean {
  const base = word.trim().toLowerCase();
  if (!base) return false;
  if (stemHasWordToken(stem, base)) return true;
  for (const suffix of rules.suffixes) {
    if (stemHasWordToken(stem, `${base}${suffix}`)) return true;
  }
  const forms = rules.irregulars[base];
  if (forms) {
    for (const form of forms) {
      if (stemHasWordToken(stem, form)) return true;
    }
  }
  return false;
}

export function parseWordMatchRules(
  value: unknown,
): { ok: true; rules: WordMatchRules } | { ok: false; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, rules: { ...DEFAULT_WORD_MATCH_RULES, irregulars: {} } };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: 'wordMatchRules 必须是对象' };
  }
  const record = value as Record<string, unknown>;
  if (record.suffixes !== undefined && !Array.isArray(record.suffixes)) {
    return { ok: false, message: 'wordMatchRules.suffixes 必须是数组' };
  }
  if (
    record.irregulars !== undefined &&
    (typeof record.irregulars !== 'object' ||
      record.irregulars === null ||
      Array.isArray(record.irregulars))
  ) {
    return { ok: false, message: 'wordMatchRules.irregulars 必须是对象' };
  }

  const rawSuffixes = (record.suffixes ?? []) as unknown[];
  if (rawSuffixes.length > MAX_SUFFIXES) {
    return {
      ok: false,
      message: `屈折后缀最多 ${MAX_SUFFIXES} 个`,
    };
  }
  const suffixes: string[] = [];
  const seenSuffix = new Set<string>();
  for (const item of rawSuffixes) {
    if (typeof item !== 'string') {
      return { ok: false, message: '屈折后缀必须是字符串' };
    }
    const suffix = item.trim().toLowerCase();
    if (!suffix) continue;
    if (suffix.length > MAX_SUFFIX_LEN) {
      return {
        ok: false,
        message: `屈折后缀不能超过 ${MAX_SUFFIX_LEN} 个字符`,
      };
    }
    if (!SUFFIX_PATTERN.test(suffix)) {
      return {
        ok: false,
        message: `屈折后缀仅允许字母与撇号：${suffix}`,
      };
    }
    if (seenSuffix.has(suffix)) continue;
    seenSuffix.add(suffix);
    suffixes.push(suffix);
  }

  const rawIrregulars = (record.irregulars ?? {}) as Record<string, unknown>;
  const bases = Object.keys(rawIrregulars);
  if (bases.length > MAX_IRREGULAR_BASES) {
    return {
      ok: false,
      message: `不规则变形最多 ${MAX_IRREGULAR_BASES} 个词条`,
    };
  }
  const irregulars: Record<string, string[]> = {};
  for (const rawBase of bases) {
    const base = rawBase.trim().toLowerCase();
    if (!base) continue;
    if (base.length > MAX_WORD_LEN || !WORD_PATTERN.test(base)) {
      return {
        ok: false,
        message: `不规则变形原词不合法：${rawBase}`,
      };
    }
    const formsValue = rawIrregulars[rawBase];
    if (!Array.isArray(formsValue)) {
      return {
        ok: false,
        message: `不规则变形 ${base} 的 forms 必须是数组`,
      };
    }
    if (formsValue.length > MAX_FORMS_PER_BASE) {
      return {
        ok: false,
        message: `不规则变形 ${base} 最多 ${MAX_FORMS_PER_BASE} 个形式`,
      };
    }
    const forms: string[] = [];
    const seenForm = new Set<string>();
    for (const item of formsValue) {
      if (typeof item !== 'string') {
        return {
          ok: false,
          message: `不规则变形 ${base} 的形式必须是字符串`,
        };
      }
      const form = item.trim().toLowerCase();
      if (!form) continue;
      if (form.length > MAX_WORD_LEN || !WORD_PATTERN.test(form)) {
        return {
          ok: false,
          message: `不规则变形形式不合法：${item}`,
        };
      }
      if (form === base || seenForm.has(form)) continue;
      seenForm.add(form);
      forms.push(form);
    }
    if (forms.length > 0) {
      irregulars[base] = forms;
    }
  }

  return { ok: true, rules: { suffixes, irregulars } };
}

/** 从 DB Json 读取；非法时回落为空（仅原词），避免阻断调度 */
export function readWordMatchRules(value: unknown): WordMatchRules {
  const parsed = parseWordMatchRules(
    value === undefined || value === null
      ? EMPTY_WORD_MATCH_RULES
      : value,
  );
  if (!parsed.ok) {
    return { ...EMPTY_WORD_MATCH_RULES };
  }
  return parsed.rules;
}

export function formatWordMatchRulesForPrompt(
  rules: WordMatchRules,
  languageNameEn = 'English',
): string {
  const hasSuffixes = rules.suffixes.length > 0;
  const irregularEntries = Object.entries(rules.irregulars);
  if (!hasSuffixes && irregularEntries.length === 0) {
    return (
      `Stem must be a complete ${languageNameEn} example sentence that MUST INCLUDE the target word in its EXACT spelling (case-insensitive word boundary). Do NOT use inflected or alternate forms.`
    );
  }
  const parts: string[] = [
    `Stem must be a complete ${languageNameEn} example sentence that MUST INCLUDE the target word (case-insensitive word boundary)`,
  ];
  if (hasSuffixes) {
    parts.push(
      `OR the target word plus one of these allowed suffixes: ${rules.suffixes.map((s) => `"${s}"`).join(', ')}`,
    );
  }
  if (irregularEntries.length > 0) {
    const samples = irregularEntries
      .slice(0, 8)
      .map(([base, forms]) => `"${base}"→${forms.map((f) => `"${f}"`).join('/')}`)
      .join('; ');
    parts.push(
      `OR an allowed irregular form for that word when listed (examples: ${samples})`,
    );
  }
  return `${parts.join(', ')}.`;
}

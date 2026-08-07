/** 与 API DEFAULT_WORD_MATCH_SUFFIXES 保持一致（新建表单预填） */
export const DEFAULT_WORD_MATCH_SUFFIXES = [
  "s",
  "es",
  "ed",
  "ing",
  "er",
  "est",
  "ies",
  "ied",
  "ying",
  "'s",
] as const;

export type WordMatchRules = {
  suffixes: string[];
  irregulars: Record<string, string[]>;
};

export function suffixesToInput(suffixes: string[]): string {
  return suffixes.join(", ");
}

export function parseSuffixesInput(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of value.split(/[,，\s]+/)) {
    const suffix = part.trim().toLowerCase();
    if (!suffix || seen.has(suffix)) continue;
    seen.add(suffix);
    result.push(suffix);
  }
  return result;
}

export function irregularsToInput(
  irregulars: Record<string, string[]>,
): string {
  return Object.entries(irregulars)
    .map(([base, forms]) => `${base}=${forms.join(",")}`)
    .join("\n");
}

export function parseIrregularsInput(
  value: string,
):
  | { ok: true; irregulars: Record<string, string[]> }
  | { ok: false; message: string } {
  const irregulars: Record<string, string[]> = {};
  const lines = value.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) {
      return {
        ok: false,
        message: `不规则变形格式应为 base=form1,form2：${line}`,
      };
    }
    const base = line.slice(0, eq).trim().toLowerCase();
    if (!base) {
      return { ok: false, message: "不规则变形原词不能为空" };
    }
    const forms: string[] = [];
    const seen = new Set<string>();
    for (const part of line.slice(eq + 1).split(/[,，]/)) {
      const form = part.trim().toLowerCase();
      if (!form || form === base || seen.has(form)) continue;
      seen.add(form);
      forms.push(form);
    }
    if (forms.length === 0) {
      return {
        ok: false,
        message: `不规则变形 ${base} 至少需要一个形式`,
      };
    }
    irregulars[base] = forms;
  }
  return { ok: true, irregulars };
}

export function buildWordMatchRulesFromInputs(
  suffixesText: string,
  irregularsText: string,
):
  | { ok: true; rules: WordMatchRules }
  | { ok: false; message: string } {
  const irregularParsed = parseIrregularsInput(irregularsText);
  if (!irregularParsed.ok) return irregularParsed;
  return {
    ok: true,
    rules: {
      suffixes: parseSuffixesInput(suffixesText),
      irregulars: irregularParsed.irregulars,
    },
  };
}

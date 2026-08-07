import {
  DEFAULT_WORD_MATCH_RULES,
  EMPTY_WORD_MATCH_RULES,
  formatWordMatchRulesForPrompt,
  parseWordMatchRules,
  stemIncludesWord,
} from './word-match-rules';

describe('word-match-rules', () => {
  it('默认后缀接受 whys / abandoned', () => {
    expect(
      stemIncludesWord('She whys at every decision.', 'why', DEFAULT_WORD_MATCH_RULES),
    ).toBe(true);
    expect(
      stemIncludesWord(
        'They abandoned the plan.',
        'abandon',
        DEFAULT_WORD_MATCH_RULES,
      ),
    ).toBe(true);
  });

  it('空规则仅接受原词', () => {
    expect(
      stemIncludesWord('She whys at every decision.', 'why', EMPTY_WORD_MATCH_RULES),
    ).toBe(false);
    expect(
      stemIncludesWord('Why ask again?', 'why', EMPTY_WORD_MATCH_RULES),
    ).toBe(true);
  });

  it('不规则映射接受 went', () => {
    const rules = {
      suffixes: [] as string[],
      irregulars: { go: ['went', 'gone'] },
    };
    expect(stemIncludesWord('He went home.', 'go', rules)).toBe(true);
    expect(stemIncludesWord('He goes home.', 'go', rules)).toBe(false);
  });

  it('拒绝非白名单近形延长（catch ≠ cat）', () => {
    expect(
      stemIncludesWord('He tried to catch the ball.', 'cat', DEFAULT_WORD_MATCH_RULES),
    ).toBe(false);
  });

  it('省略字段时 parse 回落默认后缀', () => {
    const parsed = parseWordMatchRules(undefined);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.rules.suffixes).toEqual(DEFAULT_WORD_MATCH_RULES.suffixes);
      expect(parsed.rules.irregulars).toEqual({});
    }
  });

  it('显式空数组解析为仅原词', () => {
    const parsed = parseWordMatchRules({ suffixes: [], irregulars: {} });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.rules).toEqual(EMPTY_WORD_MATCH_RULES);
    }
  });

  it('prompt 摘要在无规则时要求 exact form', () => {
    const text = formatWordMatchRulesForPrompt(EMPTY_WORD_MATCH_RULES);
    expect(text.toLowerCase()).toMatch(/exact/);
    expect(text).toContain('complete English example sentence');
  });

  it('prompt 摘要列出配置后缀', () => {
    const text = formatWordMatchRulesForPrompt(DEFAULT_WORD_MATCH_RULES);
    expect(text).toContain('"s"');
    expect(text).toContain('complete English example sentence');
    expect(text.toLowerCase()).toMatch(/suffix/);
  });

  it('prompt 摘要使用传入的语言名', () => {
    expect(
      formatWordMatchRulesForPrompt(EMPTY_WORD_MATCH_RULES, 'Japanese'),
    ).toContain('complete Japanese example sentence');
    expect(
      formatWordMatchRulesForPrompt(DEFAULT_WORD_MATCH_RULES, 'German'),
    ).toContain('complete German example sentence');
  });
});

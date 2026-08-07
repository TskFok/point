import { DEFAULT_LANG_CODE, isLangCode, normalizeLangCode } from './lang-code';

describe('lang-code', () => {
  it('接受五种语言码', () => {
    for (const code of ['en', 'ja', 'it', 'fr', 'de'] as const) {
      expect(normalizeLangCode(code)).toBe(code);
      expect(isLangCode(code)).toBe(true);
    }
  });

  it('省略或空串时默认 en', () => {
    expect(normalizeLangCode(undefined)).toBe(DEFAULT_LANG_CODE);
    expect(normalizeLangCode(null)).toBe(DEFAULT_LANG_CODE);
    expect(normalizeLangCode('')).toBe(DEFAULT_LANG_CODE);
    expect(normalizeLangCode('  ')).toBe(DEFAULT_LANG_CODE);
  });

  it('非法值抛 VALIDATION_FAILED 风格错误或 Error（与项目 validationFailed 一致）', () => {
    expect(() => normalizeLangCode('zh')).toThrow(/语言|lang/i);
    expect(() => normalizeLangCode(1)).toThrow(/语言|lang/i);
  });
});

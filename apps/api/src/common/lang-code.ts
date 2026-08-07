import { BadRequestException } from '@nestjs/common';

export const LANG_CODES = ['en', 'ja', 'it', 'fr', 'de'] as const;
export type LangCode = (typeof LANG_CODES)[number];
export const DEFAULT_LANG_CODE: LangCode = 'en';

export const LANG_CODE_LABELS: Record<LangCode, string> = {
  en: '英语',
  ja: '日语',
  it: '意大利语',
  fr: '法语',
  de: '德语',
};

export function isLangCode(value: unknown): value is LangCode {
  return typeof value === 'string' && (LANG_CODES as readonly string[]).includes(value);
}

export function normalizeLangCode(
  value: unknown,
  fieldName = '语言',
): LangCode {
  if (value === undefined || value === null) return DEFAULT_LANG_CODE;
  if (typeof value !== 'string') {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: `${fieldName}不合法`,
    });
  }
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_LANG_CODE;
  if (!isLangCode(trimmed)) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: `${fieldName}须为 en/ja/it/fr/de 之一`,
    });
  }
  return trimmed;
}

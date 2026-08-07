export const LANG_CODES = ["en", "ja", "it", "fr", "de"] as const;
export type LangCode = (typeof LANG_CODES)[number];
export const DEFAULT_LANG_CODE: LangCode = "en";
export const LANG_CODE_LABELS: Record<LangCode, string> = {
  en: "英语",
  ja: "日语",
  it: "意大利语",
  fr: "法语",
  de: "德语",
};

export type UiLanguage = 'zh' | 'en';

const UI_LANGUAGES: UiLanguage[] = ['zh', 'en'];

export function normalizeUiLanguage(value: unknown): UiLanguage {
  return UI_LANGUAGES.includes(value as UiLanguage) ? (value as UiLanguage) : 'zh';
}

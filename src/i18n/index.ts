import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from './en';
import { normalizeUiLanguage, type UiLanguage } from './language';
import zh from './zh';

export type { UiLanguage } from './language';
export type I18nKey = keyof typeof zh;
export type I18nParams = Record<string, string | number | boolean | null | undefined>;

const dictionaries: Record<UiLanguage, Record<I18nKey, string>> = { zh, en };
export { normalizeUiLanguage } from './language';

function interpolate(template: string, params: I18nParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value == null ? match : String(value);
  });
}

export function t(key: string, lang: UiLanguage, params?: I18nParams): string;
export function t(key: string, lang: unknown, params?: I18nParams): string;
export function t(key: string, lang: unknown = 'zh', params?: I18nParams): string {
  const uiLanguage = normalizeUiLanguage(lang);
  const typedKey = key as I18nKey;
  const template = dictionaries[uiLanguage][typedKey] ?? dictionaries.zh[typedKey] ?? key;
  return interpolate(template, params);
}

export type BoundT = (key: string, params?: I18nParams) => string;

interface I18nContextValue {
  uiLanguage: UiLanguage;
  setUiLanguage: (language: UiLanguage) => void;
  t: BoundT;
}

const fallbackT: BoundT = (key, params) => t(key, 'zh', params);

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  initialLanguage = 'zh',
  children,
}: {
  initialLanguage?: UiLanguage;
  children: ReactNode;
}) {
  const [uiLanguage, setUiLanguageState] = useState<UiLanguage>(normalizeUiLanguage(initialLanguage));

  useEffect(() => {
    setUiLanguageState(normalizeUiLanguage(initialLanguage));
  }, [initialLanguage]);

  const setUiLanguage = useCallback((language: UiLanguage) => {
    setUiLanguageState(normalizeUiLanguage(language));
  }, []);

  const boundT = useCallback<BoundT>((key, params) => t(key, uiLanguage, params), [uiLanguage]);

  const value = useMemo<I18nContextValue>(
    () => ({ uiLanguage, setUiLanguage, t: boundT }),
    [boundT, setUiLanguage, uiLanguage],
  );

  return createElement(I18nContext.Provider, { value }, children);
}

export function useT(): BoundT {
  return useContext(I18nContext)?.t ?? fallbackT;
}

export function useI18n(): I18nContextValue {
  return (
    useContext(I18nContext) ?? {
      uiLanguage: 'zh',
      setUiLanguage: () => undefined,
      t: fallbackT,
    }
  );
}

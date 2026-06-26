import { SCHEMA_VERSION } from './config';
import type { Settings, GenerationParams, ProviderConfig } from './models';

export function defaultParams(): GenerationParams {
  return {
    videoModel: 'generic',
    style: '',
    aspectRatio: '16:9',
    shotDurationPref: 'medium',
    outputLanguage: 'zh',
    templateId: 'cinematic-en',
  };
}

export function defaultProvider(): ProviderConfig {
  // model 默认空字符串：不硬编码模型名（ADR-4）。
  return { kind: 'openai-compatible', model: '' };
}

export function defaultSettings(): Settings {
  return {
    params: defaultParams(),
    provider: defaultProvider(),
    uiLanguage: 'zh',
    persistApiKey: true,
    autoTranslateSync: false,
    exportFormat: 'markdown',
    exportPromptLang: 'both',
    panelCollapsed: {},
    schemaVersion: SCHEMA_VERSION,
  };
}

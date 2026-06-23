// 结构化数据模型（对齐 docs/api-spec.md 第 2 节）。本 Issue 用到 GenerationParams /
// ProviderConfig / 统一 Result；Project/Shot/Character/BgmPrompt 先定义好，供后续任务复用。

export type OutputLanguage = 'zh' | 'en';
export type VideoModel = 'jimeng' | 'keling' | 'sora' | 'runway' | 'generic';
export type TemplateId = 'cinematic-en' | 'jimeng-keling-zh';
export type ShotDurationPref = 'short' | 'medium' | 'long';

export interface GenerationParams {
  videoModel: VideoModel;
  style: string;
  aspectRatio: string;
  shotDurationPref: ShotDurationPref;
  outputLanguage: OutputLanguage;
  templateId: TemplateId;
}

export interface ProviderConfig {
  kind: 'openai-compatible' | 'anthropic';
  /** 仅 openai-compatible 可填；必须 https://（ADR-5）。anthropic 忽略。 */
  baseUrl?: string;
  /** 用户填写的模型名；默认空字符串，不硬编码（ADR-4）。 */
  model: string;
  /** 已动态授权的自定义域名（ADR-5）。 */
  grantedOrigins?: string[];
}

export interface Settings {
  params: GenerationParams;
  provider: ProviderConfig;
  schemaVersion: number;
}

export interface Character {
  id: string;
  name: string | null;
  appearance: string;
}

export interface Shot {
  id: string;
  index: number;
  summary: string;
  shotSize: string;
  cameraMovement: string;
  durationSuggestion: string;
  prompt: string;
  characterRefs: string[];
  editedByUser: boolean;
}

export interface BgmPrompt {
  prompt: string;
  language: OutputLanguage;
}

export interface Project {
  schemaVersion: number;
  story: string;
  params: GenerationParams;
  characters: Character[];
  shots: Shot[];
  bgm?: BgmPrompt;
}

/** 面向用户的错误码（对齐 api-spec §2，本 Issue 用到其中一部分）。 */
export type ErrorCode =
  | 'EMPTY_STORY'
  | 'STORY_TOO_SHORT'
  | 'STORY_TOO_LONG'
  | 'NO_API_KEY'
  | 'INVALID_PROVIDER_CONFIG'
  | 'MODEL_REQUIRED'
  | 'KEY_DECRYPT_FAILED'
  | 'STORAGE_WRITE_FAILED'
  | 'CLIPBOARD_FAILED';

export interface AppError {
  code: ErrorCode;
  message: string;
  retriable: boolean;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (code: ErrorCode, message: string, retriable = false): Result<never> => ({
  ok: false,
  error: { code, message, retriable },
});

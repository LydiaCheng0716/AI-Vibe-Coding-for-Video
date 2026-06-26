import type { ExportFormat, ExportPromptLang } from './export';
import type { UiLanguage } from '../i18n/language';

// 结构化数据模型（对齐 docs/api-spec.md 第 2 节）。本 Issue 用到 GenerationParams /
// ProviderConfig / 统一 Result；Project/Shot/Character/BgmPrompt 先定义好，供后续任务复用。

export type OutputLanguage = 'zh' | 'en' | 'zh-en';
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
  /** UI display language. Separate from outputLanguage, which controls generated prompt language. */
  uiLanguage?: UiLanguage;
  /** 是否在本机加密保存 API Key（ADR-1 #8）。false = 不落盘，生成时手动输入。默认 true。 */
  persistApiKey: boolean;
  /** 双语编辑时「自动翻译同步另一语言」的默认开关（Issue #70）。 */
  autoTranslateSync?: boolean;
  /** 导出面板上次选择的格式（Issue #70）。 */
  exportFormat?: ExportFormat;
  /** 导出面板上次选择的提示词语言（Issue #70）。 */
  exportPromptLang?: ExportPromptLang;
  schemaVersion: number;
}

/** 结构化角色档案的固定字段键（Issue #29 A）。顺序由 core/characterProfile 锁定。 */
export type CharacterFieldKey =
  | 'codename' // 代号
  | 'ageRange' // 年龄段
  | 'gender' // 性别
  | 'ethnicitySkin' // 种族/肤色
  | 'hair' // 发型发色
  | 'face' // 脸部特征
  | 'build' // 体型
  | 'clothing' // 服装
  | 'accessories' // 配饰
  | 'demeanor'; // 气质/表情基调

/** 结构化角色档案：固定 10 字段，作为锁住人物不漂移的外观锚点（Issue #29 A）。 */
export interface CharacterProfile {
  codename: string;
  ageRange: string;
  gender: string;
  ethnicitySkin: string;
  hair: string;
  face: string;
  build: string;
  clothing: string;
  accessories: string;
  demeanor: string;
}

export interface Character {
  id: string;
  name: string | null;
  /** 渲染锚点：注入每镜头用；无 profile 时回退到此（兼容旧数据）。 */
  appearance: string;
  /** 结构化档案（Issue #29 A）。 */
  profile?: CharacterProfile;
  /** 故事未明确字段的 2–4 个候选建议（Issue #29 B）。 */
  suggestions?: Partial<Record<CharacterFieldKey, string[]>>;
  /** 锁定为权威版：后续（含 #30 单镜头重生成）注入这版、不被模型改写（Issue #29 C）。 */
  locked?: boolean;
  /** 外观种子短语：便于贴到图/视频工具（Issue #29 C 可选）。 */
  seedPhrase?: string;
}

/** 相邻镜头转场（Issue #54）：type=类型 id；双语含 noteEn。 */
export interface Transition {
  type: string;
  note: string;
  noteEn?: string;
}

export interface Shot {
  id: string;
  index: number;
  summary: string;
  shotSize: string;
  cameraMovement: string;
  durationSuggestion: string;
  prompt: string;
  /** 中英双语（Issue #41）：prompt=中文版，promptEn=英文版；单语时不存在。 */
  promptEn?: string;
  /** 本镜 → 下一镜的转场建议（Issue #54）；末镜不展示。 */
  transitionToNext?: Transition;
  /** 首帧图像提示词（Issue #57，按需生成，适配静态出图）；双语含 En。 */
  firstFramePrompt?: string;
  firstFramePromptEn?: string;
  characterRefs: string[];
  editedByUser: boolean;
}

export interface BgmPrompt {
  prompt: string;
  language: OutputLanguage;
}

/** 全局风格档固定字段键（Issue #55）。 */
export type StyleFieldKey = 'colorGrade' | 'lighting' | 'lensFocal' | 'filmTexture' | 'mood';

/** 全局视觉风格档：整片统一锚点（Issue #55）。色调/光线/镜头焦段/胶片质感/整体氛围。 */
export interface StyleProfile {
  colorGrade: string;
  lighting: string;
  lensFocal: string;
  filmTexture: string;
  mood: string;
}

/** 全局风格锁（Issue #55）：结构化档案 + 每字段候选建议 + 锁定标记（仿 #29）。 */
export interface GlobalStyle {
  profile: StyleProfile;
  suggestions?: Partial<Record<StyleFieldKey, string[]>>;
  locked?: boolean;
}

export interface Project {
  schemaVersion: number;
  story: string;
  params: GenerationParams;
  characters: Character[];
  shots: Shot[];
  bgm?: BgmPrompt;
  /** 全局风格锁（Issue #55）；optional 向后兼容。 */
  globalStyle?: GlobalStyle;
}

/** 面向用户的错误码（对齐 api-spec §2，全集）。 */
export type ErrorCode =
  | 'EMPTY_STORY'
  | 'STORY_TOO_SHORT'
  | 'STORY_TOO_LONG'
  | 'NO_API_KEY'
  | 'INVALID_PROVIDER_CONFIG'
  | 'MODEL_REQUIRED'
  | 'KEY_DECRYPT_FAILED'
  | 'HOST_PERMISSION_DENIED'
  | 'CORS_BLOCKED'
  | 'AUTH_FAILED'
  | 'FORBIDDEN'
  | 'MODEL_NOT_FOUND'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'BAD_RESPONSE_FORMAT'
  | 'GENERATION_IN_PROGRESS'
  | 'STORAGE_WRITE_FAILED'
  | 'CLIPBOARD_FAILED'
  | 'NO_GENERATION_INPUT'
  | 'NOTHING_TO_EXPORT';

export interface AppError {
  code: ErrorCode;
  message: string;
  retriable: boolean;
  /** 内部退避提示（ms）：429 的 Retry-After 等；重试层优先采用（TASK-009）。非 UI 字段。 */
  retryAfterMs?: number;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (
  code: ErrorCode,
  message: string,
  retriable = false,
  retryAfterMs?: number,
): Result<never> => ({
  ok: false,
  error: { code, message, retriable, ...(retryAfterMs != null ? { retryAfterMs } : {}) },
});

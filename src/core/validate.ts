import { STORY_MIN, STORY_MAX, STORY_SOFT_MIN } from './config';
import type { ProviderConfig } from './models';

export type StoryValidationCode =
  | 'OK'
  | 'EMPTY_STORY'
  | 'STORY_TOO_SHORT'
  | 'STORY_TOO_LONG';

export interface StoryValidation {
  code: StoryValidationCode;
  /** 去首尾空白后的 Unicode 码点数（ADR-2 口径）。 */
  count: number;
  /** code 为 OK 时，是否触发柔性提示（10–30）。 */
  soft: boolean;
}

/**
 * 按 Unicode 码点数计长度（不是 UTF-16 code unit），以正确处理 emoji / 代理对。
 * 例：'👍'.length === 2，但 codePointLength('👍') === 1。
 */
export function codePointLength(text: string): number {
  // Array.from 按码点迭代字符串（emoji/代理对算 1）。
  return Array.from(text).length;
}

/** 校验故事输入（ADR-2）。纯函数，无副作用。 */
export function validateStory(text: string): StoryValidation {
  const trimmed = text.trim();
  const count = codePointLength(trimmed);

  if (count === 0) return { code: 'EMPTY_STORY', count, soft: false };
  if (count < STORY_MIN) return { code: 'STORY_TOO_SHORT', count, soft: false };
  if (count > STORY_MAX) return { code: 'STORY_TOO_LONG', count, soft: false };

  return { code: 'OK', count, soft: count < STORY_SOFT_MIN };
}

/** 面向用户的中文提示文案（不暴露内部细节）。 */
export function storyValidationMessage(v: StoryValidation): string | null {
  switch (v.code) {
    case 'EMPTY_STORY':
      return '请先输入故事内容。';
    case 'STORY_TOO_SHORT':
      return `故事内容太短，至少 ${STORY_MIN} 个字。`;
    case 'STORY_TOO_LONG':
      return `故事太长了，请缩短到 ${STORY_MAX} 字以内（当前 ${v.count}）。`;
    case 'OK':
      return v.soft ? '内容较少，分镜可能比较笼统。' : null;
  }
}

// ---- Provider 配置校验（ADR-4 / ADR-5；generation 前置校验第 3 步）----

export type ProviderConfigCode = 'OK' | 'INVALID_PROVIDER_CONFIG' | 'MODEL_REQUIRED';

/**
 * 校验 Provider 配置：kind 合法、openai-compatible 的 baseUrl 必须 https://（合法 URL）、
 * model 非空。anthropic 忽略 baseUrl（固定官方域名）。纯函数。
 */
export function validateProviderConfig(p: ProviderConfig | undefined | null): ProviderConfigCode {
  if (!p || (p.kind !== 'openai-compatible' && p.kind !== 'anthropic')) {
    return 'INVALID_PROVIDER_CONFIG';
  }
  if (p.kind === 'openai-compatible' && p.baseUrl != null && p.baseUrl !== '') {
    let url: URL;
    try {
      url = new URL(p.baseUrl);
    } catch {
      return 'INVALID_PROVIDER_CONFIG';
    }
    if (url.protocol !== 'https:') return 'INVALID_PROVIDER_CONFIG';
  }
  if (!p.model || p.model.trim() === '') return 'MODEL_REQUIRED';
  return 'OK';
}

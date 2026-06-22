import { STORY_MIN, STORY_MAX, STORY_SOFT_MIN } from './config';

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
  // 展开迭代器即按码点切分。
  let n = 0;
  for (const _ of text) n++;
  return n;
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

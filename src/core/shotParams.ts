// 镜头参数下拉选项（Issue #32）。纯数据 + 纯函数。景别/运镜按输出语言给常用选项，时长语言无关。
import type { OutputLanguage } from './models';

const SHOT_SIZE_ZH = ['大远景', '远景', '全景', '中景', '中近景', '近景', '特写', '大特写'];
const CAMERA_MOVEMENT_ZH = ['固定', '推', '拉', '摇', '移', '跟随', '升降', '环绕', '手持'];

export const SHOT_SIZE_OPTIONS: Record<OutputLanguage, string[]> = {
  zh: SHOT_SIZE_ZH,
  en: ['extreme wide', 'wide', 'full shot', 'medium', 'medium close-up', 'close-up', 'extreme close-up'],
  'zh-en': SHOT_SIZE_ZH, // 双语下可读字段用中文口径
};

export const CAMERA_MOVEMENT_OPTIONS: Record<OutputLanguage, string[]> = {
  zh: CAMERA_MOVEMENT_ZH,
  en: ['static', 'push in', 'pull out', 'pan', 'tracking', 'follow', 'crane', 'orbit', 'handheld'],
  'zh-en': CAMERA_MOVEMENT_ZH,
};

/** 时长选项语言无关。 */
export const DURATION_OPTIONS: string[] = ['2s', '3s', '5s', '8s', '10s'];

export function shotSizeOptions(lang: OutputLanguage): string[] {
  return SHOT_SIZE_OPTIONS[lang] ?? SHOT_SIZE_OPTIONS.zh;
}

export function cameraMovementOptions(lang: OutputLanguage): string[] {
  return CAMERA_MOVEMENT_OPTIONS[lang] ?? CAMERA_MOVEMENT_OPTIONS.zh;
}

/**
 * 把当前值并入选项，保证下拉能显示并保留模型给的自定义值（不在预设里则置顶），不丢值。
 * 已在预设里则原样返回。
 */
export function withCurrent(options: string[], current: string): string[] {
  const c = (current ?? '').trim();
  if (!c || options.includes(c)) return options;
  return [c, ...options];
}

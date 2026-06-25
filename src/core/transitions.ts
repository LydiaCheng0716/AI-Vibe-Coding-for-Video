// 转场类型表（Issue #54）。纯数据 + 纯函数，可扩展（新增一项即可）。
import type { OutputLanguage } from './models';

export interface TransitionTypeDef {
  id: string;
  zh: string;
  en: string;
}

export const TRANSITION_TYPES: readonly TransitionTypeDef[] = [
  { id: 'cut', zh: '硬切', en: 'Hard cut' },
  { id: 'dissolve', zh: '叠化', en: 'Dissolve' },
  { id: 'match', zh: '匹配剪辑', en: 'Match cut' },
  { id: 'whip', zh: '甩镜', en: 'Whip pan' },
  { id: 'motion', zh: '运动接运动', en: 'Motion match' },
  { id: 'fadeblack', zh: '黑场', en: 'Fade to black' },
];

export function transitionLabel(typeId: string, lang: OutputLanguage): string {
  const def = TRANSITION_TYPES.find((t) => t.id === typeId);
  if (!def) return typeId;
  return lang === 'en' ? def.en : def.zh;
}

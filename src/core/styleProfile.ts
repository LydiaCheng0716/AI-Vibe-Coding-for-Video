// 全局风格档的字段元数据与合成（Issue #55，仿 core/characterProfile）。纯函数、无副作用。
// 字段顺序与标签是「注入（core/style）」与「UI（StylePanel）」的单一来源。
import type { OutputLanguage, StyleFieldKey, StyleProfile } from './models';

/** 固定 5 字段顺序。 */
export const STYLE_FIELD_KEYS: readonly StyleFieldKey[] = [
  'colorGrade',
  'lighting',
  'lensFocal',
  'filmTexture',
  'mood',
];

/** 字段标签（按输出语言；zh-en 沿用中文口径）。 */
export const STYLE_FIELD_LABELS: Record<OutputLanguage, Record<StyleFieldKey, string>> = {
  zh: {
    colorGrade: '色调/调色',
    lighting: '光线',
    lensFocal: '镜头与焦段',
    filmTexture: '胶片质感',
    mood: '整体氛围',
  },
  en: {
    colorGrade: 'Color grade',
    lighting: 'Lighting',
    lensFocal: 'Lens/Focal',
    filmTexture: 'Film texture',
    mood: 'Mood',
  },
  'zh-en': {
    colorGrade: '色调/调色',
    lighting: '光线',
    lensFocal: '镜头与焦段',
    filmTexture: '胶片质感',
    mood: '整体氛围',
  },
};

export function emptyStyleProfile(): StyleProfile {
  return { colorGrade: '', lighting: '', lensFocal: '', filmTexture: '', mood: '' };
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** 把风格档非空字段合成单行锚点（按输出语言），如 `色调/调色:暖金 | 光线:柔和侧光`。 */
export function composeStyle(profile: StyleProfile, lang: OutputLanguage): string {
  const labels = STYLE_FIELD_LABELS[lang] ?? STYLE_FIELD_LABELS.zh;
  const parts: string[] = [];
  for (const key of STYLE_FIELD_KEYS) {
    const v = oneLine(profile[key] ?? '');
    if (v) parts.push(`${labels[key]}:${v}`);
  }
  return parts.join(' | ');
}

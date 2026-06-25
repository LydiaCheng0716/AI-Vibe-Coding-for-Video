// 结构化角色档案的字段元数据与合成（Issue #29）。纯函数、无副作用。
// 字段顺序与标签是「注入（core/characters）」与「UI（CharacterPanel）」的单一来源，避免散落。
import type { CharacterFieldKey, CharacterProfile, OutputLanguage } from './models';

/** 固定 10 字段顺序（A：字段固定）。注入与 UI 共用此顺序。 */
export const CHARACTER_FIELD_KEYS: readonly CharacterFieldKey[] = [
  'codename',
  'ageRange',
  'gender',
  'ethnicitySkin',
  'hair',
  'face',
  'build',
  'clothing',
  'accessories',
  'demeanor',
];

/** 字段标签（按输出语言）。注入锚点与 UI 标题共用。 */
export const CHARACTER_FIELD_LABELS: Record<OutputLanguage, Record<CharacterFieldKey, string>> = {
  zh: {
    codename: '代号',
    ageRange: '年龄段',
    gender: '性别',
    ethnicitySkin: '种族/肤色',
    hair: '发型发色',
    face: '脸部特征',
    build: '体型',
    clothing: '服装',
    accessories: '配饰',
    demeanor: '气质/表情基调',
  },
  en: {
    codename: 'Codename',
    ageRange: 'Age range',
    gender: 'Gender',
    ethnicitySkin: 'Ethnicity/Skin',
    hair: 'Hair',
    face: 'Face',
    build: 'Build',
    clothing: 'Clothing',
    accessories: 'Accessories',
    demeanor: 'Demeanor',
  },
};

/** 全空档案（手动新增角色用）。 */
export function emptyProfile(): CharacterProfile {
  return {
    codename: '',
    ageRange: '',
    gender: '',
    ethnicitySkin: '',
    hair: '',
    face: '',
    build: '',
    clothing: '',
    accessories: '',
    demeanor: '',
  };
}

/** 单行化，避免换行破坏注入块格式。 */
function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * 把档案非空字段合成单行外观锚点（按输出语言），如
 * `代号:林夏 | 年龄段:25–34 | 发型发色:黑长直`。
 * 只取非空字段 → 控制提示词长度、避免多角色超 token（Issue #29 风险项）。
 */
export function composeAppearance(profile: CharacterProfile, lang: OutputLanguage): string {
  const labels = CHARACTER_FIELD_LABELS[lang] ?? CHARACTER_FIELD_LABELS.zh;
  const parts: string[] = [];
  for (const key of CHARACTER_FIELD_KEYS) {
    const v = oneLine(profile[key] ?? '');
    if (v) parts.push(`${labels[key]}:${v}`);
  }
  return parts.join(' | ');
}

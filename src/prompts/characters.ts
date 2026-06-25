// 角色识别与一致性的 system 提示片段（TASK-005 + Issue #29）。强调结构化档案、统一外观、
// 未明确字段给建议（不强行编造）、跨镜头复用、不臆测敏感/不必要的人口属性。
import type { Character, CharacterFieldKey, OutputLanguage } from '../core/models';
import { CHARACTER_FIELD_KEYS, CHARACTER_FIELD_LABELS } from '../core/characterProfile';

export function characterInstruction(): string {
  const zh = CHARACTER_FIELD_LABELS.zh;
  const fields = CHARACTER_FIELD_KEYS.map((k) => zh[k]).join('、');
  return [
    '角色一致性要求（结构化）：',
    `- 若故事出现明确人物，在 characters 为每个角色给出结构化档案 profile，固定字段：${fields}。同一角色在所有镜头复用同一档案，保持统一外观。`,
    '- 字段值只用故事可见/必要特征填写；故事未明确的字段（如年龄段、发型），不要在 profile 里强行编造，而是在 suggestions 中为该字段给 2–4 个候选值（数组）交由用户选择。',
    '- 每个角色给一句 seedPhrase（外观种子短语），便于贴到图/视频工具。',
    '- 用 characterRefs 标注每个镜头涉及的角色（用角色的 name，或其在 characters 中的 1-based 序号），并在该镜头 prompt 中体现其外观，保持跨镜头一致。',
    '- 故事没有明确人物时 characters 返回空数组，不要编造人物。',
    '- 不要臆测种族、确切年龄、健康/宗教等敏感或不必要的人口属性：拿不准的放进 suggestions 供用户选择，不要在 profile 里替用户断定。',
  ].join('\n');
}

/** 把角色已知信息（name + 非空档案字段）描述成可读文本，供单字段建议 prompt 参考。 */
function describeCharacter(character: Character, lang: OutputLanguage): string {
  const labels = CHARACTER_FIELD_LABELS[lang] ?? CHARACTER_FIELD_LABELS.zh;
  const lines: string[] = [];
  if (character.name) lines.push(`name: ${character.name}`);
  const profile = character.profile;
  if (profile) {
    for (const key of CHARACTER_FIELD_KEYS) {
      const v = (profile[key] ?? '').trim();
      if (v) lines.push(`${labels[key]}: ${v}`);
    }
  } else if (character.appearance.trim()) {
    lines.push(character.appearance.trim());
  }
  return lines.length > 0 ? lines.join('\n') : '（暂无其它已知信息）';
}

/**
 * 单字段「重新建议」prompt（Issue #29 B）：仅为某角色某字段生成 2–4 候选，
 * 不改写其它字段/角色。要求 JSON `{"suggestions":[...]}`。
 */
export function buildFieldSuggestionPrompt(
  input: { character: Character; field: CharacterFieldKey; story?: string },
  lang: OutputLanguage,
): { system: string; user: string } {
  const label = (CHARACTER_FIELD_LABELS[lang] ?? CHARACTER_FIELD_LABELS.zh)[input.field];
  const langLabel = lang === 'en' ? 'English' : '简体中文';
  const system = [
    '你在为短视频角色卡的「单个字段」生成候选建议。',
    `只为「${label}」这一个字段给 2–4 个互不相同、具体可用的候选值；不要改动或臆断其它字段。`,
    `候选值用 ${langLabel} 输出，简短（几词到一句），与角色其它已知设定一致，不要解释。`,
    '不要臆测敏感或不必要的人口属性——给的是可选项，供用户挑选。',
    '只输出 JSON：{"suggestions":["...","..."]}，不要任何解释文字、不要 Markdown 代码块标记。',
  ].join('\n');
  const user = [
    input.story && input.story.trim() ? `故事背景：\n${input.story.trim()}` : '（无额外故事背景）',
    '',
    `角色已知信息：\n${describeCharacter(input.character, lang)}`,
    '',
    `请为字段「${label}」生成 2–4 个候选。`,
  ].join('\n');
  return { system, user };
}

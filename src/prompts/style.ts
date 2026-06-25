// 全局风格的 system 提示片段 + 单字段建议 prompt（Issue #55，仿 prompts/characters）。
import type { GlobalStyle, OutputLanguage, StyleFieldKey } from '../core/models';
import { STYLE_FIELD_KEYS, STYLE_FIELD_LABELS } from '../core/styleProfile';

export function styleInstruction(): string {
  const zh = STYLE_FIELD_LABELS.zh;
  const fields = STYLE_FIELD_KEYS.map((k) => zh[k]).join('、');
  return [
    '全局风格要求（整片视觉统一）：',
    `- 基于故事氛围给出一份全局风格档 globalStyle.profile，固定字段：${fields}。供整片所有镜头统一参考，避免跨镜头画风飘移。`,
    '- 故事未明确的风格字段，在 globalStyle.suggestions 为该字段给 2–4 个候选值（数组）供用户选择，不要强行编造。',
    '- 风格档是整片统一锚点，不要每个镜头各写各的风格。',
  ].join('\n');
}

/** 把已知风格信息描述成可读文本，供单字段建议参考。 */
function describeStyle(profile: GlobalStyle['profile'] | undefined, lang: OutputLanguage): string {
  if (!profile) return '（暂无其它已知风格信息）';
  const labels = STYLE_FIELD_LABELS[lang] ?? STYLE_FIELD_LABELS.zh;
  const lines: string[] = [];
  for (const key of STYLE_FIELD_KEYS) {
    const v = (profile[key] ?? '').trim();
    if (v) lines.push(`${labels[key]}: ${v}`);
  }
  return lines.length > 0 ? lines.join('\n') : '（暂无其它已知风格信息）';
}

/**
 * 单字段「重新建议」prompt（Issue #55 B）：仅为全局风格某字段生成 2–4 候选，不改其它字段。
 * 要求 JSON `{"suggestions":[...]}`。
 */
export function buildStyleFieldSuggestionPrompt(
  input: { field: StyleFieldKey; story?: string; profile?: GlobalStyle['profile'] },
  lang: OutputLanguage,
): { system: string; user: string } {
  const label = (STYLE_FIELD_LABELS[lang] ?? STYLE_FIELD_LABELS.zh)[input.field];
  const langLabel = lang === 'en' ? 'English' : '简体中文';
  const system = [
    '你在为短视频「整片全局风格档」的单个字段生成候选建议。',
    `只为「${label}」这一个字段给 2–4 个互不相同、具体可用的候选值；不要改动其它字段。`,
    `候选值用 ${langLabel} 输出，简短（几词到一句），与已知风格一致，不要解释。`,
    '只输出 JSON：{"suggestions":["...","..."]}，不要任何解释文字、不要 Markdown 代码块标记。',
  ].join('\n');
  const user = [
    input.story && input.story.trim() ? `故事背景：\n${input.story.trim()}` : '（无额外故事背景）',
    '',
    `已知风格：\n${describeStyle(input.profile, lang)}`,
    '',
    `请为字段「${label}」生成 2–4 个候选。`,
  ].join('\n');
  return { system, user };
}

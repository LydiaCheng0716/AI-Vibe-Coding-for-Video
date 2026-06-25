// 分镜导出（TASK-008 / api-spec §3.5）。纯函数：Project → Markdown / JSON / 纯文本。
// 隐私（ARCH-LOW-002）：Project 数据结构本身不含 API Key / Provider 凭据（baseUrl 等），
// 这些存于 settings/keyVault，不在 Project，故导出天然不泄露凭据。
import { ok, err, type Result, type Project, type Character, type Shot } from './models';

export type ExportFormat = 'markdown' | 'json' | 'plaintext';

/** 导出提示词语言选择（Issue #41）：仅对双语镜头（含 promptEn）生效；单语任何值都回退 prompt。 */
export type ExportPromptLang = 'zh' | 'en' | 'both';

/** 按语言选择把镜头提示词渲染成「标签 → 文本」段。单语项目 promptEn 不存在 → 始终单段 prompt。 */
function shotPromptParts(s: Shot, lang: ExportPromptLang): Array<{ label: string | null; text: string }> {
  if (!s.promptEn) return [{ label: null, text: s.prompt }];
  if (lang === 'zh') return [{ label: null, text: s.prompt }];
  if (lang === 'en') return [{ label: null, text: s.promptEn }];
  return [
    { label: '中文', text: s.prompt },
    { label: 'English', text: s.promptEn },
  ];
}

export const EXPORT_META: Record<ExportFormat, { ext: string; mime: string; label: string }> = {
  markdown: { ext: 'md', mime: 'text/markdown', label: 'Markdown' },
  json: { ext: 'json', mime: 'application/json', label: 'JSON' },
  plaintext: { ext: 'txt', mime: 'text/plain', label: '纯文本' },
};

function charLabel(c: Character, i: number): string {
  return c.name ?? `角色${i + 1}`;
}

/** 动态围栏：若内容含连续反引号，用更长的围栏避免代码块提前闭合（kimi LOW）。 */
function fence(content: string): { open: string; close: string } {
  const longest = (content.match(/`+/g) ?? []).reduce((m, s) => Math.max(m, s.length), 0);
  const ticks = '`'.repeat(Math.max(3, longest + 1));
  return { open: ticks, close: ticks };
}

function codeBlock(content: string): string[] {
  const { open, close } = fence(content);
  return [open, content, close];
}

function toJson(p: Project): string {
  // 稳定字段名，为未来「历史项目/导入」预留（api-spec §2）。
  return JSON.stringify(
    {
      schemaVersion: p.schemaVersion,
      story: p.story,
      params: p.params,
      characters: p.characters,
      shots: p.shots,
      ...(p.bgm ? { bgm: p.bgm } : {}),
    },
    null,
    2,
  );
}

function shotMd(s: Shot, lang: ExportPromptLang): string {
  const promptBlocks = shotPromptParts(s, lang).flatMap((part) =>
    part.label ? [`**${part.label}**`, ...codeBlock(part.text)] : codeBlock(part.text),
  );
  return [
    `### 镜头 ${s.index}：${s.summary}`,
    `- 景别：${s.shotSize}`,
    `- 运镜：${s.cameraMovement}`,
    `- 时长：${s.durationSuggestion}`,
    '',
    ...promptBlocks,
  ].join('\n');
}

function toMarkdown(p: Project, lang: ExportPromptLang): string {
  const parts: string[] = ['# StoryPop 分镜', '', '## 故事', '', p.story, ''];
  if (p.characters.length > 0) {
    parts.push('## 角色一致性', '');
    p.characters.forEach((c, i) => parts.push(`- **${charLabel(c, i)}**：${c.appearance}`));
    parts.push('');
  }
  parts.push('## 分镜', '');
  p.shots.forEach((s) => parts.push(shotMd(s, lang), ''));
  if (p.bgm) {
    parts.push('## BGM 提示词', '', ...codeBlock(p.bgm.prompt), '');
  }
  return parts.join('\n').trimEnd() + '\n';
}

function shotText(s: Shot, lang: ExportPromptLang): string {
  const promptLines = shotPromptParts(s, lang).map((part) =>
    part.label ? `提示词（${part.label}）：${part.text}` : `提示词：${part.text}`,
  );
  return [
    `镜头 ${s.index}：${s.summary}`,
    `景别：${s.shotSize}　运镜：${s.cameraMovement}　时长：${s.durationSuggestion}`,
    ...promptLines,
  ].join('\n');
}

function toPlaintext(p: Project, lang: ExportPromptLang): string {
  const parts: string[] = ['StoryPop 分镜', '', '故事：', p.story, ''];
  if (p.characters.length > 0) {
    parts.push('角色一致性：');
    p.characters.forEach((c, i) => parts.push(`- ${charLabel(c, i)}：${c.appearance}`));
    parts.push('');
  }
  p.shots.forEach((s) => parts.push(shotText(s, lang), ''));
  if (p.bgm) parts.push('BGM 提示词：', p.bgm.prompt, '');
  return parts.join('\n').trimEnd() + '\n';
}

/**
 * 导出当前项目为指定格式。无分镜 → NOTHING_TO_EXPORT。
 * promptLang（Issue #41）：双语镜头按语言选择渲染；JSON 始终含完整 shot（含 promptEn）。
 */
export function exportProject(
  project: Project | null,
  format: ExportFormat,
  promptLang: ExportPromptLang = 'both',
): Result<string> {
  if (!project || !project.shots || project.shots.length === 0) {
    return err('NOTHING_TO_EXPORT', '当前没有分镜可导出，请先生成分镜。');
  }
  switch (format) {
    case 'json':
      return ok(toJson(project));
    case 'markdown':
      return ok(toMarkdown(project, promptLang));
    case 'plaintext':
      return ok(toPlaintext(project, promptLang));
  }
}

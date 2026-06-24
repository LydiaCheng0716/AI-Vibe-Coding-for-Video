// 分镜导出（TASK-008 / api-spec §3.5）。纯函数：Project → Markdown / JSON / 纯文本。
// 隐私（ARCH-LOW-002）：Project 数据结构本身不含 API Key / Provider 凭据（baseUrl 等），
// 这些存于 settings/keyVault，不在 Project，故导出天然不泄露凭据。
import { ok, err, type Result, type Project, type Character, type Shot } from './models';

export type ExportFormat = 'markdown' | 'json' | 'plaintext';

export const EXPORT_META: Record<ExportFormat, { ext: string; mime: string; label: string }> = {
  markdown: { ext: 'md', mime: 'text/markdown', label: 'Markdown' },
  json: { ext: 'json', mime: 'application/json', label: 'JSON' },
  plaintext: { ext: 'txt', mime: 'text/plain', label: '纯文本' },
};

function charLabel(c: Character, i: number): string {
  return c.name ?? `角色${i + 1}`;
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

function shotMd(s: Shot): string {
  return [
    `### 镜头 ${s.index}：${s.summary}`,
    `- 景别：${s.shotSize}`,
    `- 运镜：${s.cameraMovement}`,
    `- 时长：${s.durationSuggestion}`,
    '',
    '```',
    s.prompt,
    '```',
  ].join('\n');
}

function toMarkdown(p: Project): string {
  const parts: string[] = ['# StoryBoard AI 分镜', '', '## 故事', '', p.story, ''];
  if (p.characters.length > 0) {
    parts.push('## 角色一致性', '');
    p.characters.forEach((c, i) => parts.push(`- **${charLabel(c, i)}**：${c.appearance}`));
    parts.push('');
  }
  parts.push('## 分镜', '');
  p.shots.forEach((s) => parts.push(shotMd(s), ''));
  if (p.bgm) {
    parts.push('## BGM 提示词', '', '```', p.bgm.prompt, '```', '');
  }
  return parts.join('\n').trimEnd() + '\n';
}

function shotText(s: Shot): string {
  return [
    `镜头 ${s.index}：${s.summary}`,
    `景别：${s.shotSize}　运镜：${s.cameraMovement}　时长：${s.durationSuggestion}`,
    `提示词：${s.prompt}`,
  ].join('\n');
}

function toPlaintext(p: Project): string {
  const parts: string[] = ['StoryBoard AI 分镜', '', '故事：', p.story, ''];
  if (p.characters.length > 0) {
    parts.push('角色一致性：');
    p.characters.forEach((c, i) => parts.push(`- ${charLabel(c, i)}：${c.appearance}`));
    parts.push('');
  }
  p.shots.forEach((s) => parts.push(shotText(s), ''));
  if (p.bgm) parts.push('BGM 提示词：', p.bgm.prompt, '');
  return parts.join('\n').trimEnd() + '\n';
}

/** 导出当前项目为指定格式。无分镜 → NOTHING_TO_EXPORT。 */
export function exportProject(project: Project | null, format: ExportFormat): Result<string> {
  if (!project || !project.shots || project.shots.length === 0) {
    return err('NOTHING_TO_EXPORT', '当前没有分镜可导出，请先生成分镜。');
  }
  switch (format) {
    case 'json':
      return ok(toJson(project));
    case 'markdown':
      return ok(toMarkdown(project));
    case 'plaintext':
      return ok(toPlaintext(project));
  }
}

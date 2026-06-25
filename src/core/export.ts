// 分镜导出（TASK-008 / api-spec §3.5）。纯函数：Project → Markdown / JSON / 纯文本。
// 隐私（ARCH-LOW-002）：Project 数据结构本身不含 API Key / Provider 凭据（baseUrl 等），
// 这些存于 settings/keyVault，不在 Project，故导出天然不泄露凭据。
import { ok, err, type Result, type Project, type Character, type Shot, type Transition } from './models';
import { transitionLabel } from './transitions';

export type ExportFormat = 'markdown' | 'json' | 'plaintext' | 'csv' | 'platform';

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
  csv: { ext: 'csv', mime: 'text/csv', label: 'CSV 分镜表' },
  platform: { ext: 'txt', mime: 'text/plain', label: '平台排版（提示词）' },
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

/** 首帧图像提示词按导出语言分段（Issue #57）；无 → []。 */
function firstFrameParts(s: Shot, lang: ExportPromptLang): Array<{ label: string | null; text: string }> {
  if (!s.firstFramePrompt) return [];
  if (!s.firstFramePromptEn) return [{ label: null, text: s.firstFramePrompt }];
  if (lang === 'zh') return [{ label: null, text: s.firstFramePrompt }];
  if (lang === 'en') return [{ label: null, text: s.firstFramePromptEn }];
  return [
    { label: '中文', text: s.firstFramePrompt },
    { label: 'English', text: s.firstFramePromptEn },
  ];
}

function shotMd(s: Shot, lang: ExportPromptLang): string {
  const promptBlocks = shotPromptParts(s, lang).flatMap((part) =>
    part.label ? [`**${part.label}**`, ...codeBlock(part.text)] : codeBlock(part.text),
  );
  const ffParts = firstFrameParts(s, lang);
  const ffBlocks =
    ffParts.length > 0
      ? ['', '**首帧图像提示词**', ...ffParts.flatMap((p) => (p.label ? [`*${p.label}*`, ...codeBlock(p.text)] : codeBlock(p.text)))]
      : [];
  return [
    `### 镜头 ${s.index}：${s.summary}`,
    `- 景别：${s.shotSize}`,
    `- 运镜：${s.cameraMovement}`,
    `- 时长：${s.durationSuggestion}`,
    '',
    ...promptBlocks,
    ...ffBlocks,
  ].join('\n');
}

/** 转场说明文本（按导出语言；双语 both 出中英）。 */
function transitionNotes(t: Transition, lang: ExportPromptLang): string[] {
  if (!t.noteEn) return [t.note];
  if (lang === 'zh') return [t.note];
  if (lang === 'en') return [t.noteEn];
  return [`中文：${t.note}`, `English：${t.noteEn}`];
}

function toMarkdown(p: Project, lang: ExportPromptLang): string {
  const parts: string[] = ['# StoryPop 分镜', '', '## 故事', '', p.story, ''];
  if (p.characters.length > 0) {
    parts.push('## 角色一致性', '');
    p.characters.forEach((c, i) => parts.push(`- **${charLabel(c, i)}**：${c.appearance}`));
    parts.push('');
  }
  parts.push('## 分镜', '');
  p.shots.forEach((s, i) => {
    parts.push(shotMd(s, lang), '');
    if (s.transitionToNext && i < p.shots.length - 1) {
      const label = transitionLabel(s.transitionToNext.type, p.params.outputLanguage);
      parts.push(`**转场 → 镜头 ${s.index + 1}（${label}）**`);
      transitionNotes(s.transitionToNext, lang).forEach((n) => parts.push(`> ${n}`));
      parts.push('');
    }
  });
  if (p.bgm) {
    parts.push('## BGM 提示词', '', ...codeBlock(p.bgm.prompt), '');
  }
  return parts.join('\n').trimEnd() + '\n';
}

function shotText(s: Shot, lang: ExportPromptLang): string {
  const promptLines = shotPromptParts(s, lang).map((part) =>
    part.label ? `提示词（${part.label}）：${part.text}` : `提示词：${part.text}`,
  );
  const ffLines = firstFrameParts(s, lang).map((part) =>
    part.label ? `首帧（${part.label}）：${part.text}` : `首帧图像提示词：${part.text}`,
  );
  return [
    `镜头 ${s.index}：${s.summary}`,
    `景别：${s.shotSize}　运镜：${s.cameraMovement}　时长：${s.durationSuggestion}`,
    ...promptLines,
    ...ffLines,
  ].join('\n');
}

function toPlaintext(p: Project, lang: ExportPromptLang): string {
  const parts: string[] = ['StoryPop 分镜', '', '故事：', p.story, ''];
  if (p.characters.length > 0) {
    parts.push('角色一致性：');
    p.characters.forEach((c, i) => parts.push(`- ${charLabel(c, i)}：${c.appearance}`));
    parts.push('');
  }
  p.shots.forEach((s, i) => {
    parts.push(shotText(s, lang), '');
    if (s.transitionToNext && i < p.shots.length - 1) {
      const label = transitionLabel(s.transitionToNext.type, p.params.outputLanguage);
      parts.push(`转场 → 镜头 ${s.index + 1}（${label}）：`);
      transitionNotes(s.transitionToNext, lang).forEach((n) => parts.push(n));
      parts.push('');
    }
  });
  if (p.bgm) parts.push('BGM 提示词：', p.bgm.prompt, '');
  return parts.join('\n').trimEnd() + '\n';
}

// ---- CSV 分镜表（Issue #34）----

/**
 * CSV 单元格转义。
 * 1) 公式注入防护（Codex P2）：以 = + - @（或 TAB/CR）开头的单元格在表格软件里会被当公式执行，
 *    用户/模型生成的提示词可能含这些前缀 → 加单引号前缀中和，使其当纯文本。
 * 2) 含 " , 换行 → 双引号包裹，内部 " → ""。
 */
function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function transitionCsv(s: Shot, p: Project): string {
  const t = s.transitionToNext;
  if (!t) return '';
  return `${transitionLabel(t.type, p.params.outputLanguage)}：${t.note}`;
}

function toCsv(p: Project): string {
  const bilingual = p.shots.some((s) => s.promptEn);
  const hasTransition = p.shots.some((s) => s.transitionToNext);
  const hasFirstFrame = p.shots.some((s) => s.firstFramePrompt);
  const header = [
    '镜头',
    '景别',
    '运镜',
    '时长',
    '提示词',
    ...(bilingual ? ['英文提示词'] : []),
    ...(hasFirstFrame ? ['首帧图像提示词'] : []),
    ...(hasTransition ? ['转场(至下一镜)'] : []),
  ];
  const rows = p.shots.map((s) =>
    [
      String(s.index),
      s.shotSize,
      s.cameraMovement,
      s.durationSuggestion,
      s.prompt,
      ...(bilingual ? [s.promptEn ?? ''] : []),
      ...(hasFirstFrame ? [s.firstFramePrompt ?? ''] : []),
      ...(hasTransition ? [transitionCsv(s, p)] : []),
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.map(csvCell).join(','), ...rows].join('\r\n') + '\r\n';
}

// ---- 平台排版（Issue #34）：粘贴即用的纯提示词块，适配可灵/即梦 ----

function toPlatform(p: Project, lang: ExportPromptLang): string {
  const parts: string[] = [];
  p.shots.forEach((s) => {
    parts.push(`【镜头 ${s.index}】${s.summary}`);
    shotPromptParts(s, lang).forEach((part) =>
      parts.push(part.label ? `[${part.label}] ${part.text}` : part.text),
    );
    parts.push('');
  });
  if (p.bgm) parts.push(`【BGM】${p.bgm.prompt}`);
  return parts.join('\n').trimEnd() + '\n';
}

/**
 * 导出当前项目为指定格式。无分镜 → NOTHING_TO_EXPORT。
 * promptLang（Issue #41）：双语镜头按语言选择渲染；JSON 始终含完整 shot（含 promptEn）；
 * CSV 双语列恒含两版。
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
    case 'csv':
      return ok(toCsv(project));
    case 'platform':
      return ok(toPlatform(project, promptLang));
  }
}

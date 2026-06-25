// 分镜生成的 system / user 提示词构造（TASK-003，TASK-004 接入模板）。
// system 明确要求模型「只输出 JSON、不要解释文字」，外壳对齐 ADR-6(1)；
// 每个 shot.prompt 的结构与语言由所选模板（cinematic-en / jimeng-keling-zh）注入。
// Issue #41：outputLanguage='zh-en' 时每镜头给中文 prompt + 英文 promptEn 两版。
import type { GenerationParams, OutputLanguage } from '../core/models';
import { SHOTS_MIN, SHOTS_MAX } from '../core/parse';
import { resolveTemplate } from './templates';
import { cinematicEn } from './templates/cinematic-en';
import { jimengKelingZh } from './templates/jimeng-keling-zh';
import { clampField } from './sanitize';
import { characterInstruction } from './characters';
import { styleInstruction } from './style';

export interface PromptPair {
  system: string;
  user: string;
}

const SHOT_FIELDS_SHELL =
  '"summary": "string", "shotSize": "string", "cameraMovement": "string", "durationSuggestion": "string"';

// 角色结构化外壳（Issue #29：profile / suggestions / seedPhrase 必须保留，否则丢结构化数据）。
const CHARACTER_SHELL =
  '{ "name": "string|null", "appearance": "string", "profile": { "codename": "string", "ageRange": "string", "gender": "string", "ethnicitySkin": "string", "hair": "string", "face": "string", "build": "string", "clothing": "string", "accessories": "string", "demeanor": "string" }, "suggestions": { "ageRange": ["string"], "hair": ["string"] }, "seedPhrase": "string" }';

/** ADR-6(1) 期望输出外壳。双语时 shot 增 promptEn；角色结构化字段始终保留。 */
function jsonShell(bilingual: boolean): string {
  const shotLine = bilingual
    ? `{ ${SHOT_FIELDS_SHELL}, "prompt": "中文版", "promptEn": "English version", "characterRefs": ["string"] }`
    : `{ ${SHOT_FIELDS_SHELL}, "prompt": "string", "characterRefs": ["string"] }`;
  return `{
  "globalStyle": { "profile": { "colorGrade": "string", "lighting": "string", "lensFocal": "string", "filmTexture": "string", "mood": "string" }, "suggestions": { "colorGrade": ["string"], "lighting": ["string"] } },
  "characters": [ ${CHARACTER_SHELL} ],
  "shots": [
    ${shotLine}
  ]
}`;
}

function langLabel(lang: OutputLanguage): string {
  if (lang === 'en') return 'English';
  if (lang === 'zh-en') return '简体中文（可读字段）+ 中英双语提示词';
  return '简体中文';
}

function shotInstruction(params: GenerationParams): string {
  if (params.outputLanguage !== 'zh-en') {
    return resolveTemplate(params).template.shotPromptInstruction(params);
  }
  // 双语：prompt 用中文（即梦/可灵风格），promptEn 用英文（电影感风格），两版描述同一镜头。
  // 注：下面两套模板各自硬编码语言/字段名，此处显式重映射「模板里说的 shot.prompt」到目标字段，
  // 避免「英文模板要求 prompt 用英文」与「prompt 应为中文版」自相矛盾（Codex P2）。
  return [
    '本次为「中英双语」：每个镜头给两版提示词，描述同一画面、保持一致。',
    '【prompt 字段 = 简体中文版】按以下中文模板组织（模板中提到的「shot.prompt」即指本 prompt 字段）：',
    jimengKelingZh.shotPromptInstruction(params),
    '',
    '【promptEn 字段 = 英文版】按以下英文模板组织（模板中提到的「shot.prompt 必须用 English」在此专指 promptEn 字段；prompt 字段仍用中文）：',
    cinematicEn.shotPromptInstruction(params),
  ].join('\n');
}

export function buildStoryboardPrompt(story: string, params: GenerationParams): PromptPair {
  const lang = langLabel(params.outputLanguage);
  const bilingual = params.outputLanguage === 'zh-en';
  const readableLang = params.outputLanguage === 'en' ? 'English' : '简体中文';
  const system = [
    '你是专业的短视频分镜师，把用户故事拆解成可直接用于 AI 视频生成的结构化分镜。',
    `要求：`,
    `- 输出 ${SHOTS_MIN}–${SHOTS_MAX} 个镜头；镜头数量根据故事繁简自行决定，但必须在该区间内。`,
    bilingual
      ? `- 每个镜头必须包含：summary、shotSize、cameraMovement、durationSuggestion、prompt（中文版）、promptEn（英文版）。`
      : `- 每个镜头必须包含：summary（概要）、shotSize（景别）、cameraMovement（运镜）、durationSuggestion（时长建议）、prompt（完整视频提示词，含正向描述与负面提示词）。`,
    `- summary / shotSize / cameraMovement / durationSuggestion 等可读字段用 ${readableLang} 输出。`,
    '',
    styleInstruction(),
    '',
    characterInstruction(),
    '',
    shotInstruction(params),
    '',
    '只输出符合下面结构的 JSON，不要任何解释文字、不要 Markdown 代码块标记：',
    jsonShell(bilingual),
  ].join('\n');

  const user = [
    `故事：\n${story}`,
    '',
    '生成参数：',
    `- 目标视频模型：${params.videoModel}`,
    `- 画面风格：${clampField(params.style) || '（未指定，由你按故事氛围决定）'}`,
    `- 画幅比例：${clampField(params.aspectRatio, 20)}`,
    `- 单镜头时长偏好：${params.shotDurationPref}`,
    `- 输出语言：${lang}`,
  ].join('\n');

  return { system, user };
}

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

export interface PromptPair {
  system: string;
  user: string;
}

const SHOT_FIELDS_SHELL =
  '"summary": "string", "shotSize": "string", "cameraMovement": "string", "durationSuggestion": "string"';

/** ADR-6(1) 期望输出外壳。双语时 shot 增 promptEn。 */
function jsonShell(bilingual: boolean): string {
  const shotLine = bilingual
    ? `{ ${SHOT_FIELDS_SHELL}, "prompt": "中文版", "promptEn": "English version", "characterRefs": ["string"] }`
    : `{ ${SHOT_FIELDS_SHELL}, "prompt": "string", "characterRefs": ["string"] }`;
  return `{
  "characters": [ { "name": "string|null", "appearance": "string" } ],
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
  return [
    '本次为「中英双语」：每个镜头给两版提示词，描述同一画面、保持一致。',
    '【prompt 字段（简体中文）】按以下中文模板组织：',
    jimengKelingZh.shotPromptInstruction(params),
    '',
    '【promptEn 字段（English）】按以下英文模板组织：',
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

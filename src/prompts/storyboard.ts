// 分镜生成的 system / user 提示词构造（TASK-003，TASK-004 接入模板）。
// system 明确要求模型「只输出 JSON、不要解释文字」，外壳对齐 ADR-6(1)；
// 每个 shot.prompt 的结构与语言由所选模板（cinematic-en / jimeng-keling-zh）注入。
import type { GenerationParams } from '../core/models';
import { SHOTS_MIN, SHOTS_MAX } from '../core/parse';
import { resolveTemplate } from './templates';
import { clampField } from './sanitize';
import { characterInstruction } from './characters';

export interface PromptPair {
  system: string;
  user: string;
}

/** ADR-6(1) 期望输出外壳，写进 system 提示，强约束模型只回 JSON。 */
const JSON_SHELL = `{
  "characters": [ {
    "name": "string|null", "appearance": "string",
    "profile": { "codename": "string", "ageRange": "string", "gender": "string", "ethnicitySkin": "string", "hair": "string", "face": "string", "build": "string", "clothing": "string", "accessories": "string", "demeanor": "string" },
    "suggestions": { "ageRange": ["string"], "hair": ["string"] },
    "seedPhrase": "string"
  } ],
  "shots": [
    { "summary": "string", "shotSize": "string", "cameraMovement": "string",
      "durationSuggestion": "string", "prompt": "string", "characterRefs": ["string"] }
  ]
}`;

function langLabel(lang: GenerationParams['outputLanguage']): string {
  return lang === 'en' ? 'English' : '简体中文';
}

export function buildStoryboardPrompt(story: string, params: GenerationParams): PromptPair {
  const lang = langLabel(params.outputLanguage);
  const { template } = resolveTemplate(params);
  const system = [
    '你是专业的短视频分镜师，把用户故事拆解成可直接用于 AI 视频生成的结构化分镜。',
    `要求：`,
    `- 输出 ${SHOTS_MIN}–${SHOTS_MAX} 个镜头；镜头数量根据故事繁简自行决定，但必须在该区间内。`,
    `- 每个镜头必须包含：summary（概要）、shotSize（景别）、cameraMovement（运镜）、durationSuggestion（时长建议）、prompt（完整视频提示词，含正向描述与负面提示词）。`,
    `- summary / shotSize / cameraMovement / durationSuggestion 等可读字段用 ${lang} 输出。`,
    '',
    characterInstruction(),
    '',
    template.shotPromptInstruction(params),
    '',
    '只输出符合下面结构的 JSON，不要任何解释文字、不要 Markdown 代码块标记：',
    JSON_SHELL,
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

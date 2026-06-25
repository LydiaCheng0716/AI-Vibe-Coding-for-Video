// 单镜头重写 prompt（Issue #30 + #32 共用管线）。三模式：regenerate（盲重生成）、
// feedback（反馈式优化）、params（#32 调参重写）。只让模型回「单个镜头 JSON」，由 core/parse 解析。
import type { GenerationParams, OutputLanguage, Shot } from '../core/models';
import { resolveTemplate } from './templates';
import { cinematicEn } from './templates/cinematic-en';
import { jimengKelingZh } from './templates/jimeng-keling-zh';
import { clampField } from './sanitize';

export type RewriteMode = 'regenerate' | 'feedback' | 'params';

export interface RewriteContext {
  story: string;
  params: GenerationParams;
  shot: Shot;
  feedback?: string;
  paramOverrides?: Partial<Pick<Shot, 'shotSize' | 'cameraMovement' | 'durationSuggestion'>>;
}

function singleShotShell(bilingual: boolean): string {
  const head =
    '"summary": "string", "shotSize": "string", "cameraMovement": "string", "durationSuggestion": "string"';
  return bilingual
    ? `{ ${head}, "prompt": "中文版", "promptEn": "English version" }`
    : `{ ${head}, "prompt": "string" }`;
}

function langLabel(lang: OutputLanguage): string {
  if (lang === 'en') return 'English';
  if (lang === 'zh-en') return '中英双语';
  return '简体中文';
}

/** 非空 override 才生效，否则回退（杜绝 '' override 污染，Kimi P2）。供 generation 组装复用。 */
export function pickOverride(override: string | undefined, fallback: string): string {
  return override && override.trim() ? override.trim() : fallback;
}

const INTRO: Record<RewriteMode, string> = {
  regenerate:
    '请为下面这个镜头重新生成一版提示词：保持同一剧情位置与景别/运镜/时长大方向，换一种更好的画面表达与构图。',
  feedback:
    '请根据用户反馈，只改写下面这个镜头的提示词：在保留景别/运镜/时长与角色一致性约束的前提下，落实反馈意图。',
  params: '用户调整了该镜头的景别/运镜/时长，请据新参数重写该镜头提示词，使画面与新参数一致。',
};

export function buildShotRewritePrompt(
  ctx: RewriteContext,
  mode: RewriteMode,
): { system: string; user: string } {
  const lang = langLabel(ctx.params.outputLanguage);
  const bilingual = ctx.params.outputLanguage === 'zh-en';
  // 空串 override 回退到原值（`??` 会把 '' 当有效值 → 污染提示词/产出空参数，Kimi P2）；clampField 限长。
  const target = {
    shotSize: clampField(pickOverride(ctx.paramOverrides?.shotSize, ctx.shot.shotSize), 40),
    cameraMovement: clampField(pickOverride(ctx.paramOverrides?.cameraMovement, ctx.shot.cameraMovement), 40),
    durationSuggestion: clampField(pickOverride(ctx.paramOverrides?.durationSuggestion, ctx.shot.durationSuggestion), 20),
  };
  const styleInstruction = bilingual
    ? [
        '本次为「中英双语」：prompt 用简体中文（即梦/可灵风格），promptEn 用英文（电影感风格），两版描述同一镜头并保持一致。',
        jimengKelingZh.shotPromptInstruction(ctx.params),
        cinematicEn.shotPromptInstruction(ctx.params),
      ].join('\n')
    : resolveTemplate(ctx.params).template.shotPromptInstruction(ctx.params);

  const system = [
    '你是专业短视频分镜师，现在只重写「单个镜头」，不要返回其它镜头。',
    INTRO[mode],
    `- summary / shotSize / cameraMovement / durationSuggestion 等可读字段用 ${lang} 输出。`,
    '',
    styleInstruction,
    '',
    '只输出符合下面结构的单个镜头 JSON，不要任何解释文字、不要 Markdown 代码块标记：',
    singleShotShell(bilingual),
  ].join('\n');

  const userLines = [
    `故事背景：\n${ctx.story}`,
    '',
    '当前镜头：',
    `- summary：${ctx.shot.summary}`,
    `- 景别 shotSize：${target.shotSize}`,
    `- 运镜 cameraMovement：${target.cameraMovement}`,
    `- 时长 durationSuggestion：${target.durationSuggestion}`,
    `- 原提示词 prompt：\n${ctx.shot.prompt}`,
    '',
    `生成参数：风格 ${clampField(ctx.params.style) || '（按氛围）'}；画幅 ${clampField(ctx.params.aspectRatio, 20)}；输出语言 ${lang}`,
  ];
  if (mode === 'feedback' && ctx.feedback && ctx.feedback.trim()) {
    userLines.push('', `用户反馈（务必落实）：${ctx.feedback.trim()}`);
  }
  if (mode === 'params') {
    userLines.push(
      '',
      `新参数（务必匹配）：景别=${target.shotSize}；运镜=${target.cameraMovement}；时长=${target.durationSuggestion}`,
    );
  }
  return { system, user: userLines.join('\n') };
}

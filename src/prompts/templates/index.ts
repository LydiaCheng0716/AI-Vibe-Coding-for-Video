// 视频提示词模板注册表 + 回退逻辑（TASK-004）。为未来模板库扩展预留：新增模板 = 注册一项。
import type { GenerationParams, TemplateId, VideoModel } from '../../core/models';
import { cinematicEn } from './cinematic-en';
import { jimengKelingZh } from './jimeng-keling-zh';

export interface PromptTemplate {
  id: TemplateId;
  /** 注入 system 提示：约束每个 shot.prompt 的字段结构与语言。 */
  shotPromptInstruction(params: GenerationParams): string;
}

/** 默认回退模板（通用英文电影感）。 */
export const FALLBACK_TEMPLATE = cinematicEn;

const REGISTRY: Record<TemplateId, PromptTemplate> = {
  'cinematic-en': cinematicEn,
  'jimeng-keling-zh': jimengKelingZh,
};

/**
 * 按 params.templateId 解析模板；无法识别 → 回退通用模板并记录可排查状态（不抛错、不静默）。
 */
export function resolveTemplate(params: GenerationParams): {
  template: PromptTemplate;
  fellBack: boolean;
} {
  const t = REGISTRY[params.templateId];
  if (t) return { template: t, fellBack: false };
  // 可排查日志：保留原始 templateId，便于定位脏数据/版本不一致。
  console.warn(`[templates] 未知 templateId="${String(params.templateId)}"，回退到 ${FALLBACK_TEMPLATE.id}`);
  return { template: FALLBACK_TEMPLATE, fellBack: true };
}

/** 目标视频模型 → 默认模板：即梦/可灵用中文模板，其余用通用英文模板（按视频模型套模板）。 */
export function defaultTemplateIdFor(videoModel: VideoModel): TemplateId {
  return videoModel === 'jimeng' || videoModel === 'keling' ? 'jimeng-keling-zh' : 'cinematic-en';
}

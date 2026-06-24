// 通用英文电影感模板（TASK-004）。要求每个 shot.prompt 用英文，含完整电影级字段 + 负面提示词。
import type { GenerationParams } from '../../core/models';
import type { PromptTemplate } from './index';
import { clampField } from '../sanitize';

export const cinematicEn: PromptTemplate = {
  id: 'cinematic-en',
  shotPromptInstruction(params: GenerationParams): string {
    const style = clampField(params.style);
    return [
      '镜头提示词模板：通用英文电影感（cinematic-en）。',
      '每个 shot.prompt 必须用 **English** 编写，并依次涵盖以下要素：',
      '- subject（画面主体）',
      '- action（主体动作）',
      '- shot size（景别，呼应 shotSize）',
      '- camera movement（运镜，呼应 cameraMovement）',
      `- style（视觉风格${style ? `，参考用户偏好：${style}` : '，按故事氛围决定'}）`,
      '- lighting（光线/氛围）',
      `- aspect ratio hint（画幅：${clampField(params.aspectRatio, 20)}）`,
      '- negative prompt（负面提示词，列出要避免的元素，如 blurry, distorted hands, extra fingers, watermark）',
      '把上述要素组织成一段连贯、可直接粘贴到视频工具的英文提示词，负面提示词可用 "Negative:" 前缀单列。',
    ].join('\n');
  },
};

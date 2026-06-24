// 即梦/可灵中文模板（TASK-004）。要求每个 shot.prompt 用中文，含画面描述/镜头语言/风格/负面提示词。
import type { GenerationParams } from '../../core/models';
import type { PromptTemplate } from './index';
import { clampField } from '../sanitize';

export const jimengKelingZh: PromptTemplate = {
  id: 'jimeng-keling-zh',
  shotPromptInstruction(params: GenerationParams): string {
    const style = clampField(params.style);
    return [
      '镜头提示词模板：即梦/可灵中文（jimeng-keling-zh）。',
      '每个 shot.prompt 必须用 **简体中文** 编写，并依次涵盖以下要素：',
      '- 画面描述（主体、场景、动作）',
      '- 镜头语言（景别与运镜，呼应 shotSize / cameraMovement）',
      `- 风格（${style ? `参考用户偏好：${style}` : '按故事氛围决定'}；画幅 ${clampField(params.aspectRatio, 20)}）`,
      '- 负面提示词（要避免的元素，如 画面模糊、手部畸形、多余手指、水印）',
      '把上述要素组织成一段连贯、可直接粘贴到即梦/可灵的中文提示词，负面提示词可用「负面：」前缀单列。',
    ].join('\n');
  },
};

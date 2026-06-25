// 即梦/可灵中文模板（TASK-004）。要求每个 shot.prompt 用中文，含画面描述/镜头语言/风格/负面提示词。
import type { GenerationParams } from '../../core/models';
import type { PromptTemplate } from './index';
import { clampField } from '../sanitize';
import { modelWords } from './modelWords';

export const jimengKelingZh: PromptTemplate = {
  id: 'jimeng-keling-zh',
  shotPromptInstruction(params: GenerationParams): string {
    const style = clampField(params.style);
    // Issue #31：负面词/风格词按目标视频模型定制（集中于 modelWords）；本模板为中文 → 取中文词，
    // 跨语言模型回退中文通用，杜绝英文词进中文提示词（Codex P2）。
    const { negative, style: styleWords } = modelWords(params.videoModel, 'zh');
    const styleHint = styleWords.length > 0 ? `；建议风格词：${styleWords.join('、')}` : '';
    return [
      '镜头提示词模板：即梦/可灵中文（jimeng-keling-zh）。',
      '每个 shot.prompt 必须用 **简体中文** 编写，并依次涵盖以下要素：',
      '- 画面描述（主体、场景、动作）',
      '- 镜头语言（景别与运镜，呼应 shotSize / cameraMovement）',
      `- 风格（${style ? `参考用户偏好：${style}` : '按故事氛围决定'}；画幅 ${clampField(params.aspectRatio, 20)}${styleHint}）`,
      `- 负面提示词（针对「${params.videoModel}」要避免：${negative.join('、')}）`,
      '把上述要素组织成一段连贯、可直接粘贴到即梦/可灵的中文提示词，负面提示词可用「负面：」前缀单列。',
    ].join('\n');
  },
};

// 按目标视频模型定制的负面词 + 正向风格词（Issue #31）。集中维护，模板按 videoModel 取用；
// 缺省/未知模型回退通用词表。语言与对应模板一致（即梦/可灵=中文，sora/runway/generic=英文）。
import type { VideoModel } from '../../core/models';

export interface ModelWords {
  /** 负面提示词：要避免的元素。 */
  negative: string[];
  /** 正向风格词：提升出片质感的风格提示。 */
  style: string[];
}

const TABLE: Record<VideoModel, ModelWords> = {
  generic: {
    negative: ['blurry', 'distorted face', 'extra fingers', 'watermark'],
    style: [],
  },
  sora: {
    negative: ['blurry', 'distorted hands', 'extra fingers', 'watermark', 'low quality', 'deformed anatomy'],
    style: ['cinematic', 'photorealistic', 'natural lighting', 'high detail'],
  },
  runway: {
    negative: ['blurry', 'warped face', 'extra limbs', 'watermark', 'low quality', 'temporal flicker'],
    style: ['cinematic', 'film grain', 'smooth motion'],
  },
  jimeng: {
    negative: ['画面模糊', '手部畸形', '多余手指', '水印', '低质量', '五官扭曲'],
    style: ['电影感', '高清细节', '自然光影'],
  },
  keling: {
    negative: ['画面模糊', '肢体畸形', '多余手指', '水印', '低质量', '运动拖影'],
    style: ['电影质感', '细节丰富', '流畅运镜'],
  },
};

/** 取该视频模型的词表；未知 → 回退通用（generic）。 */
export function modelWords(videoModel: VideoModel): ModelWords {
  return TABLE[videoModel] ?? TABLE.generic;
}

// 按目标视频模型定制的负面词 + 正向风格词（Issue #31）。集中维护，模板按 videoModel + 模板语言取用。
// 词的语言必须跟随「调用模板的语言」而非仅 videoModel（Codex P2）：否则改了视频模型但模板未变、
// 或中英双语同时调两套模板时，会把中文词塞进英文提示词、违反语言契约。
// 规则：模型有「与模板语言一致」的专属词 → 用专属；否则回退该语言的通用词表。
import type { VideoModel } from '../../core/models';

export type WordLang = 'zh' | 'en';

export interface ModelWords {
  /** 负面提示词：要避免的元素。 */
  negative: string[];
  /** 正向风格词：提升出片质感的风格提示。 */
  style: string[];
}

/** 各语言的通用词表（缺省/跨语言回退）。 */
const GENERIC: Record<WordLang, ModelWords> = {
  en: { negative: ['blurry', 'distorted face', 'extra fingers', 'watermark'], style: [] },
  zh: { negative: ['画面模糊', '五官扭曲', '多余手指', '水印'], style: [] },
};

/** 模型专属词（各自标注语言，仅当与模板语言一致时生效）。 */
const MODEL: Partial<Record<VideoModel, ModelWords & { lang: WordLang }>> = {
  sora: {
    lang: 'en',
    negative: ['blurry', 'distorted hands', 'extra fingers', 'watermark', 'low quality', 'deformed anatomy'],
    style: ['cinematic', 'photorealistic', 'natural lighting', 'high detail'],
  },
  runway: {
    lang: 'en',
    negative: ['blurry', 'warped face', 'extra limbs', 'watermark', 'low quality', 'temporal flicker'],
    style: ['cinematic', 'film grain', 'smooth motion'],
  },
  jimeng: {
    lang: 'zh',
    negative: ['画面模糊', '手部畸形', '多余手指', '水印', '低质量', '五官扭曲'],
    style: ['电影感', '高清细节', '自然光影'],
  },
  keling: {
    lang: 'zh',
    negative: ['画面模糊', '肢体畸形', '多余手指', '水印', '低质量', '运动拖影'],
    style: ['电影质感', '细节丰富', '流畅运镜'],
  },
};

/**
 * 取该视频模型在指定模板语言下的词表。模型专属词仅在其语言 == 模板语言时生效，
 * 否则回退该语言的通用词表——保证词语言与提示词语言一致（不跨语言污染）。
 */
export function modelWords(videoModel: VideoModel, lang: WordLang): ModelWords {
  const m = MODEL[videoModel];
  if (m && m.lang === lang) return { negative: m.negative, style: m.style };
  return GENERIC[lang];
}

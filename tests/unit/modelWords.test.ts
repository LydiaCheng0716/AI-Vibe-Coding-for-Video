import { describe, it, expect } from 'vitest';
import { modelWords } from '../../src/prompts/templates/modelWords';
import { cinematicEn } from '../../src/prompts/templates/cinematic-en';
import { jimengKelingZh } from '../../src/prompts/templates/jimeng-keling-zh';
import { defaultParams } from '../../src/core/defaults';
import type { VideoModel } from '../../src/core/models';

describe('modelWords（语言跟随模板）', () => {
  it('模型语言==模板语言 → 用专属词', () => {
    expect(modelWords('jimeng', 'zh').negative).toContain('五官扭曲');
    expect(modelWords('jimeng', 'zh').style).toContain('电影感');
    expect(modelWords('keling', 'zh').negative).toContain('运动拖影');
    expect(modelWords('sora', 'en').negative).toContain('deformed anatomy');
    expect(modelWords('sora', 'en').style).toContain('photorealistic');
    expect(modelWords('runway', 'en').negative).toContain('temporal flicker');
  });
  it('跨语言（模型语言≠模板语言）→ 回退该语言通用，不串语言（Codex P2）', () => {
    // 中文模型放进英文模板 → 英文通用词，绝无中文
    const zhInEn = modelWords('jimeng', 'en');
    expect(zhInEn.negative).toContain('blurry');
    expect(zhInEn.negative.join('')).not.toMatch(/[一-龥]/);
    // 英文模型放进中文模板 → 中文通用词，绝无英文负面
    const enInZh = modelWords('sora', 'zh');
    expect(enInZh.negative).toContain('画面模糊');
    expect(enInZh.negative).not.toContain('deformed anatomy');
  });
  it('generic / 未知 → 该语言通用词表', () => {
    expect(modelWords('generic', 'en').negative).toContain('blurry');
    expect(modelWords('generic', 'zh').negative).toContain('画面模糊');
    expect(modelWords('veo' as VideoModel, 'en')).toEqual(modelWords('generic', 'en'));
  });
});

describe('模板按模型取词（Issue #31）', () => {
  it('cinematic-en + sora → 含 sora 专属负面/风格词', () => {
    const ins = cinematicEn.shotPromptInstruction({ ...defaultParams(), videoModel: 'sora' });
    expect(ins).toContain('deformed anatomy');
    expect(ins).toContain('photorealistic');
    expect(ins.toLowerCase()).toContain('negative'); // 标签不回归
  });
  it('cinematic-en + generic → 通用负面词', () => {
    const ins = cinematicEn.shotPromptInstruction({ ...defaultParams(), videoModel: 'generic' });
    expect(ins).toContain('blurry');
  });
  it('jimeng-keling-zh + jimeng → 含中文专属词', () => {
    const ins = jimengKelingZh.shotPromptInstruction({ ...defaultParams(), videoModel: 'jimeng' });
    expect(ins).toContain('五官扭曲');
    expect(ins).toContain('电影感');
    expect(ins).toContain('负面'); // 标签不回归
  });
});

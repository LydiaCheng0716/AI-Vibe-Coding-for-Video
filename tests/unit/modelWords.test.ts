import { describe, it, expect } from 'vitest';
import { modelWords } from '../../src/prompts/templates/modelWords';
import { cinematicEn } from '../../src/prompts/templates/cinematic-en';
import { jimengKelingZh } from '../../src/prompts/templates/jimeng-keling-zh';
import { defaultParams } from '../../src/core/defaults';
import type { VideoModel } from '../../src/core/models';

describe('modelWords', () => {
  it('jimeng/keling → 中文负面词', () => {
    expect(modelWords('jimeng').negative).toContain('五官扭曲');
    expect(modelWords('jimeng').style).toContain('电影感');
    expect(modelWords('keling').negative).toContain('运动拖影');
  });
  it('sora/runway → 英文负面 + 风格词', () => {
    expect(modelWords('sora').negative).toContain('deformed anatomy');
    expect(modelWords('sora').style).toContain('photorealistic');
    expect(modelWords('runway').negative).toContain('temporal flicker');
  });
  it('generic → 通用词表', () => {
    expect(modelWords('generic').negative).toContain('blurry');
    expect(modelWords('generic').style).toEqual([]);
  });
  it('未知模型 → 回退 generic', () => {
    expect(modelWords('veo' as VideoModel)).toEqual(modelWords('generic'));
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

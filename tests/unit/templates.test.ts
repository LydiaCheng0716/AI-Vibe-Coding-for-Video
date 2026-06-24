import { describe, it, expect, vi } from 'vitest';
import {
  resolveTemplate,
  defaultTemplateIdFor,
  FALLBACK_TEMPLATE,
  TEMPLATE_IDS,
} from '../../src/prompts/templates';
import type { VideoModel } from '../../src/core/models';
import { buildStoryboardPrompt } from '../../src/prompts/storyboard';
import { defaultParams } from '../../src/core/defaults';
import type { GenerationParams } from '../../src/core/models';

function params(over: Partial<GenerationParams> = {}): GenerationParams {
  return { ...defaultParams(), ...over };
}

describe('cinematic-en 模板', () => {
  const tpl = resolveTemplate(params({ templateId: 'cinematic-en' })).template;
  const ins = tpl.shotPromptInstruction(params({ templateId: 'cinematic-en' }));
  it('声明英文且含电影级要素 + 负面提示词', () => {
    expect(ins).toContain('English');
    for (const f of ['subject', 'action', 'shot size', 'camera movement', 'style', 'lighting', 'negative'])
      expect(ins.toLowerCase()).toContain(f);
  });
});

describe('jimeng-keling-zh 模板', () => {
  const ins = resolveTemplate(params({ templateId: 'jimeng-keling-zh' })).template.shotPromptInstruction(
    params({ templateId: 'jimeng-keling-zh' }),
  );
  it('声明中文且含画面描述/镜头语言/风格/负面', () => {
    expect(ins).toContain('简体中文');
    for (const f of ['画面描述', '镜头语言', '风格', '负面']) expect(ins).toContain(f);
  });
});

describe('resolveTemplate 回退', () => {
  it('已知 id → fellBack=false', () => {
    const r = resolveTemplate(params({ templateId: 'jimeng-keling-zh' }));
    expect(r.fellBack).toBe(false);
    expect(r.template.id).toBe('jimeng-keling-zh');
  });
  it('未知 id → 回退 cinematic-en + fellBack=true + warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = resolveTemplate(params({ templateId: 'no-such' as never }));
    expect(r.fellBack).toBe(true);
    expect(r.template.id).toBe(FALLBACK_TEMPLATE.id);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe('注册表一致性（遗留 #1）', () => {
  it('TEMPLATE_IDS 每项都能解析且 id 自洽', () => {
    expect(TEMPLATE_IDS.length).toBeGreaterThanOrEqual(2);
    for (const id of TEMPLATE_IDS) {
      const r = resolveTemplate(params({ templateId: id }));
      expect(r.fellBack).toBe(false);
      expect(r.template.id).toBe(id);
    }
  });
  it('defaultTemplateIdFor 的输出都在注册表中', () => {
    const models: VideoModel[] = ['generic', 'jimeng', 'keling', 'sora', 'runway'];
    for (const m of models) expect(TEMPLATE_IDS).toContain(defaultTemplateIdFor(m));
  });
});

describe('defaultTemplateIdFor（按视频模型）', () => {
  it('即梦/可灵 → 中文模板', () => {
    expect(defaultTemplateIdFor('jimeng')).toBe('jimeng-keling-zh');
    expect(defaultTemplateIdFor('keling')).toBe('jimeng-keling-zh');
  });
  it('sora/runway/generic → 英文模板', () => {
    expect(defaultTemplateIdFor('sora')).toBe('cinematic-en');
    expect(defaultTemplateIdFor('runway')).toBe('cinematic-en');
    expect(defaultTemplateIdFor('generic')).toBe('cinematic-en');
  });
});

describe('buildStoryboardPrompt 按 templateId 注入对应模板指令', () => {
  it('cinematic-en → system 含英文模板指令', () => {
    const { system } = buildStoryboardPrompt('一个故事', params({ templateId: 'cinematic-en' }));
    expect(system).toContain('cinematic-en');
    expect(system).toContain('English');
  });
  it('jimeng-keling-zh → system 含中文模板指令', () => {
    const { system } = buildStoryboardPrompt('一个故事', params({ templateId: 'jimeng-keling-zh' }));
    expect(system).toContain('jimeng-keling-zh');
    expect(system).toContain('画面描述');
  });
});

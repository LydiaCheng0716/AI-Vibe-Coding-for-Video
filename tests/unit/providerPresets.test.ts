import { describe, it, expect } from 'vitest';
import {
  PROVIDER_PRESETS,
  CUSTOM_PRESET_ID,
  applyPreset,
  presetIdForProvider,
  getPreset,
} from '../../src/core/providerPresets';
import type { ProviderConfig } from '../../src/core/models';

const base: ProviderConfig = { kind: 'openai-compatible', model: '' };

describe('PROVIDER_PRESETS（清单）', () => {
  it('含 7 项，顺序对齐 Issue 正文', () => {
    expect(PROVIDER_PRESETS.map((p) => p.id)).toEqual([
      'moonshot-cn',
      'moonshot-ai',
      'deepseek',
      'openai',
      'zhipu',
      'custom',
      'anthropic',
    ]);
  });

  it('Moonshot(.cn) 预设：baseUrl + 默认模型正确', () => {
    const p = getPreset('moonshot-cn')!;
    expect(p.kind).toBe('openai-compatible');
    expect(p.baseUrl).toBe('https://api.moonshot.cn/v1');
    expect(p.defaultModel).toBe('moonshot-v1-8k');
  });

  it('.cn 与 .ai 平台区分（baseUrl 不同）', () => {
    expect(getPreset('moonshot-cn')!.baseUrl).toContain('moonshot.cn');
    expect(getPreset('moonshot-ai')!.baseUrl).toContain('moonshot.ai');
  });

  it('Anthropic 预设 kind=anthropic、有默认模型、无 baseUrl', () => {
    const p = getPreset('anthropic')!;
    expect(p.kind).toBe('anthropic');
    expect(p.defaultModel.length).toBeGreaterThan(0);
    expect(p.baseUrl).toBeUndefined();
  });

  it('自定义预设 id 常量一致', () => {
    expect(CUSTOM_PRESET_ID).toBe('custom');
    expect(getPreset(CUSTOM_PRESET_ID)).toBeDefined();
  });
});

describe('applyPreset（选中即填，纯函数不可变）', () => {
  it('普通预设：填 kind + baseUrl + 默认模型', () => {
    const out = applyPreset(base, getPreset('moonshot-cn')!);
    expect(out.kind).toBe('openai-compatible');
    expect(out.baseUrl).toBe('https://api.moonshot.cn/v1');
    expect(out.model).toBe('moonshot-v1-8k');
  });

  it('Anthropic：kind anthropic + 默认模型 + baseUrl 清空', () => {
    const withUrl: ProviderConfig = { kind: 'openai-compatible', baseUrl: 'https://x/v1', model: 'foo' };
    const out = applyPreset(withUrl, getPreset('anthropic')!);
    expect(out.kind).toBe('anthropic');
    expect(out.model).toBe(getPreset('anthropic')!.defaultModel);
    expect(out.baseUrl).toBeUndefined();
  });

  it('自定义：清空 baseUrl 但保留 model；反推稳定为 custom（不弹回原预设）', () => {
    const fromPreset: ProviderConfig = { kind: 'openai-compatible', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' };
    const out = applyPreset(fromPreset, getPreset('custom')!);
    expect(out.kind).toBe('openai-compatible');
    expect(out.baseUrl).toBeUndefined();
    expect(out.model).toBe('moonshot-v1-8k'); // 保留用户已填模型名（Kimi minor）
    // baseUrl 清空 → 不再命中 moonshot，稳定反推为 custom
    expect(presetIdForProvider(out)).toBe('custom');
  });

  it('切换预设覆盖 model，避免残留上一个错模型', () => {
    const afterDeepseek = applyPreset(base, getPreset('deepseek')!);
    expect(afterDeepseek.model).toBe('deepseek-chat');
    const afterOpenai = applyPreset(afterDeepseek, getPreset('openai')!);
    expect(afterOpenai.model).toBe('gpt-4o-mini');
  });

  it('透传 grantedOrigins，不丢已授权域名', () => {
    const granted: ProviderConfig = { ...base, grantedOrigins: ['https://api.moonshot.cn/*'] };
    const out = applyPreset(granted, getPreset('deepseek')!);
    expect(out.grantedOrigins).toEqual(['https://api.moonshot.cn/*']);
  });

  it('不可变：不修改入参', () => {
    const input: ProviderConfig = { kind: 'openai-compatible', model: 'x' };
    applyPreset(input, getPreset('openai')!);
    expect(input).toEqual({ kind: 'openai-compatible', model: 'x' });
  });
});

describe('presetIdForProvider（回显反推）', () => {
  it('按 baseUrl 命中预设（含尾斜杠也命中）', () => {
    expect(presetIdForProvider({ kind: 'openai-compatible', model: '', baseUrl: 'https://api.moonshot.cn/v1' })).toBe('moonshot-cn');
    expect(presetIdForProvider({ kind: 'openai-compatible', model: '', baseUrl: 'https://api.moonshot.cn/v1/' })).toBe('moonshot-cn');
  });

  it('anthropic 按 kind 命中', () => {
    expect(presetIdForProvider({ kind: 'anthropic', model: 'claude-x' })).toBe('anthropic');
  });

  it('空 baseUrl 或未知 baseUrl → custom', () => {
    expect(presetIdForProvider({ kind: 'openai-compatible', model: '' })).toBe('custom');
    expect(presetIdForProvider({ kind: 'openai-compatible', model: '', baseUrl: 'https://unknown.example/v1' })).toBe('custom');
  });
});

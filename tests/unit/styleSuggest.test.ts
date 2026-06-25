import { describe, it, expect, vi } from 'vitest';
import { suggestStyleFieldAttempt, suggestStyleField } from '../../src/services/styleSuggest';
import type { PreflightDeps } from '../../src/services/generation';
import type { Settings } from '../../src/core/models';
import { defaultSettings } from '../../src/core/defaults';
import { type LlmProvider } from '../../src/services/llm/provider';
import { withLlmLock } from '../../src/services/llmLock';

function settings(): Settings {
  const s = defaultSettings();
  s.provider = { ...s.provider, model: 'gpt-4o-mini' };
  return s;
}

function makeDeps(
  over: Partial<PreflightDeps> = {},
  complete = vi.fn().mockResolvedValue('{"suggestions":["暖金调","冷蓝调","高反差"]}'),
) {
  const provider: LlmProvider = { complete, probe: vi.fn() };
  const createProvider = vi.fn().mockReturnValue(provider);
  const deps: PreflightDeps = {
    getSettings: vi.fn().mockResolvedValue(settings()),
    hasApiKey: vi.fn().mockResolvedValue(true),
    getApiKeyForRequest: vi.fn().mockResolvedValue('sk-key'),
    hasHostPermission: vi.fn().mockResolvedValue(true),
    createProvider,
    ...over,
  };
  return { deps, complete, createProvider };
}

describe('suggestStyleFieldAttempt', () => {
  it('成功 → 2–4 候选', async () => {
    const { deps } = makeDeps();
    const r = await suggestStyleFieldAttempt({ field: 'colorGrade', story: '故事' }, deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual(['暖金调', '冷蓝调', '高反差']);
  });

  it('prompt 针对该字段（含标签）', async () => {
    const { deps, complete } = makeDeps();
    await suggestStyleFieldAttempt({ field: 'colorGrade', story: '故事' }, deps);
    expect((complete.mock.calls[0][0] as { system: string }).system).toContain('色调/调色');
  });

  it('前置校验失败（无 Key）→ 不建 provider', async () => {
    const { deps, createProvider } = makeDeps({
      hasApiKey: vi.fn().mockResolvedValue(false),
      getApiKeyForRequest: vi.fn().mockResolvedValue(null),
    });
    const r = await suggestStyleFieldAttempt({ field: 'mood' }, deps);
    expect(r).toMatchObject({ ok: false, error: { code: 'NO_API_KEY' } });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('解析失败 → BAD_RESPONSE_FORMAT', async () => {
    const { deps } = makeDeps({}, vi.fn().mockResolvedValue('抱歉'));
    const r = await suggestStyleFieldAttempt({ field: 'mood' }, deps);
    expect(r).toMatchObject({ ok: false, error: { code: 'BAD_RESPONSE_FORMAT' } });
  });
});

describe('suggestStyleField（锁包裹）', () => {
  it('并发占用 → GENERATION_IN_PROGRESS', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const held = withLlmLock(() => gate.then(() => ({ ok: true as const, data: undefined })));
    const { deps, createProvider } = makeDeps();
    const r = await suggestStyleField({ field: 'mood' }, deps);
    expect(r).toMatchObject({ ok: false, error: { code: 'GENERATION_IN_PROGRESS' } });
    expect(createProvider).not.toHaveBeenCalled();
    release();
    await held;
  });
});

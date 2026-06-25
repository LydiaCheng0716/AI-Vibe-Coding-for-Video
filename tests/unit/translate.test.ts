import { describe, it, expect, vi } from 'vitest';
import { buildTranslatePrompt } from '../../src/prompts/translate';
import { translateTextAttempt, translateText } from '../../src/services/generation';
import type { PreflightDeps } from '../../src/services/generation';
import type { Settings } from '../../src/core/models';
import { defaultSettings } from '../../src/core/defaults';
import { type LlmProvider } from '../../src/services/llm/provider';
import { withLlmLock } from '../../src/services/llmLock';

describe('buildTranslatePrompt', () => {
  it('含目标语言、只输出译文', () => {
    expect(buildTranslatePrompt('海边日出', 'en').system).toContain('English');
    expect(buildTranslatePrompt('sunrise', 'zh').system).toContain('简体中文');
    expect(buildTranslatePrompt('x', 'en').system).toContain('只输出译文');
  });
});

function settings(): Settings {
  const s = defaultSettings();
  s.provider = { ...s.provider, model: 'gpt-4o-mini' };
  return s;
}
function makeDeps(over: Partial<PreflightDeps> = {}, complete = vi.fn().mockResolvedValue('  seaside sunrise  ')) {
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

describe('translateText', () => {
  it('成功 → 译文（trim）', async () => {
    const { deps } = makeDeps();
    const r = await translateTextAttempt({ text: '海边日出', targetLang: 'en' }, deps);
    expect(r).toEqual({ ok: true, data: 'seaside sunrise' });
  });

  it('空文本 → 不发请求', async () => {
    const { deps, createProvider } = makeDeps();
    const r = await translateTextAttempt({ text: '   ', targetLang: 'en' }, deps);
    expect(r.ok).toBe(false);
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('空结果 → BAD_RESPONSE_FORMAT', async () => {
    const { deps } = makeDeps({}, vi.fn().mockResolvedValue('   '));
    const r = await translateTextAttempt({ text: '海边日出', targetLang: 'en' }, deps);
    expect(r).toMatchObject({ ok: false, error: { code: 'BAD_RESPONSE_FORMAT' } });
  });

  it('前置失败（无 Key）→ 不发', async () => {
    const { deps, createProvider } = makeDeps({ hasApiKey: vi.fn().mockResolvedValue(false), getApiKeyForRequest: vi.fn().mockResolvedValue(null) });
    const r = await translateTextAttempt({ text: '海边日出', targetLang: 'en' }, deps);
    expect(r).toMatchObject({ ok: false, error: { code: 'NO_API_KEY' } });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('锁占用 → GENERATION_IN_PROGRESS', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const held = withLlmLock(() => gate.then(() => ({ ok: true as const, data: undefined })));
    const { deps } = makeDeps();
    const r = await translateText({ text: '海边日出', targetLang: 'en' }, deps);
    expect(r).toMatchObject({ ok: false, error: { code: 'GENERATION_IN_PROGRESS' } });
    release();
    await held;
  });
});

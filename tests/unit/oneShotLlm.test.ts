import { describe, expect, it, vi } from 'vitest';
import { err, ok, type Settings } from '../../src/core/models';
import { defaultSettings } from '../../src/core/defaults';
import { ProviderCallError, type LlmProvider } from '../../src/services/llm/provider';
import { runOneShotLlm, type PreflightDeps } from '../../src/services/generation';
import { withLlmLock } from '../../src/services/llmLock';

function settings(): Settings {
  const s = defaultSettings();
  s.provider = { ...s.provider, model: 'gpt-4o-mini' };
  return s;
}

function makeDeps(complete = vi.fn().mockResolvedValue('{"value":"done"}')) {
  const provider: LlmProvider = { complete, probe: vi.fn() };
  const createProvider = vi.fn().mockReturnValue(provider);
  const deps: PreflightDeps = {
    getSettings: vi.fn().mockResolvedValue(settings()),
    hasApiKey: vi.fn().mockResolvedValue(true),
    getApiKeyForRequest: vi.fn().mockResolvedValue('sk-stored'),
    hasHostPermission: vi.fn().mockResolvedValue(true),
    createProvider,
  };
  return { deps, complete, createProvider };
}

describe('runOneShotLlm', () => {
  it('成功时执行 preflight、complete 和 parse，并透传请求参数', async () => {
    const { deps, complete } = makeDeps();

    const r = await runOneShotLlm({
      deps,
      apiKey: 'sk-override',
      lock: false,
      timeoutMs: 1234,
      maxTokens: 55,
      buildPrompt: ({ settings }) => ({
        system: `system:${settings.provider.model}`,
        user: 'user prompt',
      }),
      parse: (raw) => ok(JSON.parse(raw) as { value: string }),
    });

    expect(r).toEqual(ok({ value: 'done' }));
    expect(deps.hasApiKey).not.toHaveBeenCalled();
    expect(deps.getApiKeyForRequest).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0]).toMatchObject({
      system: 'system:gpt-4o-mini',
      user: 'user prompt',
      model: 'gpt-4o-mini',
      apiKey: 'sk-override',
      maxTokens: 55,
    });
    expect(complete.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
  });

  it('preflight 失败时不创建 provider、不发 complete', async () => {
    const { deps, createProvider, complete } = makeDeps();
    deps.hasApiKey = vi.fn().mockResolvedValue(false);
    deps.getApiKeyForRequest = vi.fn().mockResolvedValue(null);

    const r = await runOneShotLlm({
      deps,
      lock: false,
      timeoutMs: 100,
      maxTokens: 10,
      buildPrompt: () => ({ system: 'system', user: 'user' }),
      parse: () => ok('unused'),
    });

    expect(r).toMatchObject({ ok: false, error: { code: 'NO_API_KEY' } });
    expect(createProvider).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('默认带全局锁：占用时直接返回 GENERATION_IN_PROGRESS', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const held = withLlmLock(() => gate.then(() => ok(undefined)));
    const { deps, createProvider } = makeDeps();

    const r = await runOneShotLlm({
      deps,
      timeoutMs: 100,
      maxTokens: 10,
      buildPrompt: () => ({ system: 'system', user: 'user' }),
      parse: () => ok('unused'),
    });

    expect(r).toMatchObject({ ok: false, error: { code: 'GENERATION_IN_PROGRESS' } });
    expect(createProvider).not.toHaveBeenCalled();
    release();
    await held;
  });

  it('默认带退避重试，并保留最后一次解析结果', async () => {
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new ProviderCallError('RATE_LIMITED', 'too many', true, 5))
      .mockResolvedValueOnce('ok');
    const { deps } = makeDeps(complete);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const r = await runOneShotLlm({
      deps,
      timeoutMs: 100,
      maxTokens: 10,
      retryOpts: { sleep, jitter: () => 0 },
      buildPrompt: () => ({ system: 'system', user: 'user' }),
      parse: (raw) => (raw === 'ok' ? ok('parsed') : err('BAD_RESPONSE_FORMAT', 'bad')),
    });

    expect(r).toEqual(ok('parsed'));
    expect(complete).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(5);
  });
});

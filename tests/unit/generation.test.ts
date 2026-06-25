import { describe, it, expect, vi } from 'vitest';
import {
  generateStoryboard,
  generateStoryboardAttempt,
  type GenerationDeps,
} from '../../src/services/generation';
import { ProviderCallError, type LlmProvider } from '../../src/services/llm/provider';
import { ok, type Settings } from '../../src/core/models';
import { defaultSettings } from '../../src/core/defaults';

function settingsWith(over: Partial<Settings['provider']> = {}): Settings {
  const s = defaultSettings();
  s.provider = { ...s.provider, model: 'gpt-4o-mini', ...over };
  return s;
}

function goodShots() {
  const shot = {
    summary: '日出',
    shotSize: '远景',
    cameraMovement: '推',
    durationSuggestion: '3s',
    prompt: 'p',
  };
  return JSON.stringify({ shots: [shot, { ...shot, summary: '2' }, { ...shot, summary: '3' }] });
}

function makeDeps(over: Partial<GenerationDeps> = {}): GenerationDeps {
  const provider: LlmProvider = { complete: vi.fn().mockResolvedValue(goodShots()), probe: vi.fn() };
  return {
    getSettings: vi.fn().mockResolvedValue(settingsWith()),
    hasApiKey: vi.fn().mockResolvedValue(true),
    getApiKeyForRequest: vi.fn().mockResolvedValue('sk-secret-key'),
    hasHostPermission: vi.fn().mockResolvedValue(true),
    createProvider: vi.fn().mockReturnValue(provider),
    saveCurrentProject: vi.fn().mockResolvedValue(ok(undefined)),
    ...over,
  };
}

const STORY = '这是一个足够长的故事，用来通过长度校验，讲一只猫的冒险旅程。';

describe('generateStoryboard: 前置校验链', () => {
  it('空故事 → EMPTY_STORY', async () => {
    const r = await generateStoryboard({ story: '' }, makeDeps());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('EMPTY_STORY');
  });

  it('过短 → STORY_TOO_SHORT', async () => {
    const r = await generateStoryboard({ story: '太短' }, makeDeps());
    if (!r.ok) expect(r.error.code).toBe('STORY_TOO_SHORT');
  });

  it('过长 → STORY_TOO_LONG', async () => {
    const r = await generateStoryboard({ story: '字'.repeat(5001) }, makeDeps());
    if (!r.ok) expect(r.error.code).toBe('STORY_TOO_LONG');
  });

  it('Provider 缺 model → MODEL_REQUIRED', async () => {
    const deps = makeDeps({ getSettings: vi.fn().mockResolvedValue(settingsWith({ model: '' })) });
    const r = await generateStoryboard({ story: STORY }, deps);
    if (!r.ok) expect(r.error.code).toBe('MODEL_REQUIRED');
  });

  it('非 https baseUrl → INVALID_PROVIDER_CONFIG', async () => {
    const deps = makeDeps({
      getSettings: vi.fn().mockResolvedValue(settingsWith({ baseUrl: 'http://x.com' })),
    });
    const r = await generateStoryboard({ story: STORY }, deps);
    if (!r.ok) expect(r.error.code).toBe('INVALID_PROVIDER_CONFIG');
  });

  it('未配置 Key → NO_API_KEY', async () => {
    const deps = makeDeps({ hasApiKey: vi.fn().mockResolvedValue(false) });
    const r = await generateStoryboard({ story: STORY }, deps);
    if (!r.ok) expect(r.error.code).toBe('NO_API_KEY');
  });

  it('已配置但解密失败 → KEY_DECRYPT_FAILED', async () => {
    const deps = makeDeps({ getApiKeyForRequest: vi.fn().mockResolvedValue(null) });
    const r = await generateStoryboard({ story: STORY }, deps);
    if (!r.ok) expect(r.error.code).toBe('KEY_DECRYPT_FAILED');
  });

  it('无 host 权限 → HOST_PERMISSION_DENIED', async () => {
    const deps = makeDeps({ hasHostPermission: vi.fn().mockResolvedValue(false) });
    const r = await generateStoryboard({ story: STORY }, deps);
    if (!r.ok) expect(r.error.code).toBe('HOST_PERMISSION_DENIED');
  });

  it('校验失败时不发出站请求', async () => {
    const provider: LlmProvider = { complete: vi.fn(), probe: vi.fn() };
    const deps = makeDeps({
      hasApiKey: vi.fn().mockResolvedValue(false),
      createProvider: vi.fn().mockReturnValue(provider),
    });
    await generateStoryboard({ story: STORY }, deps);
    expect(provider.complete).not.toHaveBeenCalled();
  });
});

describe('generateStoryboard: 成功与出站失败', () => {
  it('成功 → 落 currentProject 并返回 Project', async () => {
    const save = vi.fn().mockResolvedValue(ok(undefined));
    const r = await generateStoryboard({ story: STORY }, makeDeps({ saveCurrentProject: save }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.shots).toHaveLength(3);
      expect(r.data.story).toBe(STORY);
    }
    expect(save).toHaveBeenCalledOnce();
  });

  it('401 → AUTH_FAILED（不重试）', async () => {
    const provider: LlmProvider = {
      complete: vi.fn().mockRejectedValue(new ProviderCallError('AUTH_FAILED', 'x', false)),
      probe: vi.fn(),
    };
    const deps = makeDeps({ createProvider: vi.fn().mockReturnValue(provider) });
    const r = await generateStoryboard({ story: STORY }, deps);
    if (!r.ok) {
      expect(r.error.code).toBe('AUTH_FAILED');
      expect(r.error.retriable).toBe(false);
    }
  });

  it('429 → 重试耗尽后 RATE_LIMITED（注入 no-op sleep）', async () => {
    const complete = vi.fn().mockRejectedValue(new ProviderCallError('RATE_LIMITED', 'x', true));
    const deps = makeDeps({ createProvider: vi.fn().mockReturnValue({ complete }) });
    const r = await generateStoryboard({ story: STORY }, deps, { sleep: async () => {} });
    if (!r.ok) expect(r.error.code).toBe('RATE_LIMITED');
    expect(complete).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it('返回无法解析 → BAD_RESPONSE_FORMAT', async () => {
    const provider: LlmProvider = { complete: vi.fn().mockResolvedValue('抱歉我帮不了你'), probe: vi.fn() };
    const deps = makeDeps({ createProvider: vi.fn().mockReturnValue(provider) });
    const r = await generateStoryboard({ story: STORY }, deps);
    if (!r.ok) expect(r.error.code).toBe('BAD_RESPONSE_FORMAT');
  });

  it('成功生成的项目注入了人物一致性（TASK-005 接线）', async () => {
    const withChar = JSON.stringify({
      characters: [{ name: '小红', appearance: '扎马尾的女孩' }],
      shots: [
        { summary: '1', shotSize: '近景', cameraMovement: '推', durationSuggestion: '2s', prompt: 'p1', characterRefs: ['小红'] },
        { summary: '2', shotSize: '中景', cameraMovement: '摇', durationSuggestion: '2s', prompt: 'p2' },
        { summary: '3', shotSize: '远景', cameraMovement: '固定', durationSuggestion: '2s', prompt: 'p3' },
      ],
    });
    const deps = makeDeps({
      createProvider: vi.fn().mockReturnValue({ complete: vi.fn().mockResolvedValue(withChar) }),
    });
    const r = await generateStoryboard({ story: STORY }, deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.shots[0].prompt).toContain('扎马尾的女孩');
  });

  it('generateStoryboardAttempt 成功但【不落库】（009 重试接缝）', async () => {
    const save = vi.fn().mockResolvedValue(ok(undefined));
    const r = await generateStoryboardAttempt({ story: STORY }, makeDeps({ saveCurrentProject: save }));
    expect(r.ok).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('apiKey override（不保存模式）→ 用 override、不调 keyVault', async () => {
    const complete = vi.fn().mockResolvedValue(goodShots());
    const hasApiKey = vi.fn().mockResolvedValue(false); // 没落盘也能生成
    const getKey = vi.fn();
    const deps = makeDeps({
      hasApiKey,
      getApiKeyForRequest: getKey,
      createProvider: vi.fn().mockReturnValue({ complete }),
    });
    const r = await generateStoryboard({ story: STORY, apiKey: 'sk-once-typed' }, deps);
    expect(r.ok).toBe(true);
    expect(getKey).not.toHaveBeenCalled();
    expect(hasApiKey).not.toHaveBeenCalled();
    expect(complete.mock.calls[0][0]).toMatchObject({ apiKey: 'sk-once-typed' });
  });

  it('空 override → 回退 keyVault 路径', async () => {
    const getKey = vi.fn().mockResolvedValue('sk-stored');
    const deps = makeDeps({ getApiKeyForRequest: getKey });
    await generateStoryboard({ story: STORY, apiKey: '   ' }, deps);
    expect(getKey).toHaveBeenCalledTimes(1);
  });

  it('apiKey 解密一次并透传给 provider（不二次解密）', async () => {
    const complete = vi.fn().mockResolvedValue(goodShots());
    const getKey = vi.fn().mockResolvedValue('sk-once');
    const deps = makeDeps({
      getApiKeyForRequest: getKey,
      createProvider: vi.fn().mockReturnValue({ complete }),
    });
    await generateStoryboard({ story: STORY }, deps);
    expect(getKey).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0]).toMatchObject({ apiKey: 'sk-once' });
  });

  it('进行中再次调用 → GENERATION_IN_PROGRESS（共享全局锁）', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const complete = vi.fn(async () => {
      await gate;
      return goodShots();
    });
    const deps = makeDeps({ createProvider: vi.fn().mockReturnValue({ complete }) });
    const first = generateStoryboard({ story: STORY }, deps);
    const second = await generateStoryboard({ story: STORY }, deps);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('GENERATION_IN_PROGRESS');
    release();
    expect((await first).ok).toBe(true);
  });

  it('429 重试一次后成功（注入 no-op sleep）→ 只落库一次', async () => {
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new ProviderCallError('RATE_LIMITED', 'x', true))
      .mockResolvedValueOnce(goodShots());
    const save = vi.fn().mockResolvedValue(ok(undefined));
    const deps = makeDeps({
      createProvider: vi.fn().mockReturnValue({ complete }),
      saveCurrentProject: save,
    });
    const r = await generateStoryboard({ story: STORY }, deps, { sleep: async () => {} });
    expect(r.ok).toBe(true);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('AUTH_FAILED 不重试（只调用一次）', async () => {
    const complete = vi.fn().mockRejectedValue(new ProviderCallError('AUTH_FAILED', 'x', false));
    const deps = makeDeps({ createProvider: vi.fn().mockReturnValue({ complete }) });
    await generateStoryboard({ story: STORY }, deps, { sleep: async () => {} });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('storage 写失败 → STORAGE_WRITE_FAILED', async () => {
    const save = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'STORAGE_WRITE_FAILED', message: 'x', retriable: false } });
    const r = await generateStoryboard({ story: STORY }, makeDeps({ saveCurrentProject: save }));
    if (!r.ok) expect(r.error.code).toBe('STORAGE_WRITE_FAILED');
  });
});

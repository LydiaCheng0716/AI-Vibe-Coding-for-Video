import { describe, it, expect, vi } from 'vitest';
import {
  suggestCharacterFieldAttempt,
  suggestCharacterField,
} from '../../src/services/characterSuggest';
import type { PreflightDeps } from '../../src/services/generation';
import type { Character, Settings } from '../../src/core/models';
import { defaultSettings } from '../../src/core/defaults';
import { type LlmProvider } from '../../src/services/llm/provider';
import { withLlmLock } from '../../src/services/llmLock';

function settings(): Settings {
  const s = defaultSettings();
  s.provider = { ...s.provider, model: 'gpt-4o-mini' };
  return s;
}

const character: Character = {
  id: 'c1',
  name: '林夏',
  appearance: '',
  profile: {
    codename: '林夏',
    ageRange: '',
    gender: '女',
    ethnicitySkin: '',
    hair: '',
    face: '',
    build: '',
    clothing: '红色卫衣',
    accessories: '',
    demeanor: '',
  },
};

function makeDeps(
  over: Partial<PreflightDeps> = {},
  complete = vi.fn().mockResolvedValue('{"suggestions":["高马尾","短发","长直发"]}'),
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

describe('suggestCharacterFieldAttempt', () => {
  it('成功 → 2–4 候选', async () => {
    const { deps } = makeDeps();
    const r = await suggestCharacterFieldAttempt({ character, field: 'hair' }, deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual(['高马尾', '短发', '长直发']);
  });

  it('prompt 仅针对该字段该角色（含字段标签 + 角色已知信息）', async () => {
    const { deps, complete } = makeDeps();
    await suggestCharacterFieldAttempt({ character, field: 'hair' }, deps);
    const reqArg = complete.mock.calls[0][0] as { system: string; user: string };
    expect(reqArg.system).toContain('发型发色'); // 目标字段标签
    expect(reqArg.user).toContain('林夏'); // 角色已知信息
    expect(reqArg.user).toContain('红色卫衣'); // 其它已填字段作为上下文
  });

  it('前置校验失败（无 Key）→ 不建 provider、不发请求', async () => {
    const { deps, createProvider } = makeDeps({
      hasApiKey: vi.fn().mockResolvedValue(false),
      getApiKeyForRequest: vi.fn().mockResolvedValue(null),
    });
    const r = await suggestCharacterFieldAttempt({ character, field: 'hair' }, deps);
    expect(r).toMatchObject({ ok: false, error: { code: 'NO_API_KEY' } });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('解析失败 → BAD_RESPONSE_FORMAT', async () => {
    const { deps } = makeDeps({}, vi.fn().mockResolvedValue('抱歉，无法给出建议'));
    const r = await suggestCharacterFieldAttempt({ character, field: 'hair' }, deps);
    expect(r).toMatchObject({ ok: false, error: { code: 'BAD_RESPONSE_FORMAT' } });
  });
});

describe('suggestCharacterField（锁包裹）', () => {
  it('并发占用 → GENERATION_IN_PROGRESS', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const held = withLlmLock(() => gate.then(() => ({ ok: true as const, data: undefined })));
    const { deps, createProvider } = makeDeps();
    const r = await suggestCharacterField({ character, field: 'hair' }, deps);
    expect(r).toMatchObject({ ok: false, error: { code: 'GENERATION_IN_PROGRESS' } });
    expect(createProvider).not.toHaveBeenCalled(); // 锁拒绝即不发请求
    release();
    await held;
  });

  it('空闲时成功穿过锁', async () => {
    const { deps } = makeDeps();
    const r = await suggestCharacterField({ character, field: 'hair' }, deps);
    expect(r.ok).toBe(true);
  });
});

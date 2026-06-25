import { describe, it, expect, vi } from 'vitest';
import { TRANSITION_TYPES, transitionLabel } from '../../src/core/transitions';
import { parseTransition } from '../../src/core/parse';
import { clearStaleTransitions, deleteShotById, moveShot, insertShotAt, makeBlankShot } from '../../src/core/shotOps';
import { generateTransitionAttempt, generateTransition } from '../../src/services/generation';
import type { PreflightDeps } from '../../src/services/generation';
import type { Settings, Shot } from '../../src/core/models';
import { defaultSettings } from '../../src/core/defaults';
import { type LlmProvider } from '../../src/services/llm/provider';
import { withLlmLock } from '../../src/services/llmLock';

function mk(id: string, index: number, over: Partial<Shot> = {}): Shot {
  return {
    id, index, summary: `s${index}`, shotSize: '中景', cameraMovement: '固定',
    durationSuggestion: '3s', prompt: `p${index}`, characterRefs: [], editedByUser: false, ...over,
  };
}

describe('transitions 类型表', () => {
  it('含 6 类，label 中英', () => {
    expect(TRANSITION_TYPES.length).toBeGreaterThanOrEqual(6);
    expect(transitionLabel('dissolve', 'zh')).toBe('叠化');
    expect(transitionLabel('dissolve', 'en')).toBe('Dissolve');
    expect(transitionLabel('dissolve', 'zh-en')).toBe('叠化');
    expect(transitionLabel('unknown', 'zh')).toBe('unknown'); // 回退
  });
});

describe('parseTransition', () => {
  it('JSON note/noteEn', () => {
    expect(parseTransition('{"note":"承接动作","noteEn":"match the action"}')).toEqual({ note: '承接动作', noteEn: 'match the action' });
  });
  it('回退纯文本为 note；空 → null', () => {
    expect(parseTransition('硬切承接')).toEqual({ note: '硬切承接' });
    expect(parseTransition('')).toBeNull();
  });
});

describe('clearStaleTransitions（Issue #54↔#56）', () => {
  const withT = (id: string, index: number, succType?: string) => mk(id, index, succType ? { transitionToNext: { type: succType, note: 'n' } } : {});

  it('删除：后继变化的镜头转场被清，不变的保留', () => {
    // s1(→s2 转场), s2(→s3 转场), s3
    const shots = [withT('s1', 1, 'cut'), withT('s2', 2, 'dissolve'), mk('s3', 3)];
    const out = deleteShotById(shots, 's2'); // s1 的后继从 s2 变 s3 → 清 s1 转场
    expect(out.find((s) => s.id === 's1')?.transitionToNext).toBeUndefined();
  });

  it('移动：受影响镜头转场清，未受影响保留', () => {
    const shots = [withT('s1', 1, 'cut'), mk('s2', 2), withT('s3', 3, 'whip'), mk('s4', 4)];
    // s3 的后继是 s4；把 s1 移到末尾 → s3 后继仍是 s4？ s1 移末：[s2,s3,s4,s1]，s3 后继 s4 不变 → 保留
    const out = moveShot(shots, 's1', 3);
    expect(out.find((s) => s.id === 's3')?.transitionToNext).toBeDefined();
  });

  it('插入：插入点前镜的转场被清', () => {
    const shots = [withT('s1', 1, 'cut'), mk('s2', 2)];
    const out = insertShotAt(shots, 1, makeBlankShot(shots)); // s1 后继从 s2 变新镜 → 清
    expect(out.find((s) => s.id === 's1')?.transitionToNext).toBeUndefined();
  });

  it('clearStaleTransitions 直接：后继不变保留', () => {
    const before = [withT('s1', 1, 'cut'), mk('s2', 2)];
    const after = [withT('s1', 1, 'cut'), mk('s2', 2)];
    expect(clearStaleTransitions(before, after)[0].transitionToNext).toBeDefined();
  });
});

function settings(): Settings {
  const s = defaultSettings();
  s.provider = { ...s.provider, model: 'gpt-4o-mini' };
  return s;
}
function makeDeps(over: Partial<PreflightDeps> = {}, complete = vi.fn().mockResolvedValue('{"note":"承接动作与视线"}')) {
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

describe('generateTransition', () => {
  const prev = mk('s1', 1);
  const next = mk('s2', 2);
  it('成功 → Transition（含 type）', async () => {
    const { deps } = makeDeps();
    const r = await generateTransitionAttempt({ prevShot: prev, nextShot: next, type: 'dissolve' }, deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toMatchObject({ type: 'dissolve', note: '承接动作与视线' });
  });
  it('双语 → 含 noteEn', async () => {
    const s = settings(); s.params.outputLanguage = 'zh-en';
    const { deps } = makeDeps({ getSettings: vi.fn().mockResolvedValue(s) }, vi.fn().mockResolvedValue('{"note":"承接","noteEn":"match"}'));
    const r = await generateTransitionAttempt({ prevShot: prev, nextShot: next, type: 'match' }, deps);
    if (r.ok) expect(r.data.noteEn).toBe('match');
  });
  it('input.lang 覆盖 settings（用项目语言，Codex P2）', async () => {
    // settings 是单语 zh，但项目语言为 zh-en → 应走双语、解析出 noteEn
    const { deps } = makeDeps({}, vi.fn().mockResolvedValue('{"note":"承接","noteEn":"match"}'));
    const r = await generateTransitionAttempt({ prevShot: prev, nextShot: next, type: 'match', lang: 'zh-en' }, deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.noteEn).toBe('match');
  });

  it('前置失败（无 Key）→ 不发', async () => {
    const { deps, createProvider } = makeDeps({ hasApiKey: vi.fn().mockResolvedValue(false), getApiKeyForRequest: vi.fn().mockResolvedValue(null) });
    const r = await generateTransitionAttempt({ prevShot: prev, nextShot: next, type: 'cut' }, deps);
    expect(r).toMatchObject({ ok: false, error: { code: 'NO_API_KEY' } });
    expect(createProvider).not.toHaveBeenCalled();
  });
  it('锁占用 → GENERATION_IN_PROGRESS', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const held = withLlmLock(() => gate.then(() => ({ ok: true as const, data: undefined })));
    const { deps } = makeDeps();
    const r = await generateTransition({ prevShot: prev, nextShot: next, type: 'cut' }, deps);
    expect(r).toMatchObject({ ok: false, error: { code: 'GENERATION_IN_PROGRESS' } });
    release();
    await held;
  });
});

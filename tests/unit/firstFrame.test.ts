import { describe, it, expect, vi } from 'vitest';
import { buildFirstFramePrompt } from '../../src/prompts/firstFrame';
import { parseFirstFrame } from '../../src/core/parse';
import { generateFirstFrameAttempt, generateFirstFrame } from '../../src/services/generation';
import type { PreflightDeps } from '../../src/services/generation';
import type { Character, GlobalStyle, Settings, Shot } from '../../src/core/models';
import { defaultSettings } from '../../src/core/defaults';
import { emptyProfile } from '../../src/core/characterProfile';
import { emptyStyleProfile } from '../../src/core/styleProfile';
import { type LlmProvider } from '../../src/services/llm/provider';
import { withLlmLock } from '../../src/services/llmLock';

function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: 's1', index: 1, summary: '日出', shotSize: '远景', cameraMovement: '推',
    durationSuggestion: '3s', prompt: '海边日出', characterRefs: [], editedByUser: false, ...over,
  };
}
const linxia: Character = { id: 'c1', name: '林夏', appearance: '', profile: { ...emptyProfile(), hair: '黑长直' }, locked: true };
const style: GlobalStyle = { profile: { ...emptyStyleProfile(), colorGrade: '暖金' }, locked: true };

describe('buildFirstFramePrompt', () => {
  it('聚焦构图、弱化运镜；注入角色锚点 + 锁定风格', () => {
    const { system, user } = buildFirstFramePrompt(shot({ characterRefs: ['c1'] }), [linxia], style, 'zh');
    expect(system).toContain('构图');
    expect(system).toContain('弱化运镜');
    expect(user).toContain('黑长直'); // 角色锚点
    expect(user).toContain('暖金'); // 锁定风格锚点
  });
  it('双语 shell 含 firstFrameEn', () => {
    const { system } = buildFirstFramePrompt(shot(), [], undefined, 'zh-en');
    expect(system).toContain('firstFrameEn');
  });
  it('风格未锁 → 不注入风格', () => {
    const { user } = buildFirstFramePrompt(shot(), [], { ...style, locked: false }, 'zh');
    expect(user).not.toContain('暖金');
  });
});

describe('parseFirstFrame', () => {
  it('JSON firstFrame/firstFrameEn', () => {
    expect(parseFirstFrame('{"firstFrame":"广角海景","firstFrameEn":"wide seascape"}')).toEqual({ firstFrame: '广角海景', firstFrameEn: 'wide seascape' });
  });
  it('回退纯文本；空 → null', () => {
    expect(parseFirstFrame('广角海景')).toEqual({ firstFrame: '广角海景' });
    expect(parseFirstFrame('')).toBeNull();
  });
});

function settings(): Settings {
  const s = defaultSettings();
  s.provider = { ...s.provider, model: 'gpt-4o-mini' };
  return s;
}
function makeDeps(over: Partial<PreflightDeps> = {}, complete = vi.fn().mockResolvedValue('{"firstFrame":"广角海边日出，暖金色调"}')) {
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

describe('generateFirstFrame', () => {
  it('成功 → firstFramePrompt', async () => {
    const { deps } = makeDeps();
    const r = await generateFirstFrameAttempt({ shot: shot(), characters: [], globalStyle: undefined }, deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.firstFramePrompt).toContain('暖金');
  });
  it('双语 → 含 firstFramePromptEn（input.lang 覆盖）', async () => {
    const { deps } = makeDeps({}, vi.fn().mockResolvedValue('{"firstFrame":"中","firstFrameEn":"EN"}'));
    const r = await generateFirstFrameAttempt({ shot: shot(), characters: [], lang: 'zh-en' }, deps);
    if (r.ok) expect(r.data.firstFramePromptEn).toBe('EN');
  });
  it('前置失败（无 Key）→ 不发', async () => {
    const { deps, createProvider } = makeDeps({ hasApiKey: vi.fn().mockResolvedValue(false), getApiKeyForRequest: vi.fn().mockResolvedValue(null) });
    const r = await generateFirstFrameAttempt({ shot: shot(), characters: [] }, deps);
    expect(r).toMatchObject({ ok: false, error: { code: 'NO_API_KEY' } });
    expect(createProvider).not.toHaveBeenCalled();
  });
  it('锁占用 → GENERATION_IN_PROGRESS', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const held = withLlmLock(() => gate.then(() => ({ ok: true as const, data: undefined })));
    const { deps } = makeDeps();
    const r = await generateFirstFrame({ shot: shot(), characters: [] }, deps);
    expect(r).toMatchObject({ ok: false, error: { code: 'GENERATION_IN_PROGRESS' } });
    release();
    await held;
  });
});

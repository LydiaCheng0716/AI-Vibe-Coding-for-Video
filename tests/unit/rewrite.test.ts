import { describe, it, expect, vi } from 'vitest';
import { buildShotRewritePrompt } from '../../src/prompts/rewrite';
import { parseShotRewrite } from '../../src/core/parse';
import { rewriteShotAttempt, rewriteShot } from '../../src/services/generation';
import type { PreflightDeps } from '../../src/services/generation';
import type { Character, Project, Settings, Shot } from '../../src/core/models';
import { defaultSettings, defaultParams } from '../../src/core/defaults';
import { type LlmProvider } from '../../src/services/llm/provider';
import { withLlmLock } from '../../src/services/llmLock';

function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: 's1',
    index: 1,
    summary: '日出',
    shotSize: '远景',
    cameraMovement: '固定',
    durationSuggestion: '3s',
    prompt: '原提示词',
    characterRefs: [],
    editedByUser: false,
    ...over,
  };
}

function project(over: Partial<Project> = {}): Project {
  return {
    schemaVersion: 1,
    story: '一个关于日出的故事',
    params: defaultParams(),
    characters: [],
    shots: [shot()],
    ...over,
  };
}

const goodShot = JSON.stringify({
  summary: '海边日出',
  shotSize: '近景',
  cameraMovement: '推',
  durationSuggestion: '5s',
  prompt: '新的提示词',
});

function settings(): Settings {
  const s = defaultSettings();
  s.provider = { ...s.provider, model: 'gpt-4o-mini' };
  return s;
}

function makeDeps(over: Partial<PreflightDeps> = {}, complete = vi.fn().mockResolvedValue(goodShot)) {
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

describe('buildShotRewritePrompt（三模式）', () => {
  const ctx = { story: '故事', params: defaultParams(), shot: shot() };

  it('feedback 模式含反馈文本与输出语言', () => {
    const { system, user } = buildShotRewritePrompt({ ...ctx, feedback: '更暗一点、改俯拍' }, 'feedback');
    expect(user).toContain('更暗一点、改俯拍');
    expect(system).toContain('简体中文');
    expect(system).toContain('单个镜头 JSON');
  });

  it('params 模式含新参数', () => {
    const { user } = buildShotRewritePrompt(
      { ...ctx, paramOverrides: { shotSize: '特写', cameraMovement: '环绕', durationSuggestion: '8s' } },
      'params',
    );
    expect(user).toContain('特写');
    expect(user).toContain('环绕');
    expect(user).toContain('8s');
  });

  it('regenerate 模式给出重拍意图', () => {
    const { system } = buildShotRewritePrompt(ctx, 'regenerate');
    expect(system).toContain('重新生成');
  });
});

describe('parseShotRewrite', () => {
  it('合法单镜头 → 5 字段', () => {
    expect(parseShotRewrite(goodShot)).toEqual({
      summary: '海边日出',
      shotSize: '近景',
      cameraMovement: '推',
      durationSuggestion: '5s',
      prompt: '新的提示词',
    });
  });
  it('缺字段 / 非 JSON → null', () => {
    expect(parseShotRewrite('{"summary":"x"}')).toBeNull();
    expect(parseShotRewrite('抱歉')).toBeNull();
    expect(parseShotRewrite('')).toBeNull();
  });
});

describe('rewriteShotAttempt', () => {
  it('regenerate → 新 Shot，保留 id/index/characterRefs', async () => {
    const { deps } = makeDeps();
    const p = project({ shots: [shot({ characterRefs: ['c1'] })] });
    const r = await rewriteShotAttempt({ project: p, shotId: 's1', mode: 'regenerate' }, deps);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toMatchObject({ id: 's1', index: 1, summary: '海边日出', prompt: expect.stringContaining('新的提示词') });
      expect(r.data.characterRefs).toEqual(['c1']);
    }
  });

  it('params 模式：三参数以 override 覆盖（不信模型回显）', async () => {
    const { deps } = makeDeps();
    const r = await rewriteShotAttempt(
      { project: project(), shotId: 's1', mode: 'params', paramOverrides: { shotSize: '特写', cameraMovement: '环绕', durationSuggestion: '8s' } },
      deps,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toMatchObject({ shotSize: '特写', cameraMovement: '环绕', durationSuggestion: '8s' });
  });

  it('空串 override 回退到模型解析值，不产出空参数（Kimi P2）', async () => {
    const { deps } = makeDeps();
    const r = await rewriteShotAttempt(
      { project: project(), shotId: 's1', mode: 'params', paramOverrides: { shotSize: '', cameraMovement: '  ', durationSuggestion: '8s' } },
      deps,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.shotSize).toBe('近景'); // 空串 → 回退 parsed
      expect(r.data.cameraMovement).toBe('推'); // 空白 → 回退 parsed
      expect(r.data.durationSuggestion).toBe('8s'); // 非空 override 生效
    }
  });

  it('锁定角色锚点注入到重写结果（#29 复用，不被模型改写）', async () => {
    const locked: Character = {
      id: 'c1',
      name: '林夏',
      appearance: '',
      profile: { codename: '林夏', ageRange: '', gender: '', ethnicitySkin: '', hair: '黑长直', face: '', build: '', clothing: '', accessories: '', demeanor: '' },
      locked: true,
    };
    const { deps } = makeDeps();
    const p = project({ characters: [locked], shots: [shot({ characterRefs: ['c1'] })] });
    const r = await rewriteShotAttempt({ project: p, shotId: 's1', mode: 'regenerate' }, deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.prompt).toContain('发型发色:黑长直');
  });

  it('feedback 缺反馈 → 不发请求', async () => {
    const { deps, createProvider } = makeDeps();
    const r = await rewriteShotAttempt({ project: project(), shotId: 's1', mode: 'feedback', feedback: '  ' }, deps);
    expect(r.ok).toBe(false);
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('找不到镜头 → 报错，不发请求', async () => {
    const { deps, createProvider } = makeDeps();
    const r = await rewriteShotAttempt({ project: project(), shotId: 'sX', mode: 'regenerate' }, deps);
    expect(r.ok).toBe(false);
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('前置校验失败（无 Key）→ 不发请求', async () => {
    const { deps, createProvider } = makeDeps({
      hasApiKey: vi.fn().mockResolvedValue(false),
      getApiKeyForRequest: vi.fn().mockResolvedValue(null),
    });
    const r = await rewriteShotAttempt({ project: project(), shotId: 's1', mode: 'regenerate' }, deps);
    expect(r).toMatchObject({ ok: false, error: { code: 'NO_API_KEY' } });
    expect(createProvider).not.toHaveBeenCalled();
  });
});

describe('rewriteShot（锁包裹）', () => {
  it('并发占用 → GENERATION_IN_PROGRESS', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const held = withLlmLock(() => gate.then(() => ({ ok: true as const, data: undefined })));
    const { deps, createProvider } = makeDeps();
    const r = await rewriteShot({ project: project(), shotId: 's1', mode: 'regenerate' }, deps);
    expect(r).toMatchObject({ ok: false, error: { code: 'GENERATION_IN_PROGRESS' } });
    expect(createProvider).not.toHaveBeenCalled();
    release();
    await held;
  });
});

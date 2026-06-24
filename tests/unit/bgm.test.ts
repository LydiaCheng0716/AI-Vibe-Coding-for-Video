import { describe, it, expect, vi } from 'vitest';
import {
  generateBgmPrompt,
  generateBgmPromptAttempt,
  type GenerationDeps,
} from '../../src/services/generation';
import { buildBgmPrompt } from '../../src/prompts/bgm';
import { ProviderCallError, type LlmProvider } from '../../src/services/llm/provider';
import { ok, type Settings, type Project } from '../../src/core/models';
import { defaultSettings, defaultParams } from '../../src/core/defaults';

function settings(): Settings {
  const s = defaultSettings();
  s.provider = { ...s.provider, model: 'gpt-4o-mini' };
  return s;
}

function makeDeps(over: Partial<GenerationDeps> = {}): GenerationDeps {
  const provider: LlmProvider = {
    complete: vi.fn().mockResolvedValue('{"prompt":"温暖的钢琴与弦乐，中速，适合回忆场景"}'),
  };
  return {
    getSettings: vi.fn().mockResolvedValue(settings()),
    hasApiKey: vi.fn().mockResolvedValue(true),
    getApiKeyForRequest: vi.fn().mockResolvedValue('sk-key'),
    hasHostPermission: vi.fn().mockResolvedValue(true),
    createProvider: vi.fn().mockReturnValue(provider),
    saveCurrentProject: vi.fn().mockResolvedValue(ok(undefined)),
    ...over,
  };
}

const STORY = '一个关于久别重逢的温暖故事，足够长以通过校验。';

describe('buildBgmPrompt', () => {
  it('含情绪/风格/节奏/乐器/场景且按语言', () => {
    const { system } = buildBgmPrompt({ story: STORY }, 'zh');
    for (const f of ['情绪', '风格', '节奏', '乐器', '场景']) expect(system).toContain(f);
    expect(system).toContain('简体中文');
    expect(buildBgmPrompt({ story: STORY }, 'en').system).toContain('English');
  });
});

describe('generateBgmPrompt', () => {
  it('无 story 无 project → NO_GENERATION_INPUT', async () => {
    const r = await generateBgmPrompt({ language: 'zh' }, makeDeps());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NO_GENERATION_INPUT');
  });

  it('基于故事成功 → 返回 BgmPrompt（language 正确）', async () => {
    const r = await generateBgmPrompt({ story: STORY, language: 'zh' }, makeDeps());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.prompt).toContain('钢琴');
      expect(r.data.language).toBe('zh');
    }
  });

  it('未配置 Key → NO_API_KEY', async () => {
    const deps = makeDeps({ hasApiKey: vi.fn().mockResolvedValue(false) });
    const r = await generateBgmPrompt({ story: STORY, language: 'zh' }, deps);
    if (!r.ok) expect(r.error.code).toBe('NO_API_KEY');
  });

  it('不自行持久化（不调用 saveCurrentProject）', async () => {
    const save = vi.fn().mockResolvedValue(ok(undefined));
    await generateBgmPrompt({ story: STORY, language: 'zh' }, makeDeps({ saveCurrentProject: save }));
    expect(save).not.toHaveBeenCalled();
  });

  it('429 重试耗尽 → RATE_LIMITED（注入 no-op sleep）', async () => {
    const complete = vi.fn().mockRejectedValue(new ProviderCallError('RATE_LIMITED', 'x', true));
    const deps = makeDeps({ createProvider: vi.fn().mockReturnValue({ complete }) });
    const r = await generateBgmPrompt({ story: STORY, language: 'zh' }, deps, { sleep: async () => {} });
    if (!r.ok) expect(r.error.code).toBe('RATE_LIMITED');
    expect(complete).toHaveBeenCalledTimes(3);
  });

  it('与分镜共享全局锁：BGM 进行中再调 → GENERATION_IN_PROGRESS', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const complete = vi.fn(async () => {
      await gate;
      return '{"prompt":"x"}';
    });
    const deps = makeDeps({ createProvider: vi.fn().mockReturnValue({ complete }) });
    const first = generateBgmPrompt({ story: STORY, language: 'zh' }, deps);
    const second = await generateBgmPrompt({ story: STORY, language: 'zh' }, deps);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('GENERATION_IN_PROGRESS');
    release();
    expect((await first).ok).toBe(true);
  });

  it('基于 project（无 story）也可生成', async () => {
    const project: Project = {
      schemaVersion: 1,
      story: '原故事',
      params: defaultParams(),
      characters: [],
      shots: [
        { id: 's1', index: 1, summary: '日出', shotSize: '远', cameraMovement: '推', durationSuggestion: '2s', prompt: 'p', characterRefs: [], editedByUser: false },
        { id: 's2', index: 2, summary: '相遇', shotSize: '中', cameraMovement: '摇', durationSuggestion: '2s', prompt: 'p', characterRefs: [], editedByUser: false },
        { id: 's3', index: 3, summary: '拥抱', shotSize: '近', cameraMovement: '固定', durationSuggestion: '2s', prompt: 'p', characterRefs: [], editedByUser: false },
      ],
    };
    const r = await generateBgmPromptAttempt({ project, language: 'en' }, makeDeps());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.language).toBe('en');
  });
});

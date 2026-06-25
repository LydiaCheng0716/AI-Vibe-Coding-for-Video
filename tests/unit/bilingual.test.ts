import { describe, it, expect } from 'vitest';
import { parseStoryboard, parseShotRewrite } from '../../src/core/parse';
import { buildStoryboardPrompt } from '../../src/prompts/storyboard';
import { exportProject } from '../../src/core/export';
import { defaultParams } from '../../src/core/defaults';
import type { Project, Shot } from '../../src/core/models';

function shotJson(over: Record<string, unknown> = {}) {
  return {
    summary: '日出',
    shotSize: '远景',
    cameraMovement: '推',
    durationSuggestion: '3s',
    prompt: '中文提示词',
    ...over,
  };
}
const threeBilingual = [
  shotJson({ promptEn: 'English prompt 1' }),
  shotJson({ summary: 's2', promptEn: 'English prompt 2' }),
  shotJson({ summary: 's3', promptEn: 'English prompt 3' }),
];

describe('parseStoryboard 双语（Issue #41）', () => {
  it('解析 prompt + promptEn', () => {
    const r = parseStoryboard(JSON.stringify({ shots: threeBilingual }), 'zh-en');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.shots[0].prompt).toBe('中文提示词');
      expect(r.shots[0].promptEn).toBe('English prompt 1');
    }
  });
  it('缺 promptEn → 退化为单语（promptEn undefined）', () => {
    const r = parseStoryboard(JSON.stringify({ shots: [shotJson(), shotJson(), shotJson()] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.shots[0].promptEn).toBeUndefined();
  });
});

describe('buildStoryboardPrompt 双语', () => {
  it('zh-en：system 要求 promptEn 且含中英两套指令', () => {
    const params = { ...defaultParams(), outputLanguage: 'zh-en' as const };
    const { system } = buildStoryboardPrompt('一个故事', params);
    expect(system).toContain('promptEn');
    expect(system).toContain('中英双语');
    expect(system).toContain('English'); // 英文模板指令
  });
  it('单语 zh：system 不含 promptEn', () => {
    const { system } = buildStoryboardPrompt('一个故事', defaultParams());
    expect(system).not.toContain('promptEn');
  });
});

describe('parseShotRewrite 双语', () => {
  it('取 promptEn（可选）', () => {
    const raw = JSON.stringify({ ...shotJson(), promptEn: 'new English' });
    const out = parseShotRewrite(raw);
    expect(out?.prompt).toBe('中文提示词');
    expect(out?.promptEn).toBe('new English');
  });
  it('无 promptEn → undefined', () => {
    expect(parseShotRewrite(JSON.stringify(shotJson()))?.promptEn).toBeUndefined();
  });
});

function bilingualProject(): Project {
  const shots: Shot[] = [
    {
      id: 's1',
      index: 1,
      summary: '日出',
      shotSize: '远景',
      cameraMovement: '推',
      durationSuggestion: '3s',
      prompt: '中文版提示词',
      promptEn: 'English prompt',
      characterRefs: [],
      editedByUser: false,
    },
  ];
  return { schemaVersion: 1, story: 's', params: { ...defaultParams(), outputLanguage: 'zh-en' }, characters: [], shots };
}

describe('exportProject 双语语言选择（Issue #41）', () => {
  it('markdown both → 含中英两版与语言小标', () => {
    const r = exportProject(bilingualProject(), 'markdown', 'both');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toContain('中文版提示词');
      expect(r.data).toContain('English prompt');
      expect(r.data).toContain('English');
    }
  });
  it('markdown zh → 仅中文', () => {
    const r = exportProject(bilingualProject(), 'markdown', 'zh');
    if (r.ok) {
      expect(r.data).toContain('中文版提示词');
      expect(r.data).not.toContain('English prompt');
    }
  });
  it('plaintext en → 仅英文', () => {
    const r = exportProject(bilingualProject(), 'plaintext', 'en');
    if (r.ok) {
      expect(r.data).toContain('English prompt');
      expect(r.data).not.toContain('中文版提示词');
    }
  });
  it('JSON 始终含 promptEn（不受 promptLang 影响）', () => {
    const r = exportProject(bilingualProject(), 'json', 'zh');
    if (r.ok) expect(r.data).toContain('English prompt');
  });
  it('单语项目任何 promptLang → 回退 prompt（不破坏单语）', () => {
    const p = bilingualProject();
    p.shots[0] = { ...p.shots[0], promptEn: undefined };
    const r = exportProject(p, 'plaintext', 'en');
    if (r.ok) expect(r.data).toContain('中文版提示词');
  });
});

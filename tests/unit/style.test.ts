import { describe, it, expect } from 'vitest';
import {
  STYLE_FIELD_KEYS,
  STYLE_FIELD_LABELS,
  emptyStyleProfile,
  composeStyle,
} from '../../src/core/styleProfile';
import {
  styleAnchorLine,
  injectStyleIntoShot,
  injectGlobalStyle,
  reinjectGlobalStyle,
} from '../../src/core/style';
import { defaultParams } from '../../src/core/defaults';
import type { GlobalStyle, Project, Shot, StyleProfile } from '../../src/core/models';

function sp(over: Partial<StyleProfile> = {}): StyleProfile {
  return { ...emptyStyleProfile(), ...over };
}
function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: 's1',
    index: 1,
    summary: 's',
    shotSize: '中景',
    cameraMovement: '固定',
    durationSuggestion: '3s',
    prompt: '一个镜头',
    characterRefs: [],
    editedByUser: false,
    ...over,
  };
}
function project(gs: GlobalStyle | undefined, shots: Shot[]): Project {
  return { schemaVersion: 1, story: 's', params: defaultParams(), characters: [], shots, ...(gs ? { globalStyle: gs } : {}) };
}

describe('styleProfile', () => {
  it('5 字段 + 中英标签齐全', () => {
    expect(STYLE_FIELD_KEYS).toHaveLength(5);
    for (const k of STYLE_FIELD_KEYS) {
      expect(STYLE_FIELD_LABELS.zh[k]).toBeTruthy();
      expect(STYLE_FIELD_LABELS.en[k]).toBeTruthy();
      expect(STYLE_FIELD_LABELS['zh-en'][k]).toBeTruthy();
    }
  });
  it('composeStyle 只取非空、单行；空 → ""', () => {
    expect(composeStyle(sp({ colorGrade: '暖金', mood: '治愈' }), 'zh')).toBe('色调/调色:暖金 | 整体氛围:治愈');
    expect(composeStyle(emptyStyleProfile(), 'zh')).toBe('');
  });
});

describe('全局风格注入', () => {
  const locked: GlobalStyle = { profile: sp({ colorGrade: '暖金', lighting: '柔和侧光' }), locked: true };

  it('locked → 注入锚点行；未锁不注', () => {
    const out = injectGlobalStyle(project(locked, [shot()]));
    expect(out.shots[0].prompt).toContain('- 全局风格：');
    expect(out.shots[0].prompt).toContain('色调/调色:暖金');
    const unlocked = injectGlobalStyle(project({ ...locked, locked: false }, [shot()]));
    expect(unlocked.shots[0].prompt).not.toContain('全局风格');
  });

  it('幂等：跑两次结果相同', () => {
    const once = injectGlobalStyle(project(locked, [shot()]));
    const twice = injectGlobalStyle(once);
    expect(twice.shots[0].prompt).toBe(once.shots[0].prompt);
  });

  it('跳过 editedByUser', () => {
    const out = injectGlobalStyle(project(locked, [shot({ editedByUser: true, prompt: '用户改的' })]));
    expect(out.shots[0].prompt).toBe('用户改的');
  });

  it('reinject 改风格不残留旧值', () => {
    const injected = injectGlobalStyle(project(locked, [shot()]));
    expect(injected.shots[0].prompt).toContain('暖金');
    const changed: GlobalStyle = { profile: sp({ colorGrade: '冷蓝' }), locked: true };
    const re = reinjectGlobalStyle({ ...injected, globalStyle: changed });
    expect(re.shots[0].prompt).toContain('冷蓝');
    expect(re.shots[0].prompt).not.toContain('暖金');
  });

  it('styleAnchorLine：未锁/空 → null', () => {
    expect(styleAnchorLine(undefined, 'zh')).toBeNull();
    expect(styleAnchorLine({ profile: emptyStyleProfile(), locked: true }, 'zh')).toBeNull();
    expect(styleAnchorLine({ profile: sp({ mood: '紧张' }), locked: false }, 'zh')).toBeNull();
  });

  it('injectStyleIntoShot 可独立用于单 shot（#30/#32 复用口径）', () => {
    const out = injectStyleIntoShot(shot(), locked, 'zh');
    expect(out.prompt).toContain('柔和侧光');
  });
});

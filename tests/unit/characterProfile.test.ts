import { describe, it, expect } from 'vitest';
import {
  CHARACTER_FIELD_KEYS,
  CHARACTER_FIELD_LABELS,
  emptyProfile,
  composeAppearance,
} from '../../src/core/characterProfile';

describe('CHARACTER_FIELD_KEYS', () => {
  it('固定 10 字段且顺序稳定', () => {
    expect(CHARACTER_FIELD_KEYS).toEqual([
      'codename',
      'ageRange',
      'gender',
      'ethnicitySkin',
      'hair',
      'face',
      'build',
      'clothing',
      'accessories',
      'demeanor',
    ]);
  });

  it('中/英标签齐全（每键都有）', () => {
    for (const key of CHARACTER_FIELD_KEYS) {
      expect(CHARACTER_FIELD_LABELS.zh[key]).toBeTruthy();
      expect(CHARACTER_FIELD_LABELS.en[key]).toBeTruthy();
    }
  });
});

describe('emptyProfile', () => {
  it('全字段空串', () => {
    const p = emptyProfile();
    expect(Object.keys(p).sort()).toEqual([...CHARACTER_FIELD_KEYS].sort());
    expect(Object.values(p).every((v) => v === '')).toBe(true);
  });
});

describe('composeAppearance', () => {
  it('只取非空字段，单行，含字段值（zh）', () => {
    const p = { ...emptyProfile(), codename: '林夏', ageRange: '25–34', hair: '黑长直' };
    const out = composeAppearance(p, 'zh');
    expect(out).toContain('代号:林夏');
    expect(out).toContain('年龄段:25–34');
    expect(out).toContain('发型发色:黑长直');
    expect(out).not.toContain('性别'); // 空字段不出现
    expect(out).not.toContain('\n'); // 单行
  });

  it('英文标签（en）', () => {
    const p = { ...emptyProfile(), hair: 'short black' };
    expect(composeAppearance(p, 'en')).toContain('Hair:short black');
  });

  it('全空 → 空串', () => {
    expect(composeAppearance(emptyProfile(), 'zh')).toBe('');
  });

  it('换行被单行化', () => {
    const p = { ...emptyProfile(), clothing: '红色\n卫衣' };
    expect(composeAppearance(p, 'zh')).toContain('服装:红色 卫衣');
  });
});

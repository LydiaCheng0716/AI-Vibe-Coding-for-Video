import { describe, it, expect } from 'vitest';
import {
  shotSizeOptions,
  cameraMovementOptions,
  DURATION_OPTIONS,
  withCurrent,
} from '../../src/core/shotParams';

describe('shotParams 选项', () => {
  it('景别 zh/en 含常用项', () => {
    expect(shotSizeOptions('zh')).toContain('中景');
    expect(shotSizeOptions('zh')).toContain('特写');
    expect(shotSizeOptions('en')).toContain('close-up');
  });
  it('运镜 zh/en 含常用项', () => {
    expect(cameraMovementOptions('zh')).toContain('固定');
    expect(cameraMovementOptions('zh')).toContain('环绕');
    expect(cameraMovementOptions('en')).toContain('handheld');
  });
  it('时长含 5s（语言无关）', () => {
    expect(DURATION_OPTIONS).toContain('5s');
  });
});

describe('withCurrent', () => {
  it('当前值不在预设 → 置顶且不重复', () => {
    const out = withCurrent(['中景', '特写'], '航拍大全景');
    expect(out[0]).toBe('航拍大全景');
    expect(out.filter((x) => x === '航拍大全景')).toHaveLength(1);
  });
  it('当前值已在预设 → 原样', () => {
    expect(withCurrent(['中景', '特写'], '中景')).toEqual(['中景', '特写']);
  });
  it('空当前值 → 原样', () => {
    expect(withCurrent(['中景'], '')).toEqual(['中景']);
  });
});

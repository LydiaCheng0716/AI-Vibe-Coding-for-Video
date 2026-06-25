import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  estimateProjectTokens,
  longStoryWarning,
  PROMPT_OVERHEAD_TOKENS,
} from '../../src/core/tokens';
import { defaultParams } from '../../src/core/defaults';
import type { Project, Shot } from '../../src/core/models';

describe('estimateTokens', () => {
  it('纯中文 ≈ 字数', () => {
    expect(estimateTokens('你好世界')).toBe(4);
  });
  it('纯英文 ≈ 字符/4', () => {
    expect(estimateTokens('abcdefgh')).toBe(2); // 8/4
  });
  it('空 → 0', () => {
    expect(estimateTokens('')).toBe(0);
  });
  it('中英混合相加', () => {
    expect(estimateTokens('你好abcd')).toBe(2 + 1); // 2 CJK + ceil(4/4)
  });
});

function mkShot(): Shot {
  return {
    id: 's1',
    index: 1,
    summary: '日出',
    shotSize: '远景',
    cameraMovement: '推',
    durationSuggestion: '3s',
    prompt: '一段比较长的中文提示词内容用于估算输出',
    characterRefs: [],
    editedByUser: false,
  };
}

describe('estimateProjectTokens', () => {
  it('input 含模板开销；output 随文本增长', () => {
    const project: Project = {
      schemaVersion: 1,
      story: '一个故事',
      params: defaultParams(),
      characters: [],
      shots: [mkShot()],
    };
    const { input, output } = estimateProjectTokens('一个故事', project);
    expect(input).toBe(estimateTokens('一个故事') + PROMPT_OVERHEAD_TOKENS);
    expect(output).toBeGreaterThan(0);
    // 双语 promptEn 增加 output
    const bi = { ...project, shots: [{ ...mkShot(), promptEn: 'a long english prompt for shot' }] };
    expect(estimateProjectTokens('一个故事', bi).output).toBeGreaterThan(output);
  });
});

describe('longStoryWarning', () => {
  it('短故事 → null', () => {
    expect(longStoryWarning('短故事')).toBeNull();
  });
  it('超阈值 → 含截断/分批提示', () => {
    const long = '字'.repeat(2000);
    const w = longStoryWarning(long);
    expect(w).toMatch(/截断|分批/);
  });
});

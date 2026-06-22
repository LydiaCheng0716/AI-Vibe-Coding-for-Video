import { describe, it, expect } from 'vitest';
import { STORY_MIN, STORY_MAX, STORY_SOFT_MIN, SCHEMA_VERSION } from '../../src/core/config';

// 锁定常量值，防止散落/漂移（ADR-2 定稿：10 / 5000 / 30）。
describe('config constants (ADR-2)', () => {
  it('story length bounds', () => {
    expect(STORY_MIN).toBe(10);
    expect(STORY_MAX).toBe(5000);
    expect(STORY_SOFT_MIN).toBe(30);
  });
  it('schema version starts at 1', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});

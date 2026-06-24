import { describe, it, expect } from 'vitest';
import { validateStory, codePointLength, validateProviderConfig } from '../../src/core/validate';
import type { ProviderConfig } from '../../src/core/models';

describe('validateProviderConfig', () => {
  const base: ProviderConfig = { kind: 'openai-compatible', model: 'gpt-4o-mini' };
  it('合法 openai-compatible + model', () => {
    expect(validateProviderConfig(base)).toBe('OK');
  });
  it('合法 https baseUrl', () => {
    expect(validateProviderConfig({ ...base, baseUrl: 'https://api.x.com/v1' })).toBe('OK');
  });
  it('非 https baseUrl → INVALID_PROVIDER_CONFIG', () => {
    expect(validateProviderConfig({ ...base, baseUrl: 'http://x.com' })).toBe('INVALID_PROVIDER_CONFIG');
  });
  it('非法 URL → INVALID_PROVIDER_CONFIG', () => {
    expect(validateProviderConfig({ ...base, baseUrl: 'not a url' })).toBe('INVALID_PROVIDER_CONFIG');
  });
  it('未知 kind → INVALID_PROVIDER_CONFIG', () => {
    expect(validateProviderConfig({ kind: 'x' as never, model: 'm' })).toBe('INVALID_PROVIDER_CONFIG');
  });
  it('空 model → MODEL_REQUIRED', () => {
    expect(validateProviderConfig({ ...base, model: '  ' })).toBe('MODEL_REQUIRED');
  });
  it('anthropic 忽略 baseUrl', () => {
    expect(validateProviderConfig({ kind: 'anthropic', model: 'm', baseUrl: 'http://x' })).toBe('OK');
  });
  it('null → INVALID_PROVIDER_CONFIG', () => {
    expect(validateProviderConfig(null)).toBe('INVALID_PROVIDER_CONFIG');
  });
});

describe('codePointLength', () => {
  it('counts plain ascii', () => {
    expect(codePointLength('hello')).toBe(5);
  });
  it('counts emoji / surrogate pairs as 1 code point', () => {
    expect('👍'.length).toBe(2); // UTF-16 code units
    expect(codePointLength('👍')).toBe(1); // code points
    expect(codePointLength('a👍b')).toBe(3);
  });
});

describe('validateStory (ADR-2: 10–5000 码点, trim 后)', () => {
  it('empty / whitespace-only → EMPTY_STORY', () => {
    expect(validateStory('').code).toBe('EMPTY_STORY');
    expect(validateStory('   \n\t ').code).toBe('EMPTY_STORY');
  });

  it('below hard min (9) → STORY_TOO_SHORT', () => {
    expect(validateStory('a'.repeat(9)).code).toBe('STORY_TOO_SHORT');
  });

  it('exactly hard min (10) → OK', () => {
    const v = validateStory('a'.repeat(10));
    expect(v.code).toBe('OK');
    expect(v.count).toBe(10);
  });

  it('10–30 → OK but soft', () => {
    const v = validateStory('a'.repeat(20));
    expect(v.code).toBe('OK');
    expect(v.soft).toBe(true);
  });

  it('>= 30 → OK, not soft', () => {
    expect(validateStory('a'.repeat(30)).soft).toBe(false);
  });

  it('exactly max (5000) → OK; over (5001) → STORY_TOO_LONG', () => {
    expect(validateStory('a'.repeat(5000)).code).toBe('OK');
    expect(validateStory('a'.repeat(5001)).code).toBe('STORY_TOO_LONG');
  });

  it('counts by code points, not UTF-16 units (emoji story under limit)', () => {
    // 12 emoji = 24 UTF-16 units but 12 code points → still too short
    expect(validateStory('👍'.repeat(12)).code).toBe('OK'); // 12 >= 10
    expect(validateStory('👍'.repeat(9)).code).toBe('STORY_TOO_SHORT');
  });

  it('trims leading/trailing whitespace before counting', () => {
    const v = validateStory('   ' + 'a'.repeat(10) + '   ');
    expect(v.count).toBe(10);
    expect(v.code).toBe('OK');
  });
});

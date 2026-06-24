import { describe, it, expect } from 'vitest';
import { mapHttpStatus, mapFetchError, ProviderCallError } from '../../src/services/llm/provider';

describe('mapHttpStatus（api-spec §5）', () => {
  it('401/403 → AUTH_FAILED 不重试', () => {
    expect(mapHttpStatus(401)).toEqual({ code: 'AUTH_FAILED', retriable: false });
    expect(mapHttpStatus(403)).toEqual({ code: 'AUTH_FAILED', retriable: false });
  });
  it('408 → NETWORK_ERROR 可重试（kimi MED）', () => {
    expect(mapHttpStatus(408)).toEqual({ code: 'NETWORK_ERROR', retriable: true });
  });
  it('429 → RATE_LIMITED 可重试', () => {
    expect(mapHttpStatus(429)).toEqual({ code: 'RATE_LIMITED', retriable: true });
  });
  it('5xx → NETWORK_ERROR 可重试', () => {
    expect(mapHttpStatus(503)).toEqual({ code: 'NETWORK_ERROR', retriable: true });
  });
  it('其余 4xx → BAD_RESPONSE_FORMAT 不重试', () => {
    expect(mapHttpStatus(422)).toEqual({ code: 'BAD_RESPONSE_FORMAT', retriable: false });
  });
});

describe('mapFetchError', () => {
  it('AbortError（超时）→ NETWORK_ERROR 可重试', () => {
    const e = new Error('aborted');
    e.name = 'AbortError';
    expect(mapFetchError(e)).toMatchObject({ code: 'NETWORK_ERROR', retriable: true });
  });
  it('CORS TypeError → CORS_BLOCKED 不重试（ADR-5(5)）', () => {
    const e = mapFetchError(new TypeError('Failed to fetch'));
    expect(e).toMatchObject({ code: 'CORS_BLOCKED', retriable: false });
  });
  it('普通网络异常 → NETWORK_ERROR', () => {
    expect(mapFetchError(new Error('boom'))).toMatchObject({ code: 'NETWORK_ERROR', retriable: true });
  });
  it('已是 ProviderCallError → 原样返回', () => {
    const orig = new ProviderCallError('AUTH_FAILED', 'x', false);
    expect(mapFetchError(orig)).toBe(orig);
  });
});

import { describe, it, expect } from 'vitest';
import { mapHttpStatus, mapFetchError, ProviderCallError } from '../../src/services/llm/provider';

describe('mapHttpStatus（api-spec §5）', () => {
  it('401 → AUTH_FAILED 不重试', () => {
    expect(mapHttpStatus(401)).toEqual({ code: 'AUTH_FAILED', retriable: false });
  });
  it('403 → FORBIDDEN 不重试（Issue #28 从 AUTH_FAILED 拆出）', () => {
    expect(mapHttpStatus(403)).toEqual({ code: 'FORBIDDEN', retriable: false });
  });
  it('404 → MODEL_NOT_FOUND 不重试（Issue #28 从 BAD_RESPONSE_FORMAT 拆出）', () => {
    expect(mapHttpStatus(404)).toEqual({ code: 'MODEL_NOT_FOUND', retriable: false });
  });
  it('402 → QUOTA_EXCEEDED 不重试（额度/欠费）', () => {
    expect(mapHttpStatus(402)).toEqual({ code: 'QUOTA_EXCEEDED', retriable: false });
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
  it('其余 4xx（400/422）→ BAD_RESPONSE_FORMAT 不重试', () => {
    expect(mapHttpStatus(422)).toEqual({ code: 'BAD_RESPONSE_FORMAT', retriable: false });
    expect(mapHttpStatus(400)).toEqual({ code: 'BAD_RESPONSE_FORMAT', retriable: false });
  });
});

describe('mapFetchError', () => {
  it('AbortError（超时）→ NETWORK_ERROR 可重试', () => {
    const e = new Error('aborted');
    e.name = 'AbortError';
    expect(mapFetchError(e)).toMatchObject({ code: 'NETWORK_ERROR', retriable: true });
  });
  it('显式 CORS message → CORS_BLOCKED 不重试（ADR-5(5)）', () => {
    expect(mapFetchError(new TypeError('blocked by CORS policy'))).toMatchObject({
      code: 'CORS_BLOCKED',
      retriable: false,
    });
    expect(mapFetchError(new TypeError('cross-origin request blocked'))).toMatchObject({
      code: 'CORS_BLOCKED',
    });
  });
  it('泛化 Failed to fetch → NETWORK_ERROR 可重试（Codex MED：不吞网络重试）', () => {
    expect(mapFetchError(new TypeError('Failed to fetch'))).toMatchObject({
      code: 'NETWORK_ERROR',
      retriable: true,
    });
  });
  it('普通网络异常 → NETWORK_ERROR', () => {
    expect(mapFetchError(new Error('boom'))).toMatchObject({ code: 'NETWORK_ERROR', retriable: true });
  });
  it('已是 ProviderCallError → 原样返回', () => {
    const orig = new ProviderCallError('AUTH_FAILED', 'x', false);
    expect(mapFetchError(orig)).toBe(orig);
  });
});

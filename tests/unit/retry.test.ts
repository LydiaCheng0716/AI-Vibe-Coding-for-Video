import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../../src/lib/retry';
import { ok, err, type Result } from '../../src/core/models';

const noSleep = async () => {};
const noJitter = () => 0;

describe('withRetry（ADR-3）', () => {
  it('retriable 失败后第 3 次成功 → 返回成功', async () => {
    const seq: Array<Result<number>> = [
      err('NETWORK_ERROR', 'x', true),
      err('NETWORK_ERROR', 'x', true),
      ok(42),
    ];
    let i = 0;
    const attempt = vi.fn(async () => seq[i++]);
    const r = await withRetry(attempt, { sleep: noSleep, jitter: noJitter });
    expect(r.ok).toBe(true);
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('全部 retriable 失败 → 恰好 3 次尝试，返回末次错误', async () => {
    const attempt = vi.fn(async () => err('NETWORK_ERROR', 'x', true));
    const r = await withRetry(attempt, { sleep: noSleep, jitter: noJitter });
    expect(r.ok).toBe(false);
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('非 retriable → 立即返回，不重试', async () => {
    const attempt = vi.fn(async () => err('AUTH_FAILED', 'x', false));
    const r = await withRetry(attempt, { sleep: noSleep });
    expect(r.ok).toBe(false);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('退避序列 base*2^i（无抖动）= 1s, 2s', async () => {
    const delays: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      delays.push(ms);
    });
    const attempt = vi.fn(async () => err('NETWORK_ERROR', 'x', true));
    await withRetry(attempt, { sleep, jitter: noJitter, baseDelayMs: 1000 });
    expect(delays).toEqual([1000, 2000]);
  });

  it('retryAfterMs 覆盖退避', async () => {
    const delays: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      delays.push(ms);
    });
    const attempt = vi.fn(async () => err('RATE_LIMITED', 'x', true, 5000));
    await withRetry(attempt, { sleep, jitter: noJitter });
    expect(delays).toEqual([5000, 5000]);
  });

  it('retryAfterMs 超 maxDelay → 封顶（防恶意 Retry-After）', async () => {
    const delays: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      delays.push(ms);
    });
    const attempt = vi.fn(async () => err('RATE_LIMITED', 'x', true, 99_999_999));
    await withRetry(attempt, { sleep, jitter: noJitter, maxDelayMs: 60_000 });
    expect(delays).toEqual([60_000, 60_000]);
  });

  it('首次即成功 → 不 sleep', async () => {
    const sleep = vi.fn();
    const attempt = vi.fn(async () => ok('done'));
    await withRetry(attempt, { sleep });
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('withRetry onAttempt（Issue #33 进度）', () => {
  it('每次尝试前回调 (attempt, maxAttempts)', async () => {
    const calls: Array<[number, number]> = [];
    const seq = [err('NETWORK_ERROR', 'x', true), err('NETWORK_ERROR', 'x', true), ok(1)] as const;
    let i = 0;
    await withRetry(async () => seq[i++], {
      sleep: noSleep,
      jitter: noJitter,
      onAttempt: (a, m) => calls.push([a, m]),
    });
    expect(calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('不可重试错误 → 只回调一次 (1,3)', async () => {
    const calls: Array<[number, number]> = [];
    await withRetry(async () => err('AUTH_FAILED', 'x', false), {
      sleep: noSleep,
      jitter: noJitter,
      onAttempt: (a, m) => calls.push([a, m]),
    });
    expect(calls).toEqual([[1, 3]]);
  });
});

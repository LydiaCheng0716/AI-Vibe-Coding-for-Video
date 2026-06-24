// 带退避的重试封装（ADR-3 / TASK-009）。仅对 retriable 错误重试，最多 2 次（合计 3 次尝试），
// 指数退避 base*2^i + 随机抖动；若错误带 retryAfterMs（429 Retry-After）则优先采用。
// 纯逻辑：sleep / jitter 可注入便于测试。
import type { Result } from '../core/models';

export interface RetryOptions {
  /** 最大重试次数（不含首次）。默认 2 → 合计 3 次尝试。 */
  maxRetries?: number;
  /** 退避基数（ms）。第 i 次重试基础延迟 = base * 2^i（i 从 0 起）。默认 1000 → 1s, 2s。 */
  baseDelayMs?: number;
  /** 抖动上限（ms）。实际抖动 = jitter() * jitterMaxMs。默认 250。 */
  jitterMaxMs?: number;
  /** 注入点：等待。 */
  sleep?: (ms: number) => Promise<void>;
  /** 注入点：返回 [0,1) 的随机数。 */
  jitter?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 重试执行 attempt（返回 Result）。失败且 retriable 时退避重试；非 retriable 立即返回；
 * 重试耗尽返回最后一次结果。每次都重新调用 attempt（重发整次尝试）。
 */
export async function withRetry<T>(
  attempt: () => Promise<Result<T>>,
  opts: RetryOptions = {},
): Promise<Result<T>> {
  const maxRetries = opts.maxRetries ?? 2;
  const base = opts.baseDelayMs ?? 1000;
  const jitterMax = opts.jitterMaxMs ?? 250;
  const sleep = opts.sleep ?? defaultSleep;
  const jitter = opts.jitter ?? Math.random;

  let last: Result<T> = await attempt();
  for (let i = 0; i < maxRetries; i++) {
    if (last.ok || !last.error.retriable) return last;
    const backoff = base * 2 ** i + Math.floor(jitter() * jitterMax);
    const delay = last.error.retryAfterMs ?? backoff;
    await sleep(delay);
    last = await attempt();
  }
  return last;
}

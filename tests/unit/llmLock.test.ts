import { describe, it, expect, vi } from 'vitest';
import { withLlmLock, isLlmBusy, subscribeLlmBusy } from '../../src/services/llmLock';
import { ok } from '../../src/core/models';

/** 受控 promise，便于让锁停在「占用中」。 */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('withLlmLock（并发=1，ADR-3）', () => {
  it('占用中第二次调用 → GENERATION_IN_PROGRESS', async () => {
    const d = deferred<void>();
    const first = withLlmLock(async () => {
      await d.promise;
      return ok('a');
    });
    expect(isLlmBusy()).toBe(true);
    const second = await withLlmLock(async () => ok('b'));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('GENERATION_IN_PROGRESS');
    d.resolve();
    await first;
    expect(isLlmBusy()).toBe(false);
  });

  it('释放后可再次进入', async () => {
    await withLlmLock(async () => ok(1));
    const r = await withLlmLock(async () => ok(2));
    expect(r.ok).toBe(true);
  });

  it('fn 抛错也在 finally 复位', async () => {
    await expect(
      withLlmLock(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(isLlmBusy()).toBe(false);
  });

  it('subscribeLlmBusy 收到 true/false 通知', async () => {
    const cb = vi.fn();
    const unsub = subscribeLlmBusy(cb);
    await withLlmLock(async () => ok(1));
    expect(cb).toHaveBeenCalledWith(true);
    expect(cb).toHaveBeenCalledWith(false);
    unsub();
  });
});

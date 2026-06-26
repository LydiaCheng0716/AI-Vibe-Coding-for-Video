import { describe, expect, it } from 'vitest';
import { err, ok } from '../../src/core/models';
import { runBatch, skipped } from '../../src/services/batch';

describe('runBatch', () => {
  it('runs items serially and reports ok/skipped/failed with progress', async () => {
    const order: string[] = [];
    const progress: Array<{ done: number; total: number; kind: string }> = [];

    const result = await runBatch(
      [1, 2, 3],
      async (item) => {
        order.push(`start-${item}`);
        await Promise.resolve();
        order.push(`end-${item}`);
        if (item === 2) return skipped('already done');
        if (item === 3) return err('NETWORK_ERROR', 'network failed', true);
        return ok(`ok-${item}`);
      },
      {
        onProgress: (done, total, lastResult) => {
          progress.push({ done, total, kind: lastResult.kind });
        },
      },
    );

    expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2', 'start-3', 'end-3']);
    expect(result.ok).toEqual([{ item: 1, data: 'ok-1' }]);
    expect(result.skipped).toEqual([{ item: 2, reason: 'already done' }]);
    expect(result.failed).toEqual([{ item: 3, error: 'network failed' }]);
    expect(progress).toEqual([
      { done: 1, total: 3, kind: 'ok' },
      { done: 2, total: 3, kind: 'skipped' },
      { done: 3, total: 3, kind: 'failed' },
    ]);
  });

  it('captures thrown errors and continues later items', async () => {
    const result = await runBatch([1, 2, 3], async (item) => {
      if (item === 2) throw new Error('boom');
      return ok(item);
    });

    expect(result.ok.map((r) => r.item)).toEqual([1, 3]);
    expect(result.failed).toEqual([{ item: 2, error: 'boom' }]);
  });

  it('supports retry by letting perItem skip already completed items', async () => {
    const completed = new Set<number>();
    const first = await runBatch([1, 2], async (item) => {
      if (item === 2) return err('NETWORK_ERROR', 'temporary failure', true);
      completed.add(item);
      return ok(item);
    });
    expect(first.ok.map((r) => r.item)).toEqual([1]);
    expect(first.failed.map((r) => r.item)).toEqual([2]);

    const second = await runBatch([1, 2], async (item) => {
      if (completed.has(item)) return skipped('already completed');
      completed.add(item);
      return ok(item);
    });

    expect(second.ok.map((r) => r.item)).toEqual([2]);
    expect(second.skipped.map((r) => r.item)).toEqual([1]);
    expect(second.failed).toEqual([]);
  });
});

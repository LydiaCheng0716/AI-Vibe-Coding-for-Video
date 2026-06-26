import type { Result } from '../core/models';

export interface BatchSkipped {
  skipped: true;
  reason?: string;
}

export interface BatchOk<TItem, TOk> {
  kind: 'ok';
  item: TItem;
  data: TOk;
}

export interface BatchSkippedOutcome<TItem> {
  kind: 'skipped';
  item: TItem;
  reason?: string;
}

export interface BatchFailed<TItem> {
  kind: 'failed';
  item: TItem;
  error: string;
}

export type BatchItemOutcome<TItem, TOk> =
  | BatchOk<TItem, TOk>
  | BatchSkippedOutcome<TItem>
  | BatchFailed<TItem>;

export interface BatchSummary<TItem, TOk> {
  ok: Array<{ item: TItem; data: TOk }>;
  skipped: Array<{ item: TItem; reason?: string }>;
  failed: Array<{ item: TItem; error: string }>;
}

export interface RunBatchOptions<TItem, TOk> {
  onProgress?: (done: number, total: number, lastResult: BatchItemOutcome<TItem, TOk>) => void;
}

export function skipped(reason?: string): BatchSkipped {
  return { skipped: true, ...(reason ? { reason } : {}) };
}

function isSkipped(value: unknown): value is BatchSkipped {
  return !!value && typeof value === 'object' && 'skipped' in value && value.skipped === true;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '未知错误';
}

export async function runBatch<TItem, TOk>(
  items: readonly TItem[],
  perItem: (item: TItem, index: number) => Promise<Result<TOk> | BatchSkipped> | Result<TOk> | BatchSkipped,
  options: RunBatchOptions<TItem, TOk> = {},
): Promise<BatchSummary<TItem, TOk>> {
  const summary: BatchSummary<TItem, TOk> = { ok: [], skipped: [], failed: [] };
  const total = items.length;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    let outcome: BatchItemOutcome<TItem, TOk>;
    try {
      const result = await perItem(item, index);
      if (isSkipped(result)) {
        const record = { item, ...(result.reason ? { reason: result.reason } : {}) };
        summary.skipped.push(record);
        outcome = { kind: 'skipped', ...record };
      } else if (result.ok) {
        const record = { item, data: result.data };
        summary.ok.push(record);
        outcome = { kind: 'ok', ...record };
      } else {
        const record = { item, error: result.error.message };
        summary.failed.push(record);
        outcome = { kind: 'failed', ...record };
      }
    } catch (e) {
      const record = { item, error: errorMessage(e) };
      summary.failed.push(record);
      outcome = { kind: 'failed', ...record };
    }
    options.onProgress?.(index + 1, total, outcome);
  }

  return summary;
}

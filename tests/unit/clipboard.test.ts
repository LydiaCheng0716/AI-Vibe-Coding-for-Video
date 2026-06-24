import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyToClipboard } from '../../src/services/clipboard';

const original = globalThis.navigator;

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true });
});

function setClipboard(writeText: unknown) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: writeText ? { writeText } : undefined },
    configurable: true,
  });
}

describe('copyToClipboard（api-spec §3.6）', () => {
  it('writeText 成功 → ok', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    const r = await copyToClipboard('hello');
    expect(r.ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('writeText 抛错 → CLIPBOARD_FAILED', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    const r = await copyToClipboard('x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('CLIPBOARD_FAILED');
  });

  it('navigator.clipboard 不可用 → CLIPBOARD_FAILED', async () => {
    setClipboard(undefined);
    const r = await copyToClipboard('x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('CLIPBOARD_FAILED');
  });
});

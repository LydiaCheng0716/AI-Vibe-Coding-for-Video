import { describe, it, expect, vi } from 'vitest';
import { saveDraft, getDraft, clearDraft, getSettings, saveSettings } from '../../src/services/storage';
import { defaultSettings } from '../../src/core/defaults';

describe('storage: draft', () => {
  it('save then get returns the text', async () => {
    expect(await getDraft()).toBeNull();
    const r = await saveDraft('我的故事');
    expect(r.ok).toBe(true);
    expect(await getDraft()).toBe('我的故事');
  });

  it('clearDraft removes it', async () => {
    await saveDraft('temp');
    await clearDraft();
    expect(await getDraft()).toBeNull();
  });
});

describe('storage: settings', () => {
  it('returns defaults when nothing saved (model empty per ADR-4)', async () => {
    const s = await getSettings();
    expect(s).toEqual(defaultSettings());
    expect(s.provider.model).toBe('');
  });

  it('save then get round-trips and stamps schemaVersion', async () => {
    const s = defaultSettings();
    s.provider.model = 'gpt-4o-mini';
    s.params.outputLanguage = 'en';
    expect((await saveSettings(s)).ok).toBe(true);
    const got = await getSettings();
    expect(got.provider.model).toBe('gpt-4o-mini');
    expect(got.params.outputLanguage).toBe('en');
    expect(got.schemaVersion).toBe(1);
  });

  it('merges missing fields with defaults (migration-friendly)', async () => {
    await chrome.storage.local.set({ settings: { provider: { kind: 'anthropic', model: 'x' } } });
    const got = await getSettings();
    expect(got.params.videoModel).toBe('generic'); // filled from defaults
    expect(got.provider.kind).toBe('anthropic');
  });
});

describe('storage: write failure → STORAGE_WRITE_FAILED', () => {
  it('maps a thrown set() to a readable error, no throw', async () => {
    const spy = vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));
    const r = await saveDraft('x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('STORAGE_WRITE_FAILED');
    spy.mockRestore();
  });
});

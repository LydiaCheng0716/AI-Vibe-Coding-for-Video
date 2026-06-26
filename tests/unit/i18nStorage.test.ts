import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/core/defaults';
import { getSettings, saveSettings } from '../../src/services/storage';

describe('i18n settings storage', () => {
  it('round-trips uiLanguage and normalizes missing or invalid values to zh', async () => {
    await saveSettings({ ...defaultSettings(), uiLanguage: 'en' });
    expect((await getSettings()).uiLanguage).toBe('en');

    await chrome.storage.local.set({
      settings: { provider: { kind: 'anthropic', model: 'x' }, uiLanguage: 'xx' },
    });
    expect((await getSettings()).uiLanguage).toBe('zh');
  });
});

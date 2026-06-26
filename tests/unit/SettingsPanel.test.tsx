import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import SettingsPanel from '../../src/components/SettingsPanel';
import { defaultSettings } from '../../src/core/defaults';
import { I18nProvider } from '../../src/i18n';
import { getSettings, saveSettings } from '../../src/services/storage';

describe('SettingsPanel UI language', () => {
  it('persists uiLanguage and switches key copy immediately', async () => {
    const user = userEvent.setup();
    await saveSettings(defaultSettings());

    render(
      <I18nProvider initialLanguage="zh">
        <SettingsPanel />
      </I18nProvider>,
    );

    const uiLanguage = (await screen.findByLabelText('界面语言')) as HTMLSelectElement;
    await user.selectOptions(uiLanguage, 'en');

    expect(await screen.findByText('Settings')).toBeTruthy();
    expect(screen.getByLabelText('UI language')).toBeTruthy();

    await waitFor(async () => {
      expect((await getSettings()).uiLanguage).toBe('en');
    });
  });
});

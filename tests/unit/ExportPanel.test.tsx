import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import ExportPanel from '../../src/components/ExportPanel';
import { defaultSettings } from '../../src/core/defaults';
import { getSettings, saveSettings } from '../../src/services/storage';
import { makeProject, makeShot } from './renderWithProjectStore';
import { render } from '@testing-library/react';

function bilingualProject() {
  return makeProject({
    shots: [
      makeShot('s1', 1, { promptEn: 'english prompt 1' }),
      makeShot('s2', 2, { promptEn: 'english prompt 2' }),
    ],
  });
}

describe('ExportPanel preferences', () => {
  it('restores export preferences from settings and persists changes', async () => {
    const user = userEvent.setup();
    await saveSettings({
      ...defaultSettings(),
      exportFormat: 'csv',
      exportPromptLang: 'en',
    });

    render(<ExportPanel project={bilingualProject()} />);
    const [formatSelect, langSelect] = (await screen.findAllByRole('combobox')) as HTMLSelectElement[];

    await waitFor(() => expect(formatSelect.value).toBe('csv'));
    expect(langSelect.value).toBe('en');

    await user.selectOptions(formatSelect, 'platform');
    await user.selectOptions(langSelect, 'zh');

    await waitFor(async () => {
      const settings = await getSettings();
      expect(settings.exportFormat).toBe('platform');
      expect(settings.exportPromptLang).toBe('zh');
    });
  });
});

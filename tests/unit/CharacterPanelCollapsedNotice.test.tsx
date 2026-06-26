import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CharacterPanel from '../../src/components/CharacterPanel';
import { defaultSettings } from '../../src/core/defaults';
import { saveSettings } from '../../src/services/storage';
import { makeProject, renderWithProjectStore } from './renderWithProjectStore';

describe('CharacterPanel collapsed notice', () => {
  it('keeps add-character failures visible while the panel is collapsed', async () => {
    const user = userEvent.setup();
    await saveSettings({
      ...defaultSettings(),
      panelCollapsed: { character: true },
    });

    renderWithProjectStore(makeProject(), (project) => (
      <CharacterPanel
        characters={project.characters}
        story={project.story}
        lang={project.params.outputLanguage}
        busy={false}
      />
    ));

    await screen.findByRole('button', { name: '展开 角色（1，可选，可跳过）' });
    expect(screen.queryByDisplayValue('林夏')).toBeNull();

    const spy = vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));
    try {
      await user.click(screen.getByRole('button', { name: '+ 新增角色' }));

      expect(await screen.findByText('本地保存失败（可能空间不足），请重试。')).toBeTruthy();
      expect(screen.queryByDisplayValue('林夏')).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});

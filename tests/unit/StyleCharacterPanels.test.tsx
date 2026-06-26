import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CharacterPanel from '../../src/components/CharacterPanel';
import StylePanel from '../../src/components/StylePanel';
import { getCurrentProject } from '../../src/services/storage';
import { makeProject, renderWithProjectStore } from './renderWithProjectStore';

describe('StylePanel and CharacterPanel store persistence', () => {
  it('persists style tuning and lock changes through the project store', async () => {
    const user = userEvent.setup();
    renderWithProjectStore(makeProject(), (project) => (
      <StylePanel
        globalStyle={project.globalStyle}
        story={project.story}
        lang={project.params.outputLanguage}
        busy={false}
        persistApiKey
      />
    ));

    const colorInput = (await screen.findByDisplayValue('暖金色调')) as HTMLInputElement;
    await user.clear(colorInput);
    await user.type(colorInput, '冷青色调');
    fireEvent.blur(colorInput);

    await waitFor(async () => {
      const stored = await getCurrentProject();
      expect(stored?.globalStyle?.profile.colorGrade).toBe('冷青色调');
    });

    await user.click(screen.getByRole('button', { name: '锁定' }));

    await waitFor(async () => {
      const stored = await getCurrentProject();
      expect(stored?.globalStyle?.locked).toBe(true);
    });
  });

  it('surfaces style storage failures without advancing persisted state', async () => {
    const user = userEvent.setup();
    renderWithProjectStore(makeProject(), (project) => (
      <StylePanel
        globalStyle={project.globalStyle}
        story={project.story}
        lang={project.params.outputLanguage}
        busy={false}
        persistApiKey
      />
    ));

    await screen.findByDisplayValue('暖金色调');
    const spy = vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));
    await user.click(screen.getByRole('button', { name: '锁定' }));

    await screen.findByText('本地保存失败（可能空间不足），请重试。');
    const stored = await getCurrentProject();
    expect(stored?.globalStyle?.locked).toBeUndefined();
    spy.mockRestore();
  });

  it('persists character tuning and lock changes through the project store', async () => {
    const user = userEvent.setup();
    renderWithProjectStore(makeProject(), (project) => (
      <CharacterPanel
        characters={project.characters}
        story={project.story}
        lang={project.params.outputLanguage}
        busy={false}
      />
    ));

    const codenameInput = (await screen.findByDisplayValue('林夏')) as HTMLInputElement;
    await user.clear(codenameInput);
    await user.type(codenameInput, '夜莺');
    fireEvent.blur(codenameInput);

    await waitFor(async () => {
      const stored = await getCurrentProject();
      expect(stored?.characters[0].profile?.codename).toBe('夜莺');
    });

    await user.click(screen.getByRole('button', { name: '锁定' }));

    await waitFor(async () => {
      const stored = await getCurrentProject();
      expect(stored?.characters[0].locked).toBe(true);
    });
  });

  it('surfaces character storage failures without advancing persisted state', async () => {
    const user = userEvent.setup();
    renderWithProjectStore(makeProject(), (project) => (
      <CharacterPanel
        characters={project.characters}
        story={project.story}
        lang={project.params.outputLanguage}
        busy={false}
      />
    ));

    await screen.findByDisplayValue('林夏');
    const spy = vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));
    await user.click(screen.getByRole('button', { name: '锁定' }));

    await screen.findByText('本地保存失败（可能空间不足），请重试。');
    const stored = await getCurrentProject();
    expect(stored?.characters[0].locked).toBeUndefined();
    spy.mockRestore();
  });
});

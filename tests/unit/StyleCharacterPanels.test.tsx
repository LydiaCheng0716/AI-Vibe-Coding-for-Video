import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CharacterPanel from '../../src/components/CharacterPanel';
import StylePanel from '../../src/components/StylePanel';
import { getCurrentProject } from '../../src/services/storage';
import { makeCharacter, makeProject, renderWithProjectStore } from './renderWithProjectStore';

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

  // Issue #101：每个角色展开框内「删除」按钮（确认 + 可撤销，走 project store）。
  it('deletes a character through the store after confirm, and can undo', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithProjectStore(makeProject(), (project) => (
      <CharacterPanel
        characters={project.characters}
        story={project.story}
        lang={project.params.outputLanguage}
        busy={false}
      />
    ));

    await screen.findByDisplayValue('林夏');
    await user.click(screen.getByRole('button', { name: '删除 角色 林夏' }));

    await waitFor(async () => {
      expect((await getCurrentProject())?.characters).toHaveLength(0);
    });
    // 删除后出现可撤销提示。
    await screen.findByText('已删除角色「林夏」。');

    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(async () => {
      const stored = await getCurrentProject();
      expect(stored?.characters).toHaveLength(1);
      expect(stored?.characters[0]).toMatchObject({ id: 'c1', name: '林夏' });
    });
    confirmSpy.mockRestore();
  });

  it('undo stack restores multiple deletions LIFO (no lost undo target)', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const twoChars = makeProject({
      characters: [
        makeCharacter({ id: 'c1', name: '林夏' }),
        makeCharacter({ id: 'c2', name: '阿明' }),
      ],
    });
    renderWithProjectStore(twoChars, (project) => (
      <CharacterPanel
        characters={project.characters}
        story={project.story}
        lang={project.params.outputLanguage}
        busy={false}
      />
    ));

    await user.click(await screen.findByRole('button', { name: '删除 角色 林夏' }));
    await waitFor(async () => {
      expect((await getCurrentProject())?.characters.map((c) => c.id)).toEqual(['c2']);
    });
    await user.click(screen.getByRole('button', { name: '删除 角色 阿明' }));
    await waitFor(async () => {
      expect((await getCurrentProject())?.characters).toHaveLength(0);
    });

    // 撤销两次（LIFO）：先恢复阿明，再恢复林夏——两个删除目标都没丢。
    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(async () => {
      expect((await getCurrentProject())?.characters.map((c) => c.id)).toEqual(['c2']);
    });
    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(async () => {
      expect((await getCurrentProject())?.characters.map((c) => c.id)).toEqual(['c1', 'c2']);
    });
    confirmSpy.mockRestore();
  });

  it('does not delete when the confirm is cancelled', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithProjectStore(makeProject(), (project) => (
      <CharacterPanel
        characters={project.characters}
        story={project.story}
        lang={project.params.outputLanguage}
        busy={false}
      />
    ));

    await screen.findByDisplayValue('林夏');
    await user.click(screen.getByRole('button', { name: '删除 角色 林夏' }));

    expect((await getCurrentProject())?.characters).toHaveLength(1);
    expect(screen.queryByText('已删除角色「林夏」。')).toBeNull();
    confirmSpy.mockRestore();
  });
});

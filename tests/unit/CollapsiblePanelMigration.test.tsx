import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import CharacterPanel from '../../src/components/CharacterPanel';
import DraftsPanel from '../../src/components/DraftsPanel';
import StylePanel from '../../src/components/StylePanel';
import { getSettings } from '../../src/services/storage';
import { ProjectStoreProvider } from '../../src/sidepanel/projectStore';
import { makeProject, renderWithProjectStore } from './renderWithProjectStore';

describe('Issue #85 panel migrations', () => {
  it('CharacterPanel uses the shared triangle toggle and remembers its collapsed state', async () => {
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
    expect(screen.queryByRole('button', { name: '收起' })).toBeNull();

    const toggle = screen.getByRole('button', { name: '收起 角色（1，可选，可跳过）' });
    expect(toggle.textContent).toBe('角色（1，可选，可跳过） ▾');

    await user.click(toggle);

    expect(screen.getByRole('button', { name: '展开 角色（1，可选，可跳过）' }).textContent).toBe(
      '角色（1，可选，可跳过） ▸',
    );
    expect(screen.queryByDisplayValue('林夏')).toBeNull();
    await waitFor(async () => {
      expect((await getSettings()).panelCollapsed?.character).toBe(true);
    });
  });

  it('StylePanel uses the shared triangle toggle and remembers its collapsed state', async () => {
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

    const toggle = screen.getByRole('button', { name: '收起 全局风格（可选，可跳过）' });
    expect(toggle.textContent).toBe('全局风格（可选，可跳过） ▾');

    await user.click(toggle);

    expect(screen.getByRole('button', { name: '展开 全局风格（可选，可跳过）' }).textContent).toBe(
      '全局风格（可选，可跳过） ▸',
    );
    expect(screen.queryByDisplayValue('暖金色调')).toBeNull();
    await waitFor(async () => {
      expect((await getSettings()).panelCollapsed?.style).toBe(true);
    });
  });

  it('DraftsPanel defaults expanded, uses the shared triangle toggle, and remembers its collapsed state', async () => {
    const user = userEvent.setup();
    render(
      <ProjectStoreProvider>
        <DraftsPanel project={null} />
      </ProjectStoreProvider>,
    );

    await screen.findByText('暂无草稿。生成分镜后点「保存当前为草稿」。');

    const toggle = screen.getByRole('button', { name: '收起 历史草稿（0）' });
    expect(toggle.textContent).toBe('历史草稿（0） ▾');

    await user.click(toggle);

    expect(screen.getByRole('button', { name: '展开 历史草稿（0）' }).textContent).toBe('历史草稿（0） ▸');
    expect(screen.queryByText('暂无草稿。生成分镜后点「保存当前为草稿」。')).toBeNull();
    await waitFor(async () => {
      expect((await getSettings()).panelCollapsed?.drafts).toBe(true);
    });
  });
});

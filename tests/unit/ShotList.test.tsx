import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShotList from '../../src/components/ShotList';
import { getCurrentProject } from '../../src/services/storage';
import { renderWithProjectStore, makeProject } from './renderWithProjectStore';

vi.mock('../../src/services/generation', () => ({
  rewriteShot: vi.fn(),
  generateTransition: vi.fn(),
  generateFirstFrame: vi.fn(),
  translateText: vi.fn(),
}));

describe('ShotList component interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    // 恢复 window.confirm 等 spy，避免泄漏到后续测试文件（Kimi minor）。
    vi.restoreAllMocks();
  });

  it('persists drag reorder by display order and can undo the move', async () => {
    const user = userEvent.setup();
    renderWithProjectStore(makeProject(), (project) => (
      <ShotList project={project} busy={false} persistApiKey />
    ));

    await screen.findByText('分镜（3 个镜头）');
    fireEvent.dragStart(screen.getByText('镜头 3'));
    fireEvent.drop(screen.getByText('镜头 1'));

    await waitFor(async () => {
      const stored = await getCurrentProject();
      expect(stored?.shots.map((s) => `${s.id}:${s.index}`)).toEqual(['s3:1', 's1:2', 's2:3']);
    });

    await user.click(screen.getByRole('button', { name: '撤销（1）' }));

    await waitFor(async () => {
      const stored = await getCurrentProject();
      expect(stored?.shots.map((s) => `${s.id}:${s.index}`)).toEqual(['s1:1', 's2:2', 's3:3']);
    });
  });

  it('inserts a blank shot through the list control and undo restores the previous list', async () => {
    const user = userEvent.setup();
    renderWithProjectStore(makeProject(), (project) => (
      <ShotList project={project} busy={false} persistApiKey />
    ));

    await screen.findByText('分镜（3 个镜头）');
    await user.click(screen.getAllByRole('button', { name: '＋插入' })[0]);

    await waitFor(async () => {
      const stored = await getCurrentProject();
      expect(stored?.shots.map((s) => `${s.id}:${s.index}`)).toEqual(['s4:1', 's1:2', 's2:3', 's3:4']);
    });
    expect(await screen.findByText('分镜（4 个镜头）')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '撤销（1）' }));

    await waitFor(async () => {
      const stored = await getCurrentProject();
      expect(stored?.shots.map((s) => `${s.id}:${s.index}`)).toEqual(['s1:1', 's2:2', 's3:3']);
    });
  });

  it('keeps insert and undo controls after deleting down to zero shots', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithProjectStore(makeProject(), (project) => (
      <ShotList project={project} busy={false} persistApiKey />
    ));

    await screen.findByText('分镜（3 个镜头）');
    await user.click(screen.getAllByRole('button', { name: '删除' })[0]);
    await screen.findByText('分镜（2 个镜头）');
    await user.click(screen.getAllByRole('button', { name: '删除' })[0]);
    await screen.findByText('分镜（1 个镜头）');
    await user.click(screen.getAllByRole('button', { name: '删除' })[0]);

    expect(await screen.findByText('分镜（0 个镜头）')).toBeTruthy();
    expect(screen.getByRole('button', { name: '＋插入' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '撤销（3）' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '撤销（3）' }));

    await waitFor(async () => {
      const stored = await getCurrentProject();
      expect(stored?.shots.map((s) => `${s.id}:${s.index}`)).toEqual(['s3:1']);
    });
    expect(await screen.findByText('分镜（1 个镜头）')).toBeTruthy();
  });
});

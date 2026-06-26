import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShotList from '../../src/components/ShotList';
import { generateFirstFrame, generateTransition } from '../../src/services/generation';
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

    await user.click(screen.getByRole('button', { name: '撤销上一步结构操作，当前 1 步可撤销' }));

    await waitFor(async () => {
      const stored = await getCurrentProject();
      expect(stored?.shots.map((s) => `${s.id}:${s.index}`)).toEqual(['s1:1', 's2:2', 's3:3']);
    });
  });

  it('moves shots with keyboard-accessible buttons and can undo the move', async () => {
    const user = userEvent.setup();
    renderWithProjectStore(makeProject(), (project) => (
      <ShotList project={project} busy={false} persistApiKey />
    ));

    await screen.findByText('分镜（3 个镜头）');
    expect(screen.getByRole('list', { name: '分镜列表' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '下移 镜头 1' }));

    await waitFor(async () => {
      const stored = await getCurrentProject();
      expect(stored?.shots.map((s) => `${s.id}:${s.index}`)).toEqual(['s2:1', 's1:2', 's3:3']);
    });
    expect(screen.getByRole('button', { name: '上移 镜头 2' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '撤销上一步结构操作，当前 1 步可撤销' }));

    await waitFor(async () => {
      const stored = await getCurrentProject();
      expect(stored?.shots.map((s) => `${s.id}:${s.index}`)).toEqual(['s1:1', 's2:2', 's3:3']);
    });
  });

  it('disables keyboard reorder at list boundaries and while the list is busy', async () => {
    renderWithProjectStore(makeProject(), (project) => (
      <ShotList project={project} busy={false} persistApiKey />
    ));

    await screen.findByText('分镜（3 个镜头）');
    expect((screen.getByRole('button', { name: '上移 镜头 1' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '下移 镜头 3' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '下移 镜头 1' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: '上移 镜头 2' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables both keyboard reorder buttons for a single-shot list', async () => {
    renderWithProjectStore(makeProject({ shots: [makeProject().shots[0]] }), (project) => (
      <ShotList project={project} busy={false} persistApiKey />
    ));

    await screen.findByText('分镜（1 个镜头）');
    expect((screen.getByRole('button', { name: '上移 镜头 1' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '下移 镜头 1' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables keyboard reorder controls when busy and does not move shots', async () => {
    const user = userEvent.setup();
    renderWithProjectStore(makeProject(), (project) => (
      <ShotList project={project} busy persistApiKey />
    ));

    await screen.findByText('分镜（3 个镜头）');
    const down = screen.getByRole('button', { name: '下移 镜头 1' });
    expect((down as HTMLButtonElement).disabled).toBe(true);
    await user.click(down);

    const stored = await getCurrentProject();
    expect(stored?.shots.map((s) => `${s.id}:${s.index}`)).toEqual(['s1:1', 's2:2', 's3:3']);
  });

  it('exposes labels for compact shot-list controls and transition fields', async () => {
    renderWithProjectStore(
      makeProject({
        shots: [
          {
            ...makeProject().shots[0],
            transitionToNext: { type: 'cut', note: '中文转场', noteEn: 'English transition' },
          },
          makeProject().shots[1],
        ],
        params: { ...makeProject().params, outputLanguage: 'zh-en' },
      }),
      (project) => <ShotList project={project} busy={false} persistApiKey={false} />,
    );

    await screen.findByText('分镜（2 个镜头）');
    expect(screen.getAllByLabelText('插入镜头描述').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '在当前位置插入镜头' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '批量生成所有缺失的首帧提示词' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '批量生成相邻镜头转场提示词' })).toBeTruthy();
    expect(screen.getByLabelText('一次性 API Key，用于批量生成或插入即时生成')).toBeTruthy();
    expect(screen.getByLabelText('镜头 1 到镜头 2 的转场类型')).toBeTruthy();
    expect(screen.getByLabelText('镜头 1 到镜头 2 的中文转场说明')).toBeTruthy();
    expect(screen.getByLabelText('镜头 1 到镜头 2 的英文转场说明')).toBeTruthy();
    expect(screen.getByRole('button', { name: '复制 镜头 1 到镜头 2 的转场说明' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '清除 镜头 1 到镜头 2 的转场说明' })).toBeTruthy();
  });

  it('inserts a blank shot through the list control and undo restores the previous list', async () => {
    const user = userEvent.setup();
    renderWithProjectStore(makeProject(), (project) => (
      <ShotList project={project} busy={false} persistApiKey />
    ));

    await screen.findByText('分镜（3 个镜头）');
    await user.click(screen.getAllByRole('button', { name: '在当前位置插入镜头' })[0]);

    await waitFor(async () => {
      const stored = await getCurrentProject();
      expect(stored?.shots.map((s) => `${s.id}:${s.index}`)).toEqual(['s4:1', 's1:2', 's2:3', 's3:4']);
    });
    expect(await screen.findByText('分镜（4 个镜头）')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '撤销上一步结构操作，当前 1 步可撤销' }));

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
    await user.click(screen.getAllByRole('button', { name: '删除 镜头 1' })[0]);
    await screen.findByText('分镜（2 个镜头）');
    await user.click(screen.getAllByRole('button', { name: '删除 镜头 1' })[0]);
    await screen.findByText('分镜（1 个镜头）');
    await user.click(screen.getAllByRole('button', { name: '删除 镜头 1' })[0]);

    expect(await screen.findByText('分镜（0 个镜头）')).toBeTruthy();
    expect(screen.getByRole('button', { name: '在当前位置插入镜头' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '撤销上一步结构操作，当前 3 步可撤销' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '撤销上一步结构操作，当前 3 步可撤销' }));

    await waitFor(async () => {
      const stored = await getCurrentProject();
      expect(stored?.shots.map((s) => `${s.id}:${s.index}`)).toEqual(['s3:1']);
    });
    expect(await screen.findByText('分镜（1 个镜头）')).toBeTruthy();
  });

  it('batch-generates missing first frames, skips existing ones, and persists each success', async () => {
    const user = userEvent.setup();
    vi.mocked(generateFirstFrame).mockImplementation(async ({ shot }) => ({
      ok: true,
      data: { firstFramePrompt: `首帧-${shot.id}` },
    }));
    renderWithProjectStore(
      makeProject({
        shots: [
          makeProject().shots[0],
          { ...makeProject().shots[1], firstFramePrompt: '已有首帧' },
          makeProject().shots[2],
        ],
      }),
      (project) => <ShotList project={project} busy={false} persistApiKey />,
    );

    await user.click(await screen.findByRole('button', { name: '批量生成所有缺失的首帧提示词' }));

    await screen.findByText(/首帧批量完成：成功 2、跳过 1、失败 0/);
    expect(generateFirstFrame).toHaveBeenCalledTimes(2);
    await waitFor(async () => {
      const stored = await getCurrentProject();
      expect(stored?.shots.map((s) => s.firstFramePrompt)).toEqual(['首帧-s1', '已有首帧', '首帧-s3']);
    });
  });

  it('batch-generates adjacent transitions, skips existing pairs, and continues after failures', async () => {
    const user = userEvent.setup();
    vi.mocked(generateTransition).mockImplementation(async ({ prevShot }) => {
      if (prevShot.id === 's2') {
        return { ok: false, error: { code: 'NETWORK_ERROR', message: '转场失败', retriable: true } };
      }
      return { ok: true, data: { type: 'cut', note: `转场-${prevShot.id}` } };
    });
    renderWithProjectStore(
      makeProject({
        shots: [
          { ...makeProject().shots[0], transitionToNext: { type: 'cut', note: '已有转场' } },
          makeProject().shots[1],
          makeProject().shots[2],
        ],
      }),
      (project) => <ShotList project={project} busy={false} persistApiKey />,
    );

    await user.click(await screen.findByRole('button', { name: '批量生成相邻镜头转场提示词' }));

    await screen.findByText(/转场批量完成：成功 0、跳过 1、失败 1/);
    await screen.findByText(/镜头 2→3：转场失败/);
    expect(generateTransition).toHaveBeenCalledTimes(1);
    const stored = await getCurrentProject();
    expect(stored?.shots[0].transitionToNext?.note).toBe('已有转场');
    expect(stored?.shots[1].transitionToNext).toBeUndefined();
  });

  it('handles empty first-frame batches', async () => {
    const user = userEvent.setup();
    renderWithProjectStore(makeProject({ shots: [] }), (project) => (
      <ShotList project={project} busy={false} persistApiKey />
    ));

    await user.click(await screen.findByRole('button', { name: '批量生成所有缺失的首帧提示词' }));
    await screen.findByText('首帧批量完成：成功 0、跳过 0、失败 0');
    expect(generateFirstFrame).not.toHaveBeenCalled();
  });

  it('handles one-shot transition batches without adjacent pairs', async () => {
    const user = userEvent.setup();

    renderWithProjectStore(makeProject({ shots: [makeProject().shots[0]] }), (project) => (
      <ShotList project={project} busy={false} persistApiKey />
    ));

    await user.click(await screen.findByRole('button', { name: '批量生成相邻镜头转场提示词' }));
    await screen.findByText('转场批量完成：成功 0、跳过 0、失败 0');
    expect(generateTransition).not.toHaveBeenCalled();
  });

  it('clears the one-time key after a non-persisted batch finishes', async () => {
    const user = userEvent.setup();
    vi.mocked(generateFirstFrame).mockResolvedValue({
      ok: true,
      data: { firstFramePrompt: '首帧' },
    });
    renderWithProjectStore(makeProject({ shots: [makeProject().shots[0]] }), (project) => (
      <ShotList project={project} busy={false} persistApiKey={false} />
    ));

    const keyInput = (await screen.findByPlaceholderText(
      '一次性 API Key（已关闭保存，用于批量/插入即时生成，不落盘）',
    )) as HTMLInputElement;
    await user.type(keyInput, 'sk-test');
    expect(keyInput.value).toBe('sk-test');

    await user.click(screen.getByRole('button', { name: '批量生成所有缺失的首帧提示词' }));

    await screen.findByText(/首帧批量完成：成功 1、跳过 0、失败 0/);
    expect(keyInput.value).toBe('');
    expect(generateFirstFrame).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'sk-test' }));
  });
});

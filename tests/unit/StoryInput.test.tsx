import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StoryInput from '../../src/components/StoryInput';
import { ok, type Project } from '../../src/core/models';
import { makeProject } from './renderWithProjectStore';
import { generateStoryboardForStoreWithUsage } from '../../src/services/generation';

vi.mock('../../src/services/generation', () => ({
  generateStoryboardForStoreWithUsage: vi.fn(),
}));

vi.mock('../../src/services/storage', async () => {
  const { defaultSettings } = await import('../../src/core/defaults');
  return {
    getDraft: vi.fn().mockResolvedValue(''),
    saveDraft: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    getSettings: vi.fn().mockResolvedValue(defaultSettings()),
  };
});

const STORY = '这是一个足够长的故事，用来生成完整分镜并展示 token 用量。';

function setup(project: Project = makeProject()) {
  const onGenerated = vi.fn(async (p: Project) => ok(p));
  render(<StoryInput onGenerated={onGenerated} busy={false} />);
  return { onGenerated, project };
}

describe('StoryInput token usage notice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('生成成功后优先显示真实 provider usage', async () => {
    const user = userEvent.setup();
    const project = makeProject();
    vi.mocked(generateStoryboardForStoreWithUsage).mockResolvedValue(
      ok({ project, usage: { input: 111, output: 22 } }),
    );
    setup(project);

    await user.type(screen.getByLabelText('你的故事'), STORY);
    await user.click(screen.getByRole('button', { name: '生成分镜' }));

    expect(await screen.findByText('生成完成（输入 111 / 输出 22 tokens）')).toBeTruthy();
  });

  it('无真实 usage 时回退估算，并标注估算', async () => {
    const user = userEvent.setup();
    const project = makeProject();
    vi.mocked(generateStoryboardForStoreWithUsage).mockResolvedValue(ok({ project }));
    setup(project);

    await user.type(screen.getByLabelText('你的故事'), STORY);
    await user.click(screen.getByRole('button', { name: '生成分镜' }));

    await waitFor(() => {
      expect(screen.getByText(/生成完成（估算 输入 ~\d+ \/ 输出 ~\d+ tokens，仅供参考）/)).toBeTruthy();
    });
  });

  it('流式进度包含 shotsReady 时显示已生成镜头数', async () => {
    const user = userEvent.setup();
    const project = makeProject();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.mocked(generateStoryboardForStoreWithUsage).mockImplementation(async (_input, _retry, onProgress) => {
      onProgress?.({ phase: 'requesting', message: '正在请求 AI 生成分镜…', shotsReady: 2 });
      await gate;
      return ok({ project });
    });
    setup(project);

    await user.type(screen.getByLabelText('你的故事'), STORY);
    await user.click(screen.getByRole('button', { name: '生成分镜' }));

    expect(await screen.findByText('已生成 2 个镜头…')).toBeTruthy();
    finish();
    await screen.findByText(/生成完成/);
  });
});

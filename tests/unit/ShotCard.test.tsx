import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShotCard from '../../src/components/ShotCard';
import { defaultSettings } from '../../src/core/defaults';
import { translateText } from '../../src/services/generation';
import { getSettings, saveSettings } from '../../src/services/storage';
import { renderWithProjectStore, makeProject, makeShot } from './renderWithProjectStore';

vi.mock('../../src/services/generation', () => ({
  rewriteShot: vi.fn(),
  generateTransition: vi.fn(),
  generateFirstFrame: vi.fn(),
  translateText: vi.fn(),
}));

function bilingualProject() {
  const shot = makeShot('s1', 1, {
    prompt: '旧中文提示',
    promptEn: 'old english prompt',
  });
  return makeProject({
    params: { ...makeProject().params, outputLanguage: 'zh-en' },
    shots: [shot],
  });
}

describe('ShotCard bilingual auto translation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not overwrite the other language when auto translation fails', async () => {
    const user = userEvent.setup();
    vi.mocked(translateText).mockResolvedValueOnce({
      ok: false,
      error: { code: 'NETWORK_ERROR', message: '网络失败', retriable: true },
    });

    renderWithProjectStore(bilingualProject(), (project) => (
      <ShotCard shot={project.shots[0]} project={project} busy={false} persistApiKey onDelete={() => {}} />
    ));

    await user.click(await screen.findByRole('button', { name: '编辑 镜头 1' }));
    await user.click(screen.getByRole('checkbox', { name: /编辑后自动翻译同步另一语言/ }));
    const [zhTextarea, enTextarea] = screen.getAllByRole('textbox') as HTMLTextAreaElement[];

    await user.clear(zhTextarea);
    await user.type(zhTextarea, '新的中文提示');
    fireEvent.blur(zhTextarea);

    await screen.findByText('翻译失败，可重试：网络失败');
    expect(enTextarea.value).toBe('old english prompt');
  });

  it('keeps in-flight user edits when a delayed translation resolves', async () => {
    const user = userEvent.setup();
    let resolveTranslate: (value: { ok: true; data: string }) => void = () => {};
    vi.mocked(translateText).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTranslate = resolve;
        }),
    );

    renderWithProjectStore(bilingualProject(), (project) => (
      <ShotCard shot={project.shots[0]} project={project} busy={false} persistApiKey onDelete={() => {}} />
    ));

    await user.click(await screen.findByRole('button', { name: '编辑 镜头 1' }));
    await user.click(screen.getByRole('checkbox', { name: /编辑后自动翻译同步另一语言/ }));
    const [zhTextarea, enTextarea] = screen.getAllByRole('textbox') as HTMLTextAreaElement[];

    await user.clear(zhTextarea);
    await user.type(zhTextarea, '触发翻译的中文');
    fireEvent.blur(zhTextarea);
    await waitFor(() => expect(translateText).toHaveBeenCalledTimes(1));
    await screen.findByText('翻译中…');

    await user.clear(enTextarea);
    await user.type(enTextarea, 'manual english while pending');
    resolveTranslate({ ok: true, data: 'translated english result' });

    await waitFor(() => expect(screen.queryByText('翻译中…')).toBeNull());
    expect(enTextarea.value).toBe('manual english while pending');
  });

  it('restores and persists the auto translation preference', async () => {
    const user = userEvent.setup();
    await saveSettings({ ...defaultSettings(), autoTranslateSync: true });

    renderWithProjectStore(bilingualProject(), (project) => (
      <ShotCard shot={project.shots[0]} project={project} busy={false} persistApiKey onDelete={() => {}} />
    ));

    await user.click(await screen.findByRole('button', { name: '编辑 镜头 1' }));
    const checkbox = screen.getByRole('checkbox', { name: /编辑后自动翻译同步另一语言/ }) as HTMLInputElement;
    await waitFor(() => expect(checkbox.checked).toBe(true));

    await user.click(checkbox);

    await waitFor(async () => {
      expect((await getSettings()).autoTranslateSync).toBe(false);
    });
  });
});

import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShotCard from '../../src/components/ShotCard';
import { defaultSettings } from '../../src/core/defaults';
import { err, ok } from '../../src/core/models';
import { copyToClipboard } from '../../src/services/clipboard';
import { translateText } from '../../src/services/generation';
import { getSettings, saveSettings } from '../../src/services/storage';
import { renderWithProjectStore, makeProject, makeShot } from './renderWithProjectStore';

vi.mock('../../src/services/generation', () => ({
  rewriteShot: vi.fn(),
  generateTransition: vi.fn(),
  generateFirstFrame: vi.fn(),
  translateText: vi.fn(),
}));

vi.mock('../../src/services/clipboard', () => ({
  copyToClipboard: vi.fn(),
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

function bilingualCopyProject() {
  const shot = makeShot('s1', 1, {
    prompt: '中文框内容',
    promptEn: 'English box content',
    firstFramePrompt: '首帧中文内容',
    firstFramePromptEn: 'First frame English content',
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

describe('ShotCard copy actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(copyToClipboard).mockResolvedValue(ok(undefined));
  });

  it('copies each visible prompt box from its own icon button with local feedback', async () => {
    const user = userEvent.setup();

    renderWithProjectStore(bilingualCopyProject(), (project) => (
      <ShotCard shot={project.shots[0]} project={project} busy={false} persistApiKey onDelete={() => {}} />
    ));

    const zhButton = await screen.findByRole('button', { name: '复制 镜头 1 中文提示词' });
    const enButton = screen.getByRole('button', { name: '复制 镜头 1 英文提示词' });
    const firstFrameZhButton = screen.getByRole('button', { name: '复制 镜头 1 中文首帧提示词' });
    const firstFrameEnButton = screen.getByRole('button', { name: '复制 镜头 1 英文首帧提示词' });

    expect(screen.queryByText('复制中文')).toBeNull();
    expect(screen.queryByText('复制英文')).toBeNull();

    await user.click(zhButton);
    // #105：单语复制带该镜头时长，跟随框语言；与导出 "时长：5s" 口径一致。
    expect(copyToClipboard).toHaveBeenLastCalledWith('时长：3s\n中文框内容');
    await screen.findByText('已复制');
    expect(enButton.textContent).not.toContain('已复制');

    await user.click(enButton);
    expect(copyToClipboard).toHaveBeenLastCalledWith('Duration: 3s\nEnglish box content');

    await user.click(firstFrameZhButton);
    expect(copyToClipboard).toHaveBeenLastCalledWith('首帧中文内容');

    await user.click(firstFrameEnButton);
    expect(copyToClipboard).toHaveBeenLastCalledWith('First frame English content');
  });

  it('copies full bilingual shot text with first-frame sections', async () => {
    const user = userEvent.setup();

    renderWithProjectStore(bilingualCopyProject(), (project) => (
      <ShotCard shot={project.shots[0]} project={project} busy={false} persistApiKey onDelete={() => {}} />
    ));

    await user.click(await screen.findByRole('button', { name: '复制 镜头 1 全文' }));

    expect(copyToClipboard).toHaveBeenLastCalledWith(
      [
        '镜头 1',
        '',
        '[ZH]',
        '时长：3s',
        '中文框内容',
        '',
        '[EN]',
        'Duration: 3s',
        'English box content',
        '',
        '[First Frame ZH]',
        '首帧中文内容',
        '',
        '[First Frame EN]',
        'First frame English content',
      ].join('\n'),
    );
  });

  it('omits English and first-frame sections from single-language full copy when absent', async () => {
    const user = userEvent.setup();
    const project = makeProject({ shots: [makeShot('s1', 1, { prompt: '单语中文内容' })] });

    renderWithProjectStore(project, (loadedProject) => (
      <ShotCard shot={loadedProject.shots[0]} project={loadedProject} busy={false} persistApiKey onDelete={() => {}} />
    ));

    expect(screen.queryByRole('button', { name: '复制 镜头 1 英文提示词' })).toBeNull();

    await user.click(await screen.findByRole('button', { name: '复制 镜头 1 全文' }));

    expect(copyToClipboard).toHaveBeenLastCalledWith(
      ['镜头 1', '', '[ZH]', '时长：3s', '单语中文内容'].join('\n'),
    );
  });

  it('uses the English duration label for a single-language English project (#105)', async () => {
    const user = userEvent.setup();
    const project = makeProject({
      params: { ...makeProject().params, outputLanguage: 'en' },
      shots: [makeShot('s1', 1, { prompt: 'english only prompt' })],
    });

    renderWithProjectStore(project, (loadedProject) => (
      <ShotCard shot={loadedProject.shots[0]} project={loadedProject} busy={false} persistApiKey onDelete={() => {}} />
    ));

    // 单语英文项目：单框复制与全文复制都用 "Duration:"（跟随 outputLanguage）。
    await user.click(await screen.findByRole('button', { name: '复制 镜头 1 提示词' }));
    expect(copyToClipboard).toHaveBeenLastCalledWith('Duration: 3s\nenglish only prompt');

    await user.click(screen.getByRole('button', { name: '复制 镜头 1 全文' }));
    expect(copyToClipboard).toHaveBeenLastCalledWith(
      ['镜头 1', '', '[EN]', 'Duration: 3s', 'english only prompt'].join('\n'),
    );
  });

  it('copies current edit drafts instead of stale saved prompt text', async () => {
    const user = userEvent.setup();

    renderWithProjectStore(bilingualCopyProject(), (project) => (
      <ShotCard shot={project.shots[0]} project={project} busy={false} persistApiKey onDelete={() => {}} />
    ));

    await user.click(await screen.findByRole('button', { name: '编辑 镜头 1' }));
    const [zhTextarea, enTextarea] = screen.getAllByRole('textbox') as HTMLTextAreaElement[];

    await user.clear(zhTextarea);
    await user.type(zhTextarea, '编辑中的中文草稿');
    await user.clear(enTextarea);
    await user.type(enTextarea, 'editing english draft');

    await user.click(screen.getByRole('button', { name: '复制 镜头 1 中文提示词' }));
    expect(copyToClipboard).toHaveBeenLastCalledWith('时长：3s\n编辑中的中文草稿');

    await user.click(screen.getByRole('button', { name: '复制 镜头 1 英文提示词' }));
    expect(copyToClipboard).toHaveBeenLastCalledWith('Duration: 3s\nediting english draft');

    await user.click(screen.getByRole('button', { name: '复制 镜头 1 全文' }));
    const fullCopyArg = vi.mocked(copyToClipboard).mock.calls.at(-1)?.[0];
    expect(fullCopyArg).toContain('编辑中的中文草稿');
    expect(fullCopyArg).toContain('editing english draft');
    expect(fullCopyArg).not.toContain('中文框内容');
  });

  it('shows the clipboard error without copied feedback when copy fails', async () => {
    const user = userEvent.setup();
    vi.mocked(copyToClipboard).mockResolvedValueOnce(err('CLIPBOARD_FAILED', '复制坏了'));

    renderWithProjectStore(bilingualCopyProject(), (project) => (
      <ShotCard shot={project.shots[0]} project={project} busy={false} persistApiKey onDelete={() => {}} />
    ));

    await user.click(await screen.findByRole('button', { name: '复制 镜头 1 中文提示词' }));

    await screen.findByText('复制坏了');
    expect(screen.queryByText('已复制')).toBeNull();
  });
});

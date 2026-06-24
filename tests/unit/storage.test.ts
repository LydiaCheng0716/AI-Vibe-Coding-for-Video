import { describe, it, expect, vi } from 'vitest';
import {
  saveDraft,
  getDraft,
  clearDraft,
  getSettings,
  saveSettings,
  saveCurrentProject,
  getCurrentProject,
  updateShotPrompt,
} from '../../src/services/storage';
import { defaultSettings, defaultParams } from '../../src/core/defaults';
import type { Project, Shot } from '../../src/core/models';

function mkShot(id: string, index: number): Shot {
  return {
    id,
    index,
    summary: `s${index}`,
    shotSize: '中景',
    cameraMovement: '固定',
    durationSuggestion: '3s',
    prompt: `prompt-${id}`,
    characterRefs: [],
    editedByUser: false,
  };
}

function mkProject(): Project {
  return {
    schemaVersion: 1,
    story: '故事',
    params: defaultParams(),
    characters: [],
    shots: [mkShot('s1', 1), mkShot('s2', 2), mkShot('s3', 3)],
  };
}

describe('storage: draft', () => {
  it('save then get returns the text', async () => {
    expect(await getDraft()).toBeNull();
    const r = await saveDraft('我的故事');
    expect(r.ok).toBe(true);
    expect(await getDraft()).toBe('我的故事');
  });

  it('clearDraft removes it', async () => {
    await saveDraft('temp');
    await clearDraft();
    expect(await getDraft()).toBeNull();
  });
});

describe('storage: settings', () => {
  it('returns defaults when nothing saved (model empty per ADR-4)', async () => {
    const s = await getSettings();
    expect(s).toEqual(defaultSettings());
    expect(s.provider.model).toBe('');
  });

  it('save then get round-trips and stamps schemaVersion', async () => {
    const s = defaultSettings();
    s.provider.model = 'gpt-4o-mini';
    s.params.outputLanguage = 'en';
    expect((await saveSettings(s)).ok).toBe(true);
    const got = await getSettings();
    expect(got.provider.model).toBe('gpt-4o-mini');
    expect(got.params.outputLanguage).toBe('en');
    expect(got.schemaVersion).toBe(1);
  });

  it('merges missing fields with defaults (migration-friendly)', async () => {
    await chrome.storage.local.set({ settings: { provider: { kind: 'anthropic', model: 'x' } } });
    const got = await getSettings();
    expect(got.params.videoModel).toBe('generic'); // filled from defaults
    expect(got.provider.kind).toBe('anthropic');
  });
});

describe('storage: write failure → STORAGE_WRITE_FAILED', () => {
  it('maps a thrown set() to a readable error, no throw', async () => {
    const spy = vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));
    const r = await saveDraft('x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('STORAGE_WRITE_FAILED');
    spy.mockRestore();
  });
});

describe('storage: updateShotPrompt (TASK-006)', () => {
  it('只改目标镜头 prompt 并置 editedByUser=true，其他不变', async () => {
    await saveCurrentProject(mkProject());
    const r = await updateShotPrompt('s2', '新提示词');
    expect(r.ok).toBe(true);
    const p = await getCurrentProject();
    expect(p?.shots[1]).toMatchObject({ id: 's2', prompt: '新提示词', editedByUser: true });
    expect(p?.shots[0]).toMatchObject({ prompt: 'prompt-s1', editedByUser: false });
    expect(p?.shots[2]).toMatchObject({ prompt: 'prompt-s3', editedByUser: false });
  });

  it('无当前项目 → ok 且无副作用', async () => {
    const r = await updateShotPrompt('s1', 'x');
    expect(r.ok).toBe(true);
    expect(await getCurrentProject()).toBeNull();
  });

  it('无匹配 shotId → ok 且不误改', async () => {
    await saveCurrentProject(mkProject());
    const r = await updateShotPrompt('nope', 'x');
    expect(r.ok).toBe(true);
    const p = await getCurrentProject();
    expect(p?.shots.every((s) => !s.editedByUser)).toBe(true);
  });

  it('写失败 → STORAGE_WRITE_FAILED', async () => {
    await saveCurrentProject(mkProject());
    const spy = vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));
    const r = await updateShotPrompt('s1', 'x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('STORAGE_WRITE_FAILED');
    spy.mockRestore();
  });
});

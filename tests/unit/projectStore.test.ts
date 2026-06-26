import { describe, expect, it, vi } from 'vitest';
import { defaultParams } from '../../src/core/defaults';
import type { Project, Shot } from '../../src/core/models';
import { getCurrentProject, saveCurrentProject } from '../../src/services/storage';
import { createProjectStore } from '../../src/sidepanel/projectStore';

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

describe('projectStore', () => {
  it('serializes concurrent project mutations and keeps storage/state merged', async () => {
    const store = createProjectStore();
    await store.replaceProject(mkProject());

    const [shotResult, bgmResult] = await Promise.all([
      store.updateShotPrompt('s1', 'A'),
      store.updateBgm({ prompt: '舒缓钢琴', language: 'zh' }),
    ]);

    expect(shotResult.ok).toBe(true);
    expect(bgmResult.ok).toBe(true);
    expect(store.getState().project?.shots[0]).toMatchObject({ id: 's1', prompt: 'A', editedByUser: true });
    expect(store.getState().project?.bgm?.prompt).toBe('舒缓钢琴');
    expect(await getCurrentProject()).toEqual(store.getState().project);
  });

  it('does not advance UI state when a write fails', async () => {
    const initial = mkProject();
    await saveCurrentProject(initial);
    const store = createProjectStore();
    await store.loadCurrentProject();

    const before = store.getState().project;
    const spy = vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));
    const result = await store.updateShotPrompt('s1', 'should-not-advance');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('STORAGE_WRITE_FAILED');
    expect(store.getState().project).toEqual(before);
    expect((await getCurrentProject())?.shots[0].prompt).toBe('prompt-s1');
    spy.mockRestore();
  });

  it('broadcasts the same project that was persisted after every successful mutation', async () => {
    const store = createProjectStore();
    const broadcasts: Project[] = [];
    const unsubscribe = store.subscribe(() => {
      const project = store.getState().project;
      if (project) broadcasts.push(project);
    });

    await store.replaceProject(mkProject());
    expect(store.getState().projectLoadVersion).toBe(1);
    expect(broadcasts.at(-1)).toEqual(await getCurrentProject());

    await store.updateShotPrompt('s2', 'B');
    expect(store.getState().projectLoadVersion).toBe(1);
    expect(broadcasts.at(-1)).toEqual(await getCurrentProject());

    await store.updateBgm({ prompt: '鼓点', language: 'zh' });
    expect(broadcasts.at(-1)).toEqual(await getCurrentProject());
    expect(broadcasts).toHaveLength(3);
    unsubscribe();
  });
});

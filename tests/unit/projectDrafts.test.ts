import { describe, it, expect } from 'vitest';
import {
  saveProjectDraft,
  listProjectDrafts,
  openProjectDraft,
  removeProjectDraft,
} from '../../src/services/projectDrafts';
import { defaultParams } from '../../src/core/defaults';
import { emptyProfile } from '../../src/core/characterProfile';
import type { Project, Shot, Character } from '../../src/core/models';

function mkProject(over: Partial<Project> = {}): Project {
  const shot: Shot = {
    id: 's1',
    index: 1,
    summary: '日出',
    shotSize: '远景',
    cameraMovement: '推',
    durationSuggestion: '3s',
    prompt: '用户改过的提示词',
    promptEn: 'edited English',
    characterRefs: ['c1'],
    editedByUser: true,
  };
  const char: Character = {
    id: 'c1',
    name: '林夏',
    appearance: '黑长直',
    profile: { ...emptyProfile(), hair: '黑长直' },
    locked: true,
  };
  return {
    schemaVersion: 1,
    story: '一个关于日出与林夏的长故事，用来做草稿标题',
    params: defaultParams(),
    characters: [char],
    shots: [shot],
    bgm: { prompt: '温暖钢琴', language: 'zh' },
    ...over,
  };
}

describe('projectDrafts（Issue #35）', () => {
  it('save 存完整 project 且无凭据字段', async () => {
    const r = await saveProjectDraft(mkProject());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.title).toContain('日出'); // 默认标题取 story
      const json = JSON.stringify(r.data);
      expect(json).not.toMatch(/apiKey|baseUrl|cipher/i); // 隐私 ARCH-LOW-002
    }
  });

  it('save 自定义标题', async () => {
    const r = await saveProjectDraft(mkProject(), '我的草稿');
    if (r.ok) expect(r.data.title).toBe('我的草稿');
  });

  it('list + open 恢复全部镜头/角色/编辑内容（含 editedByUser/promptEn/locked/bgm）', async () => {
    const saved = await saveProjectDraft(mkProject());
    if (!saved.ok) throw new Error('seed');
    expect(await listProjectDrafts()).toHaveLength(1);
    const p = await openProjectDraft(saved.data.id);
    expect(p).not.toBeNull();
    expect(p!.shots[0]).toMatchObject({ editedByUser: true, promptEn: 'edited English' });
    expect(p!.characters[0]).toMatchObject({ locked: true });
    expect(p!.characters[0].profile?.hair).toBe('黑长直');
    expect(p!.bgm?.prompt).toBe('温暖钢琴');
  });

  it('open 无匹配 → null；remove 删除', async () => {
    expect(await openProjectDraft('nope')).toBeNull();
    const saved = await saveProjectDraft(mkProject());
    if (!saved.ok) throw new Error('seed');
    await removeProjectDraft(saved.data.id);
    expect(await listProjectDrafts()).toHaveLength(0);
  });
});

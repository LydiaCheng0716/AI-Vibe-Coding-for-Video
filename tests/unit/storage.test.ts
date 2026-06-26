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
  updateCurrentProjectBgm,
  updateCharacter,
  addCharacter,
  replaceShot,
} from '../../src/services/storage';
import { defaultSettings, defaultParams } from '../../src/core/defaults';
import { STORAGE_KEYS } from '../../src/core/config';
import { emptyProfile } from '../../src/core/characterProfile';
import type { Character, Project, Shot } from '../../src/core/models';

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
    expect(got.persistApiKey).toBe(true); // 旧数据缺该字段 → 默认 true
  });

  it('persistApiKey round-trips（不保存 Key 开关，ADR-1 #8）', async () => {
    const s = defaultSettings();
    s.persistApiKey = false;
    await saveSettings(s);
    expect((await getSettings()).persistApiKey).toBe(false);
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
  it('getCurrentProject 读旧 project 时归一补齐字段且不回写', async () => {
    const oldProject = {
      story: '旧格式故事',
      params: { outputLanguage: 'en' },
      characters: [],
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.currentProject]: oldProject });

    const got = await getCurrentProject();

    expect(got).toMatchObject({
      schemaVersion: 1,
      story: '旧格式故事',
      params: { ...defaultParams(), outputLanguage: 'en' },
      characters: [],
      shots: [],
    });
    expect((await chrome.storage.local.get(STORAGE_KEYS.currentProject))[STORAGE_KEYS.currentProject]).toEqual(oldProject);
  });

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

  it('updateCurrentProjectBgm 写回 bgm；无项目 → ok 无副作用', async () => {
    expect((await updateCurrentProjectBgm({ prompt: 'x', language: 'zh' })).ok).toBe(true);
    expect(await getCurrentProject()).toBeNull();
    await saveCurrentProject(mkProject());
    const r = await updateCurrentProjectBgm({ prompt: '舒缓钢琴', language: 'zh' });
    expect(r.ok).toBe(true);
    expect((await getCurrentProject())?.bgm?.prompt).toBe('舒缓钢琴');
  });

  it('并发更新不同镜头不互相覆盖（kimi HIGH：RMW 串行锁）', async () => {
    await saveCurrentProject(mkProject());
    // 同时发起对 s1 与 s3 的更新；串行锁保证两次 RMW 都生效。
    await Promise.all([updateShotPrompt('s1', 'A'), updateShotPrompt('s3', 'C')]);
    const p = await getCurrentProject();
    expect(p?.shots[0]).toMatchObject({ prompt: 'A', editedByUser: true });
    expect(p?.shots[2]).toMatchObject({ prompt: 'C', editedByUser: true });
    expect(p?.shots[1]).toMatchObject({ prompt: 'prompt-s2', editedByUser: false });
  });
});

function mkChar(over: Partial<Character> = {}): Character {
  return { id: 'c1', name: '林夏', appearance: '', profile: { ...emptyProfile(), hair: '黑长直' }, ...over };
}

function mkProjectWithChar(): Project {
  const p = mkProject();
  p.characters = [mkChar(), mkChar({ id: 'c2', name: '阿明', profile: { ...emptyProfile(), hair: '寸头' } })];
  p.shots[0] = { ...p.shots[0], characterRefs: ['c1'] };
  return p;
}

describe('storage: 角色调校（Issue #29）', () => {
  it('updateCharacter 浅合并仅改目标角色，其它不变；返回更新 Project', async () => {
    await saveCurrentProject(mkProjectWithChar());
    const r = await updateCharacter('c1', { locked: true });
    expect(r.ok).toBe(true);
    const p = await getCurrentProject();
    expect(p?.characters[0]).toMatchObject({ id: 'c1', locked: true });
    expect(p?.characters[1]).toMatchObject({ id: 'c2', name: '阿明' }); // 其它角色不变
    expect(p?.characters[1].locked).toBeUndefined();
  });

  it('updateCharacter 改档案 → 重注入刷新镜头锚点（旧值不残留）', async () => {
    // 先注入一遍（保存的项目镜头尚未注入；用 update 触发重注入）
    await saveCurrentProject(mkProjectWithChar());
    await updateCharacter('c1', { profile: { ...emptyProfile(), hair: '黑长直' } });
    let p = await getCurrentProject();
    expect(p?.shots[0].prompt).toContain('发型发色:黑长直');
    // 改成金色短发
    await updateCharacter('c1', { profile: { ...emptyProfile(), hair: '金色短发' } });
    p = await getCurrentProject();
    expect(p?.shots[0].prompt).toContain('发型发色:金色短发');
    expect(p?.shots[0].prompt).not.toContain('黑长直');
  });

  it('updateCharacter 无项目 → ok(null)；无匹配 id → ok(null)', async () => {
    const none = await updateCharacter('c1', { locked: true });
    expect(none).toMatchObject({ ok: true, data: null });
    await saveCurrentProject(mkProjectWithChar());
    const miss = await updateCharacter('c999', { locked: true });
    expect(miss).toMatchObject({ ok: true, data: null });
  });

  it('addCharacter 追加并分配不冲突 id；返回新角色', async () => {
    await saveCurrentProject(mkProjectWithChar()); // 已有 c1,c2
    const r = await addCharacter({ name: '新角色', appearance: '', profile: emptyProfile() });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe('c3');
    const p = await getCurrentProject();
    expect(p?.characters).toHaveLength(3);
    expect(p?.characters[2]).toMatchObject({ id: 'c3', name: '新角色' });
  });

  it('addCharacter 无项目 → 报错', async () => {
    const r = await addCharacter({ name: 'x', appearance: '', profile: emptyProfile() });
    expect(r.ok).toBe(false);
  });
});

describe('storage: replaceShot（Issue #30/#32）', () => {
  it('整条替换目标镜头，保留 id/index，其余不变', async () => {
    await saveCurrentProject(mkProject());
    const rewritten: Shot = {
      ...mkShot('ignored', 99),
      summary: '改写后',
      prompt: '重写的提示词',
    };
    const r = await replaceShot('s2', rewritten);
    expect(r.ok).toBe(true);
    const p = await getCurrentProject();
    expect(p?.shots[1]).toMatchObject({ id: 's2', index: 2, summary: '改写后', prompt: '重写的提示词' });
    expect(p?.shots[0]).toMatchObject({ id: 's1', prompt: 'prompt-s1' }); // 其它不变
  });

  it('无项目 / 无匹配 → ok 无副作用', async () => {
    expect((await replaceShot('s1', mkShot('s1', 1))).ok).toBe(true);
    await saveCurrentProject(mkProject());
    expect((await replaceShot('sX', mkShot('sX', 9))).ok).toBe(true);
    const p = await getCurrentProject();
    expect(p?.shots).toHaveLength(3);
  });
});

describe('storage: updateGlobalStyle（Issue #55）', () => {
  it('合并 profile + 锁定 → 重注入风格锚点到镜头', async () => {
    const { updateGlobalStyle } = await import('../../src/services/storage');
    await saveCurrentProject(mkProject());
    let r = await updateGlobalStyle({ profile: { colorGrade: '暖金', lighting: '', lensFocal: '', filmTexture: '', mood: '治愈' } });
    expect(r.ok).toBe(true);
    r = await updateGlobalStyle({ locked: true });
    expect(r.ok).toBe(true);
    const p = await getCurrentProject();
    expect(p?.globalStyle?.locked).toBe(true);
    expect(p?.shots[0].prompt).toContain('色调/调色:暖金');
  });

  it('无项目 → ok(null)', async () => {
    const { updateGlobalStyle } = await import('../../src/services/storage');
    expect(await updateGlobalStyle({ locked: true })).toMatchObject({ ok: true, data: null });
  });
})

describe('storage: 角色编辑保持全局风格锚点（Codex P2 #55）', () => {
  it('锁定风格后改角色档案，镜头仍含风格锚点', async () => {
    const { updateGlobalStyle, updateCharacter } = await import('../../src/services/storage');
    const p = mkProject();
    p.characters = [mkChar()];
    p.shots[0] = { ...p.shots[0], characterRefs: ['c1'] };
    await saveCurrentProject(p);
    await updateGlobalStyle({ profile: { colorGrade: '暖金', lighting: '', lensFocal: '', filmTexture: '', mood: '' } });
    await updateGlobalStyle({ locked: true });
    // 触发角色重注入
    await updateCharacter('c1', { profile: { ...emptyProfile(), hair: '金色短发' } });
    const after = await getCurrentProject();
    expect(after?.shots[0].prompt).toContain('色调/调色:暖金'); // 风格锚点未被角色重注入抹掉
    expect(after?.shots[0].prompt).toContain('金色短发'); // 角色锚点也在
  });
})

describe('storage: setShots（Issue #56）', () => {
  it('整组替换并保存；无项目 → ok(null)', async () => {
    const { setShots } = await import('../../src/services/storage');
    expect(await setShots([mkShot('s1', 1)])).toMatchObject({ ok: true, data: null });
    await saveCurrentProject(mkProject());
    const newShots = [mkShot('s2', 1), mkShot('s1', 2)]; // 调换顺序
    const r = await setShots(newShots);
    expect(r.ok).toBe(true);
    const p = await getCurrentProject();
    expect(p?.shots.map((s) => s.id)).toEqual(['s2', 's1']);
  });
})

describe('storage: updateShotFirstFrame（Issue #57）', () => {
  it('设置 + 清除首帧提示词', async () => {
    const { updateShotFirstFrame } = await import('../../src/services/storage');
    await saveCurrentProject(mkProject());
    let r = await updateShotFirstFrame('s1', { firstFramePrompt: '首帧图', firstFramePromptEn: 'frame' });
    expect(r.ok).toBe(true);
    let p = await getCurrentProject();
    expect(p?.shots[0].firstFramePrompt).toBe('首帧图');
    expect(p?.shots[0].firstFramePromptEn).toBe('frame');
    r = await updateShotFirstFrame('s1', null);
    p = await getCurrentProject();
    expect(p?.shots[0].firstFramePrompt).toBeUndefined();
  });
})

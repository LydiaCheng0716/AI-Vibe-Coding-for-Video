import { describe, it, expect } from 'vitest';
import {
  saveCharacterToLibrary,
  listCharacterLibrary,
  updateCharacterLibraryItem,
  removeCharacterLibraryItem,
  libraryItemToCharacter,
} from '../../src/services/characterLibrary';
import { emptyProfile } from '../../src/core/characterProfile';
import type { Character } from '../../src/core/models';

const linxia: Character = {
  id: 'c1',
  name: '林夏',
  appearance: '黑长直、红色卫衣',
  profile: { ...emptyProfile(), hair: '黑长直' },
  seedPhrase: 'asian girl, long black hair',
};

describe('characterLibrary', () => {
  it('save 存外观字段且不含凭据', async () => {
    const r = await saveCharacterToLibrary(linxia, 'person');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.category).toBe('person');
      expect(r.data.name).toBe('林夏');
      expect(r.data.profile?.hair).toBe('黑长直');
      // 隐私：库项不得含任何凭据字段
      const json = JSON.stringify(r.data);
      expect(json).not.toMatch(/apiKey|baseUrl|cipher/i);
    }
  });

  it('list 按分类筛选', async () => {
    await saveCharacterToLibrary(linxia, 'person');
    await saveCharacterToLibrary({ name: '旺财', appearance: '金毛犬' }, 'animal');
    expect(await listCharacterLibrary()).toHaveLength(2);
    const animals = await listCharacterLibrary('animal');
    expect(animals).toHaveLength(1);
    expect(animals[0].name).toBe('旺财');
  });

  it('update 改分类；remove 删除', async () => {
    const a = await saveCharacterToLibrary(linxia, 'person');
    if (!a.ok) throw new Error('seed');
    const u = await updateCharacterLibraryItem(a.data.id, { category: 'other' });
    expect(u.ok && u.data?.category).toBe('other');
    await removeCharacterLibraryItem(a.data.id);
    expect(await listCharacterLibrary()).toHaveLength(0);
  });

  it('libraryItemToCharacter 去掉库元数据，可注入新项目', async () => {
    const a = await saveCharacterToLibrary(linxia, 'person');
    if (!a.ok) throw new Error('seed');
    const c = libraryItemToCharacter(a.data);
    expect(c).not.toHaveProperty('id');
    expect(c).not.toHaveProperty('category');
    expect(c).not.toHaveProperty('createdAt');
    expect(c.name).toBe('林夏');
    expect(c.profile?.hair).toBe('黑长直');
  });
});

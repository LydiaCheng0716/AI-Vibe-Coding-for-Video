// 角色库（Issue #40）：把角色存入本地库、按分类浏览/筛选、编辑/删除、复用注入新分镜。
// 建于通用集合抽象之上（与 #35 草稿库共用 services/collections）。**只存外观相关字段，绝不含凭据**
// （ARCH-LOW-002）：无 API Key / baseUrl。
import { createLocalCollection, type CollectionRecord } from './collections';
import { STORAGE_KEYS } from '../core/config';
import type { Character, CharacterProfile, Result } from '../core/models';

export type CharacterCategory = 'person' | 'animal' | 'plant' | 'other';

export const CHARACTER_CATEGORIES: CharacterCategory[] = ['person', 'animal', 'plant', 'other'];
export const CHARACTER_CATEGORY_LABELS: Record<CharacterCategory, string> = {
  person: '人物',
  animal: '动物',
  plant: '植物',
  other: '其它',
};

export interface CharacterLibraryItem extends CollectionRecord {
  category: CharacterCategory;
  name: string | null;
  appearance: string;
  profile?: CharacterProfile;
  seedPhrase?: string;
}

// 读时归一（Issue #73）：兜底 category/name/appearance，丢弃非对象脏项。
function normalizeLibraryItem(raw: unknown): CharacterLibraryItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<CharacterLibraryItem>;
  const category = CHARACTER_CATEGORIES.includes(r.category as CharacterCategory)
    ? (r.category as CharacterCategory)
    : 'other';
  return {
    ...(raw as CharacterLibraryItem),
    category,
    name: typeof r.name === 'string' ? r.name : null,
    appearance: typeof r.appearance === 'string' ? r.appearance : '',
  };
}

const collection = createLocalCollection<CharacterLibraryItem>(STORAGE_KEYS.characterLibrary, {
  normalize: normalizeLibraryItem,
});

export async function listCharacterLibrary(
  category?: CharacterCategory,
): Promise<CharacterLibraryItem[]> {
  const items = await collection.list();
  return category ? items.filter((i) => i.category === category) : items;
}

/** 存入角色库：只取外观相关字段（无凭据）。 */
export function saveCharacterToLibrary(
  character: Pick<Character, 'name' | 'appearance' | 'profile' | 'seedPhrase'>,
  category: CharacterCategory,
): Promise<Result<CharacterLibraryItem>> {
  return collection.add({
    category,
    name: character.name,
    appearance: character.appearance,
    ...(character.profile ? { profile: character.profile } : {}),
    ...(character.seedPhrase ? { seedPhrase: character.seedPhrase } : {}),
  });
}

export function updateCharacterLibraryItem(
  id: string,
  patch: Partial<Omit<CharacterLibraryItem, keyof CollectionRecord>>,
): Promise<Result<CharacterLibraryItem | null>> {
  return collection.update(id, patch);
}

export function removeCharacterLibraryItem(id: string): Promise<Result<void>> {
  return collection.remove(id);
}

/** 库项 → 可注入新项目的角色草稿（去掉库 id/时间戳/category；项目内 id 由 storage.addCharacter 赋）。 */
export function libraryItemToCharacter(item: CharacterLibraryItem): Omit<Character, 'id'> {
  return {
    name: item.name,
    appearance: item.appearance,
    ...(item.profile ? { profile: item.profile } : {}),
    ...(item.seedPhrase ? { seedPhrase: item.seedPhrase } : {}),
  };
}

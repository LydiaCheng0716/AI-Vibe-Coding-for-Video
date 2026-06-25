import { useEffect, useState } from 'react';
import type { Character } from '../core/models';
import {
  listCharacterLibrary,
  updateCharacterLibraryItem,
  removeCharacterLibraryItem,
  libraryItemToCharacter,
  CHARACTER_CATEGORIES,
  CHARACTER_CATEGORY_LABELS,
  type CharacterCategory,
  type CharacterLibraryItem,
} from '../services/characterLibrary';

interface Props {
  /** 外部（存入库）触发的刷新信号。 */
  refreshKey: number;
  /** 「用此角色」→ 注入当前项目（父级走 addCharacter）。 */
  onUse: (character: Omit<Character, 'id'>) => void;
}

function displayName(item: CharacterLibraryItem): string {
  return item.name || '未命名角色';
}

export default function CharacterLibrary({ refreshKey, onUse }: Props) {
  const [items, setItems] = useState<CharacterLibraryItem[]>([]);
  const [filter, setFilter] = useState<CharacterCategory | 'all'>('all');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    listCharacterLibrary()
      .then((list) => {
        if (on) setItems(list);
      })
      .catch(() => {
        if (on) setNotice('读取角色库失败。');
      });
    return () => {
      on = false;
    };
  }, [refreshKey]);

  async function reload() {
    setItems(await listCharacterLibrary());
  }

  async function onChangeCategory(id: string, category: CharacterCategory) {
    const r = await updateCharacterLibraryItem(id, { category });
    if (r.ok) await reload();
    else setNotice(r.error.message);
  }

  async function onDelete(id: string) {
    const r = await removeCharacterLibraryItem(id);
    if (r.ok) await reload();
    else setNotice(r.error.message);
  }

  const shown = filter === 'all' ? items : items.filter((i) => i.category === filter);

  return (
    <div className="flex flex-col gap-2 rounded border border-gray-200 p-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs font-medium text-gray-700">角色库</span>
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-full px-2 py-0.5 text-[11px] ${filter === 'all' ? 'bg-blue-600 text-white' : 'border border-gray-300'}`}
        >
          全部
        </button>
        {CHARACTER_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setFilter(cat)}
            className={`rounded-full px-2 py-0.5 text-[11px] ${filter === cat ? 'bg-blue-600 text-white' : 'border border-gray-300'}`}
          >
            {CHARACTER_CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-[11px] text-gray-400">暂无角色，可在上方角色卡「存入角色库」。</p>
      ) : (
        shown.map((item) => (
          <div key={item.id} className="flex items-center gap-2 rounded border border-gray-100 p-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{displayName(item)}</p>
              <p className="truncate text-[11px] text-gray-500">{item.appearance || '（无外观描述）'}</p>
            </div>
            <select
              className="rounded border border-gray-300 p-0.5 text-[11px]"
              value={item.category}
              onChange={(e) => onChangeCategory(item.id, e.target.value as CharacterCategory)}
            >
              {CHARACTER_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CHARACTER_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onUse(libraryItemToCharacter(item))}
              className="shrink-0 rounded bg-blue-600 px-2 py-0.5 text-[11px] text-white hover:bg-blue-700"
            >
              用此角色
            </button>
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              className="shrink-0 rounded border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-gray-50"
            >
              删除
            </button>
          </div>
        ))
      )}
      {notice && <p className="text-[11px] text-red-600">{notice}</p>}
    </div>
  );
}

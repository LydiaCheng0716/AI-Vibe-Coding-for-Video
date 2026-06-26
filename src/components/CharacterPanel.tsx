import { useEffect, useState } from 'react';
import type { Character, CharacterFieldKey, CharacterProfile, OutputLanguage } from '../core/models';
import { CHARACTER_FIELD_KEYS, CHARACTER_FIELD_LABELS, emptyProfile } from '../core/characterProfile';
import { getSettings } from '../services/storage';
import { suggestCharacterField } from '../services/characterSuggest';
import { copyToClipboard } from '../services/clipboard';
import CharacterLibrary from './CharacterLibrary';
import { useProjectStore } from '../sidepanel/projectStore';
import {
  saveCharacterToLibrary,
  CHARACTER_CATEGORIES,
  CHARACTER_CATEGORY_LABELS,
  type CharacterCategory,
} from '../services/characterLibrary';

interface Props {
  characters: Character[];
  story: string;
  lang: OutputLanguage;
  /** 全局 LLM 锁占用中：禁用「重新建议」。 */
  busy: boolean;
}

function displayName(c: Character): string {
  if (c.name) return c.name;
  return `角色${c.id.replace(/^c/, '')}`;
}

export default function CharacterPanel({
  characters,
  story,
  lang,
  busy,
}: Props) {
  const { addCharacter } = useProjectStore();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 不保存 Key 模式（ADR-1 #8）：persist=false 时「重新建议」需一次性 Key（不落盘），与生成区一致。
  const [persistKey, setPersistKey] = useState(true);
  const [tempKey, setTempKey] = useState('');
  // Issue #40：角色固定可选/可跳过——可收起整个角色区直达分镜。
  const [collapsed, setCollapsed] = useState(false);
  // 角色库刷新信号：卡片「存入角色库」后 +1，触发库列表重载。
  const [libRefresh, setLibRefresh] = useState(0);

  useEffect(() => {
    let on = true;
    getSettings()
      .then((s) => {
        if (on) setPersistKey(s.persistApiKey);
      })
      .catch(() => {
        /* 读取失败按默认保存模式 */
      });
    return () => {
      on = false;
    };
  }, []);

  async function onAdd() {
    setAdding(true);
    setNotice(null);
    const r = await addCharacter({ name: null, appearance: '', profile: emptyProfile() });
    setAdding(false);
    if (!r.ok) setNotice(r.error.message);
  }

  // 角色库「用此角色」→ 注入当前项目。
  async function onUseFromLibrary(character: Omit<Character, 'id'>) {
    setNotice(null);
    const r = await addCharacter(character);
    if (!r.ok) setNotice(r.error.message);
  }

  return (
    <section className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">角色（{characters.length}，可选，可跳过）</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
          >
            {collapsed ? '展开' : '收起'}
          </button>
          {!collapsed && (
            <button
              type="button"
              onClick={onAdd}
              disabled={adding}
              className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
            >
              {adding ? '新增中…' : '+ 新增角色'}
            </button>
          )}
        </div>
      </div>
      {notice && <p className="text-xs text-red-600">{notice}</p>}
      {collapsed ? (
        <p className="text-[11px] text-gray-400">角色固定是可选的，已收起；展开可调校角色或从角色库复用。</p>
      ) : (
        <>
          {!persistKey && (
            <input
              type="password"
              autoComplete="off"
              className="w-full rounded border border-amber-300 p-1 text-xs outline-none focus:border-amber-500"
              placeholder="一次性 API Key（已关闭保存，仅用于「重新建议」，不落盘）"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
            />
          )}
          {characters.map((c) => (
            <CharacterCard
              key={c.id}
              character={c}
              story={story}
              lang={lang}
              busy={busy}
              apiKey={persistKey ? undefined : tempKey.trim() || undefined}
              onSavedToLibrary={() => setLibRefresh((n) => n + 1)}
            />
          ))}
          <CharacterLibrary refreshKey={libRefresh} onUse={onUseFromLibrary} />
        </>
      )}
    </section>
  );
}

interface CardProps {
  character: Character;
  story: string;
  lang: OutputLanguage;
  busy: boolean;
  /** 不保存 Key 模式的一次性 Key（透传给「重新建议」服务，不落盘）。 */
  apiKey?: string;
  /** 存入角色库后通知面板刷新库列表。 */
  onSavedToLibrary: () => void;
}

function CharacterCard({
  character,
  story,
  lang,
  busy,
  apiKey,
  onSavedToLibrary,
}: CardProps) {
  const { updateCharacter } = useProjectStore();
  const labels = CHARACTER_FIELD_LABELS[lang] ?? CHARACTER_FIELD_LABELS.zh;
  const locked = !!character.locked;
  // 档案草稿（本地编辑态）：从 props 播种一次（卡片以 id 为 key，角色切换即重挂载）。
  const [profile, setProfile] = useState<CharacterProfile>(character.profile ?? emptyProfile());
  const [resuggesting, setResuggesting] = useState<CharacterFieldKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Issue #40：存入角色库的分类。
  const [category, setCategory] = useState<CharacterCategory>('person');

  async function onSaveToLibrary() {
    const r = await saveCharacterToLibrary(
      { name: character.name, appearance: character.appearance, profile, seedPhrase: character.seedPhrase },
      category,
    );
    if (r.ok) {
      setNotice('已存入角色库');
      onSavedToLibrary();
    } else {
      setNotice(r.error.message);
    }
  }

  async function persist(patch: Partial<Character>) {
    const r = await updateCharacter(character.id, patch);
    if (!r.ok) {
      setNotice(r.error.message);
    }
  }

  function setField(key: CharacterFieldKey, value: string) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  // 失焦时持久化整份档案（避免每次按键写盘）。不动 appearance：注入在 profile 非空时优先用
  // profile 合成锚点，profile 全空时回退 appearance——保留 appearance 可防清空档案后丢失锚点。
  function commitProfile() {
    if (locked) return;
    void persist({ profile });
  }

  function pickSuggestion(key: CharacterFieldKey, value: string) {
    if (locked) return;
    const next = { ...profile, [key]: value };
    setProfile(next);
    void persist({ profile: next });
  }

  async function onResuggest(key: CharacterFieldKey) {
    if (busy || locked) return;
    setResuggesting(key);
    setNotice(null);
    const r = await suggestCharacterField({ character: { ...character, profile }, field: key, story, apiKey });
    setResuggesting(null);
    if (r.ok) {
      // 仅更新该字段候选，不动其它字段/角色。
      const suggestions = { ...(character.suggestions ?? {}), [key]: r.data };
      await persist({ suggestions });
    } else {
      setNotice(r.error.message);
    }
  }

  async function onCopySeed() {
    if (!character.seedPhrase) return;
    const r = await copyToClipboard(character.seedPhrase);
    setNotice(r.ok ? '种子短语已复制' : r.error.message);
  }

  return (
    <div className="rounded border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">
          {displayName(character)}
          {locked && <span className="ml-1 text-green-700">（已锁定）</span>}
        </span>
        <button
          type="button"
          onClick={() => persist({ locked: !locked })}
          className={`rounded px-2 py-0.5 text-xs ${
            locked
              ? 'border border-green-300 bg-green-50 text-green-800 hover:bg-green-100'
              : 'border border-gray-300 hover:bg-gray-50'
          }`}
        >
          {locked ? '解锁' : '锁定'}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {CHARACTER_FIELD_KEYS.map((key) => {
          const candidates = character.suggestions?.[key] ?? [];
          return (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-gray-500">{labels[key]}</label>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => onResuggest(key)}
                    disabled={busy || resuggesting !== null}
                    className="text-[11px] text-blue-600 hover:underline disabled:opacity-50"
                  >
                    {resuggesting === key ? '生成中…' : '重新建议'}
                  </button>
                )}
              </div>
              <input
                className="w-full rounded border border-gray-300 p-1 text-xs read-only:bg-gray-50"
                value={profile[key]}
                readOnly={locked}
                onChange={(e) => setField(key, e.target.value)}
                onBlur={commitProfile}
              />
              {!locked && candidates.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {candidates.map((s, i) => (
                    <button
                      key={`${s}-${i}`}
                      type="button"
                      onClick={() => pickSuggestion(key, s)}
                      className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700 hover:bg-blue-100"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {character.seedPhrase && (
        <div className="mt-2 flex items-center gap-2">
          <p className="flex-1 text-[11px] text-gray-500">种子：{character.seedPhrase}</p>
          <button type="button" onClick={onCopySeed} className="text-[11px] text-blue-600 hover:underline">
            复制
          </button>
        </div>
      )}
      {/* Issue #40：存入角色库（带分类）以便跨分镜复用 */}
      <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2">
        <span className="text-[11px] text-gray-500">分类</span>
        <select
          className="rounded border border-gray-300 p-0.5 text-[11px]"
          value={category}
          onChange={(e) => setCategory(e.target.value as CharacterCategory)}
        >
          {CHARACTER_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {CHARACTER_CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onSaveToLibrary}
          className="rounded border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-gray-50"
        >
          存入角色库
        </button>
      </div>
      {notice && <p className="mt-1 text-[11px] text-gray-600">{notice}</p>}
    </div>
  );
}

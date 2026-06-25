import { useEffect, useState } from 'react';
import type { Character, CharacterFieldKey, CharacterProfile, OutputLanguage, Project } from '../core/models';
import { CHARACTER_FIELD_KEYS, CHARACTER_FIELD_LABELS, emptyProfile } from '../core/characterProfile';
import { updateCharacter, addCharacter, getSettings } from '../services/storage';
import { suggestCharacterField } from '../services/characterSuggest';
import { copyToClipboard } from '../services/clipboard';

interface Props {
  characters: Character[];
  story: string;
  lang: OutputLanguage;
  /** 全局 LLM 锁占用中：禁用「重新建议」。 */
  busy: boolean;
  /** 角色调校/锁定后返回更新的 Project（含重注入的镜头），由 App 同步。 */
  onProjectUpdated: (project: Project) => void;
  /** 新增角色后由 App 追加到内存态。 */
  onCharacterAdded: (character: Character) => void;
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
  onProjectUpdated,
  onCharacterAdded,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 不保存 Key 模式（ADR-1 #8）：persist=false 时「重新建议」需一次性 Key（不落盘），与生成区一致。
  const [persistKey, setPersistKey] = useState(true);
  const [tempKey, setTempKey] = useState('');

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
    if (r.ok) onCharacterAdded(r.data);
    else setNotice(r.error.message);
  }

  return (
    <section className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">角色（{characters.length}）</h2>
        <button
          type="button"
          onClick={onAdd}
          disabled={adding}
          className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          {adding ? '新增中…' : '+ 新增角色'}
        </button>
      </div>
      {notice && <p className="text-xs text-red-600">{notice}</p>}
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
          onProjectUpdated={onProjectUpdated}
        />
      ))}
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
  onProjectUpdated: (project: Project) => void;
}

function CharacterCard({ character, story, lang, busy, apiKey, onProjectUpdated }: CardProps) {
  const labels = CHARACTER_FIELD_LABELS[lang] ?? CHARACTER_FIELD_LABELS.zh;
  const locked = !!character.locked;
  // 档案草稿（本地编辑态）：从 props 播种一次（卡片以 id 为 key，角色切换即重挂载）。
  const [profile, setProfile] = useState<CharacterProfile>(character.profile ?? emptyProfile());
  const [resuggesting, setResuggesting] = useState<CharacterFieldKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function persist(patch: Partial<Character>) {
    const r = await updateCharacter(character.id, patch);
    if (r.ok) {
      if (r.data) onProjectUpdated(r.data);
    } else {
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
      {notice && <p className="mt-1 text-[11px] text-gray-600">{notice}</p>}
    </div>
  );
}

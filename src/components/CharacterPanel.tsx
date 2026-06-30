import { useState } from 'react';
import type { Character, CharacterFieldKey, CharacterProfile, OutputLanguage } from '../core/models';
import { CHARACTER_FIELD_KEYS, CHARACTER_FIELD_LABELS, emptyProfile } from '../core/characterProfile';
import { suggestCharacterField } from '../services/characterSuggest';
import { copyToClipboard } from '../services/clipboard';
import CharacterLibrary from './CharacterLibrary';
import { useProjectStore } from '../sidepanel/projectStore';
import { OneTimeKeyInput, useOneTimeKey } from './OneTimeKeyInput';
import CollapsiblePanel from './CollapsiblePanel';
import {
  saveCharacterToLibrary,
  CHARACTER_CATEGORIES,
  type CharacterCategory,
} from '../services/characterLibrary';
import { useI18n, type BoundT } from '../i18n';

interface Props {
  characters: Character[];
  story: string;
  lang: OutputLanguage;
  /** 全局 LLM 锁占用中：禁用「重新建议」。 */
  busy: boolean;
}

function displayName(c: Character, t: BoundT): string {
  if (c.name) return c.name;
  return t('character.fallbackName', { id: c.id.replace(/^c/, '') });
}

export default function CharacterPanel({
  characters,
  story,
  busy,
}: Props) {
  const { t } = useI18n();
  const { addCharacter, removeCharacter, restoreCharacter } = useProjectStore();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 删除撤销（Issue #101）：保留最近一次删除的角色 + 原位置，供「撤销」按原 id/位置插回。
  const [undoDelete, setUndoDelete] = useState<{ character: Character; index: number } | null>(null);
  const oneTimeKey = useOneTimeKey();
  // 角色库刷新信号：卡片「存入角色库」后 +1，触发库列表重载。
  const [libRefresh, setLibRefresh] = useState(0);

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

  // 删除角色（Issue #101）：确认 → 走 project store 移除（重注入刷新镜头锚点）→ 暂存以便撤销。
  async function onDeleteCharacter(character: Character, index: number) {
    if (!window.confirm(t('character.confirmDelete', { name: displayName(character, t) }))) return;
    setNotice(null);
    const r = await removeCharacter(character.id);
    if (!r.ok) {
      setNotice(r.error.message);
      return;
    }
    setUndoDelete({ character, index });
  }

  async function onUndoDelete() {
    if (!undoDelete) return;
    const r = await restoreCharacter(undoDelete.character, undoDelete.index);
    if (!r.ok) {
      setNotice(r.error.message);
      return;
    }
    setUndoDelete(null);
  }

  return (
    <CollapsiblePanel
      title={t('character.title', { n: characters.length })}
      persistKey="character"
      className="flex flex-col gap-3 p-3"
      contentClassName="flex flex-col gap-3"
      headerRight={
        <button
          type="button"
          onClick={onAdd}
          disabled={adding}
          className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          {adding ? t('character.adding') : t('character.add')}
        </button>
      }
      belowHeader={
        (undoDelete || notice) && (
          <div className="flex flex-col gap-1">
            {undoDelete && (
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span>{t('character.deletedNotice', { name: displayName(undoDelete.character, t) })}</span>
                <button
                  type="button"
                  onClick={() => void onUndoDelete()}
                  className="text-blue-600 hover:underline"
                >
                  {t('common.undo')}
                </button>
              </div>
            )}
            {notice && <p className="text-xs text-red-600">{notice}</p>}
          </div>
        )
      }
    >
      <OneTimeKeyInput
        oneTimeKey={oneTimeKey}
        className="w-full rounded border border-amber-300 p-1 text-xs outline-none focus:border-amber-500"
        placeholder={t('character.resuggestKeyPlaceholder')}
      />
      {characters.map((c, i) => (
        <CharacterCard
          key={c.id}
          character={c}
          story={story}
          busy={busy}
          oneTimeKey={oneTimeKey}
          onSavedToLibrary={() => setLibRefresh((n) => n + 1)}
          onDelete={() => void onDeleteCharacter(c, i)}
        />
      ))}
      <CharacterLibrary refreshKey={libRefresh} onUse={onUseFromLibrary} />
    </CollapsiblePanel>
  );
}

interface CardProps {
  character: Character;
  story: string;
  busy: boolean;
  /** 不保存 Key 模式的一次性 Key（透传给「重新建议」服务，不落盘）。 */
  oneTimeKey: ReturnType<typeof useOneTimeKey>;
  /** 存入角色库后通知面板刷新库列表。 */
  onSavedToLibrary: () => void;
  /** 删除本角色（Issue #101；确认/撤销由父级 CharacterPanel 处理）。 */
  onDelete: () => void;
}

function CharacterCard({
  character,
  story,
  busy,
  oneTimeKey,
  onSavedToLibrary,
  onDelete,
}: CardProps) {
  const { t, uiLanguage } = useI18n();
  const { updateCharacter } = useProjectStore();
  const labels = CHARACTER_FIELD_LABELS[uiLanguage] ?? CHARACTER_FIELD_LABELS.zh;
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
      setNotice(t('character.savedToLibrary'));
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
    try {
      const r = await suggestCharacterField({
        character: { ...character, profile },
        field: key,
        story,
        apiKey: oneTimeKey.apiKey,
      });
      if (r.ok) {
        // 仅更新该字段候选，不动其它字段/角色。
        const suggestions = { ...(character.suggestions ?? {}), [key]: r.data };
        await persist({ suggestions });
      } else {
        setNotice(r.error.message);
      }
    } finally {
      if (!oneTimeKey.persistApiKey) oneTimeKey.clear();
      setResuggesting(null);
    }
  }

  async function onCopySeed() {
    if (!character.seedPhrase) return;
    const r = await copyToClipboard(character.seedPhrase);
    setNotice(r.ok ? t('character.seedCopied') : r.error.message);
  }

  return (
    <div className="rounded border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">
          {displayName(character, t)}
          {locked && <span className="ml-1 text-green-700">{t('character.locked')}</span>}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => persist({ locked: !locked })}
            className={`rounded px-2 py-0.5 text-xs ${
              locked
                ? 'border border-green-300 bg-green-50 text-green-800 hover:bg-green-100'
                : 'border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {locked ? t('common.unlock') : t('common.lock')}
          </button>
          <button
            type="button"
            aria-label={t('character.deleteAria', { name: displayName(character, t) })}
            onClick={onDelete}
            className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
          >
            {t('common.delete')}
          </button>
        </div>
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
                    {resuggesting === key ? t('character.resuggesting') : t('character.resuggest')}
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
          <p className="flex-1 text-[11px] text-gray-500">{t('character.seed', { seed: character.seedPhrase })}</p>
          <button type="button" onClick={onCopySeed} className="text-[11px] text-blue-600 hover:underline">
            {t('common.copy')}
          </button>
        </div>
      )}
      {/* Issue #40：存入角色库（带分类）以便跨分镜复用 */}
      <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2">
        <span className="text-[11px] text-gray-500">{t('character.category')}</span>
        <select
          className="rounded border border-gray-300 p-0.5 text-[11px]"
          value={category}
          onChange={(e) => setCategory(e.target.value as CharacterCategory)}
        >
          {CHARACTER_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
            {t(`character.category.${cat}`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onSaveToLibrary}
          className="rounded border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-gray-50"
        >
          {t('character.saveToLibrary')}
        </button>
      </div>
      {notice && <p className="mt-1 text-[11px] text-gray-600">{notice}</p>}
    </div>
  );
}

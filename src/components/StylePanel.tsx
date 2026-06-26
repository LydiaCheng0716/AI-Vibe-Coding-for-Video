import { useState } from 'react';
import type { GlobalStyle, OutputLanguage, StyleFieldKey, StyleProfile } from '../core/models';
import { STYLE_FIELD_KEYS, STYLE_FIELD_LABELS, emptyStyleProfile } from '../core/styleProfile';
import { suggestStyleField } from '../services/styleSuggest';
import { useProjectStore } from '../sidepanel/projectStore';
import { OneTimeKeyInput, useOneTimeKey } from './OneTimeKeyInput';
import { useI18n } from '../i18n';
import CollapsiblePanel from './CollapsiblePanel';

interface Props {
  globalStyle: GlobalStyle | undefined;
  story: string;
  lang: OutputLanguage;
  busy: boolean;
  persistApiKey: boolean;
}

export default function StylePanel({ globalStyle, story, busy, persistApiKey }: Props) {
  const { t, uiLanguage } = useI18n();
  const labels = STYLE_FIELD_LABELS[uiLanguage] ?? STYLE_FIELD_LABELS.zh;
  const locked = !!globalStyle?.locked;
  const { updateGlobalStyle } = useProjectStore();
  const [profile, setProfile] = useState<StyleProfile>(globalStyle?.profile ?? emptyStyleProfile());
  const [resuggesting, setResuggesting] = useState<StyleFieldKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const oneTimeKey = useOneTimeKey({ persistApiKey });

  async function persist(patch: Partial<GlobalStyle>) {
    const r = await updateGlobalStyle(patch);
    if (!r.ok) {
      setNotice(r.error.message);
    }
  }

  function setField(key: StyleFieldKey, value: string) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  function commitProfile() {
    if (locked) return;
    void persist({ profile });
  }

  function pickSuggestion(key: StyleFieldKey, value: string) {
    if (locked) return;
    const next = { ...profile, [key]: value };
    setProfile(next);
    void persist({ profile: next });
  }

  async function onResuggest(key: StyleFieldKey) {
    if (busy || locked) return;
    setResuggesting(key);
    setNotice(null);
    try {
      const r = await suggestStyleField({ field: key, story, profile, apiKey: oneTimeKey.apiKey });
      if (r.ok) {
        const suggestions = { ...(globalStyle?.suggestions ?? {}), [key]: r.data };
        await persist({ suggestions });
      } else {
        setNotice(r.error.message);
      }
    } finally {
      if (!oneTimeKey.persistApiKey) oneTimeKey.clear();
      setResuggesting(null);
    }
  }

  return (
    <CollapsiblePanel
      title={
        <>
          {t('style.title')}{locked && <span className="ml-1 text-green-700">{t('style.locked')}</span>}
        </>
      }
      persistKey="style"
      contentClassName="flex flex-col gap-2"
      headerRight={
        <button
          type="button"
          onClick={() => persist({ locked: !locked })}
          className={`rounded px-2 py-0.5 text-xs ${
            locked ? 'border border-green-300 bg-green-50 text-green-800' : 'border border-gray-300 hover:bg-gray-50'
          }`}
        >
          {locked ? t('common.unlock') : t('common.lock')}
        </button>
      }
    >
      <OneTimeKeyInput
        oneTimeKey={oneTimeKey}
        className="w-full rounded border border-amber-300 p-1 text-xs outline-none focus:border-amber-500"
        placeholder={t('style.resuggestKeyPlaceholder')}
      />
      {STYLE_FIELD_KEYS.map((key) => {
        const candidates = globalStyle?.suggestions?.[key] ?? [];
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
      {notice && <p className="text-[11px] text-gray-600">{notice}</p>}
    </CollapsiblePanel>
  );
}

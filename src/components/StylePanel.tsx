import { useState } from 'react';
import type { GlobalStyle, OutputLanguage, Project, StyleFieldKey, StyleProfile } from '../core/models';
import { STYLE_FIELD_KEYS, STYLE_FIELD_LABELS, emptyStyleProfile } from '../core/styleProfile';
import { updateGlobalStyle } from '../services/storage';
import { suggestStyleField } from '../services/styleSuggest';

interface Props {
  globalStyle: GlobalStyle | undefined;
  story: string;
  lang: OutputLanguage;
  busy: boolean;
  persistApiKey: boolean;
  /** 调校/锁定后返回更新的 Project（含重注入的镜头），由 App 同步。 */
  onProjectUpdated: (project: Project) => void;
}

export default function StylePanel({ globalStyle, story, lang, busy, persistApiKey, onProjectUpdated }: Props) {
  const labels = STYLE_FIELD_LABELS[lang] ?? STYLE_FIELD_LABELS.zh;
  const locked = !!globalStyle?.locked;
  const [profile, setProfile] = useState<StyleProfile>(globalStyle?.profile ?? emptyStyleProfile());
  const [resuggesting, setResuggesting] = useState<StyleFieldKey | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tempKey, setTempKey] = useState('');

  async function persist(patch: Partial<GlobalStyle>) {
    const r = await updateGlobalStyle(patch);
    if (r.ok) {
      if (r.data) onProjectUpdated(r.data);
    } else {
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
    const apiKey = persistApiKey ? undefined : tempKey.trim() || undefined;
    const r = await suggestStyleField({ field: key, story, profile, apiKey });
    setResuggesting(null);
    if (r.ok) {
      const suggestions = { ...(globalStyle?.suggestions ?? {}), [key]: r.data };
      await persist({ suggestions });
    } else {
      setNotice(r.error.message);
    }
  }

  return (
    <section className="flex flex-col gap-2 border-t border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setCollapsed((v) => !v)} className="text-sm font-semibold">
          全局风格（可选，可跳过）{locked && <span className="ml-1 text-green-700">（已锁定）</span>}
          {collapsed ? ' ▸' : ' ▾'}
        </button>
        <button
          type="button"
          onClick={() => persist({ locked: !locked })}
          className={`rounded px-2 py-0.5 text-xs ${
            locked ? 'border border-green-300 bg-green-50 text-green-800' : 'border border-gray-300 hover:bg-gray-50'
          }`}
        >
          {locked ? '解锁' : '锁定'}
        </button>
      </div>

      {!collapsed && (
        <>
          {!persistApiKey && (
            <input
              type="password"
              autoComplete="off"
              className="w-full rounded border border-amber-300 p-1 text-xs outline-none focus:border-amber-500"
              placeholder="一次性 API Key（已关闭保存，仅用于「重新建议」，不落盘）"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
            />
          )}
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
        </>
      )}
      {notice && <p className="text-[11px] text-gray-600">{notice}</p>}
    </section>
  );
}

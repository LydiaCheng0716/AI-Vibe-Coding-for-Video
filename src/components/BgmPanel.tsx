import { useState } from 'react';
import type { Project } from '../core/models';
import { generateBgmPrompt } from '../services/generation';
import { copyToClipboard } from '../services/clipboard';
import { useProjectStore } from '../sidepanel/projectStore';
import { OneTimeKeyInput, useOneTimeKey } from './OneTimeKeyInput';
import { useT } from '../i18n';

interface Props {
  project: Project | null;
  /** 全局 LLM 锁占用中（与分镜共享，TASK-009）。 */
  busy: boolean;
}

export default function BgmPanel({ project, busy }: Props) {
  const t = useT();
  const { updateBgm } = useProjectStore();
  const [notice, setNotice] = useState<string | null>(null);
  const oneTimeKey = useOneTimeKey();
  const bgm = project?.bgm ?? null;

  async function onGenerate() {
    if (busy) return;
    if (!oneTimeKey.persistApiKey && !oneTimeKey.hasKey) {
      setNotice(t('bgm.noTempKey'));
      return;
    }
    const language = project?.params.outputLanguage ?? 'zh';
    setNotice(t('bgm.generatingNotice'));
    let r;
    try {
      r = await generateBgmPrompt({
        story: project?.story,
        project: project ?? undefined,
        language,
        ...(oneTimeKey.apiKey ? { apiKey: oneTimeKey.apiKey } : {}),
      });
    } finally {
      if (!oneTimeKey.persistApiKey) oneTimeKey.clear(); // 一次性 Key 用完即弃，异常路径也清（kimi LOW）
    }
    if (!r.ok) {
      setNotice(r.error.message);
      return;
    }
    // 服务不自行持久化：成功后写回当前项目（api-spec §3.4）。写失败不静默（kimi MED）。
    const saved = await updateBgm(r.data);
    if (!saved.ok) {
      setNotice(saved.error.message);
      return;
    }
    setNotice(null);
  }

  async function onCopy() {
    if (!bgm) return;
    const r = await copyToClipboard(bgm.prompt);
    const copied = t('bgm.copied');
    setNotice(r.ok ? copied : r.error.message);
    if (r.ok) window.setTimeout(() => setNotice((n) => (n === copied ? null : n)), 2000);
  }

  return (
    <div className="flex flex-col gap-2 border-t border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t('bgm.title')}</h2>
        <div className="flex gap-2">
          {bgm && (
            <button type="button" onClick={onCopy} className="text-xs text-blue-600 hover:underline">
              {t('common.copy')}
            </button>
          )}
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? t('common.generating') : bgm ? t('common.regenerate') : t('bgm.generate')}
          </button>
        </div>
      </div>
      <OneTimeKeyInput
        oneTimeKey={oneTimeKey}
        className="w-full rounded border border-amber-300 p-1 text-xs outline-none focus:border-amber-500"
        placeholder={t('bgm.tempKeyPlaceholder')}
      />
      {bgm && (
        <pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-2 text-xs text-gray-800">
          {bgm.prompt}
        </pre>
      )}
      {notice && <p className="text-xs text-gray-600">{notice}</p>}
    </div>
  );
}

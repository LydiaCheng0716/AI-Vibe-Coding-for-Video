import { useState } from 'react';
import type { Project, BgmPrompt } from '../core/models';
import { generateBgmPrompt } from '../services/generation';
import { updateCurrentProjectBgm } from '../services/storage';
import { copyToClipboard } from '../services/clipboard';

interface Props {
  project: Project | null;
  /** 全局 LLM 锁占用中（与分镜共享，TASK-009）。 */
  busy: boolean;
  /** BGM 生成成功后通知 App 更新内存态。 */
  onBgmGenerated: (bgm: BgmPrompt) => void;
}

export default function BgmPanel({ project, busy, onBgmGenerated }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const bgm = project?.bgm ?? null;

  async function onGenerate() {
    if (busy) return;
    const language = project?.params.outputLanguage ?? 'zh';
    setNotice('正在生成 BGM 提示词…');
    const r = await generateBgmPrompt({
      story: project?.story,
      project: project ?? undefined,
      language,
    });
    if (!r.ok) {
      setNotice(r.error.message);
      return;
    }
    // 服务不自行持久化：成功后写回当前项目（api-spec §3.4）。
    await updateCurrentProjectBgm(r.data);
    onBgmGenerated(r.data);
    setNotice(null);
  }

  async function onCopy() {
    if (!bgm) return;
    const r = await copyToClipboard(bgm.prompt);
    setNotice(r.ok ? '已复制 BGM 提示词' : r.error.message);
    if (r.ok) window.setTimeout(() => setNotice((n) => (n === '已复制 BGM 提示词' ? null : n)), 2000);
  }

  return (
    <div className="flex flex-col gap-2 border-t border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">BGM 提示词</h2>
        <div className="flex gap-2">
          {bgm && (
            <button type="button" onClick={onCopy} className="text-xs text-blue-600 hover:underline">
              复制
            </button>
          )}
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? '生成中…' : bgm ? '重新生成' : '生成 BGM'}
          </button>
        </div>
      </div>
      {bgm && (
        <pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-2 text-xs text-gray-800">
          {bgm.prompt}
        </pre>
      )}
      {notice && <p className="text-xs text-gray-600">{notice}</p>}
    </div>
  );
}

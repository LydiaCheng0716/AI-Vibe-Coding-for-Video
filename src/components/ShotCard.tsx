import { useState } from 'react';
import type { Shot } from '../core/models';
import { updateShotPrompt } from '../services/storage';
import { copyToClipboard } from '../services/clipboard';

interface Props {
  shot: Shot;
  /** 保存成功后通知父级更新内存态。 */
  onSaved: (shotId: string, prompt: string) => void;
}

export default function ShotCard({ shot, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(shot.prompt);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSave() {
    setSaving(true);
    const r = await updateShotPrompt(shot.id, draft);
    setSaving(false);
    if (!r.ok) {
      setNotice(r.error.message);
      return;
    }
    onSaved(shot.id, draft);
    setEditing(false);
    setNotice(null);
  }

  function onCancel() {
    setDraft(shot.prompt);
    setEditing(false);
    setNotice(null);
  }

  async function onCopy() {
    const r = await copyToClipboard(shot.prompt);
    setNotice(r.ok ? '已复制到剪贴板' : r.error.message);
  }

  return (
    <div className="rounded border border-gray-200 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500">
          镜头 {shot.index}
          {shot.editedByUser && <span className="ml-1 text-amber-600">（已编辑）</span>}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onCopy} className="text-xs text-blue-600 hover:underline">
            复制
          </button>
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-blue-600 hover:underline"
            >
              编辑
            </button>
          )}
        </div>
      </div>

      <p className="text-sm font-medium">{shot.summary}</p>
      <dl className="mt-1 grid grid-cols-3 gap-1 text-xs text-gray-500">
        <div>景别：{shot.shotSize}</div>
        <div>运镜：{shot.cameraMovement}</div>
        <div>时长：{shot.durationSuggestion}</div>
      </dl>

      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            className="min-h-[120px] w-full resize-y rounded border border-gray-300 p-2 text-xs outline-none focus:border-blue-500"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-gray-50 p-2 text-xs text-gray-800">
          {shot.prompt}
        </pre>
      )}

      {notice && <p className="mt-1 text-xs text-gray-600">{notice}</p>}
    </div>
  );
}

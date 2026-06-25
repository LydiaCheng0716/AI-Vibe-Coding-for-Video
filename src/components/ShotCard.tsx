import { useEffect, useState } from 'react';
import type { Project, Shot } from '../core/models';
import { updateShotPrompt, replaceShot, getSettings } from '../services/storage';
import { rewriteShot } from '../services/generation';
import { copyToClipboard } from '../services/clipboard';

interface Props {
  shot: Shot;
  /** 当前项目（重写需要 story / params / characters 上下文）。 */
  project: Project;
  /** 全局 LLM 锁占用中：禁用重写/优化，防重复提交。 */
  busy: boolean;
  /** 镜头变更（手动保存 / 重写 / 撤销）后通知父级更新内存态。 */
  onShotChanged: (shot: Shot) => void;
}

export default function ShotCard({ shot, project, busy, onShotChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(shot.prompt);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 单镜头迭代（Issue #30）
  const [feedback, setFeedback] = useState('');
  const [rewriting, setRewriting] = useState(false);
  const [history, setHistory] = useState<Shot[]>([]); // 撤销栈：每次重写前压入旧版
  // 不保存 Key 模式：重写需一次性 Key（不落盘），与生成区一致。
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

  async function onSave() {
    setSaving(true);
    const r = await updateShotPrompt(shot.id, draft);
    setSaving(false);
    if (!r.ok) {
      setNotice(r.error.message);
      return;
    }
    onShotChanged({ ...shot, prompt: draft, editedByUser: true });
    setEditing(false);
    setNotice(null);
  }

  function onCancel() {
    setDraft(shot.prompt);
    setEditing(false);
    setNotice(null);
  }

  function onEdit() {
    setDraft(shot.prompt);
    setNotice(null);
    setEditing(true);
  }

  async function onCopy() {
    const r = await copyToClipboard(shot.prompt);
    if (r.ok) {
      setNotice('已复制到剪贴板');
      window.setTimeout(() => setNotice((n) => (n === '已复制到剪贴板' ? null : n)), 2000);
    } else {
      setNotice(r.error.message);
    }
  }

  // 单镜头重写（regenerate / feedback）：成功后压入撤销栈、落库、上提。
  async function doRewrite(mode: 'regenerate' | 'feedback') {
    if (busy || rewriting) return;
    setRewriting(true);
    setNotice(null);
    const apiKey = persistKey ? undefined : tempKey.trim() || undefined;
    const r = await rewriteShot({
      project,
      shotId: shot.id,
      mode,
      feedback: mode === 'feedback' ? feedback : undefined,
      apiKey,
    });
    if (r.ok) {
      const prev = shot;
      const saved = await replaceShot(shot.id, r.data);
      if (!saved.ok) {
        setNotice(saved.error.message);
        setRewriting(false);
        return;
      }
      setHistory((h) => [...h, prev]);
      onShotChanged(r.data);
      if (mode === 'feedback') setFeedback('');
    } else {
      setNotice(r.error.message);
    }
    setRewriting(false);
  }

  async function onUndo() {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    const saved = await replaceShot(shot.id, prev);
    if (!saved.ok) {
      setNotice(saved.error.message);
      return;
    }
    setHistory((h) => h.slice(0, -1));
    onShotChanged(prev);
    setNotice('已撤销到上一版');
  }

  const disabled = busy || rewriting;

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
            <button type="button" onClick={onEdit} className="text-xs text-blue-600 hover:underline">
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

      {/* 单镜头迭代（Issue #30）：重新生成 / 反馈式优化 / 撤销 */}
      {!editing && (
        <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-2">
          {!persistKey && (
            <input
              type="password"
              autoComplete="off"
              className="w-full rounded border border-amber-300 p-1 text-xs outline-none focus:border-amber-500"
              placeholder="一次性 API Key（已关闭保存，用于重写，不落盘）"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
            />
          )}
          <div className="flex items-center gap-2">
            <input
              className="flex-1 rounded border border-gray-300 p-1 text-xs outline-none focus:border-blue-500"
              placeholder="一句反馈，如「更暗一点 / 改俯拍 / 去掉路人」"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <button
              type="button"
              onClick={() => doRewrite('feedback')}
              disabled={disabled || !feedback.trim()}
              className="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {rewriting ? '优化中…' : '优化'}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => doRewrite('regenerate')}
              disabled={disabled}
              className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
            >
              {rewriting ? '生成中…' : '重新生成'}
            </button>
            {history.length > 0 && (
              <button
                type="button"
                onClick={onUndo}
                disabled={disabled}
                className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
              >
                撤销（{history.length}）
              </button>
            )}
          </div>
        </div>
      )}

      {notice && <p className="mt-1 text-xs text-gray-600">{notice}</p>}
    </div>
  );
}

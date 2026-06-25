import { useState } from 'react';
import type { Project, Shot } from '../core/models';
import ShotCard from './ShotCard';
import { deleteShotById, insertShotAt, moveShot, makeBlankShot } from '../core/shotOps';
import { setShots, replaceShot } from '../services/storage';
import { rewriteShot } from '../services/generation';

interface Props {
  project: Project;
  busy: boolean;
  persistApiKey: boolean;
  /** 单镜头变更（#30 重写/编辑/撤销）。 */
  onShotChanged: (shot: Shot) => void;
  /** 结构性变更（增删/排序/撤销）后整体同步 Project。 */
  onProjectUpdated: (project: Project) => void;
}

const UNDO_MAX = 20;

function InsertBar({ onInsert, disabled }: { onInsert: (desc: string) => void; disabled: boolean }) {
  const [desc, setDesc] = useState('');
  return (
    <div className="flex items-center gap-1">
      <input
        className="flex-1 rounded border border-dashed border-gray-300 p-1 text-[11px] outline-none focus:border-blue-400"
        placeholder="在此插入镜头：可选一句描述，留空则插入空白镜头"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
      />
      <button
        type="button"
        onClick={() => {
          onInsert(desc);
          setDesc('');
        }}
        disabled={disabled}
        className="shrink-0 rounded border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-gray-50 disabled:opacity-50"
      >
        ＋插入
      </button>
    </div>
  );
}

export default function ShotList({ project, busy, persistApiKey, onShotChanged, onProjectUpdated }: Props) {
  const [history, setHistory] = useState<Shot[][]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tempKey, setTempKey] = useState('');
  const [working, setWorking] = useState(false);

  // 不在 0 镜头时返回 null：删到空仍需保留「插入/撤销」入口，避免删空后无法恢复（对抗自检）。
  const ordered = [...project.shots].sort((a, b) => a.index - b.index);
  const disabled = busy || working;

  async function applyShots(prev: Shot[], next: Shot[]): Promise<Project | null> {
    setHistory((h) => [...h, prev].slice(-UNDO_MAX));
    const r = await setShots(next);
    if (!r.ok) {
      setNotice(r.error.message);
      return null;
    }
    if (r.data) onProjectUpdated(r.data);
    return r.data;
  }

  async function onDelete(shotId: string) {
    if (disabled) return;
    if (!window.confirm('确定删除这个镜头？可点「撤销」恢复。')) return;
    setNotice(null);
    await applyShots(ordered, deleteShotById(ordered, shotId));
  }

  async function onMove(shotId: string, toIndex: number) {
    if (disabled) return;
    setNotice(null);
    await applyShots(ordered, moveShot(ordered, shotId, toIndex));
  }

  async function onInsert(arrayIndex: number, desc: string) {
    if (disabled) return;
    setWorking(true);
    setNotice(null);
    try {
      const blank = makeBlankShot(ordered);
      const next = insertShotAt(ordered, arrayIndex, blank);
      const updated = await applyShots(ordered, next);
      if (!updated) return;
      // 有描述 → 复用 #30 重写管线即时生成填充（注入锁定角色 + 全局风格）。
      if (desc.trim()) {
        const apiKey = persistApiKey ? undefined : tempKey.trim() || undefined;
        const r = await rewriteShot({ project: updated, shotId: blank.id, mode: 'feedback', feedback: desc, apiKey });
        if (r.ok) {
          const saved = await replaceShot(blank.id, r.data);
          if (saved.ok) onShotChanged(r.data);
          else setNotice(saved.error.message);
        } else {
          setNotice(`空白镜头已插入，但生成失败：${r.error.message}`);
        }
      }
    } finally {
      setWorking(false);
    }
  }

  async function onUndo() {
    if (disabled || history.length === 0) return;
    const prev = history[history.length - 1];
    const r = await setShots(prev);
    if (r.ok) {
      if (r.data) onProjectUpdated(r.data);
      setHistory((h) => h.slice(0, -1));
      setNotice('已撤销上一步结构操作');
    } else {
      setNotice(r.error.message);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">分镜（{ordered.length} 个镜头）</h2>
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
      {!persistApiKey && (
        <input
          type="password"
          autoComplete="off"
          className="w-full rounded border border-amber-300 p-1 text-xs outline-none focus:border-amber-500"
          placeholder="一次性 API Key（已关闭保存，用于插入即时生成，不落盘）"
          value={tempKey}
          onChange={(e) => setTempKey(e.target.value)}
        />
      )}
      {notice && <p className="text-xs text-gray-600">{notice}</p>}

      <InsertBar onInsert={(d) => onInsert(0, d)} disabled={disabled} />
      {ordered.map((s, i) => (
        <div key={s.id} className="flex flex-col gap-3">
          <div
            draggable={!disabled}
            onDragStart={() => setDragId(s.id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId && dragId !== s.id) void onMove(dragId, i);
              setDragId(null);
            }}
            className={dragId === s.id ? 'opacity-50' : undefined}
          >
            <ShotCard
              shot={s}
              project={project}
              busy={busy}
              persistApiKey={persistApiKey}
              onShotChanged={onShotChanged}
              onDelete={() => void onDelete(s.id)}
            />
          </div>
          <InsertBar onInsert={(d) => onInsert(i + 1, d)} disabled={disabled} />
        </div>
      ))}
    </div>
  );
}

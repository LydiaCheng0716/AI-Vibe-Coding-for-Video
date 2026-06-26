import { useState } from 'react';
import type { Project, Shot } from '../core/models';
import ShotCard from './ShotCard';
import { deleteShotById, insertShotAt, moveShot, makeBlankShot } from '../core/shotOps';
import { rewriteShot, generateTransition } from '../services/generation';
import { TRANSITION_TYPES, transitionLabel } from '../core/transitions';
import { copyToClipboard } from '../services/clipboard';
import { useProjectStore } from '../sidepanel/projectStore';

interface Props {
  project: Project;
  busy: boolean;
  persistApiKey: boolean;
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

// 相邻两镜之间的转场（Issue #54）：选类型 → 生成说明；可编辑/复制/清除/重新生成。
function TransitionBar({
  prev,
  next,
  lang,
  busy,
  apiKey,
}: {
  prev: Shot;
  next: Shot;
  lang: Project['params']['outputLanguage'];
  busy: boolean;
  apiKey?: string;
}) {
  const { updateShotTransition } = useProjectStore();
  const t = prev.transitionToNext;
  const [type, setType] = useState(t?.type ?? TRANSITION_TYPES[0].id);
  const [note, setNote] = useState(t?.note ?? '');
  const [noteEn, setNoteEn] = useState(t?.noteEn ?? '');
  const [gen, setGen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const bilingual = lang === 'zh-en';

  async function onGenerate() {
    if (busy || gen) return;
    setGen(true);
    setNotice(null);
    const r = await generateTransition({ prevShot: prev, nextShot: next, type, lang, apiKey });
    setGen(false);
    if (!r.ok) {
      setNotice(r.error.message);
      return;
    }
    setNote(r.data.note);
    setNoteEn(r.data.noteEn ?? '');
    const save = await updateShotTransition(prev.id, r.data);
    if (!save.ok) setNotice(save.error.message);
  }

  async function onSaveNote() {
    if (!t) return;
    // 用当前选中的 type（用户可能改了下拉再编辑），而非旧 prop 的 t.type（Codex P2）。
    const save = await updateShotTransition(prev.id, { type, note, ...(bilingual && noteEn ? { noteEn } : {}) });
    if (save.ok) {
      setNotice('已保存');
    } else if (!save.ok) setNotice(save.error.message);
  }

  async function onClear() {
    const save = await updateShotTransition(prev.id, null);
    if (save.ok) {
      setNote('');
      setNoteEn('');
    } else {
      setNotice(save.error.message);
    }
  }

  async function onCopy() {
    const text = bilingual && noteEn ? `${note}\n${noteEn}` : note;
    const r = await copyToClipboard(text);
    setNotice(r.ok ? '已复制' : r.error.message);
  }

  return (
    <div className="flex flex-col gap-1 rounded bg-gray-50 px-2 py-1">
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-gray-400">转场 ↧</span>
        <select
          className="rounded border border-gray-300 p-0.5 text-[11px]"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {TRANSITION_TYPES.map((tt) => (
            <option key={tt.id} value={tt.id}>
              {transitionLabel(tt.id, lang)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onGenerate}
          disabled={busy || gen}
          className="rounded border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-white disabled:opacity-50"
        >
          {gen ? '生成中…' : t ? '重新生成' : '生成转场'}
        </button>
        {t && (
          <>
            <button type="button" onClick={onCopy} className="text-[11px] text-blue-600 hover:underline">
              复制
            </button>
            <button type="button" onClick={onClear} className="text-[11px] text-red-600 hover:underline">
              清除
            </button>
          </>
        )}
      </div>
      {t && (
        <>
          <input
            className="w-full rounded border border-gray-300 p-1 text-[11px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={onSaveNote}
          />
          {bilingual && (
            <input
              className="w-full rounded border border-gray-300 p-1 text-[11px]"
              value={noteEn}
              placeholder="English transition note"
              onChange={(e) => setNoteEn(e.target.value)}
              onBlur={onSaveNote}
            />
          )}
        </>
      )}
      {notice && <span className="text-[11px] text-gray-500">{notice}</span>}
    </div>
  );
}

export default function ShotList({ project, busy, persistApiKey }: Props) {
  const { setShots, replaceShot } = useProjectStore();
  const [history, setHistory] = useState<Shot[][]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tempKey, setTempKey] = useState('');
  const [working, setWorking] = useState(false);

  // 不在 0 镜头时返回 null：删到空仍需保留「插入/撤销」入口，避免删空后无法恢复（对抗自检）。
  const ordered = [...project.shots].sort((a, b) => a.index - b.index);
  const disabled = busy || working;

  async function applyShots(prev: Shot[], next: Shot[]): Promise<Project | null> {
    const r = await setShots(next);
    if (!r.ok) {
      setNotice(r.error.message);
      return null;
    }
    if (r.data) setHistory((h) => [...h, prev].slice(-UNDO_MAX));
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
          if (!saved.ok) setNotice(saved.error.message);
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
              onDelete={() => void onDelete(s.id)}
            />
          </div>
          {i < ordered.length - 1 && (
            <TransitionBar
              prev={s}
              next={ordered[i + 1]}
              lang={project.params.outputLanguage}
              busy={busy}
              apiKey={persistApiKey ? undefined : tempKey.trim() || undefined}
            />
          )}
          <InsertBar onInsert={(d) => onInsert(i + 1, d)} disabled={disabled} />
        </div>
      ))}
    </div>
  );
}

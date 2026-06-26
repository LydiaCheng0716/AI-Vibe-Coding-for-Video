import { useEffect, useRef, useState } from 'react';
import { err, type Project, type Shot, type Transition } from '../core/models';
import ShotCard from './ShotCard';
import { deleteShotById, insertShotAt, moveShot, makeBlankShot } from '../core/shotOps';
import { rewriteShot, generateFirstFrame, generateTransition, type FirstFrameResult } from '../services/generation';
import { TRANSITION_TYPES, transitionLabel } from '../core/transitions';
import { copyToClipboard } from '../services/clipboard';
import { useProjectStore } from '../sidepanel/projectStore';
import { OneTimeKeyInput, useOneTimeKey, type OneTimeKeyState } from './OneTimeKeyInput';
import { runBatch, skipped } from '../services/batch';

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
        aria-label="插入镜头描述"
        className="flex-1 rounded border border-dashed border-gray-300 p-1 text-[11px] outline-none focus:border-blue-400"
        placeholder="在此插入镜头：可选一句描述，留空则插入空白镜头"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
      />
      <button
        type="button"
        aria-label="在当前位置插入镜头"
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
  oneTimeKey,
}: {
  prev: Shot;
  next: Shot;
  lang: Project['params']['outputLanguage'];
  busy: boolean;
  oneTimeKey: OneTimeKeyState;
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
    try {
      const r = await generateTransition({ prevShot: prev, nextShot: next, type, lang, apiKey: oneTimeKey.apiKey });
      if (!r.ok) {
        setNotice(r.error.message);
        return;
      }
      setNote(r.data.note);
      setNoteEn(r.data.noteEn ?? '');
      const save = await updateShotTransition(prev.id, r.data);
      if (!save.ok) setNotice(save.error.message);
    } finally {
      if (!oneTimeKey.persistApiKey) oneTimeKey.clear();
      setGen(false);
    }
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
          aria-label={`镜头 ${prev.index} 到镜头 ${next.index} 的转场类型`}
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
          aria-label={`${t ? '重新生成' : '生成'} 镜头 ${prev.index} 到镜头 ${next.index} 的转场说明`}
          onClick={onGenerate}
          disabled={busy || gen}
          className="rounded border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-white disabled:opacity-50"
        >
          {gen ? '生成中…' : t ? '重新生成' : '生成转场'}
        </button>
        {t && (
          <>
            <button
              type="button"
              aria-label={`复制 镜头 ${prev.index} 到镜头 ${next.index} 的转场说明`}
              onClick={onCopy}
              className="text-[11px] text-blue-600 hover:underline"
            >
              复制
            </button>
            <button
              type="button"
              aria-label={`清除 镜头 ${prev.index} 到镜头 ${next.index} 的转场说明`}
              onClick={onClear}
              className="text-[11px] text-red-600 hover:underline"
            >
              清除
            </button>
          </>
        )}
      </div>
      {t && (
        <>
          <input
            aria-label={`镜头 ${prev.index} 到镜头 ${next.index} 的中文转场说明`}
            className="w-full rounded border border-gray-300 p-1 text-[11px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={onSaveNote}
          />
          {bilingual && (
            <input
              aria-label={`镜头 ${prev.index} 到镜头 ${next.index} 的英文转场说明`}
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
  const { setShots, replaceShot, updateShotFirstFrame, updateShotTransition } = useProjectStore();
  const [history, setHistory] = useState<Shot[][]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const oneTimeKey = useOneTimeKey({ persistApiKey });
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  // 卸载后中止批量：避免关闭面板后仍调用 LLM 消耗额度 / setState（Kimi minor）。
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // 不在 0 镜头时返回 null：删到空仍需保留「插入/撤销」入口，避免删空后无法恢复（对抗自检）。
  const ordered = [...project.shots].sort((a, b) => a.index - b.index);
  const disabled = busy || working;

  function failDetails<T>(failed: Array<{ item: T; error: string }>, label: (item: T) => string): string {
    if (failed.length === 0) return '';
    return `（${failed.map((f) => `${label(f.item)}：${f.error}`).join('；')}）`;
  }

  async function onBatchFirstFrames() {
    if (busy || workingRef.current) return;
    workingRef.current = true;
    setWorking(true);
    setNotice(null);
    setBatchProgress(`处理中 0/${ordered.length}`);
    try {
      const summary = await runBatch<Shot, FirstFrameResult>(
        ordered,
        async (shot) => {
          if (!aliveRef.current) return skipped('已取消');
          if (shot.firstFramePrompt != null) return skipped('已存在首帧');
          const generated = await generateFirstFrame({
            shot,
            characters: project.characters,
            globalStyle: project.globalStyle,
            lang: project.params.outputLanguage,
            apiKey: oneTimeKey.apiKey,
          });
          if (!generated.ok) return generated;
          const saved = await updateShotFirstFrame(shot.id, generated.data);
          if (!saved.ok) return { ok: false, error: saved.error };
          // store 在无项目/无匹配镜头时返回 ok(null)：未真正落库，不能记成功（Kimi minor）。
          if (saved.data === null) return err('STORAGE_WRITE_FAILED', '未找到镜头，首帧未保存');
          return generated;
        },
        {
          onProgress: (done, total) => {
            if (aliveRef.current) setBatchProgress(`处理中 ${done}/${total}`);
          },
        },
      );
      setNotice(
        `首帧批量完成：成功 ${summary.ok.length}、跳过 ${summary.skipped.length}、失败 ${summary.failed.length}${failDetails(
          summary.failed,
          (shot) => `镜头 ${shot.index}`,
        )}`,
      );
    } finally {
      if (!oneTimeKey.persistApiKey) oneTimeKey.clear();
      setBatchProgress(null);
      workingRef.current = false;
      setWorking(false);
    }
  }

  async function onBatchTransitions() {
    if (busy || workingRef.current) return;
    const pairs = ordered.slice(0, -1).map((prev, i) => ({ prev, next: ordered[i + 1] }));
    workingRef.current = true;
    setWorking(true);
    setNotice(null);
    setBatchProgress(`处理中 0/${pairs.length}`);
    try {
      const summary = await runBatch<{ prev: Shot; next: Shot }, Transition>(
        pairs,
        async ({ prev, next }) => {
          if (!aliveRef.current) return skipped('已取消');
          if (prev.transitionToNext != null) return skipped('已存在转场');
          const generated = await generateTransition({
            prevShot: prev,
            nextShot: next,
            type: TRANSITION_TYPES[0].id,
            lang: project.params.outputLanguage,
            apiKey: oneTimeKey.apiKey,
          });
          if (!generated.ok) return generated;
          const saved = await updateShotTransition(prev.id, generated.data);
          if (!saved.ok) return { ok: false, error: saved.error };
          // 同上：ok(null) 表示未落库，不计成功（Kimi minor）。
          if (saved.data === null) return err('STORAGE_WRITE_FAILED', '未找到镜头，转场未保存');
          return generated;
        },
        {
          onProgress: (done, total) => {
            if (aliveRef.current) setBatchProgress(`处理中 ${done}/${total}`);
          },
        },
      );
      setNotice(
        `转场批量完成：成功 ${summary.ok.length}、跳过 ${summary.skipped.length}、失败 ${summary.failed.length}${failDetails(
          summary.failed,
          ({ prev, next }) => `镜头 ${prev.index}→${next.index}`,
        )}`,
      );
    } finally {
      if (!oneTimeKey.persistApiKey) oneTimeKey.clear();
      setBatchProgress(null);
      workingRef.current = false;
      setWorking(false);
    }
  }

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
        const r = await rewriteShot({
          project: updated,
          shotId: blank.id,
          mode: 'feedback',
          feedback: desc,
          apiKey: oneTimeKey.apiKey,
        });
        if (r.ok) {
          const saved = await replaceShot(blank.id, r.data);
          if (!saved.ok) setNotice(saved.error.message);
        } else {
          setNotice(`空白镜头已插入，但生成失败：${r.error.message}`);
        }
      }
    } finally {
      if (desc.trim() && !oneTimeKey.persistApiKey) oneTimeKey.clear();
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
            aria-label={`撤销上一步结构操作，当前 ${history.length} 步可撤销`}
            onClick={onUndo}
            disabled={disabled}
            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
          >
            撤销（{history.length}）
          </button>
        )}
      </div>
      <OneTimeKeyInput
        oneTimeKey={oneTimeKey}
        aria-label="一次性 API Key，用于批量生成或插入即时生成"
        className="w-full rounded border border-amber-300 p-1 text-xs outline-none focus:border-amber-500"
        placeholder="一次性 API Key（已关闭保存，用于批量/插入即时生成，不落盘）"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="批量生成所有缺失的首帧提示词"
          onClick={onBatchFirstFrames}
          disabled={disabled}
          className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          批量生成首帧
        </button>
        <button
          type="button"
          aria-label="批量生成相邻镜头转场提示词"
          onClick={onBatchTransitions}
          disabled={disabled}
          className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          批量生成转场
        </button>
        {batchProgress && <span className="text-xs text-blue-600">{batchProgress}</span>}
      </div>
      {notice && <p className="text-xs text-gray-600">{notice}</p>}

      <InsertBar onInsert={(d) => onInsert(0, d)} disabled={disabled} />
      <div role="list" aria-label="分镜列表" className="flex flex-col gap-3">
        {ordered.map((s, i) => (
          <div key={s.id} role="listitem" className="flex flex-col gap-3">
            <div
              draggable={!disabled}
              aria-label={`镜头 ${s.index}，可拖拽或用上移/下移按钮重排`}
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
              <div className="mb-1 flex items-center justify-end gap-1">
                <button
                  type="button"
                  aria-label={`上移 镜头 ${s.index}`}
                  onClick={() => void onMove(s.id, i - 1)}
                  disabled={disabled || i === 0}
                  className="rounded border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-gray-50 disabled:opacity-50"
                >
                  上移
                </button>
                <button
                  type="button"
                  aria-label={`下移 镜头 ${s.index}`}
                  onClick={() => void onMove(s.id, i + 1)}
                  disabled={disabled || i === ordered.length - 1}
                  className="rounded border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-gray-50 disabled:opacity-50"
                >
                  下移
                </button>
              </div>
              <ShotCard
                shot={s}
                project={project}
                busy={disabled}
                persistApiKey={persistApiKey}
                onDelete={() => void onDelete(s.id)}
              />
            </div>
            {i < ordered.length - 1 && (
              <TransitionBar
                prev={s}
                next={ordered[i + 1]}
                lang={project.params.outputLanguage}
                busy={disabled}
                oneTimeKey={oneTimeKey}
              />
            )}
            <InsertBar onInsert={(d) => onInsert(i + 1, d)} disabled={disabled} />
          </div>
        ))}
      </div>
    </div>
  );
}

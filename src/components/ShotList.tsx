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
import { useT } from '../i18n';

interface Props {
  project: Project;
  busy: boolean;
  persistApiKey: boolean;
}

const UNDO_MAX = 20;

function InsertBar({ onInsert, disabled }: { onInsert: (desc: string) => void; disabled: boolean }) {
  const t = useT();
  const [desc, setDesc] = useState('');
  return (
    <div className="flex items-center gap-1">
      <input
        aria-label={t('shotList.insertDescAria')}
        className="flex-1 rounded border border-dashed border-gray-300 p-1 text-[11px] outline-none focus:border-blue-400"
        placeholder={t('shotList.insertPlaceholder')}
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
      />
      <button
        type="button"
        aria-label={t('shotList.insertAria')}
        onClick={() => {
          onInsert(desc);
          setDesc('');
        }}
        disabled={disabled}
        className="shrink-0 rounded border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-gray-50 disabled:opacity-50"
      >
        {t('shotList.insert')}
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
  const tt = useT();
  const { updateShotTransition } = useProjectStore();
  const transition = prev.transitionToNext;
  const [type, setType] = useState(transition?.type ?? TRANSITION_TYPES[0].id);
  const [note, setNote] = useState(transition?.note ?? '');
  const [noteEn, setNoteEn] = useState(transition?.noteEn ?? '');
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
    if (!transition) return;
    // 用当前选中的 type（用户可能改了下拉再编辑），而非旧 prop 的 transition.type（Codex P2）。
    const save = await updateShotTransition(prev.id, { type, note, ...(bilingual && noteEn ? { noteEn } : {}) });
    if (save.ok) {
      setNotice(tt('common.saved'));
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
    setNotice(r.ok ? tt('common.copied') : r.error.message);
  }

  return (
    <div className="flex flex-col gap-1 rounded bg-gray-50 px-2 py-1">
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-gray-400">{tt('shotList.transition')}</span>
        <select
          aria-label={tt('shotList.transitionTypeAria', { prev: prev.index, next: next.index })}
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
          aria-label={tt('shotList.transitionActionAria', {
            action: transition ? tt('common.regenerate') : tt('common.generate'),
            prev: prev.index,
            next: next.index,
          })}
          onClick={onGenerate}
          disabled={busy || gen}
          className="rounded border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-white disabled:opacity-50"
        >
          {gen ? tt('common.generating') : transition ? tt('common.regenerate') : tt('shotList.generateTransition')}
        </button>
        {transition && (
          <>
            <button
              type="button"
              aria-label={tt('shotList.copyTransitionAria', { prev: prev.index, next: next.index })}
              onClick={onCopy}
              className="text-[11px] text-blue-600 hover:underline"
            >
              {tt('common.copy')}
            </button>
            <button
              type="button"
              aria-label={tt('shotList.clearTransitionAria', { prev: prev.index, next: next.index })}
              onClick={onClear}
              className="text-[11px] text-red-600 hover:underline"
            >
              {tt('shotList.clear')}
            </button>
          </>
        )}
      </div>
      {transition && (
        <>
          <input
            aria-label={tt('shotList.transitionZhAria', { prev: prev.index, next: next.index })}
            className="w-full rounded border border-gray-300 p-1 text-[11px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={onSaveNote}
          />
          {bilingual && (
            <input
              aria-label={tt('shotList.transitionEnAria', { prev: prev.index, next: next.index })}
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
  const t = useT();
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
  // 键盘重排：单飞锁防快速连击用旧 ordered 闭包算错顺序/重复入撤销栈（Kimi P2）。
  const [moving, setMoving] = useState(false);
  const movingRef = useRef(false);
  // 重排后焦点恢复：按钮在新位置重建会丢焦点到 body，记录最后移动的镜头+方向，渲染后 focus（Kimi P2）。
  const listRef = useRef<HTMLDivElement>(null);
  const [focusAfterMove, setFocusAfterMove] = useState<{ id: string; dir: 'up' | 'down' } | null>(null);
  useEffect(() => {
    if (!focusAfterMove) return;
    const root = listRef.current;
    if (root) {
      const pick = (dir: 'up' | 'down') =>
        root.querySelector<HTMLButtonElement>(`[data-move="${dir}"][data-shot="${focusAfterMove.id}"]`);
      // 优先聚焦同向按钮；若移到边界已禁用，则退回反向按钮，保证焦点不掉回 body。
      const preferred = pick(focusAfterMove.dir);
      const fallback = pick(focusAfterMove.dir === 'up' ? 'down' : 'up');
      const target = preferred && !preferred.disabled ? preferred : fallback;
      target?.focus();
    }
    setFocusAfterMove(null);
  }, [focusAfterMove]);

  // 不在 0 镜头时返回 null：删到空仍需保留「插入/撤销」入口，避免删空后无法恢复（对抗自检）。
  const ordered = [...project.shots].sort((a, b) => a.index - b.index);
  const disabled = busy || working;

  function failDetails<T>(failed: Array<{ item: T; error: string }>, label: (item: T) => string): string {
    if (failed.length === 0) return '';
    return t('shotList.failDetails', {
      details: failed.map((f) => t('shotList.failPair', { label: label(f.item), error: f.error })).join('；'),
    });
  }

  async function onBatchFirstFrames() {
    if (busy || workingRef.current) return;
    workingRef.current = true;
    setWorking(true);
    setNotice(null);
    setBatchProgress(t('shotList.processing', { done: 0, total: ordered.length }));
    try {
      const summary = await runBatch<Shot, FirstFrameResult>(
        ordered,
        async (shot) => {
          if (!aliveRef.current) return skipped(t('shotList.canceled'));
          if (shot.firstFramePrompt != null) return skipped(t('shotList.firstFrameExists'));
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
          if (saved.data === null) return err('STORAGE_WRITE_FAILED', t('shotList.firstFrameMissingShot'));
          return generated;
        },
        {
          onProgress: (done, total) => {
            if (aliveRef.current) setBatchProgress(t('shotList.processing', { done, total }));
          },
        },
      );
      setNotice(
        t('shotList.firstFrameBatchDone', {
          ok: summary.ok.length,
          skipped: summary.skipped.length,
          failed: summary.failed.length,
          details: failDetails(summary.failed, (shot) => t('shotList.shotLabel', { index: shot.index })),
        }),
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
    setBatchProgress(t('shotList.processing', { done: 0, total: pairs.length }));
    try {
      const summary = await runBatch<{ prev: Shot; next: Shot }, Transition>(
        pairs,
        async ({ prev, next }) => {
          if (!aliveRef.current) return skipped(t('shotList.canceled'));
          if (prev.transitionToNext != null) return skipped(t('shotList.transitionExists'));
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
          if (saved.data === null) return err('STORAGE_WRITE_FAILED', t('shotList.transitionMissingShot'));
          return generated;
        },
        {
          onProgress: (done, total) => {
            if (aliveRef.current) setBatchProgress(t('shotList.processing', { done, total }));
          },
        },
      );
      setNotice(
        t('shotList.transitionBatchDone', {
          ok: summary.ok.length,
          skipped: summary.skipped.length,
          failed: summary.failed.length,
          details: failDetails(summary.failed, ({ prev, next }) =>
            t('shotList.shotPairLabel', { prev: prev.index, next: next.index }),
          ),
        }),
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
    if (!window.confirm(t('shotList.confirmDelete'))) return;
    setNotice(null);
    await applyShots(ordered, deleteShotById(ordered, shotId));
  }

  async function onMove(shotId: string, toIndex: number) {
    // movingRef 同步拦截快速连击：用当前 render 的 ordered，避免第二次基于旧闭包算错（Kimi P2）。
    if (disabled || movingRef.current) return;
    movingRef.current = true;
    setMoving(true);
    setNotice(null);
    try {
      await applyShots(ordered, moveShot(ordered, shotId, toIndex));
    } finally {
      movingRef.current = false;
      setMoving(false);
    }
  }

  // 键盘重排：移动并在重排后恢复焦点（拖拽不需要焦点恢复，仅键盘按钮用）。
  async function onKeyboardMove(shotId: string, toIndex: number, dir: 'up' | 'down') {
    if (disabled || movingRef.current) return;
    await onMove(shotId, toIndex);
    setFocusAfterMove({ id: shotId, dir });
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
          setNotice(t('shotList.insertGenerateFailed', { message: r.error.message }));
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
      setNotice(t('shotList.undoStructureDone'));
    } else {
      setNotice(r.error.message);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t('shotList.title', { n: ordered.length })}</h2>
        {history.length > 0 && (
          <button
            type="button"
            aria-label={t('shotList.undoAria', { n: history.length })}
            onClick={onUndo}
            disabled={disabled}
            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
          >
            {t('shotList.undo', { n: history.length })}
          </button>
        )}
      </div>
      <OneTimeKeyInput
        oneTimeKey={oneTimeKey}
        aria-label={t('shotList.tempKeyAria')}
        className="w-full rounded border border-amber-300 p-1 text-xs outline-none focus:border-amber-500"
        placeholder={t('shotList.tempKeyPlaceholder')}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label={t('shotList.batchFirstFramesAria')}
          onClick={onBatchFirstFrames}
          disabled={disabled}
          className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          {t('shotList.batchFirstFrames')}
        </button>
        <button
          type="button"
          aria-label={t('shotList.batchTransitionsAria')}
          onClick={onBatchTransitions}
          disabled={disabled}
          className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          {t('shotList.batchTransitions')}
        </button>
        {batchProgress && <span className="text-xs text-blue-600">{batchProgress}</span>}
      </div>
      {notice && <p className="text-xs text-gray-600">{notice}</p>}

      <InsertBar onInsert={(d) => onInsert(0, d)} disabled={disabled} />
      <div
        ref={listRef}
        role="list"
        aria-label={t('shotList.listAria')}
        data-testid="shot-list"
        className="flex flex-col gap-3"
      >
        {ordered.map((s, i) => (
          <div key={s.id} role="listitem" className="flex flex-col gap-3">
            <div
              draggable={!disabled}
              aria-label={t('shotList.itemDragAria', { index: s.index })}
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
                  data-move="up"
                  data-shot={s.id}
                  aria-label={t('shotList.moveUpAria', { index: s.index })}
                  onClick={() => void onKeyboardMove(s.id, i - 1, 'up')}
                  disabled={disabled || moving || i === 0}
                  className="rounded border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-gray-50 disabled:opacity-50"
                >
                  {t('shotList.moveUp')}
                </button>
                <button
                  type="button"
                  data-move="down"
                  data-shot={s.id}
                  aria-label={t('shotList.moveDownAria', { index: s.index })}
                  onClick={() => void onKeyboardMove(s.id, i + 1, 'down')}
                  disabled={disabled || moving || i === ordered.length - 1}
                  className="rounded border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-gray-50 disabled:opacity-50"
                >
                  {t('shotList.moveDown')}
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

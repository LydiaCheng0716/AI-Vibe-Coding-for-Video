import { useRef, useState } from 'react';
import type { Project, Shot } from '../core/models';
import { updateShotPrompt, replaceShot, updateShotFirstFrame } from '../services/storage';
import { rewriteShot, generateFirstFrame, translateText } from '../services/generation';
import type { RewriteMode } from '../prompts/rewrite';
import { copyToClipboard } from '../services/clipboard';
import { shotSizeOptions, cameraMovementOptions, DURATION_OPTIONS, withCurrent } from '../core/shotParams';

/** 撤销栈上限：避免多轮重写累积过多 Shot 占内存（Kimi minor）。 */
const UNDO_MAX = 20;

interface Props {
  shot: Shot;
  /** 当前项目（重写需要 story / params / characters 上下文）。 */
  project: Project;
  /** 全局 LLM 锁占用中：禁用重写/优化，防重复提交。 */
  busy: boolean;
  /** 是否保存 Key（由 App 读一次下传，避免每卡各读一次 storage，Kimi minor）。 */
  persistApiKey: boolean;
  /** 镜头变更（手动保存 / 重写 / 撤销）后通知父级更新内存态。 */
  onShotChanged: (shot: Shot) => void;
  /** 删除本镜头（Issue #56；确认由父级处理）。 */
  onDelete?: () => void;
}

export default function ShotCard({ shot, project, busy, persistApiKey, onShotChanged, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(shot.prompt);
  const [draftEn, setDraftEn] = useState(shot.promptEn ?? ''); // 双语英文版编辑草稿（Issue #41）
  // 双语自动翻译同步（Issue #53）：默认关，避免误触翻译消耗额度。
  const [autoSync, setAutoSync] = useState(false);
  const [translating, setTranslating] = useState<'zh' | 'en' | null>(null);
  const translatingRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 单镜头迭代（Issue #30）
  const [feedback, setFeedback] = useState('');
  const [rewriting, setRewriting] = useState(false);
  const [history, setHistory] = useState<Shot[]>([]); // 撤销栈：每次重写前压入旧版
  // 一次性 Key（不保存 Key 模式）：重写用，不落盘。
  const [tempKey, setTempKey] = useState('');
  // 同步重入保护：快速连点时 state 快照会滞后，用 ref 在事件起点同步拦截（Kimi P2）。
  const rewritingRef = useRef(false);
  const undoingRef = useRef(false);
  // 首帧图像提示词（Issue #57，按需生成）
  const [firstFraming, setFirstFraming] = useState(false);
  const firstFramingRef = useRef(false);

  async function onSave() {
    if (translatingRef.current) return; // 翻译进行中不保存，避免存到翻译前的旧值（同步拦截竞态）
    setSaving(true);
    // 双语：同时保存中文 prompt 与英文 promptEn，避免改了中文而英文残留旧版（Codex P2）。
    if (shot.promptEn !== undefined) {
      const updated: Shot = { ...shot, prompt: draft, promptEn: draftEn, editedByUser: true };
      const r = await replaceShot(shot.id, updated);
      setSaving(false);
      if (!r.ok) {
        setNotice(r.error.message);
        return;
      }
      onShotChanged(updated);
    } else {
      const r = await updateShotPrompt(shot.id, draft);
      setSaving(false);
      if (!r.ok) {
        setNotice(r.error.message);
        return;
      }
      onShotChanged({ ...shot, prompt: draft, editedByUser: true });
    }
    setEditing(false);
    setNotice(null);
  }

  function onCancel() {
    setDraft(shot.prompt);
    setDraftEn(shot.promptEn ?? '');
    setEditing(false);
    setNotice(null);
  }

  function onEdit() {
    setDraft(shot.prompt);
    setDraftEn(shot.promptEn ?? '');
    setNotice(null);
    setEditing(true);
  }

  async function onCopy(text: string) {
    const r = await copyToClipboard(text);
    if (r.ok) {
      setNotice('已复制到剪贴板');
      window.setTimeout(() => setNotice((n) => (n === '已复制到剪贴板' ? null : n)), 2000);
    } else {
      setNotice(r.error.message);
    }
  }

  // 单镜头重写（regenerate / feedback / params）：成功后压入撤销栈、落库、上提。复用同一路径。
  async function doRewrite(
    mode: RewriteMode,
    paramOverrides?: Partial<Pick<Shot, 'shotSize' | 'cameraMovement' | 'durationSuggestion'>>,
  ) {
    if (busy || rewritingRef.current || undoingRef.current) return; // 同步拦截重入
    rewritingRef.current = true;
    setRewriting(true);
    setNotice(null);
    try {
      const apiKey = persistApiKey ? undefined : tempKey.trim() || undefined;
      const r = await rewriteShot({
        project,
        shotId: shot.id,
        mode,
        feedback: mode === 'feedback' ? feedback : undefined,
        paramOverrides,
        apiKey,
      });
      if (r.ok) {
        const prev = shot;
        const saved = await replaceShot(shot.id, r.data);
        if (!saved.ok) {
          setNotice(saved.error.message);
          return;
        }
        setHistory((h) => [...h, prev].slice(-UNDO_MAX));
        onShotChanged(r.data);
        if (mode === 'feedback') setFeedback('');
      } else {
        setNotice(r.error.message);
      }
    } finally {
      if (!persistApiKey) setTempKey(''); // 一次性 Key 用完即弃，异常路径也清（Codex P3）
      rewritingRef.current = false;
      setRewriting(false);
    }
  }

  async function onUndo() {
    if (undoingRef.current || rewritingRef.current || history.length === 0) return; // 同步拦截重入
    undoingRef.current = true;
    try {
      const prev = history[history.length - 1];
      const saved = await replaceShot(shot.id, prev);
      if (!saved.ok) {
        setNotice(saved.error.message);
        return;
      }
      setHistory((h) => h.slice(0, -1));
      onShotChanged(prev);
      setNotice('已撤销到上一版');
    } finally {
      undoingRef.current = false;
    }
  }

  // #32：改某参数 → 带齐三参数（改的用新值，其余保当前以锁住未改参数）走 params 模式重写。
  function changeParam(
    field: 'shotSize' | 'cameraMovement' | 'durationSuggestion',
    value: string,
  ) {
    if (value === shot[field]) return;
    void doRewrite('params', {
      shotSize: field === 'shotSize' ? value : shot.shotSize,
      cameraMovement: field === 'cameraMovement' ? value : shot.cameraMovement,
      durationSuggestion: field === 'durationSuggestion' ? value : shot.durationSuggestion,
    });
  }

  // 首帧图像提示词：按需生成（注入锁定角色 + 全局风格），落库后回传更新后的镜头。
  async function onGenerateFirstFrame() {
    if (busy || firstFramingRef.current) return;
    firstFramingRef.current = true;
    setFirstFraming(true);
    setNotice(null);
    try {
      const apiKey = persistApiKey ? undefined : tempKey.trim() || undefined;
      const r = await generateFirstFrame({
        shot,
        characters: project.characters,
        globalStyle: project.globalStyle,
        lang: project.params.outputLanguage,
        apiKey,
      });
      if (!r.ok) {
        setNotice(r.error.message);
        return;
      }
      const save = await updateShotFirstFrame(shot.id, r.data);
      if (save.ok && save.data) {
        const updated = save.data.shots.find((s) => s.id === shot.id);
        if (updated) onShotChanged(updated);
      } else if (!save.ok) {
        setNotice(save.error.message);
      }
    } finally {
      if (!persistApiKey) setTempKey('');
      firstFramingRef.current = false;
      setFirstFraming(false);
    }
  }

  // 双语：编辑某一边失焦 → 自动翻译另一边（Issue #53）。失败不覆盖任一框，仅提示重试。
  async function onTranslate(from: 'zh' | 'en') {
    if (shot.promptEn === undefined || !autoSync || busy || translatingRef.current) return;
    const text = from === 'zh' ? draft : draftEn;
    if (!text.trim()) return;
    const target: 'zh' | 'en' = from === 'zh' ? 'en' : 'zh';
    translatingRef.current = true;
    setTranslating(target);
    setNotice(null);
    try {
      const apiKey = persistApiKey ? undefined : tempKey.trim() || undefined;
      const r = await translateText({ text, targetLang: target, apiKey });
      if (r.ok) {
        if (target === 'en') setDraftEn(r.data);
        else setDraft(r.data);
      } else {
        setNotice(`翻译失败，可重试：${r.error.message}`);
      }
    } finally {
      translatingRef.current = false;
      setTranslating(null);
    }
  }

  async function onCopyFirstFrame(text: string) {
    const r = await copyToClipboard(text);
    setNotice(r.ok ? '首帧提示词已复制' : r.error.message);
  }

  const disabled = busy || rewriting;
  const lang = project.params.outputLanguage;

  return (
    <div className="rounded border border-gray-200 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500">
          镜头 {shot.index}
          {shot.editedByUser && <span className="ml-1 text-amber-600">（已编辑）</span>}
        </span>
        <div className="flex gap-2">
          {shot.promptEn ? (
            <>
              <button type="button" onClick={() => onCopy(shot.prompt)} className="text-xs text-blue-600 hover:underline">
                复制中文
              </button>
              <button type="button" onClick={() => onCopy(shot.promptEn ?? '')} className="text-xs text-blue-600 hover:underline">
                复制英文
              </button>
            </>
          ) : (
            <button type="button" onClick={() => onCopy(shot.prompt)} className="text-xs text-blue-600 hover:underline">
              复制
            </button>
          )}
          {!editing && (
            <button type="button" onClick={onEdit} className="text-xs text-blue-600 hover:underline">
              编辑
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete} className="text-xs text-red-600 hover:underline">
              删除
            </button>
          )}
        </div>
      </div>

      <p className="text-sm font-medium">{shot.summary}</p>
      {/* #32：景别/运镜/时长可调下拉，改后自动重写该镜头提示词 */}
      <div className="mt-1 grid grid-cols-3 gap-1 text-xs text-gray-500">
        <label className="flex flex-col gap-0.5">
          景别
          <select
            className="rounded border border-gray-300 p-1 text-xs disabled:opacity-50"
            value={shot.shotSize}
            disabled={disabled || editing}
            onChange={(e) => changeParam('shotSize', e.target.value)}
          >
            {withCurrent(shotSizeOptions(lang), shot.shotSize).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          运镜
          <select
            className="rounded border border-gray-300 p-1 text-xs disabled:opacity-50"
            value={shot.cameraMovement}
            disabled={disabled || editing}
            onChange={(e) => changeParam('cameraMovement', e.target.value)}
          >
            {withCurrent(cameraMovementOptions(lang), shot.cameraMovement).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          时长
          <select
            className="rounded border border-gray-300 p-1 text-xs disabled:opacity-50"
            value={shot.durationSuggestion}
            disabled={disabled || editing}
            onChange={(e) => changeParam('durationSuggestion', e.target.value)}
          >
            {withCurrent(DURATION_OPTIONS, shot.durationSuggestion).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      </div>

      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          {shot.promptEn !== undefined && (
            <label className="flex items-center gap-1 text-[11px] text-gray-600">
              <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} />
              编辑后自动翻译同步另一语言（默认关，避免误触消耗额度）
              {translating && <span className="text-blue-600">翻译中…</span>}
            </label>
          )}
          {shot.promptEn !== undefined && (
            <span className="text-[11px] font-medium text-gray-500">中文</span>
          )}
          <textarea
            className="min-h-[120px] w-full resize-y rounded border border-gray-300 p-2 text-xs outline-none focus:border-blue-500"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void onTranslate('zh')}
          />
          {shot.promptEn !== undefined && (
            <>
              <span className="text-[11px] font-medium text-gray-500">English</span>
              <textarea
                className="min-h-[120px] w-full resize-y rounded border border-gray-300 p-2 text-xs outline-none focus:border-blue-500"
                value={draftEn}
                onChange={(e) => setDraftEn(e.target.value)}
                onBlur={() => void onTranslate('en')}
              />
            </>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={saving || translating !== null}
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
      ) : shot.promptEn ? (
        <div className="mt-2 flex flex-col gap-2">
          <div>
            <span className="text-[11px] font-medium text-gray-500">中文</span>
            <pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-2 text-xs text-gray-800">
              {shot.prompt}
            </pre>
          </div>
          <div>
            <span className="text-[11px] font-medium text-gray-500">English</span>
            <pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-2 text-xs text-gray-800">
              {shot.promptEn}
            </pre>
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
          {!persistApiKey && (
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

      {/* 首帧图像提示词（Issue #57）：按需生成（默认不生成，省额度），注入锁定角色 + 全局风格 */}
      {!editing && (
        <div className="mt-2 flex flex-col gap-1 border-t border-gray-100 pt-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-gray-500">首帧图像提示词</span>
            <button
              type="button"
              onClick={onGenerateFirstFrame}
              disabled={busy || firstFraming}
              className="rounded border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-gray-50 disabled:opacity-50"
            >
              {firstFraming ? '生成中…' : shot.firstFramePrompt ? '重新生成' : '生成首帧'}
            </button>
            {shot.firstFramePrompt && (
              <button
                type="button"
                onClick={() => onCopyFirstFrame(shot.firstFramePrompt ?? '')}
                className="text-[11px] text-blue-600 hover:underline"
              >
                复制中文
              </button>
            )}
            {shot.firstFramePromptEn && (
              <button
                type="button"
                onClick={() => onCopyFirstFrame(shot.firstFramePromptEn ?? '')}
                className="text-[11px] text-blue-600 hover:underline"
              >
                复制英文
              </button>
            )}
          </div>
          {shot.firstFramePrompt && (
            <pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-2 text-[11px] text-gray-700">
              {shot.firstFramePrompt}
              {shot.firstFramePromptEn ? `\n\n[EN] ${shot.firstFramePromptEn}` : ''}
            </pre>
          )}
        </div>
      )}

      {notice && <p className="mt-1 text-xs text-gray-600">{notice}</p>}
    </div>
  );
}

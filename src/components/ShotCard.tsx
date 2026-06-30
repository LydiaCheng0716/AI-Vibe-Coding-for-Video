import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Project, Shot } from '../core/models';
import { rewriteShot, generateFirstFrame, translateText } from '../services/generation';
import type { RewriteMode } from '../prompts/rewrite';
import { copyToClipboard } from '../services/clipboard';
import { shotSizeOptions, cameraMovementOptions, DURATION_OPTIONS, withCurrent } from '../core/shotParams';
import { shotDurationLine } from '../core/export';
import { useProjectStore } from '../sidepanel/projectStore';
import { OneTimeKeyInput, useOneTimeKey } from './OneTimeKeyInput';
import { getSettings, updateSettings } from '../services/storage';
import { useT } from '../i18n';

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
  /** 删除本镜头（Issue #56；确认由父级处理）。 */
  onDelete?: () => void;
}

interface CopyIconButtonProps {
  text: string;
  label: string;
  title: string;
  copiedTitle: string;
  className?: string;
  children?: ReactNode;
  onCopied?: () => void;
  onError: (message: string) => void;
}

function CopyIconButton({
  text,
  label,
  title,
  copiedTitle,
  className = '',
  children,
  onCopied,
  onError,
}: CopyIconButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function onClick() {
    const r = await copyToClipboard(text);
    if (!r.ok) {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      setCopied(false);
      onError(r.error.message);
      return;
    }
    onCopied?.();
    setCopied(true);
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={copied ? copiedTitle : title}
      onClick={() => void onClick()}
      className={`inline-flex h-7 min-w-7 items-center justify-center rounded border border-gray-200 bg-white/95 px-1.5 text-[11px] text-gray-600 shadow-sm hover:border-blue-300 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200 ${className}`}
    >
      {copied ? (
        <span className="whitespace-nowrap text-green-700">{copiedTitle}</span>
      ) : (
        children ?? (
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
            <path
              d="M7 6.5A1.5 1.5 0 0 1 8.5 5h6A1.5 1.5 0 0 1 16 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 7 14.5v-8Z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M4 11.5v-6A1.5 1.5 0 0 1 5.5 4h6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        )
      )}
    </button>
  );
}

function PromptCopyBox({
  copyText,
  label,
  title,
  copiedTitle,
  onError,
  onCopied,
  className = '',
  children,
}: {
  copyText: string;
  label: string;
  title: string;
  copiedTitle: string;
  onError: (message: string) => void;
  onCopied: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`relative ${className}`}>
      <CopyIconButton
        text={copyText}
        label={label}
        title={title}
        copiedTitle={copiedTitle}
        onError={onError}
        onCopied={onCopied}
        className="absolute right-1.5 top-1.5 z-10"
      />
      {children}
    </div>
  );
}

function buildShotCopyText({
  shot,
  title,
  prompt,
  promptEn,
  outputLanguage,
}: {
  shot: Shot;
  title: string;
  prompt: string;
  promptEn?: string;
  outputLanguage: Project['params']['outputLanguage'];
}) {
  const dur = shot.durationSuggestion;
  const sections: string[][] = [[title]];
  // 主语言段（单语项目按 outputLanguage；双语项目主段恒为中文）：时长标注跟随该段语言（#105）。
  const primaryIsEn = !(shot.promptEn !== undefined || outputLanguage !== 'en');
  const primaryLabel = primaryIsEn ? '[EN]' : '[ZH]';
  sections.push([primaryLabel, shotDurationLine(dur, primaryIsEn ? 'en' : 'zh'), prompt]);
  if (shot.promptEn !== undefined) sections.push(['[EN]', shotDurationLine(dur, 'en'), promptEn ?? '']);
  if (shot.firstFramePrompt) sections.push(['[First Frame ZH]', shot.firstFramePrompt]);
  if (shot.firstFramePromptEn) sections.push(['[First Frame EN]', shot.firstFramePromptEn]);
  return sections.map((section) => section.join('\n')).join('\n\n');
}

export default function ShotCard({ shot, project, busy, persistApiKey, onDelete }: Props) {
  const t = useT();
  const { updateShotPrompt, replaceShot, updateShotFirstFrame } = useProjectStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(shot.prompt);
  const [draftEn, setDraftEn] = useState(shot.promptEn ?? ''); // 双语英文版编辑草稿（Issue #41）
  // 双语自动翻译同步（Issue #53）：默认关，避免误触翻译消耗额度。
  const [autoSync, setAutoSync] = useState(false);
  const autoSyncDirtyRef = useRef(false);
  const [translating, setTranslating] = useState<'zh' | 'en' | null>(null);
  const translatingRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 单镜头迭代（Issue #30）
  const [feedback, setFeedback] = useState('');
  const [rewriting, setRewriting] = useState(false);
  const [history, setHistory] = useState<Shot[]>([]); // 撤销栈：每次重写前压入旧版
  const oneTimeKey = useOneTimeKey({ persistApiKey });
  // 同步重入保护：快速连点时 state 快照会滞后，用 ref 在事件起点同步拦截（Kimi P2）。
  const rewritingRef = useRef(false);
  const undoingRef = useRef(false);
  // 首帧图像提示词（Issue #57，按需生成）
  const [firstFraming, setFirstFraming] = useState(false);
  const firstFramingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    getSettings()
      .then((settings) => {
        if (alive && !autoSyncDirtyRef.current) setAutoSync(settings.autoTranslateSync ?? false);
      })
      .catch(() => {
        /* 读取失败沿用默认关闭，避免误触消耗额度。 */
      });
    return () => {
      alive = false;
    };
  }, []);

  async function onAutoSyncChange(checked: boolean) {
    autoSyncDirtyRef.current = true;
    setAutoSync(checked);
    // 串行化 RMW，避免与其它偏好并发写交错丢更新（Kimi P2）。
    const saved = await updateSettings({ autoTranslateSync: checked });
    if (!saved.ok) setNotice(saved.error.message);
  }

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
    } else {
      const r = await updateShotPrompt(shot.id, draft);
      setSaving(false);
      if (!r.ok) {
        setNotice(r.error.message);
        return;
      }
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
      const r = await rewriteShot({
        project,
        shotId: shot.id,
        mode,
        feedback: mode === 'feedback' ? feedback : undefined,
        paramOverrides,
        apiKey: oneTimeKey.apiKey,
      });
      if (r.ok) {
        const prev = shot;
        const saved = await replaceShot(shot.id, r.data);
        if (!saved.ok) {
          setNotice(saved.error.message);
          return;
        }
        setHistory((h) => [...h, prev].slice(-UNDO_MAX));
        if (mode === 'feedback') setFeedback('');
      } else {
        setNotice(r.error.message);
      }
    } finally {
      if (!oneTimeKey.persistApiKey) oneTimeKey.clear(); // 一次性 Key 用完即弃，异常路径也清（Codex P3）
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
      setNotice(t('shotCard.undoRewriteDone'));
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
      const r = await generateFirstFrame({
        shot,
        characters: project.characters,
        globalStyle: project.globalStyle,
        lang: project.params.outputLanguage,
        apiKey: oneTimeKey.apiKey,
      });
      if (!r.ok) {
        setNotice(r.error.message);
        return;
      }
      const save = await updateShotFirstFrame(shot.id, r.data);
      if (!save.ok) {
        setNotice(save.error.message);
      }
    } finally {
      if (!oneTimeKey.persistApiKey) oneTimeKey.clear();
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
    const before = target === 'en' ? draftEn : draft; // 目标框翻译前快照
    translatingRef.current = true;
    setTranslating(target);
    setNotice(null);
    try {
      const r = await translateText({ text, targetLang: target, apiKey: oneTimeKey.apiKey });
      if (r.ok) {
        // 仅当目标框自请求发起后未被用户改动时才写入，避免覆盖用户在途编辑（Codex P2）。
        if (target === 'en') setDraftEn((cur) => (cur === before ? r.data : cur));
        else setDraft((cur) => (cur === before ? r.data : cur));
      } else {
        setNotice(t('shotCard.translateFailed', { message: r.error.message }));
      }
    } finally {
      if (!oneTimeKey.persistApiKey) oneTimeKey.clear();
      translatingRef.current = false;
      setTranslating(null);
    }
  }

  const disabled = busy || rewriting;
  const lang = project.params.outputLanguage;
  const copyTitle = t('shotCard.copyTooltip');
  const copiedTitle = t('shotCard.copiedInline');
  const clearCopyNotice = () => setNotice(null);
  const showCopyError = (message: string) => setNotice(message);
  // 单语复制：在提示词前带上该镜头时长，跟随该框语言，与导出口径一致（#105）。
  // 主框语言：双语项目主框恒中文；单语项目按 outputLanguage。
  const primaryCopyLang: 'zh' | 'en' = shot.promptEn !== undefined ? 'zh' : lang === 'en' ? 'en' : 'zh';
  const withDuration = (copyLang: 'zh' | 'en', text: string) =>
    `${shotDurationLine(shot.durationSuggestion, copyLang)}\n${text}`;
  const fullCopyText = buildShotCopyText({
    shot,
    title: t('shotCard.title', { index: shot.index }),
    prompt: editing ? draft : shot.prompt,
    promptEn: editing ? draftEn : shot.promptEn,
    outputLanguage: lang,
  });

  return (
    <div data-testid="shot-card" className="rounded border border-gray-200 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500">
          {t('shotCard.title', { index: shot.index })}
          {shot.editedByUser && <span className="ml-1 text-amber-600">{t('shotCard.edited')}</span>}
        </span>
        <div className="flex gap-2">
          <CopyIconButton
            text={fullCopyText}
            label={t('shotCard.copyFullAria', { index: shot.index })}
            title={copyTitle}
            copiedTitle={t('shotCard.copyFullCopied')}
            onError={showCopyError}
            onCopied={clearCopyNotice}
            className="h-auto min-w-0 px-2 py-1 text-xs shadow-none"
          >
            {t('shotCard.copyFull')}
          </CopyIconButton>
          {!editing && (
            <button
              type="button"
              data-testid="shot-edit"
              aria-label={t('shotCard.editAria', { index: shot.index })}
              onClick={onEdit}
              className="text-xs text-blue-600 hover:underline"
            >
              {t('shotCard.edit')}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              aria-label={t('shotCard.deleteAria', { index: shot.index })}
              onClick={onDelete}
              className="text-xs text-red-600 hover:underline"
            >
              {t('common.delete')}
            </button>
          )}
        </div>
      </div>

      <p className="text-sm font-medium">{shot.summary}</p>
      {/* #32：景别/运镜/时长可调下拉，改后自动重写该镜头提示词 */}
      <div className="mt-1 grid grid-cols-3 gap-1 text-xs text-gray-500">
        <label className="flex flex-col gap-0.5">
          {t('shotCard.shotSize')}
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
          {t('shotCard.cameraMovement')}
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
          {t('shotCard.duration')}
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
              <input type="checkbox" checked={autoSync} onChange={(e) => void onAutoSyncChange(e.target.checked)} />
              {t('shotCard.autoSync')}
              {translating && <span className="text-blue-600">{t('shotCard.translating')}</span>}
            </label>
          )}
          {shot.promptEn !== undefined && autoSync && (
            <OneTimeKeyInput
              oneTimeKey={oneTimeKey}
              aria-label={t('shotCard.autoTranslateKeyAria', { index: shot.index })}
              className="w-full rounded border border-amber-300 p-1 text-[11px] outline-none focus:border-amber-500"
              placeholder={t('shotCard.autoTranslateKeyPlaceholder')}
            />
          )}
          {shot.promptEn !== undefined && (
            <span className="text-[11px] font-medium text-gray-500">{t('common.zh')}</span>
          )}
          <PromptCopyBox
            copyText={withDuration(primaryCopyLang, draft)}
            label={
              shot.promptEn !== undefined
                ? t('shotCard.copyZhAria', { index: shot.index })
                : t('shotCard.copyAria', { index: shot.index })
            }
            title={copyTitle}
            copiedTitle={copiedTitle}
            onError={showCopyError}
            onCopied={clearCopyNotice}
          >
            <textarea
              data-testid="shot-edit-input"
              aria-label={t('shotCard.editZhAria', { index: shot.index })}
              className="min-h-[120px] w-full resize-y rounded border border-gray-300 p-2 pr-16 text-xs outline-none focus:border-blue-500"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void onTranslate('zh')}
            />
          </PromptCopyBox>
          {shot.promptEn !== undefined && (
            <>
              <span className="text-[11px] font-medium text-gray-500">{t('common.en')}</span>
              <PromptCopyBox
                copyText={withDuration('en', draftEn)}
                label={t('shotCard.copyEnAria', { index: shot.index })}
                title={copyTitle}
                copiedTitle={copiedTitle}
                onError={showCopyError}
                onCopied={clearCopyNotice}
              >
                <textarea
                  aria-label={t('shotCard.editEnAria', { index: shot.index })}
                  className="min-h-[120px] w-full resize-y rounded border border-gray-300 p-2 pr-16 text-xs outline-none focus:border-blue-500"
                  value={draftEn}
                  onChange={(e) => setDraftEn(e.target.value)}
                  onBlur={() => void onTranslate('en')}
                />
              </PromptCopyBox>
            </>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="shot-save"
              onClick={onSave}
              disabled={saving || translating !== null}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : shot.promptEn ? (
        <div className="mt-2 flex flex-col gap-2">
          <div>
            <span className="text-[11px] font-medium text-gray-500">{t('common.zh')}</span>
            <PromptCopyBox
              copyText={withDuration('zh', shot.prompt)}
              label={t('shotCard.copyZhAria', { index: shot.index })}
              title={copyTitle}
              copiedTitle={copiedTitle}
              onError={showCopyError}
              onCopied={clearCopyNotice}
            >
              <pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-2 pr-16 text-xs text-gray-800">
                {shot.prompt}
              </pre>
            </PromptCopyBox>
          </div>
          <div>
            <span className="text-[11px] font-medium text-gray-500">{t('common.en')}</span>
            <PromptCopyBox
              copyText={withDuration('en', shot.promptEn)}
              label={t('shotCard.copyEnAria', { index: shot.index })}
              title={copyTitle}
              copiedTitle={copiedTitle}
              onError={showCopyError}
              onCopied={clearCopyNotice}
            >
              <pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-2 pr-16 text-xs text-gray-800">
                {shot.promptEn}
              </pre>
            </PromptCopyBox>
          </div>
        </div>
      ) : (
        <PromptCopyBox
          copyText={withDuration(primaryCopyLang, shot.prompt)}
          label={t('shotCard.copyAria', { index: shot.index })}
          title={copyTitle}
          copiedTitle={copiedTitle}
          onError={showCopyError}
          onCopied={clearCopyNotice}
          className="mt-2"
        >
          <pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-2 pr-16 text-xs text-gray-800">
            {shot.prompt}
          </pre>
        </PromptCopyBox>
      )}

      {/* 单镜头迭代（Issue #30）：重新生成 / 反馈式优化 / 撤销 */}
      {!editing && (
        <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-2">
          <OneTimeKeyInput
            oneTimeKey={oneTimeKey}
            aria-label={t('shotCard.rewriteKeyAria', { index: shot.index })}
            className="w-full rounded border border-amber-300 p-1 text-xs outline-none focus:border-amber-500"
            placeholder={t('shotCard.rewriteKeyPlaceholder')}
          />
          <div className="flex items-center gap-2">
            <input
              aria-label={t('shotCard.feedbackAria', { index: shot.index })}
              className="flex-1 rounded border border-gray-300 p-1 text-xs outline-none focus:border-blue-500"
              placeholder={t('shotCard.feedbackPlaceholder')}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <button
              type="button"
              aria-label={t('shotCard.optimizeAria', { index: shot.index })}
              onClick={() => doRewrite('feedback')}
              disabled={disabled || !feedback.trim()}
              className="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {rewriting ? t('shotCard.optimizing') : t('shotCard.optimize')}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label={t('shotCard.regenerateAria', { index: shot.index })}
              onClick={() => doRewrite('regenerate')}
              disabled={disabled}
              className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
            >
              {rewriting ? t('common.generating') : t('common.regenerate')}
            </button>
            {history.length > 0 && (
              <button
                type="button"
                aria-label={t('shotCard.undoRewriteAria', { index: shot.index, n: history.length })}
                onClick={onUndo}
                disabled={disabled}
                className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
              >
                {t('shotList.undo', { n: history.length })}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 首帧图像提示词（Issue #57）：按需生成（默认不生成，省额度），注入锁定角色 + 全局风格 */}
      {!editing && (
        <div className="mt-2 flex flex-col gap-1 border-t border-gray-100 pt-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-gray-500">{t('shotCard.firstFrameTitle')}</span>
            <button
              type="button"
              aria-label={t('shotCard.firstFrameActionAria', {
                action: shot.firstFramePrompt ? t('common.regenerate') : t('common.generate'),
                index: shot.index,
              })}
              onClick={onGenerateFirstFrame}
              disabled={busy || firstFraming}
              className="rounded border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-gray-50 disabled:opacity-50"
            >
              {firstFraming ? t('common.generating') : shot.firstFramePrompt ? t('common.regenerate') : t('shotCard.generateFirstFrame')}
            </button>
          </div>
          {shot.firstFramePrompt && (
            <div className="flex flex-col gap-1">
              {shot.firstFramePromptEn && (
                <span className="text-[11px] font-medium text-gray-500">{t('common.zh')}</span>
              )}
              <PromptCopyBox
                copyText={shot.firstFramePrompt}
                label={t('shotCard.copyZhFirstFrameAria', { index: shot.index })}
                title={copyTitle}
                copiedTitle={copiedTitle}
                onError={showCopyError}
                onCopied={clearCopyNotice}
              >
                <pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-2 pr-16 text-[11px] text-gray-700">
                  {shot.firstFramePrompt}
                </pre>
              </PromptCopyBox>
            </div>
          )}
          {shot.firstFramePromptEn && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-gray-500">{t('common.en')}</span>
              <PromptCopyBox
                copyText={shot.firstFramePromptEn}
                label={t('shotCard.copyEnFirstFrameAria', { index: shot.index })}
                title={copyTitle}
                copiedTitle={copiedTitle}
                onError={showCopyError}
                onCopied={clearCopyNotice}
              >
                <pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-2 pr-16 text-[11px] text-gray-700">
                  {shot.firstFramePromptEn}
                </pre>
              </PromptCopyBox>
            </div>
          )}
        </div>
      )}

      {notice && <p className="mt-1 text-xs text-gray-600">{notice}</p>}
    </div>
  );
}

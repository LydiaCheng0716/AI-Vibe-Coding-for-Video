import { useEffect, useRef, useState } from 'react';
import type { Project } from '../core/models';
import { exportProject, EXPORT_META, type ExportFormat, type ExportPromptLang } from '../core/export';
import { copyToClipboard } from '../services/clipboard';
import { getSettings, updateSettings } from '../services/storage';

interface Props {
  project: Project | null;
}

const FORMATS: ExportFormat[] = ['markdown', 'json', 'plaintext', 'csv', 'platform'];
const PROMPT_LANGS: { value: ExportPromptLang; label: string }[] = [
  { value: 'both', label: '中英两版' },
  { value: 'zh', label: '仅中文' },
  { value: 'en', label: '仅英文' },
];

export default function ExportPanel({ project }: Props) {
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [promptLang, setPromptLang] = useState<ExportPromptLang>('both');
  const [notice, setNotice] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const prefsRef = useRef<{ format: ExportFormat; promptLang: ExportPromptLang }>({
    format: 'markdown',
    promptLang: 'both',
  });
  // 仅当项目含双语镜头时显示语言选择（Issue #41）。
  const bilingual = !!project?.shots?.some((s) => s.promptEn);

  useEffect(() => {
    let alive = true;
    getSettings()
      .then((settings) => {
        if (!alive || dirtyRef.current) return;
        const nextFormat = settings.exportFormat ?? 'markdown';
        const nextPromptLang = settings.exportPromptLang ?? 'both';
        prefsRef.current = { format: nextFormat, promptLang: nextPromptLang };
        setFormat(nextFormat);
        setPromptLang(nextPromptLang);
      })
      .catch(() => {
        /* 读取失败沿用默认导出偏好。 */
      });
    return () => {
      alive = false;
    };
  }, []);

  async function persistPrefs(next: { format: ExportFormat; promptLang: ExportPromptLang }) {
    // 串行化 RMW，失败要提示（Kimi P2）：避免并发交错丢更新、避免静默吞错。
    const saved = await updateSettings({
      exportFormat: next.format,
      exportPromptLang: next.promptLang,
    });
    if (!saved.ok) setNotice(saved.error.message);
  }

  function onFormatChange(value: ExportFormat) {
    dirtyRef.current = true;
    const next = { ...prefsRef.current, format: value };
    prefsRef.current = next;
    setFormat(value);
    void persistPrefs(next);
  }

  function onPromptLangChange(value: ExportPromptLang) {
    dirtyRef.current = true;
    const next = { ...prefsRef.current, promptLang: value };
    prefsRef.current = next;
    setPromptLang(value);
    void persistPrefs(next);
  }

  async function onCopy() {
    const r = exportProject(project, format, promptLang);
    if (!r.ok) return setNotice(r.error.message);
    const c = await copyToClipboard(r.data);
    setNotice(c.ok ? '已复制导出内容' : c.error.message);
  }

  // 一键复制全部提示词（平台排版，粘贴即用）。
  async function onCopyAllPrompts() {
    const r = exportProject(project, 'platform', promptLang);
    if (!r.ok) return setNotice(r.error.message);
    const c = await copyToClipboard(r.data);
    setNotice(c.ok ? '已复制全部提示词' : c.error.message);
  }

  function onDownload() {
    const r = exportProject(project, format, promptLang);
    if (!r.ok) return setNotice(r.error.message);
    const meta = EXPORT_META[format];
    const blob = new Blob([r.data], { type: meta.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storyboard.${meta.ext}`;
    document.body.appendChild(a);
    a.click();
    // 延迟回收：立即 revoke 在部分浏览器会中断下载（kimi MED）。
    window.setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 0);
    setNotice('已开始下载');
  }

  return (
    <div className="flex flex-col gap-2 border-t border-gray-200 p-3">
      <h2 className="text-sm font-semibold">导出</h2>
      <div className="flex items-center gap-2">
        <select
          value={format}
          onChange={(e) => onFormatChange(e.target.value as ExportFormat)}
          className="rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-blue-500"
        >
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {EXPORT_META[f].label}
            </option>
          ))}
        </select>
        {bilingual && (
          <select
            value={promptLang}
            onChange={(e) => onPromptLangChange(e.target.value as ExportPromptLang)}
            className="rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-blue-500"
          >
            {PROMPT_LANGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={onCopy}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          复制
        </button>
        <button
          type="button"
          onClick={onDownload}
          className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
        >
          下载
        </button>
      </div>
      <button
        type="button"
        onClick={onCopyAllPrompts}
        className="self-start rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
      >
        复制全部提示词
      </button>
      {notice && <p className="text-xs text-gray-600">{notice}</p>}
    </div>
  );
}

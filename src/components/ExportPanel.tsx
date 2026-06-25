import { useState } from 'react';
import type { Project } from '../core/models';
import { exportProject, EXPORT_META, type ExportFormat, type ExportPromptLang } from '../core/export';
import { copyToClipboard } from '../services/clipboard';

interface Props {
  project: Project | null;
}

const FORMATS: ExportFormat[] = ['markdown', 'json', 'plaintext'];
const PROMPT_LANGS: { value: ExportPromptLang; label: string }[] = [
  { value: 'both', label: '中英两版' },
  { value: 'zh', label: '仅中文' },
  { value: 'en', label: '仅英文' },
];

export default function ExportPanel({ project }: Props) {
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [promptLang, setPromptLang] = useState<ExportPromptLang>('both');
  const [notice, setNotice] = useState<string | null>(null);
  // 仅当项目含双语镜头时显示语言选择（Issue #41）。
  const bilingual = !!project?.shots?.some((s) => s.promptEn);

  async function onCopy() {
    const r = exportProject(project, format, promptLang);
    if (!r.ok) return setNotice(r.error.message);
    const c = await copyToClipboard(r.data);
    setNotice(c.ok ? '已复制导出内容' : c.error.message);
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
          onChange={(e) => setFormat(e.target.value as ExportFormat)}
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
            onChange={(e) => setPromptLang(e.target.value as ExportPromptLang)}
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
      {notice && <p className="text-xs text-gray-600">{notice}</p>}
    </div>
  );
}

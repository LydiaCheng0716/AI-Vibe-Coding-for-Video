import { useState } from 'react';
import type { Project } from '../core/models';
import { exportProject, EXPORT_META, type ExportFormat } from '../core/export';
import { copyToClipboard } from '../services/clipboard';

interface Props {
  project: Project | null;
}

const FORMATS: ExportFormat[] = ['markdown', 'json', 'plaintext'];

export default function ExportPanel({ project }: Props) {
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [notice, setNotice] = useState<string | null>(null);

  async function onCopy() {
    const r = exportProject(project, format);
    if (!r.ok) return setNotice(r.error.message);
    const c = await copyToClipboard(r.data);
    setNotice(c.ok ? '已复制导出内容' : c.error.message);
  }

  function onDownload() {
    const r = exportProject(project, format);
    if (!r.ok) return setNotice(r.error.message);
    const meta = EXPORT_META[format];
    const blob = new Blob([r.data], { type: meta.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storyboard.${meta.ext}`;
    a.click();
    URL.revokeObjectURL(url);
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

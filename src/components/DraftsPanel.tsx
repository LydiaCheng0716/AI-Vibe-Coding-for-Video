import { useEffect, useState } from 'react';
import type { Project } from '../core/models';
import {
  saveProjectDraft,
  listProjectDrafts,
  openProjectDraft,
  removeProjectDraft,
  type ProjectDraftItem,
} from '../services/projectDrafts';
import { useProjectStore } from '../sidepanel/projectStore';
import { useT } from '../i18n';

interface Props {
  /** 当前项目（可保存为草稿）。 */
  project: Project | null;
}

export default function DraftsPanel({ project }: Props) {
  const t = useT();
  const [drafts, setDrafts] = useState<ProjectDraftItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { replaceProject } = useProjectStore();

  async function reload() {
    try {
      setDrafts(await listProjectDrafts());
    } catch {
      setNotice(t('drafts.loadFailed'));
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function onSave() {
    if (!project) return;
    const r = await saveProjectDraft(project);
    if (r.ok) {
      setNotice(t('drafts.saved'));
      await reload();
    } else {
      setNotice(r.error.message);
    }
  }

  async function onOpenDraft(id: string) {
    const p = await openProjectDraft(id);
    if (!p) {
      setNotice(t('drafts.missing'));
      await reload();
      return;
    }
    const switched = await replaceProject(p);
    setNotice(switched.ok ? t('drafts.opened') : t('drafts.openFailed', { message: switched.error.message }));
  }

  async function onDelete(id: string) {
    const r = await removeProjectDraft(id);
    if (r.ok) await reload();
    else setNotice(r.error.message);
  }

  return (
    <section className="flex flex-col gap-2 border-t border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-sm font-semibold"
          aria-expanded={open}
        >
          {t('drafts.title', { n: drafts.length })}{open ? ' ▾' : ' ▸'}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!project}
          className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          {t('drafts.saveCurrent')}
        </button>
      </div>
      {open && (
        <>
          {drafts.length === 0 ? (
            <p className="text-[11px] text-gray-400">{t('drafts.empty')}</p>
          ) : (
            drafts.map((d) => (
              <div key={d.id} className="flex items-center gap-2 rounded border border-gray-100 p-1.5">
                <p className="min-w-0 flex-1 truncate text-xs">{d.title}</p>
                <button
                  type="button"
                  onClick={() => onOpenDraft(d.id)}
                  className="shrink-0 rounded bg-blue-600 px-2 py-0.5 text-[11px] text-white hover:bg-blue-700"
                >
                  {t('drafts.open')}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(d.id)}
                  className="shrink-0 rounded border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-gray-50"
                >
                  {t('common.delete')}
                </button>
              </div>
            ))
          )}
        </>
      )}
      {notice && <p className="text-[11px] text-gray-600">{notice}</p>}
    </section>
  );
}

// 历史/草稿库（Issue #35）：把生成过的分镜整单存为本地草稿，可列出/打开/删除。
// 建于通用集合抽象之上（与 #40 角色库共用 services/collections，无第二套存储实现）。
// 隐私（ARCH-LOW-002）：Project 不含任何凭据（API Key / baseUrl 在 settings/keyVault，不在 Project）。
import { createLocalCollection, type CollectionRecord } from './collections';
import { STORAGE_KEYS } from '../core/config';
import { normalizeProject } from '../core/migrations';
import type { Project, Result } from '../core/models';

export interface ProjectDraftItem extends CollectionRecord {
  title: string;
  project: Project;
}

/** 从故事首句生成默认标题。 */
function autoTitle(project: Project): string {
  const s = (project.story ?? '').trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, 24) : '未命名草稿';
}

// 读时归一（Issue #73）：把草稿内嵌的 Project 经 normalizeProject 兜底；project 无法归一则丢弃该草稿。
function normalizeDraft(raw: unknown): ProjectDraftItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ProjectDraftItem> & { project?: unknown };
  const project = normalizeProject(r.project);
  if (!project) return null;
  return {
    ...(raw as ProjectDraftItem),
    title: typeof r.title === 'string' && r.title ? r.title : autoTitle(project),
    project,
  };
}

const collection = createLocalCollection<ProjectDraftItem>(STORAGE_KEYS.projectDrafts, {
  normalize: normalizeDraft,
});

export function saveProjectDraft(project: Project, title?: string): Promise<Result<ProjectDraftItem>> {
  const t = (title ?? '').trim() || autoTitle(project);
  return collection.add({ title: t, project });
}

export function listProjectDrafts(): Promise<ProjectDraftItem[]> {
  return collection.list();
}

/** 打开草稿：取完整 Project（含 shots/characters/bgm 全部编辑内容）。无匹配 → null。 */
export async function openProjectDraft(id: string): Promise<Project | null> {
  const items = await collection.list();
  return items.find((it) => it.id === id)?.project ?? null;
}

export function removeProjectDraft(id: string): Promise<Result<void>> {
  return collection.remove(id);
}

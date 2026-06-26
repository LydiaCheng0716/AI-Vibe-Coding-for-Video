import { SCHEMA_VERSION } from './config';
import { defaultParams } from './defaults';
import type { Project } from './models';

type MutableProject = Record<string, unknown>;
type Migration = (project: MutableProject) => MutableProject;

// 迁移注册表：内部 Map，不直接导出可写对象，避免运行时/测试意外改写导致行为不确定（Kimi P2）。
// 通过 registerMigration 注册，重复注册同版本会抛错（防静默覆盖）。
const registry = new Map<number, Migration>();

/** 注册一个把 vN→vN+1 的迁移。重复注册同一版本会抛错。 */
export function registerMigration(version: number, fn: Migration): void {
  if (registry.has(version)) {
    throw new Error(`重复注册 schema 迁移：v${version}`);
  }
  registry.set(version, fn);
}

/** 移除已注册迁移（仅供迁移管理/测试；生产代码不应调用）。 */
export function unregisterMigration(version: number): void {
  registry.delete(version);
}

function isPlainRecord(value: unknown): value is MutableProject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function storedVersionOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function normalizeStoredProject(project: MutableProject, schemaVersion: number): Project {
  const params = isPlainRecord(project.params) ? project.params : {};

  return {
    ...project,
    schemaVersion,
    story: typeof project.story === 'string' ? project.story : '',
    params: { ...defaultParams(), ...params },
    // 过滤数组里的非对象脏项，避免坏元素传到消费方崩溃（Kimi minor）。
    characters: Array.isArray(project.characters) ? project.characters.filter(isPlainRecord) : [],
    shots: Array.isArray(project.shots) ? project.shots.filter(isPlainRecord) : [],
  } as unknown as Project;
}

export function normalizeProject(raw: unknown): Project | null {
  if (!isPlainRecord(raw)) return null;

  let project: MutableProject = { ...raw };
  const storedVersion = storedVersionOf(project.schemaVersion);

  if (storedVersion <= SCHEMA_VERSION) {
    // 缺失迁移按「加法式兼容（identity）」处理：历史/旧版本仅新增 optional 字段，
    // 由 normalizeStoredProject 补默认即可，无需逐版本迁移函数。
    // **破坏性变更必须 registerMigration**（并由测试守护），否则数据会被补默认后照常归一。
    for (let version = storedVersion; version < SCHEMA_VERSION; version += 1) {
      const migrate = registry.get(version);
      if (migrate) project = migrate({ ...project });
    }
    return normalizeStoredProject(project, SCHEMA_VERSION);
  }

  return normalizeStoredProject(project, storedVersion);
}

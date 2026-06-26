import { SCHEMA_VERSION } from './config';
import { defaultParams } from './defaults';
import type { Project } from './models';

type MutableProject = Record<string, unknown>;

export const migrations: Record<number, (p: MutableProject) => MutableProject> = {};

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
    characters: Array.isArray(project.characters) ? project.characters : [],
    shots: Array.isArray(project.shots) ? project.shots : [],
  } as Project;
}

export function normalizeProject(raw: unknown): Project | null {
  if (!isPlainRecord(raw)) return null;

  let project: MutableProject = { ...raw };
  const storedVersion = storedVersionOf(project.schemaVersion);

  if (storedVersion <= SCHEMA_VERSION) {
    for (let version = storedVersion; version < SCHEMA_VERSION; version += 1) {
      const migrate = migrations[version];
      if (migrate) project = migrate({ ...project });
    }
    return normalizeStoredProject(project, SCHEMA_VERSION);
  }

  return normalizeStoredProject(project, storedVersion);
}

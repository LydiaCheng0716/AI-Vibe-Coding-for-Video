import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { BgmPrompt, Character, GlobalStyle, Project, Result, Shot, Transition } from '../core/models';
import {
  addCharacter as storageAddCharacter,
  getCurrentProject,
  replaceShot as storageReplaceShot,
  saveCurrentProject,
  setShots as storageSetShots,
  updateCharacter as storageUpdateCharacter,
  removeCharacter as storageRemoveCharacter,
  restoreCharacter as storageRestoreCharacter,
  updateCurrentProjectBgm,
  updateGlobalStyle as storageUpdateGlobalStyle,
  updateShotFirstFrame as storageUpdateShotFirstFrame,
  updateShotPrompt as storageUpdateShotPrompt,
  updateShotTransition as storageUpdateShotTransition,
} from '../services/storage';
import { ok } from '../core/models';

export interface ProjectStoreState {
  project: Project | null;
  projectLoadVersion: number;
  error: string | null;
}

export interface ProjectStore {
  getState: () => ProjectStoreState;
  subscribe: (listener: () => void) => () => void;
  loadCurrentProject: () => Promise<void>;
  replaceProject: (project: Project) => Promise<Result<Project>>;
  updateShotPrompt: (shotId: string, prompt: string) => Promise<Result<Project | null>>;
  replaceShot: (shotId: string, shot: Shot) => Promise<Result<Project | null>>;
  setShots: (shots: Shot[]) => Promise<Result<Project | null>>;
  updateShotFirstFrame: (
    shotId: string,
    firstFrame: { firstFramePrompt: string; firstFramePromptEn?: string } | null,
  ) => Promise<Result<Project | null>>;
  updateShotTransition: (shotId: string, transition: Transition | null) => Promise<Result<Project | null>>;
  updateCharacter: (id: string, patch: Partial<Character>) => Promise<Result<Project | null>>;
  addCharacter: (input: Omit<Character, 'id'>) => Promise<Result<Character>>;
  removeCharacter: (id: string) => Promise<Result<Project | null>>;
  restoreCharacter: (character: Character, atIndex: number) => Promise<Result<Project | null>>;
  updateGlobalStyle: (patch: Partial<GlobalStyle>) => Promise<Result<Project | null>>;
  updateBgm: (bgm: BgmPrompt) => Promise<Result<Project | null>>;
}

const initialState: ProjectStoreState = {
  project: null,
  projectLoadVersion: 0,
  error: null,
};

export function createProjectStore(): ProjectStore {
  let state = initialState;
  let queue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();

  function emit() {
    for (const listener of listeners) listener();
  }

  function setState(patch: Partial<ProjectStoreState>) {
    state = { ...state, ...patch };
    emit();
  }

  function setError(message: string) {
    setState({ error: message });
  }

  async function publishPersistedProject(): Promise<Project | null> {
    const project = await getCurrentProject();
    setState({ project, error: null });
    return project;
  }

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = queue.then(work, work);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function mutateProject(
    work: () => Promise<Result<unknown>>,
  ): Promise<Result<Project | null>> {
    return enqueue(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error.message);
        return result;
      }
      const project = await publishPersistedProject();
      return ok(project);
    });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async loadCurrentProject() {
      await enqueue(async () => {
        try {
          await publishPersistedProject();
        } catch {
          setError('读取本地项目失败。');
        }
      });
    },
    replaceProject(project) {
      return enqueue(async () => {
        const saved = await saveCurrentProject(project);
        if (!saved.ok) {
          setError(saved.error.message);
          return saved;
        }
        const persisted = (await getCurrentProject()) ?? project;
        setState({
          project: persisted,
          projectLoadVersion: state.projectLoadVersion + 1,
          error: null,
        });
        return ok(persisted);
      });
    },
    updateShotPrompt(shotId, prompt) {
      return mutateProject(() => storageUpdateShotPrompt(shotId, prompt));
    },
    replaceShot(shotId, shot) {
      return mutateProject(() => storageReplaceShot(shotId, shot));
    },
    setShots(shots) {
      return mutateProject(() => storageSetShots(shots));
    },
    updateShotFirstFrame(shotId, firstFrame) {
      return mutateProject(() => storageUpdateShotFirstFrame(shotId, firstFrame));
    },
    updateShotTransition(shotId, transition) {
      return mutateProject(() => storageUpdateShotTransition(shotId, transition));
    },
    updateCharacter(id, patch) {
      return mutateProject(() => storageUpdateCharacter(id, patch));
    },
    addCharacter(input) {
      return enqueue(async () => {
        const result = await storageAddCharacter(input);
        if (!result.ok) {
          setError(result.error.message);
          return result;
        }
        await publishPersistedProject();
        return result;
      });
    },
    removeCharacter(id) {
      return mutateProject(() => storageRemoveCharacter(id));
    },
    restoreCharacter(character, atIndex) {
      return mutateProject(() => storageRestoreCharacter(character, atIndex));
    },
    updateGlobalStyle(patch) {
      return mutateProject(() => storageUpdateGlobalStyle(patch));
    },
    updateBgm(bgm) {
      return mutateProject(() => updateCurrentProjectBgm(bgm));
    },
  };
}

const ProjectStoreContext = createContext<ProjectStore | null>(null);

export function ProjectStoreProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => createProjectStore(), []);
  return <ProjectStoreContext.Provider value={store}>{children}</ProjectStoreContext.Provider>;
}

export function useProjectStore(): ProjectStoreState & ProjectStore {
  const store = useContext(ProjectStoreContext);
  if (!store) throw new Error('useProjectStore must be used inside ProjectStoreProvider');
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return { ...state, ...store };
}

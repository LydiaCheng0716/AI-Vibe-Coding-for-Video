// Storage Service（chrome.storage.local）：设置 / 草稿。对齐 api-spec 3.2。
// 所有写操作返回 Result<void>，写失败映射 STORAGE_WRITE_FAILED（ARCH-LOW-001），不静默丢数据。
import { STORAGE_KEYS, SCHEMA_VERSION } from '../core/config';
import {
  ok,
  err,
  type Result,
  type Settings,
  type Project,
  type BgmPrompt,
  type Character,
  type Shot,
  type GlobalStyle,
  type Transition,
} from '../core/models';
import { defaultSettings } from '../core/defaults';
import { normalizeProject } from '../core/migrations';
import { reinjectCharacterConsistency } from '../core/characters';
import { reinjectGlobalStyle } from '../core/style';
import { EXPORT_FORMATS, EXPORT_PROMPT_LANGS } from '../core/export';
import { normalizeUiLanguage } from '../i18n/language';

interface DraftRecord {
  text: string;
  updatedAt: number;
}

const WRITE_FAIL_MSG = '本地保存失败（可能空间不足），请重试。';

async function read<T>(key: string): Promise<T | undefined> {
  const got = await chrome.storage.local.get(key);
  return got[key] as T | undefined;
}

async function write(items: Record<string, unknown>): Promise<Result<void>> {
  try {
    await chrome.storage.local.set(items);
    return ok(undefined);
  } catch {
    return err('STORAGE_WRITE_FAILED', WRITE_FAIL_MSG);
  }
}

// ---- 草稿（TASK-001 草稿恢复）----

export async function saveDraft(text: string): Promise<Result<void>> {
  const record: DraftRecord = { text, updatedAt: Date.now() };
  return write({ [STORAGE_KEYS.draft]: record });
}

export async function getDraft(): Promise<string | null> {
  const record = await read<DraftRecord>(STORAGE_KEYS.draft);
  return record?.text ?? null;
}

export async function clearDraft(): Promise<Result<void>> {
  try {
    await chrome.storage.local.remove(STORAGE_KEYS.draft);
    return ok(undefined);
  } catch {
    return err('STORAGE_WRITE_FAILED', WRITE_FAIL_MSG);
  }
}

// ---- 设置（参数 + Provider）----

export async function getSettings(): Promise<Settings> {
  const stored = await read<Partial<Settings>>(STORAGE_KEYS.settings);
  const base = defaultSettings();
  if (!stored) return base;
  // 浅合并并补默认，保证缺字段不崩（迁移友好）。
  return {
    params: { ...base.params, ...stored.params },
    provider: { ...base.provider, ...stored.provider },
    uiLanguage: normalizeUiLanguage(stored.uiLanguage),
    persistApiKey: stored.persistApiKey ?? base.persistApiKey,
    autoTranslateSync: stored.autoTranslateSync ?? base.autoTranslateSync,
    exportFormat: EXPORT_FORMATS.includes(stored.exportFormat as (typeof EXPORT_FORMATS)[number])
      ? stored.exportFormat
      : base.exportFormat,
    exportPromptLang: EXPORT_PROMPT_LANGS.includes(stored.exportPromptLang as (typeof EXPORT_PROMPT_LANGS)[number])
      ? stored.exportPromptLang
      : base.exportPromptLang,
    schemaVersion: stored.schemaVersion ?? SCHEMA_VERSION,
  };
}

// 串行化设置「读-改-写」，避免多组件并发改不同偏好时互相覆盖（Kimi P2 RMW 竞态）。
let settingsChain: Promise<unknown> = Promise.resolve();
function withSettingsLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = settingsChain.then(fn, fn);
  settingsChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function saveSettings(settings: Settings): Promise<Result<void>> {
  return withSettingsLock(() =>
    write({ [STORAGE_KEYS.settings]: { ...settings, schemaVersion: SCHEMA_VERSION } }),
  );
}

/**
 * 局部更新设置：在锁内 read-modify-write，合并 patch 后整写。
 * 供 UI 偏好（导出格式/语言、自动翻译同步等）持久化，避免各自 getSettings→saveSettings 交错丢更新（Kimi P2）。
 */
export async function updateSettings(patch: Partial<Settings>): Promise<Result<void>> {
  return withSettingsLock(async () => {
    const current = await getSettings();
    return write({
      [STORAGE_KEYS.settings]: { ...current, ...patch, schemaVersion: SCHEMA_VERSION },
    });
  });
}

// ---- 当前分镜项目（TASK-003/004/005/006/007/008 共用）----

export async function getCurrentProject(): Promise<Project | null> {
  return normalizeProject(await read<unknown>(STORAGE_KEYS.currentProject));
}

// 串行化所有对 currentProject 的「读-改-写」与整写，避免并发保存互相覆盖（kimi HIGH：RMW 竞态）。
// 读操作（getCurrentProject）无需加锁。
let projectChain: Promise<unknown> = Promise.resolve();
function withProjectLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = projectChain.then(fn, fn);
  projectChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function doSaveProject(project: Project): Promise<Result<void>> {
  return write({ [STORAGE_KEYS.currentProject]: { ...project, schemaVersion: SCHEMA_VERSION } });
}

export async function saveCurrentProject(project: Project): Promise<Result<void>> {
  return withProjectLock(() => doSaveProject(project));
}

/**
 * 局部更新单个镜头提示词：仅改该镜头并置 editedByUser=true，其余镜头不变（api-spec §3.2 / TASK-006）。
 * 无当前项目或无匹配 shotId → 返回 ok（无副作用，不误改）。整个 RMW 在锁内串行，防并发覆盖。
 */
export async function updateShotPrompt(shotId: string, prompt: string): Promise<Result<void>> {
  return withProjectLock(async () => {
    const project = await getCurrentProject();
    if (!project) return ok(undefined);
    let hit = false;
    const shots = project.shots.map((s) => {
      if (s.id !== shotId) return s;
      hit = true;
      return { ...s, prompt, editedByUser: true };
    });
    if (!hit) return ok(undefined);
    return doSaveProject({ ...project, shots });
  });
}

/** 计算下一个不冲突的角色 id（c{N}）。 */
function nextCharacterId(characters: Character[]): string {
  let max = 0;
  for (const c of characters) {
    const m = c.id.match(/^c(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `c${max + 1}`;
}

/**
 * 调校/锁定某角色（Issue #29 B/C）：浅合并目标角色，其余不变；随后**重注入**刷新镜头锚点
 * （锁定/改档案即时反映到非编辑镜头、剥离旧锚点防残留）。返回更新后的 Project 供 UI 同步。
 * 无项目或无匹配 id → ok(null) 无副作用。整个 RMW 在锁内串行，防并发覆盖。
 */
export async function updateCharacter(
  id: string,
  patch: Partial<Character>,
): Promise<Result<Project | null>> {
  return withProjectLock(async () => {
    const project = await getCurrentProject();
    if (!project) return ok(null);
    let hit = false;
    const characters = project.characters.map((c) => {
      if (c.id !== id) return c;
      hit = true;
      return { ...c, ...patch };
    });
    if (!hit) return ok(null);
    // 角色重注入会剥离「角色块→prompt 末尾」（含其后的全局风格块），故随后再重注入全局风格，
    // 避免角色编辑悄悄抹掉锁定风格锚点（Codex P2）。
    const next = reinjectGlobalStyle(reinjectCharacterConsistency({ ...project, characters }));
    const saved = await doSaveProject(next);
    if (!saved.ok) return saved;
    return ok(next);
  });
}

/**
 * 调校/锁定全局风格（Issue #55）：合并 globalStyle.profile/suggestions/locked，随后重注入刷新镜头
 * 风格锚点（锁定/改风格即时反映、剥旧防残留）。返回更新后的 Project 供 UI 同步。
 * 无项目 → ok(null)。整个 RMW 在锁内串行。
 */
export async function updateGlobalStyle(
  patch: Partial<GlobalStyle>,
): Promise<Result<Project | null>> {
  return withProjectLock(async () => {
    const project = await getCurrentProject();
    if (!project) return ok(null);
    const prev: GlobalStyle = project.globalStyle ?? {
      profile: { colorGrade: '', lighting: '', lensFocal: '', filmTexture: '', mood: '' },
    };
    const globalStyle: GlobalStyle = {
      ...prev,
      ...patch,
      profile: { ...prev.profile, ...(patch.profile ?? {}) },
    };
    const next = reinjectGlobalStyle({ ...project, globalStyle });
    const saved = await doSaveProject(next);
    if (!saved.ok) return saved;
    return ok(next);
  });
}

/**
 * 手动新增角色（Issue #29 B）：分配不冲突 id 入库，返回新角色供 UI 同步。
 * 新角色未被任何镜头引用，不触发重注入。无项目 → 报错（需先生成分镜）。
 */
export async function addCharacter(input: Omit<Character, 'id'>): Promise<Result<Character>> {
  return withProjectLock(async () => {
    const project = await getCurrentProject();
    if (!project) return err('NO_GENERATION_INPUT', '请先生成分镜再新增角色。');
    const character: Character = { ...input, id: nextCharacterId(project.characters) };
    const saved = await doSaveProject({
      ...project,
      characters: [...project.characters, character],
    });
    if (!saved.ok) return saved;
    return ok(character);
  });
}

/**
 * 设置/清除某镜首帧图像提示词（Issue #57）：projectLock 内 RMW，传 null 清除。
 * 无项目/无匹配 → ok(null)。返回更新后 Project。
 */
export async function updateShotFirstFrame(
  shotId: string,
  firstFrame: { firstFramePrompt: string; firstFramePromptEn?: string } | null,
): Promise<Result<Project | null>> {
  return withProjectLock(async () => {
    const project = await getCurrentProject();
    if (!project) return ok(null);
    let hit = false;
    const shots = project.shots.map((s) => {
      if (s.id !== shotId) return s;
      hit = true;
      const { firstFramePrompt: _a, firstFramePromptEn: _b, ...rest } = s;
      if (!firstFrame) return rest;
      return {
        ...rest,
        firstFramePrompt: firstFrame.firstFramePrompt,
        ...(firstFrame.firstFramePromptEn ? { firstFramePromptEn: firstFrame.firstFramePromptEn } : {}),
      };
    });
    if (!hit) return ok(null);
    const next = { ...project, shots };
    const saved = await doSaveProject(next);
    if (!saved.ok) return saved;
    return ok(next);
  });
}

/**
 * 设置/清除某镜「→下一镜」转场（Issue #54）：projectLock 内 RMW，transition=null 清除。
 * 无项目/无匹配 → ok(null)。返回更新后 Project。
 */
export async function updateShotTransition(
  shotId: string,
  transition: Transition | null,
): Promise<Result<Project | null>> {
  return withProjectLock(async () => {
    const project = await getCurrentProject();
    if (!project) return ok(null);
    let hit = false;
    const shots = project.shots.map((s) => {
      if (s.id !== shotId) return s;
      hit = true;
      if (transition) return { ...s, transitionToNext: transition };
      const { transitionToNext: _drop, ...rest } = s;
      return rest;
    });
    if (!hit) return ok(null);
    const next = { ...project, shots };
    const saved = await doSaveProject(next);
    if (!saved.ok) return saved;
    return ok(next);
  });
}

/**
 * 整组替换镜头数组（Issue #56 增删/插入/拖拽排序/撤销）：projectLock 内整写 `project.shots`。
 * 调用方已用 `core/shotOps` 排好 index（撤销时原样还原，不二次重排）。无项目 → ok(null)。
 */
export async function setShots(shots: Shot[]): Promise<Result<Project | null>> {
  return withProjectLock(async () => {
    const project = await getCurrentProject();
    if (!project) return ok(null);
    const next = { ...project, shots };
    const saved = await doSaveProject(next);
    if (!saved.ok) return saved;
    return ok(next);
  });
}

/**
 * 整条替换某镜头（Issue #30/#32 单镜头重写落库）：projectLock 内 RMW，按 id 替换，
 * **保留原 id/index**，其余镜头不变。无项目/无匹配 → ok 无副作用。
 */
export async function replaceShot(shotId: string, shot: Shot): Promise<Result<void>> {
  return withProjectLock(async () => {
    const project = await getCurrentProject();
    if (!project) return ok(undefined);
    let hit = false;
    const shots = project.shots.map((s) => {
      if (s.id !== shotId) return s;
      hit = true;
      return { ...shot, id: s.id, index: s.index };
    });
    if (!hit) return ok(undefined);
    return doSaveProject({ ...project, shots });
  });
}

/**
 * 把生成好的 BGM 写回当前项目（api-spec §3.2 / TASK-007）。无当前项目 → ok 无副作用。
 * 走 projectLock，与镜头更新串行，防并发覆盖。
 */
export async function updateCurrentProjectBgm(bgm: BgmPrompt): Promise<Result<void>> {
  return withProjectLock(async () => {
    const project = await getCurrentProject();
    if (!project) return ok(undefined);
    return doSaveProject({ ...project, bgm });
  });
}

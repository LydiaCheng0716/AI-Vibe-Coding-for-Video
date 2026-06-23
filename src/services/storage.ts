// Storage Service（chrome.storage.local）：设置 / 草稿。对齐 api-spec 3.2。
// 所有写操作返回 Result<void>，写失败映射 STORAGE_WRITE_FAILED（ARCH-LOW-001），不静默丢数据。
import { STORAGE_KEYS, SCHEMA_VERSION } from '../core/config';
import { ok, err, type Result, type Settings } from '../core/models';
import { defaultSettings } from '../core/defaults';

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
    schemaVersion: stored.schemaVersion ?? SCHEMA_VERSION,
  };
}

export async function saveSettings(settings: Settings): Promise<Result<void>> {
  return write({ [STORAGE_KEYS.settings]: { ...settings, schemaVersion: SCHEMA_VERSION } });
}

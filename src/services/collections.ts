// 通用本地集合抽象（Issue #40 + #35 共用）。在 chrome.storage.local 下以 `{ items: T[] }` 存一个
// 列表，提供 list/add/update/remove，每 key 一把串行 RMW 锁防并发覆盖（仿 storage.projectLock）。
// 调用方只存非凭据数据（ARCH-LOW-002）：本抽象不感知业务字段，但角色库/草稿库都不得放 Key/baseUrl。
import { ok, err, type Result } from '../core/models';

export interface CollectionRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
}

const WRITE_FAIL_MSG = '本地保存失败（可能空间不足），请重试。';

let idSeq = 0;
/** 生成集合内不冲突 id。优先 crypto.randomUUID，回退时间戳+序号+随机。 */
function genId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${(idSeq++).toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

interface Store<T> {
  items: T[];
}

export interface LocalCollection<T extends CollectionRecord> {
  list(): Promise<T[]>;
  add(input: Omit<T, keyof CollectionRecord>): Promise<Result<T>>;
  update(id: string, patch: Partial<Omit<T, keyof CollectionRecord>>): Promise<Result<T | null>>;
  remove(id: string): Promise<Result<void>>;
}

export function createLocalCollection<T extends CollectionRecord>(
  storageKey: string,
): LocalCollection<T> {
  let chain: Promise<unknown> = Promise.resolve();
  function withLock<R>(fn: () => Promise<R>): Promise<R> {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function read(): Promise<T[]> {
    const got = await chrome.storage.local.get(storageKey);
    const store = got[storageKey] as Store<T> | undefined;
    return Array.isArray(store?.items) ? store.items : [];
  }

  async function write(items: T[]): Promise<Result<void>> {
    try {
      await chrome.storage.local.set({ [storageKey]: { items } });
      return ok(undefined);
    } catch {
      return err('STORAGE_WRITE_FAILED', WRITE_FAIL_MSG);
    }
  }

  return {
    list(): Promise<T[]> {
      return read();
    },
    add(input: Omit<T, keyof CollectionRecord>): Promise<Result<T>> {
      return withLock(async () => {
        const items = await read();
        const now = Date.now();
        const item = { ...(input as object), id: genId(), createdAt: now, updatedAt: now } as T;
        const w = await write([...items, item]);
        if (!w.ok) return w;
        return ok(item);
      });
    },
    update(id: string, patch: Partial<Omit<T, keyof CollectionRecord>>): Promise<Result<T | null>> {
      return withLock(async () => {
        const items = await read();
        let updated: T | null = null;
        const next = items.map((it) => {
          if (it.id !== id) return it;
          updated = { ...it, ...patch, updatedAt: Date.now() } as T;
          return updated;
        });
        if (!updated) return ok(null);
        const w = await write(next);
        if (!w.ok) return w;
        return ok(updated);
      });
    },
    remove(id: string): Promise<Result<void>> {
      return withLock(async () => {
        const items = await read();
        return write(items.filter((it) => it.id !== id));
      });
    },
  };
}

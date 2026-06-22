// Vitest 全局 setup：提供 fake-indexeddb 与最小 chrome.storage.local mock，
// 供 keyVault / storage 纯逻辑单测使用（无需真实浏览器）。
import 'fake-indexeddb/auto';

type StoreData = Record<string, unknown>;
const mem: StoreData = {};

const local = {
  async get(keys?: string | string[] | null): Promise<StoreData> {
    if (keys == null) return { ...mem };
    const list = Array.isArray(keys) ? keys : [keys];
    const out: StoreData = {};
    for (const k of list) if (k in mem) out[k] = mem[k];
    return out;
  },
  async set(items: StoreData): Promise<void> {
    Object.assign(mem, items);
  },
  async remove(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const k of list) delete mem[k];
  },
  async clear(): Promise<void> {
    for (const k of Object.keys(mem)) delete mem[k];
  },
};

// @ts-expect-error - 测试环境注入最小 chrome 形状
globalThis.chrome = { storage: { local } };

// 每个测试间清空内存存储，避免串扰。
import { beforeEach } from 'vitest';
beforeEach(async () => {
  await local.clear();
});

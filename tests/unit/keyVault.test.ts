import { describe, it, expect } from 'vitest';
import {
  saveApiKey,
  hasApiKey,
  getMaskedApiKey,
  getApiKeyForRequest,
  clearApiKey,
} from '../../src/services/keyVault';
import { STORAGE_KEYS, KEY_DB } from '../../src/core/config';

const KEY = 'sk-test-1234567890ABCD';

describe('keyVault (BYOK / ADR-1)', () => {
  it('save → getApiKeyForRequest round-trips the plaintext', async () => {
    expect(await hasApiKey()).toBe(false);
    const r = await saveApiKey(KEY);
    expect(r.ok).toBe(true);
    expect(await hasApiKey()).toBe(true);
    expect(await getApiKeyForRequest()).toBe(KEY);
  });

  it('empty key is rejected', async () => {
    const r = await saveApiKey('   ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NO_API_KEY');
  });

  it('too-short key is rejected (avoids last4 == full key, ADR-1)', async () => {
    const r = await saveApiKey('abc');
    expect(r.ok).toBe(false);
    expect(await hasApiKey()).toBe(false);
  });

  it('mask shows only the last 4 chars, never the full key', async () => {
    await saveApiKey(KEY);
    const masked = await getMaskedApiKey();
    expect(masked).toBe('••••ABCD');
    expect(masked).not.toContain('sk-test');
    expect(masked).not.toContain(KEY);
  });

  it('stored cipher record contains NO full plaintext key', async () => {
    await saveApiKey(KEY);
    const raw = await chrome.storage.local.get(STORAGE_KEYS.apiKeyCipher);
    const serialized = JSON.stringify(raw);
    expect(serialized).not.toContain(KEY); // 完整明文不得出现
    expect(serialized).not.toContain('1234567890'); // 中段明文不得出现
    // 仅末 4 位作掩码用途存在，可接受。
    expect(raw[STORAGE_KEYS.apiKeyCipher]).toMatchObject({ last4: 'ABCD', alg: 'AES-GCM' });
  });

  it('IndexedDB key is non-extractable (extractable:false)', async () => {
    await saveApiKey(KEY);
    const db: IDBDatabase = await new Promise((res, rej) => {
      const req = indexedDB.open(KEY_DB.name, 1);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    const store = db.transaction(KEY_DB.store, 'readonly').objectStore(KEY_DB.store);
    const key: CryptoKey = await new Promise((res, rej) => {
      const req = store.get(KEY_DB.id);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    db.close();
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toBeTruthy();
  });

  it('clearApiKey removes everything', async () => {
    await saveApiKey(KEY);
    const r = await clearApiKey();
    expect(r.ok).toBe(true);
    expect(await hasApiKey()).toBe(false);
    expect(await getMaskedApiKey()).toBeNull();
    expect(await getApiKeyForRequest()).toBeNull();
  });

  it('concurrent saves are serialized → ciphertext stays decryptable (Codex HIGH)', async () => {
    // 并发两次保存不同 Key；互斥锁保证最终密文可被解出，且为其中一个完整 Key。
    await Promise.all([saveApiKey('sk-AAAAAAAAAA1111'), saveApiKey('sk-BBBBBBBBBB2222')]);
    const got = await getApiKeyForRequest();
    expect(got === 'sk-AAAAAAAAAA1111' || got === 'sk-BBBBBBBBBB2222').toBe(true);
  });

  it('decrypt failure (key wiped) clears bad state and returns null', async () => {
    await saveApiKey(KEY);
    // 模拟密钥丢失：删 IndexedDB 库但保留密文。
    await new Promise<void>((res) => {
      const req = indexedDB.deleteDatabase(KEY_DB.name);
      req.onsuccess = () => res();
      req.onerror = () => res();
      req.onblocked = () => res();
    });
    const got = await getApiKeyForRequest();
    expect(got).toBeNull();
    expect(await hasApiKey()).toBe(false); // 坏状态已清理
  });
});

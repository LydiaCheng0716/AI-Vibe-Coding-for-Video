// WebCrypto AES-GCM 加密（ADR-1）。密钥以 **不可导出**（extractable:false）形式存 IndexedDB，
// 原始密钥字节永不进入可读存储；明文 Key 只在加解密瞬间存在，绝不落盘/日志。
import { KEY_DB } from './config';

const ALG = 'AES-GCM';
const IV_BYTES = 12;

export interface CipherRecord {
  /** base64(密文) */
  ct: string;
  /** base64(iv) */
  iv: string;
  alg: 'AES-GCM';
}

// ---- IndexedDB 极简 Promise 封装（只存一个不可导出 CryptoKey）----

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEY_DB.name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(KEY_DB.store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// 等事务真正提交（oncomplete）再关库，避免请求 onsuccess 后过早 close 导致写未落盘
// （Kimi 终审 HIGH）。
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function idbGet(key: string): Promise<CryptoKey | undefined> {
  const db = await openDb();
  const tx = db.transaction(KEY_DB.store, 'readonly');
  const out = await reqToPromise<CryptoKey | undefined>(tx.objectStore(KEY_DB.store).get(key));
  await txDone(tx);
  db.close();
  return out;
}

async function idbPut(key: string, value: CryptoKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(KEY_DB.store, 'readwrite');
  tx.objectStore(KEY_DB.store).put(value, key);
  await txDone(tx);
  db.close();
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(KEY_DB.store, 'readwrite');
  tx.objectStore(KEY_DB.store).delete(key);
  await txDone(tx);
  db.close();
}

// ---- base64 <-> bytes ----

function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of u8) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

// ---- 密钥与加解密 ----

// 串行化「读无→生成→写入」，防止并发各自生成不同密钥导致旧密文不可解（Codex/Kimi HIGH）。
// crypto 层自带保护，不依赖调用方锁；每次重读 IndexedDB、不缓存内存密钥，
// 以便外部删除/损坏后能正确表现为「需重新生成」。
let keyChain: Promise<unknown> = Promise.resolve();

function getOrCreateKey(): Promise<CryptoKey> {
  const run = keyChain.then(loadOrCreateKey);
  keyChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function loadOrCreateKey(): Promise<CryptoKey> {
  const existing = await idbGet(KEY_DB.id);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey(
    { name: ALG, length: 256 },
    false, // extractable: false —— 不可导出（ADR-1 硬性）
    ['encrypt', 'decrypt'],
  );
  await idbPut(KEY_DB.id, key);
  return key;
}

export async function encryptString(plaintext: string): Promise<CipherRecord> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(plaintext);
  const ct = await crypto.subtle.encrypt({ name: ALG, iv } as AesGcmParams, key, data as BufferSource);
  return { ct: toB64(ct), iv: toB64(iv), alg: 'AES-GCM' };
}

export async function decryptString(record: CipherRecord): Promise<string> {
  const key = await getOrCreateKey();
  const iv = fromB64(record.iv);
  const ct = fromB64(record.ct);
  const plain = await crypto.subtle.decrypt(
    { name: ALG, iv } as AesGcmParams,
    key,
    ct as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

/** 删除 IndexedDB 中的密钥（配合清空密文，使旧密文不可解）。 */
export async function deleteKey(): Promise<void> {
  await idbDelete(KEY_DB.id);
}

// KeyVault Service（BYOK 密钥，对齐 api-spec 3.1 / ADR-1）。
// 任何返回值、日志、错误都不得包含完整明文 Key；UI 只拿掩码。
import { encryptString, decryptString, deleteKey, type CipherRecord } from '../core/crypto';
import { STORAGE_KEYS } from '../core/config';
import { ok, err, type Result } from '../core/models';

interface StoredCipher extends CipherRecord {
  /** 末 4 位明文，仅用于掩码显示（ADR-1：UI 只显示末 4 位）。 */
  last4: string;
}

function mask(last4: string): string {
  return '••••' + last4;
}

async function readCipher(): Promise<StoredCipher | undefined> {
  const got = await chrome.storage.local.get(STORAGE_KEYS.apiKeyCipher);
  return got[STORAGE_KEYS.apiKeyCipher] as StoredCipher | undefined;
}

/** 加密保存（密文落 chrome.storage.local，密钥落 IndexedDB）。 */
export async function saveApiKey(key: string): Promise<Result<void>> {
  const trimmed = key.trim();
  if (!trimmed) return err('NO_API_KEY', '请输入有效的 API Key。');
  try {
    const rec = await encryptString(trimmed);
    const stored: StoredCipher = { ...rec, last4: trimmed.slice(-4) };
    await chrome.storage.local.set({ [STORAGE_KEYS.apiKeyCipher]: stored });
    return ok(undefined);
  } catch {
    return err('STORAGE_WRITE_FAILED', '保存 API Key 失败，请重试。');
  }
}

/** 是否已配置（不解密、不回显完整 Key）。 */
export async function hasApiKey(): Promise<boolean> {
  return (await readCipher()) != null;
}

/** 取掩码（如 '••••AB12'，仅末 4 位）；禁止返回完整 Key 给 UI。 */
export async function getMaskedApiKey(): Promise<string | null> {
  const rec = await readCipher();
  return rec ? mask(rec.last4) : null;
}

/** 仅在发起出站请求的瞬间解密（非 UI 接口）。解密失败则清理坏状态并返回 null。 */
export async function getApiKeyForRequest(): Promise<string | null> {
  const rec = await readCipher();
  if (!rec) return null;
  try {
    return await decryptString(rec);
  } catch {
    await clearApiKey(); // 密钥损坏/丢失：清坏状态，UI 引导重输（KEY_DECRYPT_FAILED）。
    return null;
  }
}

/** 一键删除（清密文 + IndexedDB 密钥）。 */
export async function clearApiKey(): Promise<Result<void>> {
  try {
    await chrome.storage.local.remove(STORAGE_KEYS.apiKeyCipher);
    await deleteKey();
    return ok(undefined);
  } catch {
    return err('STORAGE_WRITE_FAILED', '删除 API Key 失败，请重试。');
  }
}

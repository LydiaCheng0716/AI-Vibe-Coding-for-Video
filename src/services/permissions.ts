// Host 权限检查（ADR-5）。出站请求前判定扩展是否已获目标域名 host 权限；
// 自定义域名的动态申请（chrome.permissions.request）在设置保存时进行（TASK-002 范畴）。
import type { ProviderConfig } from '../core/models';

const ANTHROPIC_ORIGIN = 'https://api.anthropic.com/*';
const DEFAULT_OPENAI_ORIGIN = 'https://api.openai.com/*';

/** 由 baseUrl/kind 推出要检查的 origin pattern（https://host/*）。 */
export function originForProvider(config: ProviderConfig): string | null {
  if (config.kind === 'anthropic') return ANTHROPIC_ORIGIN;
  const base = config.baseUrl && config.baseUrl.trim();
  if (!base) return DEFAULT_OPENAI_ORIGIN;
  try {
    return `${new URL(base).origin}/*`;
  } catch {
    return null;
  }
}

function getPerms(): typeof chrome.permissions | undefined {
  return (globalThis as { chrome?: { permissions?: typeof chrome.permissions } }).chrome?.permissions;
}

/**
 * 是否已获该 origin 的 host 权限。chrome.permissions 不可用时（如单测/非扩展上下文）
 * 视为已授权，避免误拦——真实扩展环境一定存在该 API。
 */
export async function hasHostPermission(origin: string): Promise<boolean> {
  const perms = getPerms();
  if (!perms?.contains) return true;
  try {
    return await perms.contains({ origins: [origin] });
  } catch {
    return false;
  }
}

/**
 * 动态申请该 origin 的 host 权限（ADR-5(3)，必须在用户手势内调用，如保存按钮）。
 * 自定义 baseUrl 保存时弹窗授权；chrome.permissions 不可用时视为已授权（测试/非扩展上下文）。
 */
export async function requestHostPermission(origin: string): Promise<boolean> {
  const perms = getPerms();
  if (!perms?.request) return true;
  try {
    return await perms.request({ origins: [origin] });
  } catch {
    return false;
  }
}

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  originForProvider,
  hasHostPermission,
  requestHostPermission,
} from '../../src/services/permissions';
import type { ProviderConfig } from '../../src/core/models';

const realChrome = (globalThis as { chrome?: unknown }).chrome;
afterEach(() => {
  (globalThis as { chrome?: unknown }).chrome = realChrome;
});
function setPerms(perms: unknown) {
  (globalThis as { chrome?: unknown }).chrome = { ...(realChrome as object), permissions: perms };
}

describe('originForProvider', () => {
  it('anthropic → 官方 origin', () => {
    expect(originForProvider({ kind: 'anthropic', model: 'm' })).toBe('https://api.anthropic.com/*');
  });
  it('openai-compatible 无 baseUrl → 默认 openai', () => {
    expect(originForProvider({ kind: 'openai-compatible', model: 'm' })).toBe('https://api.openai.com/*');
  });
  it('自定义 baseUrl → 该域名 origin', () => {
    const p: ProviderConfig = { kind: 'openai-compatible', model: 'm', baseUrl: 'https://api.moonshot.cn/v1' };
    expect(originForProvider(p)).toBe('https://api.moonshot.cn/*');
  });
  it('非法 baseUrl → null', () => {
    expect(originForProvider({ kind: 'openai-compatible', model: 'm', baseUrl: 'not a url' })).toBeNull();
  });
});

describe('requestHostPermission（ADR-5(3) 动态授权）', () => {
  it('用户允许 → true 并按 origin 申请', async () => {
    const request = vi.fn().mockResolvedValue(true);
    setPerms({ request });
    const ok = await requestHostPermission('https://api.moonshot.cn/*');
    expect(ok).toBe(true);
    expect(request).toHaveBeenCalledWith({ origins: ['https://api.moonshot.cn/*'] });
  });
  it('用户拒绝 → false', async () => {
    setPerms({ request: vi.fn().mockResolvedValue(false) });
    expect(await requestHostPermission('https://x.com/*')).toBe(false);
  });
  it('chrome.permissions 不可用 → 视为已授权（测试/非扩展上下文）', async () => {
    setPerms(undefined);
    expect(await requestHostPermission('https://x.com/*')).toBe(true);
  });
});

describe('hasHostPermission', () => {
  it('contains 返回值透传', async () => {
    setPerms({ contains: vi.fn().mockResolvedValue(true) });
    expect(await hasHostPermission('https://api.openai.com/*')).toBe(true);
    setPerms({ contains: vi.fn().mockResolvedValue(false) });
    expect(await hasHostPermission('https://x.com/*')).toBe(false);
  });
});

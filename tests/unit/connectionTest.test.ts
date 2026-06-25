import { describe, it, expect, vi } from 'vitest';
import { testConnection, type ConnectionTestDeps } from '../../src/services/connectionTest';
import { ProviderCallError, type LlmProvider } from '../../src/services/llm/provider';
import type { ProviderConfig } from '../../src/core/models';

const provider: ProviderConfig = { kind: 'openai-compatible', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' };

function makeDeps(over: Partial<ConnectionTestDeps> = {}): { deps: ConnectionTestDeps; probe: ReturnType<typeof vi.fn> } {
  const probe = vi.fn().mockResolvedValue(undefined);
  const fake: LlmProvider = { complete: vi.fn(), probe };
  let t = 1000;
  const deps: ConnectionTestDeps = {
    getApiKeyForRequest: vi.fn().mockResolvedValue('sk-stored-key'),
    hasHostPermission: vi.fn().mockResolvedValue(true),
    createProvider: vi.fn().mockReturnValue(fake),
    now: vi.fn(() => (t += 25)), // 每次 +25ms → 计时确定性
    ...over,
  };
  return { deps, probe };
}

describe('testConnection: 成功', () => {
  it('探针通 → ok + 延迟(ms)', async () => {
    const { deps } = makeDeps();
    const r = await testConnection({ provider, apiKey: 'sk-form' }, deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(typeof r.latencyMs).toBe('number');
    if (r.ok) expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('apiKey override 透传给 probe，不用已存 Key', async () => {
    const { deps, probe } = makeDeps();
    await testConnection({ provider, apiKey: 'sk-form' }, deps);
    expect(probe.mock.calls[0][0].apiKey).toBe('sk-form');
    expect(deps.getApiKeyForRequest).not.toHaveBeenCalled();
  });

  it('无 override 时回退到已存加密 Key', async () => {
    const { deps, probe } = makeDeps();
    await testConnection({ provider }, deps);
    expect(deps.getApiKeyForRequest).toHaveBeenCalled();
    expect(probe.mock.calls[0][0].apiKey).toBe('sk-stored-key');
  });
});

describe('testConnection: 错误分类（对齐验收）', () => {
  const cases: Array<[string, string, RegExp]> = [
    ['AUTH_FAILED', 'AUTH_FAILED', /401/],
    ['FORBIDDEN', 'FORBIDDEN', /403/],
    ['MODEL_NOT_FOUND', 'MODEL_NOT_FOUND', /404/],
    ['QUOTA_EXCEEDED', 'QUOTA_EXCEEDED', /额度不足/],
    ['CORS_BLOCKED', 'CORS_BLOCKED', /未对浏览器放行/],
    ['NETWORK_ERROR', 'NETWORK_ERROR', /CORS\/网络不可达/],
  ];
  it.each(cases)('%s → 对应分类文案', async (_name, code, re) => {
    const probe = vi.fn().mockRejectedValue(new ProviderCallError(code as never, 'x', false));
    const { deps } = makeDeps({ createProvider: vi.fn().mockReturnValue({ complete: vi.fn(), probe }) });
    const r = await testConnection({ provider, apiKey: 'sk' }, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(code);
      expect(r.message).toMatch(re);
    }
  });

  it('CORS（Failed to fetch 归 NETWORK_ERROR）→ 提示未对浏览器放行', async () => {
    const probe = vi.fn().mockRejectedValue(new ProviderCallError('NETWORK_ERROR', 'x', true));
    const { deps } = makeDeps({ createProvider: vi.fn().mockReturnValue({ complete: vi.fn(), probe }) });
    const r = await testConnection({ provider, apiKey: 'sk' }, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/未对浏览器放行/);
  });
});

describe('testConnection: 前置校验不发探针', () => {
  it('配置非法 → INVALID_PROVIDER_CONFIG，不建 provider', async () => {
    const { deps } = makeDeps();
    const bad: ProviderConfig = { kind: 'openai-compatible', baseUrl: 'http://insecure/v1', model: 'm' };
    const r = await testConnection({ provider: bad, apiKey: 'sk' }, deps);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_PROVIDER_CONFIG' });
    expect(deps.createProvider).not.toHaveBeenCalled();
  });

  it('缺 model → MODEL_REQUIRED', async () => {
    const { deps } = makeDeps();
    const r = await testConnection({ provider: { kind: 'openai-compatible', model: '' }, apiKey: 'sk' }, deps);
    expect(r).toMatchObject({ ok: false, code: 'MODEL_REQUIRED' });
  });

  it('无任何 Key → NO_API_KEY，不发探针', async () => {
    const { deps, probe } = makeDeps({ getApiKeyForRequest: vi.fn().mockResolvedValue(null) });
    const r = await testConnection({ provider }, deps);
    expect(r).toMatchObject({ ok: false, code: 'NO_API_KEY' });
    expect(probe).not.toHaveBeenCalled();
  });

  it('无 host 权限 → HOST_PERMISSION_DENIED，不发探针', async () => {
    const { deps, probe } = makeDeps({ hasHostPermission: vi.fn().mockResolvedValue(false) });
    const r = await testConnection({ provider, apiKey: 'sk' }, deps);
    expect(r).toMatchObject({ ok: false, code: 'HOST_PERMISSION_DENIED' });
    expect(probe).not.toHaveBeenCalled();
  });
});

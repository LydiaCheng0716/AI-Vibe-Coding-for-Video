// 连接测试服务（Issue #28）。设置里「测试连接」入口：用**表单当前** provider/Key 发一个极小
// 探针请求，分类报告结果（401/403/404/额度/CORS/网络/成功延迟）。只读不写——不保存设置、不落盘 Key，
// 遵守「测试不写入持久状态」与不落盘开关。
import type { ErrorCode, ProviderConfig } from '../core/models';
import { CONNECTION_TEST_TIMEOUT_MS, CONNECTION_TEST_MAX_TOKENS } from '../core/config';
import { validateProviderConfig } from '../core/validate';
import { ProviderCallError, createProvider, type LlmProvider } from './llm/provider';
import { hasHostPermission, originForProvider } from './permissions';
import { getApiKeyForRequest } from './keyVault';

export type ConnectionTestResult =
  | { ok: true; latencyMs: number }
  | { ok: false; code: ErrorCode; message: string };

/** 可注入依赖（默认接真实实现；测试可替换）。 */
export interface ConnectionTestDeps {
  getApiKeyForRequest: () => Promise<string | null>;
  hasHostPermission: (origin: string) => Promise<boolean>;
  createProvider: (config: ProviderConfig) => LlmProvider;
  /** 计时源（注入便于测试确定性）。 */
  now: () => number;
}

const realDeps: ConnectionTestDeps = {
  getApiKeyForRequest,
  hasHostPermission,
  createProvider,
  now: () => Date.now(),
};

function fail(code: ErrorCode, message: string): ConnectionTestResult {
  return { ok: false, code, message };
}

/** 探针错误码 → 面向用户的分类文案（对齐 Issue #28 验收）。 */
function classifyProbeError(code: ErrorCode): string {
  switch (code) {
    case 'AUTH_FAILED':
      return '401 Key 无效';
    case 'FORBIDDEN':
      return '403 无权限或被锁定';
    case 'MODEL_NOT_FOUND':
      return '404 模型不存在';
    case 'QUOTA_EXCEEDED':
      return '额度不足';
    case 'RATE_LIMITED':
      return '请求过于频繁（可能额度不足），请稍后再试';
    case 'CORS_BLOCKED':
      return 'CORS/网络不可达：该端点未对浏览器放行，可能不支持直连';
    case 'NETWORK_ERROR':
      // 浏览器 Failed to fetch 无法可靠区分 CORS / 断网（沿用 provider.ts 结论），
      // 文案同时点出「未对浏览器放行」以覆盖 CORS 场景（验收点）。
      return 'CORS/网络不可达：该端点可能未对浏览器放行或网络异常';
    case 'BAD_RESPONSE_FORMAT':
      return '请求被拒（可能参数或模型不被支持）';
    default:
      return '连接测试失败，请稍后重试';
  }
}

/**
 * 测试连接：前置校验（配置/Key/host 权限，任一不过即返回，不发探针）→ 极小探针 + 计时 + 分类。
 * Key 来源：`apiKey` override（表单刚填/不落盘当次 Key）优先，否则已保存的加密 Key；都无 → NO_API_KEY。
 */
export async function testConnection(
  input: { provider: ProviderConfig; apiKey?: string },
  deps: ConnectionTestDeps = realDeps,
): Promise<ConnectionTestResult> {
  const provider = input.provider;

  // 1. Provider 配置合法（ADR-4/ADR-5）
  const pv = validateProviderConfig(provider);
  if (pv === 'INVALID_PROVIDER_CONFIG')
    return fail('INVALID_PROVIDER_CONFIG', 'Provider 配置无效，请检查类型与 Base URL（需 https://）。');
  if (pv === 'MODEL_REQUIRED') return fail('MODEL_REQUIRED', '请先填写要测试的模型名。');

  // 2. Key：override 优先，否则取已存加密 Key；都没有 → 不发请求
  const override = input.apiKey?.trim();
  const apiKey = override || (await deps.getApiKeyForRequest()) || '';
  if (!apiKey) return fail('NO_API_KEY', '请先填写或保存 API Key 再测试。');

  // 3. host 权限（自定义/非静态域名；UI 在点击手势内已尝试申请）
  const origin = originForProvider(provider);
  if (!origin) return fail('INVALID_PROVIDER_CONFIG', 'Provider 配置无效，请检查 Base URL。');
  if (!(await deps.hasHostPermission(origin)))
    return fail('HOST_PERMISSION_DENIED', `需要授权访问 ${origin} 才能测试，请在弹窗中允许。`);

  // 4. 探针 + 计时（短超时；只读不落盘）
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONNECTION_TEST_TIMEOUT_MS);
  const start = deps.now();
  try {
    await deps.createProvider(provider).probe({
      system: 'ping',
      user: 'ping',
      model: provider.model,
      apiKey,
      maxTokens: CONNECTION_TEST_MAX_TOKENS,
      signal: ctrl.signal,
    });
    return { ok: true, latencyMs: Math.max(0, deps.now() - start) };
  } catch (e) {
    if (e instanceof ProviderCallError) return fail(e.code, classifyProbeError(e.code));
    return fail('NETWORK_ERROR', classifyProbeError('NETWORK_ERROR'));
  } finally {
    clearTimeout(timer);
  }
}

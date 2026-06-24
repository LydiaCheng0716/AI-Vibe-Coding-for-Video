// LLM Provider 抽象层（api-spec §4.1）。上层只面向 LlmProvider 接口，不感知厂商差异。
// 适配器把 HTTP 状态/网络异常抛成带 ErrorCode 的 ProviderCallError；编排层据此转 Result。
import type { ErrorCode, ProviderConfig } from '../../core/models';
import { createOpenAiCompatibleProvider } from './openaiCompatible';
import { createAnthropicProvider } from './anthropic';

export interface CompleteRequest {
  system: string;
  user: string;
  model: string;
  maxTokens: number;
  /** 配合超时（ADR-3）；编排层用 AbortController 控制。 */
  signal: AbortSignal;
  /**
   * 编排层（generation）已解密的明文 Key，避免适配器再次解密（ADR-1 明文最小作用域）。
   * 仅在「发起出站请求的调用链」内瞬时传递，不缓存；未传时适配器回退自取。
   */
  apiKey?: string;
}

export interface LlmProvider {
  /** 发起一次「要求结构化 JSON 输出」的补全；返回原始文本（内含 JSON），由 core/parse 解析。 */
  complete(req: CompleteRequest): Promise<string>;
}

/**
 * Provider 调用错误：携带映射好的 ErrorCode（api-spec §5）。
 * 401/403→AUTH_FAILED，429→RATE_LIMITED，5xx/网络/超时→NETWORK_ERROR，CORS→CORS_BLOCKED。
 * retriable 仅供 TASK-009 的重试层参考；本任务不重试。
 */
export class ProviderCallError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly retriable: boolean,
    /** 429 Retry-After 等退避提示（ms），供 TASK-009 重试层优先采用。 */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderCallError';
  }
}

/** 把厂商 HTTP 状态码映射到 ErrorCode（api-spec §5）。供各适配器复用。 */
export function mapHttpStatus(status: number): { code: ErrorCode; retriable: boolean } {
  if (status === 401 || status === 403) return { code: 'AUTH_FAILED', retriable: false };
  if (status === 408) return { code: 'NETWORK_ERROR', retriable: true }; // Request Timeout（kimi MED）
  if (status === 429) return { code: 'RATE_LIMITED', retriable: true };
  if (status >= 500) return { code: 'NETWORK_ERROR', retriable: true };
  // 其余 4xx（含 400/422 参数问题）默认按格式/请求问题处理，不重试。
  return { code: 'BAD_RESPONSE_FORMAT', retriable: false };
}

/**
 * fetch 抛出的异常映射。AbortError（超时）→ NETWORK_ERROR（可重试）。
 * CORS 与普通网络/DNS/连接失败在浏览器里都常表现为 `TypeError: Failed to fetch`，JS 层无法
 * 可靠区分（Codex MED）。为不吞掉 ADR-3 的网络失败重试：仅在 message 明确含 CORS/cross-origin
 * 时判 CORS_BLOCKED（不重试，引导换 Provider，ADR-5(5)）；泛化的 "failed to fetch" 一律按
 * NETWORK_ERROR（可重试）——若实为 CORS，重试耗尽后仍会给出可读失败提示。host 权限已在请求前判定。
 */
export function mapFetchError(e: unknown): ProviderCallError {
  if (e instanceof ProviderCallError) return e;
  if (e instanceof Error && e.name === 'AbortError') {
    return new ProviderCallError('NETWORK_ERROR', '请求超时，请重试。', true);
  }
  if (e instanceof TypeError && /cors|cross-origin/i.test(e.message)) {
    return new ProviderCallError(
      'CORS_BLOCKED',
      '该服务可能不支持在浏览器插件中直接调用，请改用受支持的 Provider 或换一个 baseUrl。',
      false,
    );
  }
  return new ProviderCallError('NETWORK_ERROR', '网络异常，请检查网络后重试。', true);
}

/** Provider 工厂：按配置返回对应适配器。 */
export function createProvider(config: ProviderConfig): LlmProvider {
  if (config.kind === 'anthropic') return createAnthropicProvider();
  return createOpenAiCompatibleProvider(config.baseUrl);
}

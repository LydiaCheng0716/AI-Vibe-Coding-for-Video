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
  ) {
    super(message);
    this.name = 'ProviderCallError';
  }
}

/** 把厂商 HTTP 状态码映射到 ErrorCode（api-spec §5）。供各适配器复用。 */
export function mapHttpStatus(status: number): { code: ErrorCode; retriable: boolean } {
  if (status === 401 || status === 403) return { code: 'AUTH_FAILED', retriable: false };
  if (status === 429) return { code: 'RATE_LIMITED', retriable: true };
  if (status >= 500) return { code: 'NETWORK_ERROR', retriable: true };
  // 其余 4xx（含 400/422 参数问题）默认按格式/请求问题处理，不重试。
  return { code: 'BAD_RESPONSE_FORMAT', retriable: false };
}

/**
 * fetch 抛出的异常映射。浏览器里 CORS 与普通网络失败都表现为 TypeError，
 * JS 层无法可靠区分；host 权限已在请求前判定（HOST_PERMISSION_DENIED）。
 * 因此 fetch 异常统一按 NETWORK_ERROR（可重试），AbortError（超时）同样按网络处理。
 */
export function mapFetchError(e: unknown): ProviderCallError {
  if (e instanceof ProviderCallError) return e;
  const isAbort = e instanceof Error && e.name === 'AbortError';
  const msg = isAbort ? '请求超时，请重试。' : '网络异常，请检查网络后重试。';
  return new ProviderCallError('NETWORK_ERROR', msg, true);
}

/** Provider 工厂：按配置返回对应适配器。 */
export function createProvider(config: ProviderConfig): LlmProvider {
  if (config.kind === 'anthropic') return createAnthropicProvider();
  return createOpenAiCompatibleProvider(config.baseUrl);
}

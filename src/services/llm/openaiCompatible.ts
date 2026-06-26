// OpenAI 兼容 Chat Completions 适配器（主契约，api-spec §4.2）。
// 覆盖 OpenAI / DeepSeek / Kimi / 智谱 等「OpenAI 兼容 + 自定义 base_url」厂商。
// Spike #3 已实测 Kimi 可直连（CORS 放行扩展来源）。
import { getApiKeyForRequest } from '../keyVault';
import {
  ProviderCallError,
  mapFetchError,
  mapHttpStatus,
  type CompleteRequest,
  type LlmUsage,
  type LlmProvider,
} from './provider';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/** 去掉末尾斜杠，拼出 /chat/completions 端点。 */
function endpoint(baseUrl: string | undefined): string {
  const base = (baseUrl && baseUrl.trim()) || DEFAULT_BASE_URL;
  return base.replace(/\/+$/, '') + '/chat/completions';
}

/** 判断 400/422 是否因不认识 response_format 字段（据此去字段重试一次）。 */
function isUnsupportedParam(status: number, body: string): boolean {
  if (status !== 400 && status !== 422) return false;
  if (/response_format/i.test(body)) return true;
  return /(unsupported|unknown|unrecognized|invalid)[\s\S]*(parameter|field|argument)/i.test(body);
}

function buildBody(
  req: CompleteRequest,
  withResponseFormat: boolean,
  stream = false,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model.trim(), // 去空格，避免厂商 400（kimi LOW）
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ],
    max_tokens: req.maxTokens,
  };
  if (withResponseFormat) body.response_format = { type: 'json_object' };
  if (stream) {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }
  return body;
}

function parseUsage(json: unknown): LlmUsage | null {
  const usage = (json as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } })?.usage;
  const input = usage?.prompt_tokens;
  const output = usage?.completion_tokens;
  if (
    typeof input === 'number' &&
    Number.isFinite(input) &&
    input >= 0 &&
    typeof output === 'number' &&
    Number.isFinite(output) &&
    output >= 0
  ) {
    return { input, output };
  }
  return null;
}

export function createOpenAiCompatibleProvider(baseUrl?: string): LlmProvider {
  const url = endpoint(baseUrl);
  let lastUsage: LlmUsage | null = null;

  async function postBody(req: CompleteRequest, body: Record<string, unknown>): Promise<Response> {
    // 明文 Key 只在本次请求构造的瞬间存在，不赋值给任何持久引用（ADR-1）。
    // 优先用编排层已解密并传入的 Key，避免二次解密（ADR-1 最小作用域）。
    const apiKey = req.apiKey ?? (await getApiKeyForRequest());
    if (!apiKey) throw new ProviderCallError('NO_API_KEY', '未配置 API Key。', false);
    return fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: req.signal,
    });
  }

  async function post(req: CompleteRequest, withResponseFormat: boolean): Promise<Response> {
    return postBody(req, buildBody(req, withResponseFormat));
  }

  async function postStream(req: CompleteRequest, withResponseFormat: boolean): Promise<Response> {
    return postBody(req, buildBody(req, withResponseFormat, true));
  }

  return {
    // 返回防御性拷贝，避免调用方意外改写适配器内部缓存（Kimi P2）。
    lastUsage: () => (lastUsage ? { ...lastUsage } : null),
    async probe(req: CompleteRequest): Promise<void> {
      // 极小请求只判通断：不带 response_format（最大兼容），不读 body、不查截断。
      let res: Response;
      try {
        res = await post(req, false);
      } catch (e) {
        throw mapFetchError(e);
      }
      if (!res.ok) {
        const { code, retriable } = mapHttpStatus(res.status);
        const retryAfterMs = res.status === 429 ? parseRetryAfter(res) : undefined;
        throw new ProviderCallError(code, providerMessage(code), retriable, retryAfterMs);
      }
    },
    async complete(req: CompleteRequest): Promise<string> {
      lastUsage = null;
      let res: Response;
      try {
        res = await post(req, true);
        // response_format 不被支持 → 去字段重试一次（不计入 ADR-3 网络重试预算，api-spec §4.2）。
        if (!res.ok) {
          const peek = await res.clone().text();
          if (isUnsupportedParam(res.status, peek)) {
            res = await post(req, false);
          }
        }
      } catch (e) {
        throw mapFetchError(e);
      }

      if (!res.ok) {
        const { code, retriable } = mapHttpStatus(res.status);
        // 错误正文不回传给用户（可能含敏感细节）；只给可读文案。
        const retryAfterMs = res.status === 429 ? parseRetryAfter(res) : undefined;
        throw new ProviderCallError(code, providerMessage(code), retriable, retryAfterMs);
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch (e) {
        throw mapFetchError(e);
      }
      const choice = (
        json as {
          choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
        }
      )?.choices?.[0];
      // 截断检测（ADR-6(4)）：finish_reason=length 说明输出被 max_tokens 截断，
      // 即便恰好可解析也按格式异常处理，避免吞掉缺失镜头。
      if (choice?.finish_reason === 'length') {
        throw new ProviderCallError('BAD_RESPONSE_FORMAT', '生成结果被截断，请重试。', false);
      }
      const content = choice?.message?.content;
      if (typeof content !== 'string') {
        throw new ProviderCallError('BAD_RESPONSE_FORMAT', '生成结果格式异常，请重试。', false);
      }
      lastUsage = parseUsage(json);
      return content;
    },
    async completeStream(req: CompleteRequest, onText: (delta: string) => void): Promise<string> {
      lastUsage = null;
      let res: Response;
      try {
        res = await postStream(req, true);
        if (!res.ok) {
          const peek = await res.clone().text();
          if (isUnsupportedParam(res.status, peek)) {
            res = await postStream(req, false);
          }
        }
      } catch (e) {
        throw mapFetchError(e);
      }

      if (!res.ok) {
        const { code, retriable } = mapHttpStatus(res.status);
        const retryAfterMs = res.status === 429 ? parseRetryAfter(res) : undefined;
        throw new ProviderCallError(code, providerMessage(code), retriable, retryAfterMs);
      }
      if (!res.body) {
        throw new ProviderCallError('NETWORK_ERROR', '网络或服务端异常，请稍后重试。', true);
      }

      try {
        return await readSseCompletion(res.body, onText, (usage) => {
          lastUsage = usage;
        });
      } catch (e) {
        throw mapFetchError(e);
      }
    },
  };
}

async function readSseCompletion(
  body: ReadableStream<Uint8Array>,
  onText: (delta: string) => void,
  onUsage: (usage: LlmUsage | null) => void,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let full = '';

  const consumeEvent = (event: string): boolean => {
    const data = event
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return false;
    if (data === '[DONE]') return true;

    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return false;
    }

    const usage = parseUsage(json);
    if (usage) onUsage(usage);
    const delta = (
      json as { choices?: Array<{ delta?: { content?: unknown }; finish_reason?: string }> }
    )?.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta.length > 0) {
      full += delta;
      onText(delta);
    }
    const finishReason = (
      json as { choices?: Array<{ delta?: { content?: unknown }; finish_reason?: string }> }
    )?.choices?.[0]?.finish_reason;
    if (finishReason === 'length') {
      throw new ProviderCallError('BAD_RESPONSE_FORMAT', '生成结果被截断，请重试。', false);
    }
    return false;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const parts = pending.split(/\r?\n\r?\n/);
    pending = parts.pop() ?? '';
    for (const event of parts) {
      if (consumeEvent(event)) return full;
    }
  }
  pending += decoder.decode();
  if (pending.trim() && consumeEvent(pending)) return full;
  return full;
}

/** 解析 429 Retry-After（秒 或 HTTP-date）→ ms；无法解析返回 undefined。 */
function parseRetryAfter(res: Response): number | undefined {
  const raw = res.headers.get('Retry-After');
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function providerMessage(code: string): string {
  switch (code) {
    case 'AUTH_FAILED':
      return 'API Key 无效，请到设置里检查你的 BYOK 配置。';
    case 'FORBIDDEN':
      return '无权限或被锁定（403），请检查 Key 权限与账号状态。';
    case 'MODEL_NOT_FOUND':
      return '模型不存在或无访问权限（404），请检查模型名。';
    case 'QUOTA_EXCEEDED':
      return '额度不足或欠费，请检查账户余额。';
    case 'RATE_LIMITED':
      return '请求过于频繁，请稍后再试。';
    case 'NETWORK_ERROR':
      return '网络或服务端异常，请稍后重试。';
    default:
      return '生成结果格式异常，请重试。';
  }
}

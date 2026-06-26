// Anthropic Messages 适配器（api-spec §4.3）。
// ⚠️ Spike #3 仅实测 OpenAI 兼容（Kimi）；Anthropic 浏览器直连未实测（CORS 待验证）。
// MVP 默认 Provider 为 OpenAI 兼容；此适配器保留以覆盖 Claude 用户，结构与 OpenAI 适配器对齐。
import { getApiKeyForRequest } from '../keyVault';
import {
  ProviderCallError,
  mapFetchError,
  mapHttpStatus,
  type CompleteRequest,
  type LlmUsage,
  type LlmProvider,
} from './provider';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

function parseUsage(json: unknown): LlmUsage | null {
  const usage = (json as { usage?: { input_tokens?: unknown; output_tokens?: unknown } })?.usage;
  const input = usage?.input_tokens;
  const output = usage?.output_tokens;
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

export function createAnthropicProvider(): LlmProvider {
  let lastUsage: LlmUsage | null = null;

  async function postMessages(req: CompleteRequest): Promise<Response> {
    // 优先用编排层已解密并传入的 Key，避免二次解密（ADR-1 最小作用域）。
    const apiKey = req.apiKey ?? (await getApiKeyForRequest());
    if (!apiKey) throw new ProviderCallError('NO_API_KEY', '未配置 API Key。', false);
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: req.model.trim(), // 用户填写值，不硬编码（ARCH-MED-001）；去空格
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
      }),
      signal: req.signal,
    });
  }

  return {
    // 返回防御性拷贝，避免调用方意外改写适配器内部缓存（Kimi P2）。
    lastUsage: () => (lastUsage ? { ...lastUsage } : null),
    async probe(req: CompleteRequest): Promise<void> {
      // 极小请求只判通断：2xx → resolve；非 2xx/网络异常 → 抛细化码。不读 body。
      let res: Response;
      try {
        res = await postMessages(req);
      } catch (e) {
        throw mapFetchError(e);
      }
      if (!res.ok) {
        const { code, retriable } = mapHttpStatus(res.status);
        throw new ProviderCallError(code, anthropicMessage(code), retriable);
      }
    },
    async complete(req: CompleteRequest): Promise<string> {
      lastUsage = null;
      let res: Response;
      try {
        res = await postMessages(req);
      } catch (e) {
        throw mapFetchError(e);
      }

      if (!res.ok) {
        const { code, retriable } = mapHttpStatus(res.status);
        throw new ProviderCallError(code, anthropicMessage(code), retriable);
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch (e) {
        throw mapFetchError(e);
      }
      // 截断检测（ADR-6(4)）：stop_reason=max_tokens 说明被截断，按格式异常处理。
      if ((json as { stop_reason?: string })?.stop_reason === 'max_tokens') {
        throw new ProviderCallError('BAD_RESPONSE_FORMAT', '生成结果被截断，请重试。', false);
      }
      // 取 content[] 中首个 type==='text' 块的 text（api-spec §4.3）。
      const blocks = (json as { content?: Array<{ type?: string; text?: unknown }> })?.content;
      const text = Array.isArray(blocks)
        ? blocks.find((b) => b?.type === 'text' && typeof b.text === 'string')?.text
        : undefined;
      if (typeof text !== 'string') {
        throw new ProviderCallError('BAD_RESPONSE_FORMAT', '生成结果格式异常，请重试。', false);
      }
      lastUsage = parseUsage(json);
      return text;
    },
  };
}

function anthropicMessage(code: string): string {
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

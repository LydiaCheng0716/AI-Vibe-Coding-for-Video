// Anthropic Messages 适配器（api-spec §4.3）。
// ⚠️ Spike #3 仅实测 OpenAI 兼容（Kimi）；Anthropic 浏览器直连未实测（CORS 待验证）。
// MVP 默认 Provider 为 OpenAI 兼容；此适配器保留以覆盖 Claude 用户，结构与 OpenAI 适配器对齐。
import { getApiKeyForRequest } from '../keyVault';
import {
  ProviderCallError,
  mapFetchError,
  mapHttpStatus,
  type CompleteRequest,
  type LlmProvider,
} from './provider';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export function createAnthropicProvider(): LlmProvider {
  return {
    async complete(req: CompleteRequest): Promise<string> {
      let res: Response;
      try {
        const apiKey = await getApiKeyForRequest();
        if (!apiKey) throw new ProviderCallError('NO_API_KEY', '未配置 API Key。', false);
        res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: req.model, // 用户填写值，不硬编码（ARCH-MED-001）
            max_tokens: req.maxTokens,
            system: req.system,
            messages: [{ role: 'user', content: req.user }],
          }),
          signal: req.signal,
        });
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
      // 取 content[] 中首个 type==='text' 块的 text（api-spec §4.3）。
      const blocks = (json as { content?: Array<{ type?: string; text?: unknown }> })?.content;
      const text = Array.isArray(blocks)
        ? blocks.find((b) => b?.type === 'text' && typeof b.text === 'string')?.text
        : undefined;
      if (typeof text !== 'string') {
        throw new ProviderCallError('BAD_RESPONSE_FORMAT', '生成结果格式异常，请重试。', false);
      }
      return text;
    },
  };
}

function anthropicMessage(code: string): string {
  switch (code) {
    case 'AUTH_FAILED':
      return 'API Key 无效或无权限，请到设置里检查你的 BYOK 配置。';
    case 'RATE_LIMITED':
      return '请求过于频繁，请稍后再试。';
    case 'NETWORK_ERROR':
      return '网络或服务端异常，请稍后重试。';
    default:
      return '生成结果格式异常，请重试。';
  }
}

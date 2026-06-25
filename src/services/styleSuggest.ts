// 全局风格单字段「重新建议」服务（Issue #55，仿 services/characterSuggest）。仅对某字段发一次小
// LLM 调用，返回 2–4 候选；不改其它字段。复用 preflightProvider + 全局锁 + 短超时 + 失败退避重试。
import { ok, err, type Result, type StyleFieldKey, type StyleProfile } from '../core/models';
import { CHARACTER_SUGGEST_TIMEOUT_MS, CHARACTER_SUGGEST_MAX_TOKENS } from '../core/config';
import { buildStyleFieldSuggestionPrompt } from '../prompts/style';
import { parseFieldSuggestions } from '../core/parse';
import { ProviderCallError, createProvider } from './llm/provider';
import { preflightProvider, type PreflightDeps } from './generation';
import { hasApiKey, getApiKeyForRequest } from './keyVault';
import { hasHostPermission } from './permissions';
import { getSettings } from './storage';
import { withLlmLock } from './llmLock';
import { withRetry, type RetryOptions } from '../lib/retry';

const realDeps: PreflightDeps = {
  getSettings,
  hasApiKey,
  getApiKeyForRequest,
  hasHostPermission,
  createProvider,
};

export interface StyleSuggestInput {
  field: StyleFieldKey;
  story?: string;
  profile?: StyleProfile;
  /** 一次性 Key override（不保存 Key 模式）。 */
  apiKey?: string;
}

function providerErr(e: unknown): Result<never> {
  if (e instanceof ProviderCallError) return err(e.code, e.message, e.retriable, e.retryAfterMs);
  return err('NETWORK_ERROR', '网络异常，请稍后重试。', true);
}

export async function suggestStyleFieldAttempt(
  input: StyleSuggestInput,
  deps: PreflightDeps = realDeps,
): Promise<Result<string[]>> {
  const pre = await preflightProvider(deps, input.apiKey);
  if (!pre.ok) return pre;
  const { settings, apiKey } = pre.data;
  const lang = settings.params.outputLanguage;

  const { system, user } = buildStyleFieldSuggestionPrompt(
    { field: input.field, story: input.story, profile: input.profile },
    lang,
  );

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHARACTER_SUGGEST_TIMEOUT_MS);
  let raw: string;
  try {
    raw = await deps.createProvider(settings.provider).complete({
      system,
      user,
      model: settings.provider.model,
      apiKey,
      maxTokens: CHARACTER_SUGGEST_MAX_TOKENS,
      signal: ctrl.signal,
    });
  } catch (e) {
    return providerErr(e);
  } finally {
    clearTimeout(timer);
  }

  const list = parseFieldSuggestions(raw);
  if (!list) return err('BAD_RESPONSE_FORMAT', '建议生成结果异常，请重试。');
  return ok(list);
}

/** 生成全局风格单字段候选（与分镜/BGM 共享全局锁 + 退避重试）。 */
export async function suggestStyleField(
  input: StyleSuggestInput,
  deps: PreflightDeps = realDeps,
  retryOpts: RetryOptions = {},
): Promise<Result<string[]>> {
  return withLlmLock(() => withRetry(() => suggestStyleFieldAttempt(input, deps), retryOpts));
}

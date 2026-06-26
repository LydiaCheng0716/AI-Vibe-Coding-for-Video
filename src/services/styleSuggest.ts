// 全局风格单字段「重新建议」服务（Issue #55，仿 services/characterSuggest）。仅对某字段发一次小
// LLM 调用，返回 2–4 候选；不改其它字段。复用 preflightProvider + 全局锁 + 短超时 + 失败退避重试。
import { ok, err, type Result, type StyleFieldKey, type StyleProfile } from '../core/models';
import { CHARACTER_SUGGEST_TIMEOUT_MS, CHARACTER_SUGGEST_MAX_TOKENS } from '../core/config';
import { buildStyleFieldSuggestionPrompt } from '../prompts/style';
import { parseFieldSuggestions } from '../core/parse';
import { createProvider } from './llm/provider';
import { runOneShotLlm, type PreflightDeps } from './generation';
import { hasApiKey, getApiKeyForRequest } from './keyVault';
import { hasHostPermission } from './permissions';
import { getSettings } from './storage';
import { type RetryOptions } from '../lib/retry';

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

export async function suggestStyleFieldAttempt(
  input: StyleSuggestInput,
  deps: PreflightDeps = realDeps,
): Promise<Result<string[]>> {
  return runStyleSuggest(input, deps, false);
}

/** 生成全局风格单字段候选（与分镜/BGM 共享全局锁 + 退避重试）。 */
export async function suggestStyleField(
  input: StyleSuggestInput,
  deps: PreflightDeps = realDeps,
  retryOpts: RetryOptions = {},
): Promise<Result<string[]>> {
  return runStyleSuggest(input, deps, true, retryOpts);
}

function runStyleSuggest(
  input: StyleSuggestInput,
  deps: PreflightDeps,
  lock: boolean,
  retryOpts?: RetryOptions,
): Promise<Result<string[]>> {
  return runOneShotLlm({
    deps,
    apiKey: input.apiKey,
    lock,
    retryOpts,
    timeoutMs: CHARACTER_SUGGEST_TIMEOUT_MS,
    maxTokens: CHARACTER_SUGGEST_MAX_TOKENS,
    buildPrompt: ({ settings }) =>
      buildStyleFieldSuggestionPrompt(
        { field: input.field, story: input.story, profile: input.profile },
        settings.params.outputLanguage,
      ),
    parse: (raw) => {
      const list = parseFieldSuggestions(raw);
      if (!list) return err('BAD_RESPONSE_FORMAT', '建议生成结果异常，请重试。');
      return ok(list);
    },
  });
}

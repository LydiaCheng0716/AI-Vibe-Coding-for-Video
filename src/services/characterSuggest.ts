// 角色单字段「重新建议」服务（Issue #29 B）。仅对某角色的某个字段发一次小 LLM 调用，
// 返回 2–4 候选；不改动其它字段/角色。复用 generation.preflightProvider（统一校验）+ 全局
// LLM 锁（与分镜/BGM 互斥，ARCH-MED-004）+ 短超时；失败退避重试由 lib/retry 复用。
import { ok, err, type Result, type Character, type CharacterFieldKey } from '../core/models';
import { CHARACTER_SUGGEST_TIMEOUT_MS, CHARACTER_SUGGEST_MAX_TOKENS } from '../core/config';
import { buildFieldSuggestionPrompt } from '../prompts/characters';
import { parseFieldSuggestions } from '../core/parse';
import { ProviderCallError } from './llm/provider';
import { preflightProvider, type PreflightDeps } from './generation';
import { hasApiKey, getApiKeyForRequest } from './keyVault';
import { hasHostPermission } from './permissions';
import { createProvider } from './llm/provider';
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

export interface CharacterSuggestInput {
  character: Character;
  field: CharacterFieldKey;
  /** 可选故事背景，帮助候选贴合剧情。 */
  story?: string;
  /** 一次性 Key override（不保存 Key 模式，ADR-1 #8）。 */
  apiKey?: string;
}

function providerErr(e: unknown): Result<never> {
  if (e instanceof ProviderCallError) return err(e.code, e.message, e.retriable, e.retryAfterMs);
  return err('NETWORK_ERROR', '网络异常，请稍后重试。', true);
}

/**
 * 单次「重新建议」尝试：前置校验 → 单字段 prompt → provider（短超时）→ 解析候选，**不持久化、不加锁**。
 * 仅供锁/重试包裹与单测；组件层应调 `suggestCharacterField`（带全局锁）。
 */
export async function suggestCharacterFieldAttempt(
  input: CharacterSuggestInput,
  deps: PreflightDeps = realDeps,
): Promise<Result<string[]>> {
  const pre = await preflightProvider(deps, input.apiKey);
  if (!pre.ok) return pre;
  const { settings, apiKey } = pre.data;
  const lang = settings.params.outputLanguage;

  const { system, user } = buildFieldSuggestionPrompt(
    { character: input.character, field: input.field, story: input.story },
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

/**
 * 生成单字段候选（Issue #29 B）：与分镜/BGM 共享同一把全局锁（互斥）+ 退避重试。
 * 进行中再次调用 → GENERATION_IN_PROGRESS（防与生成并发冲突）。仅该字段重生，不动其它。
 */
export async function suggestCharacterField(
  input: CharacterSuggestInput,
  deps: PreflightDeps = realDeps,
  retryOpts: RetryOptions = {},
): Promise<Result<string[]>> {
  return withLlmLock(() => withRetry(() => suggestCharacterFieldAttempt(input, deps), retryOpts));
}

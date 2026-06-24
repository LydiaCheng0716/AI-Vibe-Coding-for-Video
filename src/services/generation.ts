// Generation Service（编排，TASK-003 / api-spec §3.3）。组件层唯一的分镜生成入口。
// 前置校验链 → 构造 prompt → 单次 provider 调用（AbortSignal 超时） → ADR-6 解析 → 落库。
//
// 范围接缝（TASK-009）：全局 LLM 锁（GENERATION_IN_PROGRESS）与失败自动重试在本任务【不实现】，
// 由 009 在 generateStoryboard 外层包裹。本服务对外暴露一个可被重试/锁包裹的单次尝试。
import {
  ok,
  err,
  type Result,
  type Project,
  type Settings,
  type ProviderConfig,
} from '../core/models';
import { STORYBOARD_TIMEOUT_MS, MAX_OUTPUT_TOKENS } from '../core/config';
import { validateStory, validateProviderConfig } from '../core/validate';
import { buildStoryboardPrompt } from '../prompts/storyboard';
import { parseStoryboard, buildProject } from '../core/parse';
import { injectCharacterConsistency } from '../core/characters';
import { ProviderCallError, createProvider, type LlmProvider } from './llm/provider';
import { hasHostPermission, originForProvider } from './permissions';
import { getSettings, saveCurrentProject } from './storage';
import { hasApiKey, getApiKeyForRequest } from './keyVault';
import { withLlmLock } from './llmLock';
import { withRetry, type RetryOptions } from '../lib/retry';

/** 可注入依赖（默认接真实实现；测试可替换）。 */
export interface GenerationDeps {
  getSettings: () => Promise<Settings>;
  hasApiKey: () => Promise<boolean>;
  getApiKeyForRequest: () => Promise<string | null>;
  hasHostPermission: (origin: string) => Promise<boolean>;
  createProvider: (config: ProviderConfig) => LlmProvider;
  saveCurrentProject: (p: Project) => Promise<Result<void>>;
}

const realDeps: GenerationDeps = {
  getSettings,
  hasApiKey,
  getApiKeyForRequest,
  hasHostPermission,
  createProvider,
  saveCurrentProject,
};

/** 带超时的单次 provider 调用（重试由 009 在外层负责）。明文 Key 经请求链瞬时传入。 */
async function callWithTimeout(
  provider: LlmProvider,
  args: { system: string; user: string; model: string; apiKey: string },
  timeoutMs: number,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await provider.complete({
      system: args.system,
      user: args.user,
      model: args.model,
      apiKey: args.apiKey,
      maxTokens: MAX_OUTPUT_TOKENS,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 单次生成尝试：前置校验 → prompt → provider → ADR-6 解析，**不落库**。
 * 这是给 TASK-009 包裹（全局锁 + 失败退避重试）的最小单元——重试只会重发 LLM 调用，
 * 不会重复执行 saveCurrentProject。前置校验任一失败立即返回，不发出站请求（api-spec §3.3）。
 */
export async function generateStoryboardAttempt(
  input: { story: string; params?: Settings['params'] },
  deps: GenerationDeps = realDeps,
): Promise<Result<Project>> {
  // 2. 故事非空 / 3. 长度边界（ADR-2，trim 后码点数）
  const sv = validateStory(input.story);
  if (sv.code === 'EMPTY_STORY') return err('EMPTY_STORY', '请先输入故事内容。');
  if (sv.code === 'STORY_TOO_SHORT') return err('STORY_TOO_SHORT', '故事内容太短，至少 10 个字。');
  if (sv.code === 'STORY_TOO_LONG')
    return err('STORY_TOO_LONG', '故事太长了，请缩短到 5000 字以内。');

  const settings = await deps.getSettings();
  const params = input.params ?? settings.params;
  const provider = settings.provider;

  // 4. Provider 配置合法（ADR-4/ADR-5）
  const pv = validateProviderConfig(provider);
  if (pv === 'INVALID_PROVIDER_CONFIG')
    return err('INVALID_PROVIDER_CONFIG', 'Provider 配置无效，请到设置里检查类型与 baseUrl。');
  if (pv === 'MODEL_REQUIRED')
    return err('MODEL_REQUIRED', '请在设置里填写要使用的模型名。');

  // 5. 已配置且可解密 Key（ADR-1）。解密一次，经请求链瞬时传给 provider，不二次解密。
  if (!(await deps.hasApiKey())) return err('NO_API_KEY', '请先到设置里配置 API Key 再生成。');
  const apiKey = await deps.getApiKeyForRequest();
  if (apiKey == null)
    return err('KEY_DECRYPT_FAILED', '本地密钥已损坏，请到设置里重新输入 API Key。');

  // 6. 目标域名已有 host 权限（ADR-5）
  const origin = originForProvider(provider);
  if (!origin)
    return err('INVALID_PROVIDER_CONFIG', 'Provider 配置无效，请到设置里检查 baseUrl。');
  if (!(await deps.hasHostPermission(origin)))
    return err('HOST_PERMISSION_DENIED', `需要授权访问 ${origin} 才能调用，请在弹窗中允许。`);

  // 构造 prompt 并发起单次调用
  const { system, user } = buildStoryboardPrompt(input.story, params);
  let raw: string;
  try {
    raw = await callWithTimeout(
      deps.createProvider(provider),
      { system, user, model: provider.model, apiKey },
      STORYBOARD_TIMEOUT_MS,
    );
  } catch (e) {
    if (e instanceof ProviderCallError) return err(e.code, e.message, e.retriable, e.retryAfterMs);
    return err('NETWORK_ERROR', '网络异常，请稍后重试。', true);
  }

  // 解析 + 校验（ADR-6）
  const parsed = parseStoryboard(raw);
  if (!parsed.ok) return err('BAD_RESPONSE_FORMAT', '生成结果格式异常，请重试。');

  // 人物一致性注入（TASK-005）：把引用角色的统一外观注入对应镜头 prompt。
  const project = injectCharacterConsistency(buildProject(input.story, params, parsed));
  return ok(project);
}

/**
 * 生成完整分镜并落库（TASK-009 接入）：全局锁(并发=1) → 退避重试(仅 LLM 部分) → 落库一次。
 * - 进行中再次调用 → GENERATION_IN_PROGRESS（防重复提交，分镜与 BGM 共享锁）。
 * - 重试只重发 LLM 调用，不重复写 storage。
 */
export async function generateStoryboard(
  input: { story: string; params?: Settings['params'] },
  deps: GenerationDeps = realDeps,
  retryOpts: RetryOptions = {},
): Promise<Result<Project>> {
  return withLlmLock(async () => {
    const attempt = await withRetry(() => generateStoryboardAttempt(input, deps), retryOpts);
    if (!attempt.ok) return attempt;
    const saved = await deps.saveCurrentProject(attempt.data);
    if (!saved.ok) return saved;
    return ok(attempt.data);
  });
}

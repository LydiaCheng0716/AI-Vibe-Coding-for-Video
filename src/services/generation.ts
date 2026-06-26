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
import { STORYBOARD_TIMEOUT_MS, BGM_TIMEOUT_MS, MAX_OUTPUT_TOKENS } from '../core/config';
import { validateStory, validateProviderConfig } from '../core/validate';
import { buildStoryboardPrompt } from '../prompts/storyboard';
import { buildBgmPrompt } from '../prompts/bgm';
import {
  extractShotsPrefix,
  parseStoryboard,
  parseBgmPrompt,
  buildProject,
  parseShotRewrite,
  parseTransition,
  parseFirstFrame,
} from '../core/parse';
import { buildTransitionPrompt } from '../prompts/transition';
import { buildFirstFramePrompt } from '../prompts/firstFrame';
import { buildTranslatePrompt } from '../prompts/translate';
import { injectCharacterConsistency, injectCharactersIntoShot } from '../core/characters';
import { injectGlobalStyle, injectStyleIntoShot } from '../core/style';
import { buildShotRewritePrompt, pickOverride, type RewriteMode } from '../prompts/rewrite';
import type { BgmPrompt, Character, GlobalStyle, OutputLanguage, Shot, Transition } from '../core/models';
import { CHARACTER_SUGGEST_TIMEOUT_MS, CHARACTER_SUGGEST_MAX_TOKENS } from '../core/config';
import { ProviderCallError, createProvider, type LlmProvider, type LlmUsage } from './llm/provider';
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
  stream?: { onText: (delta: string) => void },
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const req = {
    system: args.system,
    user: args.user,
    model: args.model,
    apiKey: args.apiKey,
    maxTokens: MAX_OUTPUT_TOKENS,
    signal: ctrl.signal,
  };
  try {
    if (stream && provider.completeStream) {
      try {
        return await provider.completeStream(req, stream.onText);
      } catch (e) {
        if (ctrl.signal.aborted) throw e;
        return await provider.complete(req);
      }
    }
    return await provider.complete(req);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 共享前置校验：Provider 配置合法 + 已配置且可解密 Key + 目标域名已有 host 权限（api-spec §3.3/§3.4）。
 * 分镜与 BGM 复用，消除重复。返回 settings（含 params）与瞬时明文 apiKey（仅经请求链传递）。
 */
/** 前置校验所需的依赖子集（不含落库）；GenerationDeps 满足它，characterSuggest 也复用。 */
export type PreflightDeps = Pick<
  GenerationDeps,
  'getSettings' | 'hasApiKey' | 'getApiKeyForRequest' | 'hasHostPermission' | 'createProvider'
>;

export async function preflightProvider(
  deps: PreflightDeps,
  apiKeyOverride?: string,
): Promise<Result<{ settings: Settings; apiKey: string }>> {
  const settings = await deps.getSettings();
  const provider = settings.provider;

  const pv = validateProviderConfig(provider);
  if (pv === 'INVALID_PROVIDER_CONFIG')
    return err('INVALID_PROVIDER_CONFIG', 'Provider 配置无效，请到设置里检查类型与 baseUrl。');
  if (pv === 'MODEL_REQUIRED') return err('MODEL_REQUIRED', '请在设置里填写要使用的模型名。');

  // Key 来源：①一次性 override（不保存 Key 模式，用户当次手输，ADR-1 #8，经请求链传递、不存储）；
  // ②否则用已落盘的加密 Key（解密一次，经请求链瞬时传给 provider，不二次解密）。
  let apiKey: string;
  const override = apiKeyOverride?.trim();
  if (override) {
    apiKey = override;
  } else {
    if (!(await deps.hasApiKey())) return err('NO_API_KEY', '请先到设置里配置 API Key 再生成。');
    const decrypted = await deps.getApiKeyForRequest();
    if (decrypted == null)
      return err('KEY_DECRYPT_FAILED', '本地密钥已损坏，请到设置里重新输入 API Key。');
    apiKey = decrypted;
  }

  // 目标域名已有 host 权限（ADR-5）
  const origin = originForProvider(provider);
  if (!origin) return err('INVALID_PROVIDER_CONFIG', 'Provider 配置无效，请到设置里检查 baseUrl。');
  if (!(await deps.hasHostPermission(origin)))
    return err('HOST_PERMISSION_DENIED', `需要授权访问 ${origin} 才能调用，请在弹窗中允许。`);

  return ok({ settings, apiKey });
}

/** 把 provider 异常归一成 Result.err（含 retryAfterMs 透传）。 */
function providerErr(e: unknown): Result<never> {
  if (e instanceof ProviderCallError) return err(e.code, e.message, e.retriable, e.retryAfterMs);
  return err('NETWORK_ERROR', '网络异常，请稍后重试。', true);
}

interface OneShotPrompt {
  system: string;
  user: string;
}

interface OneShotContext {
  settings: Settings;
}

export interface RunOneShotLlmOptions<T> {
  deps: PreflightDeps;
  apiKey?: string;
  buildPrompt: (ctx: OneShotContext) => OneShotPrompt;
  parse: (raw: string, ctx: OneShotContext) => Result<T>;
  timeoutMs: number;
  maxTokens: number;
  retryOpts?: RetryOptions;
  /** false = 单次 attempt（不加锁不重试），供既有 *Attempt 导出复用。默认 true。 */
  lock?: boolean;
  /** 输入级校验，运行在每次 attempt 内、preflight 前。 */
  validate?: () => Result<void> | undefined;
}

/**
 * 单发 LLM 通用管线：可作为一次 attempt，也可默认包裹全局锁 + 退避重试。
 * 每次重试都会重新跑 validate/preflight，与既有 withRetry(() => *Attempt()) 语义一致。
 */
export async function runOneShotLlm<T>(opts: RunOneShotLlmOptions<T>): Promise<Result<T>> {
  const attempt = async (): Promise<Result<T>> => {
    const validated = opts.validate?.();
    if (validated && !validated.ok) return validated;

    const pre = await preflightProvider(opts.deps, opts.apiKey);
    if (!pre.ok) return pre;
    const { settings, apiKey } = pre.data;
    const { system, user } = opts.buildPrompt({ settings });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    let raw: string;
    try {
      raw = await opts.deps.createProvider(settings.provider).complete({
        system,
        user,
        model: settings.provider.model,
        apiKey,
        maxTokens: opts.maxTokens,
        signal: ctrl.signal,
      });
    } catch (e) {
      return providerErr(e);
    } finally {
      clearTimeout(timer);
    }
    return opts.parse(raw, { settings });
  };

  if (opts.lock === false) return attempt();
  return withLlmLock(() => withRetry(attempt, opts.retryOpts));
}

/**
 * 单次生成尝试：前置校验 → prompt → provider → ADR-6 解析，**不落库**。
 * 这是给 TASK-009 包裹（全局锁 + 失败退避重试）的最小单元——重试只会重发 LLM 调用，
 * 不会重复执行 saveCurrentProject。前置校验任一失败立即返回，不发出站请求（api-spec §3.3）。
 */
export interface StoryboardGenerationResult {
  project: Project;
  usage?: LlmUsage;
}

export async function generateStoryboardAttempt(
  input: { story: string; params?: Settings['params']; apiKey?: string },
  deps: GenerationDeps = realDeps,
): Promise<Result<Project>> {
  const r = await generateStoryboardAttemptWithUsage(input, deps);
  return r.ok ? ok(r.data.project) : r;
}

export async function generateStoryboardAttemptWithUsage(
  input: { story: string; params?: Settings['params']; apiKey?: string },
  deps: GenerationDeps = realDeps,
  onProgress?: (p: GenerationProgress) => void,
): Promise<Result<StoryboardGenerationResult>> {
  // 故事非空 / 长度边界（ADR-2，trim 后码点数）
  const sv = validateStory(input.story);
  if (sv.code === 'EMPTY_STORY') return err('EMPTY_STORY', '请先输入故事内容。');
  if (sv.code === 'STORY_TOO_SHORT') return err('STORY_TOO_SHORT', '故事内容太短，至少 10 个字。');
  if (sv.code === 'STORY_TOO_LONG')
    return err('STORY_TOO_LONG', '故事太长了，请缩短到 5000 字以内。');

  const pre = await preflightProvider(deps, input.apiKey);
  if (!pre.ok) return pre;
  const { settings, apiKey } = pre.data;
  const params = input.params ?? settings.params;
  const provider = settings.provider;

  // 构造 prompt 并发起单次调用
  const { system, user } = buildStoryboardPrompt(input.story, params);
  let raw: string;
  const llmProvider = deps.createProvider(provider);
  let streamedBuffer = '';
  let shotsReady = 0;
  try {
    raw = await callWithTimeout(
      llmProvider,
      { system, user, model: provider.model, apiKey },
      STORYBOARD_TIMEOUT_MS,
      {
        onText: (delta) => {
          streamedBuffer += delta;
          const nextReady = extractShotsPrefix(streamedBuffer).length;
          if (nextReady > shotsReady) {
            shotsReady = nextReady;
            onProgress?.({
              phase: 'requesting',
              message: `已生成 ${nextReady} 个镜头…`,
              shotsReady: nextReady,
            });
          }
        },
      },
    );
  } catch (e) {
    return providerErr(e);
  }

  // 解析 + 校验（ADR-6）。传入输出语言，供 Issue #29 用 profile 合成 appearance 兜底。
  const parsed = parseStoryboard(raw, params.outputLanguage);
  if (!parsed.ok) return err('BAD_RESPONSE_FORMAT', '生成结果格式异常，请重试。');

  // 人物一致性注入（TASK-005）：把引用角色的统一外观注入对应镜头 prompt。
  // 人物一致性 + 全局风格（Issue #55）注入：把锁定角色/风格锚点注入各镜头 prompt。
  const project = injectGlobalStyle(injectCharacterConsistency(buildProject(input.story, params, parsed)));
  // 每次尝试各自 new 一个 provider，故此处的 lastUsage 必来自当前成功尝试（Kimi P2）。
  const usage = llmProvider.lastUsage?.() ?? undefined;
  return ok({ project, ...(usage ? { usage } : {}) });
}

/** 生成进度阶段（Issue #33）。 */
export type GenerationPhase = 'requesting' | 'saving' | 'done' | 'error';
export interface GenerationProgress {
  phase: GenerationPhase;
  /** requesting 阶段的尝试序号（含重试）。 */
  attempt?: number;
  maxAttempts?: number;
  message: string;
  /** done 阶段携带真实 provider token 用量；provider 未返回 usage 时不存在。 */
  usage?: LlmUsage;
  /** requesting 阶段：流式增量解析出的完整镜头数量。 */
  shotsReady?: number;
}

/**
 * 生成完整分镜并落库（TASK-009 接入）：全局锁(并发=1) → 退避重试(仅 LLM 部分) → 落库一次。
 * - 进行中再次调用 → GENERATION_IN_PROGRESS（防重复提交，分镜与 BGM 共享锁）。
 * - 重试只重发 LLM 调用，不重复写 storage。
 * - onProgress（Issue #33/#69）：上报请求/重试/逐镜头/保存/完成/失败阶段，避免长故事被误判为卡死；
 *   与锁+重试兼容，失败时上报 error 阶段（状态正确回退）。流式不可用时仍只有「尝试次数 + 阶段」。
 */
export async function generateStoryboard(
  input: { story: string; params?: Settings['params']; apiKey?: string },
  deps: GenerationDeps = realDeps,
  retryOpts: RetryOptions = {},
  onProgress?: (p: GenerationProgress) => void,
): Promise<Result<Project>> {
  const r = await generateStoryboardWithUsage(input, deps, retryOpts, onProgress);
  return r.ok ? ok(r.data.project) : r;
}

export async function generateStoryboardWithUsage(
  input: { story: string; params?: Settings['params']; apiKey?: string },
  deps: GenerationDeps = realDeps,
  retryOpts: RetryOptions = {},
  onProgress?: (p: GenerationProgress) => void,
): Promise<Result<StoryboardGenerationResult>> {
  const report = onProgress ?? (() => {});
  return withLlmLock(async () => {
    const attempt = await withRetry(() => generateStoryboardAttemptWithUsage(input, deps, report), {
      ...retryOpts,
      onAttempt: (n, max) =>
        report({
          phase: 'requesting',
          attempt: n,
          maxAttempts: max,
          message: n > 1 ? `生成失败，正在重试（第 ${n}/${max} 次）…` : '正在请求 AI 生成分镜…',
        }),
    });
    if (!attempt.ok) {
      report({ phase: 'error', message: attempt.error.message });
      return attempt;
    }
    report({ phase: 'saving', message: '正在保存分镜…' });
    const saved = await deps.saveCurrentProject(attempt.data.project);
    if (!saved.ok) {
      report({ phase: 'error', message: saved.error.message });
      return saved;
    }
    report({ phase: 'done', message: '分镜生成完成', ...(attempt.data.usage ? { usage: attempt.data.usage } : {}) });
    return ok(attempt.data);
  });
}

/** UI project store path：生成 Project 但不直接写 currentProject，由 store 统一落库与广播。 */
export function generateStoryboardForStore(
  input: { story: string; params?: Settings['params']; apiKey?: string },
  retryOpts: RetryOptions = {},
  onProgress?: (p: GenerationProgress) => void,
): Promise<Result<Project>> {
  return generateStoryboardForStoreWithUsage(input, retryOpts, onProgress).then((r) =>
    r.ok ? ok(r.data.project) : r,
  );
}

export function generateStoryboardForStoreWithUsage(
  input: { story: string; params?: Settings['params']; apiKey?: string },
  retryOpts: RetryOptions = {},
  onProgress?: (p: GenerationProgress) => void,
): Promise<Result<StoryboardGenerationResult>> {
  return generateStoryboardWithUsage(
    input,
    { ...realDeps, saveCurrentProject: async () => ok(undefined) },
    retryOpts,
    onProgress,
  );
}

// ---- BGM 提示词生成（TASK-007，api-spec §3.4）----

export interface BgmInput {
  story?: string;
  project?: Project;
  language: OutputLanguage;
  /** 一次性 Key override（不保存 Key 模式，ADR-1 #8）。 */
  apiKey?: string;
}

/**
 * 单次 BGM 尝试：校验输入 + 共享前置校验 → provider（60s）→ 解析，**不持久化**、**不加锁**。
 * 仅供 TASK-009 锁/重试包裹与单测使用；组件层应调 `generateBgmPrompt`（带全局锁），勿绕过。
 */
export async function generateBgmPromptAttempt(
  input: BgmInput,
  deps: GenerationDeps = realDeps,
): Promise<Result<BgmPrompt>> {
  // story 与 project 至少其一（api-spec §3.4）
  const hasStory = !!input.story && input.story.trim() !== '';
  const hasProject = !!input.project && input.project.shots.length > 0;
  if (!hasStory && !hasProject)
    return err('NO_GENERATION_INPUT', '请先输入故事或生成分镜，再生成 BGM 提示词。');

  const pre = await preflightProvider(deps, input.apiKey);
  if (!pre.ok) return pre;
  const { settings, apiKey } = pre.data;
  const provider = settings.provider;

  const { system, user } = buildBgmPrompt(input, input.language);
  let raw: string;
  try {
    raw = await callWithTimeout(
      deps.createProvider(provider),
      { system, user, model: provider.model, apiKey },
      BGM_TIMEOUT_MS,
    );
  } catch (e) {
    return providerErr(e);
  }

  const prompt = parseBgmPrompt(raw);
  if (!prompt) return err('BAD_RESPONSE_FORMAT', '生成结果格式异常，请重试。');
  return ok({ prompt, language: input.language });
}

/**
 * 生成 BGM 提示词（TASK-007）：与分镜共享同一把全局锁（互斥，ARCH-MED-004）+ 退避重试。
 * **不自行持久化**——调用方成功后用 project store 写回（api-spec §3.4）。
 */
export async function generateBgmPrompt(
  input: BgmInput,
  deps: GenerationDeps = realDeps,
  retryOpts: RetryOptions = {},
): Promise<Result<BgmPrompt>> {
  return withLlmLock(() => withRetry(() => generateBgmPromptAttempt(input, deps), retryOpts));
}

// ---- 单镜头重写管线（Issue #30 + #32，三入口统一）----

export interface RewriteShotInput {
  /** 当前项目内存态（story / params / characters / shots）。 */
  project: Project;
  shotId: string;
  mode: RewriteMode;
  /** mode=feedback：用户一句反馈。 */
  feedback?: string;
  /** mode=params（#32）：用户改后的景别/运镜/时长，以此为准覆盖。 */
  paramOverrides?: Partial<Pick<Shot, 'shotSize' | 'cameraMovement' | 'durationSuggestion'>>;
  /** 一次性 Key override（不保存 Key 模式）。 */
  apiKey?: string;
}

/**
 * 单次单镜头重写尝试：前置校验 → 单镜头 prompt（三模式）→ provider → 解析 → 组装 + 锁定角色注入，
 * **不锁不落库**。保留原 id/index/characterRefs；params 模式三参数以用户选值为准；editedByUser=false。
 * 复用 #29 `injectCharactersIntoShot`：锁定角色锚点逐字注入该镜头、不被模型改写。
 */
export async function rewriteShotAttempt(
  input: RewriteShotInput,
  deps: PreflightDeps = realDeps,
): Promise<Result<Shot>> {
  const shot = input.project.shots.find((s) => s.id === input.shotId);
  if (!shot) return err('NO_GENERATION_INPUT', '找不到要重写的镜头。');
  if (input.mode === 'feedback' && !(input.feedback && input.feedback.trim()))
    return err('NO_GENERATION_INPUT', '请先输入一句优化反馈。');

  const pre = await preflightProvider(deps, input.apiKey);
  if (!pre.ok) return pre;
  const { settings, apiKey } = pre.data;
  const params = input.project.params ?? settings.params;
  const provider = settings.provider;

  const { system, user } = buildShotRewritePrompt(
    {
      story: input.project.story,
      params,
      shot,
      feedback: input.feedback,
      paramOverrides: input.paramOverrides,
    },
    input.mode,
  );

  let raw: string;
  try {
    raw = await callWithTimeout(
      deps.createProvider(provider),
      { system, user, model: provider.model, apiKey },
      STORYBOARD_TIMEOUT_MS,
    );
  } catch (e) {
    return providerErr(e);
  }

  const parsed = parseShotRewrite(raw);
  if (!parsed) return err('BAD_RESPONSE_FORMAT', '重写结果格式异常，请重试。');

  // 空串 override 回退到模型解析值（`??` 会把 '' 当有效值 → shotSize:'' 等无效产出，Kimi P2）。
  // 双语（Issue #41）：promptEn 取模型新值，模型省略则保留原 promptEn，保持中英一致。
  const merged: Shot = {
    ...shot,
    summary: parsed.summary,
    shotSize: pickOverride(input.paramOverrides?.shotSize, parsed.shotSize),
    cameraMovement: pickOverride(input.paramOverrides?.cameraMovement, parsed.cameraMovement),
    durationSuggestion: pickOverride(input.paramOverrides?.durationSuggestion, parsed.durationSuggestion),
    prompt: parsed.prompt,
    ...(parsed.promptEn || shot.promptEn ? { promptEn: parsed.promptEn ?? shot.promptEn } : {}),
    editedByUser: false,
  };
  // 锁定角色锚点 + 全局风格锚点（Issue #55）注入：重写/调参后仍保持，不被模型改写。
  const byId = new Map(input.project.characters.map((c) => [c.id, c]));
  const withChars = injectCharactersIntoShot(merged, byId, params.outputLanguage);
  const injected = injectStyleIntoShot(withChars, input.project.globalStyle, params.outputLanguage);
  return ok(injected);
}

/**
 * 重写单镜头（Issue #30 A/B + #32）：与整单生成/BGM 共享全局锁（互斥防重复提交）+ 退避重试。
 * **不自行落库**——UI 成功后调 project store 持久化（与 BGM 一致的约定）。
 */
export async function rewriteShot(
  input: RewriteShotInput,
  deps: PreflightDeps = realDeps,
  retryOpts: RetryOptions = {},
): Promise<Result<Shot>> {
  return withLlmLock(() => withRetry(() => rewriteShotAttempt(input, deps), retryOpts));
}

// ---- 转场建议生成（Issue #54）----

export interface TransitionInput {
  prevShot: Shot;
  nextShot: Shot;
  /** 转场类型 id（core/transitions）。 */
  type: string;
  /** 输出语言：应传**当前项目**的语言，而非 settings（用户可能改过设置，Codex P2）。 */
  lang?: OutputLanguage;
  apiKey?: string;
}

/** 单次转场生成尝试：前置校验 → prompt → provider（短超时）→ 解析，不锁不存。 */
export async function generateTransitionAttempt(
  input: TransitionInput,
  deps: PreflightDeps = realDeps,
): Promise<Result<Transition>> {
  return runTransition(input, deps, false);
}

/** 生成转场建议（与分镜/BGM 共享全局锁 + 退避重试）。UI 成功后调 project store 落库。 */
export async function generateTransition(
  input: TransitionInput,
  deps: PreflightDeps = realDeps,
  retryOpts: RetryOptions = {},
): Promise<Result<Transition>> {
  return runTransition(input, deps, true, retryOpts);
}

function runTransition(
  input: TransitionInput,
  deps: PreflightDeps,
  lock: boolean,
  retryOpts?: RetryOptions,
): Promise<Result<Transition>> {
  return runOneShotLlm({
    deps,
    apiKey: input.apiKey,
    lock,
    retryOpts,
    timeoutMs: CHARACTER_SUGGEST_TIMEOUT_MS,
    maxTokens: CHARACTER_SUGGEST_MAX_TOKENS,
    buildPrompt: ({ settings }) =>
      buildTransitionPrompt(
        input.prevShot,
        input.nextShot,
        input.type,
        input.lang ?? settings.params.outputLanguage,
      ),
    parse: (raw) => {
      const parsed = parseTransition(raw);
      if (!parsed) return err('BAD_RESPONSE_FORMAT', '转场生成结果异常，请重试。');
      return ok({ type: input.type, note: parsed.note, ...(parsed.noteEn ? { noteEn: parsed.noteEn } : {}) });
    },
  });
}

// ---- 首帧图像提示词生成（Issue #57）----

export interface FirstFrameInput {
  shot: Shot;
  characters: Character[];
  globalStyle?: GlobalStyle;
  /** 输出语言：传当前**项目**语言（#54 P2 教训）。 */
  lang?: OutputLanguage;
  apiKey?: string;
}

export interface FirstFrameResult {
  firstFramePrompt: string;
  firstFramePromptEn?: string;
}

/** 单次首帧生成尝试：前置校验 → prompt（注入角色+风格）→ provider → 解析，不锁不存。 */
export async function generateFirstFrameAttempt(
  input: FirstFrameInput,
  deps: PreflightDeps = realDeps,
): Promise<Result<FirstFrameResult>> {
  return runFirstFrame(input, deps, false);
}

/** 生成首帧图像提示词（与分镜/BGM 共享全局锁 + 退避重试）。UI 成功后调 project store 落库。 */
export async function generateFirstFrame(
  input: FirstFrameInput,
  deps: PreflightDeps = realDeps,
  retryOpts: RetryOptions = {},
): Promise<Result<FirstFrameResult>> {
  return runFirstFrame(input, deps, true, retryOpts);
}

function runFirstFrame(
  input: FirstFrameInput,
  deps: PreflightDeps,
  lock: boolean,
  retryOpts?: RetryOptions,
): Promise<Result<FirstFrameResult>> {
  return runOneShotLlm({
    deps,
    apiKey: input.apiKey,
    lock,
    retryOpts,
    timeoutMs: STORYBOARD_TIMEOUT_MS,
    maxTokens: MAX_OUTPUT_TOKENS,
    buildPrompt: ({ settings }) =>
      buildFirstFramePrompt(
        input.shot,
        input.characters,
        input.globalStyle,
        input.lang ?? settings.params.outputLanguage,
      ),
    parse: (raw) => {
      const parsed = parseFirstFrame(raw);
      if (!parsed) return err('BAD_RESPONSE_FORMAT', '首帧提示词生成结果异常，请重试。');
      return ok({
        firstFramePrompt: parsed.firstFrame,
        ...(parsed.firstFrameEn ? { firstFramePromptEn: parsed.firstFrameEn } : {}),
      });
    },
  });
}

// ---- 轻量翻译（Issue #53：双语自动同步）----

export interface TranslateInput {
  text: string;
  targetLang: 'zh' | 'en';
  apiKey?: string;
}

/** 单次翻译尝试：校验非空 → 前置校验 → prompt → provider（短超时）→ 译文（纯文本），不锁不存。 */
export async function translateTextAttempt(
  input: TranslateInput,
  deps: PreflightDeps = realDeps,
): Promise<Result<string>> {
  return runTranslateText(input, deps, false);
}

/** 翻译文本（与生成/重写共享全局锁 + 退避重试）。失败由 UI 保留用户输入、提示重试。 */
export async function translateText(
  input: TranslateInput,
  deps: PreflightDeps = realDeps,
  retryOpts: RetryOptions = {},
): Promise<Result<string>> {
  return runTranslateText(input, deps, true, retryOpts);
}

function runTranslateText(
  input: TranslateInput,
  deps: PreflightDeps,
  lock: boolean,
  retryOpts?: RetryOptions,
): Promise<Result<string>> {
  return runOneShotLlm({
    deps,
    apiKey: input.apiKey,
    lock,
    retryOpts,
    timeoutMs: CHARACTER_SUGGEST_TIMEOUT_MS,
    maxTokens: MAX_OUTPUT_TOKENS,
    validate: () =>
      input.text.trim() ? undefined : err('NO_GENERATION_INPUT', '没有可翻译的内容。'),
    buildPrompt: () => buildTranslatePrompt(input.text, input.targetLang),
    parse: (raw) => {
      const out = raw.trim();
      if (!out) return err('BAD_RESPONSE_FORMAT', '翻译结果异常，请重试。');
      return ok(out);
    },
  });
}

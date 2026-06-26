# Issue #67 去重设计：一次性 Key UI + 单发 LLM 服务

## 目标

减少两类近重复代码：

1. 不落盘一次性 Key 输入在 7 个组件中重复维护状态、显示条件、清理逻辑。
2. 单发 LLM 服务重复实现 preflight、全局锁、短超时、provider.complete、解析、providerErr 和退避重试。

约束：

- 产品名保持 StoryPop。
- 不改功能标识符，如 `buildStoryboardPrompt`、`storyboard-keys`。
- 对外服务函数签名与返回保持不变。
- 组件行为与视觉保持等价；隐私语义统一为一次性 Key 用完即清。

## 一次性 Key 抽象

新增 `src/components/OneTimeKeyInput.tsx`：

```ts
export interface OneTimeKeyState {
  persistApiKey: boolean;
  tempKey: string;
  apiKey?: string;
  hasKey: boolean;
  setTempKey(value: string): void;
  clear(): void;
}

export function useOneTimeKey(options?: { persistApiKey?: boolean }): OneTimeKeyState;

export function OneTimeKeyInput(props: {
  oneTimeKey: OneTimeKeyState;
  placeholder: string;
  className?: string;
}): JSX.Element | null;
```

语义：

- `options.persistApiKey` 传入时，hook 直接使用外部状态，适配 `App` 已下传的 `persistApiKey`。
- 未传入时，hook 通过 `getSettings()` 读取 `persistApiKey`，适配 `StoryInput`、`CharacterPanel`、`BgmPanel` 现状。
- `apiKey` 是 `tempKey.trim()` 后的值；`persistApiKey=true` 或空串时为 `undefined`。
- `hasKey` 只表示不保存模式下是否已有非空一次性 Key。
- `clear()` 清空本地 `tempKey`；所有 LLM/测试连接使用后在 `finally` 调用。
- `<OneTimeKeyInput>` 仅在 `!oneTimeKey.persistApiKey` 时渲染，外观 class 和 placeholder 由调用方传入以保持等价。

替换点：

| 文件 | 来源模式 | 用途 |
|---|---|---|
| `StoryInput` | hook 读取 settings | 整单分镜生成 |
| `SettingsPanel` | 外部 `settings.persistApiKey` | 测试连接一次性 Key |
| `CharacterPanel` | hook 读取 settings | 角色字段重新建议 |
| `StylePanel` | 外部 prop | 风格字段重新建议 |
| `ShotCard` | 外部 prop | 单镜重写、首帧、自动翻译 |
| `ShotList` | 外部 prop | 插入镜头即时生成、转场生成 |
| `BgmPanel` | hook 读取 settings | BGM 生成 |

## 单发 LLM 抽象

在 `src/services/generation.ts` 导出泛型 helper：

```ts
export function runOneShotLlm<T>(opts: {
  deps: PreflightDeps;
  apiKey?: string;
  buildPrompt(ctx: { settings: Settings }): { system: string; user: string };
  parse(raw: string, ctx: { settings: Settings }): Result<T>;
  timeoutMs: number;
  maxTokens: number;
  retryOpts?: RetryOptions;
  lock?: boolean;
}): Promise<Result<T>>;
```

语义：

- 默认 `lock=true`：执行 `withLlmLock(() => withRetry(attempt, retryOpts))`，供公开服务函数使用。
- `lock=false`：只跑一次 attempt，不加锁不重试，供现有 `*Attempt` 导出保持测试接缝。
- 每次 attempt 内部重新执行 `preflightProvider`，与现有 `withRetry(() => attempt())` 语义一致。
- attempt 内部统一创建 `AbortController`、设置 `timeoutMs`、调用 `complete({ system, user, model, apiKey, maxTokens, signal })`。
- provider 异常统一走既有 `providerErr`；解析失败由调用方 `parse` 返回对应 `Result.err`，保留各服务原文案。

复用范围：

| 服务 | Attempt 保持 | Public 保持 | parse 映射 |
|---|---|---|---|
| `suggestCharacterField` | `lock:false` | 默认 lock/retry | `parseFieldSuggestions` |
| `suggestStyleField` | `lock:false` | 默认 lock/retry | `parseFieldSuggestions` |
| `generateTransition` | `lock:false` | 默认 lock/retry | `parseTransition` 后补 `type` |
| `generateFirstFrame` | `lock:false` | 默认 lock/retry | `parseFirstFrame` 后改字段名 |
| `translateText` | `lock:false` | 默认 lock/retry | `raw.trim()` |

不纳入本次泛型的服务：

- `generateStoryboard` 有额外输入校验、进度、落库阶段、人物/风格注入。
- `generateBgmPrompt` 和 `rewriteShot` 也有额外校验/合并/注入逻辑；本 Issue 验收只要求指定 5 个单发服务。

## 测试

- 新增 `tests/unit/oneTimeKey.test.tsx`：覆盖 settings 读取、外部 `persistApiKey`、输入显示条件、trim 后 `apiKey`、`clear()`。
- 新增 `tests/unit/oneShotLlm.test.ts`：覆盖成功请求参数、前置失败不建 provider、默认锁拒绝、可重试 provider 错误。
- 保留并跑通既有 `styleSuggest`、`characterSuggest`、`transition`、`firstFrame`、`translate` 测试，验证签名和行为不回归。

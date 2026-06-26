# Issue #68 设计文档 — 真实 token 用量

> 分支：`feature/issue-68-real-tokens` → `develop` · 2026-06-26 · merge-when-green

## 1. 背景与目标

Issue #36 在 `core/tokens.ts` 集中提供启发式 token 估算，用于生成后的成本提示。现在 OpenAI 兼容与 Anthropic 响应本身提供真实 usage，本任务改为优先显示 provider 返回的真实输入/输出 token，缺失 usage 时仍回退估算并明确标注「估算」。

## 2. Provider 契约

保持 `LlmProvider.complete(req): Promise<string>` 不变，继续只返回待解析文本，避免破坏现有调用方与测试。

新增可选只读方法：

```ts
lastUsage?(): LlmUsage | null
```

`LlmUsage` 只包含计数：

```ts
interface LlmUsage {
  input: number;
  output: number;
}
```

适配器在每次 `complete()` 开始时清空上一轮 usage；成功解析响应 JSON 后读取 usage 并缓存；错误、截断或缺失字段时保持 `null`。`probe()` 不读取正文，不设置 usage。

解析规则：

- OpenAI 兼容：`usage.prompt_tokens` → `input`，`usage.completion_tokens` → `output`。
- Anthropic：`usage.input_tokens` → `input`，`usage.output_tokens` → `output`。
- 两个字段都必须是非负有限 number；否则视为无 usage。

## 3. Generation 透传

整单分镜生成只在同一个 provider 实例完成 `complete()` 后读取 `lastUsage()`。为避免把 usage 塞进 `Project` 持久化模型，新增结果包装：

```ts
interface StoryboardGenerationResult {
  project: Project;
  usage?: LlmUsage;
}
```

新增 `generateStoryboardWithUsage()` / `generateStoryboardForStoreWithUsage()` 作为真实 usage 通道；保留 `generateStoryboard()` / `generateStoryboardForStore()` 返回 `Result<Project>` 的既有契约，内部通过包装函数取 `.project`，确保旧调用方不破。

进度 `done` 阶段增加可选 `usage?: LlmUsage`，让 UI 或后续调用方可在完成事件里拿到同一份 usage。失败和保存阶段不携带 usage。

## 4. UI 优先级

`StoryInput` 改调用 `generateStoryboardForStoreWithUsage()`：

1. 生成成功且 `r.data.usage` 存在：显示 `生成完成（输入 N / 输出 M tokens）`。
2. 无 usage：调用 `estimateProjectTokens(text, project)`，显示 `生成完成（估算 输入 ~N / 输出 ~M tokens，仅供参考）`。

实时输入框下方的输入 token 预估仍保留，继续由 `core/tokens.ts` 集中维护。

## 5. 隐私与安全

usage 只包含数字计数，不包含 prompt、completion、API Key、模型响应正文或错误正文。适配器错误路径沿用现有 ProviderCallError 文案，不回传 provider 原始错误体。

## 6. 测试计划

- `openaiCompatible.test.ts`：解析 OpenAI usage，`complete()` 文本返回不变；缺失 usage 时 `lastUsage()` 为 `null`。
- `anthropic.test.ts`：解析 Anthropic usage，文本返回不变。
- `generation.test.ts`：`generateStoryboardWithUsage()` 返回并在 done 进度透传 usage；旧 `generateStoryboard()` 仍返回 `Project`。
- `StoryInput.test.tsx`：真实 usage 优先显示；无 usage 时回退估算并标注「估算」。

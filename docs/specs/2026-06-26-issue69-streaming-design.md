# Issue #69 真正的流式 / 逐镜进度设计

## 背景与目标

StoryPop 当前分镜生成是一次性请求：`provider.complete()` 返回完整 JSON 文本后，`parseStoryboard()` 统一解析并落库。Issue #69 要在不破坏非流式路径的前提下，给支持 SSE 的 OpenAI 兼容 Provider 增加真实流式输出，让 UI 在模型生成期间看到「已完成 N 个镜头」的进度。

本任务是增量增强：

- `complete`、`probe`、`lastUsage` 现有契约不变。
- Anthropic 暂不实现流式，保持自动回退一次性。
- 最终结果仍以 `parseStoryboard(raw)` 为唯一权威校验。
- 流式不可用、流式失败、增量解析拿不到镜头时，都不能影响现有非流式成功路径。

## 分层方案

### 1. Provider 可选流式能力

在 `LlmProvider` 上新增可选方法：

```ts
completeStream?(req: CompleteRequest, onText: (delta: string) => void): Promise<string>;
```

契约：

- 仅表示 Provider 支持「Chat Completions SSE 增量文本」。
- 每收到一个 `choices[0].delta.content` 字符串片段，调用 `onText(delta)`。
- Promise resolve 时返回完整累积文本，与 `complete()` 返回值同契约，供上层最终解析。
- 失败、中断、非 2xx 与 `complete()` 一样抛 `ProviderCallError` 或经 `mapFetchError()` 映射。
- 成功后 `lastUsage()` 返回最近一次成功流式调用的 token usage；若 provider 未给 usage，返回 `null`。

OpenAI 兼容实现：

- 请求体复用现有 `buildBody(req, withResponseFormat)`，再加：
  - `stream: true`
  - `stream_options: { include_usage: true }`
- SSE 解析用原生 `fetch` + `ReadableStreamDefaultReader`：
  - `TextDecoder.decode(chunk, { stream: true })` 累积文本。
  - 按 `\n\n` 分割事件，兼容 `\r\n\r\n`。
  - 每个事件内读取所有 `data:` 行并拼接。
  - `data: [DONE]` 结束。
  - JSON 帧中取 `choices[0].delta.content` 作为增量。
  - usage 帧中取 `usage.prompt_tokens/completion_tokens` 更新 `lastUsage`。
- HTTP 错误走既有状态码映射；429 继续保留 `Retry-After`。
- 仍保留 `response_format` 不支持时去字段重试一次，以兼容非 OpenAI 厂商。

Anthropic：

- 不实现 `completeStream`，上层自动调用 `complete`。

### 2. 增量解析纯函数

新增 `extractShotsPrefix(buffer: string): unknown[]`，只负责从不完整 JSON 文本中提取 `shots` 数组里已经完整闭合的元素。

算法：

1. 扫描字符串，使用 JSON 字符串状态机定位对象键 `"shots"`：
   - 感知字符串、反斜杠转义。
   - 键名后跳过空白，要求下一个非空白字符是 `:`。
2. 从冒号后寻找 `[`，进入 `shots` 数组扫描。
3. 在数组内部维护：
   - `depth`：对象/数组嵌套深度。
   - `inStr` / `esc`：字符串与转义状态。
   - `valueStart`：当前顶层元素起点。
4. 只有当顶层元素完整闭合，并在顶层遇到 `,` 或数组 `]` 时，才尝试 `JSON.parse()` 该元素。
5. 解析失败、半截输入、键不存在、数组未出现均返回当前已完成项或 `[]`，绝不抛异常。

边界：

- 字符串中的 `{}`、`[]`、`"`、`\"` 不影响深度。
- shot 内部可有嵌套对象/数组，如 `characterRefs`、profile 字段。
- 未闭合的最后一个 shot 不计入。
- 该函数不做业务校验；最终字段、数量、角色引用仍由 `parseStoryboard` 处理。

### 3. 编排层

新增内部流式尝试：在 `generateStoryboardAttemptWithUsage()` 内优先使用 `llmProvider.completeStream`。

流程：

1. 保持原前置校验、prompt 构造、超时控制、provider 创建位置。
2. 若 provider 有 `completeStream`：
   - 调用 `completeStream(req, onText)`。
   - `onText` 中累积 buffer，调用 `extractShotsPrefix(buffer)`。
   - 当已完成 shot 数大于上次上报值时，发送进度 `{ phase: 'requesting', shotsReady: n }`。
   - 流结束后拿完整文本，继续调用 `parseStoryboard(raw, lang)`。
3. 若没有 `completeStream`，直接走现有 `complete`。
4. 若流式调用抛错：
   - 若请求已被 abort，则返回该错误，不做 fallback，避免用户取消或超时后继续发第二次请求。
   - 其他错误回退调用同一个 provider 的 `complete()` 一次，保证非流式路径可用。
5. `withRetry`、全局锁、保存阶段、完成/失败阶段不变。流式失败后 fallback 仍属于同一次 attempt；若 fallback 也失败，再由既有 retry 策略处理。

`GenerationProgress` 增加可选字段：

```ts
shotsReady?: number;
```

### 4. UI

`StoryInput` 复用现有 `onProgress`：

- 若 `p.shotsReady` 存在且 phase 为 `requesting`，显示 `已生成 N 个镜头…`。
- 其他阶段继续显示原有文案。
- 流式不可用时没有 `shotsReady`，UI 行为与之前一致。

当前 UI 只在完整项目成功后渲染卡片；本任务先交付最低风险的逐镜计数。后续若要显示半成品镜头预览，应在 project store 增加明确的 draft/preview 状态，避免把未通过 `parseStoryboard` 的数据混入正式项目。

## Usage 与重试关系

- 非流式 usage 逻辑不变。
- 流式成功时，OpenAI 兼容适配器从 usage SSE 帧写入 `lastUsage`。
- 流式失败并 fallback 成功时，`complete()` 会重置并写入非流式 usage。
- 编排层仍在成功 parse 后读取 `llmProvider.lastUsage?.()`，所以 usage 只来自当前成功 attempt。

## 锁、超时与回退

- `generateStoryboardWithUsage()` 的 `withLlmLock()` 不变，分镜/BGM 仍互斥。
- `withRetry()` 的 attempt 入口不变。
- 流式读取共用同一个 `AbortController.signal`，超时会中止 reader/fetch。
- abort/timeout 不做 fallback，避免超时后继续占用网络请求；普通流式协议错误或 provider 不支持 stream 则 fallback 非流式。

## 回滚策略

可回滚点清晰：

1. UI 只依赖可选 `shotsReady`，移除显示逻辑即可恢复旧体验。
2. 编排层可将 `completeStream` 分支删除，保留 `complete` 主路径。
3. Provider 接口新增的是可选方法，不影响 Anthropic 或测试 mock。
4. `extractShotsPrefix` 是纯函数，不被最终解析依赖；回滚流式时可保留或删除。

## 测试清单

- `extractShotsPrefix`
  - 空输入 / shots 未出现 / shots 键半截。
  - 完整数组返回所有完整元素。
  - 最后一个对象未闭合不返回。
  - 字符串内包含 `{}`、`[]`、`"`、`\"` 不误判。
  - 嵌套对象/数组、`characterRefs` 数组正常。
- OpenAI 兼容流式
  - 请求体包含 `stream` 与 `stream_options.include_usage`。
  - 多个 SSE chunk / 多帧 `data:` 能拼出完整文本并逐段回调。
  - `[DONE]` 正常结束。
  - usage 帧写入 `lastUsage()`。
  - 非 2xx 映射 `ProviderCallError`。
- Generation
  - provider 有 `completeStream` 时逐镜上报 `shotsReady`，最终仍 parse + buildProject。
  - provider 无 `completeStream` 时走 `complete`。
  - 流式抛普通错误时 fallback 到 `complete`。
  - 流式返回格式最终 parse 失败时返回 `BAD_RESPONSE_FORMAT`。
- UI
  - 收到 `shotsReady` 时显示「已生成 N 个镜头…」。
  - 没有 `shotsReady` 时维持阶段消息。

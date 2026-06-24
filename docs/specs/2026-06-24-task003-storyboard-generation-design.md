# TASK-003 设计文档 — 分镜生成请求与结构化结果解析（核心）

> **Issue：** #5 · **Epic：** EPIC-003 · **依赖：** TASK-001、TASK-002 · **前置闸门：** Spike #3 ✅ 已通过（结论：MVP 仅支持 OpenAI 兼容 Provider，Anthropic 待实测）
> **分支：** `feature/task-003-storyboard-generation` → `develop`
> **日期：** 2026-06-24

---

## 1. 目标与范围

把「有效故事 + 生成参数」经 **用户自带 Key 直连 LLM** → **解析结构化 JSON** → 落成 3–10 个结构化镜头（`Project`）。这是下游所有生成/编辑/导出任务的数据地基。

**本任务做：**
- Provider 抽象层（`LlmProvider` 接口 + 工厂）与 **OpenAI 兼容适配器**（主契约）。Anthropic 适配器留骨架并标注未实测（Spike 结论）。
- 分镜 system/user 提示词构造（要求模型只输出 JSON）。
- `core/parse.ts`：按 **ADR-6** 解析 + 校验 LLM 原始文本 → `Project`（接受纯 JSON 或首个 fenced/平衡 `{...}` 块；字段缺失即失败；**不猜测、不补全截断 JSON**）。
- `services/generation.ts`：`generateStoryboard()` 编排 + 前置校验链。
- `storage.ts` 增 `getCurrentProject/saveCurrentProject`。
- `models.ts` 补齐完整 `ErrorCode` 集。

**本任务不做（明确移交）：**
- 失败重试 / 加载态 / 防重复提交（全局锁）→ **TASK-009（#11）**。本任务的 provider 调用是 **单次尝试 + AbortSignal 超时**，给 009 留好接缝。
- 模板多语言细化、人物一致性注入 → **TASK-004 / TASK-005**。本任务的 parse 通用处理 `characters`，但不做独立的「角色识别 pass」。
- 不直接调用视频生成 API。

---

## 2. 数据流（对齐 architecture §4）

```
generateStoryboard({ story, params })
  └─ 前置校验链（任一失败立即返回 Result.err，不发出站请求）
       1. 故事非空                → EMPTY_STORY
       2. 长度 ∈ [10,5000](码点)  → STORY_TOO_SHORT / STORY_TOO_LONG
       3. Provider 配置合法        → INVALID_PROVIDER_CONFIG / MODEL_REQUIRED
       4. 已配置且可解密 Key       → NO_API_KEY / KEY_DECRYPT_FAILED
       5. 目标域名已有 host 权限   → HOST_PERMISSION_DENIED
  └─ 构造 prompt（prompts/storyboard.ts）
  └─ provider.complete()  ← 单次尝试，AbortSignal 超时 90s（重试由 009 包裹）
       └─ fetch 直连厂商；HTTP 状态 → ErrorCode 映射（api-spec §5）
  └─ parse(raw)（core/parse.ts，ADR-6）→ Project | BAD_RESPONSE_FORMAT
  └─ saveCurrentProject(project)  → STORAGE_WRITE_FAILED（写失败不静默）
  └─ Result.ok(project)
```

> **全局锁缺位是有意的接缝。** api-spec §3.3 前置校验第 1 步「全局 LLM 锁空闲」属 TASK-009 范围，本任务不实现，009 会在 `generateStoryboard` 外层包一层锁 + 重试。本任务把 provider 调用收敛在一个可被 009 包裹的内部函数里。

---

## 3. 模块与文件

| 文件 | 职责 |
|------|------|
| `src/core/models.ts`（改） | 补齐完整 `ErrorCode`（AUTH_FAILED / RATE_LIMITED / NETWORK_ERROR / BAD_RESPONSE_FORMAT / GENERATION_IN_PROGRESS / HOST_PERMISSION_DENIED / CORS_BLOCKED / NO_GENERATION_INPUT / NOTHING_TO_EXPORT） |
| `src/core/parse.ts`（新） | 纯函数：原始文本 → `Project`，按 ADR-6 解析 + 校验 + 归一化（补 id/index/editedByUser、characterRefs 归一到 Character.id） |
| `src/core/validate.ts`（改） | 增 `validateProviderConfig()`（kind/baseUrl/model） |
| `src/prompts/storyboard.ts`（新） | `buildStoryboardPrompt(params)` → { system, user } |
| `src/services/llm/provider.ts`（新） | `LlmProvider` 接口 + `createProvider(config)` 工厂 + host 权限/HTTP 状态→ErrorCode 的 `ProviderCallError` |
| `src/services/llm/openaiCompatible.ts`（新） | OpenAI 兼容 Chat Completions 适配器 |
| `src/services/llm/anthropic.ts`（新） | Anthropic Messages 适配器（骨架，标注未实测） |
| `src/services/generation.ts`（新） | `generateStoryboard()` 编排 + 前置校验链 |
| `src/services/storage.ts`（改） | 增 `getCurrentProject/saveCurrentProject` |
| `src/services/permissions.ts`（新） | `hasHostPermission(url)` 封装 `chrome.permissions.contains`（可在测试注入/降级） |

**模块边界（architecture §3，硬约束）：** 组件层不直接 `fetch`/不直接读 `chrome.storage`；`generation.ts` 是唯一编排入口；常量只来自 `core/config.ts`；Provider 抽象屏蔽厂商差异。

---

## 4. 关键决策

### 4.1 解析（ADR-6）容错顺序
1. 整段 `JSON.parse` 成功 → 用之；
2. 否则提取**第一个** ```` ```json ... ``` ```` 代码块解析；
3. 否则扫描**第一个平衡的 `{...}` 块**（按括号配对，跳过字符串内的括号与转义）解析；
4. 全失败 → `BAD_RESPONSE_FORMAT`，**不做自由文本猜测、不补全截断 JSON**。

### 4.2 校验（解析成功后，任一不满足 → `BAD_RESPONSE_FORMAT`）
- `shots` 是数组且 `length ∈ [3,10]`；
- 每个 shot 的 `summary/shotSize/cameraMovement/durationSuggestion/prompt` 均 trim 后非空字符串；
- `characters`（若有）每项 `appearance` 非空；`name` 允许 null（无明确人物不编造）；
- `characterRefs` 对不上已有角色的引用**丢弃而非报错**（按 name 或序号匹配，归一到内部 `Character.id`）。

### 4.3 错误码映射（api-spec §5）
provider 适配器把 HTTP 状态 / fetch 异常抛成带 `code` 的 `ProviderCallError`：401/403→`AUTH_FAILED`，429→`RATE_LIMITED`，5xx/网络/超时→`NETWORK_ERROR`，CORS→`CORS_BLOCKED`。`generation.ts` 捕获后转 `Result.err`。**本任务不自动重试**（009 负责对可重试码做退避）。

### 4.4 `response_format` 兼容性（api-spec §4.2）
OpenAI 兼容请求默认带 `response_format: { type: 'json_object' }`；若收到「unsupported parameter / unknown field」类 400/422 → **去掉该字段重试一次**（不计入 009 的网络重试预算）。

### 4.5 Anthropic 现状
Spike #3 仅验证 OpenAI 兼容（Kimi 实测，CORS 放行扩展来源）；Anthropic 未实测。适配器保留实现骨架，但 MVP 默认 Provider 为 OpenAI 兼容，文档/注释标注 Anthropic「待实测」。

---

## 5. 测试计划（TDD）

- **parse.test.ts**：纯 JSON / fenced JSON / 前后带解释文本 / 平衡块提取；shots 数量越界（<3、>10）；字段缺失/空白；characterRefs 归一与丢弃；截断 JSON 不补全；空 characters 合法。
- **generation.test.ts**（mock provider + keyVault + permissions）：前置校验各分支错误码；成功路径落 `currentProject`；provider 抛 401→AUTH_FAILED、429→RATE_LIMITED、网络→NETWORK_ERROR；解析失败→BAD_RESPONSE_FORMAT；storage 写失败→STORAGE_WRITE_FAILED。
- **openaiCompatible.test.ts**（mock fetch）：请求形状（Authorization 头、messages、max_tokens）；`response_format` 不支持时去字段重试一次；状态码→ProviderCallError 映射；Key 不出现在任何可记录字段。

全部 `npm run lint && npm run test && npm run build` 必须绿。

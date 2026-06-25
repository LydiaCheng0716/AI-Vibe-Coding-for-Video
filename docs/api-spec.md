# API 接口规范

## 状态

> **状态：** 已通过 REVIEW-001 复审（PO 已批准并合并至 develop）· REVIEW-002 文档复审补订（见 v3，含新增错误码与契约说明，待 PO 知会）  
> **作者：** Architect Agent  
> **最后更新：** 2026-06-23
>
> **v2 修订（2026-06-17，按 REVIEW-001）：** ProviderConfig 增加 baseUrl/权限约束与模型策略（ARCH-MED-001/HIGH-001）；新增 host 权限/CORS/解密/存储相关错误码；生成校验对齐 ADR-6（ARCH-MED-002）与码点计数（ARCH-MED-003）；全局并发锁（ARCH-MED-004）；出站契约补 JSON schema 与权限流程；导出明确排除 Key 与 Provider 凭据（ARCH-LOW-002）。
>
> **v3 修订（2026-06-23，REVIEW-002 文档复审）：** Storage 写操作统一返回 `Result<void>`（对齐 STORAGE_WRITE_FAILED）；新增 `updateCurrentProjectBgm()` 明确 BGM 持久化入口；新增错误码 `INVALID_PROVIDER_CONFIG` / `MODEL_REQUIRED` / `NO_GENERATION_INPUT`；生成前置校验加入 Provider 配置校验；`response_format` 增加兼容性处理说明（不支持则去字段重试一次）；BGM 无输入改用 `NO_GENERATION_INPUT`；Anthropic 模型示例去硬编码占位。

---

## 任务标注 ↔ GitHub Issue 对照

本文档中的 `TASK-XXX` 是逻辑任务 ID，对应仓库 GitHub Issue（任务的唯一事实源）。散文中的标注已就地附上 issue 链接；代码块内的标注 GitHub 不会自动链接，统一以下表为准：

| 任务 | Issue | 任务 | Issue |
|------|-------|------|-------|
| TASK-001 / 002 | #2 | TASK-006 | #8 |
| TASK-003 | #5 | TASK-007 | #9 |
| TASK-004 | #6 | TASK-008 | #10 |
| TASK-005 | #7 | TASK-009 | #11 |

> 另：开发前置技术验证（Spike，ADR-5）见 #3。

---

## 0. 本规范的范围（先读这一节）

StoryPop 是 **纯客户端、用户自带 Key、无账号** 的 Chrome 侧边栏插件，**没有自建后端、没有自建 REST API**。因此本规范描述的是两类契约：

1. **插件内部服务契约（Service API）** —— 组件层调用服务层的函数签名与数据形状，开发者据此实现 `services/` 与 `core/`。这是「API 优先」在本产品里的落地形态。
2. **出站 LLM 调用契约（Outbound Provider Contract）** —— 浏览器用 **用户自己的 API Key** 直连第三方 LLM 厂商的请求/响应形状。

> 原模板里的「Base URL / Bearer Token 认证 / `/auth/register` / `/auth/login` / 免费用户·付费用户限流表」均 **不适用本产品**，已删除（理由见 [architecture.md](architecture.md) 第 0 节与 ADR-0）。本产品不存在「受保护端点」「服务端会话」「服务端限流配额」这些概念。

类型定义以 TypeScript 表达，权威实现见 `src/core/models.ts`。

---

## 1. 鉴权模型

- **无账号、无登录、无服务端 Token。**
- 唯一凭据是 **用户自带的 LLM API Key**，仅用于浏览器对厂商接口的出站调用。
- Key 的本地保存按 [architecture.md](architecture.md) **ADR-1**：WebCrypto AES-GCM 加密、密钥不可导出存 IndexedDB、UI 掩码显示、禁日志、可一键删除、禁 `storage.sync`。
- 出站请求按各厂商协议在 **请求头** 携带 Key（见第 4 节），我们不定义自有鉴权头。

---

## 2. 核心数据模型（Service API 共用）

```ts
type OutputLanguage = 'zh' | 'en';
type VideoModel = 'jimeng' | 'keling' | 'sora' | 'runway' | 'generic';
type TemplateId = 'cinematic-en' | 'jimeng-keling-zh';

interface GenerationParams {
  videoModel: VideoModel;
  style: string;            // 画面风格
  aspectRatio: string;      // 如 '16:9' | '9:16' | '1:1'
  shotDurationPref: 'short' | 'medium' | 'long';
  outputLanguage: OutputLanguage;
  templateId: TemplateId;
}

interface Character {
  id: string;
  name: string | null;      // 故事中无明确人物时为 null，不强行编造（TASK-005）
  appearance: string;       // 统一外观描述
}

interface Shot {
  id: string;
  index: number;            // 1..N，N ∈ [3,10]
  summary: string;          // 概要
  shotSize: string;         // 景别
  cameraMovement: string;   // 运镜
  durationSuggestion: string; // 时长建议
  prompt: string;           // 完整视频提示词（含正向 + 负面）
  characterRefs: string[];  // 引用的 Character.id
  editedByUser: boolean;    // 用户手动编辑后置 true，禁止被自动注入/再生成覆盖（TASK-005/006）
}

interface BgmPrompt {
  prompt: string;           // 情绪/风格/节奏/乐器音色/适用场景
  language: OutputLanguage;
}

interface Project {
  schemaVersion: number;    // 当前为 1
  story: string;
  params: GenerationParams;
  characters: Character[];
  shots: Shot[];
  bgm?: BgmPrompt;
}

// 统一结果包装：所有生成类服务返回此形状，便于 UI 区分成功/失败分支
type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

interface AppError {
  code: ErrorCode;
  message: string;          // 面向用户的可读说明（中文）
  retriable: boolean;       // 是否建议用户重试 / 是否已自动重试
}

type ErrorCode =
  | 'EMPTY_STORY'           // 故事为空（TASK-001）
  | 'STORY_TOO_SHORT'       // 低于下限（ADR-2，trim 后码点数）
  | 'STORY_TOO_LONG'        // 超过上限（ADR-2，trim 后码点数）
  | 'NO_API_KEY'            // 未配置 BYOK（TASK-002）
  | 'INVALID_PROVIDER_CONFIG'// provider.kind 缺失/未知，或 baseUrl 非 https/格式错误（ADR-4/ADR-5）
  | 'MODEL_REQUIRED'        // provider.model 为空（模型名由用户填写，不硬编码，ADR-4）
  | 'KEY_DECRYPT_FAILED'    // 解密失败/IndexedDB 密钥损坏，已清理坏状态，需重输 Key（ADR-1）
  | 'HOST_PERMISSION_DENIED'// 未获该 Provider 域名的 host 权限（用户拒绝/未授权）（ADR-5）
  | 'CORS_BLOCKED'          // 请求被浏览器/厂商跨域策略拦截，建议换 Provider（ADR-5）
  | 'AUTH_FAILED'           // 厂商 401/403，不自动重试（ADR-3）
  | 'RATE_LIMITED'          // 厂商 429，已按退避重试后仍失败（ADR-3）
  | 'NETWORK_ERROR'         // 网络/超时，已重试后仍失败（ADR-3）
  | 'BAD_RESPONSE_FORMAT'   // LLM 返回无法解析/校验为结构化分镜，不自动重试（TASK-003 / ADR-6）
  | 'GENERATION_IN_PROGRESS'// 已有进行中的 LLM 生成，拒绝重复提交（ADR-3 全局并发=1）
  | 'STORAGE_WRITE_FAILED'  // 本地存储写入失败/配额超限（ARCH-LOW-001）
  | 'CLIPBOARD_FAILED'      // 复制失败（TASK-006/007）
  | 'NO_GENERATION_INPUT'   // 生成 BGM 时既无故事也无分镜（TASK-007）
  | 'NOTHING_TO_EXPORT';    // 无分镜可导出（TASK-008）
```

---

## 3. 插件内部服务契约（Service API）

> 这些是组件层唯一可调用的服务入口。组件 **不得** 绕过它们直接 `fetch` 或直接读写 `chrome.storage`（见 architecture.md 第 3 节模块边界）。

### 3.1 KeyVault Service（BYOK 密钥，TASK-002（#2） / ADR-1）

```ts
// 保存（加密后落 chrome.storage.local；密钥落 IndexedDB）
saveApiKey(key: string): Promise<Result<void>>;

// 是否已配置（用于「已配置状态」展示，不解密、不回显完整 Key）
hasApiKey(): Promise<boolean>;

// 取掩码（如 'sk-...AB12'，仅末 4 位），禁止返回完整 Key 给 UI
getMaskedApiKey(): Promise<string | null>;

// 内部使用：仅在发起出站请求的瞬间解密，调用后不缓存明文
// （非 UI 接口；UI 永远拿不到明文）
getApiKeyForRequest(): Promise<string | null>;

// 一键删除（清 apiKeyCipher + IndexedDB 密钥）
clearApiKey(): Promise<Result<void>>;
```

**约束：** 任何返回值、日志、错误 `message` 都不得包含完整明文 Key。

---

### 3.2 Storage Service（设置 / 草稿 / 项目，TASK-001 / 002 / 006，#2、#8）

```ts
getSettings(): Promise<{ params: GenerationParams; provider: ProviderConfig }>;

// 所有写操作统一返回 Result<void>：写入失败/配额超限时返回 ok:false + STORAGE_WRITE_FAILED，
// 由 UI 提示「本地保存失败（可能空间不足）」，不静默丢数据（ARCH-LOW-001）。
saveSettings(s: { params: GenerationParams; provider: ProviderConfig }): Promise<Result<void>>;

saveDraft(text: string): Promise<Result<void>>;   // 输入即存
getDraft(): Promise<string | null>;               // 侧边栏重开时恢复（TASK-001）

getCurrentProject(): Promise<Project | null>;
saveCurrentProject(p: Project): Promise<Result<void>>;

// 局部更新单个镜头提示词，仅改该镜头并置 editedByUser=true（TASK-006）
updateShotPrompt(shotId: string, prompt: string): Promise<Result<void>>;

// 把生成好的 BGM 写回当前项目的 currentProject.bgm（TASK-007 的持久化入口）
updateCurrentProjectBgm(bgm: BgmPrompt): Promise<Result<void>>;
```

**写入失败处理（ARCH-LOW-001）：** 所有写操作（`saveSettings/saveDraft/saveCurrentProject/updateShotPrompt`）在 `chrome.storage` 写入抛错或配额超限时，返回/抛出可展示错误 `STORAGE_WRITE_FAILED`，UI 提示「本地保存失败（可能空间不足）」，不静默丢数据。MVP 只有单个 `currentProject`，容量风险低；未来多项目/历史项目再评估把大对象迁到 IndexedDB（见 architecture.md 第 7 节）。

```ts
interface ProviderConfig {
  kind: 'openai-compatible' | 'anthropic';
  // baseUrl：仅 openai-compatible 允许自定义；必须 https://，否则拒绝（ADR-5）。
  // anthropic 固定官方域名，忽略此字段。
  baseUrl?: string;
  // model：用户手动填写的文本；不在代码里硬编码未经验证的模型名（ARCH-MED-001 / ADR-4）。
  // 设置页可显示「推荐占位」作提示，但生成链路只用用户实际填写值。
  model: string;
  // grantedOrigins：已通过 chrome.permissions.request 动态授权的自定义域名列表（ADR-5）。
  grantedOrigins?: string[];
}
```

**Provider / 权限相关约束（ADR-5，开发必须遵守）：**
- 自定义 `baseUrl` 仅 `openai-compatible` 可用，且必须 `https://`。
- 内置已验证 Provider 域名走 `manifest.host_permissions` 静态声明；自定义域名在用户保存时调用 `chrome.permissions.request({ origins: ['https://<域名>/*'] })` **动态申请**，授权成功才写入 `grantedOrigins`。
- **禁止申请 `<all_urls>` / `*://*/*`。**
- 出站请求前若目标域名无 host 权限 → `HOST_PERMISSION_DENIED`（提示重新授权，不发请求）。

---

### 3.3 Generation Service（编排，TASK-003 / 004 / 005，#5、#6、#7）

```ts
// 生成完整分镜（含角色识别与一致性注入、模板适配）
generateStoryboard(input: {
  story: string;
  params: GenerationParams;
}): Promise<Result<Project>>;
```

**前置校验顺序（任一失败立即返回，不发出站请求）：**
1. **全局 LLM 锁空闲** → 否则 `GENERATION_IN_PROGRESS`（ADR-3，分镜与 BGM 共享同一把锁，ARCH-MED-004）
2. 故事非空 → 否则 `EMPTY_STORY`（TASK-001，#2）
3. 长度 ∈ [10, 5000]（**trim 后 Unicode 码点数**，ADR-2 / ARCH-MED-003）→ 否则 `STORY_TOO_SHORT` / `STORY_TOO_LONG`
4. **Provider 配置合法** → 否则 `INVALID_PROVIDER_CONFIG`（`kind` 缺失/未知，或 `openai-compatible` 的 `baseUrl` 非 `https://`/格式非法；`anthropic` 忽略 `baseUrl`）/ `MODEL_REQUIRED`（`model` 为空）（ADR-4/ADR-5）
5. 已配置 Key 且可解密 → 否则 `NO_API_KEY` / `KEY_DECRYPT_FAILED`（TASK-002（#2） / ADR-1）
6. 目标 Provider 域名已获 host 权限 → 否则 `HOST_PERMISSION_DENIED`（ADR-5）

**成功后置校验（TASK-003（#5） 验收 + ADR-6，ARCH-MED-002）：**
- 解析接受范围：纯 JSON 或首个 fenced/平衡 `{...}` 块；都失败 → `BAD_RESPONSE_FORMAT`（**不猜测、不补全截断 JSON**）。
- `shots.length ∈ [3,10]`，且每个 `Shot` 的 `summary/shotSize/cameraMovement/durationSuggestion/prompt` 均为 trim 后非空字符串；任一不满足 → `BAD_RESPONSE_FORMAT`。
- `characterRefs` 必须引用已有角色，对不上的引用丢弃；无明确人物时 `characters` 可为空，不强行编造（TASK-005，#7）。
- 归一化由代码补齐 `id/index/editedByUser`，落成 `core/models.ts` 内部模型。

> 角色识别+一致性注入（TASK-005，#7）与模板适配（TASK-004，#6）由本服务内部完成；可在同一次或多次 LLM 调用中实现，具体由 Developer 按本契约决定，但产出必须落到 `Project.characters` 与 `Shot.characterRefs/prompt`。

---

### 3.4 BGM Service（TASK-007，#9）

```ts
generateBgmPrompt(input: {
  story?: string;            // 有故事即可
  project?: Project;         // 或基于已生成分镜
  language: OutputLanguage;
}): Promise<Result<BgmPrompt>>;
```

- `story` 与 `project` 至少有其一，否则返回 `NO_GENERATION_INPUT`（提示先输入故事或生成分镜）。
- Provider/Key 前置校验同 3.3（含 `INVALID_PROVIDER_CONFIG` / `MODEL_REQUIRED`）。
- 复用 BYOK 设置、第 3.3 的错误处理/重试能力，以及 **同一把全局 LLM 锁**（与分镜生成互斥，ARCH-MED-004）；BGM 生成进行中时分镜按钮也禁用，反之亦然。
- 成功后由调用方通过 `Storage.updateCurrentProjectBgm()` 写回 `currentProject.bgm`（本服务只产出 `BgmPrompt`，不自行持久化）。

---

### 3.5 Export Service（TASK-008，#10）

```ts
type ExportFormat = 'markdown' | 'json' | 'plaintext';

exportProject(p: Project, format: ExportFormat): Result<string>;
// 无分镜 → NOTHING_TO_EXPORT
// 必须包含编辑后的最新内容（TASK-008）；JSON 用第 2 节稳定字段名
```

**导出隐私边界（ARCH-LOW-002，硬性）：**
- 导出内容 **绝不包含 API Key**（无论明文或密文）。
- 导出 **默认不包含 Provider 凭据配置**（`baseUrl`、`grantedOrigins` 等可能暴露用户所用厂商/私有代理地址的字段）。
- 导出只含创作内容：`story`、生成参数 `params`（非敏感）、`characters`、`shots`、`bgm`。`model` 名是否纳入由 PO 视为非敏感信息决定，默认可含（属生成参数）；若要更保守也可排除。

### 3.6 Clipboard（TASK-006 / 007，#8、#9）

```ts
copyToClipboard(text: string): Promise<Result<void>>;
// 失败返回 CLIPBOARD_FAILED，UI 提示且保留原内容
```

---

## 4. 出站 LLM 调用契约（Provider Contract）

> 由 `src/services/llm/*` 实现；上层只面向统一接口，不感知厂商差异。

### 4.1 统一 Provider 接口

```ts
interface LlmProvider {
  // 发起一次「要求结构化 JSON 输出」的对话补全；返回原始文本由 core/parse.ts 解析
  complete(req: {
    system: string;
    user: string;
    model: string;
    maxTokens: number;
    signal: AbortSignal;     // 配合超时（ADR-3）
  }): Promise<string>;       // 返回模型输出文本（期望内含 JSON）
}
```

调用统一用 `lib/retry.ts` 包裹（ADR-3：网络/超时/429/5xx 自动重试，最多 2 次退避；401/403/CORS 不重试）。

**调用前置（由 `generation.ts` 保证，Provider 不自行处理）：** 已持全局 LLM 锁、Key 已解密、目标域名已有 host 权限。

**期望输出与解析：** `complete()` 返回的文本由 `core/parse.ts` 按 **ADR-6** 解析与校验（接受纯 JSON 或首个 fenced/平衡 `{...}` 块，字段缺失即失败、不猜测）。system 提示须明确要求模型「只输出 JSON、不要解释文字」，期望外壳见 ADR-6(1)。各适配器请求体里的 `model` 一律取自 `ProviderConfig.model`（用户填写值，非硬编码）。

---

### 4.2 OpenAI 兼容适配器（主契约，覆盖 OpenAI / DeepSeek / Kimi / 智谱 等）

**出站请求：** `POST {baseUrl}/chat/completions`

```
Authorization: Bearer <用户自带 Key>
Content-Type: application/json
```

```jsonc
{
  "model": "<ProviderConfig.model>",
  "messages": [
    { "role": "system", "content": "<分镜/角色/模板提示词>" },
    { "role": "user", "content": "<故事 + 参数>" }
  ],
  "response_format": { "type": "json_object" },  // 仅对已验证支持的 Provider 发送，见下方说明
  "max_tokens": 4000
}
```

> **`response_format` 兼容性（重要）：** 部分 OpenAI 兼容厂商不认识 `response_format` 字段，会直接 **拒绝整个请求**（400/422），届时解析层根本没机会容错。规则：仅对 Spike（#3）已验证支持的 Provider 默认带上该字段；若收到「unsupported parameter / unknown field」类错误，**去掉 `response_format` 自动重试一次**（这一次不计入 ADR-3 的网络重试预算），仍失败再按错误处理。是否携带由 Provider 能力位控制，不要无条件发送。

**响应（节选）：** 取 `choices[0].message.content` 作为待解析文本。

---

### 4.3 Anthropic 适配器（Claude 用户）

**出站请求：** `POST https://api.anthropic.com/v1/messages`

```
x-api-key: <用户自带 Key>
anthropic-version: 2023-06-01
content-type: application/json
```

```jsonc
{
  "model": "<取自 ProviderConfig.model（用户填写的 Anthropic 模型名）；不在代码里硬编码默认值——ARCH-MED-001>",
  "max_tokens": 4000,
  "system": "<分镜/角色/模板提示词>",
  "messages": [
    { "role": "user", "content": "<故事 + 参数>" }
  ]
}
```

**响应（节选）：** 取 `content[]` 中首个 `type === "text"` 块的 `text` 作为待解析文本。

> 说明：浏览器直连 Anthropic 需该厂商允许跨域来源；若某厂商不支持浏览器端 CORS，则在设置中对该 Provider 给出提示。OpenAI 兼容厂商多数支持自定义 base_url 且允许浏览器调用。

---

## 5. 出站调用错误码映射

> 这些是 **厂商返回的 HTTP 状态码** 如何映射到第 2 节 `ErrorCode` 的规则；它们不是「我们的 API 错误码」。

| 厂商状态 / 阶段 | 含义 | 是否自动重试 | 映射 ErrorCode |
|---------|------|------------|----------------|
| 请求前：无 host 权限 | 未授权该 Provider 域名 | **否** | `HOST_PERMISSION_DENIED` |
| 请求前：解密失败 | IndexedDB 密钥损坏/丢失 | **否**（清理坏状态后要求重输） | `KEY_DECRYPT_FAILED` |
| 请求被 CORS 拦截 | 浏览器/厂商跨域策略拒绝 | **否**（重试同样被拒，引导换 Provider） | `CORS_BLOCKED` |
| 网络失败 / 超时 | 连接问题 | 是（≤2 次退避，ADR-3） | `NETWORK_ERROR` |
| 401 / 403 | Key 无效或无权限 | **否** | `AUTH_FAILED` |
| 429 | 厂商限流 | 是（遵循 `Retry-After`） | `RATE_LIMITED` |
| 5xx | 厂商服务端错误 | 是（≤2 次退避） | `NETWORK_ERROR` |
| 200 但内容无法解析/校验为结构化分镜 | 格式异常（ADR-6） | **否** | `BAD_RESPONSE_FORMAT` |

> CORS 与 host 权限的区别：**host 权限**是「我们扩展有没有被授权访问这个域名」（请求前可判定）；**CORS** 是「请求发出后，厂商服务器是否允许扩展来源跨域读取响应」（只能在请求时暴露）。两者都不自动重试，但提示文案不同（见 ADR-5(5)）。

**面向用户的错误对象（第 2 节 `AppError`）示例：**
```jsonc
{
  "ok": false,
  "error": {
    "code": "AUTH_FAILED",
    "message": "API Key 无效或无权限，请到设置里检查你的 BYOK 配置。",
    "retriable": false
  }
}
```

---

## 6. 删除项说明（相对原模板）

为对齐「用户自带 Key、无账号」的产品定位，以下原模板内容 **已移除**：

- ❌ `Authorization: Bearer <token>` 自有鉴权（本产品无服务端 Token）
- ❌ `POST /auth/register` / `POST /auth/login`（无账号体系）
- ❌ 免费用户 / 付费用户的服务端限流配额表（无服务端；限流改为客户端语义，见 ADR-3）
- ❌ 服务端 `Base URL` / 通用资源分页端点（无自建后端）

替代它们的是：本地服务契约（第 3 节）+ BYOK 出站调用契约（第 4 节）+ 客户端错误/限流语义（第 5 节、ADR-3）。

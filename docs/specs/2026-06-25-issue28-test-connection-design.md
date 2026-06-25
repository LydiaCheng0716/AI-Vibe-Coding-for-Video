# Issue #28 设计文档 — 设置加「测试连接」自检按钮

> **Issue：** #28 · **优先级：** P1 · **依赖：** `develop`（含 #27）；provider 适配器错误码细化
> **分支：** `feature/issue-28-test-connection` → `develop`
> **日期：** 2026-06-25 · **合并策略：** merge-when-green

---

## 1. 目标与范围

配置错误目前只在「生成」时才暴露，且报错笼统（一句「API Key 无效」背后可能是 401/403/404/CORS/额度不足）。
设置里加「测试连接」：保存前发一个极小请求，**分类报告**结果，把问题定位前移。

**本任务做：**
1. **错误码细化**（前置依赖）：`mapHttpStatus` 把 401/403/404/402 拆开，新增 `FORBIDDEN`/`MODEL_NOT_FOUND`/`QUOTA_EXCEEDED`（现 403 混在 AUTH_FAILED、404 混在 BAD_RESPONSE_FORMAT）。
2. **轻量探针** `LlmProvider.probe()`：发极小请求，仅判 HTTP 状态，不解析正文/不做截断检查（max_tokens=1 必然截断，复用 `complete` 会误报）。
3. **连接测试服务** `services/connectionTest.ts`：用**表单当前值**（非已保存值）做前置校验 + 探针 + 计时 + 分类。
4. `SettingsPanel.tsx`：「测试连接」按钮 + 分类结果展示。

**本任务不做：** 定时健康检查（范围外）。

---

## 2. 关键决策

### 2.1 错误码细化（`core/models.ts` + `services/llm/provider.ts`）
`mapHttpStatus` 调整（retriable 语义不变其余项）：

| 状态码 | 旧 ErrorCode | 新 ErrorCode | retriable |
|--------|--------------|--------------|-----------|
| 401 | AUTH_FAILED | AUTH_FAILED | false |
| 403 | AUTH_FAILED | **FORBIDDEN** | false |
| 404 | BAD_RESPONSE_FORMAT | **MODEL_NOT_FOUND** | false |
| 402 | BAD_RESPONSE_FORMAT | **QUOTA_EXCEEDED** | false |
| 408 / 5xx | NETWORK_ERROR | NETWORK_ERROR | true |
| 429 | RATE_LIMITED | RATE_LIMITED | true |
| 其余 4xx（400/422…） | BAD_RESPONSE_FORMAT | BAD_RESPONSE_FORMAT | false |

新增码加入 `ErrorCode` 联合；各适配器 `providerMessage`/`anthropicMessage` 补对应文案（default 分支保底，非穷尽 switch，向后兼容）。生成流程 `providerErr` 透传 e.code → 用户得到更准确提示（纯增益，不改 retriable 行为）。

### 2.2 探针 `probe()`（两适配器各实现，复用 endpoint/鉴权）
- 发 `max_tokens` 极小（=1）的请求；`!res.ok` → 抛细化后的 `ProviderCallError`；`res.ok` → resolve（**不读 body、不查截断**）。
- 不走 `complete` 的 `response_format`/截断逻辑，避免 1-token 截断被误判为失败。

### 2.3 连接测试服务（`services/connectionTest.ts`）
签名：`testConnection({ provider, apiKey? }, deps?) → ConnectionTestResult`，
`ConnectionTestResult = { ok:true; latencyMs } | { ok:false; code; message }`。

- **测表单当前值**：入参直接收 `provider`（含 model/baseUrl），**不读已保存 settings**——满足「已填即可测，保存前定位」。
- **Key 来源**：`apiKey` override（表单 Key 输入/不落盘当次 Key）优先；否则 `getApiKeyForRequest()`（已保存的加密 Key）；都没有 → `NO_API_KEY`。
- **不落盘**：服务只读不写，无 `saveSettings`/`saveApiKey`，天然遵守「测试不写入持久状态」与不落盘开关。
- 顺序：`validateProviderConfig` → 解析 Key → `hasHostPermission(origin)` → 计时 `probe()`（超时 `CONNECTION_TEST_TIMEOUT_MS=20s`）。
- 分类文案（对齐 Issue 验收）：

| code | 文案 |
|------|------|
| 成功 | `✅ 连接成功（延迟 {ms}ms）` |
| AUTH_FAILED | `401 Key 无效` |
| FORBIDDEN | `403 无权限或被锁定` |
| MODEL_NOT_FOUND | `404 模型不存在` |
| QUOTA_EXCEEDED | `额度不足` |
| RATE_LIMITED | `请求过于频繁（可能额度不足），请稍后再试` |
| CORS_BLOCKED | `CORS/网络不可达：该端点未对浏览器放行，可能不支持直连` |
| NETWORK_ERROR | `CORS/网络不可达：该端点可能未对浏览器放行或网络异常` |
| BAD_RESPONSE_FORMAT | `请求被拒（可能参数或模型不被支持）` |
| NO_API_KEY / MODEL_REQUIRED / INVALID_PROVIDER_CONFIG / HOST_PERMISSION_DENIED | 对应配置提示 |

> 注：浏览器 `Failed to fetch` 在 JS 层无法可靠区分 CORS / 断网（沿用 provider.ts 既有结论），统一归 `NETWORK_ERROR`，故其文案同时点出「未对浏览器放行」以覆盖 CORS 场景（验收点）。

### 2.4 UI（`SettingsPanel.tsx`）
- 「测试连接」按钮（在 provider 配置区）。点击：用**表单 state** 构造 `provider`；Key 用 `keyInput`（刚填未存）有则用之，否则交给服务取已存 Key。
- 自定义/预设非静态域名：点击是用户手势，先 `hasHostPermission`，无则 `requestHostPermission` 当场申请，再测。
- 展示 `testing`/结果文案；不触发保存。

---

## 3. 文件

| 文件 | 职责 |
|------|------|
| `src/core/models.ts`（改） | `ErrorCode` 新增 FORBIDDEN/MODEL_NOT_FOUND/QUOTA_EXCEEDED |
| `src/core/config.ts`（改） | `CONNECTION_TEST_TIMEOUT_MS` / `CONNECTION_TEST_MAX_TOKENS` |
| `src/services/llm/provider.ts`（改） | `mapHttpStatus` 细化；`LlmProvider.probe` 接口 |
| `src/services/llm/openaiCompatible.ts`（改） | `probe` 实现 + 新码文案 |
| `src/services/llm/anthropic.ts`（改） | `probe` 实现 + 新码文案 |
| `src/services/connectionTest.ts`（新） | `testConnection` 编排 + 分类 |
| `src/components/SettingsPanel.tsx`（改） | 「测试连接」按钮 + 结果展示 |

---

## 4. 测试计划（TDD）

- **provider.test.ts（改）**：403→FORBIDDEN、404→MODEL_NOT_FOUND、402→QUOTA_EXCEEDED；401→AUTH_FAILED、429→RATE_LIMITED、5xx/408→NETWORK_ERROR、422→BAD_RESPONSE_FORMAT 不回归。
- **openaiCompatible.test.ts（增）**：`probe` 2xx → resolve（不解析 body）；4xx → 抛对应细化码。
- **connectionTest.test.ts（新）**：成功→`{ok:true,latencyMs:number}`；各错误码→对应分类文案（含 401/403/404/额度/CORS/网络）；非法配置/缺 model/缺 Key/无 host 权限 → 不发探针即返回对应码；apiKey override 透传给 probe、不用已存 Key；不调用任何持久化（无 save 依赖）。

全套 `npm run lint && npm run test && npm run build` 必须绿。

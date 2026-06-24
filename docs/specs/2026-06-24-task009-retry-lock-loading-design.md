# TASK-009 设计文档 — 生成失败、重试与加载状态（横切）

> **Issue：** #11 · **Epic：** EPIC-003 / EPIC-006 · **依赖：** TASK-003 · **下游：** TASK-007（复用全局锁）
> **分支：** `feature/task-009-generation-retry-loading` → `develop`
> **日期：** 2026-06-24

---

## 1. 目标与范围

为 LLM 生成链路（分镜 + BGM 共用）补齐横切基础设施：**全局并发锁（并发=1）**、**瞬时错误退避重试**、**全局加载态**、**防重复提交**。TASK-003 已显式把这些后置到本任务，并留好接缝（`generateStoryboardAttempt` 不落库、`AppError.retriable`、`ProviderCallError`）。

**本任务做：**
- `lib/retry.ts`：`withRetry(attempt)` —— 对 `retriable` 错误最多重试 2 次（合计 3 次），指数退避 1s→2s + 随机抖动；429 优先遵循 `Retry-After`。
- `services/llmLock.ts`：全局 LLM 锁（并发=1，分镜与 BGM 共享）+ 加载态观察（`isLlmBusy` / `subscribeLlmBusy`）。
- 改 `services/generation.ts`：`generateStoryboard` = 锁(重试(attempt)) + 成功后落库一次。
- OpenAI 适配器解析 429 `Retry-After` → `ProviderCallError.retryAfterMs`；`models.AppError` 增可选 `retryAfterMs`。

**本任务不做：**
- 单镜头 AI 重新生成、视频生成 API（PRD 范围外）。
- BGM 生成本体 → TASK-007（但其将复用本任务的锁与重试）。
- UI 按钮禁用/转圈的具体样式 → 由消费方（卡片 UI/输入区）按 `isLlmBusy` 渲染；本任务只暴露可观察状态。

---

## 2. 关键决策（对齐 ADR-3 / api-spec §5）

### 2.1 全局锁（ARCH-MED-004）
- 模块级单例布尔 `busy`。`withLlmLock(fn)`：若 `busy` → 立即返回 `GENERATION_IN_PROGRESS`（拒绝而非排队，达成「防重复提交」）；否则置位、跑、`finally` 复位。
- 分镜与 BGM 调用同一把锁 → 任一进行中，另一类也被拒。
- 加载态 = `busy`；置位/复位时通知订阅者（`subscribeLlmBusy(cb)`），UI 据此禁用所有生成入口并显示加载。

### 2.2 重试（ADR-3）
- 仅对 `error.retriable === true` 的失败重试（`NETWORK_ERROR` / `RATE_LIMITED`；含 408/5xx/超时/网络）。
- `AUTH_FAILED` / `BAD_RESPONSE_FORMAT` / `CORS_BLOCKED` / `HOST_PERMISSION_DENIED` / 各前置校验错误 → `retriable=false`，**不重试**，直接返回（提供手动重试入口由 UI 负责）。
- 最多 2 次重试（合计 3 次尝试）。退避：第 i 次重试延迟 `base * 2^i`（base=1s → 1s, 2s）+ `[0, jitter]` 随机抖动。
- 429 若带 `Retry-After`（秒）→ 用其值覆盖退避延迟（`retryAfterMs`）。
- 重试耗尽 → 返回最后一次的 `retriable` 错误（UI 解除加载 + 可读提示）。
- **CORS / host 权限失败不计入重试**（已是 `retriable=false`，天然不重试）。

### 2.3 重试只包 LLM、不重复落库
锁内顺序：`withRetry(generateStoryboardAttempt)` → 成功后 `saveCurrentProject` 一次。重试只重发 LLM 调用与解析，不会重复写 storage（避免 STORAGE_WRITE_FAILED 也被重试 / 重复覆盖）。

### 2.4 不泄露凭据
错误 `message` 只用预置中文文案（TASK-003 已保证 provider 不回传厂商正文、不含 Key）；本任务的重试/锁不新增任何把 Key/请求头写入错误的通道。

---

## 3. 文件

| 文件 | 职责 |
|------|------|
| `src/lib/retry.ts`（新） | `withRetry<T>(attempt, opts)`：退避重试纯逻辑；`sleep`/`jitter` 可注入便于测试 |
| `src/services/llmLock.ts`（新） | 全局锁 + 加载态观察（`withLlmLock` / `isLlmBusy` / `subscribeLlmBusy`） |
| `src/services/generation.ts`（改） | `generateStoryboard` 接入 锁 + 重试；导出 `RETRY_OPTS` 供复用 |
| `src/services/llm/openaiCompatible.ts`（改） | 429 解析 `Retry-After` → `ProviderCallError.retryAfterMs` |
| `src/services/llm/provider.ts`（改） | `ProviderCallError` 增 `retryAfterMs?` |
| `src/core/models.ts`（改） | `AppError` 增可选 `retryAfterMs?`；`err()` 透传 |

---

## 4. 测试计划（TDD）

- **retry.test.ts**：retriable 错误重试到第 3 次成功；全失败返回末次错误且恰好 3 次尝试；非 retriable 立即返回不重试；`retryAfterMs` 覆盖退避；退避序列与抖动用注入的 `sleep`/`jitter` 断言。
- **llmLock.test.ts**：占用时第二次调用返回 `GENERATION_IN_PROGRESS`；释放后可再次进入；`finally` 在抛错时也复位；`subscribeLlmBusy` 收到 true/false 通知。
- **generation.test.ts（增）**：进行中再次调用 → `GENERATION_IN_PROGRESS`；429→重试后成功；AUTH_FAILED 不重试；重试成功只落库一次。
- **openaiCompatible.test.ts（增）**：429 带 `Retry-After: 2` → `retryAfterMs===2000`。

全套 `npm run lint && test && build` 必须绿。

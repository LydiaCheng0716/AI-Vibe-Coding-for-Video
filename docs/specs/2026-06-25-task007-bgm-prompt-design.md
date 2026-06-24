# TASK-007 设计文档 — BGM 提示词生成与复制

> **Issue：** #9 · **Epic：** EPIC-006 · **依赖：** TASK-003 + **TASK-009（全局锁，必须在其后）**
> **分支：** `feature/task-007-bgm-prompt` → `develop`
> **日期：** 2026-06-25

---

## 1. 目标与范围

根据故事或已生成分镜，总结整体情绪/节奏/音乐方向，输出适配 Suno / 海绵音乐的 BGM 提示词并支持复制。复用 BYOK、**与分镜共享同一把全局锁**、退避重试、错误处理（均来自 TASK-003/009）。

**本任务做：**
- `prompts/bgm.ts`：BGM system/user 提示词（情绪/风格/节奏/乐器音色/适用场景；按输出语言）。
- `core/parse.ts`：`parseBgmPrompt(raw)` 解析 BGM 文本（JSON {prompt} 优先，回退整段文本）。
- `services/generation.ts`：`generateBgmPrompt(input)` —— 前置校验 → provider（BGM 60s 超时）→ 解析 → `BgmPrompt`；**经 withLlmLock + withRetry**（与分镜互斥）；**不自行持久化**。
- `services/storage.ts`：`updateCurrentProjectBgm(bgm)`（写回 currentProject.bgm，走 projectLock）。
- `components/BgmPanel.tsx`：生成按钮（busy 禁用）+ 展示 + 复制；成功后 `updateCurrentProjectBgm`。
- `App` 接入 BgmPanel。

**本任务不做：** 调 BGM/音乐 API（MVP 只生成文本）。

---

## 2. 关键决策

### 2.1 输入与校验（api-spec §3.4）
- `story` 与 `project` 至少其一，否则 `NO_GENERATION_INPUT`（提示先输入故事或生成分镜）。
- Provider/Key/host 前置校验与分镜一致（`INVALID_PROVIDER_CONFIG` / `MODEL_REQUIRED` / `NO_API_KEY` / `KEY_DECRYPT_FAILED` / `HOST_PERMISSION_DENIED`）→ **抽取共享 preflight 复用**，消除与分镜的重复。

### 2.2 共享全局锁（ARCH-MED-004，硬要求）
`generateBgmPrompt` 走与分镜**同一个** `withLlmLock`：任一生成进行中 → 另一类返回 `GENERATION_IN_PROGRESS`、按钮禁用、加载态共享（`subscribeLlmBusy`）。重试规则同 TASK-009（429 Retry-After、401/格式不重试）。

### 2.3 不自行持久化
服务只产出 `BgmPrompt`；调用方（BgmPanel）成功后调 `updateCurrentProjectBgm` 写回，使导出（TASK-008）自动纳入 BGM。

### 2.4 解析
请求模型输出 JSON `{"prompt":"..."}`；`parseBgmPrompt` 先尝试 JSON 取 `prompt`/`bgm.prompt`，失败则回退为整段 trim 文本（BGM 本就是自由文本，回退安全）；空 → `BAD_RESPONSE_FORMAT`。

### 2.5 超时
BGM 用 `BGM_TIMEOUT_MS`（60s，已在 config）。

---

## 3. 文件

| 文件 | 职责 |
|------|------|
| `src/prompts/bgm.ts`（新） | `buildBgmPrompt(input, language)` |
| `src/core/parse.ts`（改） | `parseBgmPrompt(raw)` |
| `src/services/generation.ts`（改） | 抽取 `preflightProvider`；新增 `generateBgmPrompt` + attempt |
| `src/services/storage.ts`（改） | `updateCurrentProjectBgm` |
| `src/components/BgmPanel.tsx`（新） | 生成 + 展示 + 复制 |
| `src/sidepanel/App.tsx`（改） | 接入 BgmPanel；BGM 生成成功更新内存态 |

---

## 4. 测试计划（TDD）

- **parse.test（增）**：`parseBgmPrompt` JSON {prompt} / {bgm:{prompt}} / 纯文本回退 / 空→失败。
- **bgm prompt**：含情绪/风格/节奏/乐器/场景；按 language。
- **generation BGM（增）**：无 story 无 project → NO_GENERATION_INPUT；与分镜共享锁（进行中 → GENERATION_IN_PROGRESS）；provider/key 前置校验；成功返回 BgmPrompt（language 正确）；429 重试；不落库（不调 saveCurrentProject）。
- **storage（增）**：`updateCurrentProjectBgm` 写回 bgm；无项目 → ok 无副作用；走锁。

全套 `npm run lint && test && build` 必须绿。

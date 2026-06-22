# AFK 运行台账 — Issue #2

> 跨 tick 共享状态。每个 tick 开头先读这里 + 跑状态检查，结尾更新。

## 配置
- 范围：Issue #2（TASK-001 → TASK-002），**只碰这两个任务相关文件**。
- 驱动/门：Claude 实现(TDD) → `cto-pr-review` 自评 → **Codex 外门** → **Kimi 终审**（两道都跑，逐条修）。门 ≠ 实现者。
- 合并策略：**leave-open**（开 PR 到 develop，绝不自动合并）。
- 分支：TASK-001 = `feature/task-001-sidebar-story-input`（off develop）；TASK-002 = `feature/task-002-byok-generation-settings`（off develop 或 001 之上）。
- 适配：npm + Vitest（非 uv/pytest）；无 constitution-gate。
- 报告语言：中文。
- 自停：连续 2 个 tick 无实质新产出（新 commit/分支/PR/设计/修好的 CI 或门禁发现）→ `CronDelete` + 状态报告 + STOP。队列完成 → `CronDelete` + 终报。**停止时务必删 cron。**

## 进度账（done so far）
- [2026-06-23 tick-1a] 分支 `feature/task-001-sidebar-story-input`；设计文档 + 台账 + ~27min cron relay（job 2c454dd1）。
- [2026-06-23 tick-1b] 脚手架落地：package.json（已 `npm install`，252 包）+ tsconfig + vitest.config + tests/setup（fake-indexeddb + chrome.storage mock）。
- [2026-06-23 tick-1c] TASK-001 核心 TDD：`core/config.ts`（ADR-2 常量）+ `core/validate.ts`（码点数校验）+ 单测 **12 个全过（GREEN）**。已 commit + push。

- **下一步（按序）：**
  1. `core/models.ts`（GenerationParams/Provider/Project/Shot/Character/BgmPrompt 类型，对齐 api-spec §2）。
  2. `services/storage.ts`（draft 存取 + settings + Result<void> + STORAGE_WRITE_FAILED）+ 单测。
  3. UI：`index.html` + `manifest.config.ts` + `vite.config.ts` + `src/sidepanel/{main,App}.tsx` + `components/StoryInput.tsx`（受控 textarea + 字数 + 校验提示 + 草稿恢复）。
  4. `npm run -s build` 必须过（tsc + vite）。
  5. TASK-001 收尾：cto 自评 → Codex 外门 → Kimi 终审，逐条修 → 开 PR 到 develop（leave-open）。
  6. 然后开 TASK-002 分支 `feature/task-002-byok-generation-settings`：`core/crypto.ts`（AES-GCM 不可导出密钥）+ `services/keyVault.ts`（ADR-1）+ `components/SettingsPanel.tsx` + 单测 → 同样三道门 → PR。

- 命令备忘：`npm run -s test`、`npm run -s build`、`npm run -s lint`(tsc)。

- [2026-06-23 tick-2] TASK-001 实现完成：models/defaults/storage + UI（App/StoryInput）+ manifest/vite/tailwind；`npm build` 通过、单测 **18 个全过**。开 **PR #13**（leave-open）。cto 自评修订（空输入不飘红 + 卸载清理）。Codex 外门已跑（结果待 triage）。
- **下一步（TASK-001 收尾）：**
  1. triage Codex 外门发现 → 逐条修 → 回归 build+test。
  2. 跑 **Kimi 终审**（skill/kimi-review）→ triage+修 → 回归。
  3. TASK-001 完成（PR #13 leave-open 等审）。
  4. 开 TASK-002 分支 `feature/task-002-byok-generation-settings`（off develop）：`core/crypto.ts`（AES-GCM extractable:false）+ `services/keyVault.ts`（saveApiKey/hasApiKey/getMaskedApiKey/getApiKeyForRequest/clearApiKey，ADR-1）+ `components/SettingsPanel.tsx`（Provider+参数）+ 单测（加解密往返、掩码、clear、明文不泄露）→ 三道门 → PR。

## 空闲计数
- 连续空闲 tick：0（tick-2 有大量实质产出：PR #13）

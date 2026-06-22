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
- [2026-06-23 tick-1] 创建分支 `feature/task-001-sidebar-story-input`；写设计文档 `docs/specs/2026-06-23-issue2-sidebar-byok-design.md`；建本台账；建 ~30min cron relay。
- 下一步：脚手架（package.json + vite + crxjs + ts + tailwind + vitest + manifest），然后 TASK-001 TDD（先 `core/config.ts` + `core/validate.ts` + 单测 RED→GREEN）。

## 空闲计数
- 连续空闲 tick：0

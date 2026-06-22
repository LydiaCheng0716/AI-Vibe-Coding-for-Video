# REVIEW-001：PM 修订移交说明（PM Agent → PO Assistant）

> **📌 历史归档（2026-06-23 补注）：** 本文档是 2026-06-17 的 REVIEW-001 移交快照。此后任务已迁移为 **GitHub Issues 作为唯一事实源**，文末「修订文件」里列的 `docs/tasks/*.md` 已删除；对应任务现为 Issue #2、#5–#11（映射见 `docs/PRD.md` 任务列表）。本文保留作历史记录，不再更新。

| 字段 | 值 |
|------|-----|
| 编号 | REVIEW-001 |
| 阶段 | 需求任务修订 |
| 来源 | PM Agent |
| 移交对象 | PO Assistant Agent |
| 日期 | 2026-06-17 |

---

## 本次修订内容

- 在 `docs/PRD.md` 的任务列表新增「依赖」字段，并标注 TASK-003 为 TASK-004 / 005 / 006 / 007 / 008 的前置任务。
- 将原 TASK-003 拆分为两个任务：
  - `TASK-003`：分镜生成请求与结构化结果解析。
  - `TASK-009`：生成失败、重试与加载状态。
- 在 `docs/PRD.md` 的 MVP 范围外补充「单镜头 AI 重新生成」。
- 按架构定稿阈值回填验收标准：
  - 故事输入长度：10-5000 字，按去除首尾空白后的 Unicode 码点数计算。
  - 限流：全局 LLM 锁，并发=1，分镜生成和 BGM 生成共享。
  - 自动重试：网络错误、超时、429、5xx 最多自动重试 2 次，合计 3 次尝试。
  - 不自动重试：401/403、CORS/host permission 失败、返回格式解析/校验失败。
- 同步闭环 PRD 待决项 #2：API Key 本地保存策略按架构定稿执行，使用 WebCrypto AES-GCM 加密，密钥不可导出并存 IndexedDB，密文存 `chrome.storage.local`，禁用 `storage.sync`。

---

## 建议 PO Assistant 整理重点

- 对 Human PO 可说明：这次不是新增业务范围，而是把已批准架构里的安全阈值和工程顺序写回需求任务，降低 Developer Agent 开发时的歧义。
- TASK-003 仍是后续 004-008 的共同前置，因为模板、角色、编辑、BGM、导出都依赖结构化分镜数据。
- 新增 TASK-009 是为了把失败体验和重试策略集中管理，避免散落在多个任务里造成行为不一致。

---

## 修订文件

- `docs/PRD.md`
- `docs/tasks/TASK-TEMPLATE.md`
- `docs/tasks/TASK-001.md`
- `docs/tasks/TASK-002.md`
- `docs/tasks/TASK-003.md`
- `docs/tasks/TASK-004.md`
- `docs/tasks/TASK-005.md`
- `docs/tasks/TASK-006.md`
- `docs/tasks/TASK-007.md`
- `docs/tasks/TASK-008.md`
- `docs/tasks/TASK-009.md`

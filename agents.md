# 开发工作流说明

本文件说明本仓库**当前真实**的开发工作流：**Human PO 把关关键决策，中途的设计 / 实现 / 自检 / 评审由 AFK 自主工作流（Claude 驱动）+ 独立外部评审门（Kimi / Codex）完成。**

> 本项目由 **FireUG / SSW TV** 开发制作。

> **任务的唯一事实源是 GitHub Issues。**
> 每个任务的描述、验收标准、依赖、状态、分支约定全部以仓库 GitHub Issue 为准。`docs/` 下保留设计文档：PRD / 架构 / API / 数据库，以及 `docs/specs/` 里**每条任务的设计文档**（AFK 工作流每条任务产出）。

---

## 角色总览（现行）

```
┌──────────────────────────────────────────────────────────────┐
│                          Human PO                             │
│        提需求 · 批准架构 · 批准合并 · 最终决策 · 部署          │
└───────────────────────────┬──────────────────────────────────┘
                            │  交付「已审定的 Issue 队列 / scope / 顺序」
                            ▼
┌──────────────────────────────────────────────────────────────┐
│          AFK 自主工作流（Claude 驱动，每条 Issue 瀑布）        │
│  设计文档 → TDD(RED→GREEN) → 对抗自检 → lint·test·build 全绿   │
│                       → CTO 自评(cto-pr-review)               │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│        独立外部评审门（gate ≠ implementer）：Kimi → Codex      │
└───────────────────────────┬──────────────────────────────────┘
                            │  merge-when-green
                            ▼
                  develop ──（累积稳定后，Human PO 批准）──→ main
                            │
                            ▼
                 部署 / 发布：Human PO（合并 ≠ 部署）
```

---

## 1. Human PO（产品负责人，唯一真人决策者）

| 项目 | 内容 |
|------|------|
| 身份 | 唯一的真人决策者 |
| 关键决策点 | **提需求 / 定 scope（哪些 Issue、顺序、批次）· 批准架构方向 · 批准合并 · 最终决策** |
| 部署 | 由 PO 负责（**合并 ≠ 部署**：工作流只 merge-when-green，绝不部署） |
| 不做的事 | 写代码 · 跑中途流程（设计/实现/自检/评审都交给 AFK 工作流） |

PO 把一份**已审定的任务队列**（GitHub Issue 列表 + 顺序 + 合并策略 + 约束）交给 AFK 工作流，工作流自主执行到「可合并」状态，PO 在合并点和方向上把关。

---

## 2. AFK 自主工作流（Claude 驱动）

对 PO 交付的**每个 Issue**，按瀑布**一条一条**自主完成（`skill/afk/SKILL.md` 为权威规范）：

1. **设计文档** `docs/specs/YYYY-MM-DD-issueNN-*.md`（设计先行，最重要的一步）
2. **TDD**：先写失败测试（RED）→ 实现（GREEN）
3. **对抗性自检**：边界 / 竞态 / 隐私 / 回归
4. **全量门禁**：`npm run lint && npm run test && npm run build` 必须全绿
5. **CTO 自评**：`cto-pr-review` skill，逐条修复
6. 提交 → push early → 开 PR → 看 CI（红就修）
7. 交**外部评审门** → 修订 → **merge-when-green** 合并进 `develop`

- **续航**：约 30 分钟的 cron relay 自我接续，扛住暂停 / 限流 / 上下文重置；连续 2 个「空 tick」（无实质进展）自动停机并出报告。
- **复用 Skills**：`afk` · `cto-pr-review` · `kimi-review` · `codex-review` · `spec-planner` · `implementation-pilot` · `ui-ux-pro-max`。
- **不做的事**：合并未过门的分支、合并红 CI、部署。

---

## 3. 外部评审门（gate ≠ implementer）

- **始终由不同于实现者的模型评审**（绝不让模型审自己写的代码）：
  - 默认 `/afk`（Claude 实现）→ **Kimi 优先**，自跳过则回退 **Codex**。
  - `/afk codex`（Codex 实现）→ Kimi 优先，Kimi 不可用且 Claude 有额度则 Claude，**绝不 Codex**。
- 评审**只读**；驱动方（Claude）分诊每条结论、修复确认项、批量后再跑**一次**门。
- 门的范围是**结构性**问题（架构 / 正确性 / 安全 / 漏掉的边界）；文档 / 小问题统一留到最后一遍。
- **看门狗**：每次外部门都有硬超时（约 300s），挂起即 kill 并按回退顺序换门或记录跳过，**绝不卡住队列**。

---

## 4. 关键边界规则

| 规则 | 说明 |
|------|------|
| 架构先批准 | 架构方向经 **Human PO** 批准后再进开发 |
| gate ≠ implementer | 外部评审门的模型必不同于实现模型 |
| 不合红 CI / 不合带 blocker | 绝不合并红 CI 或未解决的阻断问题 |
| merge-when-green | CI 绿 + CTO 自评 + 外部门通过 → 合并进 `develop` |
| 合并 ≠ 部署 | 工作流只合并；**部署 / 发布由 Human PO** |
| 决策不下放 | 最终决策始终由 Human PO 做出 |
| 任务事实源 | GitHub Issues |

---

## 5. 分支与合并

**分支模型：每条任务一条分支。** 一个 Issue → 一条 `feature/issue-NN-*` 分支 → 一个 PR；从 `develop` 拉、合回 `develop`；多任务可串行/并行，互不干扰。

| 分支 | 用途 |
|------|------|
| `main` | 仅生产发布（累积稳定后由 Human PO 合入） |
| `develop` | 集成分支（所有任务分支从此拉出、merge-when-green 合回） |
| `feature/issue-NN-标题` | 单个任务的开发分支，对应一个 Issue 和一个 PR |
| `docs/*` · `design/*` | 文档 / 设计类短期分支，同样经 PR + PO 批准合并 |

> 早期采用「每任务一个 git worktree」并行的做法仍然适用（可选）；现行 AFK 多为串行推进，单仓库内逐条 issue 分支即可。**核心约束：合并到 `develop` / `main` 需经 Human PO 把关；任务分支之间不直接互合，统一经 `develop` 集成。**

---

## 6. 历史「多 Agent 工厂」模式（保留备查）

本仓库早期设计了 7 个独立终端 Agent（PM / Architect / 架构 Review / Developer / Code Review / QA / Deploy，提示词见 [`.agents/`](.agents/)）。这些角色职责现已**收敛进 AFK 工作流的各阶段 + 外部门**：

| 历史角色 | 现行归属 |
|----------|----------|
| PM / Architect | AFK 的「设计文档」阶段（`docs/specs/*` + 顶层 PRD/架构/API/DB 文档） |
| Developer | AFK 的「TDD + 实现」阶段 |
| Code Review / QA | AFK 的「CTO 自评」+「外部评审门」+ CI（lint/test/build） |
| Deploy | CI（GitHub Actions：lint + 单测 + 打包），**发布由 Human PO** |

`.agents/*.md` 作为各角色提示词参考保留，需要时可独立启用；日常开发以本文件描述的 **AFK 工作流 + Human PO 把关** 为准。

---

> 快速索引：[README.md](README.md) · [PRD](docs/PRD.md) · [架构](docs/architecture.md) · [API 规范](docs/api-spec.md) · [数据库设计](docs/db-design.md) · [AFK 工作流规范](skill/afk/SKILL.md)

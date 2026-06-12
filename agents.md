# Agent 分工与工作流说明

本文档说明 AI 软件工厂中每个 Agent 的角色定位、职责边界，以及它们之间的协作流程。

---

## 角色总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Human PO                                  │
│              提需求 · 批准架构 · 批准合并 · 最终决策             │
└──────────────────────────┬──────────────────────────────────────┘
                           │  上下传递
          ┌────────────────▼────────────────┐
          │        PO Assistant Agent        │
          │   翻译技术内容 · 汇总报告 · 建议  │
          └────────────────┬────────────────┘
                           │
    ┌──────────────────────▼──────────────────────┐
    │              需求阶段                         │
    │           PM Agent                           │
    │   PRD · 用户故事 · 验收标准 · 任务拆解        │
    └──────────────────────┬──────────────────────┘
                           │
    ┌──────────────────────▼──────────────────────┐
    │              架构阶段                         │
    │    Architect Agent  ◄──►  架构 Review Agent  │
    │  架构设计 API 数据库   评审风险 提出替代方案   │
    └──────────────────────┬──────────────────────┘
                           │  Human PO 批准架构
    ┌──────────────────────▼──────────────────────┐
    │              开发阶段（每任务并行）             │
    │           Developer Agent                    │
    │         实现代码 · 单元测试 · PR              │
    └──────────────────────┬──────────────────────┘
                           │
    ┌──────────────────────▼──────────────────────┐
    │              审查阶段                         │
    │   Code Review Agent  +  QA Agent             │
    │   代码审查·安全·性能     功能测试·E2E·回归    │
    └──────────────────────┬──────────────────────┘
                           │  Human PO 批准合并
                           ▼
                    develop → main
```

---

## 各 Agent 详细说明

### 1. Human PO（产品负责人）

| 项目 | 内容 |
|------|------|
| 身份 | 唯一的真人决策者 |
| 输入 | 业务想法和需求 |
| 输出 | 批准/拒绝决策 |
| 关键决策点 | 批准 PRD · 批准架构 · 批准合并 |
| 不做的事 | 写代码 · 选技术方案 · 直接操作系统 |

PO 通过 **PO Assistant** 接收所有来自技术 Agent 的信息，不直接与 Architect 或 Developer 对话。

---

### 2. PO Assistant Agent

| 项目 | 内容 |
|------|------|
| 提示词文件 | `.agents/po-assistant.md` |
| 核心能力 | 技术↔业务语言互译 |
| 输入 | 其他 Agent 的技术报告 |
| 输出 | 通俗语言汇报 · Sprint 总结 · 决策建议 |
| 不做的事 | 做决策 · 写代码 · 批准 PR |

**示例翻译：**
> Architect 说：「建议引入 Redis」  
> PO Assistant 说：「Redis 可以减少用户等待时间，但会增加一个额外组件，维护成本略有上升。」

---

### 3. PM Agent

| 项目 | 内容 |
|------|------|
| 提示词文件 | `.agents/pm.md` |
| 核心能力 | 需求结构化 |
| 输入 | Human PO 的业务描述 |
| 输出 | `docs/PRD.md` · `docs/tasks/TASK-XXX.md` |
| 不做的事 | 选技术栈 · 写代码 · 做架构决策 |

**工作原则：** 每个用户故事必须有 Given/When/Then 格式的验收标准，开发才能开始。

---

### 4. Architect Agent

| 项目 | 内容 |
|------|------|
| 提示词文件 | `.agents/architect.md` |
| 核心能力 | 系统设计 |
| 输入 | `docs/PRD.md` |
| 输出 | `docs/architecture.md` · `docs/api-spec.md` · `docs/db-design.md` |
| 不做的事 | 写业务代码 · 自我审查 · 直接开始开发 |

**工作原则：** API 优先——先定义契约，再实现。架构设计完成后必须经过独立 Review，才能移交开发。

---

### 5. 架构 Review Agent

| 项目 | 内容 |
|------|------|
| 提示词文件 | `.agents/architecture-reviewer.md` |
| 核心能力 | 架构风险识别 |
| 输入 | Architect Agent 的所有设计文档 |
| 输出 | 架构审查报告（含严重程度分级） |
| 不做的事 | 重新设计系统 · 写代码 · 做最终决定 |

**审查维度：** 可扩展性 · 安全性 · 性能 · 架构合规性  
**问题分级：** 严重（开发前必须修复）· 高 · 中 · 低

---

### 6. Developer Agent

| 项目 | 内容 |
|------|------|
| 提示词文件 | `.agents/developer.md` |
| 核心能力 | 功能实现 |
| 输入 | `docs/tasks/TASK-XXX.md` + 架构文档 |
| 输出 | feature 分支 + Pull Request + 单元测试 |
| 不做的事 | 改架构 · 改 API 契约 · 合并自己的 PR |

**Git 规则：** 每个任务一个独立分支（`feature/task-XXX-标题`），在独立 git worktree 中工作，不直接提交到 `develop` 或 `main`。

---

### 7. Code Review Agent

| 项目 | 内容 |
|------|------|
| 提示词文件 | `.agents/reviewer.md` |
| 核心能力 | 代码质量把关 |
| 输入 | Developer Agent 提交的 PR |
| 输出 | 代码审查报告（含阻塞/非阻塞问题） |
| 不做的事 | 自己实现修复 · 合并 PR · 审查架构决策 |

**审查维度：** 正确性 · 安全性 · 性能 · 架构合规性 · 代码质量

---

### 8. QA Agent

| 项目 | 内容 |
|------|------|
| 提示词文件 | `.agents/qa.md` |
| 核心能力 | 功能验证 |
| 输入 | 任务验收标准 + 运行中的系统 |
| 输出 | 测试报告 + Bug 列表 |
| 不做的事 | 修复 Bug · 审查代码 · 合并 PR |

**测试类型：** 功能测试 · 边缘情况测试 · 回归测试 · E2E 测试

---

### 9. Deploy Agent

| 项目 | 内容 |
|------|------|
| 职责 | CI/CD 配置 · Docker · GitHub Actions · 云端部署 |
| 输出 | 部署报告 · Release Notes |
| 不做的事 | 写业务功能 · 做需求决策 |

---

## 完整工作流步骤

### 阶段一：需求阶段

```
步骤 1  Human PO
        └── 用一段话描述产品：目标用户、核心功能、商业模式

步骤 2  PM Agent
        ├── 读取 PO 需求
        ├── 输出 Epic 列表
        ├── 拆解用户故事（含验收标准）
        ├── 创建 TASK-XXX.md 文件
        └── 提交 PRD 草稿 → PO 确认
```

### 阶段二：架构阶段

```
步骤 3  Architect Agent
        ├── 读取 PRD.md
        ├── 输出 architecture.md（技术栈 + 系统设计）
        ├── 输出 api-spec.md（所有端点）
        └── 输出 db-design.md（数据表 + 迁移策略）

步骤 4  架构 Review Agent
        ├── 独立审查上述三份文档
        ├── 输出分级问题列表
        └── 提交审查报告

步骤 5  PO Assistant Agent
        ├── 将架构审查报告翻译成业务语言
        └── 向 PO 呈现选项和建议

步骤 6  Human PO
        └── 批准架构 / 要求修改 / 拒绝重做
```

### 阶段三：开发阶段（每任务独立循环）

```
步骤 7  Developer Agent（每个 TASK 独立 worktree）
        ├── 阅读任务文档 + 架构文档
        ├── 创建 feature/task-XXX 分支
        ├── 实现功能 + 编写单元测试
        └── 提交 PR → develop

步骤 8  Code Review Agent
        ├── 审查 PR（正确性 · 安全 · 性能 · 合规）
        ├── 输出审查报告
        └── 批准 / 要求修改

步骤 9  QA Agent
        ├── 执行功能测试 · 边缘测试 · 回归测试 · E2E
        ├── 输出测试报告
        └── Bug 上报 → Developer Agent 修复

步骤 10 PO Assistant Agent
        ├── 汇总审查报告 + 测试报告
        └── 输出 Sprint 总结（✅ ⚠️ 💰 ⏱ 🎯）

步骤 11 Human PO
        └── 批准合并 → develop → （累积后）→ main
```

---

## 关键边界规则

| 规则 | 说明 |
|------|------|
| 架构不经审查不开发 | Architect 完成后必须经过架构 Review Agent，再由 PO 批准 |
| PR 不自我合并 | Developer 不能合并自己的 PR |
| 每任务独立分支 | 每个 TASK 在独立 git worktree 中实现，避免相互干扰 |
| 人工审阅后合并 | 所有合并到 develop/main 的操作需 Human PO 确认 |
| PO 只看业务语言 | 所有技术报告经 PO Assistant 翻译后才呈现给 PO |
| 决策权不下放 | Agent 只执行和建议，最终决策始终由 Human PO 做出 |

---

## Git Worktree 布局与合并流程

每个 agent 在**独立的 git worktree** 中工作，互不干扰，人工审阅后再合并回 `develop`。

### 分支与目录布局

```
0612VibeCode/                          ← 主仓库（main 分支，仅生产发布）
│   └── develop                        ← 集成分支（所有 agent 从此拉出）
│
0612VibeCode-worktrees/                ← 同级目录，存放所有 agent worktree
├── pm/                  → 分支 agent/pm
├── architect/           → 分支 agent/architect
├── architecture-reviewer/ → 分支 agent/architecture-reviewer
├── developer/           → 分支 agent/developer
├── reviewer/            → 分支 agent/reviewer
├── qa/                  → 分支 agent/qa
└── po-assistant/        → 分支 agent/po-assistant
```

| 分支 | Worktree 路径 | 对应角色 |
|------|--------------|---------|
| `main` | `0612VibeCode/` | 生产发布 |
| `develop` | （主仓库切换） | 集成分支 |
| `agent/pm` | `../0612VibeCode-worktrees/pm` | PM Agent |
| `agent/architect` | `../0612VibeCode-worktrees/architect` | Architect Agent |
| `agent/architecture-reviewer` | `../0612VibeCode-worktrees/architecture-reviewer` | 架构 Review Agent |
| `agent/developer` | `../0612VibeCode-worktrees/developer` | Developer Agent |
| `agent/reviewer` | `../0612VibeCode-worktrees/reviewer` | Code Review Agent |
| `agent/qa` | `../0612VibeCode-worktrees/qa` | QA Agent |
| `agent/po-assistant` | `../0612VibeCode-worktrees/po-assistant` | PO Assistant Agent |

### 初始化命令（仅首次）

```bash
# 在主仓库内执行
git branch develop                                    # 创建集成分支
WT=../0612VibeCode-worktrees && mkdir -p "$WT"
for agent in pm architect architecture-reviewer developer reviewer qa po-assistant; do
  git worktree add -b "agent/$agent" "$WT/$agent" develop
done
git worktree list                                     # 查看所有 worktree
```

### 日常工作流程

```bash
# 1. 进入某个 agent 的工作区（在 VS Code 中打开该目录）
cd ../0612VibeCode-worktrees/developer

# 2. agent 在此分支上工作、提交
git add [具体文件]
git commit -m "feat(TASK-XXX): 实现内容"

# 3. 推送（如有远程仓库）或等待人工审阅
```

### 人工审阅后合并

```bash
# 回到主仓库，切到 develop
cd ../../0612VibeCode
git checkout develop

# 人工审阅通过后，合并对应 agent 分支
git merge agent/developer

# 累积若干功能、QA 通过后，由 Human PO 批准发布到 main
git checkout main && git merge develop
```

### 同步最新 develop 到 agent worktree

```bash
# 在 agent worktree 内，拉取最新集成分支
cd ../0612VibeCode-worktrees/developer
git merge develop          # 或 git rebase develop
```

### 清理 worktree（任务完成后）

```bash
git worktree remove ../0612VibeCode-worktrees/developer   # 删除工作区
git branch -d agent/developer                              # 删除分支（已合并）
```

> **核心约束：** 所有合并到 `develop` / `main` 的操作必须经 Human PO 人工审阅确认；agent 之间不直接互相合并分支，统一通过 `develop` 集成。

---

## VS Code 多终端配置

```
Terminal 1  PM Agent          →  加载 .agents/pm.md
Terminal 2  Architect         →  加载 .agents/architect.md
Terminal 3  架构 Review        →  加载 .agents/architecture-reviewer.md
Terminal 4  Developer（任务A） →  加载 .agents/developer.md
Terminal 5  Developer（任务B） →  加载 .agents/developer.md（独立 worktree）
Terminal 6  Code Review       →  加载 .agents/reviewer.md
Terminal 7  QA                →  加载 .agents/qa.md
Terminal 8  PO Assistant      →  加载 .agents/po-assistant.md
```

每个 Terminal 在启动时将对应的 `.md` 文件作为上下文加载，即可让该 Terminal 扮演对应角色。

---

> 快速索引：[README.md](README.md) · [PRD](docs/PRD.md) · [架构](docs/architecture.md) · [API 规范](docs/api-spec.md) · [数据库设计](docs/db-design.md)

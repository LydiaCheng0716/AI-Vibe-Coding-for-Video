# AI 软件工厂

多 Agent 协作开发工作流，Human PO 全程参与关键决策。

---

## 核心理念

> AI Agent 负责高速执行，Human PO 负责所有关键决策。

> **任务的唯一事实源是 GitHub Issues。** 每个任务的描述、验收标准、依赖和状态都以仓库 Issue 为准；`docs/tasks/*.md` 已废弃删除。`docs/` 下仅保留 PRD、架构、API、数据库等设计文档。

---

## 角色一览

| Agent | 职责 | 不负责 |
|-------|------|--------|
| **Human PO** | 提需求、定优先级、做审批 | 写代码 |
| **PO Assistant** | 技术内容翻译成业务语言 | 做决策 |
| **PM Agent** | PRD、用户故事、任务拆解 | 选技术方案 |
| **Architect Agent** | 系统设计、API、数据库设计 | 写业务代码 |
| **架构 Review Agent** | 审查架构风险 | 重新设计 |
| **Developer Agent** | 实现任务、编写测试 | 改架构 |
| **Code Review Agent** | 审查 PR 的正确性与安全性 | 实现修复 |
| **QA Agent** | 测试功能行为、上报 Bug | 修复 Bug |
| **Deploy Agent** | CI/CD、Docker、云端部署 | 写业务功能 |

---

## 工作流

```
Human PO（提出需求）
    │
    ▼
PM Agent → PRD.md + GitHub Issues（每任务一个）
    │
    ▼
Architect Agent → architecture.md + api-spec.md + db-design.md
    │
    ▼
架构 Review Agent → 架构审查报告
    │
    ▼
PO Assistant → 通俗语言汇报
    │
    ▼
Human PO → 批准架构
    │
    ▼
Developer Agent → feature 分支 + PR（每个任务独立）
    │
    ▼
Code Review Agent → 代码审查报告
    │
    ▼
QA Agent → 测试报告
    │
    ▼
PO Assistant → Sprint 总结汇报
    │
    ▼
Human PO → 批准合并 → develop → main
```

---

## 项目结构

```
AI-Vibe-Coding-for-Video/
├── docs/                        # 设计文档（StoryBoard AI）
│   ├── PRD.md                   # 产品需求文档
│   ├── architecture.md          # 系统架构设计（含目录结构与 manifest 骨架）
│   ├── api-spec.md              # 服务契约 + 出站 LLM 调用契约
│   └── db-design.md             # 本地存储设计（chrome.storage / IndexedDB）
│                                # 任务详情见 GitHub Issues，非 docs/
├── skill/                       # 复用的工作流 Skills（afk、ui-ux-pro-max 等）
├── agents.md                    # Agent 分工与工作流总说明
└── .agents/                     # 各 Agent 提示词文件
    ├── po-assistant.md  pm.md  architect.md  architecture-reviewer.md
    └── developer.md  reviewer.md  qa.md  deploy.md
```

> **首个产品 StoryBoard AI 是纯客户端 Chrome MV3 扩展，没有 `frontend/`+`backend/` 两层、没有数据库。** 实现代码落地后的扩展内部结构（`src/sidepanel`、`src/services`、`src/core` 等）以 [docs/architecture.md](docs/architecture.md) 第 3 节为准。下方「推荐技术栈」是工厂的**通用默认**，具体项目按 `architecture.md` 调整。

---

## Git 工作流

```
main          ← 仅用于生产发布
  └── develop ← 集成分支
        └── feature/task-XXX-title  ← 每个任务独立分支
```

每个 Developer Agent 在独立的 git worktree 中工作。合并到 `develop` 需要 Code Review Agent 通过，合并到 `main` 需要 Human PO 审批。

---

## 如何启动新项目

1. **Human PO** 用一段话描述产品目标
2. 打开 **Terminal 1** → 加载 PM Agent：将 `.agents/pm.md` 作为上下文
3. PM Agent 生成 `docs/PRD.md`，并为每个任务创建一个 GitHub Issue（任务的唯一事实源）
4. 打开 **Terminal 2** → 加载 Architect Agent：将 `.agents/architect.md` 作为上下文
5. Architect 生成 `docs/architecture.md`、`docs/api-spec.md`、`docs/db-design.md`
6. 打开 **Terminal 3** → 加载架构 Review Agent：将 `.agents/architecture-reviewer.md` 作为上下文
7. 架构 Review Agent 生成审查报告
8. **PO Assistant** 向 Human PO 汇报 → **PO 批准架构**
9. 打开 **Terminal 4** → 每个任务加载 Developer Agent
10. Developer 提交 PR → Code Review Agent 审查 → QA Agent 测试
11. **PO 批准合并**

---

## 推荐 VS Code 配置

每个 Agent 使用独立 Terminal，加载对应的 `.md` 文件作为上下文后再下达指令。

```
Terminal 1：PM Agent          (.agents/pm.md)
Terminal 2：Architect         (.agents/architect.md)
Terminal 3：架构 Review       (.agents/architecture-reviewer.md)
Terminal 4：Developer         (.agents/developer.md)
Terminal 5：Code Review       (.agents/reviewer.md)
Terminal 6：QA                (.agents/qa.md)
```

---

## 推荐技术栈（通用默认，按项目调整）

> 下表是「AI 软件工厂」对一般 Web 项目的**默认建议**。**本仓库的产品 StoryBoard AI 不用这套**——它是纯客户端 Chrome 扩展，实际技术栈见右列「StoryBoard AI 实际」（权威定义在 [docs/architecture.md](docs/architecture.md)）。

| 层级 | 通用默认 | StoryBoard AI 实际 |
|------|---------|--------------------|
| 前端 | Next.js | React 18 + TypeScript（Chrome MV3 Side Panel） |
| 构建 | — | Vite + `@crxjs/vite-plugin` |
| 后端 | FastAPI / Node.js | **无**（纯客户端，BYOK 浏览器直连 LLM） |
| 数据库 | PostgreSQL | **无**；本地 `chrome.storage.local` + IndexedDB |
| 缓存 | Redis | 不适用 |
| 测试 | Playwright | Vitest（单元）+ 可选扩展 E2E |
| CI/CD | GitHub Actions | GitHub Actions：lint + 单测 + 打包 `.zip` |
| 容器 | Docker | 不适用（扩展无服务端部署） |
| Issue 管理 | GitHub Issues（任务唯一事实源） | 同 |
| 文档 | Markdown（本仓库） | 同 |

---

> 详细的 Agent 分工说明及协作流程，见 [agents.md](agents.md)

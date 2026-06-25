# AI 软件工厂

多 Agent 协作开发工作流，Human PO 全程参与关键决策。

> **首个产品 StoryPop — MVP 已完成。** TASK-001~009（九个任务）已全部实现、过三道质量门（CI + Kimi 外部评审 + Codex 终审）并合并到 `develop`。安装与使用见下方 [StoryPop — 安装与使用](#storypop--安装与使用)。

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
├── docs/                        # 设计文档（StoryPop）
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

> **首个产品 StoryPop 是纯客户端 Chrome MV3 扩展，没有 `frontend/`+`backend/` 两层、没有数据库。** 实现代码落地后的扩展内部结构（`src/sidepanel`、`src/services`、`src/core` 等）以 [docs/architecture.md](docs/architecture.md) 第 3 节为准。下方「推荐技术栈」是工厂的**通用默认**，具体项目按 `architecture.md` 调整。

---

## StoryPop — 安装与使用

StoryPop 是一个 Chrome 侧边栏插件：把口语化故事自动转成结构化分镜、AI 视频提示词和 BGM 提示词。**纯客户端、BYOK（自带 LLM Key）、无账号、无后端**——所有数据存本地，生成时只把内容发往你自己选择的 LLM 厂商。

### 当前能力（MVP）

| 能力 | 说明 | 任务 |
|------|------|------|
| 故事输入 | 侧边栏输入/粘贴故事，草稿自动保存，长度校验（10–5000 字） | TASK-001 |
| BYOK 设置 | Provider（OpenAI 兼容 / Anthropic）、baseUrl、模型名、API Key（AES-GCM 本地加密）；生成参数 | TASK-002 |
| 分镜生成 | 故事 → 直连 LLM → 3–10 个结构化镜头（概要/景别/运镜/时长/完整提示词） | TASK-003 |
| 模板适配 | 通用英文电影感 / 即梦·可灵中文两套模板，按目标视频模型套用 | TASK-004 |
| 人物一致性 | 识别角色、统一外观描述并注入相关镜头，减少跨镜头漂移 | TASK-005 |
| 卡片交互 | 按序查看、编辑单镜头提示词、单镜头复制 | TASK-006 |
| BGM 提示词 | 基于故事或分镜生成适配 Suno/海绵音乐的 BGM 提示词并复制 | TASK-007 |
| 导出 | Markdown / JSON / 纯文本（含编辑后内容与可选 BGM），复制或下载 | TASK-008 |
| 失败处理 | 全局并发锁（并发=1，分镜与 BGM 共享）、瞬时错误退避重试、加载态 | TASK-009 |

### 安装（开发者模式 load unpacked）

```bash
npm ci
npm run build      # 产物输出到 dist/
```

1. Chrome 打开 `chrome://extensions`，右上角开启「开发者模式」。
2. 点「加载已解压的扩展程序」，选择项目下的 `dist/` 目录。
3. 点击工具栏的 StoryPop 图标打开侧边栏（`chrome.sidePanel`）。

> 开发时也可 `npm run dev`（Vite + HMR）。

### 使用

1. **配置 BYOK（设置页）**：选 Provider。MVP 已实测 **OpenAI 兼容**（如 Kimi/Moonshot、DeepSeek、智谱等）；填 `baseUrl`（必须 `https://`）、你账号可用的**模型名**（不内置默认值）、API Key。
   - 用**自定义 baseUrl** 时，保存会**弹窗申请该域名的访问权限**（MV3 动态 host 授权），点「允许」后才能生成。
   - Anthropic 适配器已实现但浏览器直连 CORS 未实测，MVP 优先用 OpenAI 兼容。
2. **输入故事** → 点「生成分镜」→ 得到 3–10 个镜头卡片。
3. **编辑/复制**：编辑某镜头提示词只改该镜头（标记为已编辑，不被后续注入覆盖）；单镜头一键复制。
4. **BGM**：点「生成 BGM」得到配乐提示词并复制。
5. **导出**：选 Markdown / JSON / 纯文本，复制或下载（不含 API Key 与 Provider 凭据）。

### 安全与隐私

- API Key 用 WebCrypto **AES-GCM 本地加密**，密钥不可导出存 IndexedDB，密文存 `chrome.storage.local`，**禁用 `storage.sync`**，UI 仅显示末 4 位（ADR-1）。
- 本地加密能降低硬盘被读取时的泄露风险，但**无法防护已被恶意软件控制的浏览器/设备**——请只在信任的电脑上保存 Key。
- 生成时故事/参数/提示词会发往**你自己选择的 LLM 厂商**（用你的 Key），受该厂商隐私政策约束（BYOK 固有前提）。

### 范围外（MVP 暂不做）

直接调用视频/音乐生成 API、视频拼接剪辑、首尾帧图片、单镜头 AI 重生成、云端同步/账号体系/订阅、模板市场、历史项目管理。详见 [docs/PRD.md](docs/PRD.md)。

### 开发命令

```bash
npm run dev     # 开发（Vite + HMR）
npm run lint    # 类型检查（tsc --noEmit）
npm run test    # 单元测试（Vitest，173 用例）
npm run build   # 类型检查 + 生产构建（dist/）
```

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

> 下表是「AI 软件工厂」对一般 Web 项目的**默认建议**。**本仓库的产品 StoryPop 不用这套**——它是纯客户端 Chrome 扩展，实际技术栈见右列「StoryPop 实际」（权威定义在 [docs/architecture.md](docs/architecture.md)）。

| 层级 | 通用默认 | StoryPop 实际 |
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

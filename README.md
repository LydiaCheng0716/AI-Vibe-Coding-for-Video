# StoryPop · AI 软件工厂

> **本项目由 [FireUG / SSW TV](https://fireusergroup.com/) 开发制作。** © 2026 FireUG (SSW TV)，保留所有权利。详见 [版权与许可](#版权与许可)。

**Human PO 把关关键决策（提需求 · 批准架构 · 批准合并 · 最终决策 · 部署），中途的设计 / 实现 / 自检 / 评审由 AFK 自主工作流（Claude 驱动）+ 独立外部评审门（Kimi / Codex）完成。**

> **StoryPop 已完成 MVP + 多轮优化。** 首发 MVP（TASK-001~009）后又经多轮迭代：Provider 预设、测试连接、结构化角色卡与角色库、单镜头迭代/调参重写、全局风格锁、镜头增删排序、转场建议、每镜首帧图像提示词、中英双语与自动翻译同步、Token 提示、批量导出等。全部经 CI + CTO 自评 + 外部评审门并合并到 `develop`。安装与使用见 [StoryPop — 安装与使用](#storypop--安装与使用)。

---

## 核心理念

> AI Agent 负责高速执行，Human PO 负责所有关键决策。

> **任务的唯一事实源是 GitHub Issues。** 每个任务的描述、验收标准、依赖和状态都以仓库 Issue 为准；`docs/tasks/*.md` 已废弃删除。`docs/` 下仅保留 PRD、架构、API、数据库等设计文档。

---

## 角色一览（现行）

| 角色 | 职责 | 不负责 |
|------|------|--------|
| **Human PO** | 提需求、定 scope/顺序、批准架构、批准合并、最终决策、部署 | 写代码、跑中途流程 |
| **AFK 工作流**（Claude 驱动） | 每条 Issue：设计文档 → TDD → 对抗自检 → lint/test/build → CTO 自评 → merge-when-green | 合红 CI、合未过门分支、部署 |
| **外部评审门**（Kimi → Codex） | 独立只读评审结构性问题（gate ≠ implementer） | 写代码、做最终决策 |

> 早期的「多 Agent 工厂」（PM/Architect/Developer/QA 等独立终端角色，提示词见 `.agents/`）职责已收敛进 AFK 工作流的各阶段，保留备查。详见 [agents.md](agents.md)。

---

## 工作流（现行）

```
Human PO ── 提需求 · 定 scope/顺序/合并策略 ──▶ 交付「已审定的 Issue 队列」
                                                      │
                                                      ▼
              AFK 自主工作流（Claude 驱动，每条 Issue 瀑布）
              设计文档(docs/specs) → TDD(RED→GREEN) → 对抗自检
                       → lint·test·build 全绿 → CTO 自评(cto-pr-review)
                                                      │
                                                      ▼
              独立外部评审门（gate ≠ implementer）：Kimi → Codex
                                                      │  merge-when-green
                                                      ▼
                       develop ──（累积稳定后，Human PO 批准）──▶ main
                                                      │
                                                      ▼
                          部署 / 发布：Human PO（合并 ≠ 部署）
```

> 关键边界：架构先经 PO 批准；外部门模型必不同于实现模型；绝不合红 CI；合并 ≠ 部署；最终决策始终 Human PO。

---

## 项目结构

```
AI-Vibe-Coding-for-Video/
├── src/                         # StoryPop 实现（sidepanel / components / services / core / prompts）
├── tests/unit/                  # 单元测试（Vitest）
├── docs/                        # 设计文档
│   ├── PRD.md                   # 产品需求文档
│   ├── architecture.md          # 系统架构设计（含目录结构与 manifest 骨架）
│   ├── api-spec.md              # 服务契约 + 出站 LLM 调用契约
│   ├── db-design.md             # 本地存储设计（chrome.storage / IndexedDB）
│   └── specs/                   # 每条任务的设计文档（AFK 工作流逐条产出）
│                                # 任务详情见 GitHub Issues，非 docs/
├── skill/                       # 复用的工作流 Skills（afk、cto-pr-review、kimi/codex-review、ui-ux-pro-max 等）
├── agents.md                    # 开发工作流总说明（现行 AFK + Human PO 把关）
├── LICENSE                      # 版权与许可（FireUG / SSW TV，保留所有权利）
└── .agents/                     # 历史「多 Agent 工厂」各角色提示词（保留备查）
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
npm run test    # 单元测试（Vitest，381 用例）
npm run build   # 类型检查 + 生产构建（dist/）
```

---

## Git 工作流

```
main          ← 仅用于生产发布（累积稳定后由 Human PO 合入）
  └── develop ← 集成分支
        └── feature/issue-NN-title  ← 每个 Issue 一条分支、一个 PR
```

AFK 工作流对每条 Issue 走 `feature/issue-NN-*` 分支：CI 绿 + CTO 自评 + 外部评审门通过即 **merge-when-green** 合回 `develop`；合并到 `main` 由 **Human PO** 审批。**合并 ≠ 部署**：发布由 Human PO。

---

## 如何启动 / 推进一轮任务（现行 AFK 流程）

1. **Human PO** 描述需求 / 优先级；与工作流敲定 PRD 与架构方向（PO 批准架构）。
2. 把每条任务落成 **GitHub Issue**（任务唯一事实源），并定好**顺序 / 批次 / 合并策略**。
3. 把这份**已审定的 Issue 队列**交给 AFK 工作流（例如 `/afk`，Claude 驱动；或 `/afk codex`）。
4. 工作流对每条 Issue 自主执行瀑布：设计文档 → TDD → 对抗自检 → lint/test/build 全绿 → CTO 自评 → 外部评审门（Kimi→Codex）→ **merge-when-green** 进 `develop`；并自我接续（cron relay）。
5. **Human PO** 在合并点与方向上把关；累积稳定后批准合入 `main`；**部署 / 发布由 PO**。

> AFK 工作流的权威规范见 [`skill/afk/SKILL.md`](skill/afk/SKILL.md)。

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

## 版权与许可

**StoryPop 由 [FireUG / SSW TV](https://fireusergroup.com/) 开发制作。**

**主要作者（FireUG）：Lydia · Alvin 304 · Thom。**

© 2026 FireUG（SSW TV）。**保留所有权利（All Rights Reserved）。**

- 本仓库及 StoryPop 的源代码、设计文档、品牌名称与标识（FireUG / SSW TV / StoryPop 及其 Logo）均为 FireUG（SSW TV）的财产。
- 未经 FireUG（SSW TV）事先书面许可，**不得复制、修改、分发、再许可、公开发布或用于商业用途**。
- 本软件按「现状」提供，不附带任何明示或默示担保；使用过程中因调用第三方 LLM 服务（BYOK）产生的费用、数据处理与隐私责任由使用者及其所选服务商承担。
- 完整条款见仓库根目录 [LICENSE](LICENSE)。如需授权或合作，请通过 [fireusergroup.com](https://fireusergroup.com/) 联系。

---

> 详细的开发工作流说明，见 [agents.md](agents.md)

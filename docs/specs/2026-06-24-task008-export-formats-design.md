# TASK-008 设计文档 — Markdown / JSON / 纯文本导出

> **Issue：** #10 · **Epic：** EPIC-005 · **依赖：** TASK-003（结构化分镜模型）
> **分支：** `feature/task-008-export-formats` → `develop`
> **日期：** 2026-06-24

---

## 1. 目标与范围

把当前分镜（含角色一致性描述、镜头提示词、可选 BGM）导出为 **Markdown / JSON / 纯文本**，便于保存复用。纯函数 + 本地数据。

**本任务做：**
- `core/export.ts`：`exportProject(project, format): Result<string>`（纯函数）；无分镜 → `NOTHING_TO_EXPORT`。
- `components/ExportPanel.tsx`：格式选择 + 复制到剪贴板 + 下载文件。
- 接入 `App`（有项目时显示导出区）。

**本任务不做：**
- 历史项目 / 导入（JSON 用稳定字段名为未来预留）。
- BGM 生成本体 → TASK-007（导出对 `bgm` 可选字段做兼容：有则含、无则略）。

---

## 2. 关键决策

### 2.1 隐私边界（ARCH-LOW-002，硬性）
导出内容**绝不含 API Key**，**默认不含 Provider 凭据配置**（baseUrl、grantedOrigins 等）。
天然满足：`Project` 数据结构只含 `story / params / characters / shots / bgm`，**不含** `ProviderConfig`（Key/baseUrl 存于 settings/keyVault，不在 Project）。导出只序列化 Project，故无凭据泄露面。`params.model` 不在 Project（在 settings），无需排除。

### 2.2 三种格式
- **JSON**：`JSON.stringify` Project 的稳定字段（schemaVersion/story/params/characters/shots/bgm?），缩进 2，便于未来导入。
- **Markdown**：标题 + 故事 + 角色一致性列表 + 每镜头小节（概要/景别/运镜/时长 + 提示词代码块）+ 可选 BGM 段。
- **纯文本**：同等信息的无标记排版，便于直接粘贴保存。

### 2.3 编辑后最新内容
导出从 `currentProject` 取数（已含 `updateShotPrompt` 的编辑结果与 `editedByUser`），天然包含编辑后最新内容（验收要求）。

### 2.4 空结果
`shots.length === 0`（或无 project）→ `NOTHING_TO_EXPORT`，UI 提示先生成分镜。

### 2.5 导出形式
ExportPanel 提供「复制」（复用 `copyToClipboard`）与「下载」（Blob + a[download]，文件名 `storyboard.<ext>`）两种，覆盖侧边栏受限场景。

---

## 3. 文件

| 文件 | 职责 |
|------|------|
| `src/core/export.ts`（新） | `exportProject` + `toMarkdown/toJson/toPlaintext` 纯函数 + 文件名/MIME 元信息 |
| `src/components/ExportPanel.tsx`（新） | 格式选择 + 复制 + 下载 |
| `src/sidepanel/App.tsx`（改） | 有项目时渲染 ExportPanel |

---

## 4. 测试计划（TDD）

- **export.test.ts**：
  - 无分镜 / 无 shots → `NOTHING_TO_EXPORT`；
  - JSON：可被 `JSON.parse` 回结构，含 story/shots/characters；有 bgm 含 bgm、无 bgm 不含；稳定字段名；
  - Markdown：含每个镜头的概要/景别/运镜/时长/提示词；含角色描述；有 BGM 含 BGM 段；
  - 纯文本：含所有镜头提示词；
  - 编辑后的镜头（editedByUser/改过的 prompt）→ 导出含最新内容；
  - 隐私：导出字符串不含 'apiKey'/'baseUrl'/'grantedOrigins'（即便构造畸形输入也不泄露——Project 无此字段）。

全套 `npm run lint && test && build` 必须绿。

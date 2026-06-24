# TASK-006 设计文档 — 分镜卡片查看、编辑与单镜头复制

> **Issue：** #8 · **Epic：** EPIC-005 · **依赖：** TASK-003（结构化分镜模型）
> **分支：** `feature/task-006-card-edit-copy` → `develop`
> **日期：** 2026-06-24

---

## 1. 目标与范围

分镜结果的核心交互：按顺序展示镜头卡片、手动编辑单镜头提示词、复制单镜头到剪贴板。纯 UI / 本地数据，不调 LLM。

**本任务做：**
- `services/storage.updateShotPrompt(shotId, prompt)`：只改该镜头 prompt 并置 `editedByUser=true`，其余不变（api-spec §3.2）。
- `services/clipboard.copyToClipboard(text)`：成功/失败（`CLIPBOARD_FAILED`，不静默）（api-spec §3.6）。
- `components/ShotCard.tsx`：展示概要/景别/运镜/时长/完整提示词；编辑/保存单镜头提示词；复制按钮 + 成功/失败反馈。
- `components/ShotList.tsx`：按 `index` 顺序渲染卡片。
- **UI 接线（消费已合并的 generation 服务）**：`App` 持有当前 `Project` 状态，`StoryInput` 点「生成分镜」真正调 `generateStoryboard`（含 TASK-009 全局锁/加载态），成功后渲染 `ShotList`；订阅 `subscribeLlmBusy` 禁用按钮/显示加载。

**本任务不做：**
- 云端保存 / 多项目（MVP 单 `currentProject`）。
- 单镜头 AI 重新生成（PRD 范围外）。
- 导出 → TASK-008；BGM → TASK-007。

---

## 2. 关键决策

### 2.1 `updateShotPrompt`（storage，纯逻辑可测）
- 读 `currentProject`；找 `shotId`：不存在 → 仍返回 ok（无副作用）或忽略；存在 → 仅该 shot `{ ...shot, prompt, editedByUser: true }`，其余原样；写回。
- 写失败 → `STORAGE_WRITE_FAILED`（沿用既有 write 包装）。
- `editedByUser=true` 保护后续人物注入/再生成不覆盖（与 TASK-005 协同）。

### 2.2 `copyToClipboard`（clipboard）
- 用 `navigator.clipboard.writeText`；成功 `ok`，异常 → `CLIPBOARD_FAILED`，UI 提示且保留镜头内容（不静默失败）。
- `navigator.clipboard` 不可用（非安全上下文/测试）→ 同样返回 `CLIPBOARD_FAILED`。

### 2.3 组件（presentational，状态上提到 App）
- `App` 拥有 `project` 状态：mount 时 `getCurrentProject()` 恢复；`StoryInput` 生成成功后 `onGenerated(project)` 上提。
- `ShotCard`：本地 `editing` 态；保存时调 `updateShotPrompt` 成功后回调 `onSaved(shotId, prompt)` 更新 App 内存态；复制调 `copyToClipboard` 并就地反馈。
- `ShotList`：按 `index` 升序渲染 3–10 张卡片。
- 加载态：`App` 订阅 `subscribeLlmBusy`，busy 时禁用生成按钮并显示加载（TASK-009）。

> 组件测试：仓库未引入 React 测试库，沿用 TASK-001 先例——组件由 `tsc`/`vite build` 保障类型与可构建，行为核心逻辑下沉到可单测的 `services`。

---

## 3. 文件

| 文件 | 职责 |
|------|------|
| `src/services/storage.ts`（改） | 增 `updateShotPrompt` |
| `src/services/clipboard.ts`（新） | `copyToClipboard` |
| `src/components/ShotCard.tsx`（新） | 单镜头卡片：查看/编辑/复制 |
| `src/components/ShotList.tsx`（新） | 卡片列表（按 index） |
| `src/components/StoryInput.tsx`（改） | 点生成真正调 generateStoryboard + 加载态 + onGenerated 上提 |
| `src/sidepanel/App.tsx`（改） | 持有 project 状态、加载恢复、busy 订阅、渲染 ShotList |

---

## 4. 测试计划（TDD）

- **storage.updateShotPrompt（增）**：
  - 只改目标镜头 prompt 并置 editedByUser=true；其他镜头不变；
  - 无当前项目 / 无匹配 shotId → 安全处理（不抛、不误改）；
  - 写失败 → STORAGE_WRITE_FAILED。
- **clipboard.test.ts**：
  - writeText 成功 → ok；
  - writeText 抛错 → CLIPBOARD_FAILED；
  - navigator.clipboard 不可用 → CLIPBOARD_FAILED。

全套 `npm run lint && test && build` 必须绿。

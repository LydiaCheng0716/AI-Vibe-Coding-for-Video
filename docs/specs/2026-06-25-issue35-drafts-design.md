# Issue #35 设计文档 — 历史 / 草稿保存

> **Issue：** #35 · **优先级：** P3 · **依赖：** `services/storage.ts`、`App.tsx`、`core/models.ts`；**复用 #40 的 `services/collections.ts`**
> **分支：** `feature/issue-35-drafts` → `develop` · 2026-06-25 · merge-when-green

## 1. 目标
本地保存生成过的分镜草稿，可列出 / 打开 / 删除；打开恢复全部镜头、角色与编辑内容；不含凭据。

## 2. 关键决策
### 2.1 草稿库（新 `services/projectDrafts.ts`，建于 #40 集合抽象之上）
`createLocalCollection<ProjectDraftItem>(STORAGE_KEYS.projectDrafts)`，与角色库**共用同一套**本地集合（无第二套实现）。
```ts
interface ProjectDraftItem extends CollectionRecord { title: string; project: Project; }
```
- `saveProjectDraft(project, title?)`：title 缺省取 story 前若干字；存完整 `Project`（含 shots 的 promptEn/editedByUser、characters 的 profile/locked、bgm）。
- `listProjectDrafts()` / `openProjectDraft(id)`（list+find）/ `removeProjectDraft(id)`。
- **隐私（ARCH-LOW-002）**：`Project` 不含任何凭据（API Key / baseUrl 在 settings/keyVault，不在 Project）；`params` 是 GenerationParams（无 provider），故草稿天然无凭据。

### 2.2 UI（新 `components/DraftsPanel.tsx`，接入 `App`）
- 「保存当前为草稿」按钮（保存当前 project）。
- 草稿列表：标题 + 时间；「打开」「删除」。
- 「打开」→ App `saveCurrentProject(draft.project)` + `setProject(draft.project)`：既恢复内存态，也置为 currentProject，使后续单镜头/角色编辑作用于该草稿。

## 3. 文件
| 文件 | 职责 |
|------|------|
| `src/services/projectDrafts.ts`（新） | 草稿库（复用 collections） |
| `src/components/DraftsPanel.tsx`（新） | 保存/列出/打开/删除草稿 |
| `src/sidepanel/App.tsx`（改） | 接入 DraftsPanel + 打开草稿恢复 |

## 4. 测试计划（TDD，`projectDrafts.test.ts`）
- save 存完整 project 且**无凭据字段**；list；open 恢复 shots/characters/bgm（含 editedByUser/promptEn/locked）；remove；title 缺省取 story。

全套 `npm run lint && npm run test && npm run build` 必须绿。

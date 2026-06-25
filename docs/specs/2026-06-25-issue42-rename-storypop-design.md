# Issue #42 设计文档 — 更名 StoryBoard AI → StoryPop

> **Issue：** #42 · **优先级：** P3（chore）· **分支：** `feature/issue-42-rename-storypop` → `develop` · 2026-06-25

## 1. 范围
全量替换**产品显示名** `StoryBoard AI` → `StoryPop`，不改功能。

## 2. 改 / 不改边界
**改（产品名）：**
- manifest：`manifest.config.ts` 的 `name` / `action.default_title` → `StoryPop`。
- UI：侧边栏标题 `App.tsx`；导出标题 `core/export.ts`（`StoryBoard AI 分镜` → `StoryPop 分镜`，保留通用词「分镜」）。
- `index.html` `<title>`；`package.json` 的 `name`（`storyboard-ai`→`storypop`）+ `description`；`package-lock.json` 同步 name。
- `README.md` / `docs/*`（PRD / architecture / api-spec / db-design）中的产品名（含 README 锚点链接）。

**不改（通用词 / 功能标识，区分产品名 vs「分镜(storyboard)」）：**
- 代码标识符 `buildStoryboardPrompt` / `parseStoryboard` / `generateStoryboard` / `STORYBOARD_TIMEOUT_MS` 等。
- IndexedDB 库名 `KEY_DB.name = 'storyboard-keys'`（改它会让既有用户丢失已存密钥——属功能/迁移变更，禁改）。
- 导出下载文件名 `storyboard.<ext>`（指「分镜」产物，通用）。
- `docs/specs/*` 历史设计文档以任务名记录，不含产品名，无需改。

## 3. 验收
- 构建出的 `dist/manifest.json` name = `StoryPop`；侧边栏/设置/面板文案为 StoryPop。
- `npm run lint && npm run test && npm run build` 全绿；`npm ci` 一致（package-lock 同步）。
- 全仓 `grep -ri "storyboard"` 仅余通用词/代码标识符，无残留产品名 `StoryBoard AI`。

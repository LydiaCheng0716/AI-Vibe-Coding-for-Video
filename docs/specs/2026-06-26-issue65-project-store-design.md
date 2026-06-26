# Issue #65 Project Store Design

## 背景

当前 sidepanel 以 `App.tsx` 的 `useState<Project | null>` 作为内存态，同时 `ShotCard`、`ShotList`、`CharacterPanel`、`StylePanel`、`BgmPanel`、`DraftsPanel` 各自调用 `services/storage` 写入 `currentProject`，再通过 `onProjectUpdated` / `onShotChanged` / `onBgmGenerated` 回传给 App。这样形成两套推进路径：

- storage 是持久化真值；
- App 内存态又可被子组件按局部 patch 推进。

只要某个保存失败、并发动作交错，或局部 patch 不含重注入后的完整项目，就可能出现 UI 与 `chrome.storage.local.currentProject` 不一致。

## 目标

引入轻量 project store，作为当前项目的唯一 UI 数据源。所有当前项目修改必须走 store action；action 内部执行串行的 storage RMW、成功后广播完整 Project，失败时不推进 UI 并返回可读错误。

## 方案

新增 `src/sidepanel/projectStore.tsx`：

- `ProjectStoreProvider`：React Context Provider，挂在 `App` 根部。
- `useProjectStore()`：组件读取 `{ project, projectLoadVersion, error }` 和 actions。
- `createProjectStore()`：可测试的 store 核心，内部维护 state、订阅者、串行动作队列。

Store state：

```ts
interface ProjectStoreState {
  project: Project | null;
  projectLoadVersion: number;
  error: string | null;
}
```

Store actions：

- `loadCurrentProject()`
- `replaceProject(project)`：生成新项目/打开草稿等整项目切换；成功后 `projectLoadVersion + 1`
- `updateShotPrompt(shotId, prompt)`
- `replaceShot(shotId, shot)`
- `setShots(shots)`
- `updateShotFirstFrame(shotId, firstFrame)`
- `updateShotTransition(shotId, transition)`
- `updateCharacter(id, patch)`
- `addCharacter(input)`
- `updateGlobalStyle(patch)`
- `updateBgm(bgm)`

实现策略：

1. Store action 通过内部 promise queue 串行执行，避免多个 UI 事件同时写盘后乱序广播。
2. 每个 action 调用既有 `services/storage` RMW 函数。storage 层已有 `projectLock`，store 队列是 UI 广播层的顺序保证。
3. action 成功后统一读取/使用完整 Project 并 dispatch；失败时只记录 `error`，不改 `project`。
4. 组件不再 import `updateX` / `saveCurrentProject` / `onProjectUpdated`，而是调用 store action。局部历史栈、编辑草稿、notice 等仍留在组件本地。
5. `projectLoadVersion` 替代 App 的 `projectLoadKey`，用于切换项目时重挂载 `StylePanel`。

## 迁移点

- `App.tsx`
  - 移除 `project` 本地 `useState` 与 `onProjectUpdated` 等回调。
  - 内部内容用 `ProjectStoreProvider` 包裹，读取 store project 渲染面板。
  - `StoryInput.onGenerated` 调用 `replaceProject`。
- `DraftsPanel`
  - 打开草稿后调用 `replaceProject`，失败则保持当前 UI。
- `StylePanel`
  - `persist()` 改为 `updateGlobalStyle()`。
- `CharacterPanel`
  - 新增/库注入调用 `addCharacter()`。
  - 卡片调校/锁定调用 `updateCharacter()`。
- `ShotList`
  - 结构编辑调用 `setShots()`。
  - 插入后即时生成填充调用 `replaceShot()`。
  - 转场调用 `updateShotTransition()`。
- `ShotCard`
  - 保存 prompt、重写、撤销、首帧保存调用 store。
- `BgmPanel`
  - BGM 保存调用 `updateBgm()`。

## 失败语义

所有 store action 返回原 `Result<T>`。组件只在 `ok` 后清本地编辑态/历史栈/提示；`!ok` 时展示 `error.message`。store 本身在失败时保持上一份 `project` 不变，从而消灭“UI 已切但 storage 没改”的竞态。

## 测试计划

新增 `tests/unit/projectStore.test.ts`：

- 并发更新串行：同时更新不同镜头与 BGM，最终 storage 和 store state 同时包含全部更新。
- 失败不前进：mock `chrome.storage.local.set` 抛错，action 返回 `STORAGE_WRITE_FAILED`，store project 保持旧值。
- 广播一致：每次成功 action 的订阅广播 project 与 `getCurrentProject()` 一致；整项目替换增加 `projectLoadVersion`。

回归门禁：

- `npm run lint`
- `npm run test`
- `npm run build`

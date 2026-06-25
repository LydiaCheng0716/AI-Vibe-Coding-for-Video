# Issue #56 设计文档 — 镜头增删 + 拖拽排序 + 中间插入

> **Issue：** #56 · **优先级：** P2 · **依赖：** ShotList/ShotCard、models、generation（插入即时生成）
> **分支：** `feature/issue-56-shot-editing` → `develop` · 2026-06-25 · merge-when-green

## 1. 目标
镜头列表可手动编排：删、插（空白/基于一句描述即时生成）、拖拽排序，序号自动更新；增删/重排后导出/角色/风格注入一致；复用撤销栈。

## 2. 关键决策
### 2.1 纯函数（新 `core/shotOps.ts`，可测）
`reindexShots`（按数组序重排 index=1..N）、`nextShotId`、`makeBlankShot`、`deleteShotById`、`insertShotAt(index, shot)`、`moveShot(shotId, toIndex)`——均返回**重排好 index** 的新数组、不可变。

### 2.2 持久化（`services/storage.ts`）
`setShots(shots)`：projectLock 内整组替换 `project.shots`（不再二次 reindex，调用方已排好；撤销时可原样还原），返回 Project。删/插/移/撤销都走它。

### 2.3 即时生成（复用 #30 管线）
插入空白镜头（`makeBlankShot`，prompt 空）→ 若用户给了一句描述，立即 `rewriteShot({mode:'feedback', feedback:描述})` 填充——复用 #30 重写管线，自动注入锁定角色 + 全局风格，保持一致。

### 2.4 撤销（与 #30 一致的版本栈，列表级）
ShotList 维护「结构操作前的 shots 快照栈」；删/插/移前压栈；「撤销」弹栈 `setShots(prev)`。删除带 `confirm`。

### 2.5 一致性
- 序号：每次结构操作 `reindexShots` → index 连续。
- 导出：读 `project.shots` 顺序 + index → 自动一致。
- 角色/风格注入：锚点已在各 shot.prompt 内，随 shot 移动；插入的空白镜头无引用，填充后经重写注入。
- 转场（#54 尚未做）：本条不引入 transition 字段；#54 实现时须处理重排（相邻关系变化）——在 #54 设计中明确。

### 2.6 UI（`ShotList.tsx` 改 + `ShotCard.tsx` 加删除入口）
- 每镜间 + 首尾「插入条」：可选描述输入 + 「插入」（空白或即时生成）。
- ShotCard 头部加「删除」（confirm）。
- 卡片包裹层 `draggable`：HTML5 拖拽，`onDrop` → `moveShot` → 序号更新。
- 列表级「撤销」按钮（有快照时显示）。

## 3. 测试计划（TDD）
- **shotOps.test**：reindex 连续；nextShotId 不冲突；delete/insert/move 后 index 正确、其它不变；越界 index 收敛。
- **storage.setShots**：整组替换并保存；无项目 → ok(null)。

全套 `npm run lint && npm run test && npm run build` 必须绿。

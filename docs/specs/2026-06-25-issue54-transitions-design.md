# Issue #54 设计文档 — 转场建议（镜头衔接：选类型→生成转场说明）

> **Issue：** #54 · **优先级：** P2 · **依赖：** generation、ShotList/ShotCard、models（transition 字段）、export
> **分支：** `feature/issue-54-transitions` → `develop` · 2026-06-25 · merge-when-green

## 1. 目标
相邻两镜间选转场类型 → 基于前后两镜生成转场说明；可编辑/复制/纳入导出；跟随输出语言（含双语）。

## 2. 关键决策
### 2.1 数据模型（`core/models.ts`）
```ts
interface Transition { type: string; note: string; noteEn?: string; }  // type=类型 id；双语含 noteEn
// Shot.transitionToNext?: Transition   // 「本镜→下一镜」的转场；末镜不展示
```

### 2.2 转场类型（新 `core/transitions.ts`，可扩展）
`TRANSITION_TYPES`：硬切/叠化/匹配剪辑/甩镜/运动接运动/黑场（id + zh/en label）；`transitionLabel(id, lang)`。

### 2.3 与 #56 重排协同（`core/shotOps.ts`）
新增 `clearStaleTransitions(before, after)`：结构操作后，若某镜的「后继 id」变了则清掉其 `transitionToNext`（避免转场描述错配新邻居）。`deleteShotById/insertShotAt/moveShot` 内调用——重排/增删后转场保持一致（不残留错配）。撤销走 setShots(快照) 不经此，原样还原。

### 2.4 生成（`prompts/transition.ts` + `core/parse.ts` + `services/generation.ts`）
- `buildTransitionPrompt(prev, next, typeId, lang)`：给前后两镜内容 + 类型，要求生成承接动作/视线/构图/节奏的说明；双语要 note+noteEn。
- `parseTransition(raw)`：取 `{note, noteEn?}`（JSON 优先，回退整段文本为 note）。
- `generateTransition({prevShot, nextShot, type, apiKey})`：preflight + 全局锁 + 短超时 + 退避重试 → `Transition`。

### 2.5 持久化（`services/storage.ts`）
`updateShotTransition(shotId, transition | null)`：projectLock 内设/清某镜 transitionToNext，返回 Project。

### 2.6 导出（`core/export.ts`）
- Markdown/纯文本：在镜头 i 与 i+1 之间插入「转场：{类型} — {说明}」（双语按 promptLang）。
- JSON：transitionToNext 随 shot 已含。
- CSV：新增「转场(至下一镜)」列。

### 2.7 UI（`components/ShotList.tsx` 新增 TransitionBar）
相邻两镜间：类型下拉 + 「生成转场」；已有转场显示说明（可编辑文本 + 复制）+「重新生成」/「清除」。双语显示中英。

## 3. 测试计划（TDD）
- **transitions.test**：类型表非空、label 中英。
- **shotOps clearStaleTransitions**：删/插/移后邻居变化的镜头 transition 被清，不变的保留。
- **parse.parseTransition**：JSON note/noteEn；回退纯文本；空→null。
- **generation generateTransition**：成功产出 Transition；双语含 noteEn；前置失败不发；锁占用→IN_PROGRESS。
- **storage.updateShotTransition**：设/清。
- **export**：MD/纯文本含转场行；CSV 含转场列；JSON 含 transitionToNext。

全套 `npm run lint && npm run test && npm run build` 必须绿。

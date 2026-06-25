# Issue #30 设计文档 — 单镜头迭代：重新生成 + 反馈式优化（含 #32 共用管线）

> **Issue：** #30 · **优先级：** P2 · **依赖：** `generation.ts`、`llmLock.ts`、`ShotCard.tsx`；复用 #29 锁定角色注入
> **分支：** `feature/issue-30-single-shot-iterate` → `develop` · **日期：** 2026-06-25 · merge-when-green

---

## 1. 目标与范围

把单镜头做成可迭代：(a) 盲重生成、(b) 反馈式优化（一句反馈→只改写该镜头提示词），可多轮迭代 + 撤销。
**与 #32 共用同一套「重写单镜头」管线**——本任务建好三模式管线（regenerate / feedback / **params**），
#30 UI 用 regenerate+feedback，#32 接 params 模式（只加参数下拉 UI，复用同一函数）。

**本任务做：** 重写管线（核心）+ #30 的 A/B/撤销 UI。**不做：** #32 的参数下拉 UI（下一条接 params 模式）。

---

## 2. 关键决策

### 2.1 统一重写管线（`prompts/rewrite.ts` + `services/generation.ts`）
三入口共用一个函数，杜绝三套逻辑：

```ts
export type RewriteMode = 'regenerate' | 'feedback' | 'params';
export interface RewriteShotInput {
  project: Project;                         // story / params / characters / shots（内存态传入）
  shotId: string;
  mode: RewriteMode;
  feedback?: string;                        // mode=feedback
  paramOverrides?: Partial<Pick<Shot,'shotSize'|'cameraMovement'|'durationSuggestion'>>; // mode=params(#32)
  apiKey?: string;                          // 不落盘一次性 Key
}
export async function rewriteShotAttempt(input, deps: PreflightDeps): Promise<Result<Shot>>; // 不锁不存
export async function rewriteShot(input, deps?, retryOpts?): Promise<Result<Shot>>;          // withLlmLock+retry
```

- **prompt（`buildShotRewritePrompt(ctx, mode)`）**：给模型「故事 + 当前镜头(景别/运镜/时长/原提示词) + 模板风格 + 输出语言」，要求**只输出单镜头 JSON** `{summary,shotSize,cameraMovement,durationSuggestion,prompt}`。
  - regenerate：同参重拍，换一种表达/构图。
  - feedback：基于「原提示词 + 用户反馈」改写，保留景别/角色一致性约束。
  - params：按 `paramOverrides` 的新景别/运镜/时长改写提示词。
- **解析**：`parseShotRewrite(raw)` 复用 `SHOT_FIELDS` 校验，返回 5 字段或 null（→ BAD_RESPONSE_FORMAT）。
- **组装**：保留原 `id/index/characterRefs`；params 模式用 `paramOverrides` **强制覆盖**三参数字段（用户选的为准，不信模型回显）；`editedByUser=false`（AI 产物）。
- **锁定角色注入**：组装后调 **#29 已导出的 `injectCharactersIntoShot(shot, byId, lang)`**——锁定/普通角色锚点逐字注入该镜头，**不被模型改写**（#30↔#29 协同；正是 #29 §6 预留接口）。
- **锁与重试**：`rewriteShot` 走 `withLlmLock`（与整单生成/BGM 互斥，复用全局锁防重复提交）+ `withRetry`。**不自行落库**——UI 成功后调 `storage.replaceShot` 持久化（与 BGM 一致的「服务产出、UI 落库」约定）。

### 2.2 持久化（`services/storage.ts`）
`replaceShot(shotId, shot)`：projectLock 内 RMW，按 id 整条替换该镜头（保留 index），其余不变；无项目/无匹配 → ok 无副作用。

### 2.3 UI（`components/ShotCard.tsx` + 串接 `App`/`ShotList`）
- 每卡新增「重新生成」按钮（mode=regenerate）。
- 反馈输入框 + 「优化」按钮（mode=feedback）。
- **撤销**：卡内维护版本栈；每次重写前压入当前 shot；「撤销」弹栈并 `replaceShot` 回上一版（多轮迭代可逐步回退）。
- 重写期间该卡加载态；`busy`（全局锁）时禁用，防重复提交。
- ShotCard 需要 `story/params/characters` 上下文 → 由 `App` 经 `ShotList` 传入（新增 `project` 相关 props + `onShotRewritten`）。

---

## 3. 文件
| 文件 | 职责 |
|------|------|
| `src/prompts/rewrite.ts`（新） | `buildShotRewritePrompt(ctx, mode)` 三模式 prompt |
| `src/core/parse.ts`（改） | `parseShotRewrite(raw)` 单镜头解析 |
| `src/services/generation.ts`（改） | `rewriteShotAttempt` / `rewriteShot`（共用管线） |
| `src/services/storage.ts`（改） | `replaceShot(shotId, shot)` |
| `src/components/ShotCard.tsx`（改） | 重新生成 / 反馈优化 / 撤销 UI |
| `src/components/ShotList.tsx`、`src/sidepanel/App.tsx`（改） | 透传 project 上下文 + 重写回调 |

## 4. 测试计划（TDD）
- **rewrite prompt**：三模式 prompt 含对应意图（feedback 含反馈文本、params 含新参数、含输出语言/模板）。
- **parseShotRewrite**：合法单镜头 → 5 字段；缺字段/非 JSON → null。
- **generation rewrite**：regenerate/feedback/params 各产出新 Shot；params 模式三参数被 override 覆盖；锁定角色锚点注入到结果；保留 id/index/characterRefs；前置校验失败不发请求；锁占用 → GENERATION_IN_PROGRESS。
- **storage.replaceShot**：替换目标镜头、保留 index、其余不变；无项目/无匹配 → ok 无副作用；走锁串行。

全套 `npm run lint && npm run test && npm run build` 必须绿。

## 5. 与 #32 协同
本任务已建好 `mode:'params'` 与 `paramOverrides` 覆盖逻辑；#32 仅在 ShotCard 加景别/运镜/时长下拉，change 即调 `rewriteShot({mode:'params', paramOverrides})`，复用同一管线、解析、注入、落库——不新增重写逻辑。

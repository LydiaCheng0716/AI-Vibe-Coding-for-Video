# Issue #104 设计文档 — 自动翻译同步：默认开启 + 消耗提示 + 往返覆盖防护

> **Issue：** #104 · **类型：** bug 排查结论 → 可发现性/默认值改动 · **依赖：** #53（双语自动翻译同步）；#41（双语）
> **分支：** `feature/issue-104-autosync-default` → `develop` · 2026-06-29 · merge-when-green

## 1. 排查结论（先确认，再决定方向）

按 Issue 指令先确认「开启自动同步后，编辑中文→英文是否真的同步」：

- 开关来自 [`ShotCard.tsx`](../../src/components/ShotCard.tsx) `autoSync` state，挂载时读 `settings.autoTranslateSync ?? false`（#53 设计的**默认关**）。
- 开启后中文框 `onBlur` → `onTranslate('zh')`：守卫 `!autoSync` 放行 → `translateText` → 成功 `setDraftEn(cur => cur === before ? r.data : cur)` 写入英文框。
- **逻辑成立：开了确实会自动翻译同步。** 故本条 **不是逻辑 bug**，按 Issue 指令进入「提升可发现性 / 默认开启（默认开要提示消耗额度）」路径。

## 2. 决策（记录在案，门禁可否决）

### 2.1 默认开启 + 消耗提示（运营指令）
- `defaults.ts` 的 `autoTranslateSync` 由 `false` → **`true`**。
- 紧邻开关增加**常驻**说明：开启后「每次失焦编辑会调用一次 LLM 翻译、消耗你自带 Key 的额度」。
- **决策说明**：#53 当初默认关是出于「避免误触消耗额度」的成本安全考虑；本条按运营明确指令翻转为默认开，并以**显著的额度消耗提示**对冲该风险（Issue 原文：「默认开要提示消耗额度」）。属 #104 范围内的明确指令，非自行扩范围。仍保留开关，用户可随时关闭并持久化（已有 `onAutoSyncChange`）。

### 2.2 往返覆盖防护（落实「手改英文不被反向覆盖」）
- **问题**：默认开启后，编辑中文 → 同步出机翻英文；若仅点进英文框又点出（未编辑），`onBlur` 仍触发 En→Zh 回译，**覆盖原本的好中文**（往返降级）。现有 `cur === before` 只挡在途竞态，挡不住此「未改动也翻译」。
- **修复**：为每个方向记录「**上次同步/载入时的源文本快照**」（`lastSyncedZh` / `lastSyncedEn`）。`onTranslate(from)` 仅当**源框当前值 ≠ 该方向上次快照**（即用户真的改了源框）才发起翻译；否则直接返回不调用 LLM。
  - 一次成功翻译后，**同时**更新源框与目标框两个方向的快照（两边已一致，避免紧接着的另一侧 blur 误判为"有改动"再次回译）。
  - 载入镜头 / 进入编辑 / 取消时，快照重置为当前 `draft` / `draftEn`。
- **收益**：① 消除往返覆盖；② 手改英文后再点别处不会被无意义回译反复折腾；③ 顺带省额度（无改动不翻译）。

> 保留既有的 `cur === before` 在途守卫（防延迟响应覆盖在途编辑，#53 Codex P2）——两者正交，都保留。

## 3. 改动点

| 文件 | 改动 |
|------|------|
| `src/core/defaults.ts` | `autoTranslateSync: true` |
| `src/components/ShotCard.tsx` | 新增 `lastSyncedZh/En` ref；`onTranslate` 增「源改动才翻译」守卫 + 成功后更新双向快照；`onEdit`/`onCancel`/载入重置快照；开关旁加常驻额度提示文案 |
| `src/i18n/zh.ts` / `src/i18n/en.ts` | 新增 `shotCard.autoSyncCostHint`（额度消耗提示）。fr 在 #98 补 |

> 不改 `translate.ts` / `generation.ts` / storage：纯 UI 默认值 + 守卫，additive、可逆。

## 4. 测试计划（TDD，`tests/unit/ShotCard.test.tsx`）

RED→GREEN，新增/调整：
1. **默认开启**：未触开关时，`getSettings` 返回默认 → 编辑中文失焦**会**触发一次翻译（原默认关用例改为显式关闭后断言不翻译）。
2. **往返覆盖防护**：编辑中文→失焦→同步出英文；随后**仅聚焦英文框再失焦（不改）**→ **不发起翻译**、中文不被覆盖。
3. **真改动仍翻译**：手改英文→失焦→触发 En→Zh 一次；中文随之更新；英文手改值保留（不被反向覆盖）。
4. **关闭开关**：`autoSync=false` 时任意失焦都不翻译（回归）。
5. 既有「失败不覆盖」「在途编辑不被延迟响应覆盖」用例保持绿（在默认开启下复核）。

全套 `npm run lint && npm run test && npm run build` 必须绿；保持 471+ 全过。

## 5. 协同 / 边界
- 只动**界面语言下的 UI 行为与默认值**，不碰输出提示词语言（与 #98 法语隔离一致）。
- 与 #30/#32 单镜头重写互不影响：翻译只读写 `draft/draftEn` 两个编辑草稿，不进重写管线。

# Issue #57 设计文档 — 每镜「首帧图像提示词」（适配即梦/MJ/SD 出图）

> **Issue：** #57 · **优先级：** P2 · **依赖：** prompts、storyboard、ShotCard、export；与 #29 角色、#55 全局风格协同
> **分支：** `feature/issue-57-first-frame` → `develop` · 2026-06-25 · merge-when-green

## 1. 目标
为每个镜头额外生成一段「首帧图像提示词」（聚焦构图/主体/光线/风格，弱化运镜与时序），适配静态出图工具；默认不生成（省额度），按需生成；注入锁定角色 + 全局风格（与视频提示词同源）；可单独复制 + 纳入导出；遵守输出语言（含双语）。

## 2. 关键决策
### 2.1 数据模型（`core/models.ts`）
`Shot.firstFramePrompt?: string` + `firstFramePromptEn?: string`（双语英文版）。

### 2.2 「默认关」= 按需生成
不在整片生成时产出首帧（避免额外消耗）；每镜一个「生成首帧提示词」按钮，点了才生成（也用于重新生成）。

### 2.3 生成（`prompts/firstFrame.ts` + `parse.parseFirstFrame` + `generation.generateFirstFrame`）
- `buildFirstFramePrompt(shot, characters, globalStyle, lang)`：给镜头概要 + 视频提示词 + **该镜引用角色的锚点**（`characterAnchor`）+ **锁定的全局风格锚点**（`composeStyle`），要求生成静态出图 prompt（构图/主体/光线/风格/色彩，弱化运镜/动作时序）。同源一致。双语要 firstFrame + firstFrameEn。
- `parseFirstFrame(raw)`：取 `{firstFrame, firstFrameEn?}`（JSON 优先，回退整段文本）。
- `generateFirstFrame({shot, characters, globalStyle, lang, apiKey})`：preflight + 全局锁 + 短超时 + 退避重试。`lang` 传**项目语言**（非 settings，#54 P2 教训）。

### 2.4 持久化（`services/storage.ts`）
`updateShotFirstFrame(shotId, { firstFramePrompt, firstFramePromptEn? } | null)`：projectLock 内设/清，返回 Project。

### 2.5 导出（`core/export.ts`）
Markdown/纯文本：镜头块内加「首帧图像提示词」段（双语按 promptLang）；CSV：加「首帧图像提示词」列；JSON：随 shot 已含。

### 2.6 UI（`components/ShotCard.tsx`）
「生成首帧提示词」按钮（按需 / 重新生成）；生成后单独展示（双语中英）+「复制首帧」；busy/不落盘一次性 Key 复用。

## 3. 测试计划（TDD）
- **firstFrame prompt**：含构图/弱化运镜字样、含角色锚点、含锁定风格锚点；双语 shell 含 firstFrameEn。
- **parse.parseFirstFrame**：JSON / 回退 / 空。
- **generation.generateFirstFrame**：成功产出（注入角色+风格）；双语含 En；input.lang 覆盖；前置失败不发；锁占用→IN_PROGRESS。
- **storage.updateShotFirstFrame**：设/清。
- **export**：MD/纯文本含首帧段；CSV 含首帧列；JSON 含 firstFramePrompt。

全套 `npm run lint && npm run test && npm run build` 必须绿。

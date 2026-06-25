# Issue #55 设计文档 — 全局风格锁（整片视觉统一 + 建议选项）

> **Issue：** #55 · **优先级：** P2 · **依赖：** 复用 #29 范式；与 #30/#32 重写管线协同
> **分支：** `feature/issue-55-global-style` → `develop` · 2026-06-25 · merge-when-green

## 1. 目标
像角色一致性那样锁定「整片视觉风格」，AI 给建议选项，用户调校/锁定后逐镜注入，保证全片统一；可跳过；遵守输出语言（含中英双语）。是 #54 转场 / #57 首帧的统一锚点。

## 2. 关键决策（全面复用 #29「建议+选项+锁定+注入」范式）
### 2.1 数据模型（`core/models.ts`）
```ts
type StyleFieldKey = 'colorGrade' | 'lighting' | 'lensFocal' | 'filmTexture' | 'mood';
interface StyleProfile { colorGrade; lighting; lensFocal; filmTexture; mood; }   // 色调/光线/镜头焦段/胶片质感/氛围
interface GlobalStyle { profile: StyleProfile; suggestions?: Partial<Record<StyleFieldKey,string[]>>; locked?: boolean; }
// Project.globalStyle?: GlobalStyle（optional，向后兼容）
```

### 2.2 字段元数据 + 合成（新 `core/styleProfile.ts`，仿 characterProfile）
`STYLE_FIELD_KEYS` / `STYLE_FIELD_LABELS`(zh/en/zh-en) / `emptyStyleProfile()` / `composeStyle(profile, lang)`（非空字段拼单行锚点）。

### 2.3 注入（新 `core/style.ts`，仿 characters 注入）
- `styleAnchorLine(globalStyle, lang)`：`- 全局风格：{composeStyle}`，空/未锁 → null。
- `injectStyleIntoShot(shot, globalStyle, lang)`：locked 且非空时把风格锚点行注入该镜头 prompt（精确整行幂等、跳过 editedByUser、独立 header `全局风格参考：`）。
- `injectGlobalStyle(project)` / `reinjectGlobalStyle(project)`（调校后剥旧块重注入）。
- 与角色注入并存（不同 header，互不干扰）。

### 2.4 生成 + 解析（`prompts/storyboard.ts` + `core/parse.ts`）
- storyboard system 加 `styleInstruction()`：要求基于故事产出 `globalStyle.profile`（5 字段）+ 未定字段的 `suggestions`（2–4，参照 #29）；JSON_SHELL 加 globalStyle 形状。
- `parseStoryboard` 解析 `globalStyle`（profile/suggestions，向后兼容缺省）；`buildProject` 带上。

### 2.5 单字段「重新建议」（新 `services/styleSuggest.ts`，仿 characterSuggest）
`suggestStyleField({field, story, apiKey}, deps?)`：复用 `preflightProvider` + 全局锁 + 短超时 + `parseFieldSuggestions`；prompt 见 `prompts/style.ts`。

### 2.6 与 #30/#32 重写管线协同（`services/generation.ts`）
`rewriteShotAttempt` 末尾在角色注入后追加 `injectStyleIntoShot(..., project.globalStyle, lang)`——重写/调参后仍保持锁定风格锚点。全量生成同理在 `injectCharacterConsistency` 后 `injectGlobalStyle`。

### 2.7 持久化（`services/storage.ts`）
`updateGlobalStyle(patch)`：projectLock 内合并 globalStyle → `reinjectGlobalStyle` 刷新镜头 → 保存 → 返回 Project。

### 2.8 UI（新 `components/StylePanel.tsx`，接入 `App`）
5 字段：当前值（自由文本）+ 候选 chips + 「重新建议」；「锁定/解锁」；可「跳过/收起」。锁定/调校即重注入落库。不落盘模式给一次性 Key（同 #29）。

## 3. 测试计划（TDD）
- **styleProfile.test**：5 字段/标签齐全；composeStyle 非空单行；空→''。
- **style.test**：locked 注入锚点行、未锁不注、幂等、跳过 editedByUser；reinject 改风格不残留旧值；zh-en header。
- **parse.test（增）**：解析 globalStyle profile/suggestions；缺省兼容。
- **styleSuggest.test**：成功 2–4；前置失败不发；锁占用→GENERATION_IN_PROGRESS。
- **generation（增）**：rewrite 后含锁定风格锚点；全量生成注入风格。
- **storage（增）**：updateGlobalStyle 合并+重注入。

全套 `npm run lint && npm run test && npm run build` 必须绿。

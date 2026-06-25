# Issue #29 设计文档 — 角色一致性增强 + 角色描述建议与选项（P1 重点）

> **Issue：** #29 · **优先级：** P1（重点）· **依赖：** `core/characters.ts`、`prompts/characters.ts`；与 #30 协同
> **分支：** `feature/issue-29-character-cards` → `develop`
> **日期：** 2026-06-25 · **合并策略：** merge-when-green

---

## 1. 目标与范围

当前角色卡基本是回显输入，缺少能锁住人物不漂移的**外观锚点**，用户也无法干预长相。
把「角色」做成**结构化、可由用户用建议+选项调校、锁定后逐字注入每个镜头**的一等公民。

**本任务做（对齐验收 A/B/C）：**
- **A 结构化角色卡**：固定 10 字段档案 + 逐字注入每镜头角色参考段（按输出语言）。
- **B 建议与选项**：未明确字段给 2–4 候选（chip）+ 自由文本编辑 + 「重新建议」仅重生该角色该字段 + 多角色独立 + 手动新增角色。
- **C 锁定与一致性**：锁定为权威版，后续（含 #30 单镜头重生成）注入这版、不被模型改写；每角色一句「外观种子(seed 短语)」。

**本任务不做：** 参考图上传（纯文本一致性）；#30 单镜头重生成本体（本任务只**预留可复用接口**）。

---

## 2. 数据模型（`core/models.ts`）

```ts
export type CharacterFieldKey =
  | 'codename' | 'ageRange' | 'gender' | 'ethnicitySkin' | 'hair'
  | 'face' | 'build' | 'clothing' | 'accessories' | 'demeanor';

export interface CharacterProfile {     // 固定 10 字段（A）
  codename: string; ageRange: string; gender: string; ethnicitySkin: string; hair: string;
  face: string; build: string; clothing: string; accessories: string; demeanor: string;
}

export interface Character {
  id: string;
  name: string | null;
  appearance: string;                                    // 渲染锚点（旧数据/注入回退）
  profile?: CharacterProfile;                            // 结构化档案（A）
  suggestions?: Partial<Record<CharacterFieldKey, string[]>>; // 每字段候选（B）
  locked?: boolean;                                      // 锁定权威版（C）
  seedPhrase?: string;                                   // 外观种子短语（C）
}
```

**向后兼容**：旧 Project 的 `Character` 只有 `{id,name,appearance}`；新增字段全 optional，注入在无 `profile` 时回退到 `appearance`（既有 180+ 测试不回归）。

---

## 3. 关键决策

### 3.1 字段元数据（新 `core/characterProfile.ts`，纯函数）
- `CHARACTER_FIELD_KEYS`：固定顺序的 10 键（注入/UI 共用，单一来源）。
- `CHARACTER_FIELD_LABELS: Record<OutputLanguage, Record<CharacterFieldKey,string>>`：中/英标签（按输出语言）。
- `emptyProfile()`：全空档案（手动新增角色用）。
- `composeAppearance(profile, lang)`：把**非空**字段拼成单行锚点，如 `代号:林夏 | 年龄段:25–34 | 发型发色:黑长直 | ...`（只取非空 → 控制长度、避免超 token）。
- `mergeProfileIntoAppearance(char, lang)`：有 `profile` → `composeAppearance`；否则用 `char.appearance`。

### 3.2 注入改造（`core/characters.ts`）
沿用「精确整行匹配、幂等、不可变、跳过 editedByUser」骨架，升级注入内容：
- 每个引用角色注入整行 `- {显示名}：{锚点}`，锚点优先取 `profile` 合成（A：逐字注入档案）。
- **锁定即权威**：注入永远使用角色当前 `profile/appearance`（用户锁定后的值），确定性覆盖，**模型无从改写**（C）。
- 只注入该镜头 `characterRefs` 命中的角色（多角色时天然裁剪长度，避免超 token）。
- **为 #30 预留可复用接口**（导出纯函数，单镜头重生成可直接调用）：
  - `characterAnchorLine(character, lang): string` — 单角色权威整行。
  - `injectCharactersIntoShot(shot, charactersById, lang): Shot` — 把命中角色锚点注入单个 shot（幂等）。`injectCharacterConsistency` 复用之；#30 重生成单镜头后调它即可保持锁定角色不漂移。

### 3.3 提示词（`prompts/characters.ts` + `prompts/storyboard.ts`）
- `characterInstruction()` 升级：要求模型为每个明确角色输出 `profile`（10 字段）；故事**未明确**的字段给 `suggestions`（2–4 个），并给一句 `seedPhrase`；保留「无明确人物→空数组、不编造、不臆测敏感属性」红线（B 的候选是「可选建议」，不是强行编造档案）。
- `storyboard.ts` 的 `JSON_SHELL` 扩展 `characters[]` 形状含 `profile`/`suggestions`/`seedPhrase`（保持 `name`/`appearance` 兼容字段）。

### 3.4 解析（`core/parse.ts`）
- 解析 `characters[].profile`（逐字段 string 清洗，缺字段补空）、`suggestions`（每键 string[]，截 2–4、去空、`CHAR_SUGGESTIONS_MAX` 上限保护）、`seedPhrase`。
- `appearance`：模型给了就用；没给但有 `profile` → `composeAppearance` 兜底，保证锚点非空。
- 完全向后兼容：只有 `appearance` 的老格式照常解析。

### 3.5 单字段「重新建议」服务（新 `services/characterSuggest.ts`）
- `suggestCharacterField({ character, field, story?, params }, deps?) → Result<string[]>`：**仅**对该角色该字段发一次小 LLM 调用，返回 2–4 候选；**不动其它字段/角色**（B）。
- 复用 `preflightProvider`（从 `generation.ts` 导出复用，避免重复校验逻辑）+ 全局 `withLlmLock`（与分镜/BGM 互斥，ARCH-MED-004）+ 短超时。
- prompt 见 `prompts/characters.ts` 的 `buildFieldSuggestionPrompt`。

### 3.6 持久化（`services/storage.ts`）
走既有 `withProjectLock`（串行 RMW，防并发覆盖）：
- `updateCharacter(id, patch)`：浅合并某角色（采纳建议/自由编辑/锁定/seed）。
- `addCharacter(character)`：手动新增角色入库（B）。
- 改角色后**重注入**：更新角色后对**非 editedByUser** 的镜头重算注入（锁定/改档案即时反映到镜头），但不强制——本任务在 storage 层提供 `updateCharacter` + 由调用方决定是否重注入；UI「锁定」后调用 `injectCharacterConsistency` 落库。

### 3.7 UI（新 `components/CharacterPanel.tsx`，接入 `App.tsx`）
- 每角色一张卡，10 字段逐行：当前值（自由文本 input）+ 候选 chips（点选即填）+ 「重新建议」按钮（仅该字段）。
- 「锁定/解锁」按钮（锁定后字段只读、标记权威）；显示并可复制 `seedPhrase`。
- 「新增角色」按钮（空档案卡）。多角色各自独立卡、独立调校。
- 放在 `ShotList` 之上（角色先于镜头）；锁定/编辑后更新内存态并落库 + 重注入。
- 与 `subscribeLlmBusy` 协同：生成/建议进行中禁用「重新建议」。
- **不落盘模式**（`persistApiKey=false`）：面板顶部渲染一次性 Key 输入，作为 override 透传给 `suggestCharacterField`、永不保存——否则该模式下「重新建议」恒 `NO_API_KEY`（Codex 外门 P2，与生成区/测试连接一致）。

---

## 4. 文件

| 文件 | 职责 |
|------|------|
| `src/core/models.ts`（改） | `CharacterFieldKey`/`CharacterProfile`/`Character` 扩展 |
| `src/core/characterProfile.ts`（新） | 字段键/标签/`emptyProfile`/`composeAppearance`（纯函数） |
| `src/core/characters.ts`（改） | 注入用 profile 锚点；导出 `characterAnchorLine`/`injectCharactersIntoShot`（#30 复用） |
| `src/core/parse.ts`（改） | 解析 profile/suggestions/seedPhrase，向后兼容 |
| `src/prompts/characters.ts`（改） | 结构化档案 + 建议 + seed 指令；单字段建议 prompt |
| `src/prompts/storyboard.ts`（改） | JSON_SHELL 扩展 characters 形状 |
| `src/services/generation.ts`（改） | 导出 `preflightProvider` 供复用 |
| `src/services/characterSuggest.ts`（新） | 单字段「重新建议」服务（锁 + 短超时） |
| `src/services/storage.ts`（改） | `updateCharacter` / `addCharacter`（projectLock） |
| `src/components/CharacterPanel.tsx`（新） | 角色卡 UI（字段/建议/重新建议/锁定/seed/新增） |
| `src/sidepanel/App.tsx`（改） | 渲染 CharacterPanel + 状态联动 |

---

## 5. 测试计划（TDD）

- **characterProfile.test.ts（新）**：字段键固定 10 个且顺序稳定；中/英标签齐全；`composeAppearance` 只取非空、单行、含字段值；`emptyProfile` 全空。
- **characters.test.ts（增）**：有 profile → 注入锚点含档案字段值（逐字注入）；锁定角色注入用其权威值；`injectCharactersIntoShot` 幂等且可独立用于单 shot（#30 接口）；无 profile 回退 appearance（旧用例不回归）；editedByUser 不动。
- **parse.test.ts（增）**：解析 profile/suggestions(截 2–4)/seedPhrase；缺 profile 仅 appearance 的老格式兼容；suggestions 超限/脏值清洗。
- **characterSuggest.test.ts（新）**：成功→2–4 候选；仅该字段（prompt 含 field/character，不含其它角色改写）；前置校验失败不发请求；并发占用 → GENERATION_IN_PROGRESS；解析失败 → BAD_RESPONSE_FORMAT。
- **storage.test.ts（增）**：`updateCharacter` 浅合并仅改目标角色、其它不变；`addCharacter` 追加；无项目→ok 无副作用；走锁串行。
- **prompts/characters**：指令含 10 字段、建议(2–4)、seed、不臆测敏感属性红线仍在。

全套 `npm run lint && npm run test && npm run build` 必须绿。

## 6. 与 #30 协同（预留接口）
#30「单镜头重生成」在重生成某 shot 后，调用 `injectCharactersIntoShot(shot, lockedById, lang)` 即可让**锁定角色的权威档案**逐字注入该镜头、不被模型改写——锁定值来自 Project.characters（locked=true）。本任务导出该纯函数并以测试固化其幂等/独立性契约。

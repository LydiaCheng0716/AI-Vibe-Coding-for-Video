# TASK-005 设计文档 — 角色识别与人物一致性注入

> **Issue：** #7 · **Epic：** EPIC-004 · **依赖：** TASK-003（需真实 LLM + 结构化模型；Spike #3 结论适用）
> **分支：** `feature/task-005-character-consistency` → `develop`
> **日期：** 2026-06-24

---

## 1. 目标与范围

从故事识别角色 → 生成统一外观描述 → **注入引用该角色的镜头提示词**，减少跨镜头人物漂移。

TASK-003 的 `core/parse.ts` 已能解析 `characters`（id/name/appearance）与 `shots[].characterRefs`（归一到内部 id）。本任务补两件事：

1. **提示词侧**：强化 system 提示，明确要求模型识别角色、给统一外观描述、并在每个相关镜头的 `prompt` 里体现该外观；并约束**不臆测敏感身份/人口属性**。
2. **代码侧（确定性兜底）**：`injectCharacterConsistency(project)` —— 对每个 `editedByUser===false` 且有 `characterRefs` 的镜头，若其 `prompt` 尚未包含某引用角色的外观描述，则注入统一外观，保证跨镜头一致；`editedByUser===true` 的镜头**原样保留，不被覆盖**。

**本任务不做：**
- 单镜头 AI 重新生成（PRD 范围外）。
- 角色的 UI 编辑 → 后续 UI 任务。

---

## 2. 关键决策

### 2.1 角色与镜头分离 + 引用
沿用 TASK-003 数据模型：`Project.characters[]` 独立存储，镜头通过 `Shot.characterRefs`（内部 `Character.id`）引用。一致性靠「同一 appearance 文本注入到所有引用镜头」达成。

### 2.2 注入规则（`core/characters.ts`，纯函数、幂等）
对 `project.shots` 逐个处理：
- `editedByUser === true` → **跳过**（保护用户手动编辑，Issue #7 / 数据模型硬要求）。
- 否则取该 shot 的 `characterRefs` 对应角色：对每个角色，若 `shot.prompt` **已包含**其 `appearance` 文本 → 不重复注入（幂等，兼容 LLM 已自行嵌入）；否则收集待注入。
- 若有待注入角色，在 `prompt` 末尾追加一段「角色一致性参考」块：每行 `- {name||'角色N'}：{appearance}`。
- 无 `characterRefs` 或无角色 → 原样返回。
- 返回**新对象**（不可变更新），不改输入。

> 选择「追加可读参考块」而非重写 prompt：确定性、可解释、不破坏模板已生成的正向/负面提示词；幂等避免重复注入。

### 2.3 提示词强化（`prompts/characters.ts`）
向 system 提示注入一段角色指令：
- 故事出现明确人物 → 在 `characters` 输出每个角色的统一外观描述（发型/服饰/体貌等**故事可见**特征）；同一角色跨镜头复用同一描述。
- 用 `characterRefs` 标注每个镜头涉及的角色，并在该镜头 `prompt` 中体现其外观。
- **无明确人物 → `characters` 为空数组，不编造**；**不臆测种族、年龄段精确值等敏感/不必要的人口属性**，只描述故事明示或视觉必要的特征。

### 2.4 接入点
`generation.generateStoryboardAttempt`：`parseStoryboard` → `buildProject` → **`injectCharacterConsistency`** → 返回。因新生成的镜头 `editedByUser` 均为 false，注入对所有带引用镜头生效；guard 主要保护未来对已编辑项目的再处理。

---

## 3. 文件

| 文件 | 职责 |
|------|------|
| `src/core/characters.ts`（新） | `injectCharacterConsistency(project)` 纯函数注入 + 幂等 |
| `src/prompts/characters.ts`（新） | `characterInstruction()` system 提示片段（识别/一致/不臆测） |
| `src/prompts/storyboard.ts`（改） | system 注入 `characterInstruction()` |
| `src/services/generation.ts`（改） | attempt 成功路径接入 `injectCharacterConsistency` |

---

## 4. 测试计划（TDD）

- **characters.test.ts（注入）**：
  - 引用角色的镜头 → prompt 含该角色 appearance；
  - 同一角色被多镜头引用 → 各镜头注入相同 appearance（一致）；
  - 已含 appearance → 不重复注入（幂等：跑两次结果相同）；
  - `editedByUser=true` 的镜头 → 不被注入/不被改；
  - 无 characterRefs / 空 characters → 原样；
  - 不可变：不修改入参。
- **prompts/characters（提示词）**：system 含「不编造」「不臆测敏感属性」「统一外观」字样。
- **generation（增）**：成功生成的 Project 中，引用角色的镜头 prompt 含对应 appearance。

全套 `npm run lint && test && build` 必须绿。

# TASK-004 设计文档 — 视频提示词模板适配

> **Issue：** #6 · **Epic：** EPIC-003 / EPIC-004 · **依赖：** TASK-003（结构化分镜模型）
> **分支：** `feature/task-004-video-prompt-templates` → `develop`
> **日期：** 2026-06-24

---

## 1. 目标与范围

按用户所选「目标视频模型」与输出语言，让分镜生成产出对应风格的镜头提示词。MVP 至少两类模板：**通用英文电影感**、**即梦/可灵中文**。模板作为可维护模块，为未来模板库预留扩展（注册表 + 回退）。

**本任务做：**
- `prompts/templates/`：`cinematic-en`、`jimeng-keling-zh` 两个模板 + `index` 注册表与回退。
- 每个模板产出注入分镜 system 提示的「镜头提示词结构与语言要求」。
- 模板按 `params.templateId` 解析；无法识别 → 回退 `cinematic-en` 并记录可排查状态。
- 改 `prompts/storyboard.ts` 接入模板（替换 TASK-003 的通用骨架）。
- `defaultTemplateIdFor(videoModel)`：即梦/可灵→中文模板，其余→英文模板（供 SettingsPanel 等按视频模型套模板）。

**本任务不做：**
- 模板市场 / 投稿 / 在线同步（PRD 范围外）。
- 人物一致性注入 → TASK-005（模板只定义结构，characterRefs 注入由 005 负责）。

---

## 2. 关键决策

### 2.1 模板契约
```ts
interface PromptTemplate {
  id: TemplateId;
  /** 注入 system 提示：要求每个 shot.prompt 的字段结构与语言。 */
  shotPromptInstruction(params: GenerationParams): string;
}
```
- **cinematic-en**：每个 `shot.prompt` 用**英文**，含 subject（画面主体）、action（动作）、shot size（景别）、camera movement（运镜）、style（风格）、lighting（光线）、negative prompt（负面提示词）。
- **jimeng-keling-zh**：每个 `shot.prompt` 用**中文**，含画面描述、镜头语言、风格、负面提示词。
- 字段结构与 TASK-003 的 `Shot` 兼容：模板只约束 `shot.prompt` 文本内容，不改 Shot 形状。`summary/shotSize/cameraMovement/durationSuggestion` 仍按 `outputLanguage` 输出（概要类可读字段）。

### 2.2 解析与回退
```ts
resolveTemplate(params): { template: PromptTemplate; fellBack: boolean }
```
- `params.templateId` 命中注册表 → 用之，`fellBack=false`。
- 未命中（异常/旧数据）→ 回退 `cinematic-en`，`fellBack=true`，并 `console.warn` 一条含原 templateId 的可排查日志（不抛错、不静默）。

### 2.3 模板按视频模型
`defaultTemplateIdFor(videoModel)`：`jimeng|keling → 'jimeng-keling-zh'`，`sora|runway|generic → 'cinematic-en'`。这是「按目标视频模型套用对应模板」的默认映射（SettingsPanel 选视频模型时可据此联动 templateId）；生成链路最终以 `params.templateId` 为准（用户可覆盖）。

---

## 3. 文件

| 文件 | 职责 |
|------|------|
| `src/prompts/templates/cinematic-en.ts`（新） | 英文电影感模板 |
| `src/prompts/templates/jimeng-keling-zh.ts`（新） | 即梦/可灵中文模板 |
| `src/prompts/templates/index.ts`（新） | 注册表 + `resolveTemplate` + `defaultTemplateIdFor` |
| `src/prompts/storyboard.ts`（改） | 接入模板：system 提示注入 `shotPromptInstruction` |

模块边界：模板是纯数据/纯函数，无副作用（除回退 warn）；不感知 provider/storage。

---

## 4. 测试计划（TDD）

- **templates.test.ts**：
  - cinematic-en 指令含 subject/action/shot size/camera movement/style/lighting/negative 且声明英文；
  - jimeng-keling-zh 指令含 画面描述/镜头语言/风格/负面 且声明中文；
  - `resolveTemplate` 命中已知 id → fellBack=false；未知 id → 回退 cinematic-en + fellBack=true（断言 warn 被调用）；
  - `defaultTemplateIdFor` 映射正确（jimeng/keling→zh，其余→en）。
- **storyboard prompt（增）**：system 提示按 templateId 含对应模板指令；切换 templateId 指令随之变化。

全套 `npm run lint && test && build` 必须绿。

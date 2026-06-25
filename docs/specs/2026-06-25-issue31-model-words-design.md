# Issue #31 设计文档 — 负面词/风格词按目标视频模型定制

> **Issue：** #31 · **优先级：** P2 · **依赖：** `prompts/templates/*`、`prompts/storyboard.ts`
> **分支：** `feature/issue-31-model-words` → `develop` · 2026-06-25 · merge-when-green

## 1. 目标
按目标视频模型（即梦/可灵/Sora/Runway/generic）定制负面词 + 正向风格词，集中可维护，缺省回退通用词表。

## 2. 关键决策
### 2.1 集中词表（新 `prompts/templates/modelWords.ts`）
`modelWords(videoModel): { negative: string[]; style: string[] }`，`Record<VideoModel, ModelWords>` 全覆盖，未知 → 回退 `generic`。
语言与对应模板一致：即梦/可灵=中文词；sora/runway/generic=英文词（真实流程下 videoModel↔模板语言成对，词与提示词语言匹配）。

### 2.2 模板取用（`cinematic-en` / `jimeng-keling-zh`）
两模板 `shotPromptInstruction` 不再硬编码负面词，改为 `modelWords(params.videoModel)`：
- 负面提示词行用该模型 `negative` 列表；
- 风格行追加该模型 `style` 建议词（generic 为空则不追加）。
保留「negative / 负面」标签与整体结构（不破坏既有断言与解析）。

## 3. 文件
| 文件 | 职责 |
|------|------|
| `src/prompts/templates/modelWords.ts`（新） | 按模型的负面/风格词表 + `modelWords()` 回退 |
| `src/prompts/templates/cinematic-en.ts`（改） | 负面/风格词取自 modelWords |
| `src/prompts/templates/jimeng-keling-zh.ts`（改） | 同上（中文） |

## 4. 测试计划（TDD）
- **modelWords.test.ts**：jimeng/keling 中文词、sora/runway 英文词、generic 通用、未知回退 generic。
- **templates（增）**：cinematic-en + videoModel=sora 含 sora 专属负面/风格词；jimeng-keling + videoModel=jimeng 含中文专属词；generic 回退；标签「negative/负面」仍在（不回归）。

全套 `npm run lint && npm run test && npm run build` 必须绿。

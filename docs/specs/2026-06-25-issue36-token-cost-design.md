# Issue #36 设计文档 — Token 与成本提示

> **Issue：** #36 · **优先级：** P3 · **依赖：** `services/generation.ts`、`core/validate.ts`、侧边栏 UI
> **分支：** `feature/issue-36-token-cost` → `develop` · 2026-06-25 · merge-when-green

## 1. 目标
显示本次大致 token 用量（输入/输出估算）；超长输入提示「将截断/分批」；估算逻辑集中可维护。

## 2. 关键决策（新 `core/tokens.ts`，纯函数集中维护）
- `estimateTokens(text)`：CJK 约 1 token/字，其余约 4 字符/token（粗略量级，明确标注「仅供参考」，非精确计费）。
- `estimateProjectTokens(story, project)`：input ≈ `estimateTokens(story) + PROMPT_OVERHEAD_TOKENS`（system/模板/JSON 外壳固定开销）；output ≈ 对 shots（summary/景别/运镜/时长/prompt/promptEn）+ characters.appearance + bgm 文本估算。
- `longStoryWarning(story)`：`estimateTokens(story) > LONG_STORY_TOKENS` → 提示「故事较长，分镜输出可能受模型长度上限（max_tokens）截断，建议精简或分批」。常量集中在本文件。

> 选择启发式估算而非真实 usage：provider 适配器当前不回传 usage；issue 要求「大致」。集中于 `core/tokens.ts` 便于将来接真实 usage 替换实现。

## 3. UI（`StoryInput`）
- 实时：故事框下显示当前估算输入 token + `longStoryWarning`（超长时 amber 提示）。
- 生成后：成功提示附「约 输入 ~N / 输出 ~M tokens（仅供参考）」。

## 4. 测试计划（TDD，`tokens.test.ts`）
- `estimateTokens`：纯中文 ≈ 字数；纯英文 ≈ 字符/4；空 → 0。
- `estimateProjectTokens`：input 含 overhead；output 随 shots/promptEn/bgm 文本增长。
- `longStoryWarning`：短 → null；超阈值 → 含「截断/分批」。

全套 `npm run lint && npm run test && npm run build` 必须绿。

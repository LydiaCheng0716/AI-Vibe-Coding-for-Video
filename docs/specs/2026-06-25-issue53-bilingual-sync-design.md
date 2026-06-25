# Issue #53 设计文档 — 双语提示词：编辑一边自动翻译同步另一边

> **Issue：** #53 · **优先级：** P2 · **依赖：** #41（双语）；ShotCard、generation（轻量翻译入口）、llmLock
> **分支：** `feature/issue-53-bilingual-sync` → `develop` · 2026-06-25 · merge-when-green

## 1. 目标
双语镜头编辑一边失焦 → 自动翻译同步另一边；一次 LLM 翻译调用 + 全局锁 + 加载态；失败保留输入、可重试、不覆盖；提供「自动同步」开关；仅中英双语生效。

## 2. 关键决策
### 2.1 轻量翻译服务（`prompts/translate.ts` + `services/generation.ts`）
- `buildTranslatePrompt(text, targetLang)`：忠实翻译到目标语言，保留提示词术语，只输出译文（无解释/引号/原文）。
- `translateText({ text, targetLang, apiKey })`：preflight + 全局锁（与生成/重写互斥）+ 短超时 + 退避重试；返回译文（纯文本 trim）。空文本/空结果 → 错误（不覆盖）。

### 2.2 UI（`components/ShotCard.tsx`）— 仅双语编辑生效
- 双语编辑（draft 中文 + draftEn 英文两个 textarea）下加「编辑后自动翻译同步」开关（默认**关**，避免误触消耗额度）。
- 开关开时：中文框失焦 → 翻译 draft→draftEn 写入英文框；英文框失焦 → 翻译 draftEn→draft。
- 进行中显示「翻译中…」加载态；翻译期间禁用保存（防竞态）。
- **失败保留用户输入**：翻译失败仅提示「翻译失败，可重试」，不清空/不覆盖任一框。
- 复用 ShotCard 既有 persistApiKey/tempKey（不落盘一次性 Key）。

## 3. 测试计划（TDD，`translate.test.ts`）
- 成功 → 返回译文；空文本 → 错误不发；空结果 → BAD_RESPONSE_FORMAT；前置失败不发；锁占用 → GENERATION_IN_PROGRESS；prompt 含目标语言。

全套 `npm run lint && npm run test && npm run build` 必须绿。

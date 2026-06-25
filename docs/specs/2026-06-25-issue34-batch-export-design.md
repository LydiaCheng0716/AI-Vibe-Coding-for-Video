# Issue #34 设计文档 — 整单批量操作（复制全部 / 平台格式导出 / CSV）

> **Issue：** #34 · **优先级：** P3 · **依赖：** `core/export.ts`、`ExportPanel.tsx`、`services/clipboard.ts`
> **分支：** `feature/issue-34-batch-export` → `develop` · 2026-06-25 · merge-when-green

## 1. 目标
整单批量产出：复制全部提示词、按平台排版导出、CSV 分镜表；与现有 Markdown/JSON/纯文本并存。

## 2. 关键决策（`core/export.ts` 纯函数扩展）
- `ExportFormat` 增 `'csv'`、`'platform'`。
- **CSV**：表头 `镜头,景别,运镜,时长,提示词[,英文提示词]`（双语项目才加英文列）；标准转义（含 `",` 换行的单元格用双引号包裹、内部 `"`→`""`）；CRLF 行尾。
- **platform（平台排版）**：粘贴即用的纯提示词块——每镜头 `【镜头N】概要` + 提示词（双语按 `promptLang` 出中/英/两版，复用 #41 `shotPromptParts`），末尾附 BGM。适配可灵/即梦直接粘贴。
- 复用 #41 `promptLang`：platform 受语言选择影响；CSV 双语列恒含两版。
- 隐私不变：Project 不含凭据（ARCH-LOW-002）。

## 3. UI（`ExportPanel.tsx`）
- 格式下拉增「CSV 分镜表」「平台排版」。
- 新增「复制全部提示词」按钮：复制 platform 排版（一键喂视频工具）。

## 4. 测试计划（TDD，`export.test.ts` 增）
- CSV：表头 + 每镜头一行；含逗号/引号/换行的提示词正确转义；双语项目含英文列、单语不含。
- platform：含各镜头提示词 + 镜头号；双语按 promptLang 出中/英/两版。
- 既有 markdown/json/plaintext 不回归；空项目 → NOTHING_TO_EXPORT。

全套 `npm run lint && npm run test && npm run build` 必须绿。

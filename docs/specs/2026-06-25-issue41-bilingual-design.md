# Issue #41 设计文档 — 提示词中英双语输出

> **Issue：** #41 · **优先级：** P2 · **依赖：** `prompts/storyboard.ts`、`prompts/templates/*`、`core/models.ts`、`ExportPanel`/`ShotCard`
> **分支：** `feature/issue-41-bilingual` → `develop` · 2026-06-25 · merge-when-green

---

## 1. 目标与范围
镜头提示词支持中英双语：输出语言增加「中英双语」，选中后每镜头同时给中文与英文两版；复制/导出可选语言；不破坏单语行为。

## 2. 关键决策
### 2.1 数据模型（`core/models.ts`）
- `OutputLanguage` 增 `'zh-en'`（中英双语）。
- `Shot` 增 `promptEn?: string`：双语时 `prompt`=中文、`promptEn`=英文；单语时 `promptEn` 不存在（不破坏现状）。
- 所有按 `OutputLanguage` 索引的 Record（角色字段标签、景别/运镜选项、注入表头）补 `'zh-en'` 项（= 中文口径）；TS 穷尽检查会强制补齐。

### 2.2 生成（`prompts/storyboard.ts` + `core/parse.ts`）
- 双语时 system 要求每镜头 `prompt`（简体中文，即梦/可灵风格）+ `promptEn`（English，电影感风格），两版同镜头一致；复用两套模板的 `shotPromptInstruction`（各自硬编码语言）。JSON_SHELL 增 `promptEn`。
- `parseStoryboard` 解析可选 `promptEn`（非空才挂）；缺失不报错（退化为单中文）。
- 可读字段（summary/景别…）双语下用简体中文。

### 2.3 单镜头重写（`prompts/rewrite.ts` + `generation.ts`，复用 #30 管线）
- 双语时重写 prompt 同样产出 `prompt`+`promptEn`，`parseShotRewrite` 解析 promptEn，`rewriteShotAttempt` 写回（模型省略则保留原 promptEn）。保持改写后中英一致。

### 2.4 复制（`ShotCard`）
- 双语镜头并排展示中文 / English 两块；提供「复制中文」「复制英文」（单语保持单一「复制」）。

### 2.5 导出（`core/export.ts` + `ExportPanel`）
- `exportProject(project, format, promptLang)`，`promptLang: 'zh' | 'en' | 'both'`（默认 both）。
  - Markdown/纯文本按 promptLang 取 `prompt` / `promptEn` / 两版（带语言小标）。
  - JSON 始终含完整 shot（含 promptEn），不受 promptLang 影响。
  - 单语项目（无 promptEn）任何选项都回退 `prompt`。
- ExportPanel：项目为双语时显示语言选择（中文/英文/两者）。

### 2.6 设置（`SettingsPanel`）
输出语言下拉增「中英双语」。

## 3. 文件
models / characterProfile / shotParams / characters(HEADER) / prompts(storyboard,rewrite) / parse / generation / export / ExportPanel / ShotCard / SettingsPanel。

## 4. 测试计划（TDD）
- **parse**：双语载荷解析 prompt+promptEn；缺 promptEn 退化；单语不受影响。
- **storyboard prompt**：双语 system 含 promptEn 要求与两语指令。
- **export**：promptLang=zh/en/both 渲染对应文本；单语回退 prompt；JSON 含 promptEn。
- **rewrite**：双语 parseShotRewrite 取 promptEn；rewriteShotAttempt 写回。
- 单语全链路回归不变（现有用例）。

全套 `npm run lint && npm run test && npm run build` 必须绿。

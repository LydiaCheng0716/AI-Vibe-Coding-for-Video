# Issue #105 — 复制提示词时带上镜头时长

## 背景 / 目标
复制提示词此前只复制正文，不含镜头时长。本 issue 让**单语复制**与**「复制全文」**都带上该镜头时长（`durationSuggestion`），标注跟随语言（「时长：5s」/「Duration: 5s」），且与导出口径一致（避免一处有一处无）。

## 现状盘点
- 导出已带时长：Markdown（`- 时长：5s`）、纯文本（`… 时长：5s`）、CSV（「时长」列）、JSON（完整 shot 含 `durationSuggestion`）——issue 列出的 4 种格式本就一致。
- 「平台排版」导出是「粘贴即用的纯提示词块」，刻意只含提示词正文，不在 issue 的格式清单内，保持不变。
- 缺口在 **ShotCard 的复制**：`buildShotCopyText`（复制全文）与各单语复制框只复制正文，无时长。

## 方案
### 共用口径（单一事实源）
- `core/export.ts` 新增 `shotDurationLine(durationSuggestion, lang)`：`en → "Duration: 5s"`，否则 `"时长：5s"`。
- 导出侧 Markdown / 纯文本的时长行改用该 helper（输出不变），与复制共用同一函数，杜绝口径漂移。

### 复制（ShotCard）
- 单语复制框：在正文前加时长行，跟随**该框语言**：
  - 双语项目：中文框 → `时长：`，英文框 → `Duration:`。
  - 单语项目：跟随 `outputLanguage`（en → `Duration:`，否则 `时长：`）。
- 「复制全文」（`buildShotCopyText`）：每个语言段（[ZH]/[EN]）各自带对应语言的时长行（双语对应）。首帧段不重复时长（首帧是独立图像提示词，时长已在主提示词段标注）。
- 时长取已保存的 `shot.durationSuggestion`（编辑态下时长下拉禁用，值稳定）。

## 验收对照
- [x] 单语复制 / 复制全文带该镜头时长（durationSuggestion）
- [x] 格式清晰、开头标注、跟随语言（时长：5s / Duration: 5s）
- [x] 与导出（Markdown/JSON/纯文本/CSV）口径一致（共用 `shotDurationLine`；CSV 时长列、JSON 原字段不变）
- [x] 双语复制时长标注语言对应

## 测试
- export：`shotDurationLine` zh/en/默认；Markdown 仍含「时长：3s」（重构后口径不变）。
- ShotCard：单语复制带时长（中/英）、复制全文双语各带对应时长行、编辑草稿复制带时长、单语全文带时长。

## 门禁
CTO 自评 → Kimi → Codex（外门带硬超时）。基线 develop，merge-when-green（CI：coverage + bundle 守卫 + e2e smoke）。

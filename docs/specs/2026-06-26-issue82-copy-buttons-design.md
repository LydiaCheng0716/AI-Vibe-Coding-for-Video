# Issue #82 复制按钮移到各框右上角 + 单镜复制全文设计

## 现状

- `src/components/ShotCard.tsx` 在镜头头部提供文字链接式复制：
  - 双语镜头显示 `shotCard.copyZh` / `shotCard.copyEn`。
  - 单语镜头显示 `common.copy`。
- 显示态提示词内容由 `<pre>` 承载：
  - 双语：中文 `shot.prompt`，英文 `shot.promptEn`。
  - 单语：`shot.prompt`。
  - 首帧提示词在首帧区域中合并显示 `shot.firstFramePrompt` 和可选 `shot.firstFramePromptEn`。
- 编辑态提示词内容由 `draft` / `draftEn` 两个 textarea 承载。
- 复制服务已有 `copyToClipboard(text): Promise<Result<void>>`，失败返回用户可见错误，必须复用。

## UI 与组件契约

新增小组件 `CopyIconButton`，放在 `ShotCard.tsx` 内部以保持改动局部化。

Props：

- `text: string`：点击时复制的文本。
- `label: string`：按钮 `aria-label`。
- `title: string`：按钮 hover tooltip，默认传入 i18n 的「复制」。
- `copiedTitle: string`：成功后短暂显示的文本，传入 i18n 的「已复制」。
- `onError(message: string): void`：复制失败时把错误交给卡片 notice。
- `className?: string`：用于右上角绝对定位或头部常规按钮布局。
- `children?: ReactNode`：可选 idle 内容；提示词框默认显示复制 SVG，头部复制全文传入文字。
- `onCopied?: () => void`：可选成功回调，当前仅预留。

行为：

- 点击调用 `copyToClipboard(text)`。
- 成功时只更新按钮自身 `copied` 状态，约 1800ms 后复原。
- 失败时清掉该按钮 copied 状态，调用 `onError` 显示现有错误文案。
- 按钮使用内联 SVG 图标，成功态显示 `已复制` / `Copied` 文本，确保每个按钮反馈互不串台。

## 提示词框布局

新增局部渲染 helper `PromptCopyBox`：

- 外层相对定位。
- 复制按钮绝对定位到右上角。
- 内容容器右上留出内边距，避免按钮遮挡文字。
- 显示态渲染 `<pre>`；编辑态渲染 `<textarea>`。

覆盖位置：

- 显示态中文提示词框。
- 显示态英文提示词框。
- 单语显示态提示词框。
- 编辑态中文 textarea。
- 编辑态英文 textarea。
- 首帧提示词框。

## 复制全文拼装规则

每个镜头头部新增 `shotCard.copyFull` 按钮，复制当前镜头完整提示词。

拼装规则：

- 首行：`镜头 {index}` / `Shot {index}`。
- 中文提示词存在时加入：
  - `[ZH]`
  - 中文提示词正文。
- 英文提示词存在时加入：
  - `[EN]`
  - 英文提示词正文。
- 首帧中文存在时加入：
  - `[First Frame ZH]`
  - 中文首帧提示词。
- 首帧英文存在时加入：
  - `[First Frame EN]`
  - 英文首帧提示词。
- 分段之间使用空行。
- 单语镜头只包含当前语言提示词；无首帧时不生成首帧分段。
- 编辑态复制全文使用当前 `draft` / `draftEn`，首帧仍使用已保存的 `shot.firstFramePrompt` / `shot.firstFramePromptEn`。

## i18n 新增 key

新增并同步 `zh.ts` 与 `en.ts`：

- `shotCard.copyTooltip`
- `shotCard.copiedInline`
- `shotCard.copyFull`
- `shotCard.copyFullAria`
- `shotCard.copyFullCopied`

复用现有 key：

- `shotCard.copyZhAria`
- `shotCard.copyEnAria`
- `shotCard.copyAria`
- `shotCard.copyZhFirstFrameAria`
- `shotCard.copyEnFirstFrameAria`
- `shotCard.copiedPrompt`

## 测试清单

- 显示态双语镜头：中文、英文、首帧复制按钮分别复制对应内容。
- 复制按钮成功反馈为局部状态：点击一个按钮只让该按钮显示「已复制」。
- 单语镜头：无英文复制按钮，复制全文只包含单语正文，不包含首帧分段。
- 编辑态：中文/英文复制按钮复制当前 draft/draftEn，而不是旧的 `shot.prompt` / `shot.promptEn`。
- 剪贴板失败：展示服务返回的错误消息，不显示成功反馈。
- 复制全文：双语镜头包含中文、英文、首帧中文、首帧英文分段。
- 头部旧文字复制链接被移除，只保留复制全文、编辑、删除等操作。

## 风险与回滚

- 风险：按钮浮层遮挡长文本开头。通过内容框右上额外 padding 缓解。
- 风险：多个按钮状态共用导致反馈串台。`CopyIconButton` 自持状态并用自身 timer 清理。
- 风险：复制全文格式后续需要调整。当前规则集中在 `buildShotCopyText`，可单点修改。
- 回滚：恢复头部文字复制按钮，移除 `CopyIconButton` / `PromptCopyBox` 调用和新增 i18n key；不影响复制服务和业务数据模型。

# Issue #70 批量操作与 UI 偏好持久化设计

## 问题

当前 StoryPop 的首帧提示词和相邻镜转场只能逐条生成。长分镜项目需要重复点击，且中途失败后难以判断哪些已完成。导出格式、导出提示词语言、双语自动翻译同步开关也只存在组件本地状态，切卡或重开侧栏后丢失。

## 方案

新增一个纯编排 helper `src/services/batch.ts`，只负责串行遍历、进度回调、逐项失败隔离与汇总，不包含任何 LLM prompt 或落库逻辑。UI 侧在 `ShotList` 拼装批量 items，并在 `perItem` 内完成：

- 跳过已有 `firstFramePrompt` 的镜头，或已有 `transitionToNext` 的相邻镜对。
- 复用现有 `generateFirstFrame` / `generateTransition` 单发服务；单发服务继续负责全局 LLM 锁与退避重试。
- 单项成功后立即调用 `updateShotFirstFrame` / `updateShotTransition` 落库。
- 批量进行中用本地 `working` 状态禁用列表入口，并把 `disabled` 下传到卡片与转场条，避免并发点击。
- 批量结束后展示成功、跳过、失败数量；失败项带镜头编号或镜头对和原因。再次点击会自动跳过已成功项，只重试缺失项。

## `runBatch` 契约

```ts
runBatch<TItem, TOk>(
  items: readonly TItem[],
  perItem: (item: TItem, index: number) => Promise<Result<TOk> | BatchSkipped> | Result<TOk> | BatchSkipped,
  options?: { onProgress?: (done: number, total: number, lastResult: BatchItemOutcome<TItem, TOk>) => void },
): Promise<BatchSummary<TItem, TOk>>
```

- 严格串行执行 `perItem`，下一项等待上一项结束。
- `perItem` 返回 `ok(data)` 计入 `ok`。
- `perItem` 返回 `skipped(reason)` 计入 `skipped`。
- `perItem` 返回 `err(...)` 或抛异常计入 `failed`，不影响后续 items。
- 每项结束后调用 `onProgress(done,total,lastResult)`。
- 返回 `{ ok, skipped, failed }`，每条都保留原始 item，便于 UI 渲染失败位置。

## 偏好字段与持久化时机

扩展 `Settings` optional 字段：

- `autoTranslateSync?: boolean`：ShotCard 双语自动翻译同步默认值，默认 `false`。
- `exportFormat?: ExportFormat`：ExportPanel 默认导出格式，默认 `markdown`。
- `exportPromptLang?: ExportPromptLang`：ExportPanel 默认导出提示词语言，默认 `both`。

持久化继续使用 `getSettings()` / `saveSettings()` 和 `chrome.storage.local` 现有 settings key。组件挂载时读取一次；用户切换后读取最新 settings、合并对应字段、再保存，避免覆盖 provider/params/persistApiKey。新字段只保存 UI 偏好，不新增任何凭据字段，也不改变 API Key 管理。

## 回滚与兼容

三个新字段都是 optional，`defaultSettings()` 提供默认值，`getSettings()` 对旧 settings 做浅合并补齐。回滚时删除 `src/services/batch.ts`、ShotList 批量入口和组件偏好读写即可；旧数据中的 optional 字段不会影响旧代码。

## 测试清单

- `runBatch`：串行顺序、跳过、失败不中断、异常捕获、进度回调、续跑由 `perItem` 跳过已完成项。
- settings：新偏好字段 round-trip，旧数据缺字段时补默认。
- ShotCard：`autoTranslateSync` 从 settings 恢复，切换后持久化。
- ExportPanel：`exportFormat` / `exportPromptLang` 从 settings 恢复，change 后持久化。
- ShotList：批量首帧跳过已存在项、成功后立即落库；批量转场遍历相邻对并跳过已存在项；失败汇总不阻断后续。
- 边界：0 镜头、1 镜头无相邻对、全部已存在全跳过、persistApiKey 关闭时批量结束清空一次性 Key、批量进行中重复点击被本地 busy/working 拦截。

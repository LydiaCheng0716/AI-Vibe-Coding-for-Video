# Issue #66 组件级交互测试设计

## 背景

现有测试主要覆盖 core/services 纯逻辑，缺少真实 React 组件交互路径。Issue #65 已把项目状态收敛到 `ProjectStoreProvider` / `useProjectStore`，因此组件测试必须通过 Provider 驱动 store 写入，并用 storage mock 验证落库结果。

## 测试范围

### ShotList

- 拖拽重排：渲染 3 个镜头，触发 `dragStart` / `drop`，断言 `currentProject.shots` 的数组顺序和 `index` 已按显示顺序重排。
- 列表级撤销：
  - move：拖拽后点撤销，恢复原顺序。
  - insert：点击插入空白镜头后点撤销，恢复原数组。
  - delete：连续删除到 0 个镜头，仍显示顶部插入条和撤销入口；点撤销恢复上一步。
- 即时生成路径不走真实网络：`rewriteShot` mock；空描述插入不触发 LLM。

### ShotCard

- 双语自动翻译失败：开启自动同步，编辑中文并 blur；`translateText` 返回失败时，英文框保持用户原值，仅显示错误提示。
- 双语翻译在途守卫：翻译 promise 未完成时用户编辑目标语言框；翻译完成后不得覆盖用户在途编辑内容。
- `rewriteShot` / `generateFirstFrame` / `translateText` 均 mock，避免真实出站。

### StylePanel / CharacterPanel

- StylePanel：编辑风格字段 blur 后经 store 落库；锁定按钮写入 `globalStyle.locked`。
- CharacterPanel：编辑角色档字段 blur 后经 store 落库；锁定按钮写入 `character.locked`。
- storage 失败路径：mock `chrome.storage.local.set` reject，断言 UI 显示保存失败且 store/storage 不前进。

## 渲染夹具

新增 `tests/unit/renderWithProjectStore.tsx`：

- 用真实 `<ProjectStoreProvider>` 包裹组件。
- 首次 mount 时调用 `replaceProject(initialProject)`，让 storage 与 store 初始化为同一项目。
- 子组件通过 render callback 获取 store 中最新 `project`，确保删除、插入、撤销后的 UI 也跟随 store 重新渲染。
- 提供 `makeProject` / `makeShot` / `makeCharacter` 工厂，保持测试数据小而可读。

## Mock 策略

- `src/services/generation` 在组件测试文件内 `vi.mock`：
  - `rewriteShot`
  - `generateTransition`
  - `generateFirstFrame`
  - `translateText`
- storage 使用 `tests/setup.ts` 已有 `chrome.storage.local` mock；失败路径通过 `vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(...)` 注入。
- 删除确认使用 `vi.spyOn(window, 'confirm').mockReturnValue(true)`。

## 防 flaky 约束

- 所有异步写入使用 `waitFor` 轮询 storage 结果，不依赖固定 timeout。
- 翻译在途测试使用手动 deferred promise 精确控制完成时机。
- 不使用真实网络、真实剪贴板或真实浏览器扩展 API。

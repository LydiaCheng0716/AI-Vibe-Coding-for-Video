# Issue #97 E2E 完整主链路设计

## 背景

Issue #93 已建立 Playwright 渲染冒烟：通过 `vite preview` 运行真实构建产物，并在页面脚本执行前注入最小 `chrome.*` shim。Issue #97 在该 harness 之上补完整业务主链路：故事输入 -> SSE 生成分镜 -> 编辑镜头提示词 -> 导出复制。

本任务只验证浏览器内的主链路编排，不接入真实 LLM、不测试真实 Chrome extension context、不改变业务逻辑。

## 范围

覆盖：

- 复用并抽出 #93 的 `chrome.storage.local` / runtime / permissions / sidePanel shim。
- 支持注入初始 `settings`，使默认 provider、model、baseUrl、一次性 Key 模式可用。
- stub `navigator.clipboard.writeText`，将复制内容记录到 `window.__copiedText`。
- 拦截 `**/chat/completions`，按 OpenAI compatible Chat Completions SSE 契约返回稳定 storyboard JSON。
- Happy path：生成 3 个镜头、编辑第 1 个镜头 prompt、复制导出并断言包含编辑后文本。
- Failure path：生成请求返回 401，断言页面出现可读错误提示且无未捕获异常。
- 给关键控件增加最小 `data-testid`，仅用于稳定 E2E 定位。

不覆盖：

- 真实外部网络、真实 API Key、真实 IndexedDB keyVault。
- 真实下载文件内容校验。
- 反馈优化、重写、首帧、转场、批量生成等会触发额外 LLM 出站的辅助链路。
- Playwright flake 压测；由编排者在本机真跑多轮完成。

## Settings 预置

E2E 在 `addInitScript` 的 chrome storage shim 初始 store 中写入 `settings`：

- `schemaVersion` 使用当前 `SCHEMA_VERSION`。
- `provider.kind = 'openai-compatible'`。
- `provider.baseUrl = 'https://e2e.local/v1'`。
- `provider.model = 'e2e-model'`。
- `persistApiKey = false`，让一次性 Key 输入框出现，并绕过 keyVault/crypto/IndexedDB。
- `params.outputLanguage = 'zh'`，保持单语中文。
- `autoTranslateSync = false`，避免编辑保存时触发翻译 LLM。

其余字段从 `defaultSettings()` 继承，避免未来默认参数新增字段时 fixture 漂移。

## SSE Mock

Playwright route 使用 `page.route('**/chat/completions')`：

- `OPTIONS` 返回 204，并带：
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Headers: Authorization, Content-Type`
  - `Access-Control-Allow-Methods: POST, OPTIONS`
- `POST` 解析 JSON 请求体。
- 主路径返回 `Content-Type: text/event-stream`：
  - 第一帧 `data: {"choices":[{"delta":{"content":"<storyboard json>"}}]}`
  - usage 帧 `data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":34}}`
  - 结束帧 `data: [DONE]`
- 兼容 `stream:false` 时返回普通 JSON，但完整链路断言主路径请求 `stream:true`。

storyboard fixture 是合法 JSON 对象 `{ "shots": [...] }`，包含 3 个中文镜头。每个 shot 都提供非空 `summary`、`shotSize`、`cameraMovement`、`durationSuggestion`、`prompt`，不提供 `promptEn`，避免进入双语编辑和自动翻译路径。

失败链路使用同一 route handler 的选项，让首次 POST 返回 401 JSON。provider 会映射为 `AUTH_FAILED`，UI notice 显示“API Key 无效，请到设置里检查你的 BYOK 配置。”。

## Clipboard Stub

`navigator.clipboard.writeText` 在 `addInitScript` 中被替换为异步函数：

- 接收复制文本。
- 写入 `window.__copiedText`。
- 返回 resolved Promise。

导出面板没有屏上预览，因此测试点击复制后从 `window.__copiedText` 读取导出内容，断言包含编辑后的 prompt 文本。

## Data-testid 清单

仅增加属性，不改文案、ARIA、样式、状态或业务逻辑：

- StoryInput 故事 textarea：`story-input`
- StoryInput 生成按钮：`generate-button`
- OneTimeKeyInput input：`onetime-key-input`
- StoryInput/ExportPanel notice：`notice`
- ShotList 容器：`shot-list`
- ShotCard 根节点：`shot-card`
- ShotCard 编辑按钮：`shot-edit`
- ShotCard 编辑态 prompt textarea：`shot-edit-input`
- ShotCard 保存按钮：`shot-save`
- ExportPanel 复制按钮：`export-copy`

测试对镜头卡内控件使用 `shotCard.locator(...)` 作用域定位，避免列表内重复按钮互相干扰。

## 与 #93 冒烟的关系

`e2e/fixtures/app.ts` 承接 #93 的 chrome shim。`e2e/smoke.spec.ts` 改为复用公共 `installAppFixtures`，保持原有“挂载、输入、打开设置、无 pageerror”断言。

`e2e/full-flow.spec.ts` 是新增重链路 spec，自动被现有 `npm run e2e` 收集。CI 已有独立 e2e job，无需调整。

## 风险

- SSE mock 必须严格匹配 `readSseCompletion` 的 `data:` 行解析；若误用普通 JSON，会绕不开主路径。
- 一次性 Key 输入框依赖 `persistApiKey:false` 的 settings 预置；若 storage key 或 schema 迁移变化，需要同步 fixture。
- 编辑路径必须只使用 prompt textarea + 保存按钮，避开下拉参数、重写、反馈、首帧、转场等额外出站控件。
- Playwright 默认 5s expect timeout 在低性能 CI 上可能偏紧；当前测试等待 `shot-card` 数量出现，若本机压测发现 flake，再只调整 E2E 等待策略。

## 回滚

若完整链路 E2E 引入不可接受 flake，可回滚：

- 删除 `e2e/full-flow.spec.ts` 和新增 fixture 中的 full-flow 专用 mock。
- 将 `e2e/smoke.spec.ts` 临时恢复内联 shim，保留 #93 冒烟。
- 移除 `src` 中新增的 `data-testid` 属性。
- 删除本设计文档。

这些回滚不影响业务逻辑、单测、coverage 或 bundle 门。

# Issue #93 E2E Playwright 冒烟设计

## 背景

Issue #72 的完整 E2E 链路被延后后，CI 仍缺少一个能验证侧边栏页面真实构建产物是否可挂载的浏览器级信号。经 PO 确认，本次 Issue #93 只补“渲染 / 挂载冒烟”，不覆盖“输入故事 -> 调 LLM -> 生成分镜 -> 编辑 -> 导出”的完整业务链路。

本仓库是 Chrome MV3 侧边栏扩展。生产页面运行时依赖 `chrome.*` API，但 Playwright 访问 `vite preview` 服务时处于普通网页环境，因此需要在应用脚本执行前注入最小 chrome shim。

## 范围

本次覆盖：

- 使用已构建的 `dist/index.html` 作为侧边栏页冒烟目标。
- 注入等价于编排者已验证原型的 `chrome.storage.local`、`chrome.runtime`、`chrome.permissions`、`chrome.sidePanel` shim。
- 验证 React 应用能挂载，默认中文 UI 可见。
- 验证故事输入 textarea 可见、可输入、值能保持。
- 验证设置按钮能进入设置面板，并可返回主界面。
- 收集并断言无未捕获 `pageerror`。

明确不覆盖：

- 真实 Chrome extension context / MV3 service worker 行为。
- 真实 LLM 网络请求、流式生成、重试、批处理。
- 完整生成到导出的端到端业务路径。
- 权限弹窗和真实浏览器扩展安装流程。

## 方案

### Serving

Playwright 使用仓库根部的 `playwright.config.ts`：

- `testDir: 'e2e'`，避免与 Vitest 的 `tests/**/*.test.*` 范围混用。
- `webServer.command` 先执行 `npm run build`，再执行 `npx vite preview --host 127.0.0.1 --port 4173 --strictPort`。
- `use.baseURL` 指向 `http://127.0.0.1:4173`。
- 只配置 chromium project，降低 CI 时间和 flake 面。

选择 `vite preview` 而不是 dev server，是为了验证真实 build 输出的 `dist/`。`dist/index.html` 引用根路径 `/assets/*`，`vite preview` 会直接服务这些构建产物，符合已验证原型。

### Chrome Shim

测试在 `goto('/')` 前调用 `page.addInitScript(chromeShim)`，确保应用 bundle 执行前 `window.chrome` 已存在。shim 提供：

- `chrome.storage.local.get/set/remove`：内存对象模拟，覆盖当前挂载路径需要的设置、草稿、项目读取与写入。
- `chrome.runtime.id/getURL/onMessage`：满足扩展运行时访问。
- `chrome.permissions.contains/request`：默认返回 true，避免权限路径阻断设置面板渲染。
- `chrome.sidePanel.setPanelBehavior`：空实现，满足 MV3 API 访问。

该 shim 不模拟网络、不持久化磁盘、不提供真实权限语义；它只为渲染冒烟服务。

### 断言

`e2e/smoke.spec.ts` 使用可访问选择器优先：

- `getByRole('heading', { name: 'StoryPop' })` 可见。
- `getByLabel('你的故事')` 可见，`fill` 后 `toHaveValue`。
- 点击 `getByRole('button', { name: '设置' })` 后，设置面板标题和设置相关文案可见。
- 点击 `getByRole('button', { name: '返回' })` 后，故事输入重新可见。
- 最后断言收集到的 `pageerror` 数组为空。

测试不点击“生成分镜”，避免触发真实 LLM 依赖。

## CI

新增独立 `e2e` job，与现有 `build-test` job 并列：

1. checkout
2. setup-node 20 + npm cache
3. `npm ci`
4. `npx playwright install --with-deps chromium`
5. `npm run e2e`

现有 `build-test` job 的 typecheck、coverage、build、bundle guard 步骤不改动。这样 E2E 作为独立浏览器信号暴露，且不会改变原主门禁 job 的语义。

## 产物与隔离

- `.gitignore` 忽略 `test-results/`、`playwright-report/`、`blob-report/`、`playwright/.cache/`，避免提交 Playwright 运行产物。
- Vitest 配置只 include `tests/**/*.test.ts(x)`，因此 `e2e/*.spec.ts` 不会进入单测或 coverage。
- Coverage include 仍是 `src/**`，新增 E2E harness 不影响覆盖率门。
- Vite build 输出不包含 `e2e` 文件，不改变 bundle 体积。

## 回滚

如 CI 浏览器环境出现系统依赖或 Playwright 安装问题，可回滚以下内容：

- 删除 `playwright.config.ts` 和 `e2e/smoke.spec.ts`。
- 移除 `package.json` 的 `e2e` script。
- 移除 `.github/workflows/ci.yml` 的 `e2e` job。
- 保留 `.gitignore` 的 Playwright 产物忽略项无副作用，也可一并回滚。

## 后续扩展

后续若要恢复 #72 的完整链路，可在当前 harness 上扩展：

- 增加 network route 或 provider mock，拦截 LLM 请求并返回稳定分镜。
- 覆盖生成完成后的分镜列表、编辑、复制、下载导出。
- 增加真实 extension context 测试，加载 unpacked extension，覆盖 MV3 service worker 与 side panel 入口。
- 将 smoke 与完整链路拆成不同 Playwright project 或不同 CI job，保持快速冒烟与重链路信号分离。

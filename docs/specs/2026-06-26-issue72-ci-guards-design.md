# Issue #72 CI 质量护栏：覆盖率阈值 + bundle 体积守卫

## 现状

当前 CI 在 Node 20 上执行 `npm ci -> npm run lint -> npm run test -> npm run build`，能够覆盖类型检查、单测和构建，但缺少两个回归信号：

- 单测只验证是否通过，没有覆盖率下限；测试删除或关键路径漏测时 CI 不会报警。
- 构建只验证能否产出 `dist`，没有限制 Chrome MV3 扩展侧边栏 bundle 的 gzip 体积；依赖或代码膨胀不会被拦截。

仓库已预置 `@vitest/coverage-v8@2.1.9`，不需要也不能重新安装依赖。实测覆盖率基线为 Statements 73.49%、Branches 85.27%、Functions 81.13%、Lines 73.49%。当前主 JS chunk gzip 约 79,084 bytes，Issue 记录约 75 KB gzip 属健康范围。

## 覆盖率方案

在 `vitest.config.ts` 中新增 `test.coverage`：

- `provider: 'v8'`，复用已安装的官方 V8 coverage provider。
- `reporter: ['text-summary', 'json-summary', 'html']`，CI 输出简洁摘要，本地保留 JSON 与 HTML 便于排查。
- `include: ['src/**']`，只统计产品源码。
- `exclude` 排除测试、声明文件、配置文件、构建产物、入口 HTML、`src/vite-env.d.ts` 等非运行时行为噪声。

阈值设置为低于当前实测基线的安全地板：

- statements: 70
- branches: 82
- functions: 78
- lines: 70

这些值距离当前基线保留约 3-4 个百分点余量，避免因 V8 插桩细节或小规模重构造成误报，同时能阻止明显覆盖率下滑。新增 `npm run test:coverage` 执行 `vitest run --coverage`，阈值不达标时 Vitest 退出非 0，CI 失败。

## Bundle 体积方案

新增 `scripts/check-bundle-size.mjs`，使用 Node 内置 `node:fs`、`node:path`、`node:url`、`node:zlib`：

- 读取 `dist/assets/*.js`。
- 对每个 JS 文件用 `gzipSync` 计算 gzip 体积。
- 输出每个文件的 raw/gzip 明细和总 gzip。
- 若 `dist/assets` 不存在或没有 JS 文件，提示先执行 `npm run build` 并退出 1。
- 若总 gzip 超过上限，输出上限与超出量并退出 1。

上限设为 95 KB，即 97,280 bytes。依据是当前主 chunk gzip 约 79,084 bytes，保留约 18 KB headroom；这个余量允许正常小功能增长，但能拦截依赖误引入、重复打包或明显体积膨胀。统计所有 JS 文件总 gzip，而不是只看主 chunk，避免未来代码拆分绕过体积门。

## CI 流程

CI 顺序调整为：

1. `npm run lint`
2. `npm run test:coverage`
3. `npm run build`
4. `npm run check:bundle`

覆盖率在构建前失败，便于更早暴露测试质量问题；体积检查依赖 `dist`，必须在 build 后运行。现有 build 内含 `tsc --noEmit`，保留类型检查与打包验证。

## E2E Deferred

本 Issue 不引入 Playwright E2E。当前沙箱无网络，无法安装或下载浏览器；Issue 目标也明确是 CI 覆盖率与 bundle 体积护栏。E2E 可作为后续独立 Issue，在浏览器依赖可控后接入。

## 回滚

若覆盖率门导致 CI 异常，可临时回滚 `vitest.config.ts` 的 `coverage` 配置和 `package.json` 的 `test:coverage` 脚本，并把 CI 测试步骤恢复为 `npm run test`。

若 bundle 体积门误报，可回滚 `scripts/check-bundle-size.mjs`、`package.json` 的 `check:bundle` 脚本和 CI 中 build 后的体积检查步骤。该改动不触碰产品运行逻辑和构建输出结构，回滚无需数据迁移。

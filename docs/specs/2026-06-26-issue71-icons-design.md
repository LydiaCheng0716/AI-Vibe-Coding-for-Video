# Issue #71 设计文档 — 扩展图标 manifest icons

> **Issue：** #71 · **优先级：** P3（chore）· 2026-06-26

## 1. 范围

为 Chrome MV3 manifest 配置 StoryPop 扩展图标，解决工具栏显示默认图标的问题。PNG 已由编排者从 `src/assets/fireug-logo.svg` 导出到 `public/icons/`，本任务只接入 manifest，不重新生成图片。

## 2. 路径约定

项目使用 Vite + crxjs。`public/` 下的静态资源会在构建时原样拷贝到 `dist/` 根目录，因此 manifest 中应引用构建后的相对路径：

- `icons/icon16.png`
- `icons/icon32.png`
- `icons/icon48.png`
- `icons/icon128.png`

同一组路径同时用于顶层 `icons` 与 `action.default_icon`，避免扩展详情页图标和工具栏 action 图标不一致。

## 3. 改动点

- `manifest.config.ts`
  - 新增 16 / 32 / 48 / 128 四尺寸 icon map。
  - 配置顶层 `icons`。
  - 将 `action` 从仅 `default_title` 扩展为 `default_title + default_icon`。

## 4. 验证方式

本地执行：

1. `npm run build`
2. `cat dist/manifest.json`，确认输出包含顶层 `icons` 与 `action.default_icon`，路径均为 `icons/icon*.png`。
3. `ls dist/icons/`，确认 `icon16.png`、`icon32.png`、`icon48.png`、`icon128.png` 均存在。
4. `npm run lint && npm run test` 全绿。

## 5. 不改边界

- 不修改 PNG 文件内容。
- 不修改扩展权限、侧边栏、后台脚本或业务功能。
- 不部署、不 push、不开 PR、不合并。

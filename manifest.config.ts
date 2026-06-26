import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

const extensionIcons = {
  16: 'icons/icon16.png',
  32: 'icons/icon32.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png',
};

// MV3 清单（ADR-5）。Spike #3 已拍板：MVP 支持 OpenAI 兼容（已实测可直连），
// 内置已验证域名按域名最小化静态声明（禁 <all_urls>，ADR-5(4) 红线）。
// Anthropic 域名一并静态声明以覆盖 Claude 用户（适配器保留，浏览器直连未实测）。
// 自定义 baseUrl 的动态授权（optional_host_permissions + chrome.permissions.request）见下方
// optional_host_permissions 与 services/permissions.requestHostPermission（TASK-002 post-review 补齐）。
export default defineManifest({
  manifest_version: 3,
  name: 'StoryPop',
  version: pkg.version,
  description: pkg.description,
  icons: extensionIcons,
  side_panel: { default_path: 'index.html' },
  action: { default_title: 'StoryPop', default_icon: extensionIcons },
  background: { service_worker: 'src/background.ts', type: 'module' },
  permissions: ['sidePanel', 'storage'],
  host_permissions: ['https://api.openai.com/*', 'https://api.anthropic.com/*'],
  // ADR-5(3)(4a) 策略 A（Spike #3 已实测 chrome.permissions.request 弹窗授权可行）：
  // 自定义 baseUrl 的任意 https 域名走「可选权限池」，保存时逐域名当场弹窗申请；
  // 放进 optional 不等于安装即授权，每个域名仍需用户点允许。静态 host 红线（禁 <all_urls>）不变。
  optional_host_permissions: ['https://*/*'],
});

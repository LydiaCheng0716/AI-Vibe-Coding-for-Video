import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

// MV3 清单（ADR-5）。本 Issue 不申请任何 host_permissions —— 无出站调用；
// 厂商域名 / optional_host_permissions 的最终名单待 Spike #3 拍板。
export default defineManifest({
  manifest_version: 3,
  name: 'StoryBoard AI',
  version: pkg.version,
  description: pkg.description,
  side_panel: { default_path: 'index.html' },
  action: { default_title: 'StoryBoard AI' },
  background: { service_worker: 'src/background.ts', type: 'module' },
  permissions: ['sidePanel', 'storage'],
});

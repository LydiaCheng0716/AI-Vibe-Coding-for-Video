// 集中常量来源（architecture §3：core/config.ts 是唯一常量来源，禁止散落到 UI/service）。
// 长度阈值口径见 ADR-2：按「去除首尾空白后的 Unicode 码点数」计。

/** 故事硬下限（含）：低于此值禁止提交。 */
export const STORY_MIN = 10;
/** 故事硬上限（含）：高于此值禁止提交。 */
export const STORY_MAX = 5000;
/** 软建议下限：10–30 之间允许生成，但 UI 给柔性提示。 */
export const STORY_SOFT_MIN = 30;

/** 防抖：故事草稿写入延迟（ms）。 */
export const DRAFT_DEBOUNCE_MS = 300;

/** 本地存储 schema 版本（迁移用）。 */
export const SCHEMA_VERSION = 1;

/** chrome.storage.local 键名。 */
export const STORAGE_KEYS = {
  settings: 'settings',
  apiKeyCipher: 'apiKeyCipher',
  draft: 'draft',
  currentProject: 'currentProject',
} as const;

/** BYOK 密钥的 IndexedDB 库/仓名（ADR-1）。 */
export const KEY_DB = { name: 'storyboard-keys', store: 'aesKey', id: 'apiKey' } as const;

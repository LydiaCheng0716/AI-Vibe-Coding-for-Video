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

/** 单次出站生成超时（ms，ADR-3）：分镜较长给 90s，BGM 较短给 60s。 */
export const STORYBOARD_TIMEOUT_MS = 90_000;
export const BGM_TIMEOUT_MS = 60_000;

/** 出站请求 max_tokens 上限（ADR-6(4) 大小保护 / api-spec §4）。 */
export const MAX_OUTPUT_TOKENS = 4000;

/** 「测试连接」探针（Issue #28）：极小请求 + 短超时，仅判通断，不解析正文。 */
export const CONNECTION_TEST_TIMEOUT_MS = 20_000;
export const CONNECTION_TEST_MAX_TOKENS = 1;

/** 角色单字段「重新建议」（Issue #29）：小请求 + 短超时。 */
export const CHARACTER_SUGGEST_TIMEOUT_MS = 30_000;
export const CHARACTER_SUGGEST_MAX_TOKENS = 400;

/** 本地存储 schema 版本（迁移用）。 */
export const SCHEMA_VERSION = 1;

/** chrome.storage.local 键名。 */
export const STORAGE_KEYS = {
  settings: 'settings',
  apiKeyCipher: 'apiKeyCipher',
  draft: 'draft',
  currentProject: 'currentProject',
  /** 角色库（Issue #40，本地集合抽象）。 */
  characterLibrary: 'characterLibrary',
  /** 历史/草稿库（Issue #35，与角色库共用集合抽象）。 */
  projectDrafts: 'projectDrafts',
} as const;

/** BYOK 密钥的 IndexedDB 库/仓名（ADR-1）。 */
export const KEY_DB = { name: 'storyboard-keys', store: 'aesKey', id: 'apiKey' } as const;

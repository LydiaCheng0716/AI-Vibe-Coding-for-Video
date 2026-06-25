// Provider 预设（Issue #27）。内置常见 BYOK 平台，选中即填好 Base URL + 默认模型，
// 把手填出错面（平台 .cn vs .ai / baseUrl / 模型名）降到最小；字段仍可手改（纯数据 + 纯函数）。
import type { ProviderConfig } from './models';

export interface ProviderPreset {
  /** 稳定标识（下拉 value、回显反推用）。 */
  id: string;
  /** 显示名。 */
  label: string;
  kind: ProviderConfig['kind'];
  /** openai-compatible 预设的 Base URL；custom/anthropic 不填。 */
  baseUrl?: string;
  /** 选中即填入的默认模型；custom 为空串（不覆盖用户手填值）。 */
  defaultModel: string;
}

export const CUSTOM_PRESET_ID = 'custom';

// 顺序对齐 Issue #27 正文。默认模型取「便宜 / 广泛可用」入门款，均为可手改占位。
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'moonshot-cn', label: 'Moonshot(.cn)', kind: 'openai-compatible', baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-8k' },
  { id: 'moonshot-ai', label: 'Moonshot(.ai)', kind: 'openai-compatible', baseUrl: 'https://api.moonshot.ai/v1', defaultModel: 'moonshot-v1-8k' },
  { id: 'deepseek', label: 'DeepSeek', kind: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  { id: 'openai', label: 'OpenAI', kind: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  { id: 'zhipu', label: '智谱', kind: 'openai-compatible', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4-flash' },
  { id: CUSTOM_PRESET_ID, label: '自定义(OpenAI 兼容)', kind: 'openai-compatible', defaultModel: '' },
  { id: 'anthropic', label: 'Anthropic', kind: 'anthropic', defaultModel: 'claude-3-5-haiku-latest' },
];

export function getPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}

/** baseUrl 归一：去首尾空白与尾部斜杠，便于跨「带/不带尾斜杠」比较。 */
function normalizeBaseUrl(url: string | undefined): string {
  return (url ?? '').trim().replace(/\/+$/, '');
}

/**
 * 选中预设 → 新 ProviderConfig（不可变、透传 grantedOrigins，不丢已授权域名）。
 * - 普通预设：覆盖 kind/baseUrl/model（model 一律覆盖，杜绝残留上一个错模型）。
 * - anthropic：固定官方域名，清掉无意义的 baseUrl。
 * - custom：清空 baseUrl/model 回到「全手填」空白态。必须清空——下拉选中项是由 provider
 *   反推的（presetIdForProvider），若保留命中某预设的 baseUrl，下拉会立刻弹回那个预设、
 *   导致「选自定义」无效。清空后 baseUrl 为空 → 稳定反推为 custom。
 */
export function applyPreset(provider: ProviderConfig, preset: ProviderPreset): ProviderConfig {
  if (preset.id === CUSTOM_PRESET_ID) {
    return { ...provider, kind: 'openai-compatible', baseUrl: undefined, model: '' };
  }
  if (preset.kind === 'anthropic') {
    return { ...provider, kind: 'anthropic', baseUrl: undefined, model: preset.defaultModel };
  }
  return { ...provider, kind: 'openai-compatible', baseUrl: preset.baseUrl, model: preset.defaultModel };
}

/**
 * 由当前 provider 反推选中的预设 id（下拉回显，无需新增持久字段）。
 * anthropic 按 kind；openai-compatible 按归一后的 baseUrl 匹配；空/未知 → custom。
 */
export function presetIdForProvider(provider: ProviderConfig): string {
  if (provider.kind === 'anthropic') return 'anthropic';
  const base = normalizeBaseUrl(provider.baseUrl);
  if (!base) return CUSTOM_PRESET_ID;
  const hit = PROVIDER_PRESETS.find(
    (p) => p.kind === 'openai-compatible' && p.baseUrl && normalizeBaseUrl(p.baseUrl) === base,
  );
  return hit ? hit.id : CUSTOM_PRESET_ID;
}

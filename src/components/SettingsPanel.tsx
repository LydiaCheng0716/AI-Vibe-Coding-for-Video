import { useEffect, useState } from 'react';
import type { Settings, VideoModel, OutputLanguage, ShotDurationPref } from '../core/models';
import { getSettings, saveSettings, updateSettings } from '../services/storage';
import { saveApiKey, getMaskedApiKey, clearApiKey } from '../services/keyVault';
import { defaultSettings } from '../core/defaults';
import { originForProvider, hasHostPermission, requestHostPermission } from '../services/permissions';
import { PROVIDER_PRESETS, applyPreset, presetIdForProvider, getPreset } from '../core/providerPresets';
import { testConnection } from '../services/connectionTest';
import { OneTimeKeyInput, useOneTimeKey } from './OneTimeKeyInput';
import { useI18n, type UiLanguage } from '../i18n';

const VIDEO_MODELS: VideoModel[] = ['generic', 'jimeng', 'keling', 'sora', 'runway'];
const ASPECTS = ['16:9', '9:16', '1:1'];
const DURATIONS: ShotDurationPref[] = ['short', 'medium', 'long'];
const LANGS: OutputLanguage[] = ['zh', 'en', 'zh-en'];
const UI_LANGS: UiLanguage[] = ['zh', 'en'];

export default function SettingsPanel() {
  const { t, uiLanguage, setUiLanguage } = useI18n();
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const oneTimeKey = useOneTimeKey({ persistApiKey: settings.persistApiKey });
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  // 测试连接（Issue #28）：独立于保存流程的自检状态。
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testOk, setTestOk] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [s, m] = await Promise.all([getSettings(), getMaskedApiKey()]);
        if (alive) {
          setSettings(s);
          setUiLanguage(s.uiLanguage ?? 'zh');
          setMaskedKey(m);
        }
      } catch {
        if (alive) setMsg(t('settings.loadFailed'));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function patchProvider(p: Partial<Settings['provider']>) {
    setSettings((s) => ({ ...s, provider: { ...s.provider, ...p } }));
  }
  function patchParams(p: Partial<Settings['params']>) {
    setSettings((s) => ({ ...s, params: { ...s.params, ...p } }));
  }
  async function onUiLanguageChange(value: UiLanguage) {
    setSettings((s) => ({ ...s, uiLanguage: value }));
    setUiLanguage(value);
    const saved = await updateSettings({ uiLanguage: value });
    if (!saved.ok) setMsg(saved.error.message);
  }

  async function onSaveSettings() {
    // 自定义 baseUrl（openai-compatible）需先获 host 权限（ADR-5(3)）：当场弹窗申请，
    // 授权成功记入 grantedOrigins；内置域名（openai/anthropic）已静态授权，无需申请。
    let next = settings;
    let warn: string | null = null;
    const p = settings.provider;
    if (p.kind === 'openai-compatible' && p.baseUrl && p.baseUrl.trim()) {
      const origin = originForProvider(p);
      if (origin && !(await hasHostPermission(origin))) {
        const granted = await requestHostPermission(origin);
        if (granted) {
          const grantedOrigins = Array.from(new Set([...(p.grantedOrigins ?? []), origin]));
          next = { ...settings, provider: { ...p, grantedOrigins } };
        } else {
          warn = t('settings.permissionWarn', { origin });
        }
      }
    }
    // 关闭「保存 Key」→ 无条件清盘（clearApiKey 幂等），确保磁盘无残留（ADR-1 #8）。
    // 不用 maskedKey 门控：它是异步 UI 状态，可能未加载/加载失败，但磁盘仍可能有密文（Codex HIGH）。
    // 清盘失败必须中断并提示，不能谎称已清（kimi MED）。
    if (!settings.persistApiKey) {
      const cleared = await clearApiKey();
      if (!cleared.ok) {
        setMsg(cleared.error.message);
        return;
      }
      setMaskedKey(null);
    }
    const r = await saveSettings(next);
    if (next !== settings) setSettings(next);
    if (!r.ok) setMsg(r.error.message);
    else setMsg(warn ? t('settings.savedWithWarn', { warn }) : t('settings.saved'));
  }

  async function onSaveKey() {
    if (!keyInput.trim()) return;
    const r = await saveApiKey(keyInput);
    if (r.ok) {
      setKeyInput('');
      setMaskedKey(await getMaskedApiKey());
      setMsg(t('settings.keySaved'));
    } else {
      setMsg(r.error.message);
    }
  }

  async function onTestConnection() {
    setTesting(true);
    setTestMsg(null);
    try {
      const provider = settings.provider;
      // 自定义/预设非静态域名：在用户手势内当场申请 host 权限，再测（与保存流程一致）。
      if (provider.kind === 'openai-compatible' && provider.baseUrl && provider.baseUrl.trim()) {
        const origin = originForProvider(provider);
        if (origin && !(await hasHostPermission(origin))) {
          await requestHostPermission(origin);
        }
      }
      // Key：保存模式下刚填未存的 keyInput 优先；不保存模式下用一次性 Key。测试不落盘。
      const apiKey = settings.persistApiKey ? keyInput.trim() || undefined : oneTimeKey.apiKey;
      const r = await testConnection({ provider, apiKey });
      if (r.ok) {
        setTestOk(true);
        setTestMsg(t('settings.connectionOk', { latencyMs: r.latencyMs }));
      } else {
        setTestOk(false);
        setTestMsg(`❌ ${r.message}`);
      }
    } catch {
      setTestOk(false);
      setTestMsg(t('settings.connectionFailed'));
    } finally {
      if (!settings.persistApiKey) oneTimeKey.clear();
      setTesting(false);
    }
  }

  async function onDeleteKey() {
    const r = await clearApiKey();
    if (r.ok) {
      setMaskedKey(null);
      setMsg(t('settings.keyDeleted'));
    } else {
      // 删除失败时不能谎称已删：保留掩码并提示。
      setMsg(r.error.message);
    }
  }

  return (
    <section className="flex flex-col gap-4 border-t border-gray-200 p-3">
      <h2 className="text-sm font-semibold">{t('settings.title')}</h2>

      {/* BYOK */}
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-gray-700">{t('settings.providerTitle')}</h3>
        <label className="text-xs">
          {t('settings.preset')}
          <select
            className="mt-1 w-full rounded border border-gray-300 p-1 text-sm"
            value={presetIdForProvider(settings.provider)}
            onChange={(e) => {
              const preset = getPreset(e.target.value);
              if (preset) setSettings((s) => ({ ...s, provider: applyPreset(s.provider, preset) }));
            }}
          >
            {PROVIDER_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[11px] leading-snug text-amber-700">
          {t('settings.kimiWarning')}
        </p>
        {settings.provider.kind === 'openai-compatible' && (
          <label className="text-xs">
            {t('settings.baseUrl')}
            <input
              className="mt-1 w-full rounded border border-gray-300 p-1 text-sm"
              placeholder="https://api.example.com/v1"
              value={settings.provider.baseUrl ?? ''}
              onChange={(e) => patchProvider({ baseUrl: e.target.value })}
            />
          </label>
        )}
        <label className="text-xs">
          {t('settings.model')}
          <input
            className="mt-1 w-full rounded border border-gray-300 p-1 text-sm"
            placeholder={t('settings.modelPlaceholder')}
            value={settings.provider.model}
            onChange={(e) => patchProvider({ model: e.target.value })}
          />
        </label>

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={settings.persistApiKey}
            onChange={(e) => setSettings((s) => ({ ...s, persistApiKey: e.target.checked }))}
          />
          {t('settings.persistApiKey')}
        </label>

        {settings.persistApiKey ? (
          <label className="text-xs">
            {t('settings.apiKey')}
            <div className="mt-1 flex gap-1">
            <input
              type="password"
              autoComplete="off"
              className="w-full rounded border border-gray-300 p-1 text-sm"
              placeholder={maskedKey ? t('settings.maskedKeyPlaceholder', { maskedKey }) : t('settings.keyPlaceholder')}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <button
              type="button"
              onClick={onSaveKey}
              className="shrink-0 rounded bg-blue-600 px-2 text-xs text-white hover:bg-blue-700"
            >
              {t('common.save')}
            </button>
            {maskedKey && (
              <button
                type="button"
                onClick={onDeleteKey}
                className="shrink-0 rounded border border-gray-300 px-2 text-xs hover:bg-gray-50"
              >
                {t('common.delete')}
              </button>
            )}
          </div>
          </label>
        ) : (
          <label className="text-xs">
            {t('settings.tempKeyLabel')}
            <OneTimeKeyInput
              oneTimeKey={oneTimeKey}
              className="mt-1 w-full rounded border border-amber-300 p-1 text-sm outline-none focus:border-amber-500"
              placeholder={t('settings.tempKeyPlaceholder')}
            />
            <p className="mt-1 text-[11px] leading-snug text-amber-700">
              {t('settings.tempKeyHint')}
            </p>
          </label>
        )}
        {settings.persistApiKey && (
          <p className="text-[11px] leading-snug text-gray-500">
            {t('settings.keySafety')}
          </p>
        )}

        {/* 测试连接（Issue #28）：保存前发极小请求自检，分类报告问题。不写入持久状态。 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTestConnection}
            disabled={testing}
            className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
          >
            {testing ? t('settings.testingConnection') : t('settings.testConnection')}
          </button>
          <span className="text-[11px] text-gray-500">{t('settings.testHint')}</span>
        </div>
        {testMsg && (
          <p className={`text-xs ${testOk ? 'text-green-700' : 'text-red-600'}`}>{testMsg}</p>
        )}
      </div>

      {/* 生成参数 */}
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-gray-700">{t('settings.paramsTitle')}</h3>
        <label className="text-xs">
          {t('settings.uiLanguage')}
          <select
            className="mt-1 w-full rounded border border-gray-300 p-1 text-sm"
            value={settings.uiLanguage ?? uiLanguage}
            onChange={(e) => void onUiLanguageChange(e.target.value as UiLanguage)}
          >
            {UI_LANGS.map((l) => (
              <option key={l} value={l}>
                {t(`settings.lang.${l}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          {t('settings.videoModel')}
          <select
            className="mt-1 w-full rounded border border-gray-300 p-1 text-sm"
            value={settings.params.videoModel}
            onChange={(e) => patchParams({ videoModel: e.target.value as VideoModel })}
          >
            {VIDEO_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          {t('settings.style')}
          <input
            className="mt-1 w-full rounded border border-gray-300 p-1 text-sm"
            placeholder={t('settings.stylePlaceholder')}
            value={settings.params.style}
            onChange={(e) => patchParams({ style: e.target.value })}
          />
        </label>
        <div className="flex gap-2">
          <label className="flex-1 text-xs">
            {t('settings.aspectRatio')}
            <select
              className="mt-1 w-full rounded border border-gray-300 p-1 text-sm"
              value={settings.params.aspectRatio}
              onChange={(e) => patchParams({ aspectRatio: e.target.value })}
            >
              {ASPECTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-xs">
            {t('settings.duration')}
            <select
              className="mt-1 w-full rounded border border-gray-300 p-1 text-sm"
              value={settings.params.shotDurationPref}
              onChange={(e) => patchParams({ shotDurationPref: e.target.value as ShotDurationPref })}
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-xs">
            {t('settings.outputLanguage')}
            <select
              className="mt-1 w-full rounded border border-gray-300 p-1 text-sm"
              value={settings.params.outputLanguage}
              onChange={(e) => patchParams({ outputLanguage: e.target.value as OutputLanguage })}
            >
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {t(l === 'zh-en' ? 'settings.output.zhEn' : `settings.output.${l}`)}
              </option>
            ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={onSaveSettings}
          className="rounded bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-900"
        >
          {t('settings.saveSettings')}
        </button>
        {msg && <p className="text-xs text-gray-700">{msg}</p>}
      </div>
    </section>
  );
}

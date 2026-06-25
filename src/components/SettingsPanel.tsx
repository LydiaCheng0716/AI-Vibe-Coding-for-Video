import { useEffect, useState } from 'react';
import type { Settings, VideoModel, OutputLanguage, ShotDurationPref } from '../core/models';
import { getSettings, saveSettings } from '../services/storage';
import { saveApiKey, getMaskedApiKey, clearApiKey } from '../services/keyVault';
import { defaultSettings } from '../core/defaults';
import { originForProvider, hasHostPermission, requestHostPermission } from '../services/permissions';
import { PROVIDER_PRESETS, applyPreset, presetIdForProvider, getPreset } from '../core/providerPresets';
import { testConnection } from '../services/connectionTest';

const VIDEO_MODELS: VideoModel[] = ['generic', 'jimeng', 'keling', 'sora', 'runway'];
const ASPECTS = ['16:9', '9:16', '1:1'];
const DURATIONS: ShotDurationPref[] = ['short', 'medium', 'long'];
const LANGS: OutputLanguage[] = ['zh', 'en'];

export default function SettingsPanel() {
  const [settings, setSettings] = useState<Settings>(defaultSettings());
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
          setMaskedKey(m);
        }
      } catch {
        if (alive) setMsg('加载设置失败，请重试。');
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
          warn = `未获授权访问 ${origin}，生成前需在弹窗中点「允许」。`;
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
    else setMsg(warn ? `设置已保存，但${warn}` : '设置已保存。');
  }

  async function onSaveKey() {
    if (!keyInput.trim()) return;
    const r = await saveApiKey(keyInput);
    if (r.ok) {
      setKeyInput('');
      setMaskedKey(await getMaskedApiKey());
      setMsg('API Key 已加密保存。');
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
      // Key：设置区刚填未存的 keyInput 优先；否则交给服务取已保存的加密 Key。测试不落盘。
      const apiKey = keyInput.trim() || undefined;
      const r = await testConnection({ provider, apiKey });
      if (r.ok) {
        setTestOk(true);
        setTestMsg(`✅ 连接成功（延迟 ${r.latencyMs}ms）`);
      } else {
        setTestOk(false);
        setTestMsg(`❌ ${r.message}`);
      }
    } catch {
      setTestOk(false);
      setTestMsg('❌ 测试失败，请重试。');
    } finally {
      setTesting(false);
    }
  }

  async function onDeleteKey() {
    const r = await clearApiKey();
    if (r.ok) {
      setMaskedKey(null);
      setMsg('API Key 已删除。');
    } else {
      // 删除失败时不能谎称已删：保留掩码并提示。
      setMsg(r.error.message);
    }
  }

  return (
    <section className="flex flex-col gap-4 border-t border-gray-200 p-3">
      <h2 className="text-sm font-semibold">设置</h2>

      {/* BYOK */}
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-gray-700">LLM Provider（自带 Key）</h3>
        <label className="text-xs">
          预设（选中即填好 Base URL 与默认模型，可再手改）
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
          Kimi 编程版（kimi.com/code）的 Key 仅限编程工具，不能用于此处。
        </p>
        {settings.provider.kind === 'openai-compatible' && (
          <label className="text-xs">
            Base URL（https://，可选）
            <input
              className="mt-1 w-full rounded border border-gray-300 p-1 text-sm"
              placeholder="https://api.example.com/v1"
              value={settings.provider.baseUrl ?? ''}
              onChange={(e) => patchProvider({ baseUrl: e.target.value })}
            />
          </label>
        )}
        <label className="text-xs">
          模型名（需自行填写你账号可用的模型）
          <input
            className="mt-1 w-full rounded border border-gray-300 p-1 text-sm"
            placeholder="如 gpt-4o-mini / claude-... / deepseek-chat"
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
          在本机加密保存 API Key（关闭则每次生成时手动输入，不落盘）
        </label>

        {settings.persistApiKey ? (
          <label className="text-xs">
            API Key
            <div className="mt-1 flex gap-1">
            <input
              type="password"
              autoComplete="off"
              className="w-full rounded border border-gray-300 p-1 text-sm"
              placeholder={maskedKey ? `已配置（${maskedKey}）` : '粘贴你的 API Key'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <button
              type="button"
              onClick={onSaveKey}
              className="shrink-0 rounded bg-blue-600 px-2 text-xs text-white hover:bg-blue-700"
            >
              保存
            </button>
            {maskedKey && (
              <button
                type="button"
                onClick={onDeleteKey}
                className="shrink-0 rounded border border-gray-300 px-2 text-xs hover:bg-gray-50"
              >
                删除
              </button>
            )}
          </div>
          </label>
        ) : (
          <label className="text-xs">
            API Key（本次测试用，不保存、不落盘）
            <input
              type="password"
              autoComplete="off"
              className="mt-1 w-full rounded border border-amber-300 p-1 text-sm outline-none focus:border-amber-500"
              placeholder="粘贴一次性 Key 用于「测试连接」"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <p className="mt-1 text-[11px] leading-snug text-amber-700">
              已关闭保存：Key 不会落盘。生成时在生成区临时输入；此处填的 Key 仅用于「测试连接」，用完即弃。
            </p>
          </label>
        )}
        {settings.persistApiKey && (
          <p className="text-[11px] leading-snug text-gray-500">
            你的 API Key 已在本机加密保存，只用于直接调用 AI 服务。本地加密能降低硬盘被读取时的泄露风险，
            但无法防护已被恶意软件控制的浏览器或设备——请只在你信任的电脑上保存 Key。
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
            {testing ? '测试中…' : '测试连接'}
          </button>
          <span className="text-[11px] text-gray-500">发一个极小请求自检，不保存、不落盘</span>
        </div>
        {testMsg && (
          <p className={`text-xs ${testOk ? 'text-green-700' : 'text-red-600'}`}>{testMsg}</p>
        )}
      </div>

      {/* 生成参数 */}
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-gray-700">生成参数</h3>
        <label className="text-xs">
          目标视频模型（影响提示词模板）
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
          画面风格
          <input
            className="mt-1 w-full rounded border border-gray-300 p-1 text-sm"
            placeholder="如 电影感 / 赛博朋克 / 治愈系"
            value={settings.params.style}
            onChange={(e) => patchParams({ style: e.target.value })}
          />
        </label>
        <div className="flex gap-2">
          <label className="flex-1 text-xs">
            画幅
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
            单镜头时长
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
            输出语言
            <select
              className="mt-1 w-full rounded border border-gray-300 p-1 text-sm"
              value={settings.params.outputLanguage}
              onChange={(e) => patchParams({ outputLanguage: e.target.value as OutputLanguage })}
            >
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {l === 'zh' ? '中文' : 'English'}
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
          保存设置
        </button>
        {msg && <p className="text-xs text-gray-700">{msg}</p>}
      </div>
    </section>
  );
}

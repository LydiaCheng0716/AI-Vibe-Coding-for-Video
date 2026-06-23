import { useEffect, useState } from 'react';
import type { Settings, VideoModel, OutputLanguage, ShotDurationPref } from '../core/models';
import { getSettings, saveSettings } from '../services/storage';
import { saveApiKey, getMaskedApiKey, clearApiKey } from '../services/keyVault';
import { defaultSettings } from '../core/defaults';

const VIDEO_MODELS: VideoModel[] = ['generic', 'jimeng', 'keling', 'sora', 'runway'];
const ASPECTS = ['16:9', '9:16', '1:1'];
const DURATIONS: ShotDurationPref[] = ['short', 'medium', 'long'];
const LANGS: OutputLanguage[] = ['zh', 'en'];

export default function SettingsPanel() {
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [s, m] = await Promise.all([getSettings(), getMaskedApiKey()]);
      if (alive) {
        setSettings(s);
        setMaskedKey(m);
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
    const r = await saveSettings(settings);
    setMsg(r.ok ? '设置已保存。' : r.error.message);
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

  async function onDeleteKey() {
    await clearApiKey();
    setMaskedKey(null);
    setMsg('API Key 已删除。');
  }

  return (
    <section className="flex flex-col gap-4 border-t border-gray-200 p-3">
      <h2 className="text-sm font-semibold">设置</h2>

      {/* BYOK */}
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-gray-700">LLM Provider（自带 Key）</h3>
        <label className="text-xs">
          类型
          <select
            className="mt-1 w-full rounded border border-gray-300 p-1 text-sm"
            value={settings.provider.kind}
            onChange={(e) => patchProvider({ kind: e.target.value as Settings['provider']['kind'] })}
          >
            <option value="openai-compatible">OpenAI 兼容</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </label>
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
        <p className="text-[11px] leading-snug text-gray-500">
          你的 API Key 已在本机加密保存，只用于直接调用 AI 服务。本地加密能降低硬盘被读取时的泄露风险，
          但无法防护已被恶意软件控制的浏览器或设备——请只在你信任的电脑上保存 Key。
        </p>
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

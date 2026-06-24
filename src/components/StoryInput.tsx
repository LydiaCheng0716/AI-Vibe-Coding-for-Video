import { useEffect, useRef, useState } from 'react';
import { validateStory, storyValidationMessage } from '../core/validate';
import { STORY_MAX, DRAFT_DEBOUNCE_MS } from '../core/config';
import { saveDraft, getDraft, getSettings } from '../services/storage';
import { generateStoryboard } from '../services/generation';
import type { Project } from '../core/models';

interface Props {
  /** 生成成功后把项目上提给 App 渲染分镜。 */
  onGenerated: (project: Project) => void;
  /** 全局 LLM 锁占用中（TASK-009）：禁用生成按钮、显示加载。 */
  busy: boolean;
}

export default function StoryInput({ onGenerated, busy }: Props) {
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  // 不保存 Key 模式（ADR-1 #8）：persist=false 时本地不落盘，生成当次手动输入一次性 Key。
  const [persistKey, setPersistKey] = useState(true);
  const [tempKey, setTempKey] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 保存最新输入，供卸载时 flush 未落盘的草稿（Codex 外门 MED：防抖窗口内关闭会丢输入）。
  const latest = useRef('');
  // 用户是否已经输入过；避免草稿异步恢复覆盖用户已键入内容（Kimi 终审 MED：竞态）。
  const hasTyped = useRef(false);

  // 读取「是否保存 Key」设置，决定是否显示一次性 Key 输入。
  useEffect(() => {
    let on = true;
    getSettings()
      .then((s) => {
        if (on) setPersistKey(s.persistApiKey);
      })
      .catch(() => {
        /* 读取失败按默认保存模式 */
      });
    return () => {
      on = false;
    };
  }, []);

  // 侧边栏重开时恢复草稿（TASK-001 验收）。
  useEffect(() => {
    let alive = true;
    getDraft()
      .then((d) => {
        // 仅在用户尚未输入时恢复，避免覆盖已键入内容。
        if (alive && d && !hasTyped.current) {
          setText(d);
          latest.current = d;
        }
      })
      .catch(() => {
        /* 读取草稿失败：忽略，从空白开始（不影响使用）。 */
      });
    return () => {
      alive = false;
      // 卸载时若有未触发的防抖写入，立即 flush 最新文本，避免丢草稿。
      if (timer.current) {
        clearTimeout(timer.current);
        void saveDraft(latest.current); // 卸载后无法提示 UI，saveDraft 内部已吞错不会 reject。
      }
    };
  }, []);

  function onChange(value: string) {
    setText(value);
    latest.current = value;
    hasTyped.current = true;
    setNotice(null);
    // 防抖写入草稿；写入失败时给用户提示（不静默丢数据，Kimi 终审 MED）。
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveDraft(value).then((r) => {
        if (!r.ok) setNotice(r.error.message);
      });
    }, DRAFT_DEBOUNCE_MS);
  }

  const validation = validateStory(text);
  // 实时提示不对「空输入」报错（避免一打开就飘红）；空的拦截只在点生成时给。
  const liveMessage =
    validation.code === 'EMPTY_STORY' ? null : storyValidationMessage(validation);
  const isError = validation.code !== 'OK';

  async function onGenerate() {
    if (busy) return; // 兜底：busy 时不提交（按钮已 disabled，双保险）
    const v = validateStory(text);
    if (v.code !== 'OK') {
      // 阻止提交并提示（TASK-001 验收）。
      setNotice(storyValidationMessage(v));
      return;
    }
    if (!persistKey && !tempKey.trim()) {
      setNotice('请先输入本次使用的 API Key（已关闭保存）。');
      return;
    }
    setNotice('正在生成分镜…');
    const r = await generateStoryboard({
      story: text,
      ...(persistKey ? {} : { apiKey: tempKey }),
    });
    if (!persistKey) setTempKey(''); // 一次性 Key 用完即弃，不保留
    if (r.ok) {
      setNotice(null);
      onGenerated(r.data);
    } else {
      // 含 NO_API_KEY / 配置错误 / 网络等可读提示（TASK-003/009）。
      setNotice(r.error.message);
    }
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <label htmlFor="story" className="text-sm font-medium">
        你的故事
      </label>
      <textarea
        id="story"
        className="min-h-[160px] w-full resize-y rounded border border-gray-300 p-2 text-sm outline-none focus:border-blue-500"
        placeholder="用一段话描述你的故事或短视频创意…"
        value={text}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          {validation.count} / {STORY_MAX}
        </span>
        {liveMessage && (
          <span className={isError ? 'text-red-600' : 'text-amber-600'}>{liveMessage}</span>
        )}
      </div>
      {!persistKey && (
        <input
          type="password"
          autoComplete="off"
          className="w-full rounded border border-amber-300 p-2 text-sm outline-none focus:border-amber-500"
          placeholder="本次使用的 API Key（已关闭保存，不落盘）"
          value={tempKey}
          onChange={(e) => setTempKey(e.target.value)}
        />
      )}
      <button
        type="button"
        onClick={onGenerate}
        disabled={busy}
        className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? '生成中…' : '生成分镜'}
      </button>
      {notice && <p className="text-xs text-gray-700">{notice}</p>}
    </div>
  );
}

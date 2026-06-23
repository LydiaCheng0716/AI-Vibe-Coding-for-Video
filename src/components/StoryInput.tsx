import { useEffect, useRef, useState } from 'react';
import { validateStory, storyValidationMessage } from '../core/validate';
import { STORY_MAX, DRAFT_DEBOUNCE_MS } from '../core/config';
import { saveDraft, getDraft } from '../services/storage';

export default function StoryInput() {
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 保存最新输入，供卸载时 flush 未落盘的草稿（Codex 外门 MED：防抖窗口内关闭会丢输入）。
  const latest = useRef('');

  // 侧边栏重开时恢复草稿（TASK-001 验收）。
  useEffect(() => {
    let alive = true;
    getDraft().then((d) => {
      if (alive && d) {
        setText(d);
        latest.current = d;
      }
    });
    return () => {
      alive = false;
      // 卸载时若有未触发的防抖写入，立即 flush 最新文本，避免丢草稿。
      if (timer.current) {
        clearTimeout(timer.current);
        void saveDraft(latest.current);
      }
    };
  }, []);

  function onChange(value: string) {
    setText(value);
    latest.current = value;
    setNotice(null);
    // 防抖写入草稿。
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void saveDraft(value);
    }, DRAFT_DEBOUNCE_MS);
  }

  const validation = validateStory(text);
  // 实时提示不对「空输入」报错（避免一打开就飘红）；空的拦截只在点生成时给。
  const liveMessage =
    validation.code === 'EMPTY_STORY' ? null : storyValidationMessage(validation);
  const isError = validation.code !== 'OK';

  function onGenerate() {
    const v = validateStory(text);
    if (v.code !== 'OK') {
      // 阻止提交并提示（TASK-001 验收）。
      setNotice(storyValidationMessage(v));
      return;
    }
    // 真正的分镜生成由 TASK-003 接入（被 Spike #3 阻塞）。
    setNotice('校验通过。分镜生成将在后续版本接入。');
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
      <button
        type="button"
        onClick={onGenerate}
        className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        生成分镜
      </button>
      {notice && <p className="text-xs text-gray-700">{notice}</p>}
    </div>
  );
}

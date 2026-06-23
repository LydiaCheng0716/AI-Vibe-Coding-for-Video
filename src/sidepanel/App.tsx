import { useState } from 'react';
import StoryInput from '../components/StoryInput';
import SettingsPanel from '../components/SettingsPanel';

export default function App() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <div>
          <h1 className="text-base font-semibold">StoryBoard AI</h1>
          <p className="text-xs text-gray-500">把故事变成分镜与提示词</p>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
          aria-pressed={showSettings}
        >
          {showSettings ? '返回' : '设置'}
        </button>
      </header>
      <main>{showSettings ? <SettingsPanel /> : <StoryInput />}</main>
    </div>
  );
}

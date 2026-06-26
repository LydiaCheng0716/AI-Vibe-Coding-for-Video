import { useEffect, useState } from 'react';
import fireugLogo from '../assets/fireug-logo.svg';
import StoryInput from '../components/StoryInput';
import SettingsPanel from '../components/SettingsPanel';
import ShotList from '../components/ShotList';
import ExportPanel from '../components/ExportPanel';
import BgmPanel from '../components/BgmPanel';
import CharacterPanel from '../components/CharacterPanel';
import StylePanel from '../components/StylePanel';
import DraftsPanel from '../components/DraftsPanel';
import { getSettings } from '../services/storage';
import { subscribeLlmBusy } from '../services/llmLock';
import { ProjectStoreProvider, useProjectStore } from './projectStore';

export default function App() {
  return (
    <ProjectStoreProvider>
      <AppContent />
    </ProjectStoreProvider>
  );
}

function AppContent() {
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const { project, projectLoadVersion, loadCurrentProject, replaceProject } = useProjectStore();
  // 读一次「是否保存 Key」下传给各镜头卡（避免每卡各读一次 storage）。
  const [persistApiKey, setPersistApiKey] = useState(true);

  // 侧边栏重开时恢复上次分镜结果；订阅全局加载态（TASK-009）。
  useEffect(() => {
    void loadCurrentProject();
    const unsub = subscribeLlmBusy(setBusy);
    return () => {
      unsub();
    };
  }, [loadCurrentProject]);

  // 在「返回主界面」时刷新「是否保存 Key」：用户可能刚在设置里改了该开关并清了 Key
  // （Codex P2：仅 mount 读会导致开关变更后单镜头重写恒 NO_API_KEY）。初次挂载也会跑（showSettings=false）。
  useEffect(() => {
    if (showSettings) return;
    let alive = true;
    getSettings()
      .then((s) => {
        if (alive) setPersistApiKey(s.persistApiKey);
      })
      .catch(() => {
        /* 读取失败按默认保存模式 */
      });
    return () => {
      alive = false;
    };
  }, [showSettings]);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <div className="flex items-center gap-2">
          <img src={fireugLogo} alt="FireUG" className="h-7 w-7 shrink-0" />
          <div>
            <h1 className="text-base font-semibold">StoryPop</h1>
            <p className="text-xs text-gray-500">把故事变成分镜与提示词</p>
          </div>
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
      <main>
        {showSettings ? (
          <SettingsPanel />
        ) : (
          <>
            <StoryInput onGenerated={replaceProject} busy={busy} />
            <DraftsPanel project={project} />
            {project && (
              <>
                <StylePanel
                  key={projectLoadVersion}
                  globalStyle={project.globalStyle}
                  story={project.story}
                  lang={project.params.outputLanguage}
                  busy={busy}
                  persistApiKey={persistApiKey}
                />
                <CharacterPanel
                  characters={project.characters}
                  story={project.story}
                  lang={project.params.outputLanguage}
                  busy={busy}
                />
                <ShotList
                  project={project}
                  busy={busy}
                  persistApiKey={persistApiKey}
                />
                <BgmPanel project={project} busy={busy} />
                <ExportPanel project={project} />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

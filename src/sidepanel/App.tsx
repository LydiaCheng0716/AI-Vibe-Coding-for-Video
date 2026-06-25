import { useEffect, useState } from 'react';
import StoryInput from '../components/StoryInput';
import SettingsPanel from '../components/SettingsPanel';
import ShotList from '../components/ShotList';
import ExportPanel from '../components/ExportPanel';
import BgmPanel from '../components/BgmPanel';
import CharacterPanel from '../components/CharacterPanel';
import type { Project, BgmPrompt, Character } from '../core/models';
import { getCurrentProject } from '../services/storage';
import { subscribeLlmBusy } from '../services/llmLock';

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);

  // 侧边栏重开时恢复上次分镜结果；订阅全局加载态（TASK-009）。
  useEffect(() => {
    let alive = true;
    getCurrentProject()
      .then((p) => {
        if (alive && p) setProject(p);
      })
      .catch(() => {
        /* 读取失败：从空开始，不影响使用 */
      });
    const unsub = subscribeLlmBusy(setBusy);
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  // 单镜头保存后更新内存态，仅改该镜头并置 editedByUser（与 storage 一致）。
  function onShotSaved(shotId: string, prompt: string) {
    setProject((prev) =>
      prev
        ? {
            ...prev,
            shots: prev.shots.map((s) =>
              s.id === shotId ? { ...s, prompt, editedByUser: true } : s,
            ),
          }
        : prev,
    );
  }

  function onBgmGenerated(bgm: BgmPrompt) {
    setProject((prev) => (prev ? { ...prev, bgm } : prev));
  }

  // 角色调校/锁定后 storage 已重注入并落库，这里整体同步内存态（含刷新后的镜头 prompt）。
  function onProjectUpdated(next: Project) {
    setProject(next);
  }

  // 手动新增角色：追加到内存态（storage 已落库）。
  function onCharacterAdded(character: Character) {
    setProject((prev) => (prev ? { ...prev, characters: [...prev.characters, character] } : prev));
  }

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
      <main>
        {showSettings ? (
          <SettingsPanel />
        ) : (
          <>
            <StoryInput onGenerated={setProject} busy={busy} />
            {project && (
              <>
                <CharacterPanel
                  characters={project.characters}
                  story={project.story}
                  lang={project.params.outputLanguage}
                  busy={busy}
                  onProjectUpdated={onProjectUpdated}
                  onCharacterAdded={onCharacterAdded}
                />
                <ShotList shots={project.shots} onShotSaved={onShotSaved} />
                <BgmPanel project={project} busy={busy} onBgmGenerated={onBgmGenerated} />
                <ExportPanel project={project} />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

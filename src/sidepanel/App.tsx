import { useEffect, useState } from 'react';
import StoryInput from '../components/StoryInput';
import SettingsPanel from '../components/SettingsPanel';
import ShotList from '../components/ShotList';
import ExportPanel from '../components/ExportPanel';
import BgmPanel from '../components/BgmPanel';
import CharacterPanel from '../components/CharacterPanel';
import StylePanel from '../components/StylePanel';
import DraftsPanel from '../components/DraftsPanel';
import type { Project, BgmPrompt, Character, Shot } from '../core/models';
import { getCurrentProject, getSettings, saveCurrentProject } from '../services/storage';
import { subscribeLlmBusy } from '../services/llmLock';

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  // 读一次「是否保存 Key」下传给各镜头卡（避免每卡各读一次 storage）。
  const [persistApiKey, setPersistApiKey] = useState(true);
  // 每次「加载新项目」（生成/打开草稿）自增，用作 StylePanel 的 key 使其重挂载、重新播种本地草稿
  // （避免切项目后面板留旧项目风格、blur/锁定覆盖新项目，Codex P2）。编辑同项目不变更此 key。
  const [projectLoadKey, setProjectLoadKey] = useState(0);

  function loadNewProject(p: Project) {
    setProject(p);
    setProjectLoadKey((k) => k + 1);
  }

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

  // 单镜头变更（手动保存 / 重写 / 撤销）后整条替换该镜头（storage 已落库）。
  function onShotChanged(shot: Shot) {
    setProject((prev) =>
      prev ? { ...prev, shots: prev.shots.map((s) => (s.id === shot.id ? shot : s)) } : prev,
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

  // 打开历史草稿（Issue #35）：先置为 currentProject 成功，再切 UI——否则后续单镜头/角色编辑会
  // 作用在旧 currentProject 上而 UI 显示新草稿（Codex P2）。落盘失败则不切，返回 false 让 UI 报错。
  async function onOpenDraft(p: Project): Promise<boolean> {
    const r = await saveCurrentProject(p);
    if (!r.ok) return false;
    loadNewProject(p);
    return true;
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <div>
          <h1 className="text-base font-semibold">StoryPop</h1>
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
            <StoryInput onGenerated={loadNewProject} busy={busy} />
            <DraftsPanel project={project} onOpen={onOpenDraft} />
            {project && (
              <>
                <StylePanel
                  key={projectLoadKey}
                  globalStyle={project.globalStyle}
                  story={project.story}
                  lang={project.params.outputLanguage}
                  busy={busy}
                  persistApiKey={persistApiKey}
                  onProjectUpdated={onProjectUpdated}
                />
                <CharacterPanel
                  characters={project.characters}
                  story={project.story}
                  lang={project.params.outputLanguage}
                  busy={busy}
                  onProjectUpdated={onProjectUpdated}
                  onCharacterAdded={onCharacterAdded}
                />
                <ShotList
                  project={project}
                  busy={busy}
                  persistApiKey={persistApiKey}
                  onShotChanged={onShotChanged}
                />
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

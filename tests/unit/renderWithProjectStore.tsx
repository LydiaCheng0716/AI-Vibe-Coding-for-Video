import { useEffect, useState, type ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { defaultParams } from '../../src/core/defaults';
import type { Character, CharacterProfile, GlobalStyle, Project, Shot, StyleProfile } from '../../src/core/models';
import { emptyProfile } from '../../src/core/characterProfile';
import { emptyStyleProfile } from '../../src/core/styleProfile';
import { ProjectStoreProvider, useProjectStore } from '../../src/sidepanel/projectStore';

function cloneProject(project: Project): Project {
  return structuredClone(project);
}

export function makeShot(id: string, index: number, patch: Partial<Shot> = {}): Shot {
  return {
    id,
    index,
    summary: `镜头摘要 ${index}`,
    shotSize: '中景',
    cameraMovement: '固定',
    durationSuggestion: '3s',
    prompt: `中文提示 ${index}`,
    characterRefs: [],
    editedByUser: false,
    ...patch,
  };
}

export function makeCharacter(patch: Partial<Character> = {}): Character {
  const profile: CharacterProfile = {
    ...emptyProfile(),
    codename: '林夏',
    hair: '黑色短发',
  };
  return {
    id: 'c1',
    name: '林夏',
    appearance: '年轻记者',
    profile,
    ...patch,
  };
}

export function makeGlobalStyle(patch: Partial<GlobalStyle> = {}): GlobalStyle {
  const profile: StyleProfile = {
    ...emptyStyleProfile(),
    colorGrade: '暖金色调',
    lighting: '柔和侧光',
  };
  return {
    profile,
    ...patch,
  };
}

export function makeProject(patch: Partial<Project> = {}): Project {
  return {
    schemaVersion: 1,
    story: '一个年轻记者追踪城市夜晚里的神秘线索。',
    params: { ...defaultParams(), outputLanguage: 'zh' },
    characters: [makeCharacter()],
    shots: [makeShot('s1', 1), makeShot('s2', 2), makeShot('s3', 3)],
    globalStyle: makeGlobalStyle(),
    ...patch,
  };
}

function LoadedProject({
  initialProject,
  children,
}: {
  initialProject: Project;
  children: (project: Project) => ReactElement;
}) {
  const { project, replaceProject } = useProjectStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void replaceProject(cloneProject(initialProject)).then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [initialProject, replaceProject]);

  if (!ready || !project) return <div>Loading test project</div>;
  return children(project);
}

export function renderWithProjectStore(
  initialProject: Project,
  children: (project: Project) => ReactElement,
): RenderResult {
  return render(
    <ProjectStoreProvider>
      <LoadedProject initialProject={initialProject}>{children}</LoadedProject>
    </ProjectStoreProvider>,
  );
}

// 全局风格注入（Issue #55，仿 core/characters 的角色注入）。纯函数、幂等、不可变。
// 锁定的全局风格作为锚点逐镜注入 prompt（独立 header，与角色注入并存互不干扰）；
// 跳过 editedByUser；与 #30/#32 单镜头重写协同（重写后再注入保持风格锚点）。
import type { GlobalStyle, OutputLanguage, Project, Shot } from './models';
import { composeStyle } from './styleProfile';

const STYLE_HEADER: Record<OutputLanguage, string> = {
  zh: '全局风格参考：',
  en: 'Global style reference:',
  'zh-en': '全局风格参考：',
};

/** 锁定且非空风格 → 锚点整行 `- 全局风格：{合成}`；否则 null。 */
export function styleAnchorLine(
  globalStyle: GlobalStyle | undefined,
  lang: OutputLanguage,
): string | null {
  if (!globalStyle?.locked) return null;
  const composed = composeStyle(globalStyle.profile, lang);
  if (!composed) return null;
  return `- 全局风格：${composed}`;
}

/** 把锁定的全局风格锚点注入单个 shot（幂等、不可变、跳过 editedByUser）。 */
export function injectStyleIntoShot(
  shot: Shot,
  globalStyle: GlobalStyle | undefined,
  lang: OutputLanguage,
): Shot {
  if (shot.editedByUser) return shot;
  const line = styleAnchorLine(globalStyle, lang);
  if (!line) return shot;
  if (shot.prompt.includes(line)) return shot;
  const header = STYLE_HEADER[lang] ?? STYLE_HEADER.zh;
  const sep = shot.prompt.includes(header) ? '\n' : `\n\n${header}\n`;
  return { ...shot, prompt: `${shot.prompt}${sep}${line}` };
}

/** 对整个项目注入全局风格锚点（locked 时）。返回新 Project。 */
export function injectGlobalStyle(project: Project): Project {
  if (!project.globalStyle?.locked) return project;
  const lang = project.params.outputLanguage;
  return { ...project, shots: project.shots.map((s) => injectStyleIntoShot(s, project.globalStyle, lang)) };
}

/**
 * 去掉本模块注入的「全局风格参考」块（**有界**：仅删本块到下一个 `\n\n`/结尾，不误删其后的角色块等
 * 其它注入块——两类注入块顺序无关、互不干扰，Codex P2）。块为单行、无 `\n\n`。
 */
function stripStyleBlock(prompt: string, lang: OutputLanguage): string {
  const header = STYLE_HEADER[lang] ?? STYLE_HEADER.zh;
  const marker = `\n\n${header}\n`;
  const start = prompt.indexOf(marker);
  if (start < 0) return prompt;
  const nextBlank = prompt.indexOf('\n\n', start + marker.length);
  const end = nextBlank >= 0 ? nextBlank : prompt.length;
  return prompt.slice(0, start) + prompt.slice(end);
}

/**
 * 重注入（调校/锁定风格后刷新镜头锚点）：先剥旧风格块再按当前风格重注入；未锁则仅剥离。
 * editedByUser 镜头原样保留。风格块由本模块追加、非用户撰写，对非编辑镜头剥离重建安全。
 */
export function reinjectGlobalStyle(project: Project): Project {
  const lang = project.params.outputLanguage;
  return {
    ...project,
    shots: project.shots.map((s) => {
      if (s.editedByUser) return s;
      const base = { ...s, prompt: stripStyleBlock(s.prompt, lang) };
      return injectStyleIntoShot(base, project.globalStyle, lang);
    }),
  };
}

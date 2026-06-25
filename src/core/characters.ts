// 人物一致性注入（TASK-005 + Issue #29 增强）。纯函数、幂等、不可变：把镜头引用到的角色统一外观
// 锚点以「专用参考块」注入对应镜头 prompt，减少跨镜头人物漂移；editedByUser 镜头原样保留。
//
// Issue #29：锚点优先取结构化档案 profile（逐字注入固定字段），无 profile 时回退 appearance（兼容旧数据）。
// 锁定（locked）角色的权威值由此确定性注入，模型无从改写。导出 characterAnchorLine /
// injectCharactersIntoShot 供 #30「单镜头重生成」复用（重生成后注入锁定角色保持不漂移）。
//
// 幂等用「精确整行匹配」而非锚点子串匹配（kimi MED-1）：保证「引用角色的镜头一定含其锚点」可验证。
import type { Character, OutputLanguage, Project, Shot } from './models';
import { composeAppearance } from './characterProfile';

const HEADER: Record<OutputLanguage, string> = {
  zh: '角色一致性参考：',
  en: 'Character consistency reference:',
  'zh-en': '角色一致性参考：', // 双语：锚点块沿用中文口径，注入到中文 prompt
};

/** 外观单行化，避免换行破坏注入块格式（kimi LOW-3）。 */
function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** 角色稳定显示名：有 name 用 name，否则用其 id 数字（角色N）。 */
function displayName(c: Character): string {
  if (c.name) return c.name;
  const n = c.id.replace(/^c/, '');
  return `角色${n}`;
}

/** 角色的权威外观锚点：优先结构化档案 profile（逐字注入），否则回退 appearance。 */
export function characterAnchor(c: Character, lang: OutputLanguage): string {
  if (c.profile) {
    const composed = composeAppearance(c.profile, lang);
    if (composed) return composed;
  }
  return oneLine(c.appearance ?? '');
}

/** 单角色注入整行 `- 显示名：锚点`（#30 单镜头重生成可复用此口径）。空锚点返回 null。 */
export function characterAnchorLine(c: Character, lang: OutputLanguage): string | null {
  const anchor = characterAnchor(c, lang);
  if (!anchor) return null;
  return `- ${displayName(c)}：${anchor}`;
}

/**
 * 把命中该镜头 characterRefs 的角色锚点注入单个 shot（幂等、不可变、跳过 editedByUser）。
 * 导出供 generation 全量注入与 #30 单镜头重生成共用——是「锁定角色注入每镜头」的唯一实现。
 */
export function injectCharactersIntoShot(
  shot: Shot,
  byId: Map<string, Character>,
  lang: OutputLanguage,
): Shot {
  // 保护用户手动编辑（Issue #7 / 数据模型硬要求）。
  if (shot.editedByUser) return shot;
  if (!shot.characterRefs || shot.characterRefs.length === 0) return shot;

  const header = HEADER[lang] ?? HEADER.zh;
  // 待注入整行（去重按 id），仅保留 prompt 中尚不存在该整行的（幂等 + 不漏）。
  const seen = new Set<string>();
  const missing: string[] = [];
  for (const id of shot.characterRefs) {
    if (seen.has(id)) continue;
    seen.add(id);
    const c = byId.get(id);
    if (!c) continue;
    const line = characterAnchorLine(c, lang);
    if (!line) continue;
    if (!shot.prompt.includes(line)) missing.push(line);
  }
  if (missing.length === 0) return shot;

  // 已有参考块 → 追加缺失行；否则新建带表头的块。
  const sep = shot.prompt.includes(header) ? '\n' : `\n\n${header}\n`;
  return { ...shot, prompt: `${shot.prompt}${sep}${missing.join('\n')}` };
}

/**
 * 对整个项目做人物一致性注入。返回新 Project（不修改入参；未变更的 shot 结构共享）。
 * 同一角色被多镜头引用时各镜头注入相同锚点 → 跨镜头一致；锁定角色注入其权威档案。
 */
export function injectCharacterConsistency(project: Project): Project {
  if (!project.characters || project.characters.length === 0) return project;
  const byId = new Map(project.characters.map((c) => [c.id, c]));
  const lang = project.params.outputLanguage;
  return { ...project, shots: project.shots.map((s) => injectCharactersIntoShot(s, byId, lang)) };
}

/**
 * 去掉本模块注入的「角色一致性参考」块（**有界**：仅删本块到下一个 `\n\n`/结尾，不误删其后的
 * 全局风格块等其它注入块——两类注入块顺序无关、互不干扰，Codex P2）。块内行以单 `\n` 连接、无 `\n\n`。
 */
function stripInjectedBlock(prompt: string, lang: OutputLanguage): string {
  const header = HEADER[lang] ?? HEADER.zh;
  const marker = `\n\n${header}\n`;
  const start = prompt.indexOf(marker);
  if (start < 0) return prompt;
  const nextBlank = prompt.indexOf('\n\n', start + marker.length);
  const end = nextBlank >= 0 ? nextBlank : prompt.length;
  return prompt.slice(0, start) + prompt.slice(end);
}

/**
 * 重注入（Issue #29 C）：用户调校/锁定角色后刷新镜头锚点——先剥离旧注入块再按当前角色重注入，
 * 避免「改了档案后旧锚点残留 + 新锚点叠加」的不一致。editedByUser 镜头原样保留（不剥不注）。
 * 注入块由本模块追加、非用户撰写，对非编辑镜头剥离重建安全。
 */
export function reinjectCharacterConsistency(project: Project): Project {
  if (!project.characters || project.characters.length === 0) {
    // 角色清空：仍需剥离残留注入块（非编辑镜头）。
    const lang = project.params.outputLanguage;
    return {
      ...project,
      shots: project.shots.map((s) =>
        s.editedByUser ? s : { ...s, prompt: stripInjectedBlock(s.prompt, lang) },
      ),
    };
  }
  const byId = new Map(project.characters.map((c) => [c.id, c]));
  const lang = project.params.outputLanguage;
  return {
    ...project,
    shots: project.shots.map((s) => {
      if (s.editedByUser) return s;
      const base = { ...s, prompt: stripInjectedBlock(s.prompt, lang) };
      return injectCharactersIntoShot(base, byId, lang);
    }),
  };
}

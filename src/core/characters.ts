// 人物一致性注入（TASK-005）。纯函数、幂等、不可变：把镜头引用到的角色统一外观描述
// 以「专用参考块」注入对应镜头 prompt，减少跨镜头人物漂移；editedByUser 镜头原样保留。
//
// 幂等用「精确整行匹配」而非外观子串匹配（kimi MED-1）：避免 appearance 作为无关内容子串
// （如 appearance=「短发」恰好出现在 prompt 别处）被误判为已注入而漏注，保证「引用角色的镜头
// 一定含其外观」可验证；整行 `- 名字：外观` 足够具体，不会误命中。
import type { Character, OutputLanguage, Project, Shot } from './models';

const HEADER: Record<OutputLanguage, string> = {
  zh: '角色一致性参考：',
  en: 'Character consistency reference:',
};

/** 外观单行化，避免换行破坏注入块格式（kimi LOW-3）。 */
function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** 角色稳定显示名：有 name 用 name，否则用其 id 数字（角色N），与过滤无关（kimi LOW-1）。 */
function displayName(c: Character): string {
  if (c.name) return c.name;
  const n = c.id.replace(/^c/, '');
  return `角色${n}`;
}

function injectShot(shot: Shot, byId: Map<string, Character>, lang: OutputLanguage): Shot {
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
    if (!c || !c.appearance) continue;
    const line = `- ${displayName(c)}：${oneLine(c.appearance)}`;
    if (!shot.prompt.includes(line)) missing.push(line);
  }
  if (missing.length === 0) return shot;

  // 已有参考块 → 追加缺失行；否则新建带表头的块。
  const sep = shot.prompt.includes(header) ? '\n' : `\n\n${header}\n`;
  return { ...shot, prompt: `${shot.prompt}${sep}${missing.join('\n')}` };
}

/**
 * 对整个项目做人物一致性注入。返回新 Project（不修改入参；未变更的 shot 结构共享，
 * 符合不可变更新惯例）。同一角色被多镜头引用时各镜头注入相同 appearance → 跨镜头一致。
 */
export function injectCharacterConsistency(project: Project): Project {
  if (!project.characters || project.characters.length === 0) return project;
  const byId = new Map(project.characters.map((c) => [c.id, c]));
  const lang = project.params.outputLanguage;
  return { ...project, shots: project.shots.map((s) => injectShot(s, byId, lang)) };
}

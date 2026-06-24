// 人物一致性注入（TASK-005）。纯函数、幂等、不可变：把镜头引用到的角色统一外观描述
// 注入对应镜头 prompt，减少跨镜头人物漂移；editedByUser 镜头原样保留（不被覆盖）。
import type { Character, Project, Shot } from './models';

const CONSISTENCY_HEADER = '角色一致性参考：';

/** 注入单个镜头：返回新 Shot（必要时追加一致性参考块）；无需注入则原样返回。 */
function injectShot(shot: Shot, byId: Map<string, Character>): Shot {
  // 保护用户手动编辑（Issue #7 / 数据模型硬要求）。
  if (shot.editedByUser) return shot;
  if (!shot.characterRefs || shot.characterRefs.length === 0) return shot;

  const pending: Character[] = [];
  for (const id of shot.characterRefs) {
    const c = byId.get(id);
    if (!c || !c.appearance) continue;
    // 幂等 / 兼容 LLM 已自行嵌入：prompt 已含该外观文本则不重复注入。
    if (shot.prompt.includes(c.appearance)) continue;
    pending.push(c);
  }
  if (pending.length === 0) return shot;

  const lines = pending.map((c, i) => `- ${c.name ?? `角色${i + 1}`}：${c.appearance}`);
  const block = `${CONSISTENCY_HEADER}\n${lines.join('\n')}`;
  return { ...shot, prompt: `${shot.prompt}\n\n${block}` };
}

/**
 * 对整个项目做人物一致性注入。返回新 Project（不修改入参）。
 * 同一角色被多镜头引用时，各镜头注入相同 appearance → 跨镜头一致。
 */
export function injectCharacterConsistency(project: Project): Project {
  if (!project.characters || project.characters.length === 0) return project;
  const byId = new Map(project.characters.map((c) => [c.id, c]));
  return { ...project, shots: project.shots.map((s) => injectShot(s, byId)) };
}

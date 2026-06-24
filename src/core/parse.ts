// LLM 原始返回 → 结构化分镜模型的解析与校验（TASK-003 / ADR-6）。
// 纯函数、无副作用。解析接受范围：纯 JSON → 首个 fenced ```json``` 块 → 首个平衡 {...} 块；
// 全失败即 BAD_RESPONSE_FORMAT。**不做自由文本猜测、不补全截断 JSON。**
import type { Character, GenerationParams, Project, Shot } from './models';
import { SCHEMA_VERSION } from './config';

export const SHOTS_MIN = 3;
export const SHOTS_MAX = 10;

/** 解析结果：成功给结构化数据，失败只给原因（由调用方转成 BAD_RESPONSE_FORMAT）。 */
export type ParseResult =
  | { ok: true; characters: Character[]; shots: Shot[]; bgmPrompt?: string }
  | { ok: false; reason: string };

// ---- 解析接受范围（ADR-6(2)）----

/** 提取第一个 ```json ... ``` 或 ``` ... ``` 代码块内容。 */
function extractFencedJson(text: string): string | null {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1].trim() : null;
}

/**
 * 扫描第一个平衡的 {...} 块。按括号配对，跳过字符串字面量内的括号与转义。
 * 不补全截断 JSON：到字符串结尾仍未配平则返回 null。
 */
function extractBalancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // 未配平：截断，不补全
}

/** 按 ADR-6(2) 顺序尝试解析为对象，全失败返回 null。 */
function tryParseObject(raw: string): unknown | null {
  const text = raw.trim();
  // 1. 整段是合法 JSON
  try {
    return JSON.parse(text);
  } catch {
    /* 继续 */
  }
  // 2. 第一个 fenced 代码块
  const fenced = extractFencedJson(text);
  if (fenced) {
    try {
      return JSON.parse(fenced);
    } catch {
      /* 继续 */
    }
  }
  // 3. 第一个平衡 {...} 块
  const balanced = extractBalancedObject(text);
  if (balanced) {
    try {
      return JSON.parse(balanced);
    } catch {
      /* 落空 */
    }
  }
  return null;
}

// ---- 字段校验（ADR-6(3)）----

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nonEmptyStr(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

const SHOT_FIELDS = ['summary', 'shotSize', 'cameraMovement', 'durationSuggestion', 'prompt'] as const;

/**
 * 解析 + 校验 LLM 原始文本为结构化分镜。归一化：补 id/index/editedByUser，
 * characterRefs 按 name 或序号归一到内部 Character.id，对不上的引用丢弃（ADR-6(3)）。
 */
export function parseStoryboard(raw: string): ParseResult {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, reason: '空响应' };
  }
  const obj = tryParseObject(raw);
  if (!isObj(obj)) return { ok: false, reason: '无法解析为 JSON 对象' };

  // shots：必须是数组且数量 ∈ [3,10]
  const rawShots = obj.shots;
  if (!Array.isArray(rawShots)) return { ok: false, reason: 'shots 不是数组' };
  if (rawShots.length < SHOTS_MIN || rawShots.length > SHOTS_MAX) {
    return { ok: false, reason: `镜头数 ${rawShots.length} 不在 [${SHOTS_MIN},${SHOTS_MAX}]` };
  }

  // characters：可缺省/空数组；每项 appearance 非空，name 允许 null（不强行编造）
  const characters: Character[] = [];
  const rawChars = Array.isArray(obj.characters) ? obj.characters : [];
  rawChars.forEach((c, i) => {
    if (!isObj(c)) return;
    if (!nonEmptyStr(c.appearance)) return; // appearance 必须有意义
    const name = typeof c.name === 'string' && c.name.trim() ? c.name.trim() : null;
    characters.push({ id: `c${i + 1}`, name, appearance: c.appearance.trim() });
  });

  // characterRefs 归一：name 命中（不分大小写）或 1-based 序号命中 → Character.id；否则丢弃
  const byName = new Map<string, string>();
  characters.forEach((c) => {
    if (c.name) byName.set(c.name.toLowerCase(), c.id);
  });
  const resolveRef = (ref: unknown): string | null => {
    if (typeof ref === 'string') {
      const hit = byName.get(ref.trim().toLowerCase());
      if (hit) return hit;
      const asIdx = Number(ref);
      if (Number.isInteger(asIdx) && asIdx >= 1 && asIdx <= characters.length) {
        return characters[asIdx - 1].id;
      }
      return null;
    }
    if (typeof ref === 'number' && Number.isInteger(ref) && ref >= 1 && ref <= characters.length) {
      return characters[ref - 1].id;
    }
    return null;
  };

  const shots: Shot[] = [];
  for (let i = 0; i < rawShots.length; i++) {
    const s = rawShots[i];
    if (!isObj(s)) return { ok: false, reason: `镜头 ${i + 1} 不是对象` };
    for (const f of SHOT_FIELDS) {
      if (!nonEmptyStr(s[f])) return { ok: false, reason: `镜头 ${i + 1} 缺字段 ${f}` };
    }
    const refsIn = Array.isArray(s.characterRefs) ? s.characterRefs : [];
    const characterRefs = Array.from(
      new Set(refsIn.map(resolveRef).filter((x): x is string => x !== null)),
    );
    shots.push({
      id: `s${i + 1}`,
      index: i + 1,
      summary: (s.summary as string).trim(),
      shotSize: (s.shotSize as string).trim(),
      cameraMovement: (s.cameraMovement as string).trim(),
      durationSuggestion: (s.durationSuggestion as string).trim(),
      prompt: (s.prompt as string).trim(),
      characterRefs,
      editedByUser: false,
    });
  }

  const bgm = isObj(obj.bgm) && nonEmptyStr(obj.bgm.prompt) ? obj.bgm.prompt.trim() : undefined;
  return { ok: true, characters, shots, bgmPrompt: bgm };
}

/** 把解析结果组装成完整 Project（供 generation.ts 落库）。 */
export function buildProject(
  story: string,
  params: GenerationParams,
  parsed: { characters: Character[]; shots: Shot[] },
): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    story,
    params,
    characters: parsed.characters,
    shots: parsed.shots,
  };
}

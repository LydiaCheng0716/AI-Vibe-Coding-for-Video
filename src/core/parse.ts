// LLM 原始返回 → 结构化分镜模型的解析与校验（TASK-003 / ADR-6）。
// 纯函数、无副作用。解析接受范围：纯 JSON → 首个 fenced ```json``` 块 → 首个平衡 {...} 块；
// 全失败即 BAD_RESPONSE_FORMAT。**不做自由文本猜测、不补全截断 JSON。**
import type {
  Character,
  CharacterFieldKey,
  CharacterProfile,
  GenerationParams,
  GlobalStyle,
  OutputLanguage,
  Project,
  Shot,
  StyleFieldKey,
  StyleProfile,
} from './models';
import { SCHEMA_VERSION } from './config';
import { CHARACTER_FIELD_KEYS, composeAppearance } from './characterProfile';
import { STYLE_FIELD_KEYS } from './styleProfile';

export const SHOTS_MIN = 3;
export const SHOTS_MAX = 10;
/** 数组上界：抵御异常/恶意 LLM 输出导致的内存/CPU 放大（kimi MED）。超出部分丢弃。 */
export const CHARACTERS_MAX = 50;
export const CHAR_REFS_MAX = 20;
/** 每字段候选建议上限（Issue #29 B：2–4 个；超出截断、脏值清洗）。 */
export const CHAR_SUGGESTIONS_MAX = 4;

/** 解析结果：成功给结构化数据，失败只给原因（由调用方转成 BAD_RESPONSE_FORMAT）。 */
export type ParseResult =
  | { ok: true; characters: Character[]; shots: Shot[]; globalStyle?: GlobalStyle }
  | { ok: false; reason: string };

// ---- 解析接受范围（ADR-6(2)）----

/** 提取代码块内容：优先 ```json ... ```（ADR-6 原文），失败再退化到任意 ``` ... ```。 */
function extractFencedJson(text: string): string | null {
  const labeled = text.match(/```json\s*([\s\S]*?)```/i);
  if (labeled) return labeled[1].trim();
  const generic = text.match(/```\s*([\s\S]*?)```/);
  return generic ? generic[1].trim() : null;
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

function cleanStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** 解析结构化档案：逐字段取 string，缺字段补空；全空 → undefined（不挂空档案）。 */
function parseProfile(raw: unknown): CharacterProfile | undefined {
  if (!isObj(raw)) return undefined;
  const profile = {} as CharacterProfile;
  let any = false;
  for (const key of CHARACTER_FIELD_KEYS) {
    const v = cleanStr(raw[key]);
    profile[key] = v;
    if (v) any = true;
  }
  return any ? profile : undefined;
}

/** 解析每字段候选建议：每键取 string[]，去空/去重/截断到上限；空 → 不挂该键。 */
function parseSuggestions(raw: unknown): Partial<Record<CharacterFieldKey, string[]>> | undefined {
  if (!isObj(raw)) return undefined;
  const out: Partial<Record<CharacterFieldKey, string[]>> = {};
  let any = false;
  for (const key of CHARACTER_FIELD_KEYS) {
    const arr = raw[key];
    if (!Array.isArray(arr)) continue;
    const cleaned = Array.from(
      new Set(arr.map(cleanStr).filter((s) => s.length > 0)),
    ).slice(0, CHAR_SUGGESTIONS_MAX);
    if (cleaned.length > 0) {
      out[key] = cleaned;
      any = true;
    }
  }
  return any ? out : undefined;
}

/** 解析全局风格档（Issue #55）：profile 5 字段 + suggestions；全空 → undefined。 */
function parseGlobalStyle(raw: unknown): GlobalStyle | undefined {
  if (!isObj(raw)) return undefined;
  const profileRaw = isObj(raw.profile) ? raw.profile : raw; // 容忍模型直接平铺字段
  const profile = {} as StyleProfile;
  let anyProfile = false;
  for (const key of STYLE_FIELD_KEYS) {
    const v = cleanStr(profileRaw[key]);
    profile[key] = v;
    if (v) anyProfile = true;
  }
  const suggestionsRaw = raw.suggestions;
  const suggestions: Partial<Record<StyleFieldKey, string[]>> = {};
  let anySug = false;
  if (isObj(suggestionsRaw)) {
    for (const key of STYLE_FIELD_KEYS) {
      const arr = suggestionsRaw[key];
      if (!Array.isArray(arr)) continue;
      const cleaned = Array.from(new Set(arr.map(cleanStr).filter((s) => s.length > 0))).slice(
        0,
        CHAR_SUGGESTIONS_MAX,
      );
      if (cleaned.length > 0) {
        suggestions[key] = cleaned;
        anySug = true;
      }
    }
  }
  if (!anyProfile && !anySug) return undefined;
  return { profile, ...(anySug ? { suggestions } : {}), locked: false };
}

/**
 * 解析 + 校验 LLM 原始文本为结构化分镜。归一化：补 id/index/editedByUser，
 * characterRefs 按 name 或序号归一到内部 Character.id，对不上的引用丢弃（ADR-6(3)）。
 */
export function parseStoryboard(raw: string, lang: OutputLanguage = 'zh'): ParseResult {
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

  // characters：可缺省/空数组；name 允许 null（不强行编造）；上限保护。
  // Issue #29：解析结构化 profile/suggestions/seedPhrase；锚点 appearance 取模型值，
  // 缺失则由 profile 合成兜底（按输出语言）；appearance 与 profile 皆空 → 丢弃（无锚点）。
  const characters: Character[] = [];
  const rawChars = (Array.isArray(obj.characters) ? obj.characters : []).slice(0, CHARACTERS_MAX);
  rawChars.forEach((c, i) => {
    if (!isObj(c)) return;
    const name = typeof c.name === 'string' && c.name.trim() ? c.name.trim() : null;
    const profile = parseProfile(c.profile);
    let appearance = cleanStr(c.appearance);
    if (!appearance && profile) appearance = composeAppearance(profile, lang);
    if (!appearance) return; // appearance 与 profile 皆空 → 无锚点，丢弃
    const suggestions = parseSuggestions(c.suggestions);
    const seedPhrase = cleanStr(c.seedPhrase);
    characters.push({
      id: `c${i + 1}`,
      name,
      appearance,
      ...(profile ? { profile } : {}),
      ...(suggestions ? { suggestions } : {}),
      ...(seedPhrase ? { seedPhrase } : {}),
    });
  });

  // characterRefs 归一：name 命中（不分大小写）/ 内部 id（cN）/ 1-based 序号 → Character.id；否则丢弃。
  // 兼容模型常见输出 "c1"/"c2"（Codex LOW：原先只认名字/序号会静默丢弃 cN 引用）。
  const byName = new Map<string, string>();
  const byId = new Set<string>();
  characters.forEach((c) => {
    if (c.name) byName.set(c.name.toLowerCase(), c.id);
    byId.add(c.id);
  });
  const idxToId = (n: number): string | null =>
    Number.isInteger(n) && n >= 1 && n <= characters.length ? characters[n - 1].id : null;
  const resolveRef = (ref: unknown): string | null => {
    if (typeof ref === 'string') {
      const key = ref.trim();
      const hit = byName.get(key.toLowerCase());
      if (hit) return hit;
      if (byId.has(key.toLowerCase())) return key.toLowerCase(); // 直接是内部 id cN
      const cN = key.toLowerCase().match(/^c(\d+)$/); // "c1" → 第 1 个角色
      if (cN) return idxToId(Number(cN[1]));
      return idxToId(Number(key));
    }
    if (typeof ref === 'number') return idxToId(ref);
    return null;
  };

  const shots: Shot[] = [];
  for (let i = 0; i < rawShots.length; i++) {
    const s = rawShots[i];
    if (!isObj(s)) return { ok: false, reason: `镜头 ${i + 1} 不是对象` };
    for (const f of SHOT_FIELDS) {
      if (!nonEmptyStr(s[f])) return { ok: false, reason: `镜头 ${i + 1} 缺字段 ${f}` };
    }
    const refsIn = (Array.isArray(s.characterRefs) ? s.characterRefs : []).slice(0, CHAR_REFS_MAX);
    const characterRefs = Array.from(
      new Set(refsIn.map(resolveRef).filter((x): x is string => x !== null)),
    );
    const promptEn = cleanStr(s.promptEn); // 双语英文版（Issue #41），缺失退化为单语
    shots.push({
      id: `s${i + 1}`,
      index: i + 1,
      summary: (s.summary as string).trim(),
      shotSize: (s.shotSize as string).trim(),
      cameraMovement: (s.cameraMovement as string).trim(),
      durationSuggestion: (s.durationSuggestion as string).trim(),
      prompt: (s.prompt as string).trim(),
      ...(promptEn ? { promptEn } : {}),
      characterRefs,
      editedByUser: false,
    });
  }

  // 注：分镜生成 prompt 不请求 bgm；BGM 由 TASK-007 独立服务生成。此处不解析 bgm。
  // Issue #55：解析全局风格档（缺省兼容）。
  const globalStyle = parseGlobalStyle(obj.globalStyle);
  return { ok: true, characters, shots, ...(globalStyle ? { globalStyle } : {}) };
}

/**
 * 解析 BGM 提示词文本（TASK-007）。先尝试 JSON 取 prompt / bgm.prompt；失败则回退为整段
 * trim 文本（BGM 本就是自由文本，回退安全）；空 → null（调用方转 BAD_RESPONSE_FORMAT）。
 */
export function parseBgmPrompt(raw: string): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const obj = tryParseObject(raw);
  if (isObj(obj)) {
    if (nonEmptyStr(obj.prompt)) return obj.prompt.trim();
    if (isObj(obj.bgm) && nonEmptyStr(obj.bgm.prompt)) return obj.bgm.prompt.trim();
  }
  const text = raw.trim();
  return text.length > 0 ? text : null;
}

/**
 * 解析单字段「重新建议」响应（Issue #29 B）：取 {"suggestions":[...]}（或裸数组），
 * 清洗去空去重、截到上限；空 → null（调用方转 BAD_RESPONSE_FORMAT）。
 */
export function parseFieldSuggestions(raw: string): string[] | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const obj = tryParseObject(raw);
  let arr: unknown[] | null = null;
  if (Array.isArray(obj)) arr = obj;
  else if (isObj(obj) && Array.isArray(obj.suggestions)) arr = obj.suggestions;
  if (!arr) return null;
  const cleaned = Array.from(new Set(arr.map(cleanStr).filter((s) => s.length > 0))).slice(
    0,
    CHAR_SUGGESTIONS_MAX,
  );
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * 解析单镜头重写响应（Issue #30/#32）：复用 SHOT_FIELDS 校验，返回 5 个可读字段或 null
 * （→ BAD_RESPONSE_FORMAT）。不含 id/index/characterRefs（由编排层保留原值）。
 */
export function parseShotRewrite(
  raw: string,
): Pick<
  Shot,
  'summary' | 'shotSize' | 'cameraMovement' | 'durationSuggestion' | 'prompt' | 'promptEn'
> | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const obj = tryParseObject(raw);
  if (!isObj(obj)) return null;
  for (const f of SHOT_FIELDS) {
    if (!nonEmptyStr(obj[f])) return null;
  }
  const promptEn = cleanStr(obj.promptEn); // 双语英文版（Issue #41），可选
  return {
    summary: (obj.summary as string).trim(),
    shotSize: (obj.shotSize as string).trim(),
    cameraMovement: (obj.cameraMovement as string).trim(),
    durationSuggestion: (obj.durationSuggestion as string).trim(),
    prompt: (obj.prompt as string).trim(),
    ...(promptEn ? { promptEn } : {}),
  };
}

/**
 * 解析转场建议（Issue #54）：取 `{note, noteEn?}`（JSON 优先）；无 note 时回退整段文本为 note；
 * 空 → null（调用方转 BAD_RESPONSE_FORMAT）。
 */
export function parseTransition(raw: string): { note: string; noteEn?: string } | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const obj = tryParseObject(raw);
  if (isObj(obj)) {
    const note = cleanStr(obj.note);
    const noteEn = cleanStr(obj.noteEn);
    if (note) return { note, ...(noteEn ? { noteEn } : {}) };
  }
  const text = raw.trim();
  return text.length > 0 ? { note: text } : null;
}

/** 把解析结果组装成完整 Project（供 generation.ts 落库）。 */
export function buildProject(
  story: string,
  params: GenerationParams,
  parsed: { characters: Character[]; shots: Shot[]; globalStyle?: GlobalStyle },
): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    story,
    params,
    characters: parsed.characters,
    shots: parsed.shots,
    ...(parsed.globalStyle ? { globalStyle: parsed.globalStyle } : {}),
  };
}

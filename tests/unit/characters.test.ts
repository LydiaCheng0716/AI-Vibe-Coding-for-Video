import { describe, it, expect } from 'vitest';
import {
  injectCharacterConsistency,
  reinjectCharacterConsistency,
  injectCharactersIntoShot,
  characterAnchorLine,
} from '../../src/core/characters';
import { characterInstruction } from '../../src/prompts/characters';
import { emptyProfile } from '../../src/core/characterProfile';
import type { Character, CharacterProfile, Project, Shot } from '../../src/core/models';
import { defaultParams } from '../../src/core/defaults';

function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: 's1',
    index: 1,
    summary: 's',
    shotSize: '中景',
    cameraMovement: '固定',
    durationSuggestion: '3s',
    prompt: '一个镜头的提示词',
    characterRefs: [],
    editedByUser: false,
    ...over,
  };
}

function project(chars: Character[], shots: Shot[]): Project {
  return { schemaVersion: 1, story: 's', params: defaultParams(), characters: chars, shots };
}

const xiaoming: Character = { id: 'c1', name: '小明', appearance: '红色卫衣的短发男孩' };

describe('injectCharacterConsistency', () => {
  it('引用角色的镜头 prompt 注入该角色 appearance', () => {
    const p = project([xiaoming], [shot({ characterRefs: ['c1'] })]);
    const out = injectCharacterConsistency(p);
    expect(out.shots[0].prompt).toContain('红色卫衣的短发男孩');
    expect(out.shots[0].prompt).toContain('小明');
  });

  it('同一角色跨多镜头 → 各镜头注入相同 appearance', () => {
    const p = project(
      [xiaoming],
      [shot({ id: 's1', characterRefs: ['c1'] }), shot({ id: 's2', index: 2, characterRefs: ['c1'] })],
    );
    const out = injectCharacterConsistency(p);
    expect(out.shots[0].prompt).toContain('红色卫衣的短发男孩');
    expect(out.shots[1].prompt).toContain('红色卫衣的短发男孩');
  });

  it('幂等：已含 appearance 不重复注入；跑两次结果相同', () => {
    const p = project([xiaoming], [shot({ characterRefs: ['c1'] })]);
    const once = injectCharacterConsistency(p);
    const twice = injectCharacterConsistency(once);
    expect(twice.shots[0].prompt).toBe(once.shots[0].prompt);
    // 只出现一次
    expect(once.shots[0].prompt.split('红色卫衣的短发男孩').length - 1).toBe(1);
  });

  it('editedByUser=true 的镜头不被注入/不被改', () => {
    const edited = shot({ characterRefs: ['c1'], editedByUser: true, prompt: '用户手改的提示词' });
    const out = injectCharacterConsistency(project([xiaoming], [edited]));
    expect(out.shots[0].prompt).toBe('用户手改的提示词');
  });

  it('无 characterRefs / 空 characters → 原样', () => {
    expect(injectCharacterConsistency(project([], [shot()])).shots[0].prompt).toBe('一个镜头的提示词');
    expect(injectCharacterConsistency(project([xiaoming], [shot()])).shots[0].prompt).toBe('一个镜头的提示词');
  });

  it('不可变：不修改入参', () => {
    const p = project([xiaoming], [shot({ characterRefs: ['c1'] })]);
    const before = p.shots[0].prompt;
    injectCharacterConsistency(p);
    expect(p.shots[0].prompt).toBe(before);
  });

  it('对不上的 ref 安全跳过', () => {
    const out = injectCharacterConsistency(project([xiaoming], [shot({ characterRefs: ['c999'] })]));
    expect(out.shots[0].prompt).toBe('一个镜头的提示词');
  });

  it('外观作为无关子串出现时仍注入（精确整行判断，无误判，kimi MED-1）', () => {
    const c: Character = { id: 'c1', name: null, appearance: '短发' };
    const s = shot({ characterRefs: ['c1'], prompt: '短发丝在风中飘动' }); // 「短发」是无关子串
    const out = injectCharacterConsistency(project([c], [s]));
    expect(out.shots[0].prompt).toContain('- 角色1：短发'); // 仍注入了精确参考行
  });

  it('外观换行被单行化（kimi LOW-3）', () => {
    const c: Character = { id: 'c1', name: '阿明', appearance: '红衣\n\n短发' };
    const out = injectCharacterConsistency(project([c], [shot({ characterRefs: ['c1'] })]));
    expect(out.shots[0].prompt).toContain('- 阿明：红衣 短发');
  });

  it('outputLanguage=en → 英文表头（kimi LOW-2）', () => {
    const p = project([xiaoming], [shot({ characterRefs: ['c1'] })]);
    p.params.outputLanguage = 'en';
    const out = injectCharacterConsistency(p);
    expect(out.shots[0].prompt).toContain('Character consistency reference:');
  });
});

function profile(over: Partial<CharacterProfile> = {}): CharacterProfile {
  return { ...emptyProfile(), ...over };
}

describe('结构化档案注入（Issue #29 A）', () => {
  const linxia: Character = {
    id: 'c1',
    name: '林夏',
    appearance: '回退用',
    profile: profile({ codename: '林夏', hair: '黑长直', clothing: '红色卫衣' }),
  };

  it('有 profile → 注入锚点逐字含档案字段值（优先 profile 而非 appearance）', () => {
    const out = injectCharacterConsistency(project([linxia], [shot({ characterRefs: ['c1'] })]));
    expect(out.shots[0].prompt).toContain('发型发色:黑长直');
    expect(out.shots[0].prompt).toContain('服装:红色卫衣');
    expect(out.shots[0].prompt).not.toContain('回退用'); // 有 profile 时不用 appearance
  });

  it('无 profile → 回退 appearance（旧用例不回归）', () => {
    const legacy: Character = { id: 'c1', name: '小明', appearance: '红色卫衣的短发男孩' };
    const out = injectCharacterConsistency(project([legacy], [shot({ characterRefs: ['c1'] })]));
    expect(out.shots[0].prompt).toContain('红色卫衣的短发男孩');
  });

  it('profile 全空 → 回退 appearance（防清空档案后丢锚点）', () => {
    const c: Character = { id: 'c1', name: '小红', appearance: '扎马尾的女孩', profile: emptyProfile() };
    const out = injectCharacterConsistency(project([c], [shot({ characterRefs: ['c1'] })]));
    expect(out.shots[0].prompt).toContain('扎马尾的女孩');
  });

  it('characterAnchorLine：单角色权威整行（#30 复用口径）', () => {
    expect(characterAnchorLine(linxia, 'zh')).toContain('- 林夏：');
    expect(characterAnchorLine(linxia, 'zh')).toContain('发型发色:黑长直');
    // 空角色 → null
    expect(characterAnchorLine({ id: 'c9', name: null, appearance: '' }, 'zh')).toBeNull();
  });

  it('injectCharactersIntoShot：可独立用于单个 shot 且幂等（#30 接口）', () => {
    const byId = new Map([['c1', linxia]]);
    const once = injectCharactersIntoShot(shot({ characterRefs: ['c1'] }), byId, 'zh');
    const twice = injectCharactersIntoShot(once, byId, 'zh');
    expect(twice.prompt).toBe(once.prompt); // 幂等
    expect(once.prompt).toContain('发型发色:黑长直');
  });
});

describe('reinjectCharacterConsistency（调校后刷新，Issue #29 C）', () => {
  it('改档案后旧锚点不残留：剥离旧块再注入新值', () => {
    const c1: Character = { id: 'c1', name: '林夏', appearance: '', profile: profile({ hair: '黑长直' }) };
    const injected = injectCharacterConsistency(project([c1], [shot({ characterRefs: ['c1'] })]));
    expect(injected.shots[0].prompt).toContain('发型发色:黑长直');
    // 用户把发型改成「金色短发」并锁定 → 重注入
    const updated: Character = { ...c1, profile: profile({ hair: '金色短发' }), locked: true };
    const re = reinjectCharacterConsistency({ ...injected, characters: [updated] });
    expect(re.shots[0].prompt).toContain('发型发色:金色短发');
    expect(re.shots[0].prompt).not.toContain('黑长直'); // 旧锚点已剥离，不残留
  });

  it('editedByUser 镜头不被剥离/改写', () => {
    const c1: Character = { id: 'c1', name: '林夏', appearance: '', profile: profile({ hair: '黑长直' }) };
    const edited = shot({ characterRefs: ['c1'], editedByUser: true, prompt: '用户手改' });
    const re = reinjectCharacterConsistency(project([c1], [edited]));
    expect(re.shots[0].prompt).toBe('用户手改');
  });
});

describe('characterInstruction（提示词）', () => {
  it('含不编造 / 不臆测敏感属性 / 统一外观', () => {
    const ins = characterInstruction();
    expect(ins).toContain('不要编造');
    expect(ins).toContain('敏感');
    expect(ins).toContain('统一外观');
  });

  it('结构化：含 profile 字段、suggestions(2–4)、seedPhrase（Issue #29）', () => {
    const ins = characterInstruction();
    expect(ins).toContain('profile');
    expect(ins).toContain('代号');
    expect(ins).toContain('气质/表情基调');
    expect(ins).toContain('suggestions');
    expect(ins).toContain('2–4');
    expect(ins).toContain('seedPhrase');
  });
});

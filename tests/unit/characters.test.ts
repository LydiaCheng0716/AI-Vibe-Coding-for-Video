import { describe, it, expect } from 'vitest';
import { injectCharacterConsistency } from '../../src/core/characters';
import { characterInstruction } from '../../src/prompts/characters';
import type { Character, Project, Shot } from '../../src/core/models';
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

describe('characterInstruction（提示词）', () => {
  it('含不编造 / 不臆测敏感属性 / 统一外观', () => {
    const ins = characterInstruction();
    expect(ins).toContain('不要编造');
    expect(ins).toContain('敏感');
    expect(ins).toContain('统一外观');
  });
});

import { describe, it, expect } from 'vitest';
import { parseStoryboard, parseBgmPrompt, parseFieldSuggestions } from '../../src/core/parse';

describe('parseBgmPrompt（TASK-007）', () => {
  it('JSON {prompt} → 取 prompt', () => {
    expect(parseBgmPrompt('{"prompt":"舒缓钢琴曲"}')).toBe('舒缓钢琴曲');
  });
  it('JSON {bgm:{prompt}} → 取 bgm.prompt', () => {
    expect(parseBgmPrompt('{"bgm":{"prompt":"电子节奏"}}')).toBe('电子节奏');
  });
  it('fenced JSON 也能解析', () => {
    expect(parseBgmPrompt('```json\n{"prompt":"轻快民谣"}\n```')).toBe('轻快民谣');
  });
  it('非 JSON 纯文本 → 回退为整段文本', () => {
    expect(parseBgmPrompt('  一段温暖的弦乐  ')).toBe('一段温暖的弦乐');
  });
  it('空 → null', () => {
    expect(parseBgmPrompt('')).toBeNull();
    expect(parseBgmPrompt('   ')).toBeNull();
  });
});

function shot(over: Partial<Record<string, unknown>> = {}) {
  return {
    summary: '日出',
    shotSize: '远景',
    cameraMovement: '推',
    durationSuggestion: '3s',
    prompt: '正向... 负面...',
    ...over,
  };
}
const threeShots = [shot(), shot({ summary: 's2' }), shot({ summary: 's3' })];

describe('parseStoryboard: 结构化角色卡（Issue #29）', () => {
  it('解析 profile / suggestions(截 2–4) / seedPhrase', () => {
    const raw = JSON.stringify({
      characters: [
        {
          name: '林夏',
          profile: { codename: '林夏', hair: '黑长直', clothing: '红色卫衣' },
          suggestions: { ageRange: ['18–24', '25–34', '', '18–24'], hair: ['黑长直', '高马尾', '短发', '波浪卷', '丸子头'] },
          seedPhrase: 'asian girl, long black hair, red hoodie',
        },
      ],
      shots: threeShots,
    });
    const r = parseStoryboard(raw, 'zh');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.characters[0];
    expect(c.profile?.hair).toBe('黑长直');
    expect(c.suggestions?.ageRange).toEqual(['18–24', '25–34']); // 去空去重
    expect(c.suggestions?.hair).toHaveLength(4); // 截到上限 4
    expect(c.seedPhrase).toBe('asian girl, long black hair, red hoodie');
    expect(c.appearance).toContain('黑长直'); // appearance 缺失 → 由 profile 合成兜底
  });

  it('仅 appearance 的老格式照常解析（向后兼容）', () => {
    const raw = JSON.stringify({
      characters: [{ name: '小明', appearance: '红色卫衣的短发男孩' }],
      shots: threeShots,
    });
    const r = parseStoryboard(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.characters[0].appearance).toBe('红色卫衣的短发男孩');
      expect(r.characters[0].profile).toBeUndefined();
    }
  });

  it('appearance 与 profile 皆空 → 丢弃该角色', () => {
    const raw = JSON.stringify({
      characters: [{ name: '幽灵', profile: {} }],
      shots: threeShots,
    });
    const r = parseStoryboard(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.characters).toHaveLength(0);
  });
});

describe('parseFieldSuggestions（Issue #29 B）', () => {
  it('{"suggestions":[...]} → 清洗去空去重截断', () => {
    expect(parseFieldSuggestions('{"suggestions":["高马尾","短发","","高马尾","长直发","波浪","丸子"]}')).toEqual([
      '高马尾',
      '短发',
      '长直发',
      '波浪',
    ]);
  });
  it('裸数组也接受', () => {
    expect(parseFieldSuggestions('["18–24","25–34"]')).toEqual(['18–24', '25–34']);
  });
  it('fenced / 前后带文本也能提取', () => {
    expect(parseFieldSuggestions('建议如下：\n```json\n{"suggestions":["a","b"]}\n```')).toEqual(['a', 'b']);
  });
  it('空 / 无候选 → null', () => {
    expect(parseFieldSuggestions('')).toBeNull();
    expect(parseFieldSuggestions('{"suggestions":[]}')).toBeNull();
    expect(parseFieldSuggestions('抱歉')).toBeNull();
  });
});

describe('parseStoryboard: 解析接受范围（ADR-6(2)）', () => {
  it('纯 JSON 直接解析', () => {
    const r = parseStoryboard(JSON.stringify({ shots: threeShots }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.shots).toHaveLength(3);
  });

  it('fenced ```json``` 代码块', () => {
    const raw = '好的，这是结果：\n```json\n' + JSON.stringify({ shots: threeShots }) + '\n```';
    const r = parseStoryboard(raw);
    expect(r.ok).toBe(true);
  });

  it('前后带解释文本 → 提取首个平衡 {...} 块', () => {
    const raw = '当然可以！' + JSON.stringify({ shots: threeShots }) + ' 希望有帮助。';
    const r = parseStoryboard(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.shots).toHaveLength(3);
  });

  it('截断 JSON 不补全 → 失败', () => {
    const raw = '{ "shots": [ { "summary": "未闭合';
    const r = parseStoryboard(raw);
    expect(r.ok).toBe(false);
  });

  it('空字符串 → 失败', () => {
    expect(parseStoryboard('').ok).toBe(false);
    expect(parseStoryboard('   ').ok).toBe(false);
  });
});

describe('parseStoryboard: 镜头校验（ADR-6(3)）', () => {
  it('镜头数 < 3 → 失败', () => {
    expect(parseStoryboard(JSON.stringify({ shots: [shot(), shot()] })).ok).toBe(false);
  });

  it('镜头数 > 10 → 失败', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => shot({ summary: `s${i}` }));
    expect(parseStoryboard(JSON.stringify({ shots: eleven })).ok).toBe(false);
  });

  it('任一字段缺失/空白 → 失败', () => {
    const bad = [shot(), shot(), shot({ cameraMovement: '   ' })];
    expect(parseStoryboard(JSON.stringify({ shots: bad })).ok).toBe(false);
    const missing = [shot(), shot(), shot({ prompt: undefined })];
    expect(parseStoryboard(JSON.stringify({ shots: missing })).ok).toBe(false);
  });

  it('shots 不是数组 → 失败', () => {
    expect(parseStoryboard(JSON.stringify({ shots: 'x' })).ok).toBe(false);
  });

  it('归一化补 id/index/editedByUser', () => {
    const r = parseStoryboard(JSON.stringify({ shots: threeShots }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.shots[0]).toMatchObject({ id: 's1', index: 1, editedByUser: false });
      expect(r.shots[2].index).toBe(3);
    }
  });
});

describe('parseStoryboard: 角色与 characterRefs', () => {
  it('无 characters → 空数组合法（不编造）', () => {
    const r = parseStoryboard(JSON.stringify({ shots: threeShots }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.characters).toEqual([]);
  });

  it('characterRefs 按 name 归一到内部 id', () => {
    const raw = JSON.stringify({
      characters: [{ name: '小明', appearance: '红衣男孩' }],
      shots: [shot({ characterRefs: ['小明'] }), shot(), shot()],
    });
    const r = parseStoryboard(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.characters[0].id).toBe('c1');
      expect(r.shots[0].characterRefs).toEqual(['c1']);
    }
  });

  it('characterRefs 按 1-based 序号归一', () => {
    const raw = JSON.stringify({
      characters: [{ name: null, appearance: '一只猫' }],
      shots: [shot({ characterRefs: [1] }), shot(), shot()],
    });
    const r = parseStoryboard(raw);
    if (r.ok) expect(r.shots[0].characterRefs).toEqual(['c1']);
  });

  it('characterRefs 兼容 "cN" 内部 id 形式（Codex LOW）', () => {
    const raw = JSON.stringify({
      characters: [
        { name: '甲', appearance: 'a' },
        { name: '乙', appearance: 'b' },
      ],
      shots: [shot({ characterRefs: ['c2'] }), shot(), shot()],
    });
    const r = parseStoryboard(raw);
    if (r.ok) expect(r.shots[0].characterRefs).toEqual(['c2']);
  });

  it('对不上的 characterRefs 丢弃而非报错', () => {
    const raw = JSON.stringify({
      characters: [{ name: '小明', appearance: '红衣' }],
      shots: [shot({ characterRefs: ['路人甲', '小明', '99'] }), shot(), shot()],
    });
    const r = parseStoryboard(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.shots[0].characterRefs).toEqual(['c1']);
  });

  it('characters 超上界（50）被截断', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ name: `n${i}`, appearance: `a${i}` }));
    const r = parseStoryboard(JSON.stringify({ characters: many, shots: threeShots }));
    if (r.ok) expect(r.characters.length).toBe(50);
  });

  it('单镜头 characterRefs 超上界（20）被截断', () => {
    const chars = Array.from({ length: 30 }, (_, i) => ({ name: `n${i}`, appearance: `a${i}` }));
    const refs = Array.from({ length: 30 }, (_, i) => `n${i}`);
    const r = parseStoryboard(
      JSON.stringify({ characters: chars, shots: [shot({ characterRefs: refs }), shot(), shot()] }),
    );
    // 取前 20 个 ref，去重后归一；上界保证不超过 20
    if (r.ok) expect(r.shots[0].characterRefs.length).toBeLessThanOrEqual(20);
  });

  it('appearance 空的角色被丢弃', () => {
    const raw = JSON.stringify({
      characters: [{ name: '空', appearance: '   ' }],
      shots: threeShots,
    });
    const r = parseStoryboard(raw);
    if (r.ok) expect(r.characters).toEqual([]);
  });
});

describe('parseStoryboard: 全局风格（Issue #55）', () => {
  it('解析 globalStyle profile + suggestions', () => {
    const raw = JSON.stringify({
      globalStyle: {
        profile: { colorGrade: '暖金', lighting: '柔和侧光', lensFocal: '', filmTexture: '', mood: '治愈' },
        suggestions: { lensFocal: ['35mm', '50mm', '85mm'] },
      },
      shots: threeShots,
    });
    const r = parseStoryboard(raw, 'zh');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.globalStyle?.profile.colorGrade).toBe('暖金');
      expect(r.globalStyle?.suggestions?.lensFocal).toEqual(['35mm', '50mm', '85mm']);
      expect(r.globalStyle?.locked).toBe(false); // 默认未锁
    }
  });
  it('缺 globalStyle → undefined（向后兼容）', () => {
    const r = parseStoryboard(JSON.stringify({ shots: threeShots }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.globalStyle).toBeUndefined();
  });
})

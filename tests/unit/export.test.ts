import { describe, it, expect } from 'vitest';
import { exportProject } from '../../src/core/export';
import { defaultParams } from '../../src/core/defaults';
import type { Project, Shot, Character, BgmPrompt } from '../../src/core/models';

function mkShot(i: number, over: Partial<Shot> = {}): Shot {
  return {
    id: `s${i}`,
    index: i,
    summary: `概要${i}`,
    shotSize: '中景',
    cameraMovement: '推',
    durationSuggestion: '3s',
    prompt: `提示词${i}`,
    characterRefs: [],
    editedByUser: false,
    ...over,
  };
}

function mkProject(over: Partial<Project> = {}): Project {
  return {
    schemaVersion: 1,
    story: '一个测试故事',
    params: defaultParams(),
    characters: [{ id: 'c1', name: '小明', appearance: '红衣男孩' } as Character],
    shots: [mkShot(1), mkShot(2), mkShot(3)],
    ...over,
  };
}

describe('exportProject: 空结果', () => {
  it('null project → NOTHING_TO_EXPORT', () => {
    const r = exportProject(null, 'json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOTHING_TO_EXPORT');
  });
  it('无 shots → NOTHING_TO_EXPORT', () => {
    const r = exportProject(mkProject({ shots: [] }), 'markdown');
    if (!r.ok) expect(r.error.code).toBe('NOTHING_TO_EXPORT');
  });
});

describe('exportProject: JSON', () => {
  it('可被 JSON.parse 回结构，含稳定字段', () => {
    const r = exportProject(mkProject(), 'json');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const obj = JSON.parse(r.data);
      expect(obj.story).toBe('一个测试故事');
      expect(obj.shots).toHaveLength(3);
      expect(obj.characters[0].appearance).toBe('红衣男孩');
      expect(obj.bgm).toBeUndefined();
    }
  });
  it('有 bgm 时含 bgm', () => {
    const bgm: BgmPrompt = { prompt: '舒缓钢琴', language: 'zh' };
    const r = exportProject(mkProject({ bgm }), 'json');
    if (r.ok) expect(JSON.parse(r.data).bgm.prompt).toBe('舒缓钢琴');
  });
});

describe('exportProject: Markdown', () => {
  it('含每镜头概要/景别/运镜/时长/提示词 + 角色', () => {
    const r = exportProject(mkProject(), 'markdown');
    if (r.ok) {
      expect(r.data).toContain('镜头 1：概要1');
      expect(r.data).toContain('景别：中景');
      expect(r.data).toContain('提示词1');
      expect(r.data).toContain('红衣男孩');
    }
  });
  it('有 BGM 含 BGM 段', () => {
    const r = exportProject(mkProject({ bgm: { prompt: '电子节奏', language: 'zh' } }), 'markdown');
    if (r.ok) {
      expect(r.data).toContain('BGM 提示词');
      expect(r.data).toContain('电子节奏');
    }
  });
});

describe('exportProject: 纯文本 + 编辑后内容 + 隐私', () => {
  it('纯文本含所有镜头提示词', () => {
    const r = exportProject(mkProject(), 'plaintext');
    if (r.ok) {
      expect(r.data).toContain('提示词1');
      expect(r.data).toContain('提示词3');
    }
  });
  it('编辑后的镜头导出含最新内容', () => {
    const edited = mkProject({ shots: [mkShot(1, { prompt: '用户改过的内容', editedByUser: true }), mkShot(2), mkShot(3)] });
    const r = exportProject(edited, 'markdown');
    if (r.ok) expect(r.data).toContain('用户改过的内容');
  });
  it('导出不含 Key/凭据字段名（ARCH-LOW-002）', () => {
    for (const f of ['json', 'markdown', 'plaintext'] as const) {
      const r = exportProject(mkProject(), f);
      if (r.ok) {
        expect(r.data).not.toContain('apiKey');
        expect(r.data).not.toContain('baseUrl');
        expect(r.data).not.toContain('grantedOrigins');
      }
    }
  });

  it('JSON 顶层字段白名单（防未来新增字段误泄露，kimi LOW）', () => {
    const r = exportProject(mkProject({ bgm: { prompt: 'p', language: 'zh' } }), 'json');
    if (r.ok) {
      const keys = Object.keys(JSON.parse(r.data)).sort();
      expect(keys).toEqual(['bgm', 'characters', 'params', 'schemaVersion', 'shots', 'story']);
    }
  });

  it('Markdown 对含反引号的 prompt 用更长围栏（kimi LOW）', () => {
    const p = mkProject({ shots: [mkShot(1, { prompt: '含```代码块的提示词' }), mkShot(2), mkShot(3)] });
    const r = exportProject(p, 'markdown');
    if (r.ok) {
      expect(r.data).toContain('````'); // 至少 4 个反引号围栏
      expect(r.data).toContain('含```代码块的提示词');
    }
  });
});

describe('exportProject: CSV / platform（Issue #34）', () => {
  it('CSV：表头 + 每镜头一行', () => {
    const r = exportProject(mkProject(), 'csv');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const lines = r.data.trim().split('\r\n');
      expect(lines[0]).toBe('镜头,景别,运镜,时长,提示词');
      expect(lines).toHaveLength(4); // 表头 + 3 镜头
      expect(lines[1]).toContain('提示词1');
    }
  });

  it('CSV：含逗号/引号/换行的提示词正确转义', () => {
    const p = mkProject({ shots: [mkShot(1, { prompt: 'a,b "q"\n换行' }), mkShot(2), mkShot(3)] });
    const r = exportProject(p, 'csv');
    if (r.ok) expect(r.data).toContain('"a,b ""q""\n换行"');
  });

  it('CSV：双语项目含英文列；单语不含', () => {
    const bi = mkProject({ shots: [mkShot(1, { promptEn: 'EN1' }), mkShot(2), mkShot(3)] });
    const rb = exportProject(bi, 'csv');
    if (rb.ok) {
      expect(rb.data.split('\r\n')[0]).toContain('英文提示词');
      expect(rb.data).toContain('EN1');
    }
    const rs = exportProject(mkProject(), 'csv');
    if (rs.ok) expect(rs.data.split('\r\n')[0]).not.toContain('英文提示词');
  });

  it('platform：含各镜头号 + 提示词；双语 both 出中英', () => {
    const bi = mkProject({ shots: [mkShot(1, { promptEn: 'EN1' }), mkShot(2), mkShot(3)] });
    const r = exportProject(bi, 'platform', 'both');
    if (r.ok) {
      expect(r.data).toContain('【镜头 1】');
      expect(r.data).toContain('提示词1');
      expect(r.data).toContain('EN1');
    }
  });

  it('platform：promptLang=en 仅英文', () => {
    const bi = mkProject({ shots: [mkShot(1, { promptEn: 'EN1' }), mkShot(2, { promptEn: 'EN2' }), mkShot(3, { promptEn: 'EN3' })] });
    const r = exportProject(bi, 'platform', 'en');
    if (r.ok) {
      expect(r.data).toContain('EN1');
      expect(r.data).not.toContain('提示词1');
    }
  });

  it('空项目 → NOTHING_TO_EXPORT（csv/platform）', () => {
    expect(exportProject(mkProject({ shots: [] }), 'csv').ok).toBe(false);
    expect(exportProject(null, 'platform').ok).toBe(false);
  });
})

describe('exportProject: CSV 公式注入防护（Codex P2）', () => {
  it('以 = + - @ 开头的提示词被加单引号中和', () => {
    const p = mkProject({
      shots: [
        mkShot(1, { prompt: '=SUM(A1:A9)' }),
        mkShot(2, { prompt: '+1+2' }),
        mkShot(3, { prompt: '@cmd' }),
      ],
    });
    const r = exportProject(p, 'csv');
    if (r.ok) {
      expect(r.data).toContain("'=SUM(A1:A9)");
      expect(r.data).toContain("'+1+2");
      expect(r.data).toContain("'@cmd");
    }
  });
})

describe('exportProject: 转场（Issue #54）', () => {
  it('Markdown/纯文本在镜头间含转场行', () => {
    const p = mkProject({
      shots: [
        mkShot(1, { transitionToNext: { type: 'dissolve', note: '叠化承接' } }),
        mkShot(2),
        mkShot(3),
      ],
    });
    const md = exportProject(p, 'markdown');
    if (md.ok) {
      expect(md.data).toContain('叠化');
      expect(md.data).toContain('叠化承接');
    }
    const txt = exportProject(p, 'plaintext');
    if (txt.ok) expect(txt.data).toContain('叠化承接');
  });
  it('CSV 含转场列', () => {
    const p = mkProject({ shots: [mkShot(1, { transitionToNext: { type: 'cut', note: '硬切' } }), mkShot(2), mkShot(3)] });
    const r = exportProject(p, 'csv');
    if (r.ok) {
      expect(r.data.split('\r\n')[0]).toContain('转场(至下一镜)');
      expect(r.data).toContain('硬切');
    }
  });
  it('JSON 含 transitionToNext', () => {
    const p = mkProject({ shots: [mkShot(1, { transitionToNext: { type: 'whip', note: '甩' } }), mkShot(2), mkShot(3)] });
    const r = exportProject(p, 'json');
    if (r.ok) expect(r.data).toContain('transitionToNext');
  });
})

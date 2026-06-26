import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../../src/core/config';
import { defaultParams } from '../../src/core/defaults';
import { normalizeProject, registerMigration, unregisterMigration } from '../../src/core/migrations';

describe('normalizeProject', () => {
  it('补齐旧格式缺字段且不丢已有字段', () => {
    const got = normalizeProject({
      story: '旧故事',
      params: { outputLanguage: 'en' },
      customField: 'keep',
    });

    expect(got).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      story: '旧故事',
      params: { ...defaultParams(), outputLanguage: 'en' },
      characters: [],
      shots: [],
      customField: 'keep',
    });
  });

  it('非对象、数组、null 返回 null', () => {
    expect(normalizeProject(null)).toBeNull();
    expect(normalizeProject('x')).toBeNull();
    expect(normalizeProject([])).toBeNull();
  });

  it('schemaVersion 缺失视为 0 并归一到当前版本', () => {
    const got = normalizeProject({ story: '无版本旧项目' });

    expect(got?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(got?.story).toBe('无版本旧项目');
  });

  it('按起始版本逐级执行迁移函数', () => {
    registerMigration(0, (project) => ({ ...project, story: `${project.story ?? ''}-migrated` }));

    try {
      const got = normalizeProject({ schemaVersion: 0, story: 'v0' });

      expect(got?.schemaVersion).toBe(SCHEMA_VERSION);
      expect(got?.story).toBe('v0-migrated');
    } finally {
      unregisterMigration(0);
    }
  });

  it('重复注册同版本迁移会抛错（防静默覆盖）', () => {
    registerMigration(0, (p) => p);
    try {
      expect(() => registerMigration(0, (p) => p)).toThrow();
    } finally {
      unregisterMigration(0);
    }
  });

  it('过滤 characters/shots 中的非对象脏项', () => {
    const got = normalizeProject({
      story: 's',
      characters: [{ id: 'c1' }, null, 'bad', 42],
      shots: ['x', { id: 's1' }],
    });
    expect(got?.characters).toEqual([{ id: 'c1' }]);
    expect(got?.shots).toEqual([{ id: 's1' }]);
  });

  it('未来版本号不降级', () => {
    const future = SCHEMA_VERSION + 10;
    const got = normalizeProject({
      schemaVersion: future,
      story: '未来项目',
      params: { videoModel: 'sora' },
      characters: [],
      shots: [],
    });

    expect(got?.schemaVersion).toBe(future);
    expect(got?.params.videoModel).toBe('sora');
  });
});

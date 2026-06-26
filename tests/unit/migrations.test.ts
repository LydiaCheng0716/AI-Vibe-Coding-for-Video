import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../../src/core/config';
import { defaultParams } from '../../src/core/defaults';
import { migrations, normalizeProject } from '../../src/core/migrations';

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
    migrations[0] = (project) => ({ ...project, story: `${project.story ?? ''}-migrated` });

    try {
      const got = normalizeProject({ schemaVersion: 0, story: 'v0' });

      expect(got?.schemaVersion).toBe(SCHEMA_VERSION);
      expect(got?.story).toBe('v0-migrated');
    } finally {
      delete migrations[0];
    }
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

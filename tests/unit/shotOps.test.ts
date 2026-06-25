import { describe, it, expect } from 'vitest';
import {
  reindexShots,
  nextShotId,
  makeBlankShot,
  deleteShotById,
  insertShotAt,
  moveShot,
} from '../../src/core/shotOps';
import type { Shot } from '../../src/core/models';

function mk(id: string, index: number): Shot {
  return {
    id,
    index,
    summary: `s${index}`,
    shotSize: '中景',
    cameraMovement: '固定',
    durationSuggestion: '3s',
    prompt: `p-${id}`,
    characterRefs: [],
    editedByUser: false,
  };
}
const three = [mk('s1', 1), mk('s2', 2), mk('s3', 3)];

describe('shotOps', () => {
  it('reindexShots：index 连续 1..N', () => {
    const out = reindexShots([mk('s3', 9), mk('s1', 4)]);
    expect(out.map((s) => s.index)).toEqual([1, 2]);
  });

  it('nextShotId 不冲突', () => {
    expect(nextShotId(three)).toBe('s4');
    expect(nextShotId([mk('s2', 1), mk('s5', 2)])).toBe('s6');
  });

  it('makeBlankShot：新 id、空 prompt', () => {
    const b = makeBlankShot(three);
    expect(b.id).toBe('s4');
    expect(b.prompt).toBe('');
  });

  it('deleteShotById：删除并重排', () => {
    const out = deleteShotById(three, 's2');
    expect(out.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(out.map((s) => s.index)).toEqual([1, 2]);
  });

  it('insertShotAt：在中间插入并重排', () => {
    const b = makeBlankShot(three);
    const out = insertShotAt(three, 1, b);
    expect(out.map((s) => s.id)).toEqual(['s1', 's4', 's2', 's3']);
    expect(out.map((s) => s.index)).toEqual([1, 2, 3, 4]);
  });

  it('insertShotAt：越界 index 收敛到首/尾', () => {
    const b = makeBlankShot(three);
    expect(insertShotAt(three, -5, b)[0].id).toBe('s4');
    expect(insertShotAt(three, 99, b)[3].id).toBe('s4');
  });

  it('moveShot：移动并重排序号', () => {
    const out = moveShot(three, 's1', 2); // s1 → 末尾
    expect(out.map((s) => s.id)).toEqual(['s2', 's3', 's1']);
    expect(out.map((s) => s.index)).toEqual([1, 2, 3]);
  });

  it('moveShot：未知 id → 原样', () => {
    expect(moveShot(three, 'sX', 0)).toEqual(three);
  });
});

// 镜头列表编排的纯函数（Issue #56）：增/删/插/移 + 重排序号。不可变、可测。
// Issue #54：结构操作会改变相邻关系，故清掉「后继变了」的镜头的 transitionToNext（转场不错配新邻居）。
import type { Shot } from './models';

/** 某镜后继 id（无后继 → null）。 */
function succId(shots: Shot[], i: number): string | null {
  return i + 1 < shots.length ? shots[i + 1].id : null;
}

/**
 * 清理失配转场（Issue #54）：对比结构变更前后，若某镜「后继 id」变了，清掉其 transitionToNext。
 * 后继未变的镜头保留转场。供 delete/insert/move 复用。
 */
export function clearStaleTransitions(before: Shot[], after: Shot[]): Shot[] {
  const beforeSucc = new Map<string, string | null>();
  before.forEach((s, i) => beforeSucc.set(s.id, succId(before, i)));
  return after.map((s, i) => {
    if (!s.transitionToNext) return s;
    if (beforeSucc.get(s.id) === succId(after, i)) return s;
    const { transitionToNext: _drop, ...rest } = s;
    return rest;
  });
}

/** 按数组顺序重排 index = 1..N。 */
export function reindexShots(shots: Shot[]): Shot[] {
  return shots.map((s, i) => (s.index === i + 1 ? s : { ...s, index: i + 1 }));
}

/** 计算不冲突的镜头 id（s{N}）。 */
export function nextShotId(shots: Shot[]): string {
  let max = 0;
  for (const s of shots) {
    const m = s.id.match(/^s(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `s${max + 1}`;
}

/** 空白镜头（待填写或即时生成填充）。 */
export function makeBlankShot(shots: Shot[]): Shot {
  return {
    id: nextShotId(shots),
    index: shots.length + 1,
    summary: '新镜头',
    shotSize: '中景',
    cameraMovement: '固定',
    durationSuggestion: '3s',
    prompt: '',
    characterRefs: [],
    editedByUser: false,
  };
}

/** 删除指定镜头并重排序号（清失配转场）。 */
export function deleteShotById(shots: Shot[], shotId: string): Shot[] {
  return clearStaleTransitions(shots, reindexShots(shots.filter((s) => s.id !== shotId)));
}

/** 在数组位置 index（0..N，越界收敛）插入镜头并重排序号（清失配转场）。 */
export function insertShotAt(shots: Shot[], index: number, shot: Shot): Shot[] {
  const i = Math.max(0, Math.min(index, shots.length));
  return clearStaleTransitions(shots, reindexShots([...shots.slice(0, i), shot, ...shots.slice(i)]));
}

/** 把某镜头移动到数组位置 toIndex（0..N-1，越界收敛）并重排序号（清失配转场）。 */
export function moveShot(shots: Shot[], shotId: string, toIndex: number): Shot[] {
  const from = shots.findIndex((s) => s.id === shotId);
  if (from < 0) return shots;
  const arr = [...shots];
  const [moved] = arr.splice(from, 1);
  const i = Math.max(0, Math.min(toIndex, arr.length));
  arr.splice(i, 0, moved);
  return clearStaleTransitions(shots, reindexShots(arr));
}

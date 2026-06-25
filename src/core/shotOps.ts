// 镜头列表编排的纯函数（Issue #56）：增/删/插/移 + 重排序号。不可变、可测。
import type { Shot } from './models';

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

/** 删除指定镜头并重排序号。 */
export function deleteShotById(shots: Shot[], shotId: string): Shot[] {
  return reindexShots(shots.filter((s) => s.id !== shotId));
}

/** 在数组位置 index（0..N，越界收敛）插入镜头并重排序号。 */
export function insertShotAt(shots: Shot[], index: number, shot: Shot): Shot[] {
  const i = Math.max(0, Math.min(index, shots.length));
  return reindexShots([...shots.slice(0, i), shot, ...shots.slice(i)]);
}

/** 把某镜头移动到数组位置 toIndex（0..N-1，越界收敛）并重排序号。 */
export function moveShot(shots: Shot[], shotId: string, toIndex: number): Shot[] {
  const from = shots.findIndex((s) => s.id === shotId);
  if (from < 0) return shots;
  const arr = [...shots];
  const [moved] = arr.splice(from, 1);
  const i = Math.max(0, Math.min(toIndex, arr.length));
  arr.splice(i, 0, moved);
  return reindexShots(arr);
}

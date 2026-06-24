// 全局 LLM 锁（ADR-3 / ARCH-MED-004 / TASK-009）。并发=1：分镜与 BGM 生成共享同一把锁，
// 任一进行中时，所有生成入口都应禁用并显示加载态，新点击被拒（GENERATION_IN_PROGRESS）。
// 模块级单例：整个扩展上下文唯一。
import { err, type Result } from '../core/models';

let busy = false;
const listeners = new Set<(busy: boolean) => void>();

/** 当前是否有 LLM 生成进行中（= 全局加载态）。 */
export function isLlmBusy(): boolean {
  return busy;
}

/** 订阅加载态变化（UI 据此禁用按钮/显示加载）。返回取消订阅函数。 */
export function subscribeLlmBusy(cb: (busy: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function setBusy(next: boolean): void {
  if (busy === next) return;
  busy = next;
  for (const cb of listeners) cb(busy);
}

/**
 * 持锁执行 fn。若已被占用 → 立即返回 GENERATION_IN_PROGRESS（拒绝而非排队，防重复提交）。
 * 占用期间置加载态；fn 抛错也在 finally 复位。
 */
export async function withLlmLock<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  if (busy) {
    return err('GENERATION_IN_PROGRESS', '正在生成中，请等当前任务完成后再试。');
  }
  setBusy(true);
  try {
    return await fn();
  } finally {
    setBusy(false);
  }
}

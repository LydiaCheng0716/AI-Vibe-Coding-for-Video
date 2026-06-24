// 全局 LLM 锁（ADR-3 / ARCH-MED-004 / TASK-009）。并发=1：分镜与 BGM 生成共享同一把锁，
// 任一进行中时，所有生成入口都应禁用并显示加载态，新点击被拒（GENERATION_IN_PROGRESS）。
// 模块级单例：在当前 JS 上下文（side panel）内全局。MV3 的 background/popup 是独立模块实例、
// 不共享此锁；目前只有 side panel 发起生成，故无影响（kimi LOW）。
import { err, type Result } from '../core/models';

let busy = false;
const listeners = new Set<(busy: boolean) => void>();

/** 当前是否有 LLM 生成进行中（= 全局加载态）。 */
export function isLlmBusy(): boolean {
  return busy;
}

/** 订阅加载态变化（UI 据此禁用按钮/显示加载）。订阅时同步当前态；返回取消订阅函数。 */
export function subscribeLlmBusy(cb: (busy: boolean) => void): () => void {
  listeners.add(cb);
  safeNotify(cb); // 同步初始态：避免生成进行中才 mount 的 UI 错过 busy=true（kimi MED）
  return () => listeners.delete(cb);
}

function safeNotify(cb: (busy: boolean) => void): void {
  // 隔离订阅者异常：任一回调抛错都不得阻断通知或卡住锁（kimi MED）。
  try {
    cb(busy);
  } catch {
    /* 订阅者自负其责，不阻断 */
  }
}

function setBusy(next: boolean): void {
  if (busy === next) return;
  busy = next;
  for (const cb of listeners) safeNotify(cb);
}

/**
 * 持锁执行 fn。若已被占用 → 立即返回 GENERATION_IN_PROGRESS（拒绝而非排队，防重复提交）。
 * 占用期间置加载态；fn 抛错也在 finally 复位。
 */
export async function withLlmLock<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  if (busy) {
    return err('GENERATION_IN_PROGRESS', '正在生成中，请等当前任务完成后再试。');
  }
  try {
    setBusy(true);
    return await fn();
  } finally {
    setBusy(false);
  }
}

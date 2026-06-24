// 剪贴板复制（api-spec §3.6 / TASK-006、007）。失败返回 CLIPBOARD_FAILED，UI 提示且保留内容，
// 不静默失败。侧边栏是安全上下文，通常 navigator.clipboard 可用。
import { ok, err, type Result } from '../core/models';

export async function copyToClipboard(text: string): Promise<Result<void>> {
  const clip = (globalThis as { navigator?: Navigator }).navigator?.clipboard;
  if (!clip?.writeText) {
    return err('CLIPBOARD_FAILED', '复制失败：当前环境不支持剪贴板，请手动选择复制。');
  }
  try {
    await clip.writeText(text);
    return ok(undefined);
  } catch {
    return err('CLIPBOARD_FAILED', '复制失败，请重试或手动选择复制。');
  }
}

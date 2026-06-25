// Token 估算与成本提示（Issue #36）。纯函数、集中维护。粗略量级、仅供参考（非精确计费）：
// provider 当前不回传 usage，故用启发式；将来接真实 usage 只需替换本文件实现。
import type { Project } from './models';

// 中日韩统一表意文字 + 假名（CJK 约 1 token/字）。
const CJK = /[㐀-鿿豈-﫿぀-ヿ가-힯]/;

/** prompt 模板固定开销（system 指令 + 模板 + JSON 外壳）的粗略 token 估计。 */
export const PROMPT_OVERHEAD_TOKENS = 500;
/** 超长故事告警阈值（输入 token 估计）。 */
export const LONG_STORY_TOKENS = 1500;

/** 估算文本 token：CJK 约 1 token/字，其余约 4 字符/token。 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (CJK.test(ch)) cjk++;
    else other++;
  }
  return cjk + Math.ceil(other / 4);
}

/** 估算本次生成的输入/输出 token（仅供参考）。 */
export function estimateProjectTokens(
  story: string,
  project: Project,
): { input: number; output: number } {
  const input = estimateTokens(story) + PROMPT_OVERHEAD_TOKENS;
  const outputText = [
    ...project.shots.flatMap((s) => [
      s.summary,
      s.shotSize,
      s.cameraMovement,
      s.durationSuggestion,
      s.prompt,
      s.promptEn ?? '',
    ]),
    ...project.characters.map((c) => c.appearance),
    project.bgm?.prompt ?? '',
  ].join(' ');
  return { input, output: estimateTokens(outputText) };
}

/** 超长故事告警：输入估计超阈值 → 提示可能被输出长度上限截断、建议分批。否则 null。 */
export function longStoryWarning(story: string): string | null {
  return estimateTokens(story) > LONG_STORY_TOKENS
    ? '故事较长，分镜输出可能受模型长度上限（max_tokens）截断，建议精简或分批生成。'
    : null;
}

// 轻量翻译 prompt（Issue #53）：把提示词文本忠实翻译到目标语言，只输出译文。
export function buildTranslatePrompt(
  text: string,
  targetLang: 'zh' | 'en',
): { system: string; user: string } {
  const label = targetLang === 'en' ? 'English' : '简体中文';
  const system = [
    `把用户给的视频/图像提示词忠实翻译成 ${label}。`,
    '保留专业术语、画面与风格描述、负面提示词等含义；不要增删内容。',
    '只输出译文本身，不要任何解释、不要加引号、不要附带原文。',
  ].join('\n');
  return { system, user: text };
}

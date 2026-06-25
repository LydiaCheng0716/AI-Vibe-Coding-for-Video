// 转场建议 prompt（Issue #54）。基于前后两镜内容 + 类型，生成承接动作/视线/构图/节奏的说明。
import type { OutputLanguage, Shot } from '../core/models';
import { transitionLabel } from '../core/transitions';

function langLabel(lang: OutputLanguage): string {
  if (lang === 'en') return 'English';
  if (lang === 'zh-en') return '中英双语';
  return '简体中文';
}

export function buildTransitionPrompt(
  prev: Shot,
  next: Shot,
  typeId: string,
  lang: OutputLanguage,
): { system: string; user: string } {
  const bilingual = lang === 'zh-en';
  const label = transitionLabel(typeId, lang === 'en' ? 'en' : 'zh');
  const shell = bilingual
    ? '{ "note": "中文转场说明", "noteEn": "English transition note" }'
    : '{ "note": "string" }';
  const system = [
    '你是专业剪辑师，为相邻两个镜头生成「转场建议」。',
    `转场类型：${label}。基于前后两镜内容，具体说明如何用该转场承接：动作/视线/构图/节奏的衔接要点。`,
    `用 ${langLabel(lang)} 输出，简洁可执行${bilingual ? '；note 用中文、noteEn 用英文，两版描述同一转场' : ''}。`,
    '只输出 JSON，不要任何解释文字、不要 Markdown 代码块标记：',
    shell,
  ].join('\n');
  const user = [
    '前一镜：',
    `- 概要：${prev.summary}`,
    `- 提示词：${prev.prompt}`,
    '',
    '后一镜：',
    `- 概要：${next.summary}`,
    `- 提示词：${next.prompt}`,
  ].join('\n');
  return { system, user };
}

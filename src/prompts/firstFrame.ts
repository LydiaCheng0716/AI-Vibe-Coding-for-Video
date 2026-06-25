// 首帧图像提示词 prompt（Issue #57）。聚焦构图/主体/光线/风格，弱化运镜与时序；适配即梦/MJ/SD。
// 注入该镜引用角色的锚点 + 锁定的全局风格，保证与视频提示词同源一致（与 #29/#55 协同）。
import type { Character, GlobalStyle, OutputLanguage, Shot } from '../core/models';
import { characterAnchor } from '../core/characters';
import { composeStyle } from '../core/styleProfile';

function langLabel(lang: OutputLanguage): string {
  if (lang === 'en') return 'English';
  if (lang === 'zh-en') return '中英双语';
  return '简体中文';
}

export function buildFirstFramePrompt(
  shot: Shot,
  characters: Character[],
  globalStyle: GlobalStyle | undefined,
  lang: OutputLanguage,
): { system: string; user: string } {
  const bilingual = lang === 'zh-en';
  const byId = new Map(characters.map((c) => [c.id, c]));
  const refAnchors = (shot.characterRefs ?? [])
    .map((id) => byId.get(id))
    .filter((c): c is Character => !!c)
    .map((c) => characterAnchor(c, lang))
    .filter((a) => a.length > 0);
  const styleAnchor = globalStyle?.locked ? composeStyle(globalStyle.profile, lang) : '';

  const shell = bilingual
    ? '{ "firstFrame": "中文首帧提示词", "firstFrameEn": "English first-frame prompt" }'
    : '{ "firstFrame": "string" }';

  const system = [
    '你在为该镜头生成「首帧静态图像提示词」，用于即梦/Midjourney/Stable Diffusion 等静态出图工具。',
    '聚焦：构图/主体/场景/光线/色彩/质感/风格；**弱化运镜与时间/动作时序**（出的是一张定格图）。',
    `用 ${langLabel(lang)} 输出，组织成可直接粘贴到出图工具的提示词${bilingual ? '；firstFrame 用中文、firstFrameEn 用英文，两版描述同一画面' : ''}。`,
    '务必与提供的角色锚点、全局风格保持一致（同源）。',
    '只输出 JSON，不要任何解释文字、不要 Markdown 代码块标记：',
    shell,
  ].join('\n');

  const user = [
    `镜头概要：${shot.summary}`,
    `视频提示词（参考画面内容）：${shot.prompt}`,
    refAnchors.length > 0 ? `\n角色锚点（务必一致）：\n${refAnchors.map((a) => `- ${a}`).join('\n')}` : '',
    styleAnchor ? `\n全局风格（务必一致）：${styleAnchor}` : '',
  ]
    .filter((x) => x !== '')
    .join('\n');

  return { system, user };
}

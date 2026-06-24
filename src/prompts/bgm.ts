// BGM 提示词构造（TASK-007）。基于故事或已生成分镜，总结情绪/风格/节奏/乐器/场景，
// 输出适配 Suno / 海绵音乐的音乐提示词；按用户输出语言。要求模型只输出 JSON {"prompt":"..."}。
import type { OutputLanguage, Project } from '../core/models';
import { clampField } from './sanitize';

export interface PromptPair {
  system: string;
  user: string;
}

function langLabel(lang: OutputLanguage): string {
  return lang === 'en' ? 'English' : '简体中文';
}

/** 从分镜项目提炼一段简要上下文（概要拼接），避免把超长 prompt 全量送入。 */
function projectSummary(project: Project): string {
  return project.shots
    .slice(0, 10)
    .map((s) => `镜头${s.index}：${clampField(s.summary, 60)}`)
    .join('；');
}

export function buildBgmPrompt(
  input: { story?: string; project?: Project },
  language: OutputLanguage,
): PromptPair {
  const lang = langLabel(language);
  const system = [
    '你是为短视频配乐的音乐提示词专家，为 Suno / 海绵音乐等 AI 音乐工具产出 BGM 提示词。',
    `要求：用 ${lang} 输出一段 BGM 提示词，涵盖：情绪、音乐风格、节奏/速度、乐器与音色、适用场景。`,
    '只输出 JSON：{"prompt":"<BGM 提示词文本>"}，不要任何解释文字、不要 Markdown 代码块标记。',
  ].join('\n');

  const source = input.project
    ? `已生成分镜概要：\n${projectSummary(input.project)}`
    : `故事：\n${input.story ?? ''}`;
  const user = [source, '', `输出语言：${lang}`].join('\n');

  return { system, user };
}

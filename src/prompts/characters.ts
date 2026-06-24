// 角色识别与一致性的 system 提示片段（TASK-005）。强调统一外观、跨镜头复用、不编造、
// 不臆测敏感/不必要的人口属性。
export function characterInstruction(): string {
  return [
    '角色一致性要求：',
    '- 若故事出现明确人物，在 characters 为每个角色给出统一外观描述（发型、服饰、体貌等故事可见特征），同一角色在所有镜头复用同一描述。',
    '- 用 characterRefs 标注每个镜头涉及的角色（用角色的 name，或其在 characters 中的 1-based 序号），并在该镜头 prompt 中体现其外观，保持跨镜头一致。',
    '- 故事没有明确人物时 characters 返回空数组，不要编造人物。',
    '- 只描述故事明示或画面必要的特征；不要臆测种族、确切年龄、健康/宗教等敏感或不必要的人口属性。',
  ].join('\n');
}

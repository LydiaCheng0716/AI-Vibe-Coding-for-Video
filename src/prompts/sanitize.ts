// 提示词字段清洗（TASK-004，kimi MED 加固）。用户可控参数（style/aspectRatio 等）在拼入
// system/user 提示前做长度截断 + 折叠换行，降低被模型误读为指令的提示词注入风险。
// 注：这是纵深防御，不替代 ADR-6 的输出解析/校验兜底；故事正文是产品固有攻击面，不在此清洗。

/** 折叠所有空白为单空格并截断到 maxLen；非字符串返回空串。 */
export function clampField(value: unknown, maxLen = 200): string {
  if (typeof value !== 'string') return '';
  const collapsed = value.replace(/\s+/g, ' ').trim();
  return collapsed.length > maxLen ? collapsed.slice(0, maxLen) : collapsed;
}

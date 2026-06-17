# TASK-003：分镜生成请求与结构化结果解析

## 基本信息

| 字段 | 值 |
|------|-----|
| ID | TASK-003 |
| 所属 Epic | EPIC-003 |
| 优先级 | 高 |
| 负责人 | Developer Agent |
| 状态 | 待开始 |
| 依赖 | TASK-001, TASK-002 |
| 分支 | `feature/task-003-storyboard-generation` |

---

## 任务描述

实现从故事文本和用户参数发起 LLM 分镜生成请求，并把返回结果解析为结构化分镜数据。系统应要求生成 3-10 个镜头，每个镜头包含概要、景别、运镜、时长建议和完整视频提示词字段。本任务聚焦请求构造、Provider 调用入口、JSON 解析与结构校验；失败重试策略、加载态和防重复提交由 TASK-009 承接。

---

## 验收标准

- [ ] Given 用户输入有效故事并完成必要设置，When 用户点击生成，Then 系统应向 LLM 发起分镜生成请求。
- [ ] Given LLM 返回有效结果，When 系统解析响应，Then 系统应得到 3-10 个结构化镜头。
- [ ] Given LLM 返回纯 JSON 或 fenced JSON，When 系统解析响应，Then 系统应按结构化模型提取分镜结果。
- [ ] Given 任一镜头缺少概要、景别、运镜、时长建议或提示词，When 系统校验结果，Then 系统应将结果标记为格式无效。

---

## 技术说明

- 生成结果必须使用结构化数据模型，避免只保存一大段自由文本。
- 解析接受范围为纯 JSON 或首个 fenced / 平衡 JSON 块；不做自由文本猜测，不补全截断 JSON。
- 该任务不要求实现模板多语言细节和人物一致性注入；这些由后续任务完成。
- 网络失败、鉴权失败、限流、加载态、防重复提交和自动重试策略由 TASK-009 统一实现。
- 不直接调用视频生成 API。

参考文档：[PRD.md](../PRD.md) | [architecture.md](../architecture.md) | [api-spec.md](../api-spec.md)

---

## 完成定义（Definition of Done）

- [ ] 代码已实现
- [ ] 单元测试已编写并通过
- [ ] Code Review Agent 已批准
- [ ] QA Agent 已通过
- [ ] PR 已合并到 `develop`
- [ ] 相关文档已更新（如有需要）

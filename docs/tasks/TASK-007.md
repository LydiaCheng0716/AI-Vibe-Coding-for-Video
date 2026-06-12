# TASK-007：BGM 提示词生成与复制

## 基本信息

| 字段 | 值 |
|------|-----|
| ID | TASK-007 |
| 所属 Epic | EPIC-006 |
| 优先级 | 中 |
| 负责人 | Developer Agent |
| 状态 | 待开始 |
| 分支 | `feature/task-007-bgm-prompt` |

---

## 任务描述

实现一键生成 BGM 提示词能力。系统根据故事或已生成分镜，总结整体情绪、节奏和音乐方向，输出适配 Suno / 海绵音乐等 AI 音乐工具的提示词，并支持复制。

---

## 验收标准

- [ ] Given 用户已输入故事，When 用户点击生成 BGM 提示词，Then 系统应输出与故事情绪匹配的音乐提示词。
- [ ] Given 用户已生成分镜，When 用户点击生成 BGM 提示词，Then 系统应可基于完整分镜生成音乐提示词。
- [ ] Given 用户选择输出语言，When 系统生成 BGM 提示词，Then BGM 提示词应使用用户选择的输出语言。
- [ ] Given BGM 提示词已生成，When 用户点击复制，Then 系统应复制 BGM 提示词到剪贴板并给出成功反馈。
- [ ] Given 没有故事文本且没有分镜结果，When 用户点击生成 BGM 提示词，Then 系统应提示先输入故事或生成分镜。

---

## 技术说明

- MVP 只生成文本提示词，不调用 Suno、海绵音乐或其他 BGM API。
- BGM 提示词应包含情绪、风格、节奏、乐器/音色、适用场景等要素。
- 生成逻辑应复用 BYOK 设置和错误处理能力。

参考文档：[PRD.md](../PRD.md) | [architecture.md](../architecture.md) | [api-spec.md](../api-spec.md)

---

## 完成定义（Definition of Done）

- [ ] 代码已实现
- [ ] 单元测试已编写并通过
- [ ] Code Review Agent 已批准
- [ ] QA Agent 已通过
- [ ] PR 已合并到 `develop`
- [ ] 相关文档已更新（如有需要）

# TASK-005：角色识别与人物一致性注入

## 基本信息

| 字段 | 值 |
|------|-----|
| ID | TASK-005 |
| 所属 Epic | EPIC-004 |
| 优先级 | 高 |
| 负责人 | Developer Agent |
| 状态 | 待开始 |
| 依赖 | TASK-003 |
| 分支 | `feature/task-005-character-consistency` |

---

## 任务描述

实现人物一致性能力：系统从故事中识别角色，生成统一外观描述，并把相关角色描述注入对应镜头提示词，减少跨镜头人物漂移。

---

## 验收标准

- [ ] Given 故事中出现一个或多个角色，When 系统生成分镜，Then 系统应输出角色列表和每个角色的统一外观描述。
- [ ] Given 某个镜头涉及已识别角色，When 系统生成该镜头提示词，Then 提示词应包含该角色的统一外观描述。
- [ ] Given 一个角色出现在多个镜头，When 用户查看这些镜头，Then 该角色的外观描述应保持一致。
- [ ] Given 故事中没有明确人物角色，When 系统生成分镜，Then 系统不应强行编造具体人物身份。
- [ ] Given 用户编辑镜头提示词，When 该镜头已包含角色描述，Then 编辑不应自动覆盖用户手动修改内容。

---

## 技术说明

- 角色数据应与分镜数据分离保存，但能被镜头引用。
- 角色识别和注入可由同一次或多次 LLM 生成完成，具体由 Architect / Developer 根据架构确定。
- MVP 不做跨项目人物库、图片参考、首尾帧生成。
- 应避免输出敏感身份推断或不必要的人口属性臆测。

参考文档：[PRD.md](../PRD.md) | [architecture.md](../architecture.md) | [api-spec.md](../api-spec.md)

---

## 完成定义（Definition of Done）

- [ ] 代码已实现
- [ ] 单元测试已编写并通过
- [ ] Code Review Agent 已批准
- [ ] QA Agent 已通过
- [ ] PR 已合并到 `develop`
- [ ] 相关文档已更新（如有需要）

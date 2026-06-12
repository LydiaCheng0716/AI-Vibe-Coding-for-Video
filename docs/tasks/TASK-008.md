# TASK-008：Markdown、JSON、纯文本导出

## 基本信息

| 字段 | 值 |
|------|-----|
| ID | TASK-008 |
| 所属 Epic | EPIC-005 |
| 优先级 | 高 |
| 负责人 | Developer Agent |
| 状态 | 待开始 |
| 分支 | `feature/task-008-export-formats` |

---

## 任务描述

实现完整分镜导出能力。用户可以把当前分镜、角色一致性描述、每个镜头提示词和可选 BGM 提示词导出为 Markdown、JSON 或纯文本格式，方便保存和复用。

---

## 验收标准

- [ ] Given 已生成分镜，When 用户选择 Markdown 导出，Then 系统应生成包含完整分镜、角色描述、镜头提示词和可选 BGM 提示词的 Markdown 内容。
- [ ] Given 已生成分镜，When 用户选择 JSON 导出，Then 系统应生成结构化 JSON，包含故事、参数、角色、镜头和可选 BGM 字段。
- [ ] Given 已生成分镜，When 用户选择纯文本导出，Then 系统应生成便于复制保存的文本内容。
- [ ] Given 用户已经手动编辑某个镜头提示词，When 用户导出，Then 导出内容应包含编辑后的最新内容。
- [ ] Given 当前没有分镜结果，When 用户点击导出，Then 系统应提示先生成分镜。

---

## 技术说明

- 导出可以是复制到剪贴板、下载文件或两者之一；具体交互由设计/架构阶段明确。
- JSON 导出应保持稳定字段名，为未来历史项目管理或导入功能预留空间。
- MVP 不做云端同步、项目库、团队共享。

参考文档：[PRD.md](../PRD.md) | [architecture.md](../architecture.md) | [api-spec.md](../api-spec.md)

---

## 完成定义（Definition of Done）

- [ ] 代码已实现
- [ ] 单元测试已编写并通过
- [ ] Code Review Agent 已批准
- [ ] QA Agent 已通过
- [ ] PR 已合并到 `develop`
- [ ] 相关文档已更新（如有需要）

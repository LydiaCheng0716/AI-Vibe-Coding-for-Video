# TASK-001：Chrome 侧边栏插件壳与故事输入

## 基本信息

| 字段 | 值 |
|------|-----|
| ID | TASK-001 |
| 所属 Epic | EPIC-001 |
| 优先级 | 高 |
| 负责人 | Developer Agent |
| 状态 | 待开始 |
| 分支 | `feature/task-001-sidebar-story-input` |

---

## 任务描述

构建 StoryBoard AI 的 Chrome 侧边栏基础界面，支持用户输入或粘贴自然语言故事，并完成基础输入校验。该任务只负责插件入口、侧边栏布局和故事输入状态，不负责调用 LLM 或生成分镜。

---

## 验收标准

- [ ] Given 用户安装并打开插件，When 用户点击插件入口，Then Chrome 侧边栏应显示 StoryBoard AI 主界面。
- [ ] Given 用户打开侧边栏，When 用户输入或粘贴故事文本，Then 文本应保留在输入框中并可继续编辑。
- [ ] Given 故事文本为空，When 用户点击生成，Then 系统应阻止提交并提示用户先输入故事。
- [ ] Given 故事文本明显过短，When 用户点击生成，Then 系统应提示故事内容不足以生成分镜。
- [ ] Given 用户关闭并重新打开侧边栏，When 浏览器本地状态仍可用，Then 未提交的故事草稿应可恢复。

---

## 技术说明

- 实现 Chrome extension side panel 入口和主界面。
- 故事草稿仅需本地保存，MVP 不做云同步。
- 输入长度上下限由架构阶段明确；开发时应集中配置，避免散落在 UI 逻辑中。
- 不引入账号体系、云端项目、视频生成 API。

参考文档：[PRD.md](../PRD.md) | [architecture.md](../architecture.md) | [api-spec.md](../api-spec.md)

---

## 完成定义（Definition of Done）

- [ ] 代码已实现
- [ ] 单元测试已编写并通过
- [ ] Code Review Agent 已批准
- [ ] QA Agent 已通过
- [ ] PR 已合并到 `develop`
- [ ] 相关文档已更新（如有需要）

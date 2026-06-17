# TASK-009：生成失败、重试与加载状态

## 基本信息

| 字段 | 值 |
|------|-----|
| ID | TASK-009 |
| 所属 Epic | EPIC-003 / EPIC-006 |
| 优先级 | 高 |
| 负责人 | Developer Agent |
| 状态 | 待开始 |
| 依赖 | TASK-003 |
| 分支 | `feature/task-009-generation-retry-loading` |

---

## 任务描述

实现 LLM 生成链路的失败处理、自动重试、全局加载状态和防重复提交。该任务适用于分镜生成和 BGM 提示词生成，确保用户在网络异常、厂商限流、鉴权失败或返回格式异常时获得清晰反馈。

---

## 验收标准

- [ ] Given 分镜或 BGM 生成请求正在进行，When 用户再次点击任一生成按钮，Then 系统应通过全局 LLM 锁阻止重复提交，并保持对应加载状态。
- [ ] Given 网络错误、请求超时、429 或 5xx，When 系统调用 LLM 失败，Then 系统应最多自动重试 2 次（合计 3 次尝试），并使用指数退避和随机抖动。
- [ ] Given 厂商返回 429 且包含 `Retry-After`，When 系统准备自动重试，Then 系统应优先遵循 `Retry-After` 的等待时间。
- [ ] Given 厂商返回 401 或 403，When 系统收到错误，Then 系统不应自动重试，应提示用户检查 API Key 或权限。
- [ ] Given LLM 返回格式无法解析或结构校验失败，When 系统识别为格式异常，Then 系统不应自动重试，应提示生成结果格式异常并提供手动重试入口。
- [ ] Given 自动重试耗尽后仍失败，When 系统结束请求，Then 系统应解除加载状态并展示可理解的失败提示。

---

## 技术说明

- 全局 LLM 锁并发=1，分镜生成与 BGM 生成共享同一把锁；任一生成进行中时，其他生成入口禁用或忽略重复点击。
- 自动重试仅适用于网络错误、超时、429 和 5xx；最多自动重试 2 次，合计 3 次尝试。
- 401/403、CORS/host permission 失败和解析/校验失败不自动重试。
- 分镜单请求超时 90 秒；BGM 单请求超时 60 秒。
- 错误提示应使用可读文案，不暴露完整 API Key、请求头或敏感 Provider 凭据。
- 不直接调用视频生成 API，不做单镜头 AI 重新生成。

参考文档：[PRD.md](../PRD.md) | [architecture.md](../architecture.md) | [api-spec.md](../api-spec.md)

---

## 完成定义（Definition of Done）

- [ ] 代码已实现
- [ ] 单元测试已编写并通过
- [ ] Code Review Agent 已批准
- [ ] QA Agent 已通过
- [ ] PR 已合并到 `develop`
- [ ] 相关文档已更新（如有需要）

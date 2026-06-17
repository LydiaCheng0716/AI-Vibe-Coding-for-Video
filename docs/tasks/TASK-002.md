# TASK-002：BYOK 设置与生成参数选择

## 基本信息

| 字段 | 值 |
|------|-----|
| ID | TASK-002 |
| 所属 Epic | EPIC-002 |
| 优先级 | 高 |
| 负责人 | Developer Agent |
| 状态 | 待开始 |
| 依赖 | TASK-001 |
| 分支 | `feature/task-002-byok-generation-settings` |

---

## 任务描述

实现免费用户的 BYOK 设置和生成参数选择能力。用户应能配置自己的 LLM API Key，并选择目标视频模型、画面风格、画幅比例、单镜头时长偏好和输出语言。

---

## 验收标准

- [ ] Given 用户未配置 API Key，When 用户点击生成，Then 系统应提示配置 BYOK 后再生成。
- [ ] Given 用户输入 API Key，When 用户保存设置，Then 系统应在本地保存该设置并允许后续生成使用。
- [ ] Given 用户已保存 API Key，When 用户重新打开侧边栏，Then 系统应展示已配置状态但不明文暴露完整 Key。
- [ ] Given 用户打开参数区，When 用户选择目标视频模型、画面风格、画幅比例、单镜头时长偏好和输出语言，Then 系统应保存并用于本次生成。
- [ ] Given 用户更改任一参数，When 用户发起生成，Then 生成请求应携带最新参数。

---

## 技术说明

- API Key 仅用于 BYOK，MVP 不做账号体系、订阅支付或免 Key 调用。
- API Key 本地保存方式按架构定稿实现：WebCrypto AES-GCM 加密，密钥不可导出并存 IndexedDB，密文存 `chrome.storage.local`；UI 只展示掩码，禁止日志输出完整 Key，禁用 `storage.sync`。
- 目标视频模型至少覆盖即梦、可灵、Sora、Runway 或通用模型选项；具体枚举由架构/API 文档固化。
- 输出语言至少支持中文和英文。

参考文档：[PRD.md](../PRD.md) | [architecture.md](../architecture.md) | [api-spec.md](../api-spec.md)

---

## 完成定义（Definition of Done）

- [ ] 代码已实现
- [ ] 单元测试已编写并通过
- [ ] Code Review Agent 已批准
- [ ] QA Agent 已通过
- [ ] PR 已合并到 `develop`
- [ ] 相关文档已更新（如有需要）

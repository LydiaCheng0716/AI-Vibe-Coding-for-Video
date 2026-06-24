# 遗留小项设计 — TemplateId 锁定 + 不保存 Key 开关

> **来源：** 评审遗留（Kimi LOW @TASK-004、ADR-1 #8 可选项） · **分支：** `chore/deferred-items-templateid-bykey` → `develop` · **日期：** 2026-06-25

---

## #1 TemplateId 与注册表一致性（Kimi LOW）

**结论：不反转分层。** `REGISTRY: Record<TemplateId, PromptTemplate>` 已在**编译期**强制注册表覆盖每个 `TemplateId`（漏注册即编译错误）；把 `TemplateId` 改为 `keyof typeof REGISTRY` 会让 `core/models` 依赖 `prompts/templates`，违反分层并丢失该穷尽检查。

**改动：** `templates/index.ts` 导出 `TEMPLATE_IDS`（注册表键）+ 注释说明；加运行时锁定测试（每个注册项 id 自洽、`defaultTemplateIdFor` 输出均已注册）。

---

## #2 不保存 API Key（ADR-1 #8 可选项）

**合规要求（ADR-1 rule 1）：** 明文 Key 不得落盘、不得存模块级变量/持久缓存。因此「不保存」= **生成当次手动输入，经请求链一次性传入，用完即弃**，而非会话内存缓存。

**改动：**
- `Settings` 增 `persistApiKey: boolean`（默认 `true`，非敏感，存 settings）。
- `generation`：`generateStoryboard` / `generateBgmPrompt` 的 input 增可选 `apiKey`（一次性覆盖）；`preflightProvider` 收到非空 override 时用它、跳过 `hasApiKey`/解密；override 为空走原 keyVault 路径。override 只在请求链内传递，不存储。
- `SettingsPanel`：「在本机保存 API Key」勾选框（默认勾选）。取消勾选并保存 → 调 `clearApiKey()` 清掉已落盘的 Key（确保磁盘无残留），隐藏保存/删除 Key 按钮，提示「生成时手动输入」。
- `StoryInput` / `BgmPanel`：当 `persistApiKey===false` 时渲染一次性 password 输入框；生成时作为 `apiKey` override 传入，生成结束清空该输入（不写持久状态）。

**测试：** generation override 路径（用 override、不调 keyVault；空 override 回退）；storage persistApiKey 持久化/默认合并。UI 由 build 保障（沿用先例）。

全套 `lint && test && build` 必须绿。

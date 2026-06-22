# 设计文档：Issue #2 — 侧边栏壳 + 故事输入（TASK-001）+ BYOK 设置（TASK-002）

| 字段 | 值 |
|------|-----|
| 关联 Issue | #2（伞形：TASK-001 + TASK-002）|
| 模式 | AFK 自主执行（Claude 实现 → cto 自评 → Codex 外门 → Kimi 终审）|
| 合并策略 | leave-open（开 PR 到 develop，不自动合并）|
| 日期 | 2026-06-23 |
| 权威依据 | `docs/architecture.md`（ADR-0/1/2/4/5、§3 manifest 骨架）、`docs/api-spec.md`（3.1 KeyVault、3.2 Storage）、`docs/db-design.md` |

> **协议适配（afk SKILL.md 原文针对 Python/uv 项目，本项目改用）：** 测试 = **Vitest**（非 pytest）；包管理 = **npm**（非 uv）；分支 off **develop**（非 main）；无 `docs/constitution.md`，constitution-gate 跳过并在此记录。其余 afk 流程（design-first、TDD、waterfall、cron relay、自停）照常。

---

## 0. 范围与边界

**做（本 Issue）：**
- 项目脚手架：Vite + `@crxjs/vite-plugin` + React 18 + TS + Tailwind + Vitest + MV3 manifest。
- **TASK-001：** 侧边栏入口与主界面；故事输入/粘贴；长度校验（ADR-2）；草稿本地保存与恢复。
- **TASK-002：** BYOK —— API Key 的 WebCrypto AES-GCM 加密保存（ADR-1）；掩码显示；一键删除；生成参数选择（目标视频模型/风格/画幅/时长偏好/输出语言）。

**不做（本 Issue 外，明确不碰）：**
- 任何 LLM 出站调用 / 分镜生成（TASK-003+，被 Spike #3 阻塞）。
- 模板、角色、卡片、BGM、导出、重试锁。
- 账号、云同步、视频生成 API。

---

## 1. 目录结构（落地 architecture §3）

```
storyboard-ai 扩展根（= 仓库根）
├── manifest.config.ts          # crxjs 的 manifest 定义（TS）
├── vite.config.ts
├── tsconfig.json
├── package.json
├── tailwind.config.js / postcss.config.js
├── index.html                  # 侧边栏 HTML 入口
├── src/
│   ├── sidepanel/ main.tsx App.tsx
│   ├── components/ StoryInput.tsx  SettingsPanel.tsx
│   ├── services/   storage.ts  keyVault.ts
│   ├── core/       config.ts   validate.ts   models.ts   crypto.ts
│   └── styles.css
└── tests/unit/     validate.test.ts  keyVault.test.ts  storage.test.ts  config.test.ts
```

> 说明：扩展即仓库根（manifest 在根），不另套 `storyboard-ai/` 子目录，避免双层。`docs/`、`skill/`、`.agents/` 保持不变。

---

## 2. TASK-001 设计

### 2.1 校验（`core/config.ts` + `core/validate.ts`）—— ADR-2
- 常量集中在 `config.ts`：`STORY_MIN = 10`、`STORY_MAX = 5000`、`STORY_SOFT_MIN = 30`。**禁止散落到 UI。**
- 计数口径：**trim 后的 Unicode 码点数**（`[...str.trim()].length`，不是 `.length`，以正确处理 emoji/代理对）。
- `validateStory(text): { code: 'OK'|'EMPTY_STORY'|'STORY_TOO_SHORT'|'STORY_TOO_LONG'; count }`：
  - 空（trim 后长度 0）→ `EMPTY_STORY`
  - `< 10` → `STORY_TOO_SHORT`
  - `> 5000` → `STORY_TOO_LONG`
  - 10–30 之间合法，但 UI 给柔性提示（不拦截）。
- 纯函数，完全可单测。

### 2.2 草稿（`services/storage.ts`）
- `saveDraft(text)` / `getDraft()`，存 `chrome.storage.local` 的 `draft = { text, updatedAt }`。
- 输入防抖（~300ms）写入；侧边栏重开时 `getDraft()` 恢复。
- 所有写操作返回 `Result<void>`，失败映射 `STORAGE_WRITE_FAILED`（对齐 api-spec v3 / ARCH-LOW-001）。

### 2.3 UI（`StoryInput.tsx` + `App.tsx`）
- textarea 故事输入 + 实时字数 + 生成按钮（本 Issue 生成按钮仅做校验与禁用态，不触发真实生成 —— 生成是 TASK-003）。
- 校验失败时禁用/提示；不直接读 config 常量以外的魔法数字。

### 2.4 manifest（MV3，ADR-5）
- `manifest_version:3`、`side_panel.default_path`、`action`、`permissions:["sidePanel","storage"]`。
- `host_permissions`：本 Issue **暂不申请任何厂商域名**（无出站调用）；留注释指向 Spike #3 决定最终名单。剪贴板用 `navigator.clipboard`，不申请 `clipboardWrite`。

---

## 3. TASK-002 设计

### 3.1 KeyVault（`services/keyVault.ts` + `core/crypto.ts`）—— ADR-1（硬性安全边界）
- `crypto.ts`：用 `crypto.subtle.generateKey({name:'AES-GCM',length:256}, **extractable:false**, ['encrypt','decrypt'])` 生成密钥，存 IndexedDB（库 `storyboard-keys` / 仓 `aesKey`）。原始密钥字节**永不**进入可读存储。
- 加密：随机 12 字节 IV，`AES-GCM` 加密 Key → 密文 + iv + alg 存 `chrome.storage.local.apiKeyCipher`。**明文 Key 不落盘、不进 React state、不进日志/错误。**
- API（对齐 api-spec 3.1）：`saveApiKey(key): Result<void>`、`hasApiKey(): boolean`、`getMaskedApiKey(): string|null`（仅末 4 位 `sk-...AB12`）、`getApiKeyForRequest(): string|null`（仅出站瞬间用，本 Issue 不调用）、`clearApiKey(): Result<void>`（清密文 + IndexedDB 密钥）。
- 解密损坏（IndexedDB 密钥丢失）→ 清坏状态并要求重输，映射 `KEY_DECRYPT_FAILED`。
- **禁用 `chrome.storage.sync`。** 设置页含安全提示文案（ADR-1 第 7 条原文级要求）。

### 3.2 设置参数（`SettingsPanel.tsx` + `storage.ts`）
- `GenerationParams`（models.ts，对齐 api-spec §2）：`videoModel`(jimeng|keling|sora|runway|generic)、`style`、`aspectRatio`、`shotDurationPref`(short|medium|long)、`outputLanguage`(zh|en)、`templateId`。
- Provider 设置：`kind`(openai-compatible|anthropic)、`baseUrl?`、`model`（**默认空字符串**，不硬编码，ADR-4）、API Key。
- `saveSettings()` / `getSettings()` → `chrome.storage.local.settings`，带 `schemaVersion:1`。

---

## 4. 测试计划（Vitest，纯函数优先）
- `validate.test.ts`：空/9字/10字/30字/5000字/5001字边界；emoji 码点计数（`'👨‍👩‍👧'`、代理对）。
- `keyVault.test.ts`：加密→解密往返一致；掩码只露末 4 位；clear 后 `hasApiKey=false`；密钥不可导出（`extractable:false`）；明文不出现在密文/掩码/序列化里。
- `storage.test.ts`：draft 存取；settings 默认值（model 为空）；写失败→`STORAGE_WRITE_FAILED`。
- `config.test.ts`：常量值锁定（10/5000/30），防止散落。
- chrome / IndexedDB 在测试里用轻量 mock（`fake-indexeddb` + `chrome.storage` stub）。
- **不**写真实浏览器 E2E（无人值守跑不了；留给操作员晨间 `load unpacked` QA）。

---

## 5. 验收映射（Issue #2）
| 验收点 | 落地 |
|--------|------|
| 打开侧边栏显示主界面 | manifest side_panel + App | 
| 输入/粘贴保留可编辑 | StoryInput 受控 textarea + draft |
| 空故事拦截 | validate `EMPTY_STORY` |
| <10 / >5000 拦截（码点数）| validate + config |
| 重开恢复草稿 | storage.getDraft |
| 未配 Key 提示 | hasApiKey 判定（生成入口禁用提示）|
| 保存 Key 本地加密、掩码、可删 | keyVault + crypto（ADR-1）|
| 参数选择并保存 | SettingsPanel + saveSettings |

---

## 6. 决策与风险
- **D1：** 扩展根 = 仓库根（manifest 在根），不套子目录。理由：避免双层、CI 打包简单。
- **D2：** 本 Issue 不申请任何 host_permissions（无出站）。理由：最小权限；厂商域名待 Spike #3。
- **D3：** 生成按钮在本 Issue 只做校验/禁用，不接 LLM。理由：生成是 TASK-003，且被 Spike 阻塞。
- **R1：** 无人值守无法验证真实 Chrome 渲染与权限弹窗 → 交付为「可构建 + 单测通过 + PR」，标注需操作员晨间 QA。
- **R2：** `@crxjs/vite-plugin` 版本与 MV3 side panel 兼容性 → 若脚手架阶段受阻，退化为手写 manifest + Vite 多入口，记录于 ledger。
- **R3：** npm install 网络/sandbox 受限可能 → 若失败，先提交可读源码与配置，install/test 留待操作员或后续 tick，绝不静默跳过测试。

---

## 7. 对抗性自评（design 阶段，已过一轮）
- Q：码点计数会不会把 emoji ZWJ 序列算多？A：按「Unicode 码点数」是 PRD/ADR-2 明确口径，`[...str]` 即码点；ZWJ 组合按多码点计，符合规范文字面。記录為已知口径，不另做 grapheme 分割。
- Q：掩码会不会泄露长度信息？A：固定 `sk-...` + 末4位，不暴露完整长度，可接受。
- Q：Result<void> vs 抛错？A：统一 Result（对齐 api-spec v3），UI 据 `ok` 分支提示。

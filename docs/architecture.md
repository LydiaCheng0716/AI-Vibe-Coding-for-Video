# 系统架构设计

## 状态

> **状态：** 待复审（已按 REVIEW-001 修订）  
> **作者：** Architect Agent  
> **审查人：** 架构 Review Agent  
> **批准人：** Human PO  
> **最后更新：** 2026-06-17
>
> **修订记录：**
> - v1（2026-06-12）首版。
> - v2（2026-06-17）按 REVIEW-001 审查反馈修订：ADR-1 收紧 Key 安全边界并加验收规则（ARCH-HIGH-002）；新增 ADR-5 CORS/host permissions 可执行约束（ARCH-HIGH-001）；新增 ADR-6 JSON schema/解析规则（ARCH-MED-002）；ADR-4 模型不硬编码（ARCH-MED-001）；ADR-2 统一码点计数（ARCH-MED-003）；ADR-3 全局并发锁（ARCH-MED-004）；ARCH-LOW-001/002 见 api-spec/db-design。

---

## 0. 产品定位与核心约束（先读这一节）

StoryBoard AI 是一个 **纯客户端的 Chrome 侧边栏插件**（Manifest V3 Side Panel），把口语化故事转成结构化分镜、视频提示词和 BGM 提示词。

它和传统 Web 应用最大的不同：

- **没有自建后端服务器、没有自建数据库、没有账号体系。** 插件直接在用户浏览器里运行。
- **BYOK（Bring Your Own Key）：** 所有 AI 生成都是浏览器用 **用户自己的 LLM API Key** 直连 LLM 厂商接口完成的。我们不代理、不中转、不存储任何 Key 到云端。
- **所有数据都在本地。** 故事草稿、生成参数、分镜结果、API Key 全部存在浏览器本地（`chrome.storage` / IndexedDB），不上云。

> 这意味着 PRD「待决问题 #2、#3」和登录注册、Bearer Token、免费/付费限流等传统服务端概念在本产品 **不适用**，已在本架构和 API 规范中删除。本文档为开发者固化的是「插件内部模块契约」和「对 LLM 厂商的出站调用契约」，而不是一套自建 REST API。

---

## 1. 技术栈

| 层级 | 技术选型 | 选型原因 |
|------|---------|---------|
| 运行形态 | Chrome 扩展 Manifest V3 + Side Panel API（`chrome.sidePanel`） | PRD 明确要求 Chrome 侧边栏；MV3 是当前唯一被 Chrome 接受的扩展形态 |
| 前端框架 | React 18 + TypeScript | 组件化适合分镜卡片列表与参数表单；TS 在「结构化分镜模型」上能提供编译期保障，契合 TASK-003 要求 |
| 构建工具 | Vite + `@crxjs/vite-plugin` | 对 MV3 扩展支持好，HMR 开发体验佳，产物即可直接 `load unpacked` |
| 样式 | Tailwind CSS（或等价的原子化方案，由开发实现细节决定） | 侧边栏宽度有限，原子化样式利于快速排版；非强制 |
| 本地存储 | `chrome.storage.local`（设置/草稿/结果） + IndexedDB（存放非导出 WebCrypto 密钥） | 见「ADR-1 API Key 安全策略」与「本地存储数据模型」 |
| 加密 | WebCrypto（`SubtleCrypto`，AES-GCM） | 浏览器原生、无需引入第三方加密库，密钥可设为不可导出 |
| LLM 调用 | `fetch` 直连厂商 HTTPS 接口，统一封装在 Provider 抽象层 | BYOK，无后端中转 |
| 认证 | 无（无账号、无 Session、无 Token） | 产品定位决定，见第 0 节 |
| 后端 / 数据库 / 队列 / 缓存 | **无（MVP 不需要）** | 纯客户端架构；标注为未来扩展点（见第 7 节） |
| 测试 | Vitest（单元） + Playwright/Chrome 扩展 E2E（可选） | 与 Vite 同生态；纯函数（解析、模板、校验）易做单测 |
| 打包/CI | GitHub Actions：lint + 单测 + 产物打包成 `.zip` | 无服务器部署需求，CI 只需保证产物可加载、测试通过 |

---

## 2. 系统概览

```
┌───────────────────────────────────────────────────────────┐
│                      用户浏览器                              │
│                                                            │
│  ┌──────────────────────────────────────────────────┐    │
│  │   Chrome Side Panel（React 应用，本插件 UI）        │    │
│  │                                                    │    │
│  │  [故事输入] [参数面板] [生成按钮]                    │    │
│  │  [分镜卡片列表] [BGM 区] [导出区] [BYOK 设置]        │    │
│  └───────────────┬────────────────────────────────────┘   │
│                  │ 调用（同一扩展上下文内的函数调用）         │
│                  ▼                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │              服务层（Services）                     │    │
│  │  ┌────────────┐ ┌────────────┐ ┌───────────────┐  │    │
│  │  │ Generation │ │  Storage   │ │   Prompt /    │  │    │
│  │  │  Service   │ │  Service   │ │ Template /    │  │    │
│  │  │（编排生成） │ │（本地存储） │ │ Parser 模块   │  │    │
│  │  └─────┬──────┘ └─────┬──────┘ └───────────────┘  │    │
│  │        │              │                            │   │
│  │        │       ┌──────▼──────────────────────┐    │   │
│  │        │       │ chrome.storage.local /       │    │   │
│  │        │       │ IndexedDB（密钥）            │    │   │
│  │        │       └──────────────────────────────┘    │   │
│  │  ┌─────▼───────────────────────────────────┐      │   │
│  │  │       LLM Provider 抽象层                  │      │   │
│  │  │ （OpenAI 兼容 / Anthropic 适配器）         │      │   │
│  │  └─────┬───────────────────────────────────┘      │   │
│  └────────┼───────────────────────────────────────────┘   │
│           │ fetch（HTTPS，携带用户自己的 API Key）          │
└───────────┼────────────────────────────────────────────────┘
            ▼
   ┌────────────────────────────────────────────┐
   │   第三方 LLM 厂商接口（用户自带 Key 调用）      │
   │   OpenAI / Anthropic / DeepSeek / Kimi /     │
   │   智谱 GLM 等（OpenAI 兼容或 Anthropic 协议）  │
   └────────────────────────────────────────────┘
```

> **关键点：** 数据流没有「我们的服务器」这一环。出站请求只发往用户配置的 LLM 厂商域名，Key 永远只在用户本机与该厂商之间流动。

---

## 3. 目录结构

```
storyboard-ai/
├── manifest.json                 # MV3 清单（声明 side_panel、permissions、host_permissions）
├── vite.config.ts
├── src/
│   ├── sidepanel/                # 侧边栏 UI 入口（React 根）
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── App.tsx
│   ├── components/               # 纯展示/交互组件
│   │   ├── StoryInput.tsx        # TASK-001
│   │   ├── SettingsPanel.tsx     # TASK-002（BYOK + 参数）
│   │   ├── ShotCard.tsx          # TASK-006（查看/编辑/复制单镜头）
│   │   ├── ShotList.tsx          # TASK-006
│   │   ├── BgmPanel.tsx          # TASK-007
│   │   └── ExportPanel.tsx       # TASK-008
│   ├── services/
│   │   ├── generation.ts         # 编排：故事+参数 → Provider → 解析 → 结果（TASK-003/005/007）
│   │   ├── storage.ts            # chrome.storage 读写、草稿恢复（TASK-001/002/006）
│   │   ├── keyVault.ts           # API Key 加密保存/读取/删除（ADR-1）
│   │   └── llm/
│   │       ├── provider.ts       # Provider 接口定义 + 工厂
│   │       ├── openaiCompatible.ts  # OpenAI 兼容 Chat Completions 适配器
│   │       └── anthropic.ts      # Anthropic Messages 适配器
│   ├── prompts/
│   │   ├── storyboard.ts         # 分镜生成 system/user 提示词构造
│   │   ├── characters.ts         # 角色识别与一致性（TASK-005）
│   │   ├── bgm.ts                # BGM 提示词（TASK-007）
│   │   └── templates/            # 视频提示词模板（TASK-004）
│   │       ├── cinematic-en.ts   #   通用英文电影感
│   │       ├── jimeng-keling-zh.ts  # 即梦/可灵中文
│   │       └── index.ts          # 模板注册表 + 回退逻辑
│   ├── core/
│   │   ├── models.ts             # 结构化数据模型（Project/Shot/Character/Bgm 等 TS 类型）
│   │   ├── parse.ts              # LLM 原始返回 → 结构化模型的解析与校验（TASK-003）
│   │   ├── validate.ts           # 故事长度、必填字段等输入/输出校验
│   │   ├── export.ts             # Markdown / JSON / 纯文本导出（TASK-008）
│   │   └── config.ts             # 集中常量：长度上下限、限流、重试、模型枚举（ADR-2/3）
│   └── lib/
│       └── retry.ts              # 带退避的请求重试封装（ADR-3）
├── tests/
│   └── unit/                     # parse / template / validate / export 等纯函数单测
├── public/
│   └── icons/
└── docs/
```

**模块边界（Code Review / Developer 必须遵守）：**

- **组件层只负责 UI 与本地状态**，不直接 `fetch` LLM、不直接读写 `chrome.storage`，统一走 `services/`。
- **`services/generation.ts` 是唯一编排入口**：它调用 prompt 构造、Provider、parser、validate，组件不绕过它直接拼提示词。
- **`core/config.ts` 是唯一的常量来源**：长度上下限、限流并发、重试次数、模型枚举集中在此，禁止散落在 UI 或 service 里（TASK-001 / TASK-002 技术说明已点名）。
- **Provider 抽象层屏蔽厂商差异**：上层只面向 `LlmProvider` 接口，新增厂商=新增一个适配器，不改编排逻辑。

---

## 4. 数据流（端到端，以「生成分镜」为例）

1. 用户在 `StoryInput` 输入故事；输入即时写入 `storage.ts` 的草稿（TASK-001 草稿恢复）。
2. 用户点「生成」。`App` 调用 `generation.ts`。
3. `generation.ts` 先做前置校验：
   - 通过 `validate.ts` 校验故事长度（**ADR-2**：< 下限或 > 上限直接拦截并提示，不发请求）。
   - 通过 `keyVault.ts` 确认已配置 API Key（未配置则提示去 BYOK 设置，不发请求）。
   - 通过限流锁确认当前无进行中的生成（**ADR-3**：并发=1）。
4. `generation.ts` 用 `prompts/storyboard.ts` + 选中的 `templates/*` + 参数构造请求体，要求模型 **以结构化 JSON** 返回 3–10 个镜头。
5. 经 `llm/provider.ts` 选出的适配器，用 `lib/retry.ts` 包裹 `fetch` 直连厂商接口（携带用户 Key）。
6. 收到响应后，`core/parse.ts` 解析为结构化分镜模型并 `validate.ts` 校验完整性：
   - 任一镜头缺概要/景别/运镜/时长/提示词 → 标记结果无效，提示用户重试（TASK-003 验收）。
7. 结构化结果写入 `storage.ts`（本地当前项目），UI 渲染 `ShotList`。
8. 后续局部编辑、单镜头复制、BGM、导出都作用于这份本地结构化数据，不重新触发整套生成（TASK-006/007/008）。

**失败分支（TASK-003 技术说明要求覆盖）：**

| 失败类型 | 来源 | 处理 |
|---------|------|------|
| 网络失败 | `fetch` 抛错/超时 | 自动重试（ADR-3），重试耗尽后提示「网络异常，请重试」 |
| 鉴权失败 | 厂商返回 401/403 | **不重试**，提示「API Key 无效或无权限，请检查 BYOK 设置」 |
| 限流 | 厂商返回 429 | 按 `Retry-After` 退避重试（ADR-3），耗尽后提示「请求过于频繁，请稍后再试」 |
| 返回格式异常 | 解析/校验失败 | **不自动重试**（重发同样大概率再错），提示「生成结果格式异常」并提供手动重试按钮 |

---

## 5. 本地存储数据模型

> 本产品没有服务端数据库；「数据设计」实际落在浏览器本地存储。下表是 `chrome.storage.local` 的键空间与结构（详细字段类型见 `core/models.ts`，迁移/版本策略见 [db-design.md](db-design.md)）。

| 存储键 | 介质 | 内容 | 说明 |
|--------|------|------|------|
| `settings` | `chrome.storage.local` | 生成参数（目标视频模型、画面风格、画幅比例、单镜头时长偏好、输出语言）、所选 Provider、模型、`schemaVersion` | 不含明文 Key |
| `apiKeyCipher` | `chrome.storage.local` | API Key 的 **AES-GCM 密文** + IV + 算法元信息 | 见 ADR-1；明文不落盘 |
| `cryptoKey`（句柄） | IndexedDB | **不可导出** 的 WebCrypto `CryptoKey`（AES-GCM 256） | 用于解密 `apiKeyCipher`；原始密钥字节永不出现在可读存储里 |
| `draft` | `chrome.storage.local` | 未提交的故事草稿文本 + 时间戳 | TASK-001 草稿恢复 |
| `currentProject` | `chrome.storage.local` | 当前分镜项目（见下方结构） | TASK-003/004/005/006/007/008 共用 |

**`currentProject` 结构（稳定字段名，为未来「历史项目/导入」预留——TASK-008 要求）：**

```jsonc
{
  "schemaVersion": 1,
  "story": "用户输入的原始故事文本",
  "params": {
    "videoModel": "jimeng | keling | sora | runway | generic",
    "style": "string",
    "aspectRatio": "16:9 | 9:16 | 1:1 | ...",
    "shotDurationPref": "short | medium | long",
    "outputLanguage": "zh | en",
    "templateId": "cinematic-en | jimeng-keling-zh"
  },
  "characters": [
    { "id": "c1", "name": "string|null", "appearance": "统一外观描述" }
  ],
  "shots": [
    {
      "id": "s1",
      "index": 1,
      "summary": "镜头概要",
      "shotSize": "景别",
      "cameraMovement": "运镜",
      "durationSuggestion": "时长建议",
      "prompt": "完整视频提示词（含正向+负面）",
      "characterRefs": ["c1"],
      "editedByUser": false        // TASK-005/006：用户手动编辑后置 true，避免被自动覆盖
    }
  ],
  "bgm": { "prompt": "BGM 提示词", "language": "zh|en" } // 可选
}
```

- 角色与镜头分离存储、镜头通过 `characterRefs` 引用角色（TASK-005 要求）。
- `editedByUser` 标记保护用户手动编辑不被后续注入/再生成覆盖（TASK-005/006 要求）。
- JSON 导出直接序列化此结构的稳定字段（TASK-008 要求）。

---

## 6. 关键设计决策（ADR）

### ADR-0：纯客户端架构，无后端、无账号

**背景：** PRD 明确 MVP 不做账号体系、订阅支付、云端同步，且采用 BYOK。

**备选方案：**
1. **纯客户端 Chrome 扩展（选中）** — 优点：零运维、零服务器成本、用户数据天然隔离（各自本机）、隐私好、上线快；缺点：能力受浏览器沙箱限制，跨设备不同步。
2. 轻后端代理 LLM 调用 — 优点：可隐藏厂商细节、统一限流；缺点：要持有/经手用户 Key（与 BYOK 信任模型冲突）、有服务器成本和合规负担，明显属于 MVP 过度设计。

**决定：** 方案 1。

**原因：** 与 PRD 非目标和 BYOK 定位完全一致；最小化攻击面（我们不经手任何密钥/数据）。

**接受的权衡：** 放弃跨设备同步、放弃服务端统一限流与用量统计（这些列入未来扩展，见第 7 节）。

---

### ADR-1：API Key 本地保存的安全策略（PRD 待决 #2）

**背景：** BYOK 必须在本地保存用户的 LLM API Key 供后续生成复用（TASK-002 验收），同时「重新打开侧边栏应展示已配置状态但不明文暴露完整 Key」。需要决定：是否加密、怎么存。

**备选方案：**
1. 明文存 `chrome.storage.local` — 优点：最简单；缺点：浏览器配置目录里的存储文件是明文，磁盘被读取（备份、二手电脑、恶意取证）即泄露。
2. 存 `chrome.storage.sync` — 缺点：会把 Key 同步到 Google 云端账户并跨设备扩散，**扩大**了密钥暴露面，与「数据只在本地」定位冲突。**明确否决。**
3. 自己用固定硬编码密钥做「加密」 — 缺点：密钥在代码里，等于没加密（安全剧场），反而给人虚假安全感。**明确否决。**
4. **WebCrypto AES-GCM 加密 + 不可导出密钥存 IndexedDB（选中）** — 用 `crypto.subtle.generateKey` 生成 AES-GCM 256 密钥并以 `extractable: false` 存入 IndexedDB；用它加密 Key，密文存 `chrome.storage.local`。

**决定：** 方案 4。**注意：本方案的目标是「降低静态磁盘泄露风险」，不是「强加密保险箱」——开发者必须按下方威胁模型与硬性验收规则实现，否则等同明文。**

**威胁模型（这层加密防什么、不防什么）：**

| 威胁 | 是否防护 | 说明 |
|------|---------|------|
| 静态读取磁盘上的浏览器配置文件（备份、二手电脑、离线取证） | ✅ 能降低 | Key 密文落盘，AES 密钥以不可导出形式由浏览器密钥库托管，磁盘上拿不到明文 |
| `chrome.storage.sync` 把 Key 同步上云后泄露 | ✅ 能避免 | 硬性禁用 sync 存 Key |
| UI / 日志 / 导出意外带出明文 Key | ✅ 能避免（靠下方编码约束） | 见硬性验收规则 |
| 恶意代码进入扩展包 / 依赖链 / 同扩展上下文运行时 | ❌ 不防 | 同上下文代码可调用解密、可取出不可导出密钥用于解密 |
| 浏览器或操作系统已被完全控制 | ❌ 不防 | 任何客户端方案都无法防护 |

**硬性验收规则（Developer 必须满足，Code Review / QA 必须检查）：**
1. **明文 Key 的作用域最小化：** 明文只允许在「发起一次出站请求」的同步调用链里临时存在；请求构造完成后不得保留引用。`getApiKeyForRequest()` 返回的明文 **禁止** 被赋值给 React state、组件 props、模块级变量、`localStorage`/`sessionStorage` 或任何持久缓存。
2. **禁止泄露通道：** 明文 Key **禁止** 写入 `console.*` 日志、`Error` 对象的 message/stack、异常上报、网络请求的可记录字段（URL/query）、以及任何导出内容（见 ARCH-LOW-002）。
3. **只存密文：** `chrome.storage.local` 只存 `apiKeyCipher`（密文+IV+算法元信息），**禁止** 任何键里出现明文 Key；**禁止** `chrome.storage.sync` 存 Key。
4. **UI 掩码：** 只显示 `sk-...AB12`（仅末 4 位），不回显完整 Key（TASK-002 验收）。
5. **删除：** 「删除 Key」一键清除 `apiKeyCipher` 与 IndexedDB 密钥。
6. **解密/密钥损坏的恢复策略（防「已配置但用不了」坏状态）：** 解密失败、或 IndexedDB 里的 `CryptoKey` 丢失/损坏时，`keyVault` 应**清理损坏状态**（删除无法解密的 `apiKeyCipher` 与残留密钥句柄）、把 `hasApiKey()` 视为 false，并提示用户**重新输入 Key**，而不是反复报错或卡在不可用状态。
7. **设置页用户提示（原文级要求）：** 设置页须有一句用户能懂的说明，例如：「你的 API Key 已在本机加密保存，只用于直接调用 AI 服务。本地加密能降低硬盘被读取时的泄露风险，但无法防护已被恶意软件控制的浏览器或设备——请只在你信任的电脑上保存 Key。」
8. **可选高级项（不阻塞 MVP）：** 可提供「不保存 Key / 每次生成时手动输入」开关，面向高安全敏感用户；MVP 可不实现，但数据模型与 `keyVault` 接口应不排斥后续加入。

**原因：** 方案 4 是该沙箱内 **诚实且可落地** 的水位：显著抬高「离线读取磁盘即拿到 Key」的门槛，同时不制造安全剧场。加上明文最小作用域 + 禁泄露通道 + 损坏恢复这三条工程约束，才能避免 Developer 误把它当强加密保险箱用。

**接受的权衡（已如实写进设置页提示）：** 这层加密不防运行时同上下文攻击和已被控制的浏览器/设备；跨设备无法共享 Key（因禁用 sync）。

---

### ADR-2：故事输入长度上下限（PRD 待决 #3 之一）

**背景：** 太短无法拆出 3–10 个有意义镜头；太长抬高 LLM 成本、可能撞上下文/请求体上限（TASK-001 校验、TASK-003 生成都依赖此约束）。需要给出 **集中可配置** 的具体数值（TASK-001 技术说明要求集中配置）。

**计数口径（ARCH-MED-003，统一为唯一标准）：** 所有长度判断都按 **「去除首尾空白后的 Unicode 码点数」** 计算，即 `[...story.trim()].length`（用展开运算符/`Intl.Segmenter` 按码点计，**不要** 直接用 `story.length`——后者是 UTF-16 code unit，emoji、组合字符会与「字」的直觉不符）。UI 文案统一称「字」，与该口径对齐。计数函数集中在 `core/validate.ts`，阈值集中在 `core/config.ts`。

**决定（阈值写入 `core/config.ts`）：**

| 规则 | 阈值（trim 后码点数） | 行为 |
|------|------|------|
| 硬下限 | **10 字** | 低于则禁止提交，提示「故事内容太短，至少 10 个字」（TASK-001：空/过短拦截） |
| 软建议下限 | **30 字** | 10–30 之间允许生成，但给柔性提示「内容较少，分镜可能比较笼统」 |
| 硬上限 | **5000 字** | 超过则禁止提交，提示「故事过长（上限 5000 字），请精简」 |
| 软提示上限 | **2000 字** | 2000–5000 之间允许，但提示「内容较长，生成会消耗更多额度」 |

**原因：** 中文约 1.5 token/字，5000 字符 ≈ 7500 输入 token，加上 system 提示与 3–10 镜头的结构化输出，仍稳在主流模型上下文窗口内，且把单次成本控制在可预期范围。10 字符下限足以表达一个最小故事意图，又能挡住误点和空白。

**接受的权衡：** 极少数超长剧本需用户自行精简；上限是产品取舍而非技术天花板，未来可放宽。

---

### ADR-3：单次生成的限流与失败重试（PRD 待决 #3 之二、之三）

**背景：** BYOK 且无后端，「限流」的目的不是保护我们的服务器，而是 **保护用户**：避免误触发并发请求烧额度、避免对厂商造成 429、保证 UI 状态可控（TASK-003 验收：等待时展示加载态并防止重复提交）。

**决定（写入 `core/config.ts` 与 `lib/retry.ts`）：**

- **并发限流：全局 LLM 请求锁，并发=1（ARCH-MED-004）。** 「分镜生成」与「BGM 生成」**共享同一个全局锁**——任意一类 LLM 请求进行中时，所有生成按钮（分镜、BGM 及任何后续生成入口）都禁用并展示加载态，新点击被忽略（TASK-003 防重复提交）。这样能真正达成「保护用户额度、防重复提交」的目标，避免分镜与 BGM 各自有锁导致同时打两个请求。锁实现在 `services/generation.ts`（或单独的 `llmLock` 模块），所有出站生成统一经过它。无需额外冷却时间，按钮态即足够。
- **单请求超时：** 分镜生成 90s、BGM 等较短生成 60s（输出更长的生成给更宽超时）。
- **自动重试（仅瞬时错误）：** 对 **网络错误 / 超时 / 429 / 5xx** 自动重试，**最多 2 次（合计 3 次尝试）**；指数退避 1s → 2s 并加随机抖动；遇 429 优先遵循响应的 `Retry-After`。
- **不自动重试：** 401/403（鉴权）和「返回格式解析失败」——这两类重发同样的请求大概率再失败，直接把可理解的错误抛给用户，并提供手动重试入口（TASK-003 失败场景全覆盖）。

**原因：** 客户端 BYOK 场景下，瞬时网络/限流/服务端抖动是唯一值得自动重试的类别；对它们做有限次退避重试能显著改善「偶发失败」体验，又不会在鉴权或格式错误上空烧用户额度。并发=1 是最简单可靠的「防重复提交 + 控成本」手段。

**接受的权衡：** 不支持批量/并行生成（PRD 已列为 MVP 范围外）；重试上限固定，极端不稳定网络下仍可能失败，但会明确提示而非静默卡死。

---

### ADR-4：LLM Provider 与默认模型（顺带拍板 PRD 待决 #1）

**背景：** PRD 待决 #1 问「模型列表由谁定」。作为 Architect，在此固化 MVP 的 Provider/模型策略，以便 API 规范与 TASK-002 模型枚举落地。

**决定：**
- 以 **OpenAI 兼容 Chat Completions** 为主契约（覆盖 OpenAI、DeepSeek、Moonshot/Kimi、智谱 GLM 等大量「OpenAI 兼容 + 自定义 base_url」的厂商），并提供 **Anthropic Messages** 适配器。
- 设置项包含：Provider 选择、`baseUrl`（仅自定义型可填，见 ADR-5）、模型名、API Key。
- **模型名采用「用户手动填写 + 文档推荐占位」，不在代码里硬编码未经验证的模型字符串（ARCH-MED-001）。** 具体规则：
  - 模型字段是**用户可编辑的文本输入**，默认值为空或填入「文档推荐占位」（仅作提示，不在生成链路里写死）。
  - 设置页 / 文档给出每个 Provider 的「推荐模型」示例，并注明「示例值，可能随厂商更新失效，请以你账号实际可用的模型为准」。
  - `api-spec.md` 里出现的模型名（如 `claude-opus-4-8`）一律视为**示例占位**，不是枚举、不是默认硬编码值。
  - 首次配置后若模型名无效，按出站错误（401/403 或 4xx）走 ADR-3 的「不重试 + 可理解提示」，提示用户检查模型名。
- 「默认 Provider」：MVP 设置页默认选中 **OpenAI 兼容**（覆盖面最广），但不预填 baseUrl/模型/Key，全部由用户填写。
- 「目标视频模型」（即梦/可灵/Sora/Runway/通用）是 **提示词模板维度**，与「生成用的 LLM Provider」是两件事，不可混淆（TASK-002/004）。

> **仍需 PO 拍板：** 是否要在文档/设置页给出一组「官方推荐占位模型名」清单（纯展示用）。这不阻塞开发——即使为空，用户手填模型名的链路也成立。

**原因：** OpenAI 兼容协议是当前 BYOK 生态事实标准，一套适配器吃下绝大多数厂商；Anthropic 协议另做适配器以覆盖 Claude 用户。模型名只手填不硬编码，避免「占位模型已下线 → 用户首配即失败」。

**接受的权衡：** 用户需要自己知道一个可用的模型名（靠推荐占位与提示缓解）；不同厂商对「强制 JSON 输出」支持程度不一，解析层需具备容错（见 ADR-6 / `core/parse.ts`）。

---

### ADR-5：浏览器直连 LLM 的 CORS 与 host permissions 策略（ARCH-HIGH-001）

**背景：** 核心生成链路是 Chrome 扩展直接 `fetch` 第三方 LLM 厂商。两个真实可用性风险：① 某些厂商可能不允许扩展来源跨域调用（CORS）；② MV3 扩展访问外部域名需要 host permission，若处理不当，Developer 可能图省事申请 `<all_urls>`（权限面过大），或只写死静态 host（自定义 baseUrl 用不了）。Review 要求把这件事固化成**可执行约束**。

**决定：**

**(1) Provider 准入分两类：**

| 类别 | 域名 | host 权限方式 |
|------|------|--------------|
| **内置已验证 Provider** | 在 `manifest.host_permissions` 里**静态声明、按域名最小化**列出 MVP 验证过的厂商域名（如 OpenAI、Anthropic，及开发前 Spike 验证通过的 1–2 个 OpenAI 兼容厂商域名） | 安装即授权，开箱即用 |
| **自定义 baseUrl Provider** | 用户自填的任意 OpenAI 兼容代理/自建域名 | **运行时动态授权**，见 (3) |

**(2) 允许自定义 baseUrl，但受约束：** 仅 `kind: 'openai-compatible'` 允许填 `baseUrl`；必须是 `https://`（拒绝 `http://` 与非法 URL）；Anthropic 适配器使用固定官方域名，不开放 baseUrl。

**(3) 自定义域名用 `optional_host_permissions` 动态申请（不预先申请）：** `manifest` 用 `optional_host_permissions`（MV3）声明可按需申请的范围；用户保存一个自定义 baseUrl 时，由代码调用 `chrome.permissions.request({ origins: ['https://该域名/*'] })` **当场弹窗申请该域名权限**，用户授权后才可用。已授权域名记录在设置里，下次直接用。

**(4) 明确禁止：** **禁止在 `manifest` 默认申请 `<all_urls>` 或 `*://*/*`。** Code Review 必须把这条当硬性红线。host 权限只能是「内置已验证域名（静态）」+「用户逐个授权的自定义域名（动态）」。

**(5) CORS / 权限失败的用户提示与降级（写入 `api-spec.md` 错误码）：**
- **未获 host 权限**（用户拒绝授权，或调用前未授权）→ 提示「需要授权访问 {域名} 才能调用，请在弹窗中允许」，并提供「重新授权」按钮；不发请求。
- **CORS 被拦**（请求发出但被浏览器/厂商跨域策略拒绝）→ 提示「该服务可能不支持在浏览器插件中直接调用，请改用受支持的 Provider（如 OpenAI 兼容厂商）或换一个 baseUrl」，引导用户切换，而不是静默失败。
- 这两类失败**不计入 ADR-3 的自动重试**（重试同样会被拒），直接提示并给手动操作入口。

**(6) 开发前技术 Spike（验收前置，ARCH-HIGH-001 明确要求）：** **进入正式开发前，必须做一个最小 Spike**，在真实 Chrome 扩展环境（`load unpacked`）里验证「至少一个 OpenAI 兼容 Provider」与「Anthropic」能从扩展上下文成功发起真实生成请求（含 host 权限申请流程跑通）。Spike 结论决定 (1) 表里内置 Provider 的最终名单。**Spike 未通过前不开始 TASK-003 / TASK-007 的正式实现。**

**原因：** 把「能不能在浏览器里直连厂商」从「文档里一句提醒」升级成「准入分类 + 动态授权 + 禁 all_urls + 失败降级 + 开发前 Spike」的可执行约束，既保住核心链路可用性，又把权限面压到最小。

**接受的权衡：** 用户用自定义 baseUrl 时会多一步授权弹窗（安全与可用性的合理代价）；个别不支持浏览器 CORS 的厂商无法作为 Provider，靠提示引导用户换厂商。

---

### ADR-6：LLM 结构化输出的最小 schema 与解析校验规则（ARCH-MED-002）

**背景：** 多个 TASK 依赖稳定的结构化分镜数据，但厂商返回可能是纯 JSON、被 ```` ```json ```` 包裹的代码块、前后带解释文本、字段名变体或截断 JSON。需要统一解析接受范围与校验规则，避免脆弱解析。

**决定（实现于 `core/parse.ts` + `core/validate.ts`）：**

**(1) 期望输出外壳（system 提示里明确要求模型只输出 JSON）：**
```jsonc
{
  "characters": [ { "name": "string|null", "appearance": "string" } ],
  "shots": [
    { "summary": "string", "shotSize": "string", "cameraMovement": "string",
      "durationSuggestion": "string", "prompt": "string",
      "characterRefs": ["string"] }   // 引用 characters[].name 或其序号
  ],
  "bgm": { "prompt": "string" }        // 仅 BGM 生成时出现；分镜生成可无
}
```

**(2) 解析接受范围（按顺序尝试，全失败即判 `BAD_RESPONSE_FORMAT`）：**
1. 整段是合法 JSON → 直接解析；
2. 否则在文本中提取**第一个** ```` ```json ... ``` ```` 代码块或第一个平衡的 `{...}` 块再解析；
3. 仍失败 → 判格式异常，**不做自由文本猜测、不补全截断 JSON**，提示用户重试（ADR-3：解析失败不自动重试）。

**(3) 校验规则（解析成功后，任一不满足即 `BAD_RESPONSE_FORMAT`）：**
- `shots` 是数组且 `length ∈ [3, 10]`（TASK-003）；
- 每个 shot 的 `summary / shotSize / cameraMovement / durationSuggestion / prompt` 均为**非空字符串**（trim 后非空）；
- `characterRefs`（若有）必须引用**已存在的角色**（名字或序号能对上 `characters`），对不上的引用丢弃而非报错；
- 故事无明确人物时 `characters` 允许为空数组，**不强行编造**（TASK-005）；
- 归一化：解析后由代码补齐 `id`、`index`（1..N）、`editedByUser=false`、把 `characterRefs` 统一成内部 `Character.id`，落成第 5 节的内部模型。

**(4) 大小保护：** 出站 `max_tokens` 设上限（见 api-spec）；若响应超出预期体积或 `finish_reason` 指示截断，按格式异常处理并提示重试。

**原因：** 给出「接受纯 JSON 或 fenced JSON、字段缺失即失败、不猜测」的明确边界，让 Developer 写出一致解析、QA 可覆盖，避免各厂商返回差异导致脆弱实现。

**接受的权衡：** 对返回格式特别离谱的厂商，会更多落到「提示重试」；这是用确定性换鲁棒性的合理取舍。

---

## 7. 扩展性考量

- **当前容量估算：** 纯客户端，无服务端容量概念；并发与成本由各用户自己的 Key 与 ADR-3 限流约束。
- **MVP 的「10 倍负载」问题不适用**（没有共享服务端）。真正的扩展点在功能维度：
  - 历史项目管理 / 多项目：把 `currentProject` 升级为 `projects[]`，`schemaVersion` 已预留迁移空间。
  - 跨设备同步、免 Key（付费）模式、视频/BGM API 直连：均需引入后端与账号，属 PRD 未来阶段，届时在 Provider 层与存储层之上叠加，不影响当前模块边界。
  - 更多提示词模板：`prompts/templates/` 注册表已为扩展设计（TASK-004）。

---

## 8. 安全考量小结

- **身份认证：** 无账号、无服务端会话；唯一「凭据」是用户自带的 LLM Key，按 ADR-1 加密本地保存。
- **权限控制：** 不适用（无多用户、无服务端资源）；用户只能访问自己本机数据。
- **密钥管理：** 见 ADR-1——WebCrypto 加密、不可导出密钥、明文最小作用域、禁写 state/日志/错误/导出/持久缓存、掩码显示、可一键删除、禁 `storage.sync`、解密损坏可恢复、设置页含用户安全提示。
- **输入校验：** ADR-2 长度边界（trim 后码点数）；ADR-6 输出解析校验。
- **出站与权限：** 见 ADR-5——`fetch` 仅 `https://` 且仅发往内置已验证域名或用户经 `chrome.permissions.request` 逐个授权的自定义域名；**禁止 `<all_urls>`**；CORS/权限失败有明确提示与降级，不静默失败。
- **输出处理：** LLM 返回内容在渲染前按文本处理，避免把模型输出当 HTML 注入（防 XSS）。
- **限流策略：** ADR-3 全局 LLM 锁并发=1（分镜与 BGM 共享）+ 有限退避重试。
- **导出隐私：** 导出内容不含 API Key，也默认不含 Provider 凭据配置（baseUrl 等），见 ARCH-LOW-002 与 db-design.md。
- **最小权限：** `manifest` 只申请 `sidePanel`、`storage`、`permissions`（用于动态申请）；主机权限按 Provider 域名最小化（静态内置 + 动态可选）。

---

## 9. 给架构 Review Agent 的自检对照（移交前确认）

- [x] PRD 每个用户故事都有对应模块/数据流（见第 3、4 节与各 TASK 标注）
- [x] 所有数据实体都有存储定义（第 5 节本地存储模型 + db-design.md）
- [x] 认证/授权方案已明确（无账号，凭据=BYOK Key，ADR-0/ADR-1）
- [x] 限流方案已明确（ADR-3，客户端语义）
- [x] 所有技术选型都有理由（第 1 节）
- [x] 目录结构与模块边界清晰（第 3 节）
- [x] 三个 PRD 待决项已拍板（ADR-1/2/3，另含 ADR-4 回应待决 #1）
- [x] 浏览器直连 CORS/host permissions 已形成可执行约束（ADR-5，ARCH-HIGH-001）
- [x] LLM 结构化输出 schema 与解析校验已固化（ADR-6，ARCH-MED-002）
- [ ] 开发前 Spike：真实 Chrome 扩展环境验证 ≥1 个 OpenAI 兼容 + Anthropic 可直连（ADR-5(6)，**开发前必须完成**）

---

## 架构 Review 意见

> _由架构 Review Agent 填写_

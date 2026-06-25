# Issue #27 设计文档 — Provider 预设下拉（一键填好 BYOK 配置）

> **Issue：** #27 · **优先级：** P1 · **依赖：** `develop`（TASK-001~009 已合并）
> **分支：** `feature/issue-27-provider-presets` → `develop`
> **日期：** 2026-06-25 · **合并策略：** merge-when-green

---

## 1. 目标与范围

BYOK 配置门槛高：Base URL / 模型名 / 平台（moonshot.cn vs .ai）全靠手填，极易出错。
内置常见 provider 预设，选中即自动填好 Base URL + 默认模型，把出错面降到最小；字段仍可手改。

**本任务做：**
1. 预设数据 + 纯函数（`core/providerPresets.ts`）：预设清单、`applyPreset`、`presetIdForProvider`。
2. `SettingsPanel.tsx`：把原「类型（OpenAI 兼容 / Anthropic）」下拉升级为「预设」下拉（7 项）；选中即填；预设区一行风险提示。

**本任务不做：** Key 托管 / 云同步（范围外）；不改 manifest（见 §2.4）。

---

## 2. 关键决策

### 2.1 预设清单（顺序对齐 Issue 正文）
`Moonshot(.cn)` → `Moonshot(.ai)` → `DeepSeek` → `OpenAI` → `智谱` → `自定义(OpenAI 兼容)` → `Anthropic`。

| id | label | kind | baseUrl | defaultModel |
|----|-------|------|---------|--------------|
| `moonshot-cn` | Moonshot(.cn) | openai-compatible | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| `moonshot-ai` | Moonshot(.ai) | openai-compatible | `https://api.moonshot.ai/v1` | `moonshot-v1-8k` |
| `deepseek` | DeepSeek | openai-compatible | `https://api.deepseek.com/v1` | `deepseek-chat` |
| `openai` | OpenAI | openai-compatible | `https://api.openai.com/v1` | `gpt-4o-mini` |
| `zhipu` | 智谱 | openai-compatible | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| `custom` | 自定义(OpenAI 兼容) | openai-compatible | —（清空 baseUrl） | —（保留已填 model） |
| `anthropic` | Anthropic | anthropic | —（固定官方域名） | `claude-3-5-haiku-latest` |

> 默认模型选「便宜/广泛可用」的入门款，均为可手改占位；不硬编码到 defaults（ADR-4 仍是空串默认）。

### 2.2 选中即填（`applyPreset`，纯函数、不可变）
- 普通预设：`{ ...provider, kind, baseUrl: preset.baseUrl, model: preset.defaultModel }` —— **model 一律覆盖为该预设默认值**，杜绝「残留上一个错模型」（验收点）。
- Anthropic：`{ ...provider, kind: 'anthropic', baseUrl: undefined, model: defaultModel }`（清掉无意义的 baseUrl）。
- 自定义：`{ ...provider, kind: 'openai-compatible', baseUrl: undefined }` —— 只清 `baseUrl`（回「全手填」），**保留 `model`**。清 baseUrl 是必须的：下拉选中项由 `presetIdForProvider` 反推（仅看 baseUrl），若保留命中某预设的 baseUrl，下拉会立刻弹回那个预设、令「选自定义」无效（对抗性自检发现）；保留 model 是为了不丢用户已填的模型名（Kimi 外门 minor）。
- 始终 `...provider` 透传 `grantedOrigins`，不丢已授权域名。

### 2.3 下拉回显（`presetIdForProvider`，纯函数）
不新增持久字段；由当前 `provider` 反推选中项，保证侧栏重开/刷新后回显正确：
- `kind === 'anthropic'` → `anthropic`。
- openai-compatible：按 baseUrl 归一（去尾部 `/`）匹配预设；命中 → 该预设 id；空 baseUrl 或无匹配 → `custom`。

### 2.4 host 权限：复用现有保存流程，**不改 manifest**
manifest 已有 `optional_host_permissions: ['https://*/*']`。选中 moonshot.cn / deepseek / 智谱 等非静态域名后，保存时现有 `onSaveSettings`（openai-compatible + baseUrl → `requestHostPermission`）会当场弹窗申请；OpenAI/Anthropic 已静态授权，无需申请。无需新增逻辑。

---

## 3. 文件

| 文件 | 职责 |
|------|------|
| `src/core/providerPresets.ts`（新） | 预设清单 + `applyPreset` + `presetIdForProvider`（纯函数） |
| `src/components/SettingsPanel.tsx`（改） | 预设下拉取代「类型」下拉；选中即填；风险提示一行 |

---

## 4. 测试计划（TDD，`tests/unit/providerPresets.test.ts`）

- 预设清单含 7 项且顺序/baseUrl/defaultModel 正确；含 `custom`、`anthropic`。
- `applyPreset(moonshot-cn)` → openai-compatible + 对应 baseUrl + `moonshot-v1-8k`。
- `applyPreset(anthropic)` → kind anthropic + 默认模型 + baseUrl 清空。
- `applyPreset(custom)` → kind openai-compatible，**清空 baseUrl**（`undefined`）但**保留 model**；反推稳定为 `custom`。
- 切换预设覆盖 model：deepseek → openai，model 变为 `gpt-4o-mini`（不残留 `deepseek-chat`）。
- `applyPreset` 透传 `grantedOrigins`。
- `presetIdForProvider`：moonshot 含/不含尾斜杠都命中；anthropic 按 kind；空/未知 baseUrl → `custom`。

全套 `npm run lint && npm run test && npm run build` 必须绿。

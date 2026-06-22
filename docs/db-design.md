# 数据存储设计（本地）

## 状态

> **状态：** 待复审（已按 REVIEW-001 修订）  
> **作者：** Architect Agent  
> **最后更新：** 2026-06-17
>
> **v2 修订（2026-06-17）：** 补充本地存储写入失败/配额处理（ARCH-LOW-001）与导出隐私边界（ARCH-LOW-002）。

---

## 任务标注 ↔ GitHub Issue 对照

本文档中的 `TASK-XXX` 是逻辑任务 ID，对应仓库 GitHub Issue（任务的唯一事实源）。散文中的标注已就地附上 issue 链接；代码块内的标注 GitHub 不会自动链接，统一以下表为准：

| 任务 | Issue | 任务 | Issue |
|------|-------|------|-------|
| TASK-001 / 002 | #2 | TASK-006 | #8 |
| TASK-003 | #5 | TASK-007 | #9 |
| TASK-004 | #6 | TASK-008 | #10 |
| TASK-005 | #7 | TASK-009 | #11 |

> 另：开发前置技术验证（Spike，ADR-5）见 #3。

---

## 0. 说明：本产品没有服务端数据库

StoryBoard AI 是 **纯客户端、无账号** 的 Chrome 插件（见 [architecture.md](architecture.md) 第 0 节、ADR-0）。因此：

- **不存在服务端关系型数据库**，原模板里的 `users`、`sessions` 表 **不适用**，已删除（产品无账号、无服务端会话，那两张表是模板默认值，与本产品定位冲突）。
- 「数据设计」实际落在 **浏览器本地存储**：`chrome.storage.local` + IndexedDB。
- 各用户的数据天然隔离在各自本机，无跨用户泄露问题。

本文件描述本地存储的键空间、结构与版本/迁移策略；权威字段类型见 `src/core/models.ts`，结构详解见 architecture.md 第 5 节。

---

## 存储介质

| 属性 | 值 |
|------|-----|
| 主存储 | `chrome.storage.local`（结构化 JSON） |
| 密钥存储 | IndexedDB（仅存 **不可导出** 的 WebCrypto `CryptoKey`） |
| 服务端引擎 / ORM | 无（不适用） |

---

## 键空间（`chrome.storage.local`）

| 存储键 | 内容 | 关联 TASK |
|--------|------|-----------|
| `settings` | `{ params: GenerationParams, provider: ProviderConfig, schemaVersion }` | TASK-002（#2） |
| `apiKeyCipher` | `{ ciphertext, iv, alg }`（API Key 的 AES-GCM 密文，**不含明文**） | TASK-002（#2） / ADR-1 |
| `draft` | `{ text, updatedAt }`（未提交故事草稿） | TASK-001（#2） |
| `currentProject` | `Project`（见下） | TASK-003/004/005/006/007/008（#5、#6、#7、#8、#9、#10） |

### IndexedDB

| 库 / 对象仓库 | 内容 | 说明 |
|--------------|------|------|
| `storyboard-keys` / `aesKey` | WebCrypto `CryptoKey`（AES-GCM 256，`extractable: false`） | 解密 `apiKeyCipher`；原始密钥字节永不进入可读存储（ADR-1） |

---

## 结构：`currentProject`

> 字段名稳定，为未来「历史项目管理 / 导入」预留（TASK-008（#10） 要求 JSON 导出字段稳定）。

```jsonc
{
  "schemaVersion": 1,
  "story": "原始故事文本",
  "params": {
    "videoModel": "jimeng|keling|sora|runway|generic",
    "style": "string",
    "aspectRatio": "16:9|9:16|1:1|...",
    "shotDurationPref": "short|medium|long",
    "outputLanguage": "zh|en",
    "templateId": "cinematic-en|jimeng-keling-zh"
  },
  "characters": [
    { "id": "c1", "name": "string|null", "appearance": "统一外观描述" }
  ],
  "shots": [
    {
      "id": "s1", "index": 1,
      "summary": "概要", "shotSize": "景别", "cameraMovement": "运镜",
      "durationSuggestion": "时长建议", "prompt": "完整视频提示词（正向+负面）",
      "characterRefs": ["c1"], "editedByUser": false
    }
  ],
  "bgm": { "prompt": "BGM 提示词", "language": "zh|en" }
}
```

**设计要点：**
- 角色与镜头 **分离存储**，镜头通过 `characterRefs` 引用角色 id（TASK-005，#7）。
- `editedByUser` 保护用户手动编辑不被自动注入/再生成覆盖（TASK-005/006，#7、#8）。
- 单镜头编辑只改对应 `shots[i]`，不动其他镜头（TASK-006，#8）。

---

## 版本与迁移策略

- 每个顶层结构带 `schemaVersion`，当前为 **1**。
- 启动时由 `services/storage.ts` 做版本检查：低版本数据按迁移函数 `migrate(vN → vN+1)` 升级后写回。
- 迁移函数 **只增不毁**：新增字段给默认值，不静默删除用户已有数据。
- 升级到「多项目/历史」时：把 `currentProject` 迁移为 `projects[]` 并保留当前项目为首项（架构第 7 节扩展点）。

---

## 写入失败与容量处理（ARCH-LOW-001）

- `chrome.storage.local` 写入可能因配额超限或浏览器异常失败。所有写操作经 `services/storage.ts`，失败时返回可展示错误 `STORAGE_WRITE_FAILED`，UI 提示「本地保存失败（可能空间不足）」，**不静默丢数据**。
- 容量评估：单个 `currentProject`（5000 字故事 + ≤10 镜头 + 角色 + BGM）远小于 `chrome.storage.local` 配额，MVP 风险低。
- 未来扩展：引入「多项目 / 历史项目」后，若单结构变大，把 `currentProject`/`projects[]` 这类大对象迁移到 IndexedDB（`chrome.storage.local` 仅留轻量设置），迁移借助 `schemaVersion`。

---

## 导出隐私边界（ARCH-LOW-002）

导出（Markdown / JSON / 纯文本）的内容范围：

| 字段 | 是否导出 | 说明 |
|------|---------|------|
| `story` / `params` / `characters` / `shots` / `bgm` | ✅ | 创作内容，导出的主体 |
| API Key（明文或密文） | ❌ **绝不导出** | 安全红线 |
| Provider 凭据（`baseUrl` / `grantedOrigins`） | ❌ 默认不导出 | 可能暴露用户所用厂商或私有代理地址 |
| `model` 名 | ⚠️ 默认可含（属生成参数，非密钥） | 视为非敏感；若要更保守可排除，由 PO 决定 |

---

## 初始数据（Seed Data）

无需 seed。首次安装时：
- `settings` 用 `core/config.ts` 的默认参数初始化（默认模型名待 PO 确认，见 ADR-4）。
- `apiKeyCipher` 为空，UI 引导用户在 BYOK 设置中配置 Key。
- `currentProject` 为空，UI 展示空态。

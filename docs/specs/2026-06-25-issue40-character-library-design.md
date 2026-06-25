# Issue #40 设计文档 — 角色库（分类 + 复用）+ 角色固定改可选/可跳过

> **Issue：** #40 · **优先级：** P2 · **依赖：** #29 结构化角色卡；**与 #35 共用本地 storage 抽象**
> **分支：** `feature/issue-40-character-library` → `develop` · 2026-06-25 · merge-when-green

---

## 1. 目标与范围
让角色固定**可选、可跳过**，并提供**可复用、可分类**的角色库（本地、无凭据）。
**与 #35 共用一套本地集合抽象**（`services/collections.ts`），角色库与草稿库并列，避免两套存储实现。

## 2. 关键决策
### 2.1 通用本地集合抽象（新 `services/collections.ts`，#40+#35 共用）
`createLocalCollection<T extends CollectionRecord>(storageKey)` → `{ list, add, update, remove }`：
- `CollectionRecord = { id; createdAt; updatedAt }`；`add` 自动赋 id + 时间戳。
- 每 key 一把串行 RMW 锁（仿 `projectLock`），防并发覆盖；写失败 → `STORAGE_WRITE_FAILED`，不静默丢。
- 存 `chrome.storage.local[storageKey] = { items: T[] }`。**调用方只存非凭据数据**（ARCH-LOW-002）。

### 2.2 角色库（新 `services/characterLibrary.ts`，建于集合之上）
```ts
export type CharacterCategory = 'person' | 'animal' | 'plant' | 'other';
export interface CharacterLibraryItem extends CollectionRecord {
  category: CharacterCategory; name: string | null; appearance: string;
  profile?: CharacterProfile; seedPhrase?: string;   // 仅外观相关，绝不含 Key/baseUrl
}
```
- `saveCharacterToLibrary(character, category)` / `listCharacterLibrary(category?)` / `updateCharacterLibraryItem` / `removeCharacterLibraryItem`。
- `libraryItemToCharacter(item)`：库项 → `Omit<Character,'id'>`，经 `storage.addCharacter` 注入新项目（项目内 id 由 storage 赋）。

### 2.3 A. 固定改为可选/可跳过（`CharacterPanel`）
- 角色固定/锁定本就非生成必经步骤（生成即出分镜）。明确化：面板标题标「角色（可选，可跳过）」+ 一个「收起/展开」切换，收起即直达分镜；不强制完善字段（无字段必填校验）。

### 2.4 B/C. 角色库 UI（新 `components/CharacterLibrary.tsx`，接入 `CharacterPanel`）
- 每张角色卡新增「存入角色库」+ 分类下拉（人物/动物/植物/其它）。
- 「角色库」可展开区：分类筛选 + 列表；每项「用此角色」（→ `addCharacter` 注入当前项目）/「删除」/ 改分类（select）。
- 纯本地；隐私符合 ARCH-LOW-002（只存外观字段，无凭据）。

## 3. 文件
| 文件 | 职责 |
|------|------|
| `src/core/config.ts`（改） | STORAGE_KEYS 增 characterLibrary / projectDrafts |
| `src/services/collections.ts`（新） | 通用本地集合 CRUD + 锁（#40+#35 共用） |
| `src/services/characterLibrary.ts`（新） | 角色库（分类/复用，建于集合之上） |
| `src/components/CharacterLibrary.tsx`（新） | 角色库浏览/筛选/用/删/改分类 |
| `src/components/CharacterPanel.tsx`（改） | 存入角色库 + 分类 + 可选/收起 + 接入库浏览 |
| `src/sidepanel/App.tsx`（改） | 新增角色注入后同步内存态（复用 onCharacterAdded） |

## 4. 测试计划（TDD）
- **collections.test.ts**：add 赋 id/时间戳；list；update 仅改目标 + 刷新 updatedAt + 无匹配→null；remove；写失败→STORAGE_WRITE_FAILED；并发 add 串行不丢。
- **characterLibrary.test.ts**：save 存外观字段且**不含凭据**字段；list 按分类筛选；update 改分类；remove；`libraryItemToCharacter` 去库元数据。
- UI 复用已测服务，保持薄。

全套 `npm run lint && npm run test && npm run build` 必须绿。

## 5. 与 #35 协同
`createLocalCollection` 即 #35 草稿库的同一抽象——#35 用 `createLocalCollection<ProjectDraftItem>(STORAGE_KEYS.projectDrafts)`，无需第二套存储实现。

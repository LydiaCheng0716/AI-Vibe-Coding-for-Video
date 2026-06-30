# Issue #101 — 角色展开框内「删除」按钮（确认 + 可撤销）

## 背景 / 目标
角色面板（`CharacterPanel`）里每个角色卡（展开框）此前只有「锁定/解锁」「存入角色库」，没有删除入口——误建/不需要的角色无法移除。本 issue 为每个角色卡加「删除」按钮，带确认 + 可撤销，删除后从当前项目移除并同步刷新镜头角色注入，全程走 project store 保证 UI 与 storage 单一事实源一致。

## 范围确认
- 依赖（issue 原文）：`components/CharacterPanel.tsx`、`services/storage.ts`、`sidepanel/projectStore.tsx`——均为**当前项目角色**侧，不含独立的 `services/characterLibrary.ts` 集合。
- 故「从角色库移除」理解为「从当前项目角色清单移除」。独立角色库集合（#40）本就各自有删除入口，不在本 issue 触碰，避免按名字模糊匹配误删库项。

## 方案
### storage（单一事实源）
- `removeCharacter(id)`：projectLock 内 RMW，从 `project.characters` 过滤掉该 id，随后
  `reinjectGlobalStyle(reinjectCharacterConsistency(...))` 重注入——剥离已删角色残留锚点、刷新非编辑镜头
  （注入对缺失 id 安全跳过），并保住锁定的全局风格锚点（与 `updateCharacter` 同口径）。
  **保留镜头 `characterRefs` 原样**（不剥离）：注入跳过缺失 id 即可，留着可让「撤销」恢复角色后锚点自然回填。
  无项目/无匹配 → `ok(null)`。返回更新后 Project。
- `restoreCharacter(character, atIndex)`：撤销删除。按**原 id 与原位置**插回 `characters` 再重注入；
  原 id 使镜头里仍存的 `characterRefs` 自然重新锚定。同 id 已存在 → 幂等返回当前 Project。

### projectStore
- 新增 `removeCharacter` / `restoreCharacter`，均经 `mutateProject` 串行落库并发布最新 Project（UI 与 storage 一致）。

### UI（CharacterPanel）
- 每个 `CharacterCard` 头部「锁定」旁加「删除」按钮（红色描边，`aria-label=删除 角色 {name}`）。
- 确认 + 撤销由父级 `CharacterPanel` 持有（卡片删除即卸载，撤销态须在父级）：
  - 删除：`window.confirm` → `removeCharacter` → 暂存 `{character, index}` 显示「已删除角色「X」。撤销」提示条。
  - 撤销：`restoreCharacter(character, index)` 按原 id/位置插回。
- i18n：`common.undo`、`character.deleteAria/confirmDelete/deletedNotice`（zh/en 双份，`satisfies` 守卫保证不漏键）。

## 验收对照
- [x] 每个角色展开框内有「删除」按钮（确认 + 可撤销）
- [x] 删除后从当前项目移除，相关镜头角色注入相应更新（重注入剥离锚点）
- [x] 走 project store（单一数据源），删除后 UI 与 storage 一致
- [x] 与 #40 角色库风格一致（删除 UX 对齐）

## 测试
- storage：删除剥离被删角色锚点/保留其它角色锚点、无项目/无匹配 ok(null)、撤销按原 id/位置回填且锚点回填、同 id 幂等。
- 组件：确认后删除→storage 清空 + 出现撤销条→撤销恢复；取消确认不删除。

## 门禁
CTO 自评 → Kimi → Codex（外门带硬超时）。基线 develop，merge-when-green（CI：coverage + bundle 守卫 + e2e smoke）。

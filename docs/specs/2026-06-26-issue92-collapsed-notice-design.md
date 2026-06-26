# Issue #92 CharacterPanel 折叠态新增角色提示设计

## 问题

`CharacterPanel` 的「+ 新增角色」按钮通过 `CollapsiblePanel.headerRight` 渲染，因此面板折叠时仍然可见并可点击。新增失败时 `onAdd` 会调用 `setNotice(r.error.message)`，但当前 notice 位于 `CollapsiblePanel` 的 children 内。

`CollapsiblePanel` 折叠时只渲染 header，不渲染 children：

```tsx
{!isCollapsed && <div className={contentClassName}>{children}</div>}
```

因此折叠态点击「+ 新增角色」失败后，错误已经写入组件状态，但 DOM 中不可见，用户无法知道操作失败原因。

## 方案选择

采用方案 A：为 `CollapsiblePanel` 增加可选 `belowHeader?: ReactNode` 插槽。

该插槽渲染在 header 行下方，并且不受折叠状态控制。`CharacterPanel` 将面板级 notice 传入 `belowHeader`，从 children 中移除原 notice 渲染。

选择理由：

- 语义清晰：`headerRight` 发起的反馈属于 header 操作反馈，应拥有同样的常驻可见区域。
- 改动最小：不改 `addCharacter`、`onAdd`、`onUseFromLibrary` 等业务逻辑，只移动 notice 的渲染位置。
- 可复用：后续其它面板如有 header 常驻操作，可复用相同插槽，而不是在面板外手工拼接布局。

## 对其它面板的影响

`belowHeader` 是可选 prop。`StylePanel`、`DraftsPanel` 以及现有未传该 prop 的 `CollapsiblePanel` 调用保持原渲染路径：

- header 行不变；
- children 仍只在展开态渲染；
- 折叠态不额外产生 DOM；
- 持久化折叠逻辑不变。

## 回滚

如需回滚：

1. 从 `CollapsiblePanel` 删除 `belowHeader` prop 和对应渲染。
2. 将 `CharacterPanel` 的 notice 放回 children 顶部。
3. 删除 Issue #92 的折叠态 notice 测试。

回滚后会恢复原问题：折叠态 header 操作失败提示不可见。

## 测试清单

- 新增组件测试：`CharacterPanel` 折叠态点击「+ 新增角色」，当 `addCharacter` 写入失败时，错误 notice 仍可见。
- 现有 `CollapsiblePanel` 测试保持通过，证明未传 `belowHeader` 的面板行为不变。
- 全量门禁：
  - `npm run lint`
  - `npm run test`
  - `npm run test:coverage`
  - `npm run build`
  - `npm run check:bundle`

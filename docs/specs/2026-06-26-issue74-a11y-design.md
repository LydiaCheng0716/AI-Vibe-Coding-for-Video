# Issue #74 无障碍：键盘重排 + aria-label 设计

## 问题

StoryPop 的分镜列表当前支持鼠标拖拽重排，但键盘用户无法完成同等操作。`ShotList` 中每个镜头外层使用 `draggable` 与 drop 事件调用 `onMove(shotId, toIndex)`，但没有可 Tab 聚焦的上移/下移控件，也没有明确的列表语义或拖拽说明。

另外，`ShotList`、`ShotCard` 及其子组件中存在若干仅靠短文本、符号或 placeholder 传达含义的控件：

- `＋插入`、`复制`、`删除`、`撤销` 等短文本按钮缺少对象上下文。
- 转场类型下拉与转场备注输入没有明确 label。
- 镜头编辑 textarea、反馈输入、临时 API Key 输入只有 placeholder 或旁边文字。
- 首帧/转场批量按钮、单镜头首帧复制等按钮可读，但缺少更具体的对象描述。

## 方案

1. 复用既有 `onMove(shotId, toIndex)`，不新增重排算法，不绕过 `applyShots`。
2. 在每个镜头卡拖拽容器内、`ShotCard` 之前加入一组真实 `<button>`：
   - `上移` 调用 `onMove(s.id, i - 1)`。
   - `下移` 调用 `onMove(s.id, i + 1)`。
   - 首项禁用上移，末项禁用下移。
   - `disabled = busy || working` 时全部禁用。
3. 外层列表使用 `role="list"`，每个镜头区域使用 `role="listitem"`；保留现有 `draggable`，并给拖拽容器补充中文 `aria-label`。
4. 为短文本/符号按钮补充中文 `aria-label`，优先描述“动作 + 对象”，例如 `上移 镜头 2`、`删除 镜头 2`、`复制 镜头 2 中文提示词`。
5. 对没有可见 label 的输入和下拉使用 `aria-label`；已有包裹 `<label>` 的控件保持不变。
6. 不添加正数 `tabIndex`，让焦点顺序按 DOM 自然流动：插入条 -> 重排按钮 -> 镜头卡操作 -> 转场 -> 下一插入条。

## 键盘重排交互

- Tab 聚焦到某镜头的 `上移` 或 `下移` 按钮。
- Enter/Space 触发按钮。
- 触发后调用现有 `onMove`，由 `moveShot` 重新计算 `index`，由 `applyShots` 写入 store 并压入撤销栈。
- 移动后页面重新渲染，按钮名称随新序号更新；用户可继续 Tab 操作或点击列表级 `撤销`。

## ARIA 清单

- `ShotList`
  - 分镜容器：`role="list"`。
  - 单个镜头组：`role="listitem"`。
  - 拖拽容器：`aria-label="镜头 N，可拖拽或用上移/下移按钮重排"`。
  - `＋插入`：`aria-label="在当前位置插入镜头"`。
  - 插入描述输入：`aria-label="插入镜头描述"`。
  - `撤销`：`aria-label="撤销上一步结构操作，当前 N 步可撤销"`。
  - 批量按钮：补充批量生成对象说明。
  - 转场类型、中文/英文转场备注输入：补 `aria-label`。
  - 转场复制/清除：补充相邻镜头对象。
- `ShotCard`
  - 复制、编辑、删除按钮：补充镜头编号与内容对象。
  - 参数下拉已有可见包裹 label，保持。
  - 编辑 textarea：补 `aria-label`。
  - 反馈输入：补 `aria-label`。
  - 一次性 API Key 输入：补 `aria-label`。
  - 首帧生成/复制按钮：补充镜头编号与语言对象。
- `OneTimeKeyInput`
  - 组件保持透传 input props；由调用方提供 `aria-label`。

## 回滚

本变更只涉及 React 组件渲染与测试，不改 storage、services、core 逻辑。若出现回归，可回滚 `ShotList.tsx`、`ShotCard.tsx` 与对应测试；现有鼠标拖拽逻辑没有被移除，回滚风险低。

## 测试清单

- RED：新增测试先查找 `下移 镜头 1`、`上移 镜头 2` 等按钮，未实现前失败。
- 键盘/按钮重排：点击 `下移 镜头 1` 后，`getCurrentProject().shots` 顺序与 `index` 应为 `s2:1, s1:2, s3:3`。
- 撤销：点击列表级撤销后恢复 `s1:1, s2:2, s3:3`。
- 边界：首项上移禁用，末项下移禁用；单镜头时上下移均禁用。
- 全局禁用：`busy` 为 true 时上下移不可触发。
- ARIA 命中：用 `getByRole('button', { name: ... })` 命中新按钮和关键短文本按钮；用 `getByLabelText` 命中无可见 label 的输入/下拉。
- 收尾门禁：`npm run lint`、`npm run test`、`npm run build` 全绿。

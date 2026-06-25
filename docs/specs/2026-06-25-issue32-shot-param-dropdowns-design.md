# Issue #32 设计文档 — 镜头参数可调下拉，改后重写提示词

> **Issue：** #32 · **优先级：** P2 · **依赖：** #30 已建的重写管线（params 模式）；`ShotCard.tsx`、`core/models.ts`
> **分支：** `feature/issue-32-shot-param-dropdowns` → `develop` · 2026-06-25 · merge-when-green

---

## 1. 目标与范围
景别/运镜/时长改为可调下拉，改后**自动重写该镜头提示词**以反映新参数。**复用 #30 的 `rewriteShot({mode:'params'})`**——不新增重写逻辑。

## 2. 关键决策
### 2.1 参数选项（新 `core/shotParams.ts`，纯数据 + 纯函数）
- `SHOT_SIZE_OPTIONS` / `CAMERA_MOVEMENT_OPTIONS`：按输出语言（zh/en）的常用选项；`DURATION_OPTIONS`：`2s/3s/5s/8s/10s`（语言无关）。
- `withCurrent(options, current)`：把当前值并入选项（不在预设里则置顶），保证下拉能显示并保留模型给的自定义值，不丢值。

### 2.2 ShotCard 下拉 + 自动重写
- 把原静态「景别/运镜/时长」`<dl>` 换成三个 `<select>`（选项 = `withCurrent(OPTIONS[lang], 当前值)`，`lang=project.params.outputLanguage`）。
- 改任一参数 → 调 `rewriteShot({mode:'params', paramOverrides})`，**overrides 带齐三参数**（改的那个用新值，另两个用当前值）以「锁住未改参数」，不被模型重解释。
- 复用 #30 的同一 `doRewrite` 路径：压撤销栈、`replaceShot` 落库、`onShotChanged` 上提、`busy`/`rewritingRef` 防重入、不落盘一次性 Key、撤销可回退参数变更。
- 重写期间禁用下拉。

### 2.3 编辑结果与导出一致
`replaceShot` 落库后，导出（`core/export.ts`）读 `currentProject` → 参数与提示词一致；无需改导出。

## 3. 文件
| 文件 | 职责 |
|------|------|
| `src/core/shotParams.ts`（新） | 景别/运镜/时长选项 + `withCurrent`（纯函数） |
| `src/components/ShotCard.tsx`（改） | 三参数下拉 + 改后调 params 模式重写（复用 #30 doRewrite） |

## 4. 测试计划（TDD）
- **shotParams.test.ts**：zh/en 选项非空且含常用景别/运镜；`DURATION_OPTIONS` 含 5s；`withCurrent` 当前值不在预设 → 置顶且不重复，在预设 → 原样。
- 重写管线 params 模式已在 #30 `rewrite.test.ts` 覆盖（含空 override 回退）；本条 UI 复用，不重复后端测试。

全套 `npm run lint && npm run test && npm run build` 必须绿。

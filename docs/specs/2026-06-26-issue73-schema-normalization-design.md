# Issue #73 schemaVersion 治理：读时归一兜底 + 集合版本

## 问题

当前 `Project.schemaVersion` 已写入 `SCHEMA_VERSION = 1`，但中心读点 `getCurrentProject()` 直接返回存储对象，缺少读时迁移和缺省字段兜底。角色库、草稿库复用 `createLocalCollection<T>()`，集合读点直接返回 `store.items`，旧记录缺少 `id/createdAt/updatedAt` 或混入脏项时没有统一治理入口。

本 Issue 是 P3 加固：当前 v1 数据行为必须不变，只为未来破坏性 schema 演进建立纯函数迁移框架和读时兜底。

## 方案

新增 `src/core/migrations.ts`，集中提供 `normalizeProject(raw: unknown): Project | null`：

- `raw` 非普通对象或数组时返回 `null`。
- 读取 `stored.schemaVersion ?? 0`，非有限数字按 `0` 处理。
- 当版本低于当前 `SCHEMA_VERSION` 时，按 `migrations[version]` 逐级执行 `vN -> vN+1`；当前 v1 没有破坏性迁移，迁移表可为空。
- 当存储版本高于 `SCHEMA_VERSION` 时不降级、不执行迁移，只做结构兜底并保留原版本号。
- 最后补齐安全默认字段，保留已有字段优先，强制当前或历史版本数据的 `schemaVersion = SCHEMA_VERSION`。

`storage.ts` 的 `getCurrentProject()` 改为读出 unknown 后调用 `normalizeProject()`，归一失败返回 `null`。不回写 storage，保持读时归一。

`collections.ts` 的 `createLocalCollection<T>()` 增加第二个可选参数 `{ normalize?: (raw: unknown) => T | null }`。默认不传时维持现有行为：只做 `Array.isArray(store?.items)` 守卫并原样返回。传入 normalize 时，对每项先补齐集合元字段，再调用业务归一钩子，返回 `null` 的脏项被过滤。

## 迁移框架契约

- 迁移函数必须是纯函数，输入输出均为普通数据对象，不读写 storage。
- `migrations` 的 key 表示起始版本，例如 `migrations[1]` 负责 `v1 -> v2`。
- 逐级循环只在 `storedVersion < SCHEMA_VERSION` 时执行；缺少某级迁移函数时跳过该级，仍继续推进循环。
- `version > SCHEMA_VERSION` 的未来数据不降级：不执行迁移，保留未来 `schemaVersion`，只补安全默认字段。
- 默认补字段不丢已有数据：`story` 默认空字符串，`params` 合并 `defaultParams()`，`characters/shots` 非数组时给空数组，`bgm/globalStyle` 等 optional 字段存在则保留。

## 回滚与兼容性

本改动只改变读路径和纯函数模块，不修改写入格式，不主动回写存储。若出现异常，可回滚 `getCurrentProject()` 接入与 `createLocalCollection` 新参数，已有 storage 数据无需迁移回滚。

默认集合调用方不传 normalize 时行为不变；新参数是向后兼容扩展。项目读时归一只补缺省字段，当前 v1 完整数据返回内容应保持等价。

## 测试清单

- `normalizeProject`
  - 旧格式缺字段对象被补齐，已有字段不丢。
  - 非对象、数组、null 返回 `null`。
  - 缺失 `schemaVersion` 按 0 处理并归一到当前版本。
  - 未来版本号不降级。
- `getCurrentProject`
  - storage 中放缺 optional/新增字段的旧 project，读取不崩并补齐字段。
- `createLocalCollection`
  - 传 normalize 时，旧记录缺 `createdAt/updatedAt` 可读出并补齐 `id/createdAt/updatedAt`。
  - normalize 返回 `null` 的脏项被丢弃。
  - 默认不传 normalize 时维持原样读取。

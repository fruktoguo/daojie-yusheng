# next 替换进度清单

更新时间：2026-04-16（本轮已同步到 `total=70`）

## 说明

- 这份清单按仓库内全部 next 任务锚点聚合生成。
- 统计范围：`packages/`、`docs/`、`.github/workflows/`、`scripts/`、`legacy/`，排除 `dist` 与 `node_modules`。
- 当前总计：`70` 条 next 任务锚点
- 当前任务编号：`31` 个
- 这里的“密度”表示 TODO 锚点数量，不等于真实工作量，但能反映当前替换卡点最集中的区域。

## 总览

按顶层区域看：

| 区域 | TODO 数量 | 说明 |
| --- | ---: | --- |
| `packages/server` | 45 | 真源替换、协议/同步、GM/admin 与 runtime 尾项最集中 |
| `packages/client` | 22 | 主要是 UI patch-first 与主入口收口尾项 |
| `packages/shared` | 0 | shared 旧模型兼容桥尾项已清空 |
| `docs` | 3 | 完成定义、运维口径、替换策略定稿 |
| `.github` | 0 | workflow 内联 TODO 已清空 |

按高密度模块看：

| 模块 | TODO 数量 | 密度判断 |
| --- | ---: | --- |
| `packages/client/src/ui` | 10 | 高 |
| `packages/server/src/network` | 18 | 高 |
| `packages/server/src/http/next` | 9 | 高 |
| `packages/client/src/ui/panels` | 12 | 高 |
| `packages/server/src/tools` | 6 | 中 |
| `packages/server/src/runtime` | 6 | 中 |
| `packages/server/src/persistence` | 3 | 中 |
| `docs` | 3 | 中 |

## 高密度未完成区域

### 1. client UI patch-first 尾项

- `UI01`：`10`
- `UI06`：`4`
- `UI05`：`3`
- `UI02/UI03/UI04`：`5`
- 合计：`22`

当前最密集文件带：

- `packages/client/src/ui/panels/*`
- `packages/client/src/ui/*-modal.ts`
- `packages/client/src/main.ts`
- `packages/client/src/gm.ts`

结论：`client-next` 主链已在跑，但 UI 层仍是 next 替换尾项最密集区域之一，核心问题是固定壳体、局部 patch、modal recipe、移动端/主题回归没有完全收口。

### 2. server network 真源替换与 legacy 退役

- `T01-T08`：`12`
- `T15-T20`：`6`
- `PERF01`：`3`
- 合计：`21`

当前最密集文件带：

- `packages/server/src/network/world-player-*`
- `packages/server/src/network/world-session-*`
- `packages/server/src/network/world.gateway.js`
- `packages/server/src/network/world-sync.service.js`
- `packages/server/src/network/world-projector.service.js`

结论：这是 next 替换的主阻塞面，集中在 `auth/token/bootstrap/snapshot/session` 真源、legacy socket/JWT/compat verifier 退出，以及首包/投影/同步热路径。

### 3. server proof / ops / GM-admin 完成定义

- `T09-T14`：`18`
- 合计：`20`

当前最密集文件带：

- `packages/server/src/tools/*`
- `packages/server/src/tools/next-auth-bootstrap-smoke/*`
- `packages/server/TESTING.md`
- `docs/server-next-operations.md`
- `packages/server/src/http/next/next-gm-*.js`

结论：现在不是“没有 proof”，而是 proof、workflow、runbook、GM/admin/restore 的完成定义还没完全钉死。

### 4. 持久化 / runtime 架构尾项

- `PERSIST01-PERSIST03`：`2`
- `ARCH01/ARCH02`：`3`
- `REFACTOR01/REFACTOR02`：`2`
- `DATA01`：`1`
- 合计：`8`

当前最密集文件带：

- `packages/server/src/persistence/*`
- `packages/server/src/runtime/world/world-runtime.service.js`
- `packages/server/src/runtime/player/player-runtime.service.js`
- `packages/server/src/runtime/craft/craft-panel-runtime.service.js`

结论：这部分不一定最显眼，但直接决定 next 是否能真正从迁移态进入稳定真源。

### 5. shared / content 迁移桥

- 合计：`0`

当前最密集文件带：

- 无

结论：shared 旧模型桥和旧密码 hash 兼容都已经清空，这条迁移主线当前不再是阻塞面。

## 任务编号清单

密度标签：

- `高`：`>= 6`
- `中`：`3 - 5`
- `低`：`1 - 2`

| 任务号 | 数量 | 密度 | 当前主要区域 |
| --- | ---: | --- | --- |
| `T13` | 14 | 高 | GM/admin/restore 与 GM HTTP 面是否彻底 next-native 化的定稿 |
| `UI01` | 10 | 高 | client UI patch-first 主体面板与 detail host |
| `UI06` | 4 | 中 | client 各类 modal / bodyHtml 模板装载尾项 |
| `PERF01` | 3 | 中 | projector / world-sync / player-runtime 热路径比较 |
| `T07` | 3 | 中 | session 真源与 detached/reuse/reaper contract |
| `T05` | 3 | 中 | connect_token / hello / guest / GM 单线 bootstrap |
| `UI05` | 3 | 中 | inventory / quest / settings 的 recipe 收口 |
| `ARCH01` | 2 | 低 | strict TS / env alias 收口 |
| `T02` | 2 | 低 | WorldPlayerSourceService / legacy player repository 退出 |
| `T04` | 2 | 低 | snapshot 真源只读 next-native |
| `T09` | 2 | 低 | backup-persistence 真实 DB proof |
| `T10` | 2 | 低 | destructive backup/restore 维护窗口 proof |
| `UI03` | 2 | 低 | GM 前端主入口与前端手工验证清单 |
| `UI04` | 2 | 低 | GM 编辑器 / GM 世界查看器局部更新 |
| `ARCH02` | 1 | 低 | online/runtime/Redis/DB 真源分层 |
| `ARCH04` | 1 | 低 | `*-next` 包名与脚本命名回归 |
| `DATA01` | 1 | 低 | craft/content 真源目录与 legacy-content 命名退出 |
| `PERSIST02` | 1 | 低 | player flush dirty 分发与失败恢复 |
| `PERSIST03` | 1 | 低 | map flush dirty 分发与失败恢复 |
| `REFACTOR01` | 1 | 低 | world-runtime 巨型模块拆分 |
| `REFACTOR02` | 1 | 低 | player-runtime 职责拆分 |
| `T03` | 1 | 低 | authenticated snapshot compat fallback 继续退出 |
| `T06` | 1 | 低 | guest / authenticated / GM 错误码与恢复 contract |
| `T15` | 1 | 低 | Bootstrap + MapStatic + PanelDelta 首包重复字段 |
| `T16` | 1 | 低 | projector 改为 slice / revision 驱动 |
| `T17` | 1 | 低 | panel/attr bonus revision 与 invalidation |
| `T18` | 1 | 低 | minimap marker 预处理 / 事件驱动刷新 |
| `T19` | 1 | 低 | tick / AOI / projector / sync 基准门禁 |
| `T20` | 1 | 低 | PlayerState / projector slice 扩展边界 |
| `UI02` | 1 | 低 | client 主入口拆薄 |

## 按替换主线的进度清单

- [ ] `auth/token/bootstrap/player-source/session` 真源主线完全 next-native
  - 对应：`T01-T08`
  - 当前密度：`11`
- [x] legacy 对外入口与 compat 真源桥完全退役
  - 对应：`MIGRATE01`
  - 当前密度：`0`
- [ ] GM/admin/restore / acceptance / workflow 完成定义钉死
  - 对应：`T09-T14`
  - 当前密度：`20`
- [ ] 首包 / projector / sync / runtime 热路径进入长期稳定结构
  - 对应：`T15-T20`、`PERF01`
  - 当前密度：`9`
- [ ] flush / runtime 分层与持久化边界彻底收口
  - 对应：`PERSIST01-PERSIST03`、`ARCH02`
  - 当前密度：`3`
- [ ] client-next UI patch-first 与 modal recipe 长尾收完
  - 对应：`UI01-UI06`
  - 当前密度：`22`
- [x] shared-next 旧模型兼容桥退出
  - 对应：`MIGRATE01`
  - 当前密度：`0`

## 当前最需要盯的高密度文件带

- `packages/client/src/ui/panels/`
- `packages/client/src/ui/`
- `packages/server/src/network/`
- `packages/server/src/tools/`
- `packages/server/src/http/next/`
- `packages/server/src/persistence/`
- `packages/server/src/runtime/world/`
- `packages/shared/src/`

## 使用建议

- 如果目标是继续推进替换主线，优先顺序仍应是：
  1. `server network/auth/session` 真源
  2. `GM/admin/ops/proof` 完成定义
  3. `client UI` 高密度 patch-first 尾项
  4. `shared/persistence` 迁移桥退出

- 如果目标是快速找“最密集未完成区”，先看：
  - `T13`
  - `UI01`
  - `UI06`
  - `T07`

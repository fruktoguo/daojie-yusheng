# next 替换阻塞看板

更新时间：2026-04-16 16:57 CST

## 口径

- 数据来源：仓库当前全部 `TODO(next:...)`
- 统计范围：`packages/`、`docs/`、`.github/workflows/`、`scripts/`、`legacy/`
- 当前总量：`131`

这份看板只回答两件事：

1. 当前 `TODO(next:...)` 主要堆在哪些模块
2. 后续应该按什么优先级车道去收敛这些迁移尾项

关联文档：

- 详细任务统计：[next-replacement-progress-checklist.md](./next-replacement-progress-checklist.md)
- 按 legacy 基线映射的任务桶说明：[next-migration-board.md](./next-migration-board.md)
- 按 `server/client/shared` 分区的 packages 基线：[next-package-migration-board.md](./next-package-migration-board.md)

## 模块热区

| 模块带 | TODO 数量 | 结论 |
| --- | ---: | --- |
| `packages/server/src/network` | 28 | 真源替换、bootstrap、session、sync/projector 与协议下发薄壳仍是最大阻塞区 |
| `packages/server/src/tools` | 16 | proof / smoke / acceptance / replace-ready 证据链仍在收口 |
| `packages/client/src/ui` | 14 | modal 与通用 UI 壳体尾项密集 |
| `packages/server/src/http/next` | 14 | GM/admin/account/restore 的对外 contract 还在迁移态壳层 |
| `packages/client/src/ui/panels` | 12 | patch-first 与业务 recipe 仍未收完 |
| `packages/shared/src` | 9 | shared 合同、旧模型桥、protobuf/类型一致性仍有尾项 |
| `packages/server/src/runtime` | 8 | world/player/runtime 架构与在线态分层仍在迁移态 |
| `docs` | 7 | 运维、完成定义与策略说明还未完全钉死 |
| `packages/server/src/persistence` | 6 | persistent_documents 过渡态仍明显 |
| `.github/workflows` | 5 | 仍有 legacy 构建链与 deploy proof 尾项 |

## 优先级车道

### L0 真源硬阻塞

这些桶不收掉，就不能说 next 主链已可替换 legacy：

- `T01`
- `T02`
- `T03`
- `T04`
- `T05`
- `T06`
- `T07`

主模块分布：

- `packages/server/src/network`
- `packages/client/src/network`
- `packages/server/src/http/next`

### L1 高阻塞收口

这些桶不一定当天阻断运行，但会阻断“安全替换 / 删 legacy / 正式接班”：

- `MIGRATE01`
- `T13`
- `T22`
- `T23`
- `T24`
- `T25`
- `PERSIST01`
- `T15`
- `T16`
- `T17`
- `T20`

主模块分布：

- `packages/server/src/network`
- `packages/server/src/http/next`
- `packages/server/src/persistence`
- `packages/server/src/tools`
- `packages/shared/src`
- `.github/workflows`

### L2 中阻塞尾项

这些桶不阻断最小可运行替换，但会显著影响稳定性、性能或体验对齐：

- `UI01`
- `UI02`
- `UI03`
- `UI04`
- `UI05`
- `UI06`
- `PERF01`
- `PERSIST02`
- `PERSIST03`
- `ARCH01`
- `ARCH02`
- `DATA01`
- `REFACTOR01`
- `REFACTOR02`
- `T08`
- `T09`
- `T10`
- `T11`
- `T12`
- `T14`
- `T18`
- `T19`

主模块分布：

- `packages/client/src/ui`
- `packages/client/src/ui/panels`
- `packages/server/src/runtime`
- `packages/server/src/tools`
- `packages/server/src/persistence`

### L3 低阻塞治理项

- `ARCH04`

这类问题应当放在主链稳定以后统一收尾。

## 任务桶分布表

| 任务桶 | TODO 数量 | 主要模块分布 | 优先级车道 |
| --- | ---: | --- | --- |
| `T13` | 14 | `server/http-next`、`server/http`、`server/runtime/gm`、`server/network` | `L1` |
| `MIGRATE01` | 13 | `workflows`、`docs`、`shared`、`client/ui`、`server/http-next`、`server/auth` | `L1` |
| `UI01` | 10 | `client/ui`、`client/ui/panels` | `L2` |
| `UI06` | 10 | `client/ui`、`client/ui/panels` | `L2` |
| `T24` | 9 | `docs`、`shared`、`server/runtime`、`server/network`、`server/health` | `L1` |
| `T23` | 7 | `shared`、`server/network`、`server/tools` | `L1` |
| `T01` | 6 | `server/http-next`、`server/network` | `L0` |
| `T25` | 6 | `packages/server/TESTING.md`、`server/tools` | `L1` |
| `PERSIST01` | 4 | `server/persistence`、`server/http-next` | `L1` |
| `PERF01` | 3 | `server/runtime`、`server/network` | `L2` |
| `T05` | 3 | `client/network`、`server/network` | `L0` |
| `T11` | 3 | `packages/server/TESTING.md`、`server/tools` | `L2` |
| `UI05` | 3 | `client/ui/panels` | `L2` |
| `ARCH01` | 2 | `packages/server/src/config/env-alias.js`、`packages/server/NEXT-GAP-ANALYSIS.md` | `L2` |
| `T02` | 2 | `server/network` | `L0` |
| `T04` | 2 | `server/persistence`、`server/network` | `L0` |
| `T07` | 2 | `server/tools`、`server/network` | `L0` |
| `T09` | 2 | `server/tools` | `L2` |
| `T10` | 2 | `server/tools` | `L2` |
| `T12` | 2 | `docs`、`server/tools` | `L2` |
| `T14` | 2 | `workflows`、`docs` | `L2` |
| `T22` | 2 | `shared` | `L1` |
| `UI03` | 2 | `docs`、`packages/client/src/gm.ts` | `L2` |
| `UI04` | 2 | `packages/client/src/gm-world-viewer.ts`、`packages/client/src/gm-map-editor.ts` | `L2` |
| `ARCH02` | 1 | `server/runtime` | `L2` |
| `ARCH04` | 1 | `docs` | `L3` |
| `DATA01` | 1 | `server/runtime` | `L2` |
| `PERSIST02` | 1 | `server/persistence` | `L2` |
| `PERSIST03` | 1 | `server/persistence` | `L2` |
| `REFACTOR01` | 1 | `server/runtime` | `L2` |
| `REFACTOR02` | 1 | `server/runtime` | `L2` |
| `T03` | 1 | `server/network` | `L0` |
| `T06` | 1 | `server/network` | `L0` |
| `T08` | 1 | `server/network` | `L2` |
| `T15` | 1 | `server/network` | `L1` |
| `T16` | 1 | `server/network` | `L1` |
| `T17` | 1 | `server/network` | `L1` |
| `T18` | 1 | `server/network` | `L2` |
| `T19` | 1 | `server/tools` | `L2` |
| `T20` | 1 | `server/network` | `L1` |
| `UI02` | 1 | `packages/client/src/main.ts` | `L2` |

## 直接执行顺序

后续如果要按优先级快速收敛，建议就按下面的顺序推进：

1. `L0`
   先清 `T01-T07`
2. `L1`
   再清 `MIGRATE01 / T13 / T22 / T23 / T24 / T25 / PERSIST01 / T15-T20`
3. `L2`
   最后成批压 `client UI`、runtime/perf、proof/ops 尾项
4. `L3`
   命名与治理类收尾最后做

## 结论

如果只看当前阻塞面，最值得优先盯的不是“TODO 最多的单文件”，而是下面三个模块带：

1. `packages/server/src/network`
2. `packages/server/src/tools` + `packages/server/src/http/next`
3. `packages/client/src/ui` + `packages/client/src/ui/panels`

它们合起来就是现在 next 替换最核心的堵点：主链真源、证明链闭环、以及前端交互收口。

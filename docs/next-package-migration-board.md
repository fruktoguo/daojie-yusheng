# next packages 迁移基线看板

更新时间：2026-04-16 16:57 CST

## 说明

- 这份看板只统计 `packages/server`、`packages/client`、`packages/shared` 内的 `TODO(next:...)`。
- 当前 packages 内总量：`119`
- 其中：
  - `packages/server`：`79`
  - `packages/client`：`31`
  - `packages/shared`：`9`
- `docs`、`.github/workflows` 等 packages 外尾项当前还有 `12` 条，单独放在文末，避免和源码收敛优先级混在一起。

## 总览

| 区域 | TODO 数量 | 当前最密任务桶 | 结论 |
| --- | ---: | --- | --- |
| `server` | 79 | `T13=13`、`T01=6`、`T24=6`、`T25=6`、`T23=5` | 主链真源、GM/admin/restore、proof 和 compat 退役仍是第一优先级 |
| `client` | 31 | `UI01=10`、`UI06=10`、`MIGRATE01=3`、`UI05=3` | 主要卡在 patch-first / modal recipe 长尾，外加少量迁移兼容口径 |
| `shared` | 9 | `MIGRATE01=3`、`T22=2`、`T23=2`、`T24=2` | 数量不大，但都是 shared 合同和旧模型桥边界 |

## Server

热区先看：

- `packages/server/src/network`：`28`
- `packages/server/src/tools`：`16`
- `packages/server/src/http/next`：`14`
- `packages/server/src/runtime`：`8`
- `packages/server/src/persistence`：`6`

| 任务桶 | 数量 | 主要含义 |
| --- | ---: | --- |
| `T13` | 13 | GM/admin/restore 与 GM HTTP 面长期形态未定稿 |
| `T24` | 6 | legacy/compat/JWT/常量桥退役仍未收口 |
| `T25` | 6 | replace-ready / smoke / acceptance 证据链仍在补 |
| `T01` | 6 | auth HTTP contract、token 真源与账号自助接口仍在主链上 |
| `PERSIST01` | 4 | player identity / snapshot / persistent_documents 真源收口 |
| `PERF01` | 3 | world-sync / projector / runtime 热路径收敛 |
| `T11` | 3 | TESTING / smoke-suite / boundary audit 口径同步 |
| `ARCH01` | 2 | strict / env alias 收口 |
| `MIGRATE01` | 2 | server 侧旧 hash / bot 命名等兼容桥 |
| `T02` | 2 | player source / legacy repository 退出 |
| `T04` | 2 | snapshot compat 回读退出 |
| `T05` | 2 | bootstrap / hello / session contract 收口 |
| `T07` | 2 | session 真源与 detached/reuse/reaper contract |
| `T09` | 2 | backup-persistence proof |
| `T10` | 2 | destructive backup/restore proof |
| `T23` | 5 | protocol audit 与 shared/runtime 一致性检查 |

低密尾项：

- `ARCH02`
- `DATA01`
- `PERSIST02`
- `PERSIST03`
- `REFACTOR01`
- `REFACTOR02`
- `T03`
- `T06`
- `T08`
- `T12`
- `T15`
- `T16`
- `T17`
- `T18`
- `T19`
- `T20`

## Client

热区先看：

- `packages/client/src/ui`：`14`
- `packages/client/src/ui/panels`：`12`
- `packages/client/src/network`：`1`

| 任务桶 | 数量 | 主要含义 |
| --- | ---: | --- |
| `UI01` | 10 | 主面板 patch-first、detail/list/toolbars 仍未收完 |
| `UI06` | 10 | modal/bodyHtml 模板装载尾项最多 |
| `MIGRATE01` | 3 | token/chat storage/login 迁移兼容口径仍在观察窗口 |
| `UI05` | 3 | inventory/quest/settings 的业务 recipe 收口 |
| `UI04` | 2 | GM viewer / map editor 局部更新 |
| `T05` | 1 | socket bootstrap / hello / reconnect 编排 |
| `UI02` | 1 | client 主入口拆薄 |
| `UI03` | 1 | GM 前端主入口收口 |

## Shared

热区先看：

- `packages/shared/src`：`9`

| 任务桶 | 数量 | 主要含义 |
| --- | ---: | --- |
| `MIGRATE01` | 3 | `aura/monster/technique` 旧模型兼容桥仍在 |
| `T22` | 2 | shared 协议字段新增门禁 |
| `T23` | 2 | protocol / protobuf / audit 一致性检查 |
| `T24` | 2 | shared 常量旧入口桥退役 |

## 下一轮优先级

1. 先清 `server`
   - 第一批直接看 `T01-T07`
   - 第二批看 `T13 / T24 / T25 / PERSIST01`
2. 再清 `client`
   - 优先 `UI01 / UI06`
   - 再看 `MIGRATE01 / UI05 / UI04`
3. 最后清 `shared`
   - 优先 `MIGRATE01 / T22 / T23 / T24`

## Packages 外尾项

这部分不是 next 源码本体，但会影响替换完成定义：

- `MIGRATE01`：`5`
- `T14`：`2`
- `ARCH04`：`1`
- `T12`：`1`
- `T13`：`1`
- `T24`：`1`
- `UI03`：`1`

关联文档：

- [next-replacement-blocker-board.md](./next-replacement-blocker-board.md)
- [next-migration-board.md](./next-migration-board.md)
- [next-replacement-progress-checklist.md](./next-replacement-progress-checklist.md)

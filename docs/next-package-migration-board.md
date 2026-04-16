# next packages 迁移基线看板

更新时间：2026-04-16（本轮已同步到 `total=70`）

## 说明

- 这份看板只统计 `packages/server`、`packages/client`、`packages/shared` 内的 next 任务锚点。
- 当前 packages 内总量：`67`
- 其中：
  - `packages/server`：`45`
  - `packages/client`：`22`
  - `packages/shared`：`0`
- `docs`、`.github/workflows` 等 packages 外尾项当前还有 `3` 条，单独放在文末，避免和源码收敛优先级混在一起。

## 总览

| 区域 | TODO 数量 | 当前最密任务桶 | 结论 |
| --- | ---: | --- | --- |
| `server` | 45 | `T13=13`、`T07=3`、`PERF01=3` | 主链真源、GM/admin/restore 仍是第一优先级 |
| `client` | 22 | `UI01=10`、`UI06=4`、`UI05=3`、`UI04=2` | 主要卡在 patch-first / modal recipe 长尾，迁移兼容口径已基本退出 client 主链 |
| `shared` | 0 | 无 | shared 旧模型桥已清空 |

## Server

热区先看：

- `packages/server/src/network`：`18`
- `packages/server/src/tools`：`6`
- `packages/server/src/http/next`：`9`
- `packages/server/src/runtime`：`6`
- `packages/server/src/persistence`：`3`

| 任务桶 | 数量 | 主要含义 |
| --- | ---: | --- |
| `T13` | 13 | GM/admin/restore 与 GM HTTP 面长期形态未定稿 |
| `PERF01` | 3 | world-sync / projector / runtime 热路径收敛 |
| `ARCH01` | 2 | strict / env alias 收口 |
| `T02` | 2 | player source / legacy repository 退出 |
| `T04` | 2 | snapshot compat 回读退出 |
| `T05` | 2 | bootstrap / hello / session contract 收口 |
| `T07` | 3 | session 真源与 detached/reuse/reaper contract |
| `T09` | 2 | backup-persistence proof |
| `T10` | 2 | destructive backup/restore proof |
低密尾项：

- `ARCH02`
- `DATA01`
- `PERSIST02`
- `PERSIST03`
- `REFACTOR01`
- `REFACTOR02`
- `T03`
- `T06`
- `T15`
- `T16`
- `T17`
- `T18`
- `T19`
- `T20`

## Client

热区先看：

- `packages/client/src/ui`：`10`
- `packages/client/src/ui/panels`：`12`
- `packages/client/src/network`：`1`

| 任务桶 | 数量 | 主要含义 |
| --- | ---: | --- |
| `UI01` | 10 | 主面板 patch-first、detail/list/toolbars 仍未收完 |
| `UI06` | 4 | modal/bodyHtml 模板装载尾项仍有剩余 |
| `UI05` | 3 | inventory/quest/settings 的业务 recipe 收口 |
| `UI04` | 2 | GM viewer / map editor 局部更新 |
| `T05` | 1 | socket bootstrap / hello / reconnect 编排 |
| `UI02` | 1 | client 主入口拆薄 |
| `UI03` | 1 | GM 前端主入口收口 |

## Shared

热区先看：

- `packages/shared/src`：`0`
## 下一轮优先级

1. 先清 `server`
   - 第一批直接看 `T01-T07`
   - 第二批看 `T13 / T15-T20`
2. 再清 `client`
   - 优先 `UI01 / UI06`
   - 再看 `UI05 / UI04`
3. 最后清 `shared`
   - 当前已无 packages/shared 内联 TODO

## Packages 外尾项

这部分不是 next 源码本体，但会影响替换完成定义：

- `ARCH04`：`1`
- `T13`：`1`
- `UI03`：`1`

关联文档：

- [next-replacement-blocker-board.md](./next-replacement-blocker-board.md)
- [next-migration-board.md](./next-migration-board.md)
- [next-replacement-progress-checklist.md](./next-replacement-progress-checklist.md)

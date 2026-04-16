# next packages 迁移基线看板

更新时间：2026-04-16（改按 blocker 组统计）

## 说明

- 当前 packages 内 blocker 总量：`5`
- 其中：
  - `packages/server`：`3`
  - `packages/client`：`1`
  - `packages/shared`：`1`
- packages 外尾项当前还有 `1` 条：文档与 workflow 口径同步

## Server

热区先看：

- `packages/server/src/network`：`2`
- `packages/server` proof / ops：`1`

| blocker 桶 | 数量 | 主要含义 |
| --- | ---: | --- |
| auth/bootstrap 真源 | 1 | 仍依赖 compat JWT / legacy player source |
| world sync / first package / projector | 1 | 首包与同步链尾项仍明显 |
| proof / ops | 1 | with-db、acceptance、full、shadow 仍待本轮环境复证 |

## Client

| blocker 桶 | 数量 | 主要含义 |
| --- | ---: | --- |
| patch-first / alias 尾项 | 1 | 主链已 next-native，但部分面板仍未完全局部 patch |

## Shared

| blocker 桶 | 数量 | 主要含义 |
| --- | ---: | --- |
| 字段级全链路硬门禁 | 1 | `T22/T23` 仍未完成，新增字段还没有完全自动覆盖护栏 |

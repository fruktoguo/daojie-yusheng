# server-next 当前缺口分析

更新时间：2026-04-11（当前轮次）

这份文件已经不再维护包内长版缺口分析，只保留一个稳定入口，方便从 `packages/server-next` 目录继续跳到仓库级权威文档。

## 当前口径

- 当前剩余任务：`25` 项
- 当前保守剩余：`35% - 40%`
- 当前最关键的阻塞仍是 `auth/token/bootstrap/snapshot/session` 真源主线
- `GM/admin/restore/shadow` 目前更像证明链与运维门禁问题，不是单纯缺脚本
- `首包 / projector / sync / shared-next` 仍是性能与稳定性尾项

## 文档分工

- 仓库级总入口与权威缺口分析看 [docs/next-gap-analysis.md](/home/yuohira/mud-mmo/docs/next-gap-analysis.md)
- 任务粒度、依赖关系、当前轮次进展看 [docs/next-remaining-task-breakdown.md](/home/yuohira/mud-mmo/docs/next-remaining-task-breakdown.md)
- 执行顺序、完成定义、批次拆分看 [docs/next-remaining-execution-plan.md](/home/yuohira/mud-mmo/docs/next-remaining-execution-plan.md)
- 一页摘要版工程账本看 [docs/next-remaining-engineering-ledger.md](/home/yuohira/mud-mmo/docs/next-remaining-engineering-ledger.md)
- legacy 清理门槛看 [docs/next-legacy-removal-checklist.md](/home/yuohira/mud-mmo/docs/next-legacy-removal-checklist.md)

## 这份包内文件的职责

这个文件只做两件事：

1. 给 `server-next` 包内读文档的人提供一个最短入口。
2. 明确包内文档和仓库级 `docs/next-gap-analysis.md` 的分工，不再重复维护一份同内容长文。

如果你要继续推进具体改造，优先看仓库级 `docs/next-gap-analysis.md`，然后按 `T11 / T12 / T25 -> T01 / T03 / T05 / T07 -> T15 / T16 / T19 / T22` 的顺序往下做。

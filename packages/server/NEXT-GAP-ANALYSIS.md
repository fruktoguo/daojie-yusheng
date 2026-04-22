# server 当前缺口分析

更新时间：2026-04-11（当前轮次）

这份文件已经不再维护包内长版缺口分析，只保留一个稳定入口，方便从 `packages/server` 目录继续跳到仓库级权威文档。

## 当前口径

- 当前剩余任务：`25` 项
- 当前保守剩余：`35% - 40%`
- 当前最关键的阻塞仍是 `auth/token/bootstrap/snapshot/session` 真源主线
- `GM/admin/restore/shadow` 目前更像证明链与运维门禁问题，不是单纯缺脚本
- `首包 / projector / sync / shared-next` 仍是性能与稳定性尾项
- `server` 的 `env-alias` 核心配置入口已迁入 TypeScript；后续 strict TS 收口仍是更宽范围的架构工作，不再把它停留为单独的 env alias 待办锚点。

## 文档分工

- 仓库级主计划与当前完成定义看 [../../docs/next-plan/main.md](../../docs/next-plan/main.md)
- 原地硬切策略基线看 [../../docs/next-in-place-hard-cut-plan.md](../../docs/next-in-place-hard-cut-plan.md)
- 当前 blocker 看板看 [../../docs/next-replacement-blocker-board.md](../../docs/next-replacement-blocker-board.md)
- packages blocker 分布看 [../../docs/next-package-migration-board.md](../../docs/next-package-migration-board.md)
- legacy 收尾与 cutover 看 [../../docs/next-plan/10-legacy-archive-and-cutover.md](../../docs/next-plan/10-legacy-archive-and-cutover.md)

## 这份包内文件的职责

这个文件只做两件事：

1. 给 `server` 包内读文档的人提供一个最短入口。
2. 明确包内文档和仓库级主计划 / blocker 看板的分工，不再重复维护一份同内容长文。

如果你要继续推进具体改造，优先看仓库级 `docs/next-plan/main.md` 和 blocker 看板，再回到具体代码链路。

# next 剩余工程账本

更新时间：2026-04-11

这份文件不再重复维护完整长版方案与详单，只保留一页摘要，方便快速回答：

1. `next` 现在大概完成到哪
2. 剩余工程块有哪些
3. 下一步应该看哪份更细的文档

## 当前统一口径

- 如果只看“正式替换旧前台玩家主链”，当前约还差 `20% - 30%`
- 如果只看 `server-next` 自身独立化，当前约完成 `50% - 60%`
- 如果看“完整替换游戏整体”，当前约完成 `60%`
- 保守口径下，距离“完整替换游戏整体”仍约差 `35% - 40%`

必须同时说明：

- `docs/next-legacy-boundary-audit.md` 当前已回到 `0 / 22`、`0`
- 本地主证明链当前可复跑，不代表 auth/bootstrap 真源已 next-native
- 这也不代表 GM/admin/restore 运营面已经完整 next 化
- “最小包体、最高性能、极高扩展度、系统稳定性”仍未全部满足
- 当前按 task-breakdown 统一口径，剩余任务是 `25` 项

## 剩余工作总览

当前剩余工作可以继续按 5 个大块理解：

1. `auth/token/bootstrap/snapshot/session` 真源替换
2. GM/admin/restore/shadow 与 legacy 删除门槛 proof 闭环
3. 首包 / 热路径 / 扩展边界 / `shared-next` 稳定性的性能尾项
4. `client-next / shared-next` 协议与稳定性收口
5. 替换后的 compat 保留策略定稿

## 当前最值得立刻做的批次

1. 批次 1，先拿掉“只存在文档里”的不确定性：`T11 / T12 / T25`
2. 批次 2，主线程只推一条 auth/bootstrap 真源链：`T01 / T03 / T05`
3. 批次 3，在主链稳定前先把收益最高的性能尾项钉住：`T15 / T19 / T22`

## 当前优先级摘要

| ID | 优先级 | 任务 | 当前状态 |
| --- | --- | --- | --- |
| T1 | `P0` | `auth/token/bootstrap/snapshot/session` 真源收口 | 未完成 |
| T2 | `P0` | `WorldPlayerSourceService` next-native 化 | 未完成 |
| T3 | `P0` | `replace-ready / acceptance / full` 口径写死 | 部分完成 |
| T4 | `P0` | GM/admin/restore 统一自动 proof 与真实环境补证 | 部分完成 |
| T5 | `P0` | `connect_token / hello / guest / GM` bootstrap 收口 | 部分完成 |
| T6 | `P0` | guest / authenticated / GM 三类握手 contract 拆开 | 未完成 |
| T7 | `P0` | session 真源与稳定性边界定稿 | 部分完成 |
| T8 | `P1` | 证明链与运营面真实环境补证 | 未完成 |
| T9 | `P1` | 首包 / projector / sync 热路径与性能尾项 | 未完成 |
| T10 | `P2` | legacy / compat 最终保留策略定稿 | 未完成 |

## 一页行动建议

1. 先做 `T11 / T12 / T25`，把“接班能不能证明”写死，避免后面每推进一步都重新争口径。
2. 再单线推进 `T01 / T03 / T05`，先把 auth/bootstrap 真源主链收干净。
3. 紧接着做 `T15 / T19 / T22`，把首包、性能门禁和 shared 基线钉住。
4. 等主链和门禁都稳了，再补 `T09 / T10` 的真实环境 proof，别把 destructive 或带库补证混进主链改造。
5. 最后再定 `T13 / T24`，把 GM/admin/restore 和 legacy compat 的长期归宿一次拍板。

## 文档分工

- 当前状态与缺口：
  [docs/next-gap-analysis.md](/home/yuohira/mud-mmo/docs/next-gap-analysis.md)
- 长版执行方案：
  [docs/next-remaining-execution-plan.md](/home/yuohira/mud-mmo/docs/next-remaining-execution-plan.md)
- 详细任务详单与最近轮次进展：
  [docs/next-remaining-task-breakdown.md](/home/yuohira/mud-mmo/docs/next-remaining-task-breakdown.md)
- legacy 清理门槛：
  [docs/next-legacy-removal-checklist.md](/home/yuohira/mud-mmo/docs/next-legacy-removal-checklist.md)

这样收口后：

- `execution-plan` 负责“大方向、分阶段、完成定义”
- `task-breakdown` 负责“任务粒度、依赖关系、当前轮次进展”
- 本文件只负责“一页摘要”

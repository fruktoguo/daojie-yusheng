# next 剩余工程账本

更新时间：2026-04-13

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
- 本地与 `acceptance/full` 口径已收齐，`acceptance/full` 尚未全部落成 workflow/job 级闭环
- 这也不代表 GM/admin/restore 运营面已经完整 next 化，真实环境带库与维护窗口证据仍待补齐
- “最小包体、最高性能、极高扩展度、系统稳定性”仍未全部满足
- 当前按 task-breakdown 统一口径，剩余任务是 `25` 项

## 本轮并行核对新增快照（2026-04-13）

从 `server-next / client-next / shared-next / 运维验收` 四侧比对后的共识：

- 已完成：
  - `client-next` 主链通信已 next-native，`socket`/`main` 不再走 legacy 事件主链。
  - `server-next` direct legacy/perf inventory 已压到 `0 / 22`、`0`，边界回归审计通过。
  - `local / acceptance / full / shadow-destructive` 门禁定义已统一，不再口径冲突。
  - `shared-next` 的 next 协议与数值模板守卫已形成基础可验证链路。
- 已完成待验证（代码变更已到位，但闭环尚未全部证据化）：
  - `server-next` P0 真源主链（`T01/T03/T05/T07`）只完成部分收口，仍有 explicit migration + runtime fallback 的边界收紧任务。
  - `server-next` 的 `T11/T12/T14/T25` 文档与门禁化进展已到位，但本地绿与自动化门禁/维护窗口记录仍需继续固定。
  - `client-next` 局部更新已推进，但 `T21` 别名兼容层仍存。
  - `shared-next` 协议覆盖与一致性检查已建，但 `T22/T23` 的全链路硬化还未闭环。
- 未完成：
  - `T02` source 服务真源化（仍是兼容壳收敛中）
  - `T06` 三类握手 contract 与错误码边界未全部写死
  - `T09~T20` 的性能/扩展尾项尚在进行中
  - `T13/T24` 的 GM/admin/restore compat 长期策略未拍板

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
| T01 | `P0` | `auth/token/bootstrap/snapshot/session` 真源收口 | 已完成待验证 |
| T02 | `P0` | `WorldPlayerSourceService` next-native 化 | 未完成 |
| T03 | `P0` | `replace-ready / acceptance / full` 口径写死 + workflow 对齐 | 已完成待验证 |
| T04 | `P0` | GM/admin/restore 统一自动 proof 与真实环境补证 | 已完成待验证 |
| T05 | `P0` | `connect_token / hello / guest / GM` bootstrap 收口 | 已完成待验证 |
| T06 | `P0` | guest / authenticated / GM 三类握手 contract 拆开 | 未完成 |
| T07 | `P0` | session 真源与稳定性边界定稿 | 已完成待验证 |
| T08 | `P1` | proof 与工程门禁的自动/人工边界 | 已完成待验证 |
| T09 | `P1` | 首包 / projector / sync 热路径与性能尾项 | 未完成 |
| T10 | `P2` | legacy / compat 最终保留策略定稿 | 未完成 |

## 一页行动建议

1. 先做 `T11 / T12 / T25`，把“接班能不能证明”写死，避免后面每推进一步都重新争口径。
2. 再单线推进 `T01 / T03 / T05 / T06 / T07`，把 auth/bootstrap 真源主链与握手 contract 收干净。
3. 然后并行完成 `T09 / T10 / T15 / T16 / T19 / T22 / T23`，把性能与扩展尾项钉住。
4. 最后再定 `T13 / T24`，把 GM/admin/restore 和 legacy compat 的长期归宿一次拍板。

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

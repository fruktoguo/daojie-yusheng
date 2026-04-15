# next legacy 清理门槛清单

更新时间：2026-04-13（当前轮次）

这份文档只回答两件事：

1. 什么时候才能把仓库里的 `legacy/compat` 全删掉
2. 现在看到的这些 `legacy` 文件，哪些是真阻塞，哪些只是兼容壳或验证脚本

如需看“完整替换游戏整体”还差多少，以及删 legacy 之外的剩余工程块，直接看 [next-remaining-engineering-ledger.md](./next-remaining-engineering-ledger.md)。

## 一句话结论

现在还不能把 `legacy` 全删。

当前仓库里的 `legacy/compat` 文件混着四种东西：

- 仍在运行主链的真阻塞
- 对外兼容入口壳
- 验证 / 审计脚本
- 已接近可清理的孤儿或低耦合残留

所以不能按“文件名里还有 `legacy`”来判断替换是否完成，也不能按“主链某一段已收口”就直接整批删除。

## 2026-04-16 本轮状态

- `pnpm --filter @mud/server-next verify:replace-ready` 与无库 `session / next-auth-bootstrap` 当前轮次仍保持可复跑；但 with-db 与真实 shadow destructive 仍缺真实环境补证
- active 主包里的旧 compat HTTP `/auth/* /account/* /gm/*` 与 `legacy-auth / legacy-player-compat` smoke 已删除；剩余自动 proof 当前改由 `next-auth-bootstrap / gm-next / next-legacy-boundary-audit` 覆盖
- `protocol=next` 时，compat identity online backfill 已继续收成 `migration-only`；`legacy protocol` 也已不再能通过 `hello(next)` 或 `token/gmToken` 混入主链
- `legacy_runtime -> compat snapshot` 的运行态 fallback 已继续收紧；`hello` 对 token/gmToken 连接也不再承担 bootstrap 兜底入口
- `client-next` 主链通信已 next-native，但 `T21` 的 alias 清理与部分面板 patch-first 收口仍未完成；这说明前台主链已可替换，不说明旧入口可立即整体删除
- `shared-next` 的协议定义、protocol audit 与数值模板守卫已形成基础护栏，但 `T22/T23` 还没有达到“新增字段自动全链路硬门禁”；这说明 shared 稳定性在收口，不说明 compat 删除前置条件已满足
- `local / acceptance / full / shadow-destructive` 四层门禁定义已统一，但 `acceptance/full` 仍未全部落成 workflow/job 级闭环
- `docs/next-legacy-boundary-audit.md` 最新 audit 已回到 `0 / 22`、`0`
- 当前统一工程口径已收成：剩余任务 `25` 项，距离“完整替换游戏整体”仍约差 `35% - 40%`
- 因此当前最安全还能继续清理的，仍是 `C/D` 这类已脱链工具与 proof；`A/B` 还不能因为名字里带 `legacy` 就直接删

## 当前轮次先别误删的 4 组

这一节只回答“现在最容易删错的是什么”。

1. `auth/token/bootstrap/snapshot/session` 真源主链相关 legacy。
   对应 `T01-T07`。虽然 `T01/T03/T05/T07` 已进入“已完成待验证”，但 `T02/T06` 仍未完成，这组整体还在迁移窗口里，不能因为 boundary audit 清零就先删文件。
2. 认证迁移真源与 provenance 兼容层。
   对应 `T01-T08`。虽然外层 compat HTTP 已退役，但 `world-legacy-player-source / player-snapshot-compat / world-player-token-compat` 这组真源兼容还在迁移窗口里。
3. `next-auth-bootstrap / gm-next / next-legacy-boundary-audit` 这类 proof 与审计脚本。
   对应 `L3/L4`。即使旧 smoke 已退役，这组 proof 仍是删除门槛的一部分，不是噪音。
4. `shadow-destructive / gm-database-backup-persistence` 相关 proof 辅助件。
   对应 `T09/T10/T25`。真实环境没取证前，这组是“未来删除前必须看过”的护栏，不是可以顺手清理的杂物。

## 一、全删 `legacy` 的正式门槛

只有下面 5 条同时满足，才可以说“进入全删阶段”：

### L1 真源替换完成

下面这组必须先从运行主链退出：

- `world-legacy-player-source`
- `world-legacy-player-repository`
- `world-legacy-jwt`
- `world-player-token-compat`
- `world-legacy-sync`
- `player-snapshot-compat`

对应口径：

- authenticated `token / identity / snapshot / bootstrap / session` 主链不再默认依赖 legacy source
- next runtime 的同步、首包、会话、玩家源都不再需要 legacy provider 才能工作

### L2 外部旧入口退役

下面这组旧入口要先明确退役策略：

- legacy HTTP `/auth/*`
- legacy HTTP `/account/*`
- legacy HTTP `/gm/*`
- legacy socket 事件

对应口径：

- 不再有旧客户端、旧 GM 工具、旧运营脚本依赖这些入口
- 代码侧旧 compat HTTP registry/controller 已经退役；`L2` 当前剩余重点已从“还挂没挂”转成“真实环境是否已无人再用旧入口”

### L3 自动 proof 全绿

至少要有这组证据：

- `pnpm verify:replace-ready:with-db`
- `pnpm verify:replace-ready:shadow`
- `pnpm verify:replace-ready:acceptance`
- `pnpm verify:replace-ready:shadow:destructive`

如果这组没过，只能说“代码看起来能删”，不能说“系统可安全去掉 legacy”。

### L4 真实环境确认无人使用旧入口

需要有真实环境确认，而不是只靠代码推断：

- shadow / 线上观测没有旧入口流量
- 运维、GM、工具链确认已切到 next 入口
- 回滚预案不再依赖 legacy controller / legacy socket

### L5 观察窗口结束

即使 `L1-L4` 都过了，也不应该当天直接全删。

至少需要留一个稳定观察窗口，用来确认：

- 登录
- 入图
- 邮件
- GM 管理
- 数据库备份 / 恢复
- shadow 验收

都没有再次回头依赖 legacy 壳。

## 一点一、把 `L1-L5` 映射到当前任务账本

这一步是为了避免“删除门槛”和“剩余任务详单”各说各话。

| 删除门槛 | 当前对应任务 | 当前状态 |
| --- | --- | --- |
| `L1` 真源替换完成 | `T01-T08` | `T01/T03/T05/T07/T08` 已完成待验证，但 `T02/T06` 未完成，整体仍未过线 |
| `L2` 外部旧入口退役 | `T13/T24` | 未定稿，不能先删入口 |
| `L3` 自动 proof 全绿 | `T09/T10/T11/T12/T14/T25` | 文档与命令口径已基本齐，但真实环境补证与 workflow 闭环未完成 |
| `L4` 真实环境确认无人使用旧入口 | `T12/T13/T24/T25` | 未完成，仍缺运营与维护窗口取证 |
| `L5` 观察窗口结束 | `T25` | 未进入该阶段 |

一句话说，现在还远没到“看到 legacy 文件就该删”的阶段；当前更接近“先把删除前置条件写硬并持续收口”。

## 二、当前 legacy/compat 文件分类

### A. 仍在运行主链，当前不能删

这组是当前真正的结构性阻塞。

| 文件 | 当前角色 | 为什么不能删 | 删除门槛 |
| --- | --- | --- | --- |
| `packages/server/src/network/world-legacy-player-source.service.js` | 玩家 identity/snapshot compat 真源 | authenticated 主链仍可回读 legacy 玩家源 | `L1` |
| [world-legacy-player-repository.js](../packages/server/src/network/world-legacy-player-repository.js) | legacy 玩家行查询 helper | 被 legacy player source 与 legacy auth HTTP 复用 | `L1` |
| [world-legacy-jwt.service.js](../packages/server/src/network/world-legacy-jwt.service.js) | legacy JWT 兼容层 | token 真源未完全 next-native | `L1` |
| [world-player-token-compat.js](../packages/server/src/network/world-player-token-compat.js) | token payload compat 归一 | 仍被 next token codec 使用 | `L1` |
| `packages/server/src/network/world-legacy-sync.service.js` | legacy 同步分支 | `WorldSyncService` 仍注入并在 legacy 协议面工作 | `L1` |
| [player-snapshot-compat.js](../packages/server/src/persistence/player-snapshot-compat.js) | next snapshot 读兼容归一 | `PlayerPersistenceService` 仍在运行态使用 | `L1` |
| [world-player-source.service.js](../packages/server/src/network/world-player-source.service.js) | 当前还是 legacy facade | 壳本身不该先删，得先把 provider 换掉 | `L1` |

### B. 对外 compat HTTP / GM 入口已完成代码侧退役，但 `L2` 仍未完全通过

这组当前最大的变化不是“还在挂载”，而是“代码侧已下线，但真实环境退役证明还没补完”。

已完成的代码侧收口：

- `AppModule` 不再挂 compat HTTP registry
- `packages/server/src/compat/legacy/http/*` 已从 active 主包删除
- `legacy-auth-readiness-warmup.service.js`、旧 compat tokens、旧 controller/provider 已删除

当前为什么 `L2` 还没过：

- 还没有真实环境证明“旧客户端 / 旧 GM 工具 / 旧运营脚本”已全部停止使用旧入口
- 还没有完成退役后的观察窗口与回滚预案取证
- 文档和 runbook 仍在收口，不能因为代码文件没了就宣布旧入口已经安全退役

### C. active 主包里的 compat 基础工具已清空

这组原先跟着 compat HTTP/GM 入口存在的 helper/常量，当前已经从 active 主包删除：

- `legacy-password-hash.js`
- `legacy-account-validation.js`
- `legacy-gm-compat.constants.js`
- `legacy-session-bootstrap.service.js`
- `packages/server/src/auth/legacy-auth.service.js`

### D. 当前仍保留的 proof / 审计脚本

这组不是运行主链阻塞，但仍是删除门槛的一部分：

| 文件 | 当前角色 | 什么时候删 |
| --- | --- | --- |
| [next-auth-bootstrap-smoke.js](../packages/server/src/tools/next-auth-bootstrap-smoke.js) | 验证 next 登录、bootstrap 与迁移来源门禁 | `L1-L4` 之后 |
| [gm-next-smoke.js](../packages/server/src/tools/gm-next-smoke.js) | 验证当前 GM 主链与 shadow 关键写路径 | `L3-L4` 之后 |
| [next-legacy-boundary-audit.js](../packages/server/src/tools/audit/next-legacy-boundary-audit.js) | 审计 legacy 边界是否继续扩散 | 最后删除，直到完全不需要监控 legacy 边界 |

## 三、现在可以做什么

### 现在可以安全做的

- 给 `legacy/compat` 文件逐个打标签
- 把“验证脚本”和“运行时兼容壳”分开目录治理
- 优先复核并清理无引用孤儿文件
- 继续做 `client-next / shared-next` 的 next-native 收口，但把它们明确视为“降低未来回退空间”，不要误读成“已满足删 compat 前置条件”
- 持续减少 `A` 类文件数量
- 把每个删除动作绑定到 `L1-L5` 或 `T01-T25` 某个明确前置条件

### 现在不要做的

- 看到 `legacy` 名字就整批删
- 在 `L1` 没过前搬走所有运行主链 compat 文件
- 因为代码侧 compat HTTP 已退役，就误判真实环境旧入口已经安全下线
- 在 `T09/T10` 没完成真实环境补证前，把 smoke / audit / destructive proof 当成“可删脚手架”

## 四、推荐的清理顺序

### 第 1 批：先整理，不删主链

目标：

- 给所有 `legacy/compat` 文件分桶
- 验证 / 审计脚本单独归类
- 复核并清理无引用孤儿

这一批做完，不改变运行语义。

本轮最适合直接做的具体动作：

- 给 `A/B/C/D` 四类各补一列“删除前必须看哪个任务”
- 把 `legacy` 脚本、审计、运行壳在文档里彻底分桶，避免继续混读

### 第 2 批：退役外部兼容入口

前提：

- `L2-L4` 基本满足

目标：

- 从 `AppModule` 拔掉 compat HTTP registry
- 下线 legacy `/auth/*`、`/account/*`、`/gm/*`
- 下线 legacy socket 兼容入口

这一批真正开始前，至少还要先看到：

- `T13/T24` 已定稿外部入口长期策略
- `T12/T25` 已把自动 gate / 人工 gate 写死
- `L4` 已有真实环境“无人使用旧入口”的证据

### 第 3 批：删除运行主链 legacy source

前提：

- `L1` 满足

目标：

- 删除 legacy player source / jwt / token compat / legacy sync / snapshot compat

这一批真正开始前，至少还要先看到：

- `T01/T03/T05/T07` 已完成主链收口
- next 协议 authenticated 主链不再命中 runtime compat identity/snapshot
- session 真源边界已经定稿，不再靠 legacy 语义补洞

### 第 4 批：删除验证脚本

前提：

- `L1-L5` 全满足

目标：

- 删除 compat smoke 和 legacy boundary audit

这一批真正开始前，至少还要先看到：

- `L3/L4/L5` 已全部满足
- 至少经历过一个稳定观察窗口，没有再回头启用 legacy compat 验证
- 替代性的 next gate 已经齐全，不会因为删脚本把删除证据一起删掉

## 五、当前最真实的回答

如果你问的是“什么时候能把这些 legacy 全删了”，当前答案是：

- 现在不能
- 先过 `L1-L5`
- 在当前进度下，距离“全删”仍明显不是最后一步

如果你问的是“现在能不能先动一部分”，当前答案是：

- 可以先从 `D/E` 两类开始治理
- `A/B/C` 这三类先别硬删

如果你问的是“这周最值得直接改什么”，当前答案是：

1. 先把 `D/E` 两类继续分桶并补删除前置条件，不动主链。
2. 再把 `L1-L5` 和 `T01-T25` 的映射写死，避免后面口径漂移。
3. 等 `T09/T10/T11/T12/T25` 再稳一点，才讨论下一批真正可删的 compat 入口。

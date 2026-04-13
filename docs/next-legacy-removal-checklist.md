# next legacy 清理门槛清单

更新时间：2026-04-13（当前轮次）

这份文档只回答两件事：

1. 什么时候才能把仓库里的 `legacy/compat` 全删掉
2. 现在看到的这些 `legacy` 文件，哪些是真阻塞，哪些只是兼容壳或验证脚本

如需看“完整替换游戏整体”还差多少，以及删 legacy 之外的剩余工程块，直接看 [docs/next-remaining-engineering-ledger.md](/home/yuohira/mud-mmo/docs/next-remaining-engineering-ledger.md)。

## 一句话结论

现在还不能把 `legacy` 全删。

当前仓库里的 `legacy/compat` 文件混着四种东西：

- 仍在运行主链的真阻塞
- 对外兼容入口壳
- 验证 / 审计脚本
- 已接近可清理的孤儿或低耦合残留

所以不能按“文件名里还有 `legacy`”来判断替换是否完成，也不能按“主链某一段已收口”就直接整批删除。

## 2026-04-13 本轮状态

- `pnpm --filter @mud/server-next verify:replace-ready` 与无库 `session / next-auth-bootstrap` 当前轮次仍保持可复跑；但 with-db 与真实 shadow destructive 仍缺真实环境补证
- `legacy-auth` smoke 现在已按真实主链前置对齐：无数据库环境先走 compat HTTP `/auth/register`/`/auth/login` 取真实 token，再验证 socket bootstrap；带数据库环境仍保留 seeded legacy token proof
- `protocol=next` 时，compat identity online backfill 已继续收成 `migration-only`；`legacy protocol` 也已不再能通过 `hello(next)` 或 `token/gmToken` 混入主链
- `legacy_runtime -> compat snapshot` 的运行态 fallback 已继续收紧；`hello` 对 token/gmToken 连接也不再承担 bootstrap 兜底入口
- `client-next` 主链通信已 next-native，但 `T21` 的 alias 清理与部分面板 patch-first 收口仍未完成；这说明前台主链已可替换，不说明旧入口可立即整体删除
- `shared-next` 的协议定义、protocol audit 与数值模板守卫已形成基础护栏，但 `T22/T23` 还没有达到“新增字段自动全链路硬门禁”；这说明 shared 稳定性在收口，不说明 compat 删除前置条件已满足
- `local / acceptance / full / shadow-destructive` 四层门禁定义已统一，但 `acceptance/full` 仍未全部落成 workflow/job 级闭环
- `docs/next-legacy-boundary-audit.md` 最新 audit 已回到 `0 / 22`、`0`
- 当前统一工程口径已收成：剩余任务 `25` 项，距离“完整替换游戏整体”仍约差 `35% - 40%`
- 因此当前最安全还能继续清理的，仍是 `D/E` 两类；`A/B/C` 还不能因为名字里带 `legacy` 就直接删

## 当前轮次先别误删的 4 组

这一节只回答“现在最容易删错的是什么”。

1. `auth/token/bootstrap/snapshot/session` 真源主链相关 legacy。
   对应 `T01-T07`。虽然 `T01/T03/T05/T07` 已进入“已完成待验证”，但 `T02/T06` 仍未完成，这组整体还在迁移窗口里，不能因为 boundary audit 清零就先删文件。
2. 对外 compat HTTP / GM / socket 入口。
   对应 `T13/T24`。这组还没完成长期策略定稿，删早了会把运维和回滚链路一起打断。
3. `legacy-auth / legacy-player-compat / gm-compat` 这类 smoke 与审计脚本。
   对应 `L3/L4`。在真实环境证明“没人再用旧入口”之前，它们还是删除门槛的一部分，不是噪音。
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
- `AppModule` 不再需要通过 [compat-http.registry.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/compat-http.registry.js) 批量挂载 compat controller/provider

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
| [world-legacy-player-source.service.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-legacy-player-source.service.js) | 玩家 identity/snapshot compat 真源 | authenticated 主链仍可回读 legacy 玩家源 | `L1` |
| [world-legacy-player-repository.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-legacy-player-repository.js) | legacy 玩家行查询 helper | 被 legacy player source 与 legacy auth HTTP 复用 | `L1` |
| [world-legacy-jwt.service.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-legacy-jwt.service.js) | legacy JWT 兼容层 | token 真源未完全 next-native | `L1` |
| [world-player-token-compat.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-player-token-compat.js) | token payload compat 归一 | 仍被 next token codec 使用 | `L1` |
| [world-legacy-sync.service.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-legacy-sync.service.js) | legacy 同步分支 | `WorldSyncService` 仍注入并在 legacy 协议面工作 | `L1` |
| [player-snapshot-compat.js](/home/yuohira/mud-mmo/packages/server-next/src/persistence/player-snapshot-compat.js) | next snapshot 读兼容归一 | `PlayerPersistenceService` 仍在运行态使用 | `L1` |
| [world-player-source.service.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-player-source.service.js) | 当前还是 legacy facade | 壳本身不该先删，得先把 provider 换掉 | `L1` |

### B. 仍提供外部兼容入口，当前不能删

这组未必是“内部真源”，但还在对外提供旧入口。

| 文件 | 当前角色 | 为什么不能删 | 删除门槛 |
| --- | --- | --- | --- |
| [compat-http.registry.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/compat-http.registry.js) | compat HTTP 聚合注册 | `AppModule` 还靠它挂旧 controller/provider | `L2` |
| [legacy-auth.service.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/legacy-auth.service.js) | legacy HTTP auth 主服务 | `/auth/*` 与兼容登录仍依赖它 | `L2` |
| [legacy-auth-http.service.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/http/legacy-auth-http.service.js) | legacy `/auth/*` HTTP 兼容 | 旧登录入口仍在 | `L2` |
| [legacy-account-http.service.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/http/legacy-account-http.service.js) | legacy `/account/*` HTTP 兼容 | 旧账号修改入口仍在 | `L2` |
| [legacy-gm-http-auth.service.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/http/legacy-gm-http-auth.service.js) | legacy GM HTTP 鉴权 | 旧 GM HTTP 入口仍依赖 | `L2` |
| [legacy-gm-http-auth.guard.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/http/legacy-gm-http-auth.guard.js) | legacy GM HTTP guard | 旧 GM controller 仍依赖 | `L2` |
| [legacy-gm-http-compat.service.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/http/legacy-gm-http-compat.service.js) | legacy GM HTTP 行为壳 | `/gm/*` 兼容接口仍依赖 | `L2` |
| [legacy-gm.controller.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/http/legacy-gm.controller.js) | legacy GM HTTP controller | 旧 GM 入口仍挂载 | `L2` |
| [legacy-gm-admin-compat.service.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/http/legacy-gm-admin-compat.service.js) | legacy GM admin 兼容服务 | database/state/backup/restore 兼容入口仍在 | `L2` |
| [legacy-gm-admin.controller.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/http/legacy-gm-admin.controller.js) | legacy GM admin controller | 旧 GM admin 入口仍挂载 | `L2` |
| [legacy-gm-auth.controller.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/http/legacy-gm-auth.controller.js) | legacy GM 登录入口 | 旧 GM 登录仍兼容 | `L2` |
| [legacy-gm-redeem-code.controller.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/http/legacy-gm-redeem-code.controller.js) | legacy GM redeem controller | 旧 GM redeem 入口仍挂载 | `L2` |
| [legacy-auth.controller.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/http/legacy-auth.controller.js) | legacy auth controller | 旧 `/auth/*` controller 层 | `L2` |
| [legacy-account.controller.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/http/legacy-account.controller.js) | legacy account controller | 旧 `/account/*` controller 层 | `L2` |
| [legacy-database-restore-coordinator.service.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/http/legacy-database-restore-coordinator.service.js) | legacy restore 协调 | restore 兼容流程仍依赖 | `L2` |
| [legacy-gm-compat.service.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/legacy-gm-compat.service.js) | legacy GM socket / runtime compat 壳 | `world-gm-socket`、projection、tick 仍引用 | `L2` |
| [legacy-session-bootstrap.service.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/legacy-session-bootstrap.service.js) | legacy socket bootstrap compat | 仍通过 compat registry 注入 | `L2` |
| [legacy-auth-readiness-warmup.service.js](/home/yuohira/mud-mmo/packages/server-next/src/health/legacy-auth-readiness-warmup.service.js) | legacy auth readiness 预热 | compat HTTP providers 仍挂载 | `L2` |

### C. 主要是 compat 基础工具，最后随入口一起删

这组通常不需要单独优先处理，跟着 compat HTTP/GM 入口一起退役。

| 文件 | 当前角色 | 建议 |
| --- | --- | --- |
| [legacy-password-hash.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/legacy-password-hash.js) | 旧密码 hash helper | 跟 legacy auth HTTP 一起删 |
| [legacy-account-validation.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/legacy-account-validation.js) | 旧账号字段校验 | 跟 legacy `/auth/*`、`/account/*` 一起删 |
| [legacy-gm-compat.constants.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/legacy-gm-compat.constants.js) | GM compat 常量 | 跟 GM compat 服务一起删 |

### D. 只是验证 / 审计脚本，不是运行主链阻塞

这组文件名字里有 `legacy/compat`，但本质上是验证工具，不代表系统主链没替完。

| 文件 | 当前角色 | 什么时候删 |
| --- | --- | --- |
| [legacy-auth-smoke.js](/home/yuohira/mud-mmo/packages/server-next/src/tools/compat/legacy-auth-smoke.js) | 验证 legacy HTTP auth 兼容 | `L2-L4` 之后 |
| [legacy-player-compat-smoke.js](/home/yuohira/mud-mmo/packages/server-next/src/tools/compat/legacy-player-compat-smoke.js) | 验证 legacy 玩家 socket 兼容 | `L2-L4` 之后 |
| [gm-compat-smoke.js](/home/yuohira/mud-mmo/packages/server-next/src/tools/compat/gm-compat-smoke.js) | 验证 GM compat 关键链路 | `L2-L4` 之后 |
| [next-legacy-boundary-audit.js](/home/yuohira/mud-mmo/packages/server-next/src/tools/audit/next-legacy-boundary-audit.js) | 审计 legacy 边界是否继续扩散 | 最后删除，直到完全不需要监控 legacy 边界 |

### E. 已接近可清理候选

这组不是“立刻删”，但已经值得优先复核。

| 文件 | 当前判断 | 建议动作 |
| --- | --- | --- |
| [packages/server-next/src/auth/legacy-auth.service.js](/home/yuohira/mud-mmo/packages/server-next/src/auth/legacy-auth.service.js) | 当前未发现仓库内引用，更像旧位置残留副本；但该文件在当前工作区已存在未提交改动 | 先人工复核，再决定直接删或迁归档 |

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
- 在 `L2` 没过前删 compat HTTP registry 和旧 controller
- 因为 `client-next` 主链已 next-native，就误判 legacy HTTP / GM / socket 可以顺手退役
- 在 `T09/T10` 没完成真实环境补证前，把 smoke / audit / destructive proof 当成“可删脚手架”

## 四、推荐的清理顺序

### 第 1 批：先整理，不删主链

目标：

- 给所有 `legacy/compat` 文件分桶
- 验证 / 审计脚本单独归类
- 复核并清理无引用孤儿

这一批做完，不改变运行语义。

本轮最适合直接做的具体动作：

- 继续复核 `E` 类孤儿候选，明确“删 / 迁 / 保留”三选一
- 给 `A/B/C/D/E` 五类各补一列“删除前必须看哪个任务”
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

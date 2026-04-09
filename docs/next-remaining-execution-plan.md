# next 剩余完整执行方案

更新时间：2026-04-08

## 1. 目标定义

这份文档只回答一件事：

`next` 距离“完整替换游戏整体”还剩什么，接下来应该按什么顺序做，做到什么程度才能改口说“可以安全接班”。

如果你当前更关心“什么时候才能把仓库里的 `legacy/compat` 全删掉”，直接看 [docs/next-legacy-removal-checklist.md](/home/yuohira/mud-mmo/docs/next-legacy-removal-checklist.md)。

如果你当前更关心“还差多少、每块具体剩什么、哪些能并行、哪些必须串行”，直接看 [docs/next-remaining-engineering-ledger.md](/home/yuohira/mud-mmo/docs/next-remaining-engineering-ledger.md)。

当前统一口径：

- `server-next` 的 direct legacy/perf inventory 已清零，最新 audit 为 `0 / 22`、`0`
- `auth/token/bootstrap` 真源替换已经开始第一刀，但还没完成 next-native 收口
- 已落地的是 `token/identity` 读优先级收正：`next -> compat -> token fallback`
- legacy HTTP auth 与 next socket auth 当前已经共用同一套 next token codec
- `snapshot` persisted provenance 也已开始落地：next 持久化层现在可以区分 native snapshot 与 `legacy_seeded` snapshot
- `snapshot/player-source` 的异常数据护栏也开始收口：带库场景下，next 持久化里如果已经存在非法 snapshot 记录、compat snapshot 查询因为 `users/players` schema 缺失而不可判定，或 compat snapshot 行里的 `mapId` 本身为空，主链现在都会直接失败并记录 trace
- 这不等于 `snapshot/player-source` 与 `bootstrap/session` 主链已经 next-native
- 这不等于 GM/admin/restore 运营面已经 next 化
- 这不等于“最小包体、最高性能、极高扩展度、系统稳定性”已经全部满足
- 保守估计，`next` 距离“完整替换游戏整体”仍约差 `40% - 45%`
- 当前剩余工作已经可以压缩成最多三块：
  - `snapshot/player-source -> bootstrap/session` 真源替换本体
  - GM/admin/restore/shadow 证明链补齐
  - 首包/热路径/扩展边界的性能尾项

## 1.1 2026-04-07 最新状态

这一轮新增确认了几件关键事实：

1. `legacy-auth` 带库链路已重新转绿。
   当前已补平两类真实回归：
   - `/account/role-name` 在“有 `users` 行但没有 `players` 行”时不再直接 `401 角色不存在`，而是回写 `users.pendingRoleName`，有 `players` 行时再同步 `players.name`
   - `legacy HTTP account` 侧把 identity 回写到 next 持久化时，不再因为“有库但还没 legacy `players` 行”而放弃同步；同时 `bootstrap` 现在会按 identity 的 `persistedSource` 决定是否允许 legacy snapshot fallback，避免把 `legacy_backfill / legacy_sync / token_seed` 的 next identity 误当成已经 next-native 的完整链路

2. 运行时主路径的真源替换已经收口。
   - `guest hello/requestedPlayerId` 真 fallback 已移除
   - authenticated 非 native next 身份在 `snapshot miss` 时继续 fresh bootstrap 的入口也已关闭

3. 证明链的仓库内代码缺口已经收口。
   - `shadow` 上的 `backup -> download -> restore` destructive 闭环，现已补成独立 `pnpm verify:replace-ready:shadow:destructive`
   - `SERVER_NEXT_GM_DATABASE_BACKUP_DIR` 指向同一路径后的跨重建保留 proof，现已补成 `pnpm --filter @mud/server-next smoke:gm-database:backup-persistence`
   - 剩下的是在真实带库 / maintenance window 环境里执行这些 proof，而不是仓库内仍有未写完的代码缺口

4. 性能与最小包体当前最显著的尾项，不在 steady-state `WorldDelta`，而在首包重复与服务器侧整量投影：
   - `Bootstrap + MapStatic + PanelDelta` 首包层仍有明显重复分层
   - `WorldProjector` 仍以“整量 capture/clone 后再 diff”为主
   - `panel/attr bonus` 与 `minimap visible markers` 仍有每 tick 额外 CPU 成本

5. guest smoke 迁移已经收口到 canonical 模式。
   - `session / readiness-gate / runtime / shadow / persistence / next-protocol-audit` 这组主链 smoke 已统一读取 `InitSession.pid`
   - guest `hello` 不再依赖客户端自带 `playerId`；跨重连恢复只认 detached `sessionId`
   - `hello_guest/requestedPlayerId` 真源替换已经完成，后续只需要继续维护这组 canonical smoke 不回退

6. 本地主证明链这轮已再次实跑全绿。
   - `pnpm --filter @mud/server-next verify:replace-ready` 已于 `2026-04-07` 本地再次跑通，退出码为 `0`
   - 本轮 summary 已覆盖 `readiness-gate / session / runtime / progression / combat / loot / legacy-auth / next-auth-bootstrap / legacy-player-compat / gm-compat / redeem-code / monster-runtime / monster-combat / monster-ai / monster-skill / monster-reset / monster-loot / player-recovery / player-respawn`
   - 总耗时约 `56087ms`
   - 配套 `next-legacy-boundary-audit` 最新结果也已回到 `0 / 22`、`0`

## 2. 当前基线

### 2.1 已经完成的部分

- `client-next` 玩家主链已经基本切到 next-native
- `client-next` socket 已不再监听 legacy 事件名
- `server-next` 主服务里的 direct legacy/perf inventory 已清零
- `pnpm --filter @mud/server-next verify:replace-ready` 当前已重新确认可跑并通过
- `verify:replace-ready:proof:with-db`
- `verify:replace-ready:with-db`
- `verify:replace-ready:shadow`
- `verify:replace-ready:acceptance`
  这四条链都已有通过证据

### 2.2 仍然未完成的核心问题

1. `auth/token/bootstrap` 真源只完成了第一刀，仍未整体脱 legacy。
2. 默认/`acceptance`/`full` 三层门禁已经收敛，但 README / workflow / gap-analysis 仍需持续对齐，避免误读成“默认门禁通过 = 完整替换就绪”。
3. GM/admin/restore 的统一自动化证明仍不足，且自动化边界与人工回归边界仍需继续写死。
4. `shared-next` 仍需继续稳定，避免再次变成 workspace 级验证风险源。
5. “最小包体、最高性能、极高扩展度、系统稳定性”都还只到部分满足或未满足。

## 3. 总体策略

接下来的工作不再以“再压一条 boundary 命中”为主，而改成四条主线并行推进：

1. 先把“如何证明可以接班”做完整。
2. 再把“底层到底是不是 next 自己的”做完整。
3. 同时把共享协议层与高频性能尾项压稳。
4. 最后再决定哪些 legacy 兼容壳可以保留，哪些要继续剥离。

排序原则：

- 先低风险、高证明价值
- 再高风险、真源替换
- 最后做替换后的收尾清理

## 4. 工作流拆分

### A. 验收与证明链收敛

这是当前第一优先级。

#### 目标

把现在分散的：

- `verify:replace-ready`
- `verify:replace-ready:with-db`
- `verify:replace-ready:shadow`
- `verify:replace-ready:acceptance`
- `smoke:gm-compat`
- `gm-database-smoke`

收敛成清晰的“默认验收门禁”“增强验收门禁”“最严格自动化门禁”三层，而不是多条链各自为政。

#### 当前已收敛与剩余内容

1. 默认替换门禁当前已收敛为根级 `pnpm verify:replace-ready`。
   它会覆盖：
   - `build:client-next`
   - 本地主证明链
   - 提供数据库环境时自动转入 `with-db`
   - `audit:server-next-protocol`
   它当前就是“日常默认本地门禁”，不再以并成 `acceptance` 为目标；剩余问题是不要把它误读成完整替换闭环。

2. `acceptance` 当前已固定为唯一增强验收门禁。
   它会覆盖：
   - 根级 `verify:replace-ready`
   - `shadow` 实物验收
   - `shadow` 上的 GM 关键写路径验证
   - `shadow` 上 `/gm/maps`、`/gm/editor-catalog`、`/gm/maps/:mapId/runtime` 三个 GM admin 只读证明点
   - `shadow` 上玩家改密闭环与 `gm-compat` 输出里的 `passwordChange` 摘要

3. `full` 当前已固定为最严格自动化门禁。
   它会：
   - 强制要求数据库环境
   - 强制要求 shadow 环境
   - 强制要求 GM 密码环境
   - 显式串行执行 `with-db -> gm-database -> shadow -> gm-compat`

4. 仍待继续完成的是更完整的 GM/admin/backup/restore 证明整理。
   当前已有最小 compat smoke、`gm/database/state / gm/maps / editor-catalog / map runtime` 只读管理面摘要，以及带库 `backup/restore` 回归。
   其中 `gm-database-smoke` 已覆盖 `backup / download / restore`、并发任务单飞拒绝、`pre_import` 检查点、checkpoint 下载、backup 后新增建议单与 GM 直邮在 restore 后消失且 mail summary 回到基线的业务态回滚证明、restore 进行中被重启/打断后 `lastJob.status=failed` 的自动 proof，以及重启后 `lastJob / checkpointBackupId / sourceBackupId / appliedAt / finishedAt` 持久化。
   但这仍不应夸大成完整 GM/admin 人工回归已经自动化。

5. 文档、README、workflow、脚本入口要持续维持同一口径。

#### 完成定义

满足以下条件才算这一条完成：

- 日常默认只推荐一条本地后端替换门禁命令
- `acceptance` 成为“本地主证明链 + shadow 实物验收 + shadow GM 关键写路径验证”的唯一增强门禁
- `full` 成为当前最严格的自动化门禁，并覆盖数据库运营面回归
- README、TESTING、workflow、脚本 wrapper 口径一致
- 用户不需要把 `local / acceptance / full` 三层混成一团，能明确知道各自回答什么问题

#### 这一条做完后能得到什么

- “代码能跑”和“可以接班”不再是两套口径
- 后续 auth/token/bootstrap 真源替换能有稳定护栏
- 系统稳定性这项目标会明显前进一步

### B. auth/token/bootstrap 真源替换

这是当前第二优先级，也是结构性硬阻塞。

#### 目标

把现在的 next 会话主链从：

- legacy JWT
- 旧 `users/players`
- `loadLegacyPlayerSnapshot`

主导的 compat 语义，逐步切成 next 自己的真源；legacy 只保留为显式 fallback 或迁移入口。

#### 当前涉及的核心模块

- `WorldSessionBootstrapService`
- `WorldPlayerAuthService`
- `WorldPlayerTokenService`
- `WorldPlayerSnapshotService`
- `WorldLegacyPlayerSourceService`
- `WorldClientEventService`

#### 当前已完成到哪

1. `token` 真源第一刀已经落地。
   stale token 重连不再优先覆盖最新 compat identity，`smoke:legacy-auth` 已重新通过。
2. `identity` 真源第一刀已经落地。
   当前身份读取顺序已固定成 `next -> compat -> token fallback`，并保留 next 持久化回填。
3. GM 玩家改密接口的 compat 契约已补回。
   `/gm/players/:playerId/password` 现兼容 `newPassword` 与历史 `password` 字段，`smoke:gm-compat` 已重新通过。
4. guest canonical bootstrap/resume 已完成。
   guest 首登不再依赖客户端自带 `playerId`，主链 smoke 统一读取 `InitSession.pid`；detached `sessionId -> playerId` 恢复链、forged sid 负向语义，以及 forged `playerId` 负向语义都已固定。

#### 当前还剩的主块

1. `snapshot/player-source` 真源替换。
2. `bootstrap/session` 真源替换。

#### 需要完成的内容

1. 明确 next token 真源。
   定义 next token 的签发、校验、失效、错误码语义，不再把 legacy JWT 当默认主规则。

2. 明确 next identity 真源。
   定义 next 会话加载角色身份时，优先走哪张表、哪套记录、哪组字段。

3. 明确 next snapshot 真源。
   `bootstrap` 的角色运行态、面板初始态、位置、持有物、进度、待确认消息，必须有清晰的 next 侧真源装载路径。

4. 把 legacy snapshot 从主路径默认依赖降级成显式 fallback。
5. 为 `bootstrap source=next|legacy|miss` 增加可观测断言与 smoke。
6. 基于已经落地的 provenance/source 元数据与“第一次 `legacy_seeded`、第二次 `next(native)`”顺序型 smoke 护栏，继续收紧 legacy fallback 的默认触发面。
   当前已先收掉“seed 写失败”“next 持久化坏记录”“compat schema 缺失仍被吞成 miss”“compat snapshot 坏 placement 被静默改写成默认地图”“compat unlockedMinimapIds 坏值被静默压成当前图已解锁”这五类不该静默成功的异常分支，后续再继续压缩仍然允许命中 legacy snapshot 的正常 fallback 面。

#### 完成定义

满足以下条件才算这一条完成：

- next 玩家会话的 token 校验不再默认依赖 legacy JWT
- next 玩家身份装载不再默认依赖旧 `users/players`
- `loadLegacyPlayerSnapshot` 不再是 bootstrap 热路径默认主分支
- 有明确 smoke/日志能证明命中 next 真源，而不是仅靠 fallback 跑通

#### 风险

- 这是高风险改动
- 容易影响登录、断线重连、旧号导入、角色身份同步
- 必须在 A 线门禁先稳住后再推进

#### 在不改真源语义前，可以先安全做的准备动作

1. 继续强化 source 可观测。
   当前已经有：
   - `WorldPlayerTokenService` 的 token accept/reject trace
   - `WorldPlayerSnapshotService` 的 `source=next|legacy|miss` trace
   - `WorldSessionBootstrapService` 的 bootstrap ready trace
   下一步可以继续补：
   - auth source 统计字段
   - bootstrap source 命中计数
   - next/fallback 命中比例日志
   当前也可以先安全把这些结果压成读侧摘要：`/runtime/auth-trace` 除原始 ring buffer 外，可继续通过 `summary` 提供 `token/identity/snapshot/bootstrap` 聚合计数；目前已固定到 identity 持久化动作计数、bootstrap 的 `requestedSessionCount`、`entryPathCounts`、`identitySourceCounts`、`bootstrap.linkedSourceCounts` 与 `bootstrap.linkedPersistedSourceCounts` 这层，用来先看清主路径分布，而不提前改真源语义。
   这轮又补了一层 `snapshot` fallback 决策可观测：`WorldSessionBootstrapService` 现会把 authenticated snapshot fallback 的决策原因显式归一成 `identity_source:*` 或 `strict_native_snapshot_required`，`WorldPlayerSnapshotService` 会把该原因写进 trace，`/runtime/auth-trace` 的 `summary.snapshot.fallbackReasonCounts` 也会聚合计数。这样后续继续压缩 legacy snapshot 默认触发面时，可以直接按真实命中原因收口，而不是只看笼统的 `allowLegacyFallback=true/false`。
   在这层可观测补齐后，这轮也已经开始动真语义：当 persistence 已开启时，authenticated `legacy_runtime` 身份当前不再默认允许 compat snapshot fallback；主链现在要求“要么 next snapshot 已存在，要么直接失败”，只把 compat snapshot fallback 继续保留给无数据库/无持久化场景。这一刀还没有让 `A 类` 文件直接退出主链，但已经实质缩小了 `snapshot/player-source` 仍会默认回读 legacy source 的触发面。

2. 用 smoke 锁定 source 命中的证明链。
   当前 `next-auth-bootstrap` smoke 已能在显式 trace 模式下系统化断言：
   - token reject/accept 记录存在
   - identity source 记录存在，且 identity 持久化结果字段会单独说明 `persistenceEnabled / persistAttempted / persistSucceeded / persistFailureStage`
   - 登录拿到的 token claims 里的 `playerId / playerName`，必须和 `InitSession`、`Bootstrap.self.id` 与 runtime `player.name` 保持一致
   - 这次 bootstrap 的 snapshot 来源存在
   - bootstrap ready 记录存在且顺序正确
   - snapshot 来源已开始区分 `legacy_runtime` 与 `legacy_seeded`
   - next 持久化里若命中非法 snapshot 记录，会显式记录 `next_invalid` 而不是静默吞成 miss
   - compat snapshot 查询若因为 schema 缺失而不可判定，会显式记录 `legacy_source_error`，不再落成普通 miss
   - compat snapshot 行里的 `mapId` 若为空，在仍会命中 compat fallback 的链路里会显式落到 `legacy_source_error`，不再静默改写成默认出生图
   - compat snapshot 行里的 `unlockedMinimapIds` 若不是数组，在仍会命中 compat fallback 的链路里也会显式落到 `legacy_source_error`，不再静默压成“当前图已解锁”
   - next 持久化 snapshot 已开始暴露 `snapshotPersistedSource`
   - trace 通过受 runtime debug guard 保护的 `/runtime/auth-trace` 暴露，且只在显式设置 `SERVER_NEXT_AUTH_TRACE_ENABLED=1` 或 `NEXT_AUTH_TRACE_ENABLED=1` 时生效
   - `/runtime/auth-trace` 当前除原始 `records` ring buffer 外，也会附带 `summary` 聚合，可直接观察 `identity/snapshot/bootstrap` 命中计数、identity 持久化动作计数、`bootstrap.requestedSessionCount`、`bootstrap.linkedSourceCounts` 与 `bootstrap.linkedPersistedSourceCounts`
   当前已经补到：
   - 带库场景下固定“第一次 `legacy_seeded`、第二次 `next(native)` 且 persistedSource=native`”的顺序证明
   - 带库场景下固定“第一次 identity=`legacy_backfill`、第二次 identity=`next`”的来源证明
   - 带库场景下固定“保留 next identity、清空 next/legacy snapshot 源后，同一 token 再连必须直接失败，且不得出现 bootstrap ready”的负向证明
   - 带库场景下固定“保留 next identity 与 next snapshot、把 next snapshot 文档改成非法 payload”后，同一 token 再连必须直接失败；trace 必须显式落成 `identity.source=next`、`snapshot.source=next_invalid`，且不得出现 bootstrap
   - 带库场景下固定“保留 next identity 与 next snapshot、只把 `payload.__snapshotMeta.persistedSource` 改成非法值”后，同一 token 再连仍必须成功 bootstrap；trace 必须显式落成 `identity.source=next`、`snapshot.source=next`、`snapshotPersistedSource=native`
   - 带库场景下固定“保留 next identity 与 next snapshot、只把 `payload.unlockedMapIds` 改成非法非数组值”后，同一 token 再连仍必须成功 bootstrap；trace 必须显式落成 `identity.source=next`、`snapshot.source=next`、`snapshotPersistedSource=native`，且运行时读取到的 `unlockedMapIds` 必须归一成空数组
   - 带库场景下固定“保留 next identity、清空 next snapshot 后把 compat `mapId` 改成非法空值，同一 token 再连必须直接失败，且不得出现 bootstrap ready”的负向证明
   - 带库场景下固定“保留 next identity、清空 next snapshot 后把 compat `unlockedMinimapIds` 改坏，同一 token 再连必须直接失败，且不得出现 bootstrap ready”的负向证明
   - 带库场景下固定“把 next persisted identity 写成非法值”后，同一 token 再连必须在 snapshot 装载前直接失败，且不得出现 bootstrap ready
   - 带库场景下固定“删除 next identity、保留 compat identity 与 next snapshot、并定向打掉 identity backfill 保存”后，同一 token 再连当前必须直接失败；trace 必须显式落成 `identity.source=legacy_persist_blocked`、`persistAttempted=true`、`persistSucceeded=false`、`persistFailureStage=compat_backfill_save_failed`，且不得出现 snapshot/bootstrap，identity 文档最终仍不存在
   - 带库场景下固定“保留 next identity、删除 next snapshot、保留 compat snapshot”后，同一 token 再连必须直接失败；trace 必须显式落成 `identity.source=next`、`snapshot.source=miss`，且不得出现 bootstrap；compat snapshot 文档会被保留、next snapshot 文档最终仍不存在，证明 next identity 主链已不再回落 compat snapshot fallback
   - 无库场景下显式输出 `snapshotSequence.supported=false`，避免误读成已完成真源替换
   - 新增最小带库入口 `pnpm verify:replace-ready:proof:with-db`，可在不跑整条 `with-db` replace-ready 的前提下单独复跑这条真源证明链
   - identity trace 现在可以直接区分“来源是什么”和“是否实际落到 next identity persistence”，但这仍属于观测收口，不改变当前 proof 的完成定义
   当前仍未补到：
   - 更完整的 snapshot 持久化失败矩阵 proof
   - 更多 compat schema/字段异常的系统化 proof

3. 继续做接口切缝，但不改底层真源。
   例如继续保持：
   - token 校验服务
   - identity 解析服务
   - snapshot 装载服务
   三段职责分离，而不是重新并回一个大 compat service。

4. 为 fallback 语义补显式标记。
   目标是未来能明确区分：
   - next 主路径
   - legacy 迁移 fallback
   - 完全 miss

#### 什么时候才能开始 `bootstrap/session` 真源替换

当前这三条已经具备，可以开始单线推进，但仍不适合并行混改：

1. `snapshot/player-source` 的 persisted provenance 已稳定落地，不再只能看到笼统的 `source=next`。
2. `next-auth-bootstrap` 或等价 smoke 能在带库场景稳定证明：
   - 第一次命中 `legacy_seeded`
   - 第二次同玩家命中 `next`
3. 文档和门禁口径已经固定成：
   - 无库场景只证明 compat 语义与协议边界
   - 带库场景才证明 snapshot 真源替换进度

现阶段仍不建议把 `WorldGateway / WorldSessionBootstrapService` 的 bootstrap/session 主流程和 token/identity/player-source 其他真源改动并行混做。

#### 绝对不要和别的任务安全并行混改的内容

1. 直接改 JWT 规则。
2. 直接改玩家 identity 真源表。
3. 直接改 bootstrap 装载主路径。
4. 同时改登录、快照、持久化与会话恢复。

这些都应该等 A 线门禁稳住后，单线推进。

### C. GM/admin/restore 自动化证明补全

这是当前第三优先级。

#### 目标

把已经存在的 `gm-compat`、`gm-database-smoke`、`shadow` 只读管理面证明点进一步整理成更稳定的 replace-ready 补证链，但不夸大成“完整运营面已 next 化”。

#### 需要完成的内容

1. 继续明确 GM/admin/restore 哪些属于自动化门禁，哪些仍属于人工回归。
2. 把 `acceptance`、`full`、`gm-compat`、`gm-database-smoke` 的口径在 README / TESTING / workflow / wrapper 中写成统一说法。
3. 避免把“最小 compat smoke 已有”误读成“完整运营面自动化已完成”。

#### 完成定义

- `acceptance`、`full`、`gm-compat`、`gm-database-smoke` 的定位一致
- 文档不会再把运营面 proof 夸大成完整 next 化
- shadow 与 with-db 的补证链能被稳定复跑

### D. `shared-next` 协议与类型层稳定化

这是当前第四优先级。

#### 目标

确保共享协议层不会反复成为 workspace 编译风险源，同时为 auth/token/bootstrap 真源替换提供稳定类型基线。

#### 需要完成的内容

1. 把高风险共享类型补齐一致性约束。
   重点检查：
   - 数值体系 `NumericStats`
   - realm / progression 常量与协议字段
   - bootstrap / panel / delta 的 shared 类型

2. 把“新增字段必须同时补初始化、克隆、重置、序列化/投影”的约束固化成更可复跑的检查。

3. 减少 `server-next` 对共享层临时脏改的脆弱性。

#### 完成定义

- `shared-next build` 在主工作树里稳定通过
- 新增数值字段不再出现“声明补了，配套 helper 漏了”的漂移
- 不再出现“后端没回归，但标准入口先被 shared 卡住”的不确定状态

### E. 最小包体 / 性能 / 扩展度 尾项

这是第五优先级，不是当前替换阻塞第一位，但会直接决定你最初目标能否成立。

#### 目标

把“能替换”进一步推进到“替换后足够好”。

#### 当前最值当的后端内容

1. 继续压薄 `Bootstrap`。
   - 减少 `Bootstrap` 与 `MapStatic` 的重复
   - 评估 `Bootstrap.self` 从巨型 `PlayerState` 拆成更稳定 slices

2. 继续压热路径总量。
   - 降低每 tick / 每连接的全量视图重建
   - 继续弱化 projector 的全量 capture + diff 成本
   - 继续减少高频对象克隆与排序

3. 继续提升协议扩展边界。
   - 把手写 clone/diff/capture 逻辑进一步分层
   - 降低 `WorldProjectorService / WorldSyncService` 的中心耦合

#### 完成定义

- 首包结构进一步变薄且文档化
- 有明确的高负载性能门禁或基准数据
- 扩展新系统时，不再默认往巨型 `PlayerState` 或中心化 sync/projector 里继续堆字段

### F. 替换后的 legacy 策略

这是最后一优先级。

#### 目标

在前四条完成后，再决定 legacy 的最终命运，而不是现在提前硬删。

#### 需要明确的决策

1. GM/admin/HTTP 是否保留为外层 compat 壳。
2. legacy auth 是否保留为旧号迁移入口。
3. legacy socket 是否继续保留只读或最小兼容模式。

#### 原则

- 可以保留 compat 壳
- 但不能再让 compat 反向污染 runtime 真源和 next 主链

## 5. 推荐阶段顺序

### 阶段 1：统一验收门禁

先做：

- 默认门禁定义
- acceptance 定义
- 最小带库真源证明链固定
- GM/admin/database 关键链路并入
- README / TESTING / workflow / wrapper 对齐

阶段完成标志：

- “怎么证明可接班”只有一套主口径

### 阶段 2：auth/token/bootstrap 真源拆分

再做：

- next token 真源
- next identity 真源
- next snapshot 真源
- legacy fallback 降级
- 对应 smoke / 可观测补齐

阶段完成标志：

- next 玩家会话主路径不再主要依赖 legacy JWT + 旧表 + legacy snapshot fallback

### 阶段 3：GM/admin/restore 证明补齐

同时推进：

- `gm-compat`
- `gm-database-smoke`
- shadow 管理只读面与关键写路径 proof
- 文档 / workflow / wrapper 口径统一

阶段完成标志：

- 运营面补证链定位稳定，不再和“完整 next 化”混淆

### 阶段 4：共享层与性能尾项收口

同时推进：

- `shared-next` 稳定性
- 首包瘦身
- 高负载性能门禁
- sync/projector 扩展边界清理

阶段完成标志：

- “能替换”开始接近“值得替换”

### 阶段 5：替换后的 compat 策略定稿

最后再做：

- 哪些 legacy 保留为兼容壳
- 哪些可以删除
- 哪些转为只迁移不常驻

## 6. 可安全并行项

现在可以安全并行的：

- 验收门禁文档、脚本、workflow 统一
- `snapshot/player-source` 的最小带库证明链固化
- GM/admin/database smoke 归并
- `auth-trace` 这类只读观测与统计字段补强
- `shared-next` 类型与协议层稳定化
- `WorldProjector / WorldSync / WorldRuntime` 的低风险性能尾项

现在不建议和别的大改并行的：

- auth/token/bootstrap 真源替换
- 旧号导入语义重写
- 大规模 runtime 持久化真源迁移

## 7. 完整替换完成的判定标准

只有同时满足下面几项，才适合改口说“next 可以完整替换游戏整体”：

1. `server-next` 默认验收门禁稳定全绿。
2. `acceptance` 已覆盖本地主证明链、具备数据库环境时的 with-db、本地或远端 shadow 实物验收，以及 shadow GM 关键写路径验证。
3. auth/token/bootstrap 主路径已 next-native，legacy 只剩显式 fallback。
4. `shared-next` 不再是 workspace 级风险源。
5. 首包、热路径、扩展边界至少达到“不会明显拖累替换”的水平。
6. 文档、脚本、workflow、实际运行口径一致。

## 8. 当前最推荐的下一步

如果只选一个方向立即开工，建议先做：

**A. 验收与证明链收敛**

原因：

- 风险最低
- 对“能否正式替换”价值最大
- 能给后面的 auth/token/bootstrap 真源替换提供稳定护栏

当前不建议立刻先做：

- 再刷 boundary audit 数字
- 再做前端表层收口
- 直接下潜 auth/token/bootstrap 真源重写而没有更稳的 acceptance 护栏

## 8.1 剩余工程账本

这一节不再讲抽象方向，只回答三件事：

1. 现在还剩哪些工程块
2. 哪些是真阻塞，哪些只是尾项
3. 哪些能安全并行，哪些必须串行

### 总体剩余量

- 如果目标是“正式替换旧前台玩家主链”，当前约还差 `20% - 30%`
- 如果目标是“完整替换游戏整体”，当前保守仍约差 `40% - 45%`
- 当前剩余工作可压成 `3` 个主阻塞块与 `3` 个尾项块

### P0 主阻塞

#### P0-1 `snapshot/player-source` 真源替换

当前状态：

- 已完成 provenance/source 护栏、顺序型 smoke、坏真源/坏 fallback 的一批负向 proof
- 仍未完成 next-native 主收口

仍卡住的模块：

- [world-player-snapshot.service.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-player-snapshot.service.js)
- [world-legacy-player-source.service.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-legacy-player-source.service.js)
- [world-player-source.service.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-player-source.service.js)
- [player-snapshot-compat.js](/home/yuohira/mud-mmo/packages/server-next/src/persistence/player-snapshot-compat.js)

为什么它还是 P0：

- authenticated 主链仍可回读 legacy 玩家源
- `loadLegacyPlayerSnapshot` 语义还没真正降级成显式迁移入口
- `L1` 还没过，legacy 不能删

还剩的具体任务：

1. 把 next snapshot 真源路径固定成默认主路径。
2. 把 compat snapshot fallback 从“默认可命中”继续压缩成“显式迁移/显式缺省场景才允许命中”。
3. 继续补完 snapshot 持久化失败矩阵和更多 compat schema/字段异常 proof。
4. 明确 `snapshot.source=miss` 在带库 authenticated 链路中的最终语义边界。

并行性判断：

- 可并行：proof 扩充、auth-trace 统计、文档口径
- 不可并行：和 `bootstrap/session` 主流程重写、token 规则重写、旧号导入语义改写混做

#### P0-2 `bootstrap/session` 真源替换

当前状态：

- guest canonical smoke 已收口
- forged sid / forged playerId / detached resume 的负向语义已有 proof
- 但 authenticated bootstrap 主链仍未彻底摆脱 legacy 依赖

仍卡住的模块：

- [world-session-bootstrap.service.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-session-bootstrap.service.js)
- [world-player-auth.service.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-player-auth.service.js)
- [world-player-token.service.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-player-token.service.js)
- [world-player-token-compat.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-player-token-compat.js)
- [world-legacy-jwt.service.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-legacy-jwt.service.js)

为什么它还是 P0：

- token 真源未完全 next-native
- authenticated 会话装载仍依赖 legacy JWT 语义与 compat identity/snapshot
- 这是 `L1` 最核心的未完成块

还剩的具体任务：

1. 固定 next token 的签发/校验/失效主规则。
2. 让 authenticated bootstrap 默认不再依赖 legacy JWT 与 compat token payload 归一。
3. 收紧 bootstrap 的 fresh player / miss / fallback 语义。
4. 把 bootstrap ready proof 从“证明 compat 边界正确”推进到“证明 next 主路径命中”。

并行性判断：

- 必须串行，且要排在 `snapshot/player-source` 真源进一步收紧之后

#### P0-3 replace-ready 与运营面证明链闭环

当前状态：

- `local / acceptance / full` 三层门禁已成型
- 本地 `verify:replace-ready` 这轮已再次全绿
- `with-db / shadow / acceptance` 已有通过证据
- 但完整 GM/admin/backup/restore 与真实环境旧入口退役观察仍未闭环

仍卡住的模块与入口：

- [TESTING.md](/home/yuohira/mud-mmo/packages/server-next/TESTING.md)
- [next-legacy-removal-checklist.md](/home/yuohira/mud-mmo/docs/next-legacy-removal-checklist.md)
- [compat-http.registry.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/compat-http.registry.js)
- [legacy-gm-admin-compat.service.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/http/legacy-gm-admin-compat.service.js)
- [legacy-session-bootstrap.service.js](/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/legacy-session-bootstrap.service.js)
- [legacy-auth-readiness-warmup.service.js](/home/yuohira/mud-mmo/packages/server-next/src/health/legacy-auth-readiness-warmup.service.js)

为什么它还是 P0：

- 这块直接决定“能不能正式替换”和“能不能开始删 legacy”
- `L2-L5` 现在都还没有完整满足

还剩的具体任务：

1. 明确哪些 GM/admin/restore proof 是自动化门禁，哪些仍属人工回归。
2. 跑完并固定真实维护窗口下的 destructive proof 与观察窗口。
3. 确认 shadow/线上已无旧入口流量，再决定 compat HTTP registry 的退役。
4. 把“默认门禁通过 != 完整替换就绪”继续写死到文档、workflow、wrapper。

并行性判断：

- 可与 P0-1 的 proof/文档准备并行
- 不应与 `bootstrap/session` 真源重写互相掺杂

### P1 尾项

#### P1-1 `shared-next` 协议与类型稳定化

当前状态：

- 当前不是事实阻塞
- 但仍是 workspace 级风险源

仍卡住的方向：

- `NumericStats`
- bootstrap / panel / delta shared 类型
- “新增字段必须补初始化、克隆、重置、投影”的一致性约束

并行性判断：

- 可安全并行

#### P1-2 最小包体与首包瘦身

当前状态：

- steady-state 增量同步已明显优于旧链
- 首包仍偏肥

核心尾项：

1. `Bootstrap` 与 `MapStatic` 的重复静态切片。
2. `Bootstrap.self` 仍是巨型 `PlayerState`。
3. `Bootstrap -> PanelDelta(full) -> Quests` 仍有首屏重复。
4. 传输主线仍是 Socket.IO JSON，而不是更窄的 next 主同步协议。

并行性判断：

- 可并行做设计、bench、低风险切片
- 不应和 auth/bootstrap 真源替换同时改语义

#### P1-3 热路径性能与扩展边界

当前状态：

- direct 性能热点 inventory 已清零
- 但热路径总体仍重

核心尾项：

1. 每 tick / 每连接仍有较重的全量视图构建与 diff。
2. `buildPlayerView`、自动战斗、projector 仍有重复计算。
3. `WorldProjectorService / WorldSyncService` 仍承载大量中心化 clone/diff/capture 逻辑。
4. 前台 `MapStore` 字符串键、部分 modal / observe body 整刷仍未到极致实现。

并行性判断：

- 可并行做 bench、低风险局部优化、基准门禁
- 不应和主协议真源改写一起混做

### P2 最后收尾

#### P2-1 legacy 删除与归档

前提不是“文件名里还有 legacy”，而是：

- `L1` 真源替换完成
- `L2` 外部旧入口退役
- `L3` 自动 proof 全绿
- `L4` 真实环境确认旧入口无人使用
- `L5` 观察窗口结束

在这些条件之前：

- `A/B/C` 类 legacy 文件不能删
- 当前最安全能继续治理的仍是 `D/E` 两类

### 当前最值当的收益点

如果按“单位风险对应的推进价值”排序，当前最值当的是：

1. 固化 `snapshot/player-source` 的带库 proof 与 source 观测，再进入单线真源替换。
2. 把 GM/admin/restore/shadow 的自动化门禁、人工门禁、观察窗口界线写死。
3. 补首包与热路径 bench，让“最小包体/最高性能”从判断语句变成可测指标。

### 一句话收口

现在已经不是“还差很多零散小问题”，而是“还差三个主阻塞没有过线”：`snapshot/player-source` 真源、`bootstrap/session` 真源、以及 `GM/admin/restore/legacy 退役` 的证明闭环。

## 9. 一句话结论

下一阶段最正确的路线，不是继续证明 `server-next`“看起来不像 legacy”，而是先把“如何稳定证明它已经可以接班”写完整，再按 `snapshot/player-source -> bootstrap/session` 的顺序把 auth/bootstrap 真源真正换成 next 自己的。

## 10. 全量剩余工程账本

这一节把前面“仍约差 `40% - 45%`”拆成更可执行的工程块。

### 10.1 总体拆账

按当前口径，剩余工作可粗分成三层：

1. `P0` 真阻塞。
   这是“能不能完整替换游戏整体”的硬门槛，当前大约还占剩余工作的 `20% - 25%`。
2. `P1` 替换后才能站稳的运营面 / legacy 退役门槛。
   这是“能不能安全宣布接班、开始删 legacy”的硬门槛，当前大约还占 `10% - 12%`。
3. `P2` 最小包体 / 性能 / 扩展 / 稳定性尾项。
   这是“替换后够不够好”的剩余项，当前大约还占 `10% - 15%`。

上面三项不是精确工时，只是用来回答“还差多少”。

### 10.2 P0 真阻塞

#### P0-1 `snapshot/player-source` 真源替换

当前状态：

- `WorldPlayerAuthService` 已把 identity 顺序收成 `next -> compat -> token fallback`
- `WorldPlayerSnapshotService` 已把 snapshot 顺序收成 `next -> legacy fallback -> miss`
- 带库顺序 proof 已能证明“第一次 `legacy_seeded`、第二次 `next(native)`”
- 但 `WorldPlayerSourceService` 现在仍只是 `WorldLegacyPlayerSourceService` 的 facade，没有 next-native player source

当前阻塞模块：

- `packages/server-next/src/network/world-player-auth.service.js`
- `packages/server-next/src/network/world-player-snapshot.service.js`
- `packages/server-next/src/network/world-player-source.service.js`
- `packages/server-next/src/network/world-legacy-player-source.service.js`
- `packages/server-next/src/network/world-legacy-player-repository.js`
- `packages/server-next/src/compat/legacy/http/legacy-auth-http.service.js`

还剩的具体工程块：

1. 把 `WorldPlayerSourceService` 从“纯 legacy facade”改成真正的 next player source 编排层。
2. 把 authenticated 主链里对 compat `users/players` 和 legacy HTTP account 的默认依赖，继续降成显式 fallback，而不是当前的默认第二顺位主源。
3. 把 `legacy_runtime / legacy_backfill / legacy_seeded` 这组三态，从“证明链里可观测”推进到“运行时默认不再常态命中”。
4. 补齐 snapshot 持久化失败矩阵和更多 compat schema/字段坏值 proof，避免一旦继续收紧 fallback 面时又回出新的静默成功分支。

并行性判断：

- 这条主线内部不适合并行混改。
- `WorldPlayerAuthService`、`WorldPlayerSnapshotService`、`WorldPlayerSourceService`、`WorldLegacyPlayerSourceService` 必须单线串行推进。
- 只读 trace、proof、文档、doctor、自检脚本可以并行，但不能和真源语义改动混到同一个补丁里。

保守判断：

- 这一块是当前最大的单点剩余。
- 在“完整替换游戏整体”的剩余里，它大约占 `12% - 15%`。

#### P0-2 `bootstrap/session` 真源替换

当前状态：

- `WorldSessionBootstrapService` 已经把 GM socket token 校验外提到 `WorldGmAuthService`
- guest canonical 链路已收口，`requestedPlayerId` 真 fallback 已去掉
- authenticated 非 native next identity + `snapshot miss` 的 fresh bootstrap 入口也已收掉
- continuity 语义这轮又收紧了一刀：
  - `legacy_runtime` 下已不再允许 connected reuse
  - `legacy_runtime` 下已不再允许 detached implicit resume
  - `legacy_runtime` 下即使显式携带旧 `sessionId`，也不能 requested resume
  - `next-auth-bootstrap` smoke 已显式输出 `explicitRequestedSid / explicitRequestedResumed / expectedExplicitRequestedResume`
- 但 bootstrap 主流程本身仍建立在当前 compat identity/snapshot 语义之上

当前阻塞模块：

- `packages/server-next/src/network/world-session-bootstrap.service.js`
- `packages/server-next/src/network/world-session.service.js`
- `packages/server-next/src/network/world.gateway.js`
- `packages/server-next/src/runtime/player/player-runtime.service.js`
- `packages/server-next/src/network/world-gm-auth.service.js`

还剩的具体工程块：

1. 把 authenticated bootstrap 的角色装载、入图与剩余恢复语义，完全建立在 next identity + next snapshot 上，而不是“next 优先、compat 兜底”的当前折中语义。
2. 把 `WorldSessionBootstrapService.shouldAllowAuthenticatedLegacySnapshotFallback()` 这类“主流程里决定是否继续回读 legacy”的逻辑，继续压缩到迁移期显式 fallback，而不是默认常驻分支。
3. 把 GM socket token 校验从“中性 facade 包着 legacy GM HTTP auth 真源”推进成 next 自己的 GM auth 真源。
4. 把 bootstrap 完成后的 `emitInitialSync`、session 绑定、loadOrCreatePlayer 恢复路径做一轮 next-native 契约核定，避免 session 真源改完后初始同步语义漂移。

并行性判断：

- 这条必须排在 `P0-1` 后面，不能倒过来。
- 它也不适合与登录、快照持久化、会话恢复同时大改。
- 最多只能和只读 smoke、trace summary、文档收口并行。

保守判断：

- 这是第二个硬阻塞。
- 在“完整替换游戏整体”的剩余里，它大约占 `8% - 10%`。

#### P0-3 next 主玩家链以外的运行兼容壳仍在

当前状态：

- direct boundary inventory 已清零，但运行态里 compat 还没有消失
- `WorldSyncService` 仍注入 `WorldLegacySyncService`
- `AppModule` 仍注册 compat HTTP providers/controllers
- `WorldProtocolProjectionService`、`WorldGmSocketService`、tick/runtime 一带仍继续引用 GM compat 壳

当前阻塞模块：

- `packages/server-next/src/app.module.js`
- `packages/server-next/src/network/world-sync.service.js`
- `packages/server-next/src/network/world-legacy-sync.service.js`
- `packages/server-next/src/network/world-protocol-projection.service.js`
- `packages/server-next/src/network/world-gm-socket.service.js`
- `packages/server-next/src/runtime/tick/world-tick.service.js`

还剩的具体工程块：

1. 把 legacy socket / GM / HTTP 兼容壳和 next 主玩家链的运行时依赖彻底切开。
2. 让 next-only 运行场景不需要继续加载 legacy sync / compat HTTP registry 就能完整工作。
3. 明确哪些 compat 只保留为外层入口壳，哪些仍然污染 runtime 主链。

并行性判断：

- 这条可以在 `P0-1/P0-2` 做完后拆开推进。
- 但在 `L1` 没过前，不应先删运行主链 compat 文件。

保守判断：

- 这块对“完整替换游戏整体”是次级阻塞，对“删 legacy”则是直接阻塞。

### 10.3 P1 接班与删 legacy 门槛

#### P1-1 `L1` 还没过：运行主链 legacy source 仍在

当前文件族：

- `packages/server-next/src/network/world-legacy-player-source.service.js`
- `packages/server-next/src/network/world-legacy-player-repository.js`
- `packages/server-next/src/network/world-legacy-jwt.service.js`
- `packages/server-next/src/network/world-player-token-compat.js`
- `packages/server-next/src/network/world-legacy-sync.service.js`
- `packages/server-next/src/persistence/player-snapshot-compat.js`
- `packages/server-next/src/network/world-player-source.service.js`

当前判断：

- 这是当前不能删 `legacy` 的第一硬门槛。
- `L1` 不过，就谈不上整批删除运行主链 compat。

#### P1-2 `L2` 还没过：外部旧入口仍挂载

当前文件族：

- `packages/server-next/src/compat/compat-http.registry.js`
- `packages/server-next/src/compat/legacy/http/legacy-auth.controller.js`
- `packages/server-next/src/compat/legacy/http/legacy-account.controller.js`
- `packages/server-next/src/compat/legacy/http/legacy-gm.controller.js`
- `packages/server-next/src/compat/legacy/http/legacy-gm-admin.controller.js`
- `packages/server-next/src/compat/legacy/http/legacy-gm-auth.controller.js`
- `packages/server-next/src/compat/legacy/legacy-session-bootstrap.service.js`
- `packages/server-next/src/health/legacy-auth-readiness-warmup.service.js`

当前判断：

- 旧 `/auth/*`、`/account/*`、`/gm/*` 和 legacy socket 入口还在。
- 所以现在不能把“主链 smoke 跑绿”误读成“外部旧入口可以立即退役”。

#### P1-3 `L3-L5` 还没全过：证明链已很强，但还没到可删 legacy

当前已具备：

- 本地 `verify:replace-ready` 已再次全绿
- `with-db / shadow / acceptance` 已有通过证据
- `shadow:destructive` 与 `gm-database-backup-persistence` 已补成独立 proof

当前仍差：

1. 真实维护窗口里稳定执行 `shadow:destructive`
2. 独立真数据库 restore 演练与人工窗口
3. 真实环境确认旧入口无人使用
4. 留出稳定观察窗口，确认登录、入图、邮件、GM、备份恢复、shadow 验收都不再回头依赖 legacy 壳

并行性判断：

- 这条可以和 `P2` 并行推进。
- 不能和 `P0` 真源混改放在同一个补丁里，但可以同时补脚本、workflow、runbook、观测和环境演练。

保守判断：

- 这块大约占总剩余的 `10% - 12%`。
- 它不是代码量最大的一块，但决定你什么时候才能安全删 legacy。

### 10.4 P2 包体 / 性能 / 扩展 / 稳定性尾项

#### P2-1 最小包体

当前阻塞模块：

- `packages/server-next/src/network/world-sync.service.js`
- `packages/server-next/src/network/world-projector.service.js`

主要剩余项：

1. `emitNextInitialSync()` 当前仍先发 `Bootstrap`，再补 `MapStatic / Realm / LootWindow`，首包分层仍有重复。
2. `Bootstrap.self` 仍然偏大，没有进一步拆成更稳定的静态/低频/高频 slices。
3. `PanelDelta(full)` 与 `Quests` 往往仍跟在首屏链后面，首屏总体还没有压到最小。
4. 主链传输仍是 Socket.IO JSON，不是更窄线宽的 next 主协议。

当前判断：

- steady-state 已经比旧链好很多。
- 但如果目标是“全部最小包体”，当前仍只能算 `部分满足`。

#### P2-2 最高性能

当前阻塞模块：

- `packages/server-next/src/network/world-projector.service.js`
- `packages/server-next/src/network/world-sync.service.js`
- `packages/server-next/src/runtime/player/player-attributes.service.js`

主要剩余项：

1. `WorldProjectorService.createDeltaEnvelope()` 仍以整量 capture / cache / diff 为主。
2. `WorldSyncService.emitNextInitialSync()` 与 delta 辅助链仍有较重的视图构造和克隆。
3. `buildAttrBonuses()`、`visibleMinimapMarkers`、低频面板聚合等仍有每 tick 或每次同步 CPU 成本。
4. 首屏对象体积偏大，传输仍是 Socket.IO JSON。

当前判断：

- 这块目前仍应明确判定为 `未满足`。

#### P2-3 极高扩展度

当前阻塞模块：

- `packages/server-next/src/network/world-projector.service.js`
- `packages/server-next/src/network/world-sync.service.js`
- `packages/server-next/src/network/world-sync-protocol.service.js`

主要剩余项：

1. `WorldProjectorService / WorldSyncService` 仍承载大量中心化 clone / diff / capture 逻辑。
2. 新系统继续往 `Bootstrap / PanelDelta / PlayerState` 里堆字段的惯性还在。
3. 面板上下文仍有分散事件与外部上下文拼接，不够 slice 化。

当前判断：

- 已有不错基础，但现在只能算 `部分满足`。

#### P2-4 系统稳定性

当前阻塞模块：

- `packages/server-next/TESTING.md`
- `packages/server-next/src/tools/smoke-suite.js`
- `packages/server-next/src/tools/next-auth-bootstrap-smoke.js`
- `packages/server-next/src/tools/gm-database-smoke.js`
- `packages/server-next/src/tools/shadow-gm-database-proof.js`

主要剩余项：

1. 本地主证明链、with-db、shadow、acceptance、full 的边界虽然已基本固定，但仍要继续防止口径漂移。
2. 完整 GM/admin/backup/restore 人工回归仍不能被自动 proof 完全替代。
3. `shared-next` 仍需要继续稳定，避免重新成为 workspace 级验证阻塞源。

当前判断：

- 比前几轮明显更稳，但仍只能算 `部分满足`。

### 10.5 串并行执行建议

当前适合安全并行的：

- 文档、workflow、wrapper、doctor、自检入口统一
- `next-auth-bootstrap` / `gm-database` / `shadow` 这类 proof 补强
- `auth-trace` summary、运行时观测、环境门禁补强
- `shared-next` 类型层稳定化
- `WorldProjector / WorldSync` 的低风险性能尾项

当前必须串行推进的：

1. `snapshot/player-source` 真源替换
2. `bootstrap/session` 真源替换
3. GM auth 真源替换
4. 运行主链 legacy source 退场

串行顺序建议固定为：

1. `snapshot/player-source`
2. `bootstrap/session`
3. 运行主链 legacy source 退场
4. 外部旧入口退役与 `L2-L5` 收口

### 10.6 截止当前的最保守结论

如果按最初目标逐项判断，当前仍应维持下面的统一口径：

- 最小包体：`部分满足`
- 最高性能：`未满足`
- 极高扩展度：`部分满足`
- 系统稳定性：`部分满足`
- 完整替换游戏整体：`未满足`

如果只问“现在全量还差多少”，当前最保守、也最接近真实工程状态的回答仍是：

- 距离“正式替换旧前台玩家主链”：约还差 `20% - 30%`
- 距离“完整替换游戏整体”：约还差 `40% - 45%`
- 距离“整批安全删除 legacy”：当前仍明显不是最后一步，必须先过 `L1-L5`

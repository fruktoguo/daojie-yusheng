# server-next 当前缺口分析

更新时间：2026-04-06

## 当前状态

完整阶段方案、工作流拆分与完成定义见 [docs/next-remaining-execution-plan.md](/home/yuohira/mud-mmo/docs/next-remaining-execution-plan.md)。

补充口径：

- `auth/token/bootstrap` 真源替换已经开始第一刀，不再是纯准备阶段
- 当前已完成的是 `token/identity` 优先级收正，stale token 不再优先覆盖最新 compat identity
- legacy HTTP auth 与 next socket auth 当前已经共用同一套 next token codec；identity 主顺序也已固定成 `next -> compat -> token fallback`
- `identity` trace 也开始把“来源”和“是否真正落到 next identity persistence”拆开表达：`source` 主枚举已扩到 `next_invalid`，并补齐 `persistenceEnabled / persistAttempted / persistSucceeded / persistFailureStage`
- `snapshot` persisted provenance 也已开始落地，next 持久化层已开始区分 native snapshot 与 `legacy_seeded`
- `token/identity` 与 `snapshot/player-source` 的异常数据护栏也已开始收口：带库场景下，next 持久化里如果已经存在非法 identity/snapshot 记录、compat snapshot 查询因为 `users/players` schema 缺失而不可判定，或 compat snapshot 行里的 `mapId / unlockedMinimapIds` 本身非法，主链现在都会直接失败并记录 trace
- 当前剩余主块仍是 `snapshot/player-source` 与 `bootstrap/session`

### 当前可安全并行推进项

截至 `2026-04-06`，不直接碰高风险真源替换时，当前最适合继续并行推进的是四类：

- 文档与替换证明链补强。
  包括同步最新 `verify:replace-ready` 实测结果、统一 `docs/next-legacy-boundary-audit.md` 的结论口径，以及把 `P0/P1/暂缓` 的现状重新压实。
- 后端低风险边界收口。
  包括 `replace-ready` 周边脚本、环境变量 alias、一层 compat facade 外提，以及不碰 auth/bootstrap 真源语义的协议 helper 整理。它们能继续压薄耦合，但不能夸大成完整替换已完成。
- replace-ready 与 shadow / with-db / GM-admin 证明链补强。
  现在更大的缺口已经不再是 direct boundary inventory，而是把已跑绿的 `replace-ready`、`with-db`、`shadow` 与 GM/admin/restore 自动化证明固定成稳定门禁。
- `snapshot/player-source` 准备层收口。
  带库顺序型 smoke 已经实跑通过，当前更值当的是在既有 provenance/顺序护栏下继续收紧 legacy fallback，而不是继续把“第一次 `legacy_seeded`、第二次 `next`”写成待证明能力。
- 共享层稳定性与协议层收口。
  `server-next` 的 direct boundary inventory 已经清零，当前更值当的，是继续收口 `shared-next` 的协议/类型层，避免共享层再度变成 workspace 级验证阻塞点。

当前不建议并行拉进来的内容：

- `snapshot/player-source` 与 `bootstrap/session` 真源主链替换
- 完整旧天机阁七榜迁移
- 只为了协议对称性补一条当前前台没有真实入口的冗余 next 链

### 当前最安全的实际并行顺序

1. 先做不依赖环境的收口：
   - `replace-ready` 脚本 / 文档 / 审计口径
   - `replace-ready / with-db / shadow` 的门禁口径补强
   - `snapshot/player-source` 的准备层收口与最小带库真源证明链固化
2. 再做依赖独立环境的验证：
   - `pnpm verify:replace-ready:with-db`
   - `pnpm verify:replace-ready:shadow`
   - `pnpm verify:replace-ready:acceptance`
3. 继续暂缓高风险真源替换：
   - `snapshot/player-source` 与 `bootstrap/session`
   - GM/admin/restore 整体 next 化
   - 完整旧七榜迁移

### 已完成的关键进度

- `pnpm verify:replace-ready` 这轮本地已通过；此前 `gm-compat-smoke` 的 HTTP GM update 超时问题已经修稳，`pnpm verify:server-next` 当前只是兼容别名。
- `pnpm verify:replace-ready:doctor` 当前可通过，并会显式报告 `with-db / proof with-db / shadow / shadow destructive / acceptance / full` 各链缺失的环境变量；其中 with-db 依赖 `DATABASE_URL` / `SERVER_NEXT_DATABASE_URL`，shadow 与 acceptance 依赖 `SERVER_NEXT_SHADOW_URL` / `SERVER_NEXT_URL` 和 `SERVER_NEXT_GM_PASSWORD` / `GM_PASSWORD`，`shadow destructive` 还会显式要求 `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1` 与维护窗口；`pnpm verify:server-next:doctor` 当前只是兼容别名。
- `pnpm verify:replace-ready:with-db` 这轮已在本地独立 PostgreSQL/Redis 环境实跑通过；此前真正卡住它的 `marketTradeHistory` 协议审计用例已修成“等待成交历史可见”而不是误把成交后的瞬时空页判失败。
- `gm-database-smoke` 这轮也继续收口到运营实际路径：除了 `backup -> restore` 外，现在还会显式校验并发 `backup/restore` 的单飞拒绝、`GET /gm/database/backups/:backupId/download` 下载内容与 `gm/database/state` 元数据、磁盘备份内容一致，覆盖 restore 生成的 `pre_import` 检查点备份下载，补上“backup 后新增建议单与 GM 直邮在 restore 后消失，且 mail summary 回到 backup 前基线”的业务态回滚证明，并验证服务重启后 `lastJob / checkpointBackupId / sourceBackupId / appliedAt / finishedAt` 仍可读。
- `pnpm verify:replace-ready:shadow` 这轮也已对本地 `11923` shadow 实例实跑通过，至少证明 `/health`、GM 登录、`/gm/state`、`/gm/maps`、`/gm/editor-catalog`、`/gm/maps/:mapId/runtime` 与最小 `n:c:hello` next 会话链路当前可用。
- 仓库里现已补上 `pnpm verify:replace-ready:shadow:destructive` / `pnpm --filter @mud/server-next smoke:shadow:gm-database`，用于在维护窗口里单独证明已部署 shadow 的 `backup -> download -> restore` destructive 闭环；它默认不并入共享 shadow 只读验收链。
- `pnpm verify:replace-ready:acceptance` 当前脚本已提升为“本地主证明链 + shadow 实物验收 + shadow GM 关键写路径验证”的组合入口；这会继续压缩 deploy 后的人工检查面，但它仍未把更完整的 GM/admin 回归自动化成单一日常门禁。
- `pnpm verify:replace-ready:full` 当前已继续抬高到“强制 with-db + gm-database + gm-database-backup-persistence + shadow + gm-compat”的最严格自动化链，开始把数据库运营面回归与 backup dir 持久化 proof 一并并入 full，而不再只停留在 `with-db + shadow + gm-compat`。
- `pnpm --filter @mud/server-next smoke:legacy-auth` 这轮也已扩到 legacy 普通玩家 HTTP compat 最小闭环，覆盖 `POST /auth/register /auth/login /auth/refresh /account/password /account/display-name /account/role-name`，并显式验证 account 资料更新后 runtime 身份投影与重新握手 bootstrap 都会跟上最新 `displayName / roleName`。
- 无数据库环境下它现在会先走 compat HTTP `/auth/register`/`/auth/login` 拿到真实 access token，再用该 token 完成 socket bootstrap；带数据库时仍保留 seeded legacy token fixture 以验证旧 token 兼容链路。
- `pnpm --filter @mud/server-next smoke:legacy-player-compat` 这轮也已通过，已覆盖 legacy 普通玩家 socket 的 `c:navigateQuest / c:action(type=loot:open) / c:sortInventory / c:destroyItem / c:ackSystemMessages / c:chat`，并显式断言 `protocol: legacy` 握手后不混入任何 `n:s:*` next 事件。
- `pnpm --filter @mud/server-next smoke:next-auth-bootstrap` 这轮已接入 replace-ready 主链，用 `/auth/register -> /auth/login` 取得 legacy token 后走 `protocol: next` 连接，覆盖当前“连接阶段直接 bootstrap”的 next-native `InitSession / Bootstrap / MapStatic / Realm / WorldDelta / SelfDelta / PanelDelta` 入场链，并显式断言 next socket 不混入 legacy `s:*` 事件；该 smoke 也锁定了当前 compat 语义：已 bootstrap 的带 token 连接补发 `n:c:hello` 不会重复入场。
- `next-auth-bootstrap` smoke 这轮也补了一条更硬的 identity 一致性门禁：登录拿到的 token claims 里的 `playerId / playerName`，现在必须和 `InitSession`、`Bootstrap.self.id` 以及 runtime `player.name` 对齐，避免 token、identity 回填与最终 bootstrap 入场结果漂移后仍被误判通过。
- 带库 `next-auth-bootstrap` proof 这轮也把 identity 来源锁成了硬门禁：在 `compatIdentityBackfillSnapshotPreseed` 这条 preseed 成功链上，第一次必须是 `legacy_backfill`，第二次必须回到 `next`，不再允许 with-db proof 在这条链上静默掉回 `legacy_runtime / token` 仍算通过。
- 显式开启 `NEXT_AUTH_TRACE_ENABLED=1` 后，`next-auth-bootstrap` smoke 现在还会输出 `snapshotPersistedSource`；无库时会明确回报 `snapshotSequence.supported=false`，而带库时则会把“第一次 `legacy_seeded`、第二次 `next` 且 persistedSource=native`”作为硬门禁，避免把 compat 可跑误读成真源已替换完成。
- 这轮还实际补跑了 `next-auth-bootstrap` 的两条关键证明链：无库回归会稳定返回 `snapshotSource=miss`、`snapshotSequence.supported=false`；带库场景则已实跑通过第一次 `legacy_seeded` / 第二次 `next(native)` 的顺序证明。
- 这轮还新增了最小带库入口 `pnpm verify:replace-ready:proof:with-db`；它当前是最小带库 `auth/token/bootstrap` 真源证明链入口，只覆盖 `next-auth-bootstrap` 顺序型 smoke 与 `persistence-smoke`，用于快速反复验证 `snapshot/player-source` 的证明链，而不必每次都跑完整 `with-db` replace-ready。
- 带库 `next-auth-bootstrap` proof 这轮还补上了 `compatBackfillSaveFailed` 专项证明：当 next identity 文档缺失、compat identity 可读，但定向拦截 `server_next_player_identities_v1` 的 backfill 写入时，连接当前只允许在 next snapshot 仍存在时以 `legacy_runtime` 成功 bootstrap；trace 必须显式留下 `persistAttempted=true / persistSucceeded=false / persistFailureStage=compat_backfill_save_failed`，`snapshot.source` 仍必须保持 `next`，且 identity 文档最终仍不存在，不再把这类失败伪装成 `legacy_backfill` 成功链。
- 带库 `next-auth-bootstrap` proof 这轮还补上了 `compatBackfillSaveFailedMissingSnapshotRejected` 专项证明：当 next identity 文档缺失、compat identity 可读、backfill 写入被定向打失败，并同时删除 next/legacy snapshot 源时，同一 token 再连当前必须直接失败；trace 必须显式留下 `identity.source=legacy_runtime`、`snapshot.source=miss`、`bootstrapPresent=false`，证明“非 native next identity + snapshot miss”不再走 fresh bootstrap。
- 带库 `next-auth-bootstrap` proof 这轮还补上了 `invalidSnapshotRejected` 专项证明：当保留 next identity 与 next snapshot，但把 `server_next_player_snapshots_v1` 文档改成非法 payload 时，同一 token 再连当前必须直接失败；trace 必须显式留下 `identity.source=next`、`snapshot.source=next_invalid`、`bootstrapPresent=false`，不再允许把坏 next 真源静默吞成 compat fallback 或 miss。
- 带库 `next-auth-bootstrap` proof 这轮还补上了 `invalidSnapshotMetaPersistedSourceNormalized` 专项证明：当 next snapshot 主体仍有效、只是 `payload.__snapshotMeta.persistedSource` 被污染成非法值时，同一 token 再连当前仍必须成功 bootstrap；trace 必须显式留下 `identity.source=next`、`snapshot.source=next`、`snapshotPersistedSource=native`。
- 带库 `next-auth-bootstrap` proof 这轮还补上了 `invalidSnapshotUnlockedMapIdsNormalized` 专项证明：当 next snapshot 主体仍有效、只是 `payload.unlockedMapIds` 被污染成非法非数组值时，同一 token 再连当前仍必须成功 bootstrap；trace 必须显式留下 `identity.source=next`、`snapshot.source=next`、`snapshotPersistedSource=native`，且运行时读取到的 `unlockedMapIds` 必须被归一成空数组。
- 带库 `next-auth-bootstrap` proof 这轮还补上了 `nextIdentityCompatSnapshotIgnored` 专项证明：当保留 next identity、删除 next snapshot、保留 compat snapshot 时，同一 token 再连当前必须直接失败；trace 必须显式留下 `identity.source=next`、`snapshot.source=miss`、`bootstrapPresent=false`，且 compat snapshot 文档仍在、next snapshot 文档最终仍不存在，证明 next identity 主链已不再回落 compat snapshot fallback。
- 带库 `next-auth-bootstrap` proof 这轮还补上了 `nextIdentityInvalidCompatMapIdIgnored` 专项证明：当保留 next identity、删除 next snapshot、保留 compat snapshot，再把 compat `mapId` 改成非法空值时，同一 token 再连当前仍必须直接失败；但 trace 必须显式留下 `identity.source=next`、`snapshot.source=miss`、`bootstrapPresent=false`，且 compat snapshot 文档仍在、next snapshot 文档最终仍不存在，证明 next identity 主链不会再回落 compat snapshot，也不会再去读取 compat 坏 placement。
- 带库 `next-auth-bootstrap` proof 这轮还补上了 `nextIdentityInvalidUnlockedMapIdsIgnored`、`missingSnapshotRejected` 与 `invalidIdentityRejected` 三条专项证明：当保留 next identity、删除 next snapshot、保留 compat snapshot，再把 compat `unlockedMinimapIds` 改成非法值时，同一 token 再连也必须直接失败，且 trace 必须显式落成 `snapshot.source=miss`；已鉴权带库链路下普通 `snapshot.source=miss` 也必须硬失败；next persisted identity 非法时则必须在 snapshot 装载前直接失败。
- `pnpm --filter @mud/server-next smoke:gm-compat` 这轮已通过，除旧 GM socket/HTTP 最小兼容链外，也已补到 `/gm/maps`、`/gm/editor-catalog`、`/gm/maps/:mapId/runtime` 三组只读管理面，以及玩家改密、地图 tick/time、邮件、建议单等关键维护写路径；输出里现在会带 `passwordChange / adminRead.currentMap / editorCatalog / runtimeInspection` 摘要，便于 shadow 后核对真实读面。
- `pnpm --filter @mud/server-next smoke:readiness-gate` 这轮也已补上，用独立自起实例显式锁定 readiness gate 语义：无数据库且未显式旁路时 `/health` 返回 `503` 且新 next socket 会收到 `SERVER_NOT_READY`；只有开启 `SERVER_NEXT_ALLOW_UNREADY_TRAFFIC=1` / `SERVER_NEXT_SMOKE_ALLOW_UNREADY=1` 后，本地 smoke 才允许继续跑。这里补的是系统稳定性门禁，不是 auth/bootstrap 真源替换。
- 根级 `pnpm verify:replace-ready` 这轮也已串行覆盖 `pnpm audit:server-next-protocol`；其包内实际执行入口 `pnpm --filter @mud/server-next audit:next-protocol` 也已通过。
- `pnpm audit:server-next-boundaries` 对应的最新自动报告已刷新到 `docs/next-legacy-boundary-audit.md`；当前报告已降到 `0/22` 个预设检查项、`0` 处代码证据，`P0 auth/bootstrap 真源`、`P0 legacy HTTP/GM/admin`、`P1 world sync compat`、`P1 runtime/persistence compat` 与“目标差距: 性能/扩展” inventory 已全部清零。这里补的是“主服务 direct inventory 自动化”，不是说整体替换已完成。
- `WorldGateway` 这轮又继续收了一层纯语义 legacy 边界：连接鉴权异常现在统一回到中性 `AUTH_FAIL`，不再单独对外发 `LEGACY_AUTH_FAILED`；`next-auth-bootstrap` smoke 也补了坏 token 负向断言，显式验证 next socket 在无效 token 下只收到 `AUTH_FAIL`，且不混入任何 legacy `s:*` 事件。这里补的是错误码语义和门禁一致性，不是 auth/bootstrap 真源替换完成。
- `WorldSessionBootstrapService` 这轮也继续收了一层 bootstrap 主链 direct legacy 依赖：GM socket token 校验已外提到中性的 `WorldGmAuthService`，`WorldSessionBootstrapService` 不再直接注入 legacy GM HTTP auth；但底层校验目前仍复用 legacy GM HTTP auth 真源，所以这只是 bootstrap 主链的边界收口，不是 GM auth 真源替换完成。
- `WorldGateway` 这轮又继续压薄了一层 direct legacy GM compat 依赖：GM socket 的 `getState/spawnBots/removeBots/updatePlayer/resetPlayer` 命令桥，和 tile detail 的 legacy 投影发包，现已外提到中性的 `WorldGmSocketService` / `WorldProtocolProjectionService`；`WorldGateway` 本身不再直接注入 `LegacyGmCompatService`。这里补的是 gateway 边界削薄与协议投影外提，不是 GM compat 或 tile legacy 真源已经移除。
- `server-next` 这轮也补了一层后端环境口径归一：legacy player source、legacy auth、持久化服务、health readiness、protocol audit 与 GM/database 相关 smoke 现在都统一接受 `SERVER_NEXT_DATABASE_URL/DATABASE_URL` 与 `SERVER_NEXT_GM_PASSWORD/GM_PASSWORD` 这组别名，不再出现“replace-ready/doctor 判定 ready，但服务内部仍按缺单一环境变量降级”的不一致。
- `server-next` 这轮也补齐了剩余 smoke / shadow 周边 URL 入口：`combat / loot / runtime / session / progression / player recovery / player respawn / monster*` 这一组工具现在都统一接受 `SERVER_NEXT_URL`，并通过同一 alias helper 读取；`verify:replace-ready:shadow`、`verify:replace-ready:acceptance`、`smoke:shadow` 这组链路继续保持 `SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL` 的同义入口口径。这里补的是环境变量入口归一，不是把 shadow 默认并入根级主链。
- 这轮环境来源归一也继续扩到了根级 wrapper：`replace-ready / doctor / with-db / shadow / acceptance` 与 `verify:server-next*` 这组 alias 现在都按同一套 database/shadow/GM alias helper 解析来源，不再出现 root wrapper、自检入口和包内 smoke 各自维护一套 alias 判断的漂移。这里补的是入口一致性，不是证明链新增覆盖面。
- 协议审计这轮又继续补了两层低风险收口：GM 登录现在也走 `SERVER_NEXT_GM_PASSWORD/GM_PASSWORD` alias；独立 runner 会把子进程里的 `SERVER_NEXT_URL` 与 `SERVER_NEXT_SHADOW_URL` 都钉到本次自起审计实例，避免继承外部 shadow URL 串到错误目标。
- `WorldSyncService` 这轮又补了一层低风险后端收口：`Quests / MapStatic / Realm / LootWindow / Notice` 的 next/legacy 发包现在统一走显式协议 helper，收益主要是把低频协议分流边界写清、减少重复分流；它不触及 `Bootstrap` 构造、`WorldDelta` 高频主链或 auth/bootstrap 真源替换。
- `auth/bootstrap` 这轮继续补了可观测性：显式设置 `SERVER_NEXT_AUTH_TRACE_ENABLED=1` 或 `NEXT_AUTH_TRACE_ENABLED=1` 后，`WorldPlayerTokenService` / `WorldPlayerAuthService` / `WorldPlayerSnapshotService` / `WorldSessionBootstrapService` 会把 `token / identity / snapshot / bootstrap` 四段记录写入 ring buffer，并通过受 runtime debug guard 保护的 `/runtime/auth-trace` 暴露给 `next-auth-bootstrap` smoke 做断言；默认不开启，不改变正常链路。它有助于后续继续拆 auth/bootstrap 真源，但不改变当前 `P0` 仍未完成的判断。
- `/runtime/auth-trace` 的读侧 `summary` 这轮也固定了一层 schema：除已有 `typeCounts / sourceCounts` 外，现在还会稳定给出 identity 持久化动作计数、bootstrap 的 `requestedSessionCount`，以及 `bootstrap.linkedSourceCounts / linkedPersistedSourceCounts`。这补的是真源替换前的可观测性，不是 bootstrap/session 已 next-native。
- `snapshot` trace 这轮也更精确了：legacy fallback 命中时，当前已能区分“runtime fallback 的 `legacy_runtime`”和“已 seed 成功的 `legacy_seeded`”，不再把未落盘 fallback 误记成已完成 seed；与之对应，identity trace 上的 `legacy_backfill` 现在也只保留给“backfill + preseed 均已确认成功”的链路。
- `snapshot/player-source` 这轮也继续收掉两类静默降级：如果 next 持久化里已经有该玩家的 snapshot 记录，但记录非法，主链现在会直接报错并记 `next_invalid` trace；如果 compat snapshot 查询因为 `users/players` schema 缺失而不可判定，主链也会直接报错并记 `legacy_source_error`，而不是把坏真源/坏 fallback 静默当成 miss 后继续跑。
- `WorldLegacyPlayerSourceService` 这轮也补了一层低风险 auth/bootstrap 收口：无数据库 fallback 时，身份解析不再只信 token 里的陈旧 `displayName`，而会优先回读 legacy 内存账号中的 `displayName / pendingRoleName`，避免 `/account/display-name`、`/account/role-name` 更新后，runtime 或下次 bootstrap 又被旧 token 投影覆回去。这里补的是 fallback 身份一致性，不是 next auth/token/bootstrap 真源替换完成。
- `WorldGateway` 这轮也继续压薄了一层 compat 直接依赖：此前 `mail / market / suggestion / npc shop` 这组 legacy handler 的结果发包，已改走 `WorldClientEventService` 的中性 emitter；这轮又把 `legacy navigate quest / legacy action / inspect tile runtime` 的网关入口并到中性 handler 与协议感知 helper，`WorldGateway` 现已不再直接调用 `LegacyGatewayCompatService`。随后 legacy bootstrap 最后一条 pending-logbook 兼容发包也已并到 `WorldClientEventService`，`LegacyGatewayCompatService` 与 `LegacySocketBridgeService` 已从 `server-next` 模块中移除。这里补的是网关边界和 compat 壳体收口，不是 auth/bootstrap 真源替换完成，也不代表 legacy bootstrap / tile runtime 兼容已经可以整体删除。
- `world-sync.service` 已按连接协议分流：
  - `protocol=next` 不再向客户端发送高频 legacy 同步事件
  - `protocol=legacy` 仍保留旧事件
- `client-next` 这边已经完成一轮真正的 next 收口：
  - bootstrap 改成 `handleBootstrap / applyBootstrap`
  - `WorldDelta / SelfDelta / PanelDelta` 主链直接消费 next
  - `sendAction` 不再 fallback 到 `C2S.Action`
  - `socket.ts` 已不再监听任何 legacy 事件名
- `shared-next` / `shared` 的 `NEXT_S2C_Bootstrap` 已从 `S2C_Init` 类型别名拆成独立 next 类型。
- `shared-next` / `shared` 中这批 next 低频 payload 也已改成独立 next 接口：
  - `NEXT_S2C_LootWindowUpdate`
  - `NEXT_S2C_QuestNavigateResult`
  - `NEXT_S2C_RedeemCodesResult`
  - `NEXT_S2C_GmState`
  - `NEXT_S2C_MapStatic`
  - `NEXT_S2C_Realm`
- `WorldSessionService` 的 `Kick` 已不再冗余双发 legacy `S2C.Kick`。
- `WorldSyncService` 已开始按协议拆开执行：`protocol=next` 连接不再每 tick 进入整套 legacy delta 计算，而是只补 next 仍需要的 `MapStatic / Realm / LootWindow` 同步。
- `WorldSyncService` 的 next 增量 `MapStatic` 路径已不再为可见标记计算整张 legacy 可视瓦片矩阵，改成只构建可见坐标 key 集合，先收掉一段 hot path 的 legacy 投影开销。
- `WorldSyncService` 的 next `Bootstrap / MapStatic` 首包路径已不再直接调用：
  - `buildLegacyVisibleTiles`
  - `buildLegacyRenderEntities`
  - `buildLegacyMinimapLibrary`
  这批 legacy 包装 helper 已从 `world-sync` 内部删除，next/legacy 同步路径统一直接走中性 helper。
- `WorldSyncService` 的时间状态主计算也已切到中性 helper：
  - `buildGameTimeState`
  - `normalizeMapTimeConfig`
  - `resolveDarknessStacks`
  `world-sync` 内部旧的 `buildLegacyTimeState / normalizeLegacyMapTimeConfig / resolveLegacyDarknessStacks` 包装也已删除。
- `loot window` 这一条链已新增 next 语义包装入口：`openLootWindow / buildLootWindowSyncState / getLootWindowTarget` 已成为同步层与 runtime 的主调用名，本轮又继续删掉了一批零引用 legacy 包装。
- `WorldSyncService` 里 `MinimapMarkers / VisibleMinimapMarkers / GameTimeState / ThreatArrows / TickPayload / AttrUpdate / InventoryUpdate / EquipmentUpdate / TechniqueUpdate / ActionsUpdate` 已补齐中性 helper 主名，next 主路径不再继续直接挂 `buildLegacy*` 名称；其中 `Inventory / Equipment / Technique / Actions` 这四组也已经反转为“中性名是主实现”。
- `WorldSyncService` 的 next `Bootstrap.self` 投影也已切到中性 helper：
  - `buildAttrBonuses`
  - `buildEquipmentRecord`
  - `toTechniqueState`
  - `toActionDefinition`
  - `toItemStackState`
  - `cloneTechniqueSkill`
  旧的 `buildLegacyAttrBonuses / buildLegacyEquipmentRecord / toLegacyTechniqueState / toLegacyActionDef / toLegacyItemStack / cloneLegacyTechniqueSkill` 这些本地包装也已从 `world-sync` 删除。
- `WorldSyncService` 的动作 ID 兼容映射也已抽到中性 helper：`normalizeActionEntry` 成为 next `Bootstrap.self.actions` 与 legacy action diff 的共同主入口，旧的 `toLegacyActionEntry` 本地包装也已删除。
- `WorldSyncService` 的 legacy delta 内核又收了一层中性主名：
  - `captureSyncSnapshot`
  - `buildTickPayload`
  - `diffRenderEntities`
  旧的 `captureLegacySnapshot / buildLegacyTickPayload / diffLegacyRenderEntities` 本地包装也已从 `world-sync` 删除。
- `WorldSyncService` 的 legacy 同步缓存和属性投影主名也继续收口：
  - `syncStateByPlayerId`
  - `buildAttrUpdate`
  - `captureAttrState`
  旧的 `legacyStateByPlayerId / buildLegacyAttrUpdate / captureLegacyAttrState` 命名已经退出主路径，其中本地包装也已删除。
- `WorldSyncService` 的 legacy 初始/增量同步方法内部也不再直接调用：
  - `buildLegacyVisibleTiles`
  - `buildLegacyRenderEntities`
  - `buildLegacyMinimapLibrary`
  这些包装 helper 已经从本文件移除，主路径统一走中性 helper。
- `WorldSyncService / PlayerRuntimeService / WorldRuntimeService / LegacyGatewayCompatService` 的 `loot window` 旧入口也继续收口：`emitLegacyLootWindow / openLegacyLootWindow / clearLegacyLootWindow / buildLegacyLootWindow` 这批零引用包装已删除，调用面统一走中性入口。
- `WorldSyncService / WorldTickService` 对地图时间与 tick 速度的读取也补上了中性入口，主逻辑改走：
  - `mapRuntimeConfigService`
  - `getMapTimeConfig`
  - `getMapTickSpeed`
  不再在主路径里直接写 `legacyGmHttpCompatService.getMapTimeConfig/getMapTickSpeed`。
- `WorldSyncService` 内部 next/legacy 双发判定也已从分散的 `shouldEmitNextPayload / shouldEmitLegacyPayload` 收口为单一协议分流入口，减少重复协议判断。
- `PlayerRuntimeService` 已补 next 语义主入口：
  - `getPendingLogbookMessages`
  - `queuePendingLogbookMessage`
  - `acknowledgePendingLogbookMessages`
  - `deferVitalRecoveryUntilTick`
  外部调用已开始从旧名迁到新名。
- `PlayerRuntimeService` 的玩家运行时真源已继续收口：
  - `legacyLootWindow` -> `lootWindowTarget`
  - `legacyCompat.pendingLogbookMessages` -> `pendingLogbookMessages`
  - `legacyCompat.suppressVitalRecoveryUntilTick` -> `vitalRecoveryDeferredUntilTick`
  - `legacyBonuses` -> `runtimeBonuses`
  - 持久化与 legacy 导入仍兼容回读旧字段
- `PlayerRuntimeService / PlayerPersistenceService` 对旧快照字段的回读也已继续收口到 compat helper，`legacyCompat.pendingLogbookMessages / legacyBonuses` 不再直接散落在主装载流程；`runtime:vitals_baseline` 的展示标签也已改成中性语义。

### 当前粗略完成度

- 以下百分比按不同目标口径粗略估算，只用于判断优先级，不能横向比较、相加或直接当成验收线。
- `client-next` 主链独立度：约 `80% - 85%`
- `server-next` 独立化：约 `50% - 60%`
- 想整体移除仓库中的 `legacy`：约 `25% - 35%`
- 如果目标是“正式替换旧前台”，当前大约还差 `20% - 30%`

## 最初目标达成度

### 本轮已实跑证据

截至 `2026-04-06`，这轮直接确认过的是：

- `node node_modules/.pnpm/node_modules/typescript/bin/tsc -p packages/server-next/tsconfig.json`
- `node packages/server-next/dist/tools/audit/next-legacy-boundary-audit.js`
- `node packages/server-next/dist/tools/smoke-suite.js --case session --case runtime --case next-auth-bootstrap --case legacy-player-compat --case monster-runtime --require-legacy-auth`

当前可直接固定的结论：

- `server-next` 当前源码可独立编过 `tsc`
- legacy 边界自动审计当前为绿，并已刷新 `docs/next-legacy-boundary-audit.md`；当前报告为 `0/22` 个检查项、`0` 处代码证据
- `session / runtime / next-auth-bootstrap / legacy-player-compat / monster-runtime` 这一组最小 smoke 当前为绿
- 标准 `pnpm --filter @mud/server-next verify:replace-ready` 这轮已重新确认可跑并通过；共享层当前更应被视为需要继续稳定的风险源，而不是现时阻塞点
- 这证明的是“server-next 本体与 direct inventory 当前稳定可复跑”，不是 auth/bootstrap 真源替换完成

### 结论总表

- 最小包体：`部分满足`
- 最高性能：`未满足`
- 极高扩展度：`部分满足`
- 系统稳定性：`部分满足`
- 完整替换游戏整体：`未满足`，保守仍差 `40% - 45%`

### 为什么现在还不能叫完整替换

1. auth/token/bootstrap 真源仍直接依赖 legacy JWT、`users/players` 与 legacy snapshot fallback。
   但其中 `token/identity` 已开始收口，`snapshot` provenance 也已开始落到 next 持久化层，当前最主要剩余的是 `snapshot/player-source` 与 `bootstrap/session`。
2. `WorldSync compat` 这轮虽已从 `WorldSyncService` 主服务收薄，并把 direct boundary 清到 `0/5`、`0` 处，但 legacy 同步支路本身仍在，不能夸大成高频主链已彻底 next-only。
3. `P0 legacy HTTP/GM/admin` 的 direct boundary inventory 虽已清零，但运营真源与完整 GM/admin 自动证明仍未闭环。
4. `server-next` 的 direct 性能热点 inventory 虽已清零，但热路径总体仍重、首包仍偏肥、传输层仍是 Socket.IO JSON 主线，离“最高性能”还有明确距离。

### direct inventory 清零后，当前最真实的后端缺口

`docs/next-legacy-boundary-audit.md` 现在已经是 `0/22`、`0`。这说明继续刷 direct boundary 数字已经不是当前最值当的工作，后端剩余主要变成四件事：

1. replace-ready 三层门禁已经基本收敛，但默认/`acceptance`/`full` 的边界仍需要持续写清。
   `with-db`、`shadow`、`acceptance`、`full` 都已有明确定位与通过证据；其中 `acceptance` 已提升到“本地主证明链 + shadow 实物验收 + shadow GM 关键写路径验证”，`full` 也已固定为 `with-db + gm-database + shadow + gm-compat`。当前真正缺的是不要把任何一层自动化门禁误读成“完整运营面已闭环”。
2. `snapshot/player-source` 真源仍未真正收紧。
   带库顺序型 smoke 已经补到“第一次 `legacy_seeded`、第二次 `next(native)`”并实跑通过，这说明 provenance 与顺序护栏已具备；但 legacy fallback 仍在默认主链里，不能据此说 snapshot 真源已经完成 next-native 收口。
   当前已先把“seed 写失败”“next 持久化坏记录”“compat schema 缺失被吞成 miss”“compat snapshot 坏 placement 被静默改写成默认地图”这四类不该静默成功的异常分支收掉；这轮又补上了已鉴权带库链路下的 `snapshot.source=miss` 硬失败门禁，保留 next identity 但清空 next/legacy snapshot 源时，主链现在必须直接拒绝入场，不再允许静默 fresh-player 成功。
   剩下要继续单线收紧的，才是仍允许正常命中 legacy snapshot 的 fallback 面。
3. `bootstrap/session` 真源仍未真正脱 legacy。
   顺序型 smoke 已经把开工前置补齐，下一步应在单线前提下进入 `bootstrap/session` 收口，而不是继续把它排到共享层或性能尾项之后。
4. GM/admin/restore 的完整统一自动化证明仍不足。
   现在更多是“最小 compat + 管理只读面 proof + 关键带库回归”，还不是完整运营面日常门禁。
5. `shared-next` 稳定性仍要继续盯。
   上一轮这里曾因为 `packages/shared-next/src/constants/gameplay/realm.ts` 与 `packages/shared-next/src/numeric.ts` 的 `NumericStats.extraRange / extraArea` 类型不一致，出现过 root / workspace 级验证可能先被共享层拦住的风险；但本轮实际强跑 `pnpm --filter @mud/server-next verify:replace-ready` 已恢复可跑并通过，所以它现在更像共享层稳定性风险，而不是当前事实阻塞。

补充：当前已安全补上准备层可观测。显式设置 `SERVER_NEXT_AUTH_TRACE_ENABLED=1` 或 `NEXT_AUTH_TRACE_ENABLED=1` 后，`token / identity / snapshot / bootstrap` 四段记录会进入受限 ring buffer，并通过受 runtime debug guard 保护的 `/runtime/auth-trace` 供 `next-auth-bootstrap` smoke 断言；其中 identity 会单独暴露 `persistenceEnabled / persistAttempted / persistSucceeded / persistFailureStage`，bootstrap 记录与 `summary.bootstrap` 也会固定暴露 `entryPath / identitySource / linkedSourceCounts` 这组摘要。默认不开启，不改变生产语义。这解决的是证明链与排障，不是真源替换本体。
这轮已经补出并实跑通过带库场景下“第一次 `legacy_seeded`、第二次 `next`”的顺序型 smoke；下一步可以开始单线推进 `bootstrap/session` 真源收口，但仍不适合与其他真源改动并行混做。

### 需要避免的误判

`server-next` 现在已经能稳定支撑 next 前台继续迭代，但它仍不是一条已经摆脱 legacy 的独立服务栈。

当前真正没拆掉的，已经主要收缩到下面四层：

- next 登录 / 会话 / bootstrap 虽已切到中性入口，但底层认证 / 旧号导入仍走 legacy auth
- world sync 主服务虽然已收薄，但 legacy 同步支路与 compat 投影视图仍存在
- 热路径性能与扩展热点仍直接卡着“最高性能 / 极高扩展度”的目标
- replace-ready 的 `local / acceptance / full` 三层门禁虽已定型，但 shadow / with-db / GM/admin 的完整证明仍未闭成完整运营面闭环

## 现在最大的阻碍在哪里

## P0. next 登录与 bootstrap 仍依赖 legacy session/auth

按 `docs/next-legacy-boundary-audit.md` 的 direct boundary inventory 看，`P0 auth/bootstrap 真源` 这一组命中已经清到 `0/5`、`0`。但这只代表主服务里的直连边界已经收口，不代表底层 legacy JWT、旧库回读和 compat 语义已经替换完成。

当前 `WorldGateway` 的连接处理、Hello、GM token 校验、玩家鉴权、bootstrap、快照装载，都还压在：

- `WorldSessionBootstrapService`
- `WorldPlayerAuthService`
- `WorldPlayerSnapshotService`
- `WorldPlayerTokenService`
- `WorldLegacyPlayerSourceService`
- `WorldClientEventService`

这意味着 next 会话边界虽然已经开始脱离直接 `LegacyAuthService` 依赖，甚至 token 校验与旧库读取也已经拆成两段，但底层认证 / 旧号导入仍没有真正独立；当前 `WorldGateway` 的 common error 发包与剩余 legacy 入口虽然已统一切到中性事件服务或协议感知 helper，但遗留的 legacy 投影与兼容语义仍未完全收完。

另外，玩家 token 的签发/校验虽然已经不再直挂 `verifyLegacyJwt`，但身份解析与旧快照导入当前仍依赖 compat `users/players` 表；这意味着 `token/identity` 第一刀已经开始，`snapshot/player-source` 与 `bootstrap/session` 主链却还没有真正 next-native。next handler 中 `quest/chat/ack/bootstrap pending logbook` 这批路径以及 `WorldGateway` 的 common error 发包已经开始改走中性事件服务，`mail / market / suggestion / npc shop` 这组 legacy handler 的结果发包，以及 `legacy navigate quest / legacy action / inspect tile runtime` 这组网关入口，这轮也已继续收进中性 handler 与协议感知 helper；`LegacyGatewayCompatService` 与 `LegacySocketBridgeService` 现已移除，但 `WorldGateway` / `LegacyGmCompatService` 里残留的 legacy tile runtime 投影与少量 bootstrap/协议兼容语义仍未完全外置。这些都属于正式替换旧前台前必须处理的 `P0`。

## P0. 替换验收证明链还没闭环

当前根级 `pnpm verify:replace-ready` 已经把这条自动验证链串起来，`pnpm verify:server-next` 当前只是同一条验证链的兼容别名：

- `pnpm build:client-next`
- `verify:replace-ready` / `verify:replace-ready:with-db`
- `pnpm audit:server-next-protocol`
- 仅在提供 `DATABASE_URL` / `SERVER_NEXT_DATABASE_URL` 时，转入 with-db 并覆盖带库 restore 自动回归

但它仍不自动覆盖：

- `pnpm verify:replace-ready:shadow`

同时，`next-protocol-audit` 现在已经补上“next 连接不得额外收到 legacy 事件”的负向断言，并修正了 `market storage` 用例里对背包容量写死为 `100` 的过期前置；这轮又把 `client-next build + verify:replace-ready + audit:server-next-protocol` 串进了根级 `pnpm verify:replace-ready`，并补出了 `verify:replace-ready:acceptance` 组合入口、独立 `with-db` workflow，以及已扩到管理只读面和关键维护写路径的 `gm-compat` smoke。这里当前缺的，已经不是组合入口本身，而是把这些链路进一步固化成稳定门禁；本地直接阻塞点 `gm-compat-smoke` 这轮已经修稳，而 publish/deploy 前置带库门禁虽然已经接上，`shadow` 与更完整的 GM/admin 自动证明仍未闭环。

这轮还额外补上了 `pnpm verify:replace-ready:doctor` 与对应 shell/cmd wrapper。它的价值只是把“当前为什么跑不了 with-db / shadow”提前显式化，不再需要先试错一轮才知道缺环境；但它本身不是替换证明，也不能替代真实带库闭环或已部署实例实物验收。

这里的命名口径也需要固定：

- 唯一推荐入口是根级 `pnpm verify:replace-ready`
- 如需把本地主证明链、shadow 实物验收与 shadow GM 关键写路径验证串起来，当前可用 `pnpm verify:replace-ready:acceptance`
- `pnpm verify:server-next*` 当前只保留为兼容别名
- `pnpm --filter @mud/server-next verify:replace-ready*` 当前只是包内 smoke / 排障子集
- 根级 `pnpm verify:replace-ready` 的定位仍只是“本地主证明链入口”，不是“完整替换就绪”；当前这轮它已经回到全绿
- 这轮新增的 `next-auth-bootstrap` smoke，只能说明“next socket 走 legacy 登录 token 的 compat 入场链已被自动验证”；它同时也反向证明当前带 token 的 next 会话仍有连接阶段直接 bootstrap 这层 compat 语义，不是 auth/bootstrap 真源替换完成的证明

这里截至 `2026-04-06` 还需要再明确三点：

1. `Verify Server Next With DB` workflow 现在已经存在，主要价值转成隔离排障与单独补证，而不再是 publish/deploy 获得带库门禁的唯一办法。
2. `Publish Server Next Image` 现在也会先过带库 replace-ready；`Deploy Server Next` 则会在此前置基础上追加部署后 `shadow` 与 `gm-compat` 验收，但它们仍不能替代完整 GM/admin 人工回归。
3. `acceptance` 组合入口的价值是把“本地 + shadow + shadow GM 关键写路径验证”串起来；缺少 `SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL` 或 `SERVER_NEXT_GM_PASSWORD/GM_PASSWORD` 时，阻塞点依旧是环境前置，而不是脚本本身。
4. 这轮补的环境变量 alias 一致性，只能说明后端配置与验证口径更一致；它不代表 auth/bootstrap 真源已经完成替换。

这意味着即便代码主链已经基本可用，正式替换前的自动化证明仍然不足。

## P1. world sync compat 主体已外提，但 legacy sync facade 仍存在

这轮 `WorldSyncService` 已不再继续保留 compat 初始/增量同步主体，也不再直接承载低频协议双发 helper：

- legacy 初始/增量同步主体已外提到 `WorldLegacySyncService`
- `Quests / MapStatic / Realm / LootWindow / Notice` 的协议分流已外提到 `WorldSyncProtocolService`
- `WorldSyncService` 主文件里原先 audit 盯住的 `emitCompatInitialSync / emitCompatDeltaSync / getLegacyNavigationPath / getLegacyCombatEffects / emitProtocol*` 这组命中已清零

但这不等于 legacy sync 已经消失。当前剩下的真实状态是：

- legacy socket 仍由 `WorldLegacySyncService` 这层 facade 承接
- `protocol === 'legacy'` 的协议分流语义仍然存在
- `LegacyGmHttpCompatService` 仍被复用为地图时间/tick 配置读取来源

所以 `P1 world sync compat` 已不再是当前最大的审计块，但 legacy sync 壳层还在，后续仍有继续外提或降级为更薄 compat 的空间。

## P1. runtime 真源仍保留 legacy 玩家状态

当前 runtime / persistence 的玩家真源字段名已基本收口到 next / 中性语义：

- `lootWindowTarget`
- `pendingLogbookMessages`
- `vitalRecoveryDeferredUntilTick`
- `runtimeBonuses`

旧快照和旧库导入仍兼容回读 `legacyCompat.*` / `legacyBonuses`，但 runtime 真源字段名本身已不再继续使用这些 legacy 命名。

这类字段如果不拆，legacy 就仍然是运行时数据模型的一部分，而不是单纯外层兼容层。

## P2. 后台 HTTP / GM/admin 的 direct boundary 已清零，但运营真源仍未独立

当前更准确的说法是：

- `P0 legacy HTTP/GM/admin` 这组 direct boundary inventory 已清到 `0/3`、`0`
- 网关和主服务里的直接 legacy HTTP/GM/admin 依赖已经基本收口
- 运营真源、控制面能力和完整自动化证明仍主要复用 legacy 能力

如果后续决定“玩家前台先独立，后台兼容面保留”，这一层可以暂时不动；但不能再继续把它反向渗回 runtime 真源。

## 现在已经不是主要阻碍的内容

下面这些在当前阶段已经明显弱化，不再是主要卡点：

- 高频 legacy 同步双发给 next 客户端
- client-next 继续监听 legacy 事件名
- 动作发送仍 fallback 到 `C2S.Action`
- bootstrap 仍通过 `handleInit(S2C_Init)` 进入客户端主入口

也就是说，前台链路已经基本收口，当前该处理的是 server 内核债。

## 建议的下一阶段顺序

### 第一阶段：先处理 direct inventory 清零后的真实缺口

建议顺序：

1. 先继续收口 `replace-ready / with-db / shadow / acceptance` 的门禁、脚本和文档口径，并把最小带库真源证明链固定下来。
2. 然后单线推进 `snapshot/player-source` 真源收紧，继续缩小 legacy fallback 的默认触发面。
3. 再进入 `bootstrap/session` 真源收口，避免与其他 auth/token 改动并行混做。
4. 最后再继续看 `packages/shared-next` 的协议/类型层稳定化，以及最小包体 / 性能 / 扩展度尾项。

### 第二阶段：再处理 sync / runtime / GM / HTTP 的进一步独立化

之后再明确：

- 是把 legacy HTTP / GM 固化为外层兼容壳
- 还是继续推进 next auth / next GM / next HTTP
- 同时继续压薄 `WorldSyncService` 的 compat 高频支路与 runtime/persistence 迁移尾巴

在这一步之前，不建议继续扩 compat。

## 当前建议口径

当前最准确的说法是：

> `server-next` 已经完成前台高频同步分流和一轮表层 socket 收口，`client-next` 也基本完成 next 主链收口；真正阻塞正式替换旧前台的，已经主要收缩到登录/会话/bootstrap 主链、部分 next handler 仍借 compat 壳，以及替换验收证明链尚未闭环。

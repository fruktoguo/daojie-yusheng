# server-next 验证

当前正式替换验收优先使用根入口；包内命令仍保留给局部 smoke / 子集回归：

- `pnpm verify:replace-ready:doctor`
- `pnpm verify:replace-ready:proof:with-db`
- `pnpm verify:replace-ready`
- `pnpm verify:replace-ready:acceptance`
- `pnpm verify:replace-ready:full`
- `pnpm verify:server-next`
- `pnpm verify:server-next:acceptance`
- `pnpm verify:server-next:full`
- `pnpm verify:server-next:doctor`
- `pnpm verify:server-next:proof:with-db`
- `pnpm --filter @mud/server-next verify:replace-ready`
- `pnpm --filter @mud/server-next verify:proof:with-db`
- `pnpm audit:server-next-boundaries`
- `pnpm --filter @mud/server-next audit:legacy-boundaries`
- `pnpm --filter @mud/server-next smoke:session`
- `pnpm --filter @mud/server-next smoke:readiness-gate`
- `pnpm --filter @mud/server-next smoke:legacy-auth`
- `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`
- `pnpm --filter @mud/server-next smoke:legacy-player-compat`
- `pnpm --filter @mud/server-next smoke:gm-compat`
- `pnpm --filter @mud/server-next smoke:redeem-code`
- `pnpm --filter @mud/server-next smoke:combat`
- `pnpm --filter @mud/server-next smoke:monster-ai`
- `pnpm --filter @mud/server-next smoke:monster-skill`
- `pnpm --filter @mud/server-next smoke:player-respawn`

## replace-ready 四层门禁

- `local`：根级 `pnpm verify:replace-ready`（及 `pnpm verify:server-next`、`scripts/replace-ready.*` / `scripts/server-next-verify.*` wrappers）是本地主证明链，会根据是否存在 `DATABASE_URL/SERVER_NEXT_DATABASE_URL` 自动决定是否跑 `with-db`/`proof:with-db`。它把本地自检、next 协议、guest/auth/GM compat smoke 串成一条链，但不等于“完整替换就绪”。
- `acceptance`：`pnpm verify:replace-ready:acceptance`（别名 `pnpm verify:server-next:acceptance`）会在 `local` 的基础上串行跑已部署 shadow 实例的 `verify:replace-ready:shadow` 与 `pnpm --filter @mud/server-next smoke:gm-compat`，确保 shadow 会话链与 GM 关键写路径在实物环境也通过。
- `full`：`pnpm verify:replace-ready:full`（别名 `pnpm verify:server-next:full`）要求数据库环境与 shadow 环境都就绪，然后串行运行 `with-db -> gm-database -> gm-database-backup-persistence -> shadow -> gm-compat`，即 `local` + `acceptance` + `gm/database/backup persistence` proof，但仍不等于完整 GM/admin 人工回归。
- `shadow-destructive`：`pnpm verify:replace-ready:shadow:destructive`（需加 `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1`）只在专用维护窗口执行，用于 shadow 实例上单独跑 `backup -> download -> restore` 破坏性闭环 proof。
其中：

- `pnpm --filter @mud/server-next smoke:session` 当前会显式锁 guest canonical 语义：首登可不传 `playerId`，canonical 身份以 `InitSession.pid` 为准；断线后只带正确 detached `sessionId` 时会恢复既有 guest；只带 forged `sessionId` 且不带 `playerId` 时必须新建 guest 身份，不得复用旧人；即使显式伪造旧 `playerId` 再连，也必须拿到新的 `sid/pid`；detached guest 超过 `SERVER_NEXT_SESSION_DETACH_EXPIRE_MS` 后再拿旧 `sid` 回连时，也必须拿到新的 `sid/pid`。服务端在启动时将 detached resume 的时窗默认设为 `15000ms`，但可以通过 `SERVER_NEXT_SESSION_DETACH_EXPIRE_MS` 环境变量向下或向上调整；同一 smoke 里还专门等过期的 detached `sid` 再去尝试连接，并断言过期 `sid` 不会恢复旧人而是轮换出全新的 `sid/pid`，以此作为 expired resume 的 proof。与此对应，同一条 smoke 里的 `serviceProof` 会继续锁 `WorldSessionService` 真源语义：detached 错配 sid 不得接纳 forged sid，且必须轮换出新的 server sid
- `pnpm --filter @mud/server-next smoke:session` 现在还会显式覆盖 `sessionReaperProof`：既验证 detached 过期后成功清场，也验证 flush 失败时会 requeue 并在后续重试成功，不把 reaper 误当成“只清一次 best effort”

如果工作区里 `packages/shared` 有未完成改动，导致 `pnpm --filter @mud/server-next compile` 被共享包编译报错阻塞，可先用下面这条只验证 `server-next` 自身改动：

- `node node_modules/.pnpm/node_modules/typescript/bin/tsc -p packages/server-next/tsconfig.json`

带库 / shadow 入口：

- `pnpm verify:replace-ready:with-db`
- `pnpm verify:replace-ready:proof:with-db`
- `pnpm verify:replace-ready:shadow`
- `pnpm verify:replace-ready:acceptance`
- `pnpm verify:replace-ready:full`
- `pnpm verify:server-next:with-db`
- `pnpm verify:server-next:shadow`
- `pnpm verify:server-next:acceptance`
- `pnpm verify:server-next:full`
- `pnpm verify:server-next:proof:with-db`
- `pnpm --filter @mud/server-next verify:with-db`
- `pnpm --filter @mud/server-next verify:proof:with-db`
- `pnpm --filter @mud/server-next verify:replace-ready:with-db`
- `pnpm --filter @mud/server-next smoke:gm-database`
- `pnpm --filter @mud/server-next smoke:shadow`
- `scripts\\replace-ready-with-db.cmd`
- `scripts\\replace-ready-shadow.cmd`
- `scripts\\server-next-verify-with-db.cmd`
- `scripts\\server-next-verify-shadow.cmd`
- `./scripts/replace-ready-with-db.sh`
- `./scripts/replace-ready-shadow.sh`
- `./scripts/server-next-verify-with-db.sh`
- `./scripts/server-next-verify-shadow.sh`

本地一键入口：

- `scripts\\replace-ready-doctor.cmd`
- `scripts\\replace-ready.cmd`
- `scripts\\replace-ready-acceptance.cmd`
- `scripts\\replace-ready-full.cmd`
- `scripts\\replace-ready-proof-with-db.cmd`
- `scripts\\replace-ready-with-db.cmd`
- `scripts\\replace-ready-shadow.cmd`
- `./scripts/replace-ready-doctor.sh`
- `./scripts/replace-ready.sh`
- `./scripts/replace-ready-acceptance.sh`
- `./scripts/replace-ready-full.sh`
- `./scripts/replace-ready-proof-with-db.sh`
- `./scripts/replace-ready-with-db.sh`
- `./scripts/replace-ready-shadow.sh`
- `pnpm verify:replace-ready:doctor`
- `pnpm verify:replace-ready`
- `pnpm verify:replace-ready:acceptance`
- `pnpm verify:replace-ready:full`
- `pnpm verify:replace-ready:proof:with-db`
- `pnpm verify:replace-ready:with-db`
- `pnpm verify:replace-ready:shadow`
- `scripts\\server-next-verify.cmd`
- `scripts\\server-next-verify-doctor.cmd`
- `scripts\\server-next-verify-acceptance.cmd`
- `scripts\\server-next-verify-full.cmd`
- `scripts\\server-next-verify-proof-with-db.cmd`
- `scripts\\server-next-verify-with-db.cmd`
- `scripts\\server-next-verify-shadow.cmd`
- `./scripts/server-next-verify.sh`
- `./scripts/server-next-verify-doctor.sh`
- `./scripts/server-next-verify-acceptance.sh`
- `./scripts/server-next-verify-full.sh`
- `./scripts/server-next-verify-proof-with-db.sh`
- `./scripts/server-next-verify-with-db.sh`
- `./scripts/server-next-verify-shadow.sh`
- `pnpm verify:server-next`
- `pnpm verify:server-next:acceptance`
- `pnpm verify:server-next:full`
- `pnpm verify:server-next:doctor`
- `pnpm verify:server-next:proof:with-db`
- `pnpm verify:server-next:with-db`
- `pnpm verify:server-next:shadow`

说明：

- 建议先跑 `pnpm verify:replace-ready:doctor` 或 `scripts/replace-ready-doctor.*` 做环境自检；该入口只读取环境变量，不会连接数据库，也不会请求 shadow 实例
- 根级 `pnpm verify:replace-ready` / `pnpm verify:server-next` 以及对应的默认 wrapper（`scripts/replace-ready.*` / `scripts/server-next-verify.*`）会自动探测 `SERVER_NEXT_DATABASE_URL` 或 `DATABASE_URL`；`proof:with-db`、`shadow`、`acceptance`、`full` 等专用 wrapper 仍按各自链路显式要求环境
- `pnpm --filter @mud/server-next smoke:readiness-gate` 当前会独立起一个“无数据库、无旁路”的 `server-next` 实例，显式验证 `/health=503` 且新 next socket 会收到 `SERVER_NOT_READY`；随后它会再起一个开启 `SERVER_NEXT_ALLOW_UNREADY_TRAFFIC=1` 的实例，显式验证 `/health` 仍未就绪，但 next smoke 只会在这类旁路下继续跑
- root `pnpm` 入口、`scripts/replace-ready*` wrapper、`scripts/server-next-verify*` alias 以及包内 with-db/shadow/acceptance 调用链，当前共享同一套 database/shadow/GM alias 来源解析
- `audit:server-next-protocol` 当前也已接入 `SERVER_NEXT_GM_PASSWORD/GM_PASSWORD` alias；独立 runner 会把子进程里的 `SERVER_NEXT_URL` 与 `SERVER_NEXT_SHADOW_URL` 都固定到本次自起审计实例，避免继承外部 shadow URL 后串到错误目标
- `audit:server-next-boundaries` / `pnpm --filter @mud/server-next audit:legacy-boundaries` 当前会扫描 `server-next` 源码里的 auth/bootstrap、WorldSync、runtime/persistence 与性能热点边界，并自动刷新 `docs/next-legacy-boundary-audit.md`
- 这份 legacy 边界审计是 inventory，不是 replace-ready 验收；它用于固定“还剩哪些 direct legacy 边界”，不能替代 `verify:replace-ready`、`with-db`、`shadow` 或协议审计
- `pnpm verify:replace-ready:doctor` / `pnpm verify:server-next:doctor` / `scripts/replace-ready-doctor.*` / `scripts/server-next-verify-doctor.*` 当前会显式提示 `local / with-db / proof with-db / shadow / acceptance / full` 各链分别缺哪些环境变量
- `pnpm verify:replace-ready:acceptance` 会先跑根级 `verify:replace-ready`，再串行跑 `verify:replace-ready:shadow` 与 shadow 目标上的 `pnpm --filter @mud/server-next smoke:gm-compat`；如果已配置数据库环境，本地段会自动走 `with-db`
- `pnpm verify:replace-ready:full` 会强制要求数据库环境与 shadow 环境齐全，并显式串行跑 `with-db -> gm-database -> gm-database-backup-persistence -> shadow -> gm-compat`；它在完成定义上等价于“强制 with-db + gm-database + gm-database-backup-persistence + shadow + gm-compat”，也就是强制带库后先补跑数据库运营面回归与 backup-dir proof，再跑 shadow 实物验收与 shadow GM 关键写路径验证，但仍不等于完整 GM/admin 人工回归
- `pnpm verify:replace-ready:acceptance` 现在会先检查 shadow 所需环境变量；缺少 `SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL` 或 `SERVER_NEXT_GM_PASSWORD/GM_PASSWORD` 时，会直接失败并提示先跑 `doctor`，避免本地构建与 smoke 跑完后才在 shadow 段报错
- `pnpm verify:server-next:acceptance` 当前只是同一条 acceptance 组合链的兼容别名
- `pnpm verify:server-next:full` 当前只是同一条 full 组合链的兼容别名
- `scripts/replace-ready*` 与 `scripts/server-next-verify*` 当前指向同一条根级验证链
- `scripts/server-next-verify*.js` 当前会先打印 alias 委托关系，再进入对应的 `replace-ready` wrapper，排障时可以直接看出“旧口径命令实际跑的是哪条新链”
- `scripts/replace-ready-with-db.*` 与 `scripts/replace-ready-shadow.*` 当前也会像其他 wrapper 一样打印 `steps/start/done/failed`，排障时可直接看失败停在哪一步
- `pnpm verify:replace-ready` 与 `pnpm verify:server-next` 当前指向同一条根级验证链
- `pnpm verify:replace-ready:proof:with-db` / `pnpm verify:server-next:proof:with-db` 当前是最小带库 `auth/token/bootstrap` 真源证明链入口，只覆盖 `next-auth-bootstrap` 的顺序型 smoke 与 `persistence-smoke`
- 单会话或同进程多 guest 的 smoke 现在应优先按 canonical guest 模式编写：首登不依赖客户端自带 `playerId`，而是读取 `InitSession.pid` 作为后续 runtime API、cleanup 和断言的 canonical `playerId`
- `persistence-smoke` 与 `next-protocol-audit` 当前都已迁到 canonical 身份取得方式：authenticated/token 链路直接依赖连接阶段 bootstrap，guest 链路统一读取 `InitSession.pid`，不再依赖 `requestedPlayerId`
- 有数据库时自动串行跑 `build:client-next`、`verify:replace-ready:with-db`、`audit:server-next-protocol`
- 无数据库时自动串行跑 `build:client-next`、`verify:replace-ready`、`audit:server-next-protocol`
- 当前推荐的单一入口是根级 `pnpm verify:replace-ready`
- 但 `pnpm verify:replace-ready` 只表示“本地主证明链通过”，不等于“完整替换就绪”
- `pnpm --filter @mud/server-next verify:replace-ready` 只是 `server-next` 本包 smoke 子集，不等于完整替换验收链
- 该入口现在会覆盖 `client-next` 构建、next socket 协议审计、旧普通玩家 socket 最小 compat smoke、旧 GM socket/HTTP 最小兼容 smoke，以及带库场景下的 `gm/database/backup|download|restore` 自动化回归
- 该入口当前也会覆盖 `protocol: next + legacy HTTP 登录 token` 的 auth/bootstrap compat 边界，并显式断言 next socket 不混入任何 legacy `s:*` 事件；当前带 token 的 next 连接会在连接阶段直接完成 bootstrap，随后补发 `n:c:hello` 不会重复入场
- 当前独立带库环境下 `pnpm verify:replace-ready:with-db` 已可全绿通过；`pnpm verify:server-next:with-db` 当前只是兼容别名，二者都包含 `persistence` 与 `gm/database` 闭环
- 协议审计里的 `marketTradeHistory` 当前会短轮询直到买家成交历史可见，不再把“背包已到账但成交历史页尚未更新”的瞬时时序误判成失败
- `pnpm verify:replace-ready:shadow` / `pnpm verify:server-next:shadow` / `smoke:shadow` 都不会自启本地 `server-next`，而是直接打 `SERVER_NEXT_SHADOW_URL` 或 `SERVER_NEXT_URL` 指向的已部署实例；当前默认验证 `/health`、GM 登录、`/gm/state`、`/gm/database/state`、`/gm/maps`、`/gm/editor-catalog`、`/gm/maps/:mapId/runtime`，以及 `n:c:hello` 最小 next 会话建立且不混入 legacy 事件；其中 runtime 只读断言会在 bootstrap 成功后按玩家真实 `templateId/x/y` 取样，不再只看固定出生图
- `verify:replace-ready:shadow` 需要显式提供 `SERVER_NEXT_SHADOW_URL` 或 `SERVER_NEXT_URL`，并同时提供 `SERVER_NEXT_GM_PASSWORD` 或 `GM_PASSWORD`
- `pnpm verify:replace-ready:shadow` 与 `pnpm verify:server-next:shadow` 当前指向同一条部署后 shadow 验收链
- `pnpm verify:replace-ready:acceptance` / `pnpm verify:server-next:acceptance` 当前是“本地主证明链 + shadow 实物验收 + shadow GM 关键写路径验证”的组合入口，但仍不等于完整 GM/admin 人工回归
- `pnpm verify:replace-ready:full` / `pnpm verify:server-next:full` 当前是“强制 with-db + gm-database + gm-database-backup-persistence + shadow + gm-compat”的更严格自动化入口，也就是强制带库后补跑数据库运营面回归、backup-dir 持久化 proof，再跑 shadow 与 shadow GM 关键写路径验证，但仍不等于完整 GM/admin 人工回归
- `pnpm verify:replace-ready:shadow:destructive` 需要 `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1`，是维护窗口内破坏性 proof，专用于在 shadow 实例上单独验证 `backup -> download -> restore`。
- 截至 `2026-04-06`，`pnpm verify:replace-ready:acceptance` 已在本地独立 PostgreSQL/Redis 环境 + 本地 `11923` shadow 实例上整链实跑通过
- `shadow` 仍不在 `pnpm verify:replace-ready` / `pnpm verify:server-next` 的本地一键入口内，必须单独对已部署实例执行
- 如需只对 auth/token/bootstrap 做准备层排障，可显式设置 `SERVER_NEXT_AUTH_TRACE_ENABLED=1` 或 `NEXT_AUTH_TRACE_ENABLED=1`；此时 `next-auth-bootstrap` smoke 会额外断言 `token / identity / snapshot / bootstrap` trace，服务端也会在受 runtime debug guard 保护的 `GET /runtime/auth-trace` / `DELETE /runtime/auth-trace` 暴露最近一段记录与 `summary` 聚合摘要；其中 bootstrap 记录和 `summary.bootstrap` 现在还会额外暴露 `entryPath` 与 `identitySource` 维度。默认不开启，不改变正常语义；但直接跑带库顺序证明时这是硬前置，未开启会直接失败
- 根级 `pnpm verify:replace-ready:proof:with-db` / `pnpm verify:server-next:proof:with-db` wrapper 当前会自动注入 trace 开关；只有包内直跑 `pnpm --filter @mud/server-next verify:proof:with-db` 时，才需要手工补 `SERVER_NEXT_AUTH_TRACE_ENABLED=1` 或 `NEXT_AUTH_TRACE_ENABLED=1`
- `GET /runtime/auth-trace` 当前除原始 `records` ring buffer 外，也会附带 `summary` 聚合；至少会给出 `typeCounts`、`identity.sourceCounts / persistenceEnabledCount / nextLoadHitCount / compatTriedCount / persistAttemptedCount / persistSucceededCount / persistFailedCount`、`snapshot.sourceCounts / persistedSourceCounts`、`bootstrap.protocolCounts / requestedSessionCount`，以及按 `identitySource|snapshotSource` 聚合的 `bootstrap.linkedSourceCounts` 与按 `snapshotPersistedSource` 聚合的 `bootstrap.linkedPersistedSourceCounts`，便于继续收紧 `bootstrap/session` 真源前先观察 next/fallback 命中结构

旧 GM compat 当前已有最小自动 smoke：

- `pnpm --filter @mud/server-next smoke:gm-compat`
- 该 smoke 当前会覆盖 legacy GM socket 的 `c:gmGetState / c:gmSpawnBots / c:gmUpdatePlayer / c:gmResetPlayer / c:gmRemoveBots`
- 该 smoke 当前也会覆盖旧 GM HTTP 的 `POST /auth/gm/login`、`GET /gm/state`、`GET /gm/maps`、`GET /gm/editor-catalog`、`GET /gm/maps/:mapId/runtime`、`PUT /gm/players/:playerId`、`POST /gm/players/:playerId/password`、`POST /gm/players/:playerId/reset`、`POST /gm/bots/spawn`、`POST /gm/bots/remove`
- 该 smoke 当前还会覆盖 GM 邮件、建议单、地图 tick/time 调整与 `POST /gm/tick-config/reload`，并在输出里给出 `passwordChange` 与 `adminRead.currentMap / adminRead.editorCatalog / adminRead.runtimeInspection` 摘要

旧普通玩家 compat 当前也已有最小自动 smoke：

- `pnpm --filter @mud/server-next smoke:legacy-auth`
- 该 smoke 当前会覆盖 legacy 普通玩家 HTTP 的 `POST /auth/register`、`POST /auth/login`、`POST /auth/refresh`、`POST /account/password`、`POST /account/display-name`、`POST /account/role-name`
- 该 smoke 当前也会覆盖 legacy token 直连 socket 的最小 bootstrap，并显式验证 account 资料更新后 runtime 身份投影与重新握手 bootstrap 都会跟上最新 `displayName / roleName`
- 在无数据库环境下，它会先走 compat HTTP `/auth/register`/`/auth/login` 获取真实 access token，再用该 token 完成 socket bootstrap；带数据库时仍保留 seeded legacy token fixture 以证明旧得 token 兼容链路。
- `pnpm --filter @mud/server-next smoke:legacy-player-compat`
- 该 smoke 当前会覆盖 legacy 普通玩家 socket 的 `c:navigateQuest / c:action(type=loot:open) / c:sortInventory / c:destroyItem / c:ackSystemMessages / c:chat`
- 该 smoke 当前会显式断言 legacy-only 协议边界：握手声明 `protocol: legacy` 后，不得额外收到任何 `n:s:*` next 事件

next auth/bootstrap compat 当前也已有最小自动 smoke：

- `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`
- 该 smoke 当前会覆盖 `protocol: next` + `/auth/register -> /auth/login` 拿 legacy token 后，连接阶段直接完成 next-native `InitSession / Bootstrap / MapStatic / Realm / WorldDelta / SelfDelta / PanelDelta`
- 这条链当前使用的是 next token codec 统一签发/校验过的玩家 `access/refresh` token，token payload 内会携带 `playerId / playerName`
- 该 smoke 当前会显式断言 next-only 协议边界：next socket 不得收到任何 legacy `s:*` 事件
- 该 smoke 当前也会显式断言当前 compat 语义：连接阶段已 bootstrap 后，补发 `n:c:hello` 不会重复 `InitSession / Bootstrap / MapEnter`
- 该 smoke 当前也会显式断言 token claims 一致性：登录拿到的 `playerId / playerName` 必须和 `InitSession`、`Bootstrap.self.id` 以及 runtime `player.name` 对齐，避免 token、identity 与 bootstrap 实际入场结果发生漂移后仍误判通过
- 该 smoke 当前还包含一条纯合同 proof：当 compat identity 已成功 backfill、但 snapshot preseed 的 next-load 首次失败时，identity trace 必须主动降到 `legacy_runtime`，默认模式下 runtime snapshot fallback 仍应保持可用；只有显式开启 `SERVER_NEXT_AUTH_REQUIRE_NATIVE_SNAPSHOT=1` 时，这条降级后的 fallback 才必须被强制关闭
- 该 smoke 在隔离 runner 内会临时开启 `SERVER_NEXT_AUTH_TRACE_ENABLED=1` 与 `NEXT_AUTH_TRACE_ENABLED=1`，并断言 token 校验、snapshot 来源与 bootstrap ready 三类 trace 都完整落地；默认运行态不会因此改变语义
- `identity.source` 当前主枚举已扩到 `next / next_invalid / token / legacy_runtime / legacy_backfill / miss`；identity 是否启用持久化、是否尝试落库、是否真正落成功，改由附加 trace 字段单独表达，不再要求从 `source` 反推
- 无数据库环境下，它会明确输出 `snapshotSequence.supported=false`，只证明当前 compat 入场语义与协议边界
- 带数据库环境下，它现在会把“第一次 `legacy_seeded`、第二次 `next` 且 persistedSource=native`”作为硬门禁；若顺序证明不成立，会直接失败
- 带数据库环境下，它现在还会把顺序 proof 的 identity 来源锁成硬门禁：`compatIdentityBackfillSnapshotPreseed` 那一跳第一次必须是 `legacy_backfill`，第二次必须是 `next`，不再允许 with-db proof 在 preseed 成功链上静默掉回 `legacy_runtime / token`
- 带数据库环境下，如果 next 持久化里已经存在非法 identity 记录，主链当前也会直接失败，并在 auth trace 里留下 `identity.source=next_invalid`
- 带数据库环境下，它现在还会把 `authenticated snapshot miss` 锁成负向硬门禁：保留 next identity、同时删除 next/legacy snapshot 源后，同一 token 再连必须收到失败，且不得出现 `InitSession / Bootstrap / MapEnter`
- 带数据库环境下，`snapshot.source=miss` 只允许出现在上面这条失败型 proof 里；如果它出现在已鉴权成功入场链并继续 bootstrap，测试必须直接失败
- 带数据库环境下，如果 compat identity backfill 已成功、但 `legacy_seeded` 这一步写入 next 持久化失败，identity trace 当前必须先降到 `legacy_runtime`，随后整次连接仍必须直接失败，不再静默把 `legacy_backfill` 留在 runtime fallback 集合里
- 带数据库环境下，如果 next 持久化里已经存在非法 snapshot 记录，主链当前也会直接失败，并在 auth trace 里留下 `snapshot.source=next_invalid`
- 带数据库环境下，如果保留 next identity 与 next snapshot，但把 next snapshot 文档改成非法 payload，同一 token 再连当前必须直接失败；trace 必须显式落成 `identity.source=next`、`snapshot.source=next_invalid`、`bootstrapPresent=false`，不再允许把坏 next 真源静默吞成 compat fallback 或 miss
- 带数据库环境下，如果 next snapshot 主体有效、只是 `payload.__snapshotMeta.persistedSource` 被污染成非法值，同一 token 再连当前仍必须成功 bootstrap；trace 必须显式落成 `identity.source=next`、`snapshot.source=next`、`snapshotPersistedSource=native`
- 带数据库环境下，如果 compat snapshot 查询因为 `users/players` schema 缺失而不可判定，主链当前也会直接失败，并在 auth trace 里留下 `snapshot.source=legacy_source_error`
- 带数据库环境下，如果 compat snapshot 行本身存在但 `mapId` 为空，主链当前也会直接失败，并落到同一条 `snapshot.source=legacy_source_error` 护栏；不再静默把坏 placement 改写成 `yunlai_town`
- 带数据库环境下，如果保留 next identity、删除 next snapshot、保留 compat snapshot，再把 compat `mapId` 改成非法空值，同一 token 再连当前仍必须直接失败；但 trace 现在必须显式落成 `identity.source=next`、`snapshot.source=miss`、`bootstrapPresent=false`，且 compat snapshot 文档会被保留、next snapshot 文档仍不存在，证明 next identity 主链不会再回落 compat snapshot，也不会再去读取 compat 坏 placement
- 带数据库环境下，如果 compat snapshot 行里的 `unlockedMinimapIds` 不是数组，主链当前也会直接失败，并落到同一条 `snapshot.source=legacy_source_error` 护栏；不再静默把坏值压成“当前图已解锁”
- 带数据库环境下，如果保留 next identity、删除 next snapshot、保留 compat snapshot，再把 compat `unlockedMinimapIds` 改成非法值，同一 token 再连当前仍必须直接失败；但 trace 现在必须显式落成 `identity.source=next`、`snapshot.source=miss`、`bootstrapPresent=false`，且 compat snapshot 文档会被保留、next snapshot 文档仍不存在，证明 next identity 主链不会再回落 compat snapshot，也不会再去读取 compat 坏 `unlockedMinimapIds`
- 带数据库环境下，如果保留 next identity、同时删除 next/legacy snapshot 源，同一 token 再连当前必须直接失败；trace 必须显式落成 `identity.source=next`、`snapshot.source=miss`、`bootstrapPresent=false`
- 带数据库环境下，如果 next identity 文档缺失、compat identity 可读，但把 next identity backfill 写入定向打成失败，当前 proof 会要求该次连接仍可 bootstrap 成功，但 identity trace 必须退到 `legacy_runtime`，并显式留下 `persistAttempted=true / persistSucceeded=false / persistFailureStage=compat_backfill_save_failed`；同时 `snapshot.source` 仍必须保持 `next`，且 next identity 文档最终仍不存在，避免把“落库失败的 runtime fallback”误记成 `legacy_backfill` 成功链
- 带数据库环境下，如果 next identity 文档缺失、compat identity 可读、next identity backfill 写入被定向打失败，并同时删除 next/legacy snapshot 源，同一 token 再连当前也必须直接失败；trace 必须显式落成 `identity.source=legacy_runtime`、`snapshot.source=miss`、`bootstrapPresent=false`，证明“非 native next identity + snapshot miss”这条 fresh bootstrap 入口已被收掉
- 带数据库环境下，如果保留 next identity、删除 next snapshot、保留 compat snapshot，同一 token 再连当前也必须直接失败；trace 必须显式落成 `identity.source=next`、`snapshot.source=miss`、`bootstrapPresent=false`，且 compat snapshot 文档会被保留、next snapshot 文档仍不存在，证明 next identity 主链已不再回落 compat snapshot fallback
- 带数据库环境下，如果 next snapshot 主体仍有效、只是把 `payload.unlockedMapIds` 污染成非法非数组值，同一 token 再连当前仍必须成功 bootstrap；trace 必须显式落成 `identity.source=next`、`snapshot.source=next`、`snapshotPersistedSource=native`，且运行时读取到的 `unlockedMapIds` 必须被归一成空数组，避免把“可丢弃扩展字段脏值”误报成 `next_invalid`
- 带数据库环境下，当前最小 proof 链已显式覆盖：
  - `invalidIdentityRejected`
  - `missingSnapshotRejected`
  - `invalidSnapshotMetaPersistedSourceNormalized`
  - `invalidSnapshotUnlockedMapIdsNormalized`
  - `invalidSnapshotRejected`
  - `nextIdentityInvalidCompatMapIdIgnored`
  - `nextIdentityInvalidUnlockedMapIdsIgnored`
  - `compatBackfillSaveFailed`
  - `compatBackfillSaveFailedMissingSnapshotRejected`
  - `compatIdentityBackfillSnapshotPreseed`
  - `compatIdentityBackfillSnapshotSeedFailureRejected`
  - `nextIdentityCompatSnapshotIgnored`
- 带数据库顺序证明里的第一次 `legacy_seeded` 不是自然产物；smoke 会先补齐最小 legacy compat schema，再主动写入本次用到的 compat fixture，用它固定“先 legacy_seeded、后 next(native)”的命中顺序
- 该 smoke 结束时会主动清理本次写入的 compat fixture、auth trace 与 next 持久化数据，避免把顺序证明残留在共用数据库里
- 如需只复跑这条最小带库真源证明，而不跑整条 `with-db` replace-ready，可直接用 `pnpm verify:replace-ready:proof:with-db` 或 `pnpm verify:server-next:proof:with-db`

仍建议保留手动链路确认：

- `c:gmGetState` 可收到 `s:gmState`
- `c:gmUpdatePlayer` 可精确更新坐标、血量与自动战斗状态
- `c:gmSpawnBots` / `c:gmRemoveBots` 可正确维护 `botCount`
- `c:gmResetPlayer` 可把玩家送回出生点并恢复满血、关闭自动战斗

旧 GM admin / database 兼容当前已经补齐专用自动 proof 入口，但要区分“仓库里已有自动命令”和“当前环境已经实跑过”：

- 已部署 shadow 实例上的 `gm/database/backup -> download -> restore` destructive 闭环，现已提供 `pnpm verify:replace-ready:shadow:destructive` / `pnpm verify:server-next:shadow:destructive` / `pnpm --filter @mud/server-next smoke:shadow:gm-database`；它必须在维护窗口里执行，并显式设置 `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1`
- 容器或 stack 场景下，`SERVER_NEXT_GM_DATABASE_BACKUP_DIR` 指向同一持久路径后跨重建仍保留备份文件，现已提供 `pnpm --filter @mud/server-next smoke:gm-database:backup-persistence`；根级 `pnpm verify:replace-ready:full` 也已自动串上这条 proof
- 独立真数据库 restore 演练仍必须保留人工窗口，不能只用兼容备份 smoke 或 shadow destructive proof 替代

当前已经自动覆盖或仍建议人工确认的边界如下：

- `POST /auth/gm/login` 可返回 GM access token
- `GET /gm/database/state` / `POST /gm/database/backup` / `GET /gm/database/backups/:backupId/download` 可正常返回
- `GET /gm/database/state` 在服务重启后仍能读到上一次任务结果；若上次任务在重启时中断，应显示失败
- `POST /gm/database/backup` 后应记录 `backupId`，`POST /gm/database/restore` 必须提交 `{ "backupId": "<id>" }`
- `POST /gm/database/restore` 现在必须先开启维护态（`SERVER_NEXT_RUNTIME_MAINTENANCE=1` 或 `RUNTIME_MAINTENANCE=1`），并会自动生成一份 `pre_import` 检查点备份
- 兼容备份现在会带 `documentsCount` / `checksumSha256`；损坏备份应被 restore 直接拒绝，而不是部分导入
- 当前带库 `gm-database-smoke` 也会显式校验并发 `backup/restore` 时第二次请求会被 `当前已有数据库任务执行中` 拒绝，避免重复触发兼容数据库任务
- 当前带库 `gm-database-smoke` 还会显式校验下载下来的备份内容、`gm/database/state` 元数据和磁盘落盘文件三者一致，并覆盖 restore 生成的 `pre_import` 检查点备份下载
- 当前带库 `gm-database-smoke` 也会显式校验 backup 之后新建的建议单和 GM 直邮都会在 restore 后消失，且 mail summary 会回到 backup 前基线，证明 restore 后 suggestion / mail 业务态与运行时缓存都确实回滚，而不是只有任务元数据成功
- 当前带库 `gm-database-smoke` 也会显式校验服务重启后 `gm/database/state.lastJob / checkpointBackupId / sourceBackupId / appliedAt / finishedAt` 仍可读，避免 restore 任务结果只存在进程内存
- 当前带库 `gm-database-smoke` 也会显式校验 restore 进行中若被重启/打断，`gm/database/state.lastJob` 会落成 `failed`，并保留 `checkpointBackupId / finishedAt / error phase`
- 当前 `shadow-gm-database-proof` 也会显式校验已部署 shadow 在维护态下的 `backup -> download -> restore` destructive 闭环，并验证 restore 后 `checkpointBackupId / sourceBackupId / appliedAt / finishedAt`
- 当前 `gm-database-backup-persistence-smoke` 也会显式校验同一 `SERVER_NEXT_GM_DATABASE_BACKUP_DIR` 在服务重建后仍能继续通过 `gm/database/state` 与 download 接口读回旧备份
- 无数据库环境下，`POST /gm/database/restore` 会显式返回 400，避免误报成功
- 无数据库环境下，`backup` 只会产出当前 `persistent_documents` 视图对应的兼容备份，不能替代带库闭环
- 如用容器或 stack 演练，仍建议同时确认 `SERVER_NEXT_GM_DATABASE_BACKUP_DIR` 已挂到独立卷，避免备份文件随容器层临时文件系统销毁

独立部署演练：

- 本地容器演练使用 [docker-compose.server-next.yml](/home/yuohira/mud-mmo/docker-compose.server-next.yml)
- shadow stack 演练使用 [docker-stack.server-next.yml](/home/yuohira/mud-mmo/docker-stack.server-next.yml)
- GitHub 手工镜像发布使用 [.github/workflows/publish-server-next-image.yml](/home/yuohira/mud-mmo/.github/workflows/publish-server-next-image.yml)
- GitHub 手工 shadow 部署使用 [.github/workflows/deploy-server-next.yml](/home/yuohira/mud-mmo/.github/workflows/deploy-server-next.yml)
- GitHub 手工独立带库验证使用 [.github/workflows/verify-server-next-with-db.yml](/home/yuohira/mud-mmo/.github/workflows/verify-server-next-with-db.yml)
- 完整替换演练、回滚步骤与观察点见 [REPLACE-RUNBOOK.md](/home/yuohira/mud-mmo/packages/server-next/REPLACE-RUNBOOK.md)
- 当前 publish/deploy workflow 的前置验证已抬到临时 PostgreSQL service 上的 `pnpm verify:replace-ready`，会自动走 `verify:replace-ready:with-db`；shadow stack 也自带独立 `postgres/redis`
- 独立带库验证 workflow 仍保留，用于隔离排障或单独补证，但它不再是 publish/deploy 获得带库门禁的唯一入口
- `Deploy Server Next` workflow 现在会在 `docker stack deploy` 后追加 `pnpm verify:replace-ready:shadow` 与 `pnpm --filter @mud/server-next smoke:gm-compat`，用于确认 `11923` 上的已部署实例本身可访问、可登录 GM、可完成基础入图，并补验管理只读面与 GM 关键写路径

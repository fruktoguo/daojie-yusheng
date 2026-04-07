# server-next 替换运行手册

本手册只覆盖 `server-next` 的独立 shadow 演练与替换准备，不修改旧后端当前正式部署链。

## 目标边界

- `server-next` 默认走独立容器、独立 stack、独立 workflow
- shadow 演练默认使用 `11923`
- 旧后端正式端口 `11922` 不在本手册范围内直接改动
- 兼容入口集中在 `src/compat/legacy/`，后续移除兼容层时优先从这里收口

## 环境变量矩阵

基础必填：

- `JWT_SECRET`
- `SERVER_NEXT_RUNTIME_TOKEN`

带库链路额外需要：

- `SERVER_NEXT_DATABASE_URL` 或 `DATABASE_URL`

shadow / acceptance / full 额外需要：

- `SERVER_NEXT_SHADOW_URL` 或 `SERVER_NEXT_URL`
- `SERVER_NEXT_GM_PASSWORD` 或 `GM_PASSWORD`

按需：

- `SERVER_NEXT_GM_DATABASE_BACKUP_DIR` 或 `GM_DATABASE_BACKUP_DIR`

这些别名当前不只供单个 smoke 使用；根级 wrapper、自检入口、with-db、shadow、acceptance 与 full 现在共享同一套来源解析，所以这张变量矩阵对应的是整条 replace-ready 调用链。

## replace-ready 四层门禁定义

- `local`：`pnpm verify:replace-ready`（或 `pnpm verify:server-next`、`scripts/replace-ready.*` / `scripts/server-next-verify.*` wrappers）是本地主证明链，自动检测是否存在 `DATABASE_URL/SERVER_NEXT_DATABASE_URL` 并选择是否串 `with-db`/`proof:with-db`。它代表“你的机器通过了自检 + next 协议 + guest/auth/GM minimal compat”，但并不意味着已经可以直接替换运营。
- `acceptance`：`pnpm verify:replace-ready:acceptance`（或 `pnpm verify:server-next:acceptance`）会先跑 `local`，再针对 shadow 实例跑 `verify:replace-ready:shadow` 与 `pnpm --filter @mud/server-next smoke:gm-compat`，确保 shadow 会话链 + shadow GM 写路径在实物环境闭环。
- `full`：`pnpm verify:replace-ready:full`（或 `pnpm verify:server-next:full`）要求数据库、shadow、GM 密码都就绪，显式串行跑 `with-db -> gm-database -> gm-database-backup-persistence -> shadow -> gm-compat`，可视为 `local` + `acceptance` + `gm/database` 运营 proof，但仍不等于完整 GM/admin 人工回归。
- `shadow-destructive`：`pnpm verify:replace-ready:shadow:destructive` 需要同时传 `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1`，是仅在维护窗口里执行的破坏性 proof，用来单独验证 shadow 上的 `backup -> download -> restore` 闭环，必须串行执行且不会被自动化链调用。

补充口径：

- `audit:server-next-protocol` 当前 GM 登录也走 `SERVER_NEXT_GM_PASSWORD` / `GM_PASSWORD`
- 独立协议审计 runner 会把子进程里的 `SERVER_NEXT_URL` 与 `SERVER_NEXT_SHADOW_URL` 都固定到本次自起审计实例，避免继承外部 shadow URL 串到错误目标
- `marketTradeHistory` 审计当前会短轮询直到买家成交历史真正可见，不再把“背包已到账但成交历史页尚未更新”的瞬时时序误判成失败

仅开发或无库烟测旁路：

- `SERVER_NEXT_ALLOW_UNREADY_TRAFFIC=1`
- `SERVER_NEXT_SMOKE_ALLOW_UNREADY=1`
- `SERVER_NEXT_RUNTIME_HTTP=1`

仅维护或恢复：

- `SERVER_NEXT_RUNTIME_MAINTENANCE=1`
- `RUNTIME_MAINTENANCE=1`
- `SERVER_NEXT_RUNTIME_RESTORE_ACTIVE=1`

## 先做环境自检

在跑本地 / 带库 / shadow 任一 replace-ready 链之前，先执行：

1. `pnpm verify:replace-ready:doctor`
2. 如需保持旧口径，也可执行 `pnpm verify:server-next:doctor`
3. Windows / Unix wrapper 分别是 `scripts\\replace-ready-doctor.cmd`、`./scripts/replace-ready-doctor.sh`

自检只检查环境变量是否齐备，不会连接数据库，也不会请求 shadow 实例。当前它会明确提示：

- `with-db` 是否缺少 `DATABASE_URL` / `SERVER_NEXT_DATABASE_URL`
- `proof with-db` 是否缺少 `DATABASE_URL` / `SERVER_NEXT_DATABASE_URL`
- `shadow` 是否缺少 `SERVER_NEXT_SHADOW_URL` / `SERVER_NEXT_URL`
- `shadow / acceptance` 是否缺少 `SERVER_NEXT_GM_PASSWORD` / `GM_PASSWORD`
- `full` 是否同时缺少数据库、shadow 与 GM 密码环境
- `pnpm verify:server-next*` 兼容别名当前会先打印 alias 委托关系，再进入对应的 `replace-ready` wrapper

如果你已经具备 shadow 环境，也可以直接执行组合链：

1. `pnpm verify:replace-ready:acceptance`
2. 或旧口径别名 `pnpm verify:server-next:acceptance`

它会先检查 `SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL` 与 `SERVER_NEXT_GM_PASSWORD/GM_PASSWORD` 是否齐备，随后先跑根级 `verify:replace-ready`，然后再跑 `verify:replace-ready:shadow` 与 `pnpm --filter @mud/server-next smoke:gm-compat`。如果本地已配置数据库环境，第一段会自动走 `with-db`。

如果你已经同时具备数据库环境与 shadow 环境，也可以直接执行更严格的自动化入口：

1. `pnpm verify:replace-ready:full`
2. 或旧口径别名 `pnpm verify:server-next:full`

它会强制要求 `DATABASE_URL/SERVER_NEXT_DATABASE_URL`、`SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL` 与 `SERVER_NEXT_GM_PASSWORD/GM_PASSWORD` 都齐备，然后显式串行跑 `with-db -> gm-database -> gm-database-backup-persistence -> shadow -> gm-compat`。在完成定义上，这等价于完整的 `with-db + acceptance + gm-database`，也就是强制带库后先补跑数据库运营面回归与 backup-dir 持久化证明，再跑 shadow 实物验收与 shadow GM 关键写路径验证这一整条自动化链。

截至 `2026-04-06`，这条 acceptance 组合链也已经在本地独立 PostgreSQL/Redis 环境 + 本地 `11923` shadow 实例上实跑通过。

## 本地替换前验收

无数据库环境：

1. 先执行 `pnpm verify:replace-ready:doctor`
2. 执行 `pnpm verify:replace-ready`
3. 确认 `client-next build`、`verify:replace-ready`、`audit:server-next-protocol` 全部通过
4. 确认 `/health` 在无库情况下返回 `503`，只有显式旁路时才允许 smoke 继续跑

独立带 PostgreSQL 的验证环境：

1. 配置 `SERVER_NEXT_DATABASE_URL` 或 `DATABASE_URL`
2. 先执行 `pnpm verify:replace-ready:doctor`
3. 执行 `pnpm verify:replace-ready`
4. 如需只复跑最小带库 `auth/token/bootstrap` 真源证明链，执行 `pnpm verify:replace-ready:proof:with-db`
5. 这条 proof 入口当前已覆盖 `invalidIdentityRejected / missingSnapshotRejected / invalidSnapshotMetaPersistedSourceNormalized / invalidSnapshotUnlockedMapIdsNormalized / invalidSnapshotRejected / nextIdentityInvalidCompatMapIdIgnored / nextIdentityInvalidUnlockedMapIdsIgnored / compatBackfillSaveFailed / compatBackfillSaveFailedMissingSnapshotRejected / compatIdentityBackfillSnapshotPreseed / compatIdentityBackfillSnapshotSeedFailureRejected / nextIdentityCompatSnapshotIgnored`，并本轮在同一链路中实跑通过了 `authenticatedSessionProof`（并发 replace、detached resume 以及 expired sid rotate 均在 expect 范围内）与 `sessionReaperProof`（成功与重试路径），以补强 session 状态并发/清理行为的可信度。
6. 执行 `pnpm --filter @mud/server-next smoke:persistence`
7. 执行 `pnpm --filter @mud/server-next verify:with-db`
8. 执行 `pnpm --filter @mud/server-next verify:replace-ready:with-db`

截至 `2026-04-05`，这条 with-db 链已经在本地独立 PostgreSQL/Redis 环境实跑通过。

验收重点：

- `client-next build` 必须通过，确保前台 next 包当前可独立构建
- `audit:server-next-protocol` 必须通过，确保 next 连接不会额外收到 legacy `S2C` 事件
- `smoke:readiness-gate` 必须通过，确保无数据库时 `/health` 返回 `503` 且新 next socket 会被 `SERVER_NOT_READY` 拒绝；只有显式旁路时 smoke 才允许继续
- 旧认证 HTTP 兼容可用
- `WorldSessionBootstrapService` 当前已不再直接注入 legacy GM HTTP auth；GM socket token 校验已外提到中性的 `WorldGmAuthService`，但这只说明 bootstrap 主链 direct legacy 边界更薄，不表示 GM auth 真源已经完成替换
- 旧普通玩家 socket 最小 compat smoke 已纳入 `pnpm verify:replace-ready`
- 旧 GM HTTP 兼容可用
- 旧 GM socket/HTTP 最小 compat smoke 已纳入 `pnpm verify:replace-ready`
- `shadow` 最小实物验收现在也会检查 `n:c:hello` 建立的 next 会话不混入 legacy 事件
- `s:attrUpdate` 继续按顶层字段增量下发，不回退到高频全量
- 断线留场与顶号重连正常
- readiness 未就绪时拒绝新 socket
- `pnpm audit:server-next-boundaries` 可稳定通过，并刷新 [docs/next-legacy-boundary-audit.md](/home/yuohira/mud-mmo/docs/next-legacy-boundary-audit.md)；这份报告只用于固定“还剩哪些 legacy 边界”，不能替代 replace-ready / with-db / shadow 验收
- `gm/database/backup` -> 下载备份 -> `POST /gm/database/restore`（body: `{ "backupId": "..." }`）在独立带库环境下闭环通过
- 执行 `POST /gm/database/restore` 前必须先显式进入维护态（`SERVER_NEXT_RUNTIME_MAINTENANCE=1` 或 `RUNTIME_MAINTENANCE=1`）
- `gm/database/restore` 会先自动生成一份 `pre_import` 检查点备份，随后才覆盖 `persistent_documents`
- 并发重复触发 `backup/restore` 时，第二次请求应被 `当前已有数据库任务执行中` 拒绝
- 损坏或被篡改的兼容备份会因为 `checksumSha256/documentsCount` 严格校验而被直接拒绝
- backup 之后新增的建议单和 GM 直邮在 restore 后都应消失，且 mail summary 应回到 backup 前基线，证明 restore 后 suggestion / mail 业务态与运行时缓存都已真正回滚
- `gm/database/state` 在服务重启后仍能看到上一次任务结果；`lastJob.checkpointBackupId/sourceBackupId/appliedAt/finishedAt` 也应继续可读；若重启打断 restore，状态会落成失败而不是静默丢失
- `pnpm verify:replace-ready` 当前仍不覆盖已部署实例的 shadow 实物验收；`11923` 或指定 shadow 地址仍需单独跑 `pnpm verify:replace-ready:shadow`
- 根级 `pnpm verify:replace-ready` 当前只表示“本地主证明链通过”，不等于“完整替换就绪”
- 当前 `pnpm verify:replace-ready:acceptance` 现在已经是“本地主证明链 + shadow 实物验收 + shadow GM 关键写路径验证”的组合入口，但仍不等于完整 GM/admin 人工回归
- 当前 `pnpm verify:replace-ready:full` 则是“强制 with-db + gm-database + gm-database-backup-persistence + shadow + gm-compat”的更严格入口，也就是强制带库后先补跑数据库运营面回归与 backup-dir 持久化 proof，再跑 shadow 与 shadow GM 关键写路径验证，但仍不等于完整 GM/admin 人工回归
- 截至 `2026-04-06`，`pnpm verify:replace-ready:acceptance` 也已经在本地独立 PostgreSQL/Redis 环境 + 本地 `11923` shadow 实例实跑通过
- 如需只排障 auth/token/bootstrap 准备层，可显式设置 `SERVER_NEXT_AUTH_TRACE_ENABLED=1` 或 `NEXT_AUTH_TRACE_ENABLED=1`；此时服务端会在 runtime debug guard 保护下开放 `GET /runtime/auth-trace` / `DELETE /runtime/auth-trace`，便于确认 `token / identity / snapshot / bootstrap` 四段记录、identity 的 `persistenceEnabled / persistAttempted / persistSucceeded / persistFailureStage`，以及读侧聚合出来的 `summary`；其中 bootstrap 记录和 `summary.bootstrap` 现在还会额外暴露 `entryPath` 与 `identitySource`。默认不开启，不改变正常验收链
- 上面这条最小带库 proof 现在还把两个重要边界写死了：如果 compat identity 已成功 backfill 且 snapshot preseed 也成功，authenticated 主链必须直接命中 next `legacy_seeded` snapshot；如果 identity backfill 成功但 snapshot preseed 首次失败，identity trace 必须显式落成 `legacy_preseed_blocked` 并直接拒绝；如果 identity backfill 保存本身失败，identity trace 也必须显式落成 `legacy_persist_blocked` 并直接拒绝，而不是继续把 `legacy_backfill` 或 `legacy_runtime` 留作 runtime fallback rescue
- 根级 `pnpm verify:replace-ready:proof:with-db` / `pnpm verify:server-next:proof:with-db` 当前会自动注入 trace 开关；只有包内直跑 `pnpm --filter @mud/server-next verify:proof:with-db` 时，才需要手工补 `SERVER_NEXT_AUTH_TRACE_ENABLED=1` 或 `NEXT_AUTH_TRACE_ENABLED=1`
- `GET /runtime/auth-trace` 当前除原始 `records` 外，也会附带 `summary` 聚合，能直接看到 `identity/snapshot/bootstrap` 的命中计数、identity 持久化动作计数、bootstrap 的 `requestedSessionCount`，以及按 `identitySource|snapshotSource` 汇总的 `bootstrap.linkedSourceCounts` 和按 `snapshotPersistedSource` 汇总的 `bootstrap.linkedPersistedSourceCounts`；这属于准备层可观测补强，不改变任何真源语义

## 本地 shadow 演练

使用本地独立 compose：

1. `docker compose -f docker-compose.server-next.yml up -d --build`
2. 访问 `http://127.0.0.1:11923/health`
3. 先执行 `pnpm verify:replace-ready:doctor`
4. 执行 `pnpm verify:replace-ready:with-db`
5. 如要确认当前 `11923` 容器实例本身而不是本地自启进程，额外执行 `SERVER_NEXT_SHADOW_URL=http://127.0.0.1:11923 pnpm verify:replace-ready:shadow`
6. 如需把 shadow 上的 GM 关键写路径也一起补验，执行 `SERVER_NEXT_URL=http://127.0.0.1:11923 pnpm --filter @mud/server-next smoke:gm-compat`
7. 这条 smoke 当前除基础 GM socket/HTTP 外，也会补验 `/gm/maps`、`/gm/editor-catalog`、`/gm/maps/:mapId/runtime` 只读面，以及玩家改密、地图 tick/time、邮件、建议单等关键维护写路径
8. 如果数据库和 shadow 环境都已齐备，也可以直接执行 `SERVER_NEXT_SHADOW_URL=http://127.0.0.1:11923 pnpm verify:replace-ready:full`
9. 手动验证旧客户端登录、移动、战斗、邮件、市场、GM 管理
10. 调用 `POST /gm/database/backup`，从返回值或 `GET /gm/database/state` 记录 `backupId`
11. 先开启维护态，再调用 `POST /gm/database/restore`，body 传 `{ "backupId": "<上一步 backupId>" }`；确认自动生成了 `pre_import` 检查点备份，并核对下载下来的备份内容、`gm/database/state` 元数据与磁盘落盘文件一致；如重复点击 `backup/restore`，第二次请求应被拒绝；backup 后新增的建议单与 GM 直邮在 restore 后都应消失，且 mail summary 应回到 backup 前基线；随后再确认 `/health`、`gm/database/state` 与重连后的运行态恢复正常
12. 确认备份文件写入 `SERVER_NEXT_GM_DATABASE_BACKUP_DIR` 对应卷
13. 演练完成后执行 `docker compose -f docker-compose.server-next.yml down`

截至 `2026-04-06`，`pnpm verify:replace-ready:shadow` 也已经对本地 `11923` shadow 实例实跑通过。

## 远端 shadow stack 演练

手工发布镜像：

1. 如需先跑隔离带库证明链，可先触发 [.github/workflows/verify-server-next-with-db.yml](/home/yuohira/mud-mmo/.github/workflows/verify-server-next-with-db.yml)
2. 触发 [.github/workflows/publish-server-next-image.yml](/home/yuohira/mud-mmo/.github/workflows/publish-server-next-image.yml)
3. 确认镜像发布前置 job 已在临时 PostgreSQL service 上通过 `pnpm verify:replace-ready`，并自动走到 `verify:replace-ready:with-db`
4. 确认镜像已推到 `ghcr.io/<owner>/daojie-yusheng-server-next`

手工部署 shadow stack：

1. 确认 `DEPLOY_SSH_*`、`GHCR_*`、`PROD_DB_USERNAME/PROD_DB_PASSWORD/PROD_DB_DATABASE`、`PROD_*_TOKEN` 等 secrets 已配置；这里的 `PROD_DB_*` 只用于 shadow stack 自带 Postgres 初始化，不是外部生产库连接串
2. 触发 [.github/workflows/deploy-server-next.yml](/home/yuohira/mud-mmo/.github/workflows/deploy-server-next.yml)
3. 确认 stack 名为 `daojie-yusheng-server-next`
4. 确认 shadow 入口仍是 `11923`
5. 确认 `server_next_backup_data` 卷已挂载到 `/var/lib/server-next`
6. 先执行 `pnpm verify:replace-ready:doctor`，确认 `SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL` 与 `SERVER_NEXT_GM_PASSWORD/GM_PASSWORD` 已齐备
7. 再执行 `pnpm verify:replace-ready:shadow`，确认已部署的 `11923` 实例本身可通过 `/health`、GM 登录、`/gm/state`、`/gm/database/state`、`/gm/maps`、`/gm/editor-catalog`、`/gm/maps/:mapId/runtime`，以及 `n:c:hello` 的最小 next 会话建立链路（`Bootstrap / InitSession / MapEnter / MapStatic / Realm / WorldDelta / SelfDelta / PanelDelta`）且不混入 legacy 事件；其中 runtime 只读断言会在 bootstrap 成功后按玩家真实 `templateId/x/y` 取样
8. 再执行 `pnpm --filter @mud/server-next smoke:gm-compat`，确认已部署 shadow 实例的 GM 关键写路径、`/gm/maps`、`/gm/editor-catalog`、`/gm/maps/:mapId/runtime` 这组管理只读面都能通过，并核对输出里的 `passwordChange / adminRead.currentMap / adminRead.editorCatalog / adminRead.runtimeInspection`
9. 如数据库环境、shadow 地址和 GM 密码都齐备，也可以直接执行 `pnpm verify:replace-ready:full` 作为最严格自动化链；它现在会额外补跑本地 `gm-database-backup-persistence` proof
10. 如需证明已部署 shadow 的 destructive 数据库闭环，先把 shadow 切到维护态，再显式设置 `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1` 后执行 `pnpm verify:replace-ready:shadow:destructive`；该入口只建议在专用维护窗口里串行执行
11. `Verify Server Next With DB` workflow 当前仍是独立补充链路，主要用于隔离排障、单独补证或在不发版时复跑带库证明

## 观察指标

基础：

- `/health` 是否为 `200`
- readiness 详情是否显示 `ready=true`
- 进程启动后无 Nest 依赖注入错误
- socket 连接在未就绪时被拒绝，在就绪后可正常进入地图

运行态：

- 新号首登 `first:init:new`
- 断线重连 `second:init:resumed`
- guest 首登现在可以不传 `playerId`；canonical guest 身份以服务端回包 `InitSession.pid` 为准
- 断线后若客户端只带正确 detached `sessionId` 再连，guest 会恢复既有 server `sid/pid`
- 断线后若客户端只带 forged `sessionId` 且不带 `playerId` 再连，guest 必须拿到新的 `InitSession.sid/pid`，不得复用旧人
- 断线后若客户端只伪造旧 `playerId` 再连，guest 也必须拿到新的 `InitSession.sid/pid`，不得复用旧人
- 会话真源 `WorldSessionService` 仍必须保证：若 detached binding 直接收到错配 sid，不得接纳 forged sid，且必须轮换成新的 server sid
- canonical guest bootstrap/resume 现在只走 `InitSession.pid + detached sessionId` 这条真源链；`hello_guest/requestedPlayerId` 已移除
- 断线 15 秒后 runtime 仍存在，但 `sessionId=null`
- AOI 广播只覆盖视野内实体
- 属性同步保持增量字段，不出现每次 buff 变动整包全量

低频兼容：

- `auth/*` 旧 HTTP 返回兼容结构
- `gm/*` 旧 HTTP 返回兼容结构
- `gm/database/state` 状态与 restore 实际阶段一致
- `gm/database/state` 的 `lastJob.phase/checkpointBackupId/sourceBackupId/appliedAt/finishedAt` 与 restore 实际阶段一致
- `gm-database-backup-persistence` 已证明同一 `SERVER_NEXT_GM_DATABASE_BACKUP_DIR` 在服务重建后仍能读回旧备份；容器/stack 演练时仍应确认它对应独立卷
- GitHub publish/deploy workflow 当前都会先在临时 PostgreSQL service 上跑 `pnpm verify:replace-ready`，因此前置门禁已自动覆盖 `persistence + gm/database` 带库回归
- GitHub deploy workflow 现在会在 `docker stack deploy` 后额外跑一次 `pnpm verify:replace-ready:shadow` 与 `pnpm --filter @mud/server-next smoke:gm-compat`，验证对象是已部署的 `11923` 实例本身，而不是本地自启 smoke 进程

## 回滚

shadow 回滚：

1. `docker stack rm daojie-yusheng-server-next`
2. 确认 `11923` 不再暴露 `server-next`
3. 旧后端 `11922` 保持原状，不需要额外切换

切换前最后检查：

1. 旧服和 shadow 使用不同端口或入口
2. 至少在一套独立带库环境做过一次 restore 闭环；如果要验证旧服真库或生产库兼容性，需要另开人工演练窗口
3. GM 兼容操作已回归
4. 维护态、未就绪拒连、断线留场已验过
5. 发布镜像与部署 workflow 都走过至少一次

## 当前仍未完全关闭的风险

- 没有真数据库环境时，`backup/restore` 只能做到代码路径与保护逻辑验证，无法替代真实闭环演练
- `gm/database/*` 仍只覆盖 `persistent_documents`，不覆盖旧后端正式 `users/players` 表；这是刻意保守边界，不是遗留 bug
- 目前手工 workflow 是独立的，不会自动替换旧服生产流；正式切换前仍需要按本手册人工验收

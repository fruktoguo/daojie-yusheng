# server-next

当前包先基于已验证可运行的 `dist` 代码回灌恢复源码基线，再继续向“可完整替换旧后端”推进。

当前状态先说结论：

- `server-next` 现在可以继续作为 next 前后台迁移的主后端推进，但还不能宣称“已经完整替换游戏整体”。
- 截至 `2026-04-06`，`pnpm verify:replace-ready`、`pnpm verify:replace-ready:proof:with-db`、`pnpm --filter @mud/server-next verify:replace-ready`、`pnpm audit:server-next-protocol`、`pnpm audit:server-next-boundaries` 这轮都已通过。
- 保守口径不变：如果目标是“完整替换游戏整体”，当前仍约差 `40% - 45%`。
- 用户最初目标的当前判断是：最小包体 `部分满足`、最高性能 `未满足`、极高扩展度 `部分满足`、系统稳定性 `部分满足`。
- 详细缺口见 [NEXT-GAP-ANALYSIS.md](/home/yuohira/mud-mmo/packages/server-next/NEXT-GAP-ANALYSIS.md)、[next-gap-analysis.md](/home/yuohira/mud-mmo/docs/next-gap-analysis.md)、[next-legacy-boundary-audit.md](/home/yuohira/mud-mmo/docs/next-legacy-boundary-audit.md)。

当前恢复策略：

- `src/` 先以可运行的 CommonJS 源恢复为主
- 后续新增与重构继续直接落在 `src/`
- 等源码基线稳定后，再逐步把恢复态源码整理回更正常的 TypeScript 形态
- 旧后端兼容面统一收敛在 `src/compat/legacy/`，其中 HTTP 兼容集中在 `src/compat/legacy/http/`
- `gm/database/*` 属于低频管理兼容面，已从主 GM 兼容服务拆出，便于后续整体收口

当前已打通的关键链路：

- 基础会话恢复与顶号重连
- AOI/world delta 增量同步
- 玩家战斗、怪物 AI、怪物技能、掉落与复活
- 旧客户端登录与旧协议桥接
- 旧认证 HTTP 兼容：
  - `POST /auth/register`
  - `POST /auth/login`
  - `POST /auth/refresh`
  - `GET /auth/display-name/check`
- 旧 GM HTTP 兼容：
  - `POST /auth/gm/login`
  - `POST /auth/gm/password`
  - `GET /gm/state`
  - `GET /gm/editor-catalog`
  - `GET /gm/maps`
  - `GET /gm/maps/:mapId/runtime`
  - `PUT /gm/maps/:mapId/tick`
  - `PUT /gm/maps/:mapId/time`
  - `POST /gm/tick-config/reload`
  - `DELETE /gm/world-observers/:viewerId`
  - `GET /gm/players/:playerId`
  - `PUT /gm/players/:playerId`
  - `POST /gm/players/:playerId/reset`
  - `POST /gm/players/:playerId/heaven-gate/reset`
  - `POST /gm/players/:playerId/password`
  - `PUT /gm/players/:playerId/account`
  - `POST /gm/players/:playerId/mail`
  - `POST /gm/mail/broadcast`
  - `POST /gm/bots/spawn`
  - `POST /gm/bots/remove`
  - `POST /gm/shortcuts/players/return-all-to-default-spawn`
  - `POST /gm/perf/network/reset`
  - `POST /gm/perf/cpu/reset`
  - `POST /gm/perf/pathfinding/reset`
  - `GET /gm/suggestions`
  - `POST /gm/suggestions/:id/complete`
  - `POST /gm/suggestions/:id/replies`
  - `DELETE /gm/suggestions/:id`
  - `GET /gm/redeem-code-groups`
  - `POST /gm/redeem-code-groups`
  - `GET /gm/redeem-code-groups/:groupId`
  - `PUT /gm/redeem-code-groups/:groupId`
  - `POST /gm/redeem-code-groups/:groupId/codes`
  - `DELETE /gm/redeem-codes/:codeId`
- 旧 GM 低频管理兼容：
  - `GET /gm/database/state`
  - `POST /gm/database/backup`
  - `GET /gm/database/backups/:backupId/download`
  - `POST /gm/database/restore`

当前低频兼容面的安全边界：

- `gm/database/backup` 与 `gm/database/restore` 当前只作用于 `persistent_documents`
- 不会触碰旧后端正式账号表、玩家表等高风险结构
- `gm/database/*` 的任务状态现在会持久化在兼容层文档里，服务重启后仍能看到上一次任务结果；若任务在重启时中断，会回写为失败态
- `gm/database/restore` 现在要求先显式进入维护态（`SERVER_NEXT_RUNTIME_MAINTENANCE=1` 或 `RUNTIME_MAINTENANCE=1`），避免在正常对外服务时误触发恢复
- `gm/database/restore` 在真正覆盖前会先自动生成一份 `pre_import` 检查点备份，便于回滚到导入前的兼容层状态
- 兼容备份现在会写入 `documentsCount` 与 `checksumSha256`，restore 会做严格校验；损坏或被篡改的备份会直接拒绝导入，不再静默跳过坏记录
- 无数据库时，`POST /gm/database/restore` 会显式返回 400
- 无数据库时，`POST /gm/database/backup` 仍会生成兼容备份文件，但只会导出当前 `persistent_documents` 视图；这只能验证链路，不代表真实数据库备份
- 备份文件目录可通过 `SERVER_NEXT_GM_DATABASE_BACKUP_DIR` 或 `GM_DATABASE_BACKUP_DIR` 指向独立持久卷
- 旧 GM socket 兼容：
  - `c:gmGetState`
  - `c:gmSpawnBots`
  - `c:gmRemoveBots`
  - `c:gmUpdatePlayer`
  - `c:gmResetPlayer`

常用命令：

- 正式替换验收建议先跑 `pnpm verify:replace-ready:doctor` 做环境自检，再按输出选择 `local / with-db / proof with-db / shadow / acceptance / full`
- 正式替换验收请优先使用根级 `pnpm verify:replace-ready`；但它只表示“本地主证明链通过”，不等于“完整替换就绪”
- 如需只复跑最小带库 `auth/token/bootstrap` 真源证明链，可使用 `pnpm verify:replace-ready:proof:with-db`
- 如果需要把“本地主证明链 + shadow 实物验收 + shadow GM 关键写路径验证”串成一条命令，可使用 `pnpm verify:replace-ready:acceptance`
- 如果需要强制走“with-db + gm-database + gm-database-backup-persistence + shadow + gm-compat”这条最严格自动化链，可使用 `pnpm verify:replace-ready:full`
- 如果需要在维护窗口里单独证明已部署 shadow 的 `backup -> download -> restore` destructive 闭环，可使用 `pnpm verify:replace-ready:shadow:destructive`；该入口必须显式设置 `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1`
- 包内 `pnpm --filter @mud/server-next verify:replace-ready` 只是 `server-next` 本包 smoke 子集
- `pnpm verify:replace-ready:doctor`
- `pnpm verify:replace-ready:proof:with-db`
- `pnpm verify:replace-ready:shadow:destructive`
- `pnpm verify:replace-ready:acceptance`
- `pnpm verify:replace-ready:full`
- `pnpm verify:server-next:proof:with-db`
- `pnpm verify:server-next:shadow:destructive`
- `pnpm --filter @mud/server-next verify`
- `pnpm --filter @mud/server-next verify:replace-ready`
- `pnpm --filter @mud/server-next verify:proof:with-db`
- `pnpm --filter @mud/server-next verify:replace-ready:with-db`
- `pnpm --filter @mud/server-next smoke:gm-compat`
- `pnpm --filter @mud/server-next compile`
- `pnpm --filter @mud/server-next smoke:shadow`
- `pnpm --filter @mud/server-next smoke:shadow:gm-database`
- `pnpm --filter @mud/server-next smoke:session`
- `pnpm --filter @mud/server-next smoke:legacy-auth`
- `pnpm --filter @mud/server-next smoke:legacy-player-compat`
- `pnpm --filter @mud/server-next smoke:combat`
- `pnpm --filter @mud/server-next smoke:monster-ai`
- `pnpm --filter @mud/server-next smoke:monster-skill`
- `pnpm --filter @mud/server-next smoke:player-respawn`
- `pnpm --filter @mud/server-next smoke:gm-database`
- `pnpm --filter @mud/server-next smoke:gm-database:backup-persistence`

## replace-ready 四层门禁

- `local`：`pnpm verify:replace-ready`（及 `pnpm verify:server-next`、`scripts/replace-ready.*` / `scripts/server-next-verify.*` wrappers）是本地主证明链。它会自动感知有无 `DATABASE_URL/SERVER_NEXT_DATABASE_URL` 并决定是否走 `with-db`、`proof:with-db` 或只跑纯本地链，代表“本地主机已经通过自检 + 协议 + next 会话 + compat smoke”，但不等于“完整替换就绪”。
- `acceptance`：`pnpm verify:replace-ready:acceptance`（别名 `pnpm verify:server-next:acceptance`）会先跑 `local`，再跑 `verify:replace-ready:shadow` 与 shadow 实例上的 `pnpm --filter @mud/server-next smoke:gm-compat`，把 shadow 实物验收与 shadow GM 关键写路径串成一条组合链。
- `full`：`pnpm verify:replace-ready:full`（别名 `pnpm verify:server-next:full`）在要求数据库、shadow 与 GM 密码都齐备的前提下，显式串行跑 `with-db -> gm-database -> gm-database-backup-persistence -> shadow -> gm-compat`，也就是在 `local`+`acceptance` 基础上再把自动化的 `gm/database`、`gm-database-backup-persistence` 运营 proof 加进来；它仍不等于完整 GM/admin 的人工回归。
- `shadow-destructive`：`pnpm verify:replace-ready:shadow:destructive`（需加 `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1`）是维护窗口里的破坏性 proof，用于在 shadow 实例上单独跑 `backup -> download -> restore` 闭环，必须在专用窗口里串行执行。

其中 `pnpm --filter @mud/server-next smoke:session` 当前已固定四层 guest 会话语义：guest 首登可不传 `playerId`，canonical 身份以服务端回包 `InitSession.pid` 为准；断线后只带正确 detached `sessionId` 时会恢复既有 guest；只带 forged `sessionId` 且不带 `playerId` 时必须新建 guest 身份，不得复用旧人；即使显式伪造旧 `playerId` 再连，也必须拿到新的 `InitSession.sid/pid`；detached guest 超过 `SERVER_NEXT_SESSION_DETACH_EXPIRE_MS` 后再拿旧 `sid` 回连时，也必须拿到新的 `sid/pid`。`WorldSessionService` 在启动阶段将断线 detach 过期时窗默认定在 `15000ms`，但可以通过 `SERVER_NEXT_SESSION_DETACH_EXPIRE_MS` 环境变量向下或向上调整；`pnpm --filter @mud/server-next smoke:session` 还会把过期 resume 作为 proof 抽出来：当等待略过 `expireAt` 之后再次用旧 `sid` 连接，必须收到新的 `sid/pid`，过期 `sid` 不得恢复旧人。与此对应，同一条 smoke 里的 `serviceProof` 会继续锁 `WorldSessionService` 真源语义：detached 错配 sid 不得接纳 forged sid，且必须轮换出新的 server sid。`hello_guest/requestedPlayerId` 已不再参与 canonical guest bootstrap/resume。

独立替换入口：

- 根脚本：
  - `pnpm dev:server-next`
  - `pnpm start:server-next`
  - `pnpm verify:replace-ready:doctor`
  - `pnpm verify:replace-ready`
  - `pnpm verify:replace-ready:proof:with-db`
  - `pnpm verify:replace-ready:acceptance`
  - `pnpm verify:replace-ready:full`
  - `pnpm verify:replace-ready:with-db`
  - `pnpm verify:replace-ready:shadow`
  - `pnpm verify:replace-ready:shadow:destructive`
  - `pnpm verify:server-next:doctor`
  - `pnpm verify:server-next`
  - `pnpm verify:server-next:proof:with-db`
  - `pnpm verify:server-next:acceptance`
  - `pnpm verify:server-next:full`
  - `pnpm verify:server-next:with-db`
  - `pnpm verify:server-next:shadow`
  - `pnpm verify:server-next:shadow:destructive`
- `pnpm verify:server-next*` 当前是 `replace-ready` 链的兼容别名，执行时会先打印 alias 委托关系，便于排障时区分“旧口径入口”与“实际运行链路”
- 本地一键脚本：
  - Windows Doctor: `scripts\\replace-ready-doctor.cmd`
  - Windows: `scripts\\replace-ready.cmd`
  - Windows Proof + DB: `scripts\\replace-ready-proof-with-db.cmd`
  - Windows Acceptance: `scripts\\replace-ready-acceptance.cmd`
  - Windows Full: `scripts\\replace-ready-full.cmd`
  - Windows + DB: `scripts\\replace-ready-with-db.cmd`
  - Windows + Shadow: `scripts\\replace-ready-shadow.cmd`
  - Windows Shadow Destructive: `scripts\\replace-ready-shadow-destructive.cmd`
  - Unix Doctor: `./scripts/replace-ready-doctor.sh`
  - Unix: `./scripts/replace-ready.sh`
  - Unix Proof + DB: `./scripts/replace-ready-proof-with-db.sh`
  - Unix Acceptance: `./scripts/replace-ready-acceptance.sh`
  - Unix Full: `./scripts/replace-ready-full.sh`
  - Unix + DB: `./scripts/replace-ready-with-db.sh`
  - Unix + Shadow: `./scripts/replace-ready-shadow.sh`
  - Unix Shadow Destructive: `./scripts/replace-ready-shadow-destructive.sh`
  - Windows Doctor Alias: `scripts\\server-next-verify-doctor.cmd`
  - Windows: `scripts\\server-next-verify.cmd`
  - Windows Proof + DB Alias: `scripts\\server-next-verify-proof-with-db.cmd`
  - Windows Acceptance Alias: `scripts\\server-next-verify-acceptance.cmd`
  - Windows Full Alias: `scripts\\server-next-verify-full.cmd`
  - Windows + DB: `scripts\\server-next-verify-with-db.cmd`
  - Windows + Shadow: `scripts\\server-next-verify-shadow.cmd`
  - Windows Shadow Destructive Alias: `scripts\\server-next-verify-shadow-destructive.cmd`
  - Unix Doctor Alias: `./scripts/server-next-verify-doctor.sh`
  - Unix: `./scripts/server-next-verify.sh`
  - Unix Proof + DB Alias: `./scripts/server-next-verify-proof-with-db.sh`
  - Unix Acceptance Alias: `./scripts/server-next-verify-acceptance.sh`
  - Unix Full Alias: `./scripts/server-next-verify-full.sh`
  - Unix + DB: `./scripts/server-next-verify-with-db.sh`
  - Unix + Shadow: `./scripts/server-next-verify-shadow.sh`
  - Unix Shadow Destructive Alias: `./scripts/server-next-verify-shadow-destructive.sh`
- 独立容器与部署文件：
  - Docker 镜像: [Dockerfile](/home/yuohira/mud-mmo/packages/server-next/Dockerfile)
  - 本地 compose: [docker-compose.server-next.yml](/home/yuohira/mud-mmo/docker-compose.server-next.yml)
  - 独立 stack: [docker-stack.server-next.yml](/home/yuohira/mud-mmo/docker-stack.server-next.yml)
  - 手工发布镜像 workflow: [.github/workflows/publish-server-next-image.yml](/home/yuohira/mud-mmo/.github/workflows/publish-server-next-image.yml)
  - 手工部署 shadow stack workflow: [.github/workflows/deploy-server-next.yml](/home/yuohira/mud-mmo/.github/workflows/deploy-server-next.yml)
  - 手工独立带库验证 workflow: [.github/workflows/verify-server-next-with-db.yml](/home/yuohira/mud-mmo/.github/workflows/verify-server-next-with-db.yml)

当前部署约束：

- 这些 `server-next` 入口都是新增的独立路径，不会替换或修改旧后端当前的 compose、stack、自动部署工作流。
- `docker-stack.server-next.yml` 默认把 `server-next` 独立暴露在 `11923`，用于替换前 shadow 演练，不和旧后端 `11922` 端口冲突。
- `docker-stack.server-next.yml` 当前会同时部署独立的 `server-next/postgres/redis`，shadow 演练默认不接旧服现网库。
- compose / stack 默认额外挂载 `server_next_backup_data`，用于保存 `gm/database/*` 兼容备份文件，避免容器重建后本地备份丢失。

替换演练与回滚手册：

- 运行手册: [REPLACE-RUNBOOK.md](/home/yuohira/mud-mmo/packages/server-next/REPLACE-RUNBOOK.md)
- 默认一键验收 `pnpm verify:replace-ready` 会自动根据是否存在数据库环境，串行执行 `build:client-next`、`verify:replace-ready|verify:replace-ready:with-db`、`audit:server-next-protocol`
- `pnpm verify:replace-ready:acceptance` 会在此基础上继续追加 `pnpm verify:replace-ready:shadow` 与 shadow 目标上的 `pnpm --filter @mud/server-next smoke:gm-compat`，用于把本地主证明链、已部署实例实物验收和 shadow GM 关键写路径验证串成一条组合命令
- `pnpm verify:replace-ready:full` 会强制要求数据库环境与 shadow 环境齐全，并显式串行跑 `with-db -> gm-database -> gm-database-backup-persistence -> shadow -> gm-compat`；它在完成定义上等价于“强制 with-db + gm-database + gm-database-backup-persistence + shadow + gm-compat”，也就是强制带库后先补跑数据库运营面回归与 backup-dir 持久化 proof，再跑 shadow 实物验收与 shadow GM 关键写路径验证；它仍不等于完整 GM/admin 人工回归
- 如需只为 auth/token/bootstrap 排障打开准备层可观测，可显式设置 `SERVER_NEXT_AUTH_TRACE_ENABLED=1` 或 `NEXT_AUTH_TRACE_ENABLED=1`，然后通过受 runtime debug guard 保护的 `GET /runtime/auth-trace` / `DELETE /runtime/auth-trace` 查看或清空最近一段 `token / snapshot / bootstrap` trace；默认不开启，不影响正常链路
- `pnpm verify:replace-ready:doctor` 当前会显式报告 `with-db` 缺少 `DATABASE_URL/SERVER_NEXT_DATABASE_URL`、`shadow` 缺少 `SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL` 与 `SERVER_NEXT_GM_PASSWORD/GM_PASSWORD` 等环境前置；这只是自检，不等于替换验收
- `scripts/replace-ready-with-db.*` 与 `scripts/replace-ready-shadow.*` 当前也会打印 `steps/start/done/failed`，便于直接判断卡在 `build`、`with-db`、`audit` 还是 `shadow` 本体
- `pnpm audit:server-next-boundaries` / `pnpm --filter @mud/server-next audit:legacy-boundaries` 会刷新 [docs/next-legacy-boundary-audit.md](/home/yuohira/mud-mmo/docs/next-legacy-boundary-audit.md)，把当前剩余的 auth/bootstrap、legacy HTTP/GM/admin、world sync、runtime/persistence 与性能热点固定成可复跑 inventory；它不是 replace-ready 验收
- `pnpm --filter @mud/server-next smoke:gm-compat` 当前已覆盖旧 GM socket/HTTP 的最小兼容证明；除 `gmGetState/spawn/update/reset/remove` 外，也会补验 `GET /gm/maps`、`GET /gm/editor-catalog`、`GET /gm/maps/:mapId/runtime` 这组只读管理面，以及玩家改密、地图 tick/time、邮件、建议单等关键写路径，并在输出里给出 `passwordChange` 与 `adminRead.currentMap / adminRead.editorCatalog / adminRead.runtimeInspection` 摘要，但它还不能替代完整 GM/admin/backup/restore 人工回归
- `pnpm --filter @mud/server-next smoke:readiness-gate` 当前会锁定 readiness gate 语义：无数据库且未开启旁路时 `/health` 返回 `503`、next socket 收到 `SERVER_NOT_READY`；只有显式开启 `SERVER_NEXT_ALLOW_UNREADY_TRAFFIC=1` / `SERVER_NEXT_SMOKE_ALLOW_UNREADY=1` 时，本地 smoke 才继续跑
- `pnpm --filter @mud/server-next smoke:legacy-player-compat` 当前已覆盖旧普通玩家 socket 的 `navigateQuest / action(loot:open) / sortInventory / destroyItem / ackSystemMessages / chat`，并显式断言 `protocol: legacy` 后不会混入任何 `n:s:*` next 事件
- `WorldSessionBootstrapService` 当前已不再直接注入 legacy GM HTTP auth；GM socket token 校验已外提到中性的 `WorldGmAuthService`，但其底层真源仍是 legacy GM HTTP auth，这只表示 bootstrap 主链 direct 依赖继续收薄，不表示 GM auth 真源已完成替换
- `pnpm verify:server-next` 当前只是同一条根级 replace-ready 证明链的兼容别名
- 手工发布与部署 workflow 现在都会先在临时 PostgreSQL service 上执行 `pnpm verify:replace-ready`，并自动走 `verify:replace-ready:with-db`；通过后才继续构建镜像或部署 shadow stack
- 仓库现在额外提供独立的 `Verify Server Next With DB` workflow，用来把同一条带库证明链单独拉出来做隔离排障或补证
- 这些 workflow 的前置门禁现在已经覆盖带库 replace-ready 主证明链；部署后会额外执行 `pnpm verify:replace-ready:shadow` 与 `pnpm --filter @mud/server-next smoke:gm-compat`，把 shadow 的最小 next 会话链和 shadow GM 关键写路径一起补进部署后验收；但这仍不等于完整 GM/admin 人工回归
- 当前独立带库环境下 `pnpm verify:replace-ready:with-db` 已可全绿通过；`pnpm verify:server-next:with-db` 当前只是兼容别名，二者都包含 `persistence` 闭环
- 当前独立带库环境下 `pnpm verify:replace-ready:with-db` 已包含 `gm/database` 自动回归：维护态护栏、并发 `backup/restore` 单飞拒绝、损坏备份拒绝、备份下载内容与 state/磁盘一致性校验、restore 前自动 `pre_import` 检查点、checkpoint 备份下载、backup 后新增建议单与 GM 直邮在 restore 后消失且 mail summary 回到基线的业务态回滚证明，以及重启后 `lastJob / checkpointBackupId / sourceBackupId / appliedAt / finishedAt` 持久化
- 当前还额外提供 `pnpm verify:replace-ready:shadow` / `pnpm --filter @mud/server-next smoke:shadow`，用于**直连已部署的 `server-next` 实例**做最小实物验收：`/health`、GM 登录、`/gm/state`、`/gm/database/state`、`/gm/maps`、`/gm/editor-catalog`、`/gm/maps/:mapId/runtime`，以及真实 socket `n:c:hello` 最小 next 会话建立且不混入 legacy 事件

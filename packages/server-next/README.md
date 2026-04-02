# server-next

当前包先基于已验证可运行的 `dist` 代码回灌恢复源码基线，再继续向“可完整替换旧后端”推进。

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

- `pnpm --filter @mud/server-next verify`
- `pnpm --filter @mud/server-next verify:replace-ready`
- `pnpm --filter @mud/server-next verify:replace-ready:with-db`
- `pnpm --filter @mud/server-next compile`
- `pnpm --filter @mud/server-next smoke:shadow`
- `pnpm --filter @mud/server-next smoke:session`
- `pnpm --filter @mud/server-next smoke:legacy-auth`
- `pnpm --filter @mud/server-next smoke:combat`
- `pnpm --filter @mud/server-next smoke:monster-ai`
- `pnpm --filter @mud/server-next smoke:monster-skill`
- `pnpm --filter @mud/server-next smoke:player-respawn`
- `pnpm --filter @mud/server-next smoke:gm-database`

独立替换入口：

- 根脚本：
  - `pnpm dev:server-next`
  - `pnpm start:server-next`
  - `pnpm verify:server-next`
  - `pnpm verify:server-next:with-db`
  - `pnpm verify:server-next:shadow`
- 本地一键脚本：
  - Windows: `scripts\\server-next-verify.cmd`
  - Windows + DB: `scripts\\server-next-verify-with-db.cmd`
  - Windows + Shadow: `scripts\\server-next-verify-shadow.cmd`
  - Unix: `./scripts/server-next-verify.sh`
  - Unix + DB: `./scripts/server-next-verify-with-db.sh`
  - Unix + Shadow: `./scripts/server-next-verify-shadow.sh`
- 独立容器与部署文件：
  - Docker 镜像: [Dockerfile](/home/yuohira/mud-mmo/packages/server-next/Dockerfile)
  - 本地 compose: [docker-compose.server-next.yml](/home/yuohira/mud-mmo/docker-compose.server-next.yml)
  - 独立 stack: [docker-stack.server-next.yml](/home/yuohira/mud-mmo/docker-stack.server-next.yml)
  - 手工发布镜像 workflow: [.github/workflows/publish-server-next-image.yml](/home/yuohira/mud-mmo/.github/workflows/publish-server-next-image.yml)
  - 手工部署 shadow stack workflow: [.github/workflows/deploy-server-next.yml](/home/yuohira/mud-mmo/.github/workflows/deploy-server-next.yml)

当前部署约束：

- 这些 `server-next` 入口都是新增的独立路径，不会替换或修改旧后端当前的 compose、stack、自动部署工作流。
- `docker-stack.server-next.yml` 默认把 `server-next` 独立暴露在 `11923`，用于替换前 shadow 演练，不和旧后端 `11922` 端口冲突。
- `docker-stack.server-next.yml` 当前会同时部署独立的 `server-next/postgres/redis`，shadow 演练默认不接旧服现网库。
- compose / stack 默认额外挂载 `server_next_backup_data`，用于保存 `gm/database/*` 兼容备份文件，避免容器重建后本地备份丢失。

替换演练与回滚手册：

- 运行手册: [REPLACE-RUNBOOK.md](/home/yuohira/mud-mmo/packages/server-next/REPLACE-RUNBOOK.md)
- 默认一键验收 `pnpm verify:server-next` 会自动根据是否存在数据库环境，选择 `verify:replace-ready` 或 `verify:replace-ready:with-db`
- 手工发布与部署 workflow 现在会先执行 `pnpm verify:server-next`，通过后才继续构建镜像或部署 shadow stack
- 这些 workflow 的前置门禁现在覆盖正式 replace-ready 验证；部署后仍会额外执行一轮 `pnpm verify:server-next:shadow` 做实物验收，但这仍不等于带库 `persistence` 或 `gm/database/*` 闭环
- 当前独立带库环境下 `pnpm verify:server-next:with-db` 已可全绿通过，包含 `persistence` 闭环
- 当前独立带库环境下 `pnpm verify:server-next:with-db` 已包含 `gm/database` 自动回归：维护态护栏、损坏备份拒绝、restore 前自动 `pre_import` 检查点、重启后 `lastJob` 持久化
- 当前还额外提供 `pnpm verify:server-next:shadow` / `pnpm --filter @mud/server-next smoke:shadow`，用于**直连已部署的 `server-next` 实例**做最小实物验收：`/health`、GM 登录、`/gm/state` 和真实 socket `n:c:hello` 入图

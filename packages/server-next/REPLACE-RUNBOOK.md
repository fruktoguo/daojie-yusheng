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
- `SERVER_NEXT_GM_PASSWORD` 或 `GM_PASSWORD`
- `SERVER_NEXT_RUNTIME_TOKEN`

带库验收、ready 或 shadow stack 额外需要：

- `SERVER_NEXT_DATABASE_URL` 或 `DATABASE_URL`

按需：

- `SERVER_NEXT_GM_DATABASE_BACKUP_DIR` 或 `GM_DATABASE_BACKUP_DIR`

仅开发或无库烟测旁路：

- `SERVER_NEXT_ALLOW_UNREADY_TRAFFIC=1`
- `SERVER_NEXT_SMOKE_ALLOW_UNREADY=1`
- `SERVER_NEXT_RUNTIME_HTTP=1`

仅维护或恢复：

- `SERVER_NEXT_RUNTIME_MAINTENANCE=1`
- `RUNTIME_MAINTENANCE=1`
- `SERVER_NEXT_RUNTIME_RESTORE_ACTIVE=1`

## 本地替换前验收

无数据库环境：

1. 执行 `pnpm verify:server-next`
2. 确认 `session/runtime/progression/combat/loot/legacy-auth/monster/player-respawn` 全部通过
3. 确认 `/health` 在无库情况下返回 `503`，只有显式旁路时才允许 smoke 继续跑

独立带 PostgreSQL 的验证环境：

1. 配置 `SERVER_NEXT_DATABASE_URL` 或 `DATABASE_URL`
2. 执行 `pnpm verify:server-next`
3. 执行 `pnpm --filter @mud/server-next smoke:persistence`
4. 执行 `pnpm --filter @mud/server-next verify:with-db`
5. 执行 `pnpm --filter @mud/server-next verify:replace-ready:with-db`

验收重点：

- 旧认证 HTTP 兼容可用
- 旧 GM HTTP 兼容可用
- `s:attrUpdate` 继续按顶层字段增量下发，不回退到高频全量
- 断线留场与顶号重连正常
- readiness 未就绪时拒绝新 socket
- `gm/database/backup` -> 下载备份 -> `POST /gm/database/restore`（body: `{ "backupId": "..." }`）在独立带库环境下闭环通过
- 执行 `POST /gm/database/restore` 前必须先显式进入维护态（`SERVER_NEXT_RUNTIME_MAINTENANCE=1` 或 `RUNTIME_MAINTENANCE=1`）
- `gm/database/restore` 会先自动生成一份 `pre_import` 检查点备份，随后才覆盖 `persistent_documents`
- 损坏或被篡改的兼容备份会因为 `checksumSha256/documentsCount` 严格校验而被直接拒绝
- `gm/database/state` 在服务重启后仍能看到上一次任务结果；若重启打断 restore，状态会落成失败而不是静默丢失

## 本地 shadow 演练

使用本地独立 compose：

1. `docker compose -f docker-compose.server-next.yml up -d --build`
2. 访问 `http://127.0.0.1:11923/health`
3. 执行 `pnpm verify:server-next:with-db`
4. 如要确认当前 `11923` 容器实例本身而不是本地自启进程，额外执行 `SERVER_NEXT_SHADOW_URL=http://127.0.0.1:11923 pnpm verify:server-next:shadow`
5. 手动验证旧客户端登录、移动、战斗、邮件、市场、GM 管理
6. 调用 `POST /gm/database/backup`，从返回值或 `GET /gm/database/state` 记录 `backupId`
7. 先开启维护态，再调用 `POST /gm/database/restore`，body 传 `{ "backupId": "<上一步 backupId>" }`；确认自动生成了 `pre_import` 检查点备份，随后再确认 `/health`、`gm/database/state` 与重连后的运行态恢复正常
8. 确认备份文件写入 `SERVER_NEXT_GM_DATABASE_BACKUP_DIR` 对应卷
9. 演练完成后执行 `docker compose -f docker-compose.server-next.yml down`

## 远端 shadow stack 演练

手工发布镜像：

1. 触发 [.github/workflows/publish-server-next-image.yml](/home/yuohira/mud-mmo/.github/workflows/publish-server-next-image.yml)
2. 确认镜像已推到 `ghcr.io/<owner>/daojie-yusheng-server-next`

手工部署 shadow stack：

1. 确认 `DEPLOY_SSH_*`、`GHCR_*`、`PROD_DB_USERNAME/PROD_DB_PASSWORD/PROD_DB_DATABASE`、`PROD_*_TOKEN` 等 secrets 已配置；这里的 `PROD_DB_*` 只用于 shadow stack 自带 Postgres 初始化，不是外部生产库连接串
2. 触发 [.github/workflows/deploy-server-next.yml](/home/yuohira/mud-mmo/.github/workflows/deploy-server-next.yml)
3. 确认 stack 名为 `daojie-yusheng-server-next`
4. 确认 shadow 入口仍是 `11923`
5. 确认 `server_next_backup_data` 卷已挂载到 `/var/lib/server-next`
6. 先执行 `pnpm verify:server-next:shadow`，确认已部署的 `11923` 实例本身可通过 `/health`、GM 登录、`/gm/state` 与 socket 入图最小验收
7. 再在 shadow 环境执行 GM 与 restore 回归

## 观察指标

基础：

- `/health` 是否为 `200`
- readiness 详情是否显示 `ready=true`
- 进程启动后无 Nest 依赖注入错误
- socket 连接在未就绪时被拒绝，在就绪后可正常进入地图

运行态：

- 新号首登 `first:init:new`
- 断线重连 `second:init:resumed`
- 断线 15 秒后 runtime 仍存在，但 `sessionId=null`
- AOI 广播只覆盖视野内实体
- 属性同步保持增量字段，不出现每次 buff 变动整包全量

低频兼容：

- `auth/*` 旧 HTTP 返回兼容结构
- `gm/*` 旧 HTTP 返回兼容结构
- `gm/database/state` 状态与 restore 实际阶段一致
- `gm/database/state` 的 `lastJob.phase/checkpointBackupId/appliedAt` 与 restore 实际阶段一致
- 备份文件可在容器重建后继续保留，不依赖容器层临时文件系统
- GitHub publish/deploy workflow 当前已恢复为先跑 `pnpm verify:server-next`；虽然本地/独立带库入口已包含 `gm/database` 自动回归，但 workflow 里的带库回归仍需人工单独执行
- GitHub deploy workflow 现在会在 `docker stack deploy` 后额外跑一次 `pnpm verify:server-next:shadow`，验证对象是已部署的 `11923` 实例本身，而不是本地自启 smoke 进程

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

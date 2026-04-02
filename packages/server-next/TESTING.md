# server-next 验证

当前优先使用现有 smoke 与 benchmark 验证恢复后的源码基线：

- `pnpm verify:server-next`
- `pnpm --filter @mud/server-next verify:replace-ready`
- `pnpm --filter @mud/server-next smoke:session`
- `pnpm --filter @mud/server-next smoke:legacy-auth`
- `pnpm --filter @mud/server-next smoke:redeem-code`
- `pnpm --filter @mud/server-next smoke:combat`
- `pnpm --filter @mud/server-next smoke:monster-ai`
- `pnpm --filter @mud/server-next smoke:monster-skill`
- `pnpm --filter @mud/server-next smoke:player-respawn`

如果工作区里 `packages/shared` 有未完成改动，导致 `pnpm --filter @mud/server-next compile` 被共享包编译报错阻塞，可先用下面这条只验证 `server-next` 自身改动：

- `node node_modules/.pnpm/node_modules/typescript/bin/tsc -p packages/server-next/tsconfig.json`

涉及数据库时：

- `pnpm verify:server-next:with-db`
- `pnpm verify:server-next:shadow`
- `pnpm --filter @mud/server-next verify:with-db`
- `pnpm --filter @mud/server-next verify:replace-ready:with-db`
- `pnpm --filter @mud/server-next smoke:gm-database`
- `pnpm --filter @mud/server-next smoke:shadow`
- `scripts\\server-next-verify-with-db.cmd`
- `scripts\\server-next-verify-shadow.cmd`
- `./scripts/server-next-verify-with-db.sh`
- `./scripts/server-next-verify-shadow.sh`

本地一键入口：

- `scripts\\server-next-verify.cmd`
- `./scripts/server-next-verify.sh`
- `pnpm verify:server-next`

说明：

- `pnpm verify:server-next` / `scripts/server-next-verify.*` 会自动探测 `SERVER_NEXT_DATABASE_URL` 或 `DATABASE_URL`
- 有数据库时自动跑 `verify:replace-ready:with-db`
- 无数据库时自动跑 `verify:replace-ready`
- 这是当前推荐的单一替换验收入口
- 该入口现在会覆盖 `gm/database/backup|restore` 的自动化回归，但 GitHub workflow 仍不是带库验证证明
- 当前独立带库环境下 `pnpm verify:server-next:with-db` 已可全绿通过，包含 `persistence` 与 `gm/database` 闭环
- `pnpm verify:server-next:shadow` / `smoke:shadow` 不会自启本地 `server-next`，而是直接打 `SERVER_NEXT_SHADOW_URL` 或 `SERVER_NEXT_URL` 指向的已部署实例；当前默认验证 `/health`、GM 登录、`/gm/state` 和真实 socket 入图

旧 GM socket 兼容当前没有独立 smoke，用手动链路确认：

- `c:gmGetState` 可收到 `s:gmState`
- `c:gmUpdatePlayer` 可精确更新坐标、血量与自动战斗状态
- `c:gmSpawnBots` / `c:gmRemoveBots` 可正确维护 `botCount`
- `c:gmResetPlayer` 可把玩家送回出生点并恢复满血、关闭自动战斗

旧 GM HTTP / database 兼容当前采用手动回归：

- `POST /auth/gm/login` 可返回 GM access token
- `GET /gm/database/state` / `POST /gm/database/backup` / `GET /gm/database/backups/:backupId/download` 可正常返回
- `GET /gm/database/state` 在服务重启后仍能读到上一次任务结果；若上次任务在重启时中断，应显示失败
- `POST /gm/database/backup` 后应记录 `backupId`，`POST /gm/database/restore` 必须提交 `{ "backupId": "<id>" }`
- `POST /gm/database/restore` 现在必须先开启维护态（`SERVER_NEXT_RUNTIME_MAINTENANCE=1` 或 `RUNTIME_MAINTENANCE=1`），并会自动生成一份 `pre_import` 检查点备份
- 兼容备份现在会带 `documentsCount` / `checksumSha256`；损坏备份应被 restore 直接拒绝，而不是部分导入
- 无数据库环境下，`POST /gm/database/restore` 会显式返回 400，避免误报成功
- 无数据库环境下，`backup` 只会产出当前 `persistent_documents` 视图对应的兼容备份，不能替代带库闭环
- 如用容器演练，建议同时确认 `SERVER_NEXT_GM_DATABASE_BACKUP_DIR` 已挂到独立卷，避免备份文件随容器销毁

独立部署演练：

- 本地容器演练使用 [docker-compose.server-next.yml](/home/yuohira/mud-mmo/docker-compose.server-next.yml)
- shadow stack 演练使用 [docker-stack.server-next.yml](/home/yuohira/mud-mmo/docker-stack.server-next.yml)
- GitHub 手工镜像发布使用 [.github/workflows/publish-server-next-image.yml](/home/yuohira/mud-mmo/.github/workflows/publish-server-next-image.yml)
- GitHub 手工 shadow 部署使用 [.github/workflows/deploy-server-next.yml](/home/yuohira/mud-mmo/.github/workflows/deploy-server-next.yml)
- 完整替换演练、回滚步骤与观察点见 [REPLACE-RUNBOOK.md](/home/yuohira/mud-mmo/packages/server-next/REPLACE-RUNBOOK.md)
- 当前 publish/deploy workflow 已恢复为先跑 `pnpm verify:server-next`，shadow stack 也自带独立 `postgres/redis`；带库验证仍需人工单独执行
- `Deploy Server Next` workflow 现在会在 `docker stack deploy` 后追加一轮 `pnpm verify:server-next:shadow`，用于确认 `11923` 上的已部署实例本身可访问、可登录 GM、可完成基础入图

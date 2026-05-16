# 发布前自检（腾讯云 CCR + Docker Swarm）

本次准备推送镜像 / 触发发布。按下序执行，不要跳步。

## 1. 验证门禁

- `pnpm verify:release`（标准发布验证）
- 涉及持久化：`pnpm verify:release:with-db`
- 涉及发布链路结构 / 部署基线变更：`pnpm verify:release:full` + `pnpm verify:deploy-baseline`
- 任一失败即停止，不要"先推上去看看"。

## 2. 本地镜像构建（不推送）

```bash
docker build -t daojie-local/daojie-yusheng-server -f packages/server/Dockerfile .
docker build -t daojie-local/daojie-yusheng-client -f packages/client/Dockerfile .
```

## 3. 本地 stack 验证

```bash
TENCENT_IMAGE_PREFIX=daojie-local \
DB_PASSWORD=dev123 \
SERVER_PLAYER_TOKEN_SECRET=dev-secret \
GM_PASSWORD=dev-gm \
SERVER_CORS_ORIGINS=http://localhost:11921 \
docker stack deploy -c docker-stack.tencent.yml daojie-yusheng
```

健康检查：

- `docker stack services daojie-yusheng`
- `docker service logs daojie-yusheng_server -f`
- 客户端入口：`http://localhost:11921`
- 后端健康检查：`http://localhost:11922`

通过后清理：

```bash
docker stack rm daojie-yusheng
```

## 4. 推送 CCR

**先推 latest，等线上自动更新后目检通过，再推 prod**：

```bash
docker login ccr.ccs.tencentyun.com
TENCENT_IMAGE_PREFIX=<执行时我会给你> ./docker-build-latest.sh
# 等待生产服务器 daojie-ccr-auto-update.timer 拉取（≤ 60s），目检无问题后：
TENCENT_IMAGE_PREFIX=<执行时我会给你> ./docker-build-prod.sh
```

## 必须确认才推送

- 本地镜像 stack 已通过完整启动 + 关键路径目检（登录、进图、移动、战斗、邮件 / 市场最小回路）。
- `pnpm verify:release` 已通过；持久化改动加跑 `verify:release:with-db`。
- 不携带未经镜像验证的改动。
- 不存在尚未 commit 的本地改动会被打进镜像（`git status` 干净）。

## 不允许

- 不要直接调用 `docker-build-prod.sh` 跳过 latest 验证。
- 不要 SSH 到生产服务器手动 `docker service update` / `docker stack deploy` 覆盖；**让 `daojie-ccr-auto-update.timer` 走自动更新**。
- 没有我明确要求，不要修改 `docker-stack.tencent.yml` / `deploy-*.sh` / 自动更新器配置。
- 不要 push 镜像到非 CCR 的目标（公网泄漏风险）。

## 输出要求

每一步给出命令 + 退出码 + 关键日志摘要；失败立刻停下来报告，不要继续推进；推送结束后告诉我 latest / prod 各自镜像的 digest 与等待自动更新的预计时间。

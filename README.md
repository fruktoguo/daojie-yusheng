# 道劫余生

道劫余生是一个 Web MMO MUD 项目，采用服务端权威架构，提供多人在线地图探索、角色成长、战斗、物品、市场、邮件、GM 运维和内容配置链路。

## 游戏玩法

游戏核心是 MMO、半即时回合制、挂机修仙与高自由度地图探索的结合。玩家在同一个在线世界中修炼、移动、战斗、采集、交易和经营角色成长；服务端按固定 tick 推进世界，玩家可以在一息内连续提交操作意图，战斗和行动由服务端统一结算。

整体体验偏小说感修仙 MUD：境界突破、功法养成、装备强化、丹药资源、地图探索和长期挂机收益共同构成成长线。地图采用类 CDDA 的格子世界表达，强调可探索、可交互和可破坏的地形结构，后续玩法可以围绕多地图、多实例、资源刷新、环境变化和玩家行为痕迹持续扩展。

PVE 和 PVP 默认分离设计。PVE 侧重野外探索、怪物战斗、资源采集、任务与成长循环；PVP 侧重可控入口、明确规则和风险边界，避免把普通挂机和探索体验直接暴露在无约束冲突里。

## 技术栈

- 前端：Vite、TypeScript、Canvas 2D、DOM UI、React 渐进式 UI
- 服务端：NestJS、Socket.IO、TypeScript
- 数据库：PostgreSQL
- 在线态与缓存：Redis
- 工作区：pnpm workspace

## 目录结构

```text
packages/
  client/          游戏客户端
  shared/          前后端共享类型、协议与常量
  server/          游戏服务端、运行时、持久化与运维工具
  config-editor/   配置编辑器与内容生产工具
docs/              设计、验证、审计与运维文档
scripts/           构建、生成、验证与辅助脚本
```

## 本地开发

安装依赖：

```bash
pnpm install
```

启动本地开发环境：

```bash
./start.sh
```

分别启动客户端或服务端：

```bash
pnpm dev:client
pnpm dev:server
```

## 构建

```bash
pnpm build
pnpm build:client
pnpm build:server
pnpm build:shared
pnpm build:config-editor
```

## 生产部署

当前项目提供两种生产部署方式。简单稳定优先选第一种；需要完整 CI/CD、按 commit 自动构建和发布时使用第二种。

### 方式一：腾讯云 CCR 公有镜像 + Docker Swarm

这是最简单的服务器部署方式：服务器不需要源码构建，也不需要 `pnpm install`。它只需要 Docker、`docker-stack.tencent.yml`、环境变量和持久化数据卷，然后直接从腾讯云 CCR 拉镜像运行。

当前公有镜像：

```text
ccr.ccs.tencentyun.com/yuohira/daojie-yusheng-client:latest
ccr.ccs.tencentyun.com/yuohira/daojie-yusheng-server:latest
```

部署内容：

- `client`：Nginx 托管前端静态资源，并反代 `/api/*`、`/socket.io`
- `server`：Node.js 后端，容器内监听 `13001`
- `postgres`：PostgreSQL 16
- `redis`：Redis 7

默认端口：

- `11921`：前端入口
- `11922`：后端健康检查和 API 直连入口

首次部署：

```bash
# 服务器只需要拿到部署文件，不需要在服务器构建镜像。
# 如果已经 clone 了仓库，直接进入仓库根目录即可。
git clone https://github.com/fruktoguo/mud-mmo-next.git
cd mud-mmo-next

docker swarm init
bash scripts/tencent-swarm-volumes.sh

cat > prod.env <<'EOF'
TENCENT_IMAGE_PREFIX=ccr.ccs.tencentyun.com/yuohira
CLIENT_IMAGE_TAG=latest
SERVER_IMAGE_TAG=latest

DB_USERNAME=mud
DB_PASSWORD=换成强密码
DB_DATABASE=daojie_yusheng

SERVER_PLAYER_TOKEN_SECRET=换成长随机密钥
GM_PASSWORD=换成GM强密码
SERVER_CORS_ORIGINS=https://你的域名
EOF

chmod 600 prod.env
set -a
. ./prod.env
set +a

docker stack deploy --with-registry-auth -c docker-stack.tencent.yml daojie-yusheng
```

检查状态：

```bash
docker stack services daojie-yusheng
docker service logs daojie-yusheng_server -f

curl http://127.0.0.1:11922/health
curl http://127.0.0.1:11921/
```

首次空库建议执行一次数据库预检和建表补齐：

```bash
container_id="$(docker ps \
  --filter label=com.docker.swarm.service.name=daojie-yusheng_server \
  --format '{{.ID}}' | head -n 1)"

docker exec "$container_id" node dist/tools/deploy-database-preflight.js --ensure-current-schema
```

更新镜像后重新部署：

```bash
set -a
. ./prod.env
set +a

docker stack deploy --with-registry-auth -c docker-stack.tencent.yml daojie-yusheng
```

回滚：

```bash
docker service rollback daojie-yusheng_client
docker service rollback daojie-yusheng_server
```

如果需要自己构建并推送腾讯云镜像：

```bash
docker login ccr.ccs.tencentyun.com

TENCENT_IMAGE_PREFIX=ccr.ccs.tencentyun.com/yuohira \
  ./docker-build-tencent.sh latest
```

### 方式二：GitHub Actions + GHCR 自动部署

这是当前保留的自动化主线：推送到 `main` 后，GitHub Actions 会验证、构建 client/server 镜像，推送到 GHCR，然后通过 Docker Swarm 更新生产 stack。

自动部署链路：

```text
git push main
-> .github/workflows/deploy.yml
-> 构建 ghcr.io/fruktoguo/daojie-yusheng-client:sha-<commit>
-> 构建 ghcr.io/fruktoguo/daojie-yusheng-server:sha-<commit>
-> docker stack deploy -c docker-stack.yml daojie-yusheng
-> 生产路由健康检查
```

需要在 GitHub 仓库配置的生产 Secrets：

```text
DEPLOY_SSH_HOST
DEPLOY_SSH_PORT
DEPLOY_SSH_USER
DEPLOY_SSH_KEY
GHCR_USERNAME
GHCR_PAT
PROD_DB_USERNAME
PROD_DB_PASSWORD
PROD_DB_DATABASE
PROD_JWT_SECRET
PROD_GM_PASSWORD
```

手动发布固定 `prod` 标签：

```text
Actions -> Publish Prod Image
```

手动部署指定镜像标签：

```text
Actions -> Deploy Prod Stack
```

这条链路适合正式团队协作和可追踪发布；腾讯云 CCR 方式适合服务器直接拉公有镜像、快速部署和备用发布链。

## 验证

```bash
pnpm verify:replace-ready:doctor
pnpm verify:replace-ready
pnpm verify:replace-ready:with-db
pnpm verify:replace-ready:shadow
pnpm verify:replace-ready:acceptance
pnpm verify:replace-ready:full
pnpm audit:protocol
pnpm audit:boundaries
```

## 文档

- [验证与验收](./docs/next-plan/09-verification-and-acceptance.md)
- [协议审计](./docs/protocol-audit.md)
- [腾讯云 CCR + Docker Swarm 部署](./docs/deploy-tencent-ccr.md)
- [教程机制](./docs/tutorial-mechanics.md)
- [服务端说明](./packages/server/README.md)

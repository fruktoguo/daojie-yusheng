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

服务器不需要源码、不需要 `pnpm install`。一键脚本会把部署文件保存到 `/opt/daojie-yusheng`，并使用 Docker Swarm 运行生产 stack。

**一键部署**：

```bash
tmp="$(mktemp /tmp/daojie-deploy.XXXXXX.sh)" && curl -fsSL https://raw.githubusercontent.com/fruktoguo/daojie-yusheng/main/deploy.sh -o "$tmp" && sudo bash "$tmp"
```

脚本会自动完成：安装 Docker → 初始化 Swarm → 创建数据卷 → 交互式配置密码与 GM token/密钥管理 secret → 部署全套服务 → 建表 → 启动 Watchtower 自动更新。公开镜像仓库不需要登录；如果检测到已有 Docker 登录信息，脚本会同步给 Watchtower 用于私有镜像自动更新。

部署内容：

- `client`：Nginx 托管前端静态资源，并反代 `/api/*`、`/socket.io`
- `server`：Node.js 后端，容器内监听 `13001`
- `postgres`：PostgreSQL 16
- `redis`：Redis 7
- `backup-worker`：数据库定时备份
- `watchtower`：每 60 秒检查镜像更新并自动部署

默认端口：

- `11921`：前端入口
- `11922`：后端健康检查和 API 直连入口

**日常更新流程**：

```bash
# 本地构建并推送镜像
docker login ccr.ccs.tencentyun.com
TENCENT_IMAGE_PREFIX=你的镜像前缀 ./docker-build-tencent.sh latest
# 推送后 60 秒内服务器自动拉取更新，无需 SSH
```

**手动管理**：

```bash
# 检查状态
docker stack services daojie-yusheng

# 查看日志
docker service logs daojie-yusheng_server -f

# 回滚
docker service rollback daojie-yusheng_server

# 重新部署（在服务器上）
bash /opt/daojie-yusheng/deploy.sh
```

## 验证

```bash
pnpm verify:release:doctor
pnpm verify:release
pnpm verify:release:with-db
pnpm verify:release:acceptance
pnpm verify:release:full
pnpm audit:protocol
pnpm audit:boundaries
```

## 文档

- [验证与验收](./docs/archive/09-verification-and-acceptance.md)
- [协议审计](./docs/archive/protocol-audit.md)
- [腾讯云 CCR + Docker Swarm 部署](./docs/deploy-tencent-ccr.md)
- [教程机制](./docs/tutorial-mechanics.md)
- [服务端说明](./packages/server/README.md)

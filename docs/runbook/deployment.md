# 部署手册

## 概述

本文档描述生产环境部署流程，包括首次部署、更新和回滚。

## 部署架构

```
┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Nginx     │ :11921
│  (静态站点)  │     │  (反向代理)  │
└─────────────┘     └──────┬──────┘
                          │
                          ▼
┌─────────────┐     ┌─────────────┐
│   Server    │◀────│  Socket.IO  │ :11922
│  (NestJS)   │     │   /api/*    │
└──────┬──────┘     └─────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│ PostgreSQL  │     │    Redis    │
│   :5432     │     │    :6379    │
└─────────────┘     └─────────────┘
```

## 前置条件

- [ ] Docker 和 Docker Swarm 已安装
- [ ] 已登录镜像仓库（腾讯云 CCR 或 GHCR）
- [ ] 环境变量已配置
- [ ] 数据卷已创建

## 首次部署

生产服务器可以直接执行一键脚本。脚本会把配置和生成的 stack 文件保存在 `/opt/daojie-yusheng`：

```bash
tmp="$(mktemp /tmp/daojie-deploy.XXXXXX.sh)" && curl -fsSL https://raw.githubusercontent.com/fruktoguo/daojie-yusheng/main/deploy.sh -o "$tmp" && sudo bash "$tmp"
```

下面的手动步骤用于排障、自定义部署或不用一键脚本的场景。

### 1. 初始化 Swarm

```bash
docker swarm init
```

### 2. 登录镜像仓库

```bash
# 腾讯云 CCR
docker login ccr.ccs.tencentyun.com

# 或 GitHub Container Registry
docker login ghcr.io
```

### 3. 创建数据卷

```bash
bash scripts/tencent-swarm-volumes.sh
```

### 4. 配置环境变量

```bash
export TENCENT_IMAGE_PREFIX=ccr.ccs.tencentyun.com/你的命名空间
export CLIENT_IMAGE_TAG=latest
export SERVER_IMAGE_TAG=latest
export DB_USERNAME=mud
export DB_PASSWORD='强密码'
export DB_DATABASE=daojie_yusheng
export SERVER_PLAYER_TOKEN_SECRET='长随机密钥'
export GM_PASSWORD='GM强密码'
export SERVER_CORS_ORIGINS='https://你的域名'
```

### 5. 部署 Stack

```bash
docker stack deploy --with-registry-auth -c docker-stack.tencent.yml daojie-yusheng
```

### 6. 验证部署

```bash
# 检查服务状态
docker stack services daojie-yusheng

# 健康检查
curl http://127.0.0.1:11922/health
curl http://127.0.0.1:11921/
```

**预期输出**：
- 所有服务 REPLICAS 显示 1/1
- health 接口返回 200

## 更新部署

### 构建并推送镜像

```bash
# 完整构建
TENCENT_IMAGE_PREFIX=ccr.ccs.tencentyun.com/你的命名空间 \
  ./docker-build-tencent.sh latest

# 只构建服务端
TENCENT_IMAGE_PREFIX=ccr.ccs.tencentyun.com/你的命名空间 \
  ./docker-build-tencent.sh latest --server-only
```

### 更新 Stack

```bash
docker stack deploy --with-registry-auth -c docker-stack.tencent.yml daojie-yusheng
```

### 只更新单个服务

```bash
# 更新服务端
docker service update --with-registry-auth \
  --image "$TENCENT_IMAGE_PREFIX/daojie-yusheng-server:$SERVER_IMAGE_TAG" \
  daojie-yusheng_server

# 更新客户端
docker service update --with-registry-auth \
  --image "$TENCENT_IMAGE_PREFIX/daojie-yusheng-client:$CLIENT_IMAGE_TAG" \
  daojie-yusheng_client
```

## 回滚

### 服务回滚

```bash
# 回滚服务端
docker service rollback daojie-yusheng_server

# 回滚客户端
docker service rollback daojie-yusheng_client
```

### 验证回滚

```bash
# 检查服务状态
docker stack services daojie-yusheng

# 查看日志确认版本
docker service logs daojie-yusheng_server -f --tail 50
```

## 查看日志

```bash
# 服务端日志
docker service logs daojie-yusheng_server -f

# 客户端日志
docker service logs daojie-yusheng_client -f

# 数据库日志
docker service logs daojie-yusheng_postgres -f
```

## 常见问题

### Q: 服务启动失败？

```bash
# 查看详细状态
docker service ps daojie-yusheng_server --no-trunc

# 检查容器日志
docker service logs daojie-yusheng_server --tail 100
```

常见原因：
- 环境变量未设置
- 数据库连接失败
- 镜像拉取失败

### Q: 数据库连接失败？

检查：
- `DB_USERNAME`、`DB_PASSWORD`、`DB_DATABASE` 是否正确
- PostgreSQL 服务是否运行
- 网络是否连通

### Q: 健康检查失败？

```bash
# 进入容器检查
docker exec -it $(docker ps -q -f name=daojie-yusheng_server) sh
curl localhost:13001/health
```

## 相关文档

- [腾讯云部署详细说明](../deploy-tencent-ccr.md)
- [服务端环境变量](../config/server-env.md)

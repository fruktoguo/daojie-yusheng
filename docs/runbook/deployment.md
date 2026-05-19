# 部署手册

解决首次部署、版本更新、回滚和自动更新器问题。

## 部署架构

```
Client ──▶ Nginx(:11921) ──▶ Server(NestJS, :11922) ──▶ PostgreSQL / Redis
```

## 一键部署

前置条件：Ubuntu/Debian、root 权限、11921/11922 端口可用。

```bash
# latest 环境
scp deploy-latest.sh root@服务器:/tmp/deploy-latest.sh
ssh root@服务器 'bash /tmp/deploy-latest.sh'

# prod 环境
scp deploy-prod.sh root@服务器:/tmp/deploy-prod.sh
ssh root@服务器 'bash /tmp/deploy-prod.sh'
```

脚本自动处理：Docker/Swarm 初始化、数据卷、密钥生成、CCR 自动更新器安装。

私有镜像仓库需先 `sudo docker login <registry>`。

## 手动部署（排障或自定义场景）

```bash
# 1. 初始化 Swarm
docker swarm init

# 2. 登录镜像仓库
docker login ccr.ccs.tencentyun.com

# 3. 创建数据卷
bash scripts/tencent-swarm-volumes.sh

# 4. 配置环境变量（见 docs/config/server-env.md）
export TENCENT_IMAGE_PREFIX=ccr.ccs.tencentyun.com/你的命名空间
export CLIENT_IMAGE_TAG=latest
export SERVER_IMAGE_TAG=latest
export DB_USERNAME=mud
export DB_PASSWORD='强密码'
export DB_DATABASE=daojie_yusheng
export SERVER_PLAYER_TOKEN_SECRET='长随机密钥'
export SERVER_GM_AUTH_SECRET='长随机密钥'
export SERVER_SECRET_ENCRYPTION_KEY='长随机密钥'
export GM_PASSWORD='GM强密码'
export SERVER_CORS_ORIGINS='https://你的域名'

# 5. 部署
docker stack deploy --with-registry-auth --prune -c docker-stack.tencent.yml daojie-yusheng

# 6. 验证
docker stack services daojie-yusheng   # 所有服务 1/1
curl http://127.0.0.1:11922/health     # 返回 200
```

## 更新部署

### 构建并推送镜像

```bash
TENCENT_IMAGE_PREFIX=ccr.ccs.tencentyun.com/你的命名空间 ./docker-build-latest.sh
TENCENT_IMAGE_PREFIX=ccr.ccs.tencentyun.com/你的命名空间 ./docker-build-prod.sh
# 只构建服务端加 --server-only
```

### 自动更新器

一键部署默认安装 CCR 自动更新器，每 60 秒检查镜像变化并自动更新服务。

```bash
# 检查状态
systemctl status daojie-ccr-auto-update.timer
journalctl -u daojie-ccr-auto-update.service -n 80 --no-pager
cat /opt/daojie-yusheng/ccr-auto-update.state
```

### 手动更新单个服务

```bash
docker service update --with-registry-auth \
  --image "$TENCENT_IMAGE_PREFIX/daojie-yusheng-server:$SERVER_IMAGE_TAG" \
  daojie-yusheng_server
```

## 回滚

```bash
docker service rollback daojie-yusheng_server
docker service rollback daojie-yusheng_client

# 验证
docker stack services daojie-yusheng
docker service logs daojie-yusheng_server -f --tail 50
```

## 故障排查

| 症状 | 检查 |
|------|------|
| 服务启动失败 | `docker service ps daojie-yusheng_server --no-trunc` |
| 数据库连接失败 | 检查 DB_USERNAME/DB_PASSWORD/DB_DATABASE 和 PG 服务状态 |
| 健康检查失败 | `docker exec -it $(docker ps -q -f name=daojie-yusheng_server) sh` 后 `curl localhost:13001/health` |
| 自动更新器不工作 | 检查 timer 状态和 journal 日志 |

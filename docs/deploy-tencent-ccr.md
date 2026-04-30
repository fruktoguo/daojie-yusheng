# 腾讯云 CCR + Docker Swarm 部署

这套文件是现有 GitHub/GHCR 自动部署的并行方案，不替换 `.github/workflows/*`，也不修改默认 `docker-stack.yml`。

## 它部署什么

`docker-stack.tencent.yml` 部署当前生产主线的四个服务：

- `client`：使用 `packages/client/Dockerfile` 构建出来的 Nginx 静态站点，同时反代 `/api/*`、`/socket.io`
- `server`：使用 `packages/server/Dockerfile` 构建出来的 Node.js 服务，监听容器内 `13001`
- `postgres`：PostgreSQL 16
- `redis`：Redis 7

默认对外端口保持和现有正式部署一致：

- `11921` -> client `80`
- `11922` -> server `13001`

## push 到腾讯云包含什么

`docker-build-tencent.sh` 推送的是 Docker 镜像，不是 Git 源代码。

- `daojie-yusheng-client`：前端构建后的 `packages/client/dist`、Nginx 与 Nginx 配置
- `daojie-yusheng-server`：后端编译后的 `packages/server/dist`、生产运行依赖、shared dist、server data 与运行所需文件

源代码仍在 GitHub 和本地仓库里。腾讯云 CCR 只保存构建后的可运行镜像。

## 构建并推送镜像

先登录腾讯云 CCR：

```bash
docker login ccr.ccs.tencentyun.com
```

然后构建并推送：

```bash
TENCENT_IMAGE_PREFIX=ccr.ccs.tencentyun.com/你的命名空间 \
  ./docker-build-tencent.sh latest
```

只推后端：

```bash
TENCENT_IMAGE_PREFIX=ccr.ccs.tencentyun.com/你的命名空间 \
  ./docker-build-tencent.sh latest --server-only
```

如果不设置 `TENCENT_IMAGE_PREFIX`，脚本默认使用 `ccr.ccs.tencentyun.com/tcb-100001011660-qtgo`。

## 首次服务器初始化

首次部署前，生产机需要有 Docker Swarm：

```bash
docker swarm init
```

登录腾讯云 CCR：

```bash
docker login ccr.ccs.tencentyun.com
```

创建外部数据卷：

```bash
bash scripts/tencent-swarm-volumes.sh
```

这些卷保存 PostgreSQL、Redis 和 GM 数据库备份目录。它们是 `external: true`，所以必须提前存在。

## 部署 stack

在服务器或能连接服务器 Docker context 的机器上设置环境变量：

```bash
export TENCENT_IMAGE_PREFIX=ccr.ccs.tencentyun.com/你的命名空间
export CLIENT_IMAGE_TAG=latest
export SERVER_IMAGE_TAG=latest
export DB_USERNAME=mud
export DB_PASSWORD='换成强密码'
export DB_DATABASE=daojie_yusheng
export SERVER_PLAYER_TOKEN_SECRET='换成长随机密钥'
export GM_PASSWORD='换成GM强密码'
export SERVER_CORS_ORIGINS='https://你的域名'
```

部署：

```bash
docker stack deploy --with-registry-auth -c docker-stack.tencent.yml daojie-yusheng-tencent
```

如果要让腾讯云方案接管当前正式 stack 名，也可以把最后的 stack 名改成 `daojie-yusheng`。不要在同一台机器上同时跑两个占用 `11921/11922` 的 stack。

## 查看状态

```bash
docker stack services daojie-yusheng-tencent
docker service logs daojie-yusheng-tencent_server -f
docker service logs daojie-yusheng-tencent_client -f
```

健康检查：

```bash
curl http://127.0.0.1:11922/health
curl http://127.0.0.1:11921/
```

## 更新

重新构建并推送：

```bash
TENCENT_IMAGE_PREFIX=ccr.ccs.tencentyun.com/你的命名空间 \
  ./docker-build-tencent.sh latest
```

然后重新部署 stack：

```bash
docker stack deploy --with-registry-auth -c docker-stack.tencent.yml daojie-yusheng-tencent
```

也可以只更新单个服务：

```bash
docker service update --with-registry-auth \
  --image "$TENCENT_IMAGE_PREFIX/daojie-yusheng-server:$SERVER_IMAGE_TAG" \
  daojie-yusheng-tencent_server
```

## 回滚

```bash
docker service rollback daojie-yusheng-tencent_server
docker service rollback daojie-yusheng-tencent_client
```

## 和现有 GitHub 部署的关系

现有 GitHub Actions 仍然走 GHCR：

- `.github/workflows/deploy.yml`
- `.github/workflows/publish-prod-image.yml`
- `.github/workflows/deploy-prod-stack.yml`

新增腾讯云方案只多了一条手动/自管链路：

```text
本地或 CI 构建镜像 -> push 腾讯云 CCR -> docker stack deploy docker-stack.tencent.yml
```

如果以后要把 GitHub Actions 也改成自动推腾讯云 CCR，可以在现有 workflow 旁边新增一个 Tencent publish workflow；当前改动没有接管 GitHub 自动部署。

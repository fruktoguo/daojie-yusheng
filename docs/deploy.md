# 自动部署说明

本项目使用与 `jiuzhou` 同路线的发布机制：

- GitHub Actions 自动构建并推送镜像到 GHCR
- Docker Swarm 负责滚动更新
- `start-first + healthcheck + rollback` 提供近零停机更新
- 服务端通过 Nest shutdown hooks 做优雅停机

当前默认对外端口规划：

- 前端发布端口：`11921`
- 后端发布端口：`11922`

这两个端口适合交给现有 Caddy 做反向代理，避免直接占用服务器的 `80/443`。

## 发布链路

1. 推送代码到 `main`
2. GitHub Actions 构建：
   - `ghcr.io/fruktoguo/daojie-yusheng-server`
   - `ghcr.io/fruktoguo/daojie-yusheng-client`
3. Actions 通过 SSH 连接生产服务器上的 Docker Swarm manager
4. Actions 执行 `docker stack deploy`
5. Swarm 先启动新任务，健康检查通过后再摘除旧任务
6. 若新任务启动失败，Swarm 自动回滚

## 一次性服务器准备

服务器需要：

- Docker Engine
- Docker Swarm manager
- 一个可被 GitHub Actions SSH 登录的部署用户

初始化示例：

```bash
docker swarm init
```

如部署用户不是 `root`，需要确保它能操作 Docker。

## GitHub Secrets

工作流依赖以下仓库 Secrets：

- `DEPLOY_SSH_HOST`: Swarm manager 主机
- `DEPLOY_SSH_PORT`: SSH 端口，通常为 `22`
- `DEPLOY_SSH_USER`: SSH 用户
- `DEPLOY_SSH_KEY`: 私钥内容
- `GHCR_USERNAME`: GHCR 用户名
- `GHCR_PAT`: 用于部署拉镜像的 GitHub PAT，至少包含 `read:packages`
- `PROD_DB_USERNAME`: 生产数据库用户名
- `PROD_DB_PASSWORD`: 生产数据库密码
- `PROD_DB_DATABASE`: 生产数据库名
- `PROD_JWT_SECRET`: 生产 JWT 密钥

说明：

- 构建推镜像使用 GitHub Actions 自带 `GITHUB_TOKEN`
- 部署阶段单独使用 `GHCR_PAT`，避免把短期 token 写入 Swarm 服务规格

## 关键文件

- [docker-stack.yml](../docker-stack.yml)
- [.github/workflows/deploy.yml](../.github/workflows/deploy.yml)
- [packages/server/src/main.ts](../packages/server/src/main.ts)
- [packages/server/src/health.controller.ts](../packages/server/src/health.controller.ts)

## Caddy 转发示例

如果你已有宿主机上的 Caddy，可将域名转发到这两个发布端口：

```caddyfile
daojie.yuohira.com {
  reverse_proxy /auth* 127.0.0.1:11922
  reverse_proxy /socket.io* 127.0.0.1:11922
  reverse_proxy 127.0.0.1:11921
}
```

说明：

- 前端静态站点由 `11921` 提供
- 后端 API 与 Socket.IO 由 `11922` 提供
- Caddy 负责对外暴露 `80/443` 与自动 HTTPS

## 更新行为

服务端与客户端都使用：

- `update_config.order: start-first`
- `failure_action: rollback`
- 健康检查

服务端额外使用：

- `stop_grace_period: 30s`

这样在新版本容器健康前，旧版本不会先退出；而旧版本收到停止信号后，会先走 Nest 的优雅停机流程。

## 回滚

Swarm 在更新失败时会自动回滚。

也可以手动执行：

```bash
docker service rollback daojie-yusheng_server
docker service rollback daojie-yusheng_client
```

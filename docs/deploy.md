# 自动部署说明

本页说明测试服自动部署与正式版镜像发布的分流方式：

- GitHub Actions 自动构建并推送镜像到 GHCR
- `push main` 会自动更新测试服务器
- 手动运行 `Publish Prod Image` 才会额外生成正式服使用的 `prod` 标签镜像
- 正式服务器应改为拉取 `prod`，而不是 `latest`
- Docker Swarm 负责滚动更新
- `start-first + healthcheck + rollback` 提供近零停机更新
- 服务端通过 Nest shutdown hooks 做优雅停机
- 健康检查统一使用 `127.0.0.1`，避免容器内 `localhost` 命中 IPv6 回环导致误判不健康
- 客户端 Socket.IO 使用 `websocket` 单传输，避免在反向代理和滚动更新期间因 long-polling 缺少 sticky session 而触发 `400 Session ID unknown`

当前默认对外端口规划：

- 前端发布端口：`11921`
- 后端发布端口：`11922`

这两个端口适合交给现有 Caddy 做反向代理，避免直接占用服务器的 `80/443`。

## 测试服发布链路

1. 推送代码到 `main`
2. GitHub Actions 构建：
   - `ghcr.io/fruktoguo/daojie-yusheng-server`
   - `ghcr.io/fruktoguo/daojie-yusheng-client`
3. 镜像会被打上 `latest` 与 `sha-提交号`
4. Actions 通过 SSH 连接测试服务器上的 Docker Swarm manager
5. Actions 执行 `docker stack deploy`
6. Swarm 先启动新任务，健康检查通过后再摘除旧任务
7. 若新任务启动失败，Swarm 自动回滚

触发规则：

- `push main` 会自动构建并部署测试服务器
- 在 GitHub 网页上手动运行 `Build And Deploy` 时，也会重新部署测试服务器
- 本地提交不会触发部署
- 推送到其他分支不会触发这条工作流
- 一次 push 即使包含多个本地提交，也只会触发一次测试镜像构建与部署
- 如果短时间内连续 push 多次，就会连续触发多次测试镜像构建与部署

## 正式版镜像发布链路

1. 先把准备发布的代码推到 `main`
2. 在测试服务器确认这版没问题
3. 打开 GitHub 仓库的 `Actions`
4. 选择 `Publish Prod Image`
5. 点击右上的 `Run workflow`
6. 分支保持为 `main`
7. 再点一次 `Run workflow`
8. GitHub Actions 重新构建前后端镜像，并打上 `prod` 与 `prod-sha-提交号`

触发规则：

- 只有手动运行 `Publish Prod Image` 时，才会生成 `prod`
- 日常 `push main` 不会覆盖 `prod`
- 正式服务器如果拉的是 `prod`，就只会在你手动发布后才更新

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
  reverse_proxy /account* 127.0.0.1:11922
  reverse_proxy /gm* 127.0.0.1:11922
  reverse_proxy /integrations* 127.0.0.1:11922
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

## 日常使用

日常开发：

1. 正常提交并 `push main`
2. 等待 GitHub Actions 自动完成测试镜像构建与测试服部署
3. 如需重跑测试服部署，可在 GitHub Actions 页面手动运行 `Build And Deploy`

正式发布：

1. 先确认测试服已经验证通过
2. 打开 GitHub 仓库的 `Actions`
3. 进入 `Publish Prod Image`
4. 点击 `Run workflow`
5. 保持分支为 `main` 并执行
6. 等待镜像推送完成
7. 通知 Faith 继续使用或拉取 `ghcr.io/fruktoguo/daojie-yusheng-server:prod`

## 回滚

Swarm 在更新失败时会自动回滚。

也可以手动执行：

```bash
docker service rollback daojie-yusheng_server
docker service rollback daojie-yusheng_client
```

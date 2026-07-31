# 服务端进程监督与自动恢复

## 目标与边界

本方案用于正式服 API 或 worker 的 Node.js 主进程异常退出、启动卡死或事件循环失去响应时自动恢复。它随服务端镜像发布，不修改以下部署契约：

- `packages/server/Dockerfile` 仍执行 `node dist/main.js`。
- `docker-stack.tencent.yml`、端口映射、反向代理和 service 数量不变。
- `SERVER_RUNTIME_ROLE=api/worker` 的职责不变。
- 权威 runtime、Socket.IO、持久化和 worker 仍运行在原 Nest 应用中。

源码入口是 `packages/server/src/main.ts`，镜像执行的是 TypeScript 编译产物 `packages/server/dist/main.js`。`dist/main.js` 不是另一份手写源码。

## 运行结构

```text
容器 PID 1: dist/main.js 轻量监督器
  └─ Nest 子进程: dist/main.js + SERVER_PROCESS_SUPERVISOR_CHILD=1
       ├─ api: HTTP / Socket.IO / 权威 runtime
       └─ worker: flush / outbox / backup / maintenance
```

监督器只加载 Node.js 内置模块，不加载 Nest、地图、玩家或数据库模块。它负责：

1. 拉起与当前镜像完全相同的 `dist/main.js` 子进程。
2. 等待子进程完成 `app.init()` 或 `app.listen()` 后发送 ready。
3. 通过独立 IPC 定时器检测事件循环心跳。
4. 对 api/all 角色请求 `http://127.0.0.1:${SERVER_PORT}/live`；只检查 liveness，不把数据库 readiness 故障误判为进程卡死。
5. 异常退出时持续有界指数退避重启，不设置“尝试若干次后永久放弃”。
6. 卡死时先发送 `SIGTERM` 走既有 drain、刷盘和租约释放，再在恢复超时后 `SIGKILL`。
7. 容器收到 `SIGTERM/SIGINT` 时转发给子进程，等待既有优雅关闭完成后退出。

`SERVER_PORT` 只接受 `1..65535` 的十进制整数。未配置或显式值非法时，Nest 监听进程与监督器探针会一起回退到生产默认端口 `13001`，并由 Nest 启动日志记录告警，避免父子进程使用不同端口。

## 默认恢复策略

| 场景 | 默认判定 | 恢复动作 |
|------|----------|----------|
| 子进程异常退出 | 收到任意 code/signal，且不是容器计划停止 | 1s 起步、最大 30s 的指数退避重启 |
| 启动卡死 | 180s 内未 ready | `SIGTERM`，10s 后仍未退出则 `SIGKILL`，随后重启 |
| 事件循环卡死 | IPC 心跳超过 30s 未更新 | 同上 |
| API 无响应 | `/live` 每 5s 探测，连续 6 次失败 | 同上 |
| 容器计划停止 | 收到 `SIGTERM/SIGINT` | 转发信号，最多等待 27s，不自动重启 |

子进程在 Linux 下会尽力把自己的 `oom_score_adj` 设为 `500`。当容器内存耗尽时，内核会更倾向结束占用内存较大的游戏子进程并保留轻量监督器，由监督器重新拉起。容器运行时若启用整组 OOM kill，或宿主机/容器本身被终止，这一层无法恢复，仍需 Docker/Swarm 或更新器负责重新创建容器。

## 事故证据

监督事件以 JSONL 写入现有 `/var/lib/server` 运行卷，API 与 worker 按 `SERVER_NODE_ID` 分文件：

```text
/var/lib/server/process-supervisor-daojie-yusheng-server_13001.jsonl
/var/lib/server/process-supervisor-daojie-yusheng-server-worker.jsonl
```

单文件默认最多约 512KB，超过后保留尾部约一半。事件包括启动、ready、退出 code/signal、触发恢复的原因、退出前最近 RSS/峰值 RSS、运行时长和退避时间。

监督器会把最近 8 次退出上下文传给恢复后的 Nest 子进程，并写入当前控制台日志缓冲。服务恢复后可继续通过 GM 日志查询，不再只剩新进程日志而完全丢失上一代退出原因。

## CCR 自动更新兼容性

朋友编写的更新器只要继续执行“发现 CCR 镜像 ID 变化后替换 server/server_worker 镜像”，无需同步 YAML。新镜像仍从原命令和原端口启动，监督器在生产环境标识为空或非 development/test 时默认开启。

当前仓库生成的 CCR 更新器在“运行中镜像 ID 与拉取结果相同”时会直接跳过 service update，并且只在本轮确实更新镜像后检查 HTTP 健康。因此它是发布更新器，不是常驻故障恢复器；镜像未变化时的 Node 进程故障由本监督器兜底。

首次更新仍会按原流程重建容器；监督器解决的是容器创建成功之后的 Node 子进程故障，不接管镜像拉取、Swarm service update 或镜像回滚。

## 配置

所有变量均可选，默认值已经按生产环境设置：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SERVER_PROCESS_SUPERVISOR_ENABLED` | 生产 `true`，开发/测试 `false` | 显式启停监督器 |
| `SERVER_PROCESS_SUPERVISOR_STARTUP_TIMEOUT_MS` | `180000` | ready 超时 |
| `SERVER_PROCESS_SUPERVISOR_HEARTBEAT_INTERVAL_MS` | `2000` | 子进程 IPC 心跳间隔 |
| `SERVER_PROCESS_SUPERVISOR_HEARTBEAT_TIMEOUT_MS` | `30000` | 心跳失联阈值 |
| `SERVER_PROCESS_SUPERVISOR_LIVENESS_INTERVAL_MS` | `5000` | `/live` 探测间隔 |
| `SERVER_PROCESS_SUPERVISOR_LIVENESS_TIMEOUT_MS` | `3000` | 单次 `/live` 超时 |
| `SERVER_PROCESS_SUPERVISOR_LIVENESS_FAILURE_THRESHOLD` | `6` | 连续失败触发恢复的次数 |
| `SERVER_PROCESS_SUPERVISOR_RESTART_BASE_DELAY_MS` | `1000` | 首次重启等待 |
| `SERVER_PROCESS_SUPERVISOR_RESTART_MAX_DELAY_MS` | `30000` | 最大重启等待 |
| `SERVER_PROCESS_SUPERVISOR_STABLE_WINDOW_MS` | `300000` | 连续稳定运行后清零退避级别 |
| `SERVER_PROCESS_SUPERVISOR_RECOVERY_STOP_TIMEOUT_MS` | `10000` | 卡死恢复时的 drain 等待 |
| `SERVER_PROCESS_SUPERVISOR_SHUTDOWN_STOP_TIMEOUT_MS` | `27000` | 容器计划停止时的 drain 等待 |
| `SERVER_PROCESS_SUPERVISOR_PROBE_HOST` | `127.0.0.1` | api/all 角色的本地探测地址 |
| `SERVER_PROCESS_SUPERVISOR_JOURNAL_PATH` | 按节点生成 | 覆盖结构化事件日志路径 |
| `SERVER_PROCESS_SUPERVISOR_JOURNAL_MAX_BYTES` | `524288` | 单个事件日志轮转阈值 |
| `SERVER_PROCESS_SUPERVISOR_CHILD_OOM_SCORE_ADJ` | `500` | Linux 子进程 OOM 倾向值 |

这些值由 PID 1 在数据库和 Nest 启动前读取，因此不能依赖 GM 数据库运行时配置覆盖。

## 手动恢复入口

监督器支持 `SIGUSR2`，收到后会按“先 drain、后重启”流程替换子进程。它供已有服务器更新器或 Docker 控制面调用，不需要修改游戏服务路由：

```bash
docker kill --signal=SIGUSR2 <server-container-id>
```

这不是公网 HTTP API。当前外部流量只路由到容器内 `13001`，在不增加独立监听端口、反向代理规则或额外 service 的前提下，无法提供一个与游戏主进程完全隔离且始终可远程访问的重启 API。为避免在 5000 并发主链上增加常驻反向代理，本次不伪造这一能力；自动恢复和 Docker 信号是无部署架构变更下的可靠边界。

## 验证

```bash
pnpm --filter @mud/server smoke:process-supervisor
```

该 smoke 覆盖异常退出重启、心跳超时重启、信号转发、退避期间父进程存活、结构化事件日志和恢复上下文传递；不连接数据库，也不创建持久化业务对象。

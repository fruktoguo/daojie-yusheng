# 服务运行角色与独立 Worker 改造计划

> 目标：参考 `参考/jiuzhou` 的运行角色模式，把当前服务拆成可配置的 `all / api / worker` 启动形态。代码负责角色分流，部署负责进程拆分，使后台刷盘、outbox、备份、清理和后续调度任务能独立运行、独立重启、独立扩缩容，同时不破坏服务端权威和持久化真源。

## 背景与结论

当前项目已有若干 worker 形态：

- 进程内 inline：例如 `FlushTaskRuntimeService` 在主 `server` 进程内定时消费 ledger。
- worker_threads：例如 AOI 编码、实例预计算、持久化序列化池，适合 CPU 纯计算，不是独立服务。
- 独立 tool 入口：例如 `database-backup-worker.js`、`outbox-dispatcher-worker.js`、`flush-task-worker.js`。
- Docker service：当前 stack 已有 `backup-worker`，flush worker 已有灰度入口但默认副本为 `0`。

参考 `jiuzhou` 的做法不是“只在代码里启动 worker”，而是：

- 代码定义运行角色：`all | api | worker`。
- 启动流水线按角色决定是否启动 HTTP、请求型 worker、后台调度、恢复任务和消费者。
- Docker stack 用同一个 server 镜像启动两个服务：
  - `server`：`runtime role = api`，暴露 HTTP 端口和 healthcheck。
  - `server_worker`：`runtime role = worker`，不暴露 HTTP，不配置依赖 HTTP 的 healthcheck。

本项目应采用同一原则：**代码里做角色分流，部署里做进程拆分**。

## 商业级原则

- `api` 角色只承担玩家连接、Socket.IO、HTTP、GM API、权威运行时入口和请求型任务投递。
- `worker` 角色只承担不需要 HTTP 入口的后台消费、调度、补偿、清理和持久化管线。
- `all` 角色作为本地开发、单进程兼容和紧急回滚模式。
- worker 角色不能直接持有或伪造主进程权威运行态；需要主进程内存态才能构造 payload 的任务，必须先完成 staging/ledger payload 化。
- 任意会影响玩家资产、地图实例、邮件、市场、GM 操作的数据链路，必须有数据库真源、幂等认领、失败重试、可观测指标和清理证明。
- 部署拆分不得扩大数据库连接池总量到不可控；api/worker 的 pool 预算必须一起计算。

## 目标架构

### 运行角色

新增服务端运行角色配置：

```ts
export type ServerRuntimeRole = 'all' | 'api' | 'worker';
```

建议环境变量：

- `SERVER_RUNTIME_ROLE=all|api|worker`
- 兼容别名：`DAOJIE_RUNTIME_ROLE`
- 默认值：`all`
- 非法值：回落 `all`，并输出 warn 日志

### 角色职责

| 能力 | all | api | worker | 说明 |
|------|-----|-----|--------|------|
| HTTP / Socket.IO 监听 | 是 | 是 | 否 | worker 不暴露玩家入口 |
| GM HTTP API | 是 | 是 | 否 | worker 不替代 GM 控制面 |
| 权威 world tick | 是 | 是 | 否 | 当前单服权威态在 api 角色 |
| 请求型 worker 协调器 | 是 | 是 | 视任务而定 | 需要请求内存队列的留在 api |
| flush ledger 消费 | 是 | 兜底/可关 | 是 | 完成 staging 前不能默认全交给 worker |
| outbox 分发 | 是 | 可关 | 是 | 适合 worker 角色 |
| 数据库备份 | 是 | 否 | 是 | 当前 backup-worker 可并入 worker 角色或保留独立服务 |
| 清理/保留策略 | 是 | 否 | 是 | 不应阻塞玩家入口 |
| DB/Redis/内容启动检查 | 是 | 是 | 是 | 两类进程都要 fail fast |

## 阶段计划

### Phase 1：运行角色底座

- [ ] 新增 `packages/server/src/config/runtime-role.ts`。
- [ ] 提供 `resolveServerRuntimeRole()`。
- [ ] 提供守卫函数：
  - `shouldStartHttpServer(role)`
  - `shouldStartAuthoritativeRuntime(role)`
  - `shouldStartInlineFlushConsumer(role)`
  - `shouldStartBackgroundWorkers(role)`
  - `shouldStartOutboxDispatcher(role)`
  - `shouldStartBackupWorker(role)`
- [ ] 默认 `all`，保持当前本地和生产行为不变。
- [ ] 所有角色启动决策只读配置，不直接启动业务逻辑。

### Phase 2：启动管线改造

- [ ] 收敛 `main.ts` / `AppModule` / worker tool 的启动判断。
- [ ] `api` 角色：
  - 启动 HTTP / Socket.IO。
  - 启动权威 runtime 和玩家连接相关服务。
  - 保留 inline flush 兜底，默认可通过 `SERVER_FLUSH_TASK_RUNTIME_MODE=inline|off` 控制。
- [ ] `worker` 角色：
  - 不监听 HTTP 端口。
  - 不注册或不启动玩家 Socket.IO 网关。
  - 启动后台 worker orchestrator。
  - 不启动需要主进程内存态的权威 tick。
- [ ] `all` 角色：
  - 保留当前行为，用于开发、单机、紧急回滚。

### Phase 3：后台 Worker Orchestrator

- [ ] 新增 `BackgroundWorkerRuntimeService` 或等价启动编排服务。
- [ ] 统一托管：
  - flush task consumer。
  - outbox dispatcher。
  - database backup worker。
  - cleanup/retention worker。
  - 后续市场、邮件、审计、排行榜等定时任务。
- [ ] 每个 worker 能力必须有：
  - `enabled` 开关。
  - `runOnce()`。
  - `runLoop()` 或由 orchestrator 调度。
  - graceful shutdown。
  - GM/日志/metrics 可观测状态。
- [ ] 请求型、依赖内存队列的任务不得错误移入 worker 角色。

### Phase 4：部署拓扑改造

- [ ] `docker-stack.tencent.yml` 引入公共 server 配置 anchor：
  - image。
  - environment base。
  - networks。
  - volumes。
  - stop_grace_period。
  - restart_policy。
- [ ] `server` 服务：
  - `SERVER_RUNTIME_ROLE=api`。
  - 暴露端口。
  - 保留 HTTP healthcheck。
- [ ] `server_worker` 服务：
  - 同一个 server 镜像。
  - `SERVER_RUNTIME_ROLE=worker`。
  - 不暴露端口。
  - 不使用依赖 HTTP 的 healthcheck。
  - 副本数由 `SERVER_WORKER_REPLICAS` 控制，初始默认 `0` 或 `1` 取决于 staging 完成度。
- [ ] `docker-compose.yml` 同步本地 profile：
  - 默认 `all` 或 `api`。
  - `--profile worker` 启动 `server_worker`。
- [ ] 保留现有专用 worker command 作为迁移期 fallback，完成后再决定是否收敛。

### Phase 5：Flush Worker 真正独立化

当前 flush worker 入口已存在，但玩家快照和实例 delta 仍依赖主进程权威运行态构造，不能直接把生产默认切到 worker。

- [ ] 梳理 flush task 类型：
  - 只需要数据库/ledger 的任务。
  - 需要主进程内存态构造 payload 的任务。
  - 必须同步完成的资产型任务。
- [ ] 为玩家和实例 dirty 写入 staging/payload：
  - 玩家 domain mutation payload。
  - 实例 domain delta payload。
  - ownership epoch / revision / fencing token。
  - 幂等 key。
- [ ] worker 只消费 staging 后的正式 payload，不从 api 内存态读取。
- [ ] no-op flush 保持 retry，不得 mark flushed。
- [ ] 完成后再将 `server` 默认 `SERVER_FLUSH_TASK_RUNTIME_MODE=off`，`server_worker` 默认消费 flush。

### Phase 6：GM 观测与运维控制

- [ ] GM worker 面板增加角色信息：
  - 当前进程 role。
  - api/worker 拓扑建议。
  - 每类 worker enabled/running/last heartbeat。
- [ ] worker 容量指标按 role 展示：
  - flush pool waiting。
  - PG lock wait。
  - backlog growth rate。
  - oldest dirty age。
  - failure category。
- [ ] 告警区分：
  - backlog high。
  - worker inactive。
  - db backpressure。
  - lock wait。
  - dead letter。
- [ ] 不在 GM 面板直接启动/停止生产 worker，只展示状态和配置建议。

### Phase 7：验证与发布门禁

- [ ] 新增 role policy smoke：
  - `all` 会启动 HTTP + 后台。
  - `api` 会启动 HTTP，不启动 worker-only 消费者。
  - `worker` 不监听 HTTP，只启动 worker-only 消费者。
- [ ] 新增 docker stack policy smoke：
  - `server` 有端口和 HTTP healthcheck。
  - `server_worker` 无端口、无 HTTP healthcheck。
  - 二者使用同一镜像和公共环境。
- [ ] flush worker with-db proof：
  - 多 worker `FOR UPDATE SKIP LOCKED` 不重复认领。
  - no-op 不 mark flushed。
  - retry/backoff 正确。
- [ ] outbox worker proof：
  - 多 worker 不重复 delivered。
  - consumer 失败不丢事件。
- [ ] 发布前执行：
  - `pnpm --filter @mud/server compile`
  - `pnpm verify:quick`
  - `pnpm verify:client`（GM 面板改动时）
  - `pnpm verify:release:with-db`（角色拆分/DB worker 改动时）

## 非目标

- 不把所有 worker_threads 改成独立服务。
- 不把权威 tick 拆到 worker 角色。
- 不把需要主进程内存队列的请求型任务强行移到 worker。
- 不用 Redis 或内存替代数据库真源。
- 不在没有 staging/payload 的情况下让独立 flush worker 默认接管生产刷盘。

## 风险与约束

- **双启动风险**：`all` 和 `api+worker` 同时跑同一消费者会造成重复消费，必须由角色守卫和幂等认领共同约束。
- **连接池放大风险**：api 和 worker 都会创建 DB pool，部署副本数必须和 PG `max_connections` 一起计算。
- **权威态缺失风险**：worker 进程拿不到 api 内存里的玩家/地图对象，所有依赖运行态构造的数据必须先 staging。
- **健康检查误判风险**：worker 不监听 HTTP，不能沿用 `/health` 检查；应使用进程存活、日志、heartbeat 或 GM 聚合状态。
- **回滚风险**：必须保留 `SERVER_RUNTIME_ROLE=all` 和 `SERVER_FLUSH_TASK_RUNTIME_MODE=inline` 的单进程回滚路径。

## 完成判定

- 生产 stack 能以 `server(api) + server_worker(worker)` 拆分启动。
- worker 角色不监听 HTTP，也不会启动玩家 Socket.IO 入口。
- api 角色不启动 worker-only 后台消费者，除非显式开启 inline 兜底。
- GM worker 面板能区分 api/worker 拓扑和真实消费状态。
- flush/outbox/backup/cleanup 至少各有一个 `runOnce` 或 smoke 证明。
- 在 5000 玩家、10000 地图口径下，后台 worker 的处理率、DB pool waiting、锁等待和 backlog 增长率有可观测数据。
- 任何阶段都能回退到 `all` 单进程兼容模式。


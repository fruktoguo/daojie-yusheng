# 服务运行角色与独立 Worker 改造计划

> 目标：参考 `参考/jiuzhou` 的运行角色模式，把生产形态明确拆成 `server(api)` + `server_worker(worker)`。代码负责角色分流，部署负责进程拆分，使后台刷盘、outbox、备份、清理和后续调度任务能独立运行、独立重启、独立扩缩容，同时不破坏服务端权威和持久化真源。`all` 只作为本地开发和紧急回滚模式，不作为生产目标态。

## 背景与结论

当前项目已有若干 worker 形态：

- 进程内 inline：例如 `FlushTaskRuntimeService` 在主 `server` 进程内定时消费 ledger。
- worker_threads：例如 AOI 编码、实例预计算、持久化序列化池，适合 CPU 纯计算，不是独立服务。
- 独立 tool 入口：例如 `database-backup-worker.js`、`outbox-dispatcher-worker.js`、`flush-task-worker.js`。
- Docker service：当前 stack 已有 `backup-worker`，flush worker 已有入口，但尚未统一到 `server_worker` 角色模型。

参考 `jiuzhou` 的做法不是“只在代码里启动 worker”，而是：

- 代码定义运行角色：`all | api | worker`。
- 启动流水线按角色决定是否启动 HTTP、请求型 worker、后台调度、恢复任务和消费者。
- Docker stack 用同一个 server 镜像启动两个服务：
  - `server`：`runtime role = api`，暴露 HTTP 端口和 healthcheck。
  - `server_worker`：`runtime role = worker`，不暴露 HTTP，不配置依赖 HTTP 的 healthcheck。

本项目应采用同一原则：**代码里做角色分流，部署里做进程拆分**。最终生产不应长期依赖 inline worker，也不应长期保留多个分散的正式 worker 入口；正式后台能力统一由 `server_worker` 承载。

## 商业级原则

- `api` 角色只承担玩家连接、Socket.IO、HTTP、GM API、权威运行时入口和请求型任务投递。
- `worker` 角色只承担不需要 HTTP 入口的后台消费、调度、补偿、清理和持久化管线。
- `all` 角色只作为本地开发、单进程兼容和紧急回滚模式，不作为生产默认。
- worker 角色不能直接持有或伪造主进程权威运行态；需要主进程内存态才能构造 payload 的任务，必须先完成 durable staging / payload 化后才能移入 worker。
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
- 代码默认值：`all`，仅用于本地开发和兼容启动。
- 生产 stack 必须显式配置：`server=api`，`server_worker=worker`。
- 非法值：回落 `all`，并输出 warn 日志；生产发布门禁必须禁止 stack 中缺失显式 role。

### 角色职责

| 能力 | all | api | worker | 说明 |
|------|-----|-----|--------|------|
| HTTP / Socket.IO 监听 | 是 | 是 | 否 | worker 不暴露玩家入口 |
| GM HTTP API | 是 | 是 | 否 | worker 不替代 GM 控制面 |
| 权威 world tick | 是 | 是 | 否 | 当前单服权威态在 api 角色 |
| 请求型 worker 协调器 | 是 | 是 | 视任务而定 | 需要请求内存队列的留在 api |
| flush ledger 消费 | 是 | 否 | 是 | 生产目标态由 worker 接管；api 只保留应急 inline 回滚 |
| outbox 分发 | 是 | 否 | 是 | 正式后台消费者 |
| 数据库备份 | 是 | 否 | 是 | 并入 worker 角色或由同等独立后台角色承载 |
| 清理/保留策略 | 是 | 否 | 是 | 不应阻塞玩家入口 |
| DB/Redis/内容启动检查 | 是 | 是 | 是 | 两类进程都要 fail fast |

## 阶段计划

### Phase 1：运行角色底座

- [x] 新增 `packages/server/src/config/runtime-role.ts`。
- [x] 提供 `resolveServerRuntimeRole()`。
- [x] 提供守卫函数：
  - `shouldStartHttpServer(role)`
  - `shouldStartAuthoritativeRuntime(role)`
  - `shouldStartInlineFlushConsumer(role)`
  - `shouldStartBackgroundWorkers(role)`
  - `shouldStartOutboxDispatcher(role)`
  - `shouldStartBackupWorker(role)`
- [x] 代码默认 `all` 仅用于本地兼容；生产部署必须显式声明 `api` / `worker`。
  - 验证：`pnpm --filter @mud/server smoke:runtime-role-policy` 已覆盖默认 `all`、生产 `api/worker`、非法值回退与显式 api inline fallback。
- [x] 所有角色启动决策只读配置，不直接启动业务逻辑。

### Phase 2：Flush Durable Staging / Payload 化

这是目标态前置条件，不允许用“当前 flush 依赖内存态”作为长期妥协。

- [x] 梳理所有玩家和实例 flush domain：
  - 玩家资产：`inventory / equipment / market / mail / GM edit`。
  - 玩家状态：`presence / position_checkpoint / world_anchor / progression / quest / buff / vitals`。
  - 实例状态：`time / monster_runtime / tile_resource / tile_damage / fengshui / ground_item / container_state / overlay / room / building`。
  - 审计结论（2026-05-21）：
    - 玩家已存在分域表与 `PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS`：`world_anchor / position_checkpoint / vitals / progression / attr / wallet / market_storage / inventory / map_unlock / equipment / technique / body_training / buff / quest / combat_pref / auto_battle_skill / auto_use_item_rule / profession / alchemy_preset / active_job / enhancement_record / logbook`。
    - 但当前 `PlayerPersistenceFlushService.flushPlayerDomains()` 仍先从 `PlayerRuntimeService.buildPersistenceSnapshot()` 构造 runtime snapshot，再投影到分域表；worker 不能在无 api 内存态下消费这些玩家 domain。
    - 邮件、市场订单、GM 操作已有各自 DB service/outbox/审计路径，不能简单并入 player snapshot flush；需要逐链路定义 idempotency key 与 payload。
    - 实例已存在 delta/批量 API：`tile_resource / tile_damage / monster_runtime / instance checkpoint / recovery watermark / purgeInstanceState`；但当前 dirty 来源和 `flushInstanceDomains()` 仍依赖 `WorldRuntimeService` 与实例 runtime 对象。
    - `time / fengshui / ground_item / container_state / overlay / room / building` 仍需确认 payload projector；Phase 2 后续项未完成前不得由 worker mark flushed。
- [x] 设计 durable staging 表或 payload 表：
  - `scope`、`entity_id`、`domain`、`priority`。
  - `revision`、`ownership_epoch`、`runtime_owner_id`、`fencing_token`。
  - `payload_jsonb` 或结构化 delta 表。
  - `idempotency_key`、`created_at`、`claim_until`、`retry_after`、`failure_category`。
  - 已完成：复用并升级 `player_flush_ledger` / `instance_flush_ledger` 为 staging 语义，补齐 `runtime_owner_id`、`fencing_token`、`idempotency_key`、`payload_jsonb`、`failure_category`、`retry_after`、`created_at`，并保持 `FOR UPDATE SKIP LOCKED` claim。
  - 验证：`pnpm --filter @mud/server smoke:flush-staging-schema` 通过；该验证只证明 schema/类型契约，不证明各 domain projector 已完成。
- [x] api 角色在权威变更发生后写入 staging，不把完整运行态对象交给 worker。
  - 已完成：`FlushTaskRuntimeService.stageDirtyTasksOnce()` 在权威 role 下可独立写入 staging；玩家 `presence` 域写入结构化 `payload_jsonb` 与 `runtime_owner_id/fencing_token`；玩家 snapshot projectable domains 写入 `player_snapshot_projection` payload；实例 `tile_damage/tile_resource` 写入 `instance_domain_delta` payload；实例 `ground_item/overlay/monster_runtime/container_state/building/room/fengshui/time` 写入可消费 state payload。
  - 边界结论：`mail` 由 `MailRuntimeService` -> `MailPersistenceService.saveMailboxMutation()`/`saveMailbox()` 直写结构化真源；`gm_edit` 由 `NativeGmPlayerService.savePlayerPersistenceSnapshotForGmUpdate()`/`savePlayerPersistenceSnapshot()` 直写玩家快照并记录 GM audit；二者不是 flush staging payload domain，worker 侧保持 unsupported player domain retry 边界。
  - 验证：`pnpm --filter @mud/server smoke:flush-player-payload`、`pnpm --filter @mud/server smoke:flush-instance-payload`、`pnpm --filter @mud/server smoke:flush-instance-state-payload`、`pnpm --filter @mud/server smoke:flush-independent-persistence` 通过。
- [x] worker 角色只从 staging/ledger 读取正式 payload 并写真源。
  - 已完成：玩家 `presence` task 在 worker role 下可从 staging payload 写入 `PlayerDomainPersistenceService.savePlayerPresence()`；玩家 snapshot projectable task 可从 staging payload 写入 `savePlayerSnapshotProjectionDomains()`；实例 `tile_damage/tile_resource` 可从 staging delta payload 写入批量持久化 API；实例 `ground_item/overlay/monster_runtime/container_state/building/room/fengshui/time` 可从 staging state payload 写入持久化 API；unsupported player domain（含 `mail`/`gm_edit` 这类非 staging 链路）在 worker role 下只 retry，不调用 runtime flush fallback。
  - 边界结论：邮件和 GM 编辑由各自真源服务负责写入与幂等/审计，不伪装为 flush payload；市场订单已由 `market_storage` snapshot projectable path 覆盖。
  - 验证：`pnpm --filter @mud/server smoke:flush-player-payload`、`pnpm --filter @mud/server smoke:flush-instance-payload`、`pnpm --filter @mud/server smoke:flush-instance-state-payload`、`pnpm --filter @mud/server smoke:flush-task-noop-retry`、`pnpm --filter @mud/server smoke:flush-independent-persistence` 通过。
- [x] payload 写入、worker 写入、mark flushed 必须同一幂等链路，重复消费不重复发奖、不重复扣资产、不覆盖新版本。
  - 已完成：玩家 `presence` payload 使用 session epoch 与 DB upsert 条件保证旧 session 不覆盖新 session；玩家 snapshot projectable payload 复用分域写入的 version/watermark 与空覆盖保护；实例 `tile_damage/tile_resource` delta payload 复用批量 delta 写入和 recovery watermark，并在 worker 写入成功后 mark flushed；邮件和 GM edit 已确认不属于 flush payload 链路，分别由邮件结构化真源和 GM 直写快照/审计链路承担。
  - 验证（2026-05-21）：`node packages/server/dist/tools/flush-task-worker-db-smoke.js` 已在真实 DB 上验证 ledger claim、真源写入、retry/backoff、stale fencing 与重复 claim 不再返回已 flushed task；容量 benchmark 同时覆盖 100 次 wallet durable mutation 路径。
- [x] no-op flush 必须 retry 或进入诊断，不得 mark flushed。
  - 已完成：玩家 `flushPlayerDomains()` 返回 `false` 时 retry；实例缺少 runtime、缺少 `flushInstanceDomains()` 或返回空结果时 retry，不再 mark flushed。
  - 验证：`pnpm --filter @mud/server smoke:flush-task-noop-retry` 通过。
- [x] 完成 staging 后，生产目标配置为 `api` 不消费 flush，`worker` 消费 flush。
  - 已完成：生产 stack 中 `server` 使用 `SERVER_RUNTIME_ROLE=api`/`SERVER_FLUSH_TASK_RUNTIME_MODE=off`，`server_worker` 使用 `SERVER_RUNTIME_ROLE=worker`/`SERVER_FLUSH_TASK_RUNTIME_MODE=worker`；代码侧 `FlushTaskRuntimeService` 在 api role 仅 stage、不消费，worker role 仅消费 ready task。
  - 验证：`pnpm --filter @mud/server smoke:runtime-role-policy`、`pnpm --filter @mud/server smoke:background-worker-runtime`、`pnpm run proof:release-gates` 通过。

### Phase 3：启动管线改造

- [x] 收敛 `main.ts` / `AppModule` / worker tool 的启动判断。
  - 已完成：`main.ts` 按 role 在 HTTP app 与 application context 间分流；`WorldTickService`、`FlushTaskRuntimeService`、`OutboxDispatcherRuntimeService`、`MarketTradeHistoryRetentionWorker` 已按 role 守卫自动启动；`AppModule` 仅在 HTTP role 条件注册 `WorldGateway`/gateway helpers/shutdown drain；正式 `flush-task-worker` 与 `outbox-dispatcher-worker` tool 默认强制 `SERVER_RUNTIME_ROLE=worker`。
  - 验证：`pnpm --filter @mud/server smoke:runtime-role-policy`、`pnpm --filter @mud/server smoke:worker-socket-policy` 通过。
- [x] `api` 角色：
  - 启动 HTTP / Socket.IO。
  - 启动权威 runtime 和玩家连接相关服务。
  - 默认不启动 worker-only 后台消费者。
  - inline flush 只允许通过显式应急配置开启，并必须在日志中标记为 fallback 角色矩阵。
- [x] `worker` 角色：
  - 已完成：不监听 HTTP 端口；不启动需要主进程内存态的权威 tick；后台 worker orchestrator 已接入；`AppModule` 在 worker role 不注册 Socket.IO `WorldGateway` 与玩家入口 helpers。
  - 验证：`pnpm --filter @mud/server smoke:worker-socket-policy` 通过。
- [x] `all` 角色：
  - 仅用于开发、单机、紧急回滚。
  - 生产发布门禁不得把 `all` 作为默认 stack 配置。
  - 验证：`pnpm run proof:release-gates` 已覆盖生产 stack 显式 `api/worker` 与本地 compose 默认 `all` 的差异。

### Phase 4：后台 Worker Orchestrator

- [x] 新增 `BackgroundWorkerRuntimeService` 或等价启动编排服务。
  - 验证：`pnpm --filter @mud/server smoke:background-worker-runtime` 通过。
- [x] 统一托管：
  - 已完成：flush task consumer、outbox dispatcher、database backup、邮件过期清理、邮件软删清理、市场成交历史 retention、资产审计归档、实例状态清理由 orchestrator 调度；`database-backup-worker.ts` 已抽出 `runDatabaseBackupWorkerOnce()`，tool main 仅在直接执行时启动。
  - 说明：flush task consumer 仅在 `SERVER_FLUSH_TASK_RUNTIME_MODE=worker` 下由 orchestrator 启动；尚未 payload 化的 domain 会 retry，不会 mark flushed。
  - 验证：`pnpm --filter @mud/server smoke:background-worker-runtime` 通过。
- [x] 每个 worker 能力必须有：
  - 已完成：已接管任务具备 `enabled`、`runOnce()`、orchestrator 定时调度、graceful shutdown、heartbeat/status/processedCount；database backup 具备可复用 `runOnce` 端口并纳入状态模型。
  - 验证：`pnpm --filter @mud/server smoke:background-worker-runtime` 通过。
- [x] 请求型、依赖内存队列的任务不得错误移入 worker 角色。
  - 说明：`flush-task-consumer` 在 orchestrator 中显式保持禁用，等待 Phase 2 durable payload 证明。

### Phase 5：部署拓扑改造

- [x] `docker-stack.tencent.yml` 引入公共 server 配置 anchor：
  - image。
  - environment base。
  - networks。
  - volumes。
  - stop_grace_period。
  - restart_policy。
- [x] `server` 服务：
  - `SERVER_RUNTIME_ROLE=api`。
  - `SERVER_FLUSH_TASK_RUNTIME_MODE=off`，除非应急回滚。
  - 暴露端口。
  - 保留 HTTP healthcheck。
- [x] `server_worker` 服务：
  - 同一个 server 镜像。
  - `SERVER_RUNTIME_ROLE=worker`。
  - `SERVER_FLUSH_TASK_RUNTIME_MODE=worker`。
  - 不暴露端口。
  - 不使用依赖 HTTP 的 healthcheck。
  - 副本数由 `SERVER_WORKER_REPLICAS` 控制，生产目标默认至少 `1`。
- [x] `docker-compose.yml` 同步本地 profile：
  - 本地默认可用 `all`。
  - `--profile worker` 启动 `server_worker`。
- [x] 现有专用 worker command 仅作为诊断/一次性运维入口，不作为正式生产主路径。
  - 验证：`pnpm run proof:release-gates` 已覆盖生产 stack、compose、`deploy-latest.sh` 和 `deploy-prod.sh` 服务名/角色策略。

### Phase 6：正式 Worker 能力接管

- [x] flush worker 接管玩家/实例 staging payload 消费。
  - 已完成：`server_worker` 在 `SERVER_FLUSH_TASK_RUNTIME_MODE=worker` 下由 orchestrator 调用 `FlushTaskRuntimeService.runOnce()`；玩家 presence/snapshot projectable 与实例 delta/state payload 均已有 worker 消费路径；非 staging 玩家 domain 在 worker role 下只 retry。
  - 验证：`pnpm --filter @mud/server smoke:flush-player-payload`、`pnpm --filter @mud/server smoke:flush-instance-payload`、`pnpm --filter @mud/server smoke:flush-instance-state-payload`、`pnpm --filter @mud/server smoke:flush-task-noop-retry`、`pnpm --filter @mud/server smoke:background-worker-runtime` 通过。
- [x] outbox dispatcher 接入 `server_worker`，api 默认不投递。
  - 验证：`pnpm --filter @mud/server smoke:runtime-role-policy` 与 `pnpm --filter @mud/server smoke:background-worker-runtime` 通过。
- [x] database backup worker 接入 `server_worker` 或同一后台 role。
  - 已完成：抽出 `runDatabaseBackupWorkerOnce()` 供 orchestrator 调用；tool main 通过 `require.main === module` 限定直接执行时才启动循环。
  - 验证：`pnpm --filter @mud/server smoke:background-worker-runtime` 覆盖端口抽出与 orchestrator 引用；真实 pg_dump 生成仍需 with-db/部署环境验证。
- [x] cleanup/retention worker 接入 `server_worker`。
  - 验证：`pnpm --filter @mud/server smoke:background-worker-runtime` 通过。
- [x] 每类 worker 都有 heartbeat、last success、last failure、processed count。
  - 验证：`pnpm --filter @mud/server smoke:background-worker-runtime` 覆盖 flush/outbox/cleanup/database backup 的 status 模型。
- [x] 多副本 worker 通过 DB claim / SKIP LOCKED / fencing / idempotency 保证不重复写错。
  - 验证（2026-05-21）：`multi-worker-flush-stability-report-smoke` 已在本地 PostgreSQL 上验证 4 player worker + 4 instance worker 并发 claim，无 duplicate flush；`flush-task-worker-db-smoke` 覆盖 stale ownership epoch/fencing 不写入只 mark flushed。

### Phase 7：GM 观测与运维控制

- [x] GM worker 面板增加角色信息：
  - 当前进程 role。
  - api/worker 拓扑建议。
  - 每类 worker enabled/running/last heartbeat。
  - 已完成：`GmWorkerStateRes.topology` 暴露当前 role、生产拓扑建议与本地 orchestrator worker 状态；静态 GM 面板展示 role、拓扑建议、enabled/running/heartbeat/success/failure/processedCount。
  - 验证：`pnpm build:shared`、`pnpm --filter @mud/server compile`、`pnpm verify:client` 通过。
- [x] worker 容量指标按 role 展示：
  - 已完成：响应携带 `runtimeRole/topology`，面板展示 flush pool waiting、PG lock wait、窗口估算 backlog growth rate、oldest pending/dirty age、failure category。
  - flush pool waiting。
  - PG lock wait。
  - backlog growth rate。
  - oldest dirty age。
  - failure category。
  - 验证：`pnpm build:shared`、`pnpm --filter @mud/server compile`、`pnpm verify:client` 通过。
- [x] 告警区分：
  - backlog high。
  - worker inactive。
  - db backpressure。
  - lock wait。
  - dead letter。
  - 验证：`pnpm --filter @mud/server compile`、`pnpm verify:client` 通过。
- [x] GM 面板不直接启动/停止生产 worker，只展示状态、容量、告警和配置建议。
  - 验证：静态 GM 面板只渲染 `GmWorkerStateRes`，未新增任何生产 worker 启停入口；`pnpm verify:client` 通过。

### Phase 8：验证与发布门禁

- [x] 新增 role policy smoke：
  - `all` 会启动 HTTP + 后台。
  - `api` 会启动 HTTP，不启动 worker-only 消费者。
  - `worker` 不监听 HTTP，只启动 worker-only 消费者。
  - 验证：`pnpm --filter @mud/server smoke:runtime-role-policy` 通过。
- [x] 新增 docker stack policy smoke：
  - `server` 有端口和 HTTP healthcheck。
  - `server_worker` 无端口、无 HTTP healthcheck。
  - 二者使用同一镜像和公共环境。
  - 验证：`pnpm run proof:release-gates` 通过。
- [x] flush worker with-db proof：
  - 多 worker `FOR UPDATE SKIP LOCKED` 不重复认领。
  - no-op / 已 flushed ledger 不会重复 claim。
  - retry/backoff 正确。
  - staging payload 重放幂等。
  - ownership epoch / fencing 失效时拒绝写入。
  - 验证（2026-05-21）：`multi-worker-flush-stability-report-smoke` 已在本地 DB 上验证 4 player worker + 4 instance worker 并发 claim，无 duplicate flush；`node packages/server/dist/tools/flush-task-worker-db-smoke.js` 已验证真实 DB ledger claim、presence 真源写入、invalid payload retry、instance checkpoint 真源写入、stale ownership epoch 只 mark flushed 不写入。
- [x] outbox worker proof：
  - 多 worker 不重复 delivered。
  - consumer 失败不丢事件。
  - 验证（2026-05-21）：`node packages/server/dist/tools/outbox-dispatcher-worker-smoke.js` 在本地 DB 上通过，覆盖单 worker delivered、双 worker 并发 delivered 不重复、registry/module consumer mode。
- [x] 容量证明：
  - 5000 玩家 dirty 产生模型。
  - 10000 地图实例活跃子集和全活跃 checkpoint。
  - 输出处理率、P95、PG pool waiting、lock wait、WAL 压力、backlog growth rate。
  - 验证（2026-05-21）：`PERSISTENCE_BENCH_PLAYER_COUNT=5000 PERSISTENCE_BENCH_INSTANCE_COUNT=10000 PERSISTENCE_BENCH_QUEUE_TASK_COUNT=100 PERSISTENCE_BENCH_WALLET_OP_COUNT=100 PERSISTENCE_BENCH_CONCURRENCY=2 node packages/server/dist/tools/persistence-benchmark-report.js` 在本地 DB 通过；输出 `processingRatePerSecond=379.508389`、`remainingBacklogCount=0`、`pgPoolWaiting.*.waitingCount=0`、`lockWait.waitingCount=0`、`walPressureBytes=61568517053`。
- [ ] 发布前执行：
  - `pnpm --filter @mud/server compile`
  - `pnpm verify:quick`
  - `pnpm verify:client`（GM 面板改动时）
  - `pnpm verify:release:with-db`（角色拆分/DB worker 改动时）
  - 已完成部分（2026-05-21）：`pnpm --filter @mud/server compile` 随 `pnpm verify:quick` 通过；`pnpm verify:quick` 通过；`pnpm verify:client` 通过。
  - 未完成/阻塞（2026-05-21）：`pnpm verify:release:with-db` 已在本地 DB/Redis 环境启动，compile、client build 和 production-boundaries 均通过；随后 stable smoke with-db 套件在 10 分钟工具超时前出现 `world-runtime-monster-los` 断言失败（`0 !== 1`）与 `monster-skill` case 失败，并在 `monster-loot` 期间被 SIGTERM。该失败不属于服务角色/worker 改造范围，但发布前执行不能打勾。

## 非目标

- 不把所有 worker_threads 改成独立服务。
- 不把权威 tick 拆到 worker 角色。
- 不把需要主进程内存队列的请求型任务强行移到 worker。
- 不用 Redis 或内存替代数据库真源。
- 不接受“没有 staging/payload 所以长期 inline”的妥协；staging/payload 是目标态必做项。
- 不把分散的 `*-worker.js` tool 作为长期生产主入口。

## 风险与约束

- **双启动风险**：`all` 和 `api+worker` 同时跑同一消费者会造成重复消费，必须由角色守卫和幂等认领共同约束。
- **连接池放大风险**：api 和 worker 都会创建 DB pool，部署副本数必须和 PG `max_connections` 一起计算。
- **权威态缺失风险**：worker 进程拿不到 api 内存里的玩家/地图对象，所有依赖运行态构造的数据必须先 durable staging。
- **健康检查误判风险**：worker 不监听 HTTP，不能沿用 `/health` 检查；应使用进程存活、日志、heartbeat 或 GM 聚合状态。
- **回滚风险**：保留 `SERVER_RUNTIME_ROLE=all` 和 `SERVER_FLUSH_TASK_RUNTIME_MODE=inline` 的应急回滚路径，但发布门禁必须能区分 fallback 与生产目标态。

## 完成判定

- 生产 stack 能以 `server(api) + server_worker(worker)` 拆分启动。
- worker 角色不监听 HTTP，也不会启动玩家 Socket.IO 入口。
- api 角色不启动 worker-only 后台消费者。
- 生产 stack 中 `server_worker` 默认至少 `1` 副本，`server` 默认不消费 flush/outbox/backup/cleanup。
- flush 玩家/实例 dirty 已完成 durable staging/payload 化，worker 不依赖 api 内存态。
- GM worker 面板能区分 api/worker 拓扑和真实消费状态。
- flush/outbox/backup/cleanup 均由 `server_worker` 正式承载，并各有 smoke/proof 证明。
- 在 5000 玩家、10000 地图口径下，后台 worker 的处理率、DB pool waiting、锁等待和 backlog 增长率有可观测数据。
- 能回退到 `all` 单进程兼容模式，但回滚路径不计入目标态完成。

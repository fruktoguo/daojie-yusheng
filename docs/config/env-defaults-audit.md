# 环境变量默认值审计

审计时间：2026-05-22

目标：所有未显式配置的环境变量默认值必须对真实服务器生产环境友好；本地调试、smoke、bench 的便利默认值必须隔离在工具入口，不能影响生产 `main`。

## 统计摘要

| 类别 | 数量 | 结论 |
|------|------|------|
| 生产必须显式配置、无安全默认值 | 8 | 连接串、密码、Token、主密钥不提供固定弱默认 |
| 生产运行拓扑默认值 | 2 | 缺省为 `api/off`，不会启动 all-in-one 或 inline flush |
| 生产 HTTP/CORS 默认值 | 5 | 默认启用 CORS，但生产必须配置白名单，凭证默认关闭 |
| 数据库连接池默认值 | 4 | 默认总连接数受控，并给 flush 足够容量余量 |
| 刷盘与持久化调度默认值 | 27 | 默认值按 5000 玩家 / 10000 实例目标给出有界吞吐、退避和并发上限 |
| Outbox 默认值 | 7 | 默认启用但仅由 `worker/all` 角色承载，具备批量、重试、去重上限 |
| 节点、会话、恢复队列默认值 | 9 | 默认值有心跳、超时、队列和内存上限 |
| GM 可管理运行配置默认值 | 20 | 调试项默认关闭，容量项均有限制范围 |
| 部署脚本自动生成默认值 | 4 | 密码和密钥默认随机生成，不使用固定弱值 |
| 工具/smoke/bench 专用默认值 | 15+ | 只在 `packages/server/src/tools` 或 `scripts` 中生效，不作为生产 runtime 默认 |

## 生产必须显式配置

| 环境变量 | 默认值 | 生产友好性 |
|----------|--------|------------|
| `SERVER_DATABASE_URL` / `DATABASE_URL` | 无 | 缺失时数据库能力不可用或启动检查失败 |
| `SERVER_DATABASE_POOLER_URL` / `DATABASE_POOLER_URL` | 无 | 可选；未配置时使用主库连接串 |
| `SERVER_REDIS_URL` / `REDIS_URL` | 无 | Redis 作为在线态/缓存依赖，不提供本地固定地址作为生产默认 |
| `SERVER_PLAYER_TOKEN_SECRET` / `JWT_SECRET` | 无 | 必须显式配置 |
| `SERVER_GM_AUTH_SECRET` / `GM_AUTH_SECRET` | 复用 `SERVER_PLAYER_TOKEN_SECRET` | 允许兼容回退，但生产建议独立配置 |
| `SERVER_SECRET_ENCRYPTION_KEY` / `SECRET_ENCRYPTION_KEY` | 复用 `SERVER_PLAYER_TOKEN_SECRET` | 允许兼容回退，但生产建议独立配置 |
| `SERVER_GM_PASSWORD` / `GM_PASSWORD` | 无 | 生产禁止回退 `admin123`；仅本地可显式开 `SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD=1` |
| `SERVER_CORS_ORIGINS` / `CORS_ORIGINS` | 无 | 非开发环境缺失会启动失败，禁止生产全开 |

## 生产运行拓扑

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `SERVER_RUNTIME_ROLE` / `DAOJIE_RUNTIME_ROLE` | `api` | 缺省只启动 HTTP/Socket 与权威 runtime，不启动 background worker |
| `SERVER_FLUSH_TASK_RUNTIME_MODE` / `FLUSH_TASK_RUNTIME_MODE` | `api` 角色下为 `off` | 缺省不在 API 进程消费 flush task；`worker` 角色缺省为 `worker`，显式 `all` 才是 `inline` |

`all/inline` 仍保留为本地单进程调试和应急回滚，但必须显式配置。

## HTTP 与 CORS

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `SERVER_HOST` | `0.0.0.0` | 容器环境可对外监听 |
| `SERVER_PORT` | `13001` | 固定服务端容器端口 |
| `SERVER_CORS_ENABLED` / `CORS_ENABLED` | `true` | 默认启用 CORS 保护链 |
| `SERVER_CORS_METHODS` / `CORS_METHODS` | `GET,POST,PUT,PATCH,DELETE,OPTIONS` | API 所需方法集合 |
| `SERVER_CORS_HEADERS` / `CORS_HEADERS` | `Content-Type,Authorization,X-Requested-With` | API 所需请求头集合 |
| `SERVER_CORS_CREDENTIALS` / `CORS_CREDENTIALS` | `false` | 默认不允许携带凭证 |

## 数据库连接池

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `SERVER_DATABASE_POOL_RUNTIME_CRITICAL_MAX` | `16` | 运行时关键路径连接池上限 |
| `SERVER_DATABASE_POOL_FLUSH_MAX` | `16` | flush / 持久化连接池上限 |
| `SERVER_DATABASE_POOL_OUTBOX_MAX` | `4` | outbox 连接池上限 |
| `SERVER_DATABASE_POOL_GM_DIAGNOSTICS_MAX` | `2` | GM 诊断连接池上限 |

默认总上限为 38 个连接，面向单服 8C/16GB 的 PostgreSQL 部署保留可控余量；如果使用外部 pooler，可通过 `SERVER_DATABASE_POOLER_URL` 接管。

## 持久化与刷盘

| 环境变量 | 默认值 | 范围/说明 |
|----------|--------|-----------|
| `SERVER_FLUSH_TASK_RUNTIME_INTERVAL_MS` | `1500` | 统一 flush task 调度周期 |
| `SERVER_FLUSH_TASK_RUNTIME_CLAIM_LIMIT` | `64` | 总认领默认上限 |
| `SERVER_FLUSH_TASK_RUNTIME_PLAYER_CLAIM_LIMIT` | `max(1024, CLAIM_LIMIT)` | 玩家任务每轮上限 |
| `SERVER_FLUSH_TASK_RUNTIME_INSTANCE_CLAIM_LIMIT` | `max(1024, CLAIM_LIMIT)` | 实例任务每轮上限 |
| `SERVER_FLUSH_TASK_RUNTIME_PLAYER_HIGH_LIMIT` | 玩家上限 `40%` | 高优先级玩家任务 |
| `SERVER_FLUSH_TASK_RUNTIME_PLAYER_NORMAL_LIMIT` | 玩家上限 `45%` | 普通玩家任务 |
| `SERVER_FLUSH_TASK_RUNTIME_PLAYER_LOW_LIMIT` | 剩余玩家上限 | 低优先级玩家任务 |
| `SERVER_FLUSH_TASK_RUNTIME_INSTANCE_HIGH_LIMIT` | 实例上限 `25%` | 高优先级实例任务 |
| `SERVER_FLUSH_TASK_RUNTIME_INSTANCE_NORMAL_LIMIT` | 实例上限 `45%` | 普通实例任务 |
| `SERVER_FLUSH_TASK_RUNTIME_INSTANCE_LOW_LIMIT` | 剩余实例上限 | 低优先级实例任务 |
| `SERVER_FLUSH_TASK_RUNTIME_PLAYER_PARALLELISM` | `16` | 玩家刷盘并发 |
| `SERVER_FLUSH_TASK_RUNTIME_INSTANCE_PARALLELISM` | `16` | 实例刷盘并发 |
| `SERVER_FLUSH_TASK_RUNTIME_RETRY_DELAY_MS` | `5000` | 失败重试延迟 |
| `SERVER_FLUSH_TASK_RUNTIME_POOL_WAITING_THRESHOLD` | `8` | DB pool 等待保护阈值 |
| `SERVER_PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS` | `1500` | 旧 direct 模式玩家刷盘周期 |
| `SERVER_PLAYER_PERSISTENCE_FLUSH_POOL_WAITING_THRESHOLD` | `2` | 玩家刷盘池等待阈值 |
| `SERVER_MAP_PERSISTENCE_FLUSH_INTERVAL_MS` | `1500` | 旧 direct 模式地图刷盘周期 |
| `SERVER_MAP_PERSISTENCE_FLUSH_POOL_WAITING_THRESHOLD` | `2` | 地图刷盘池等待阈值 |
| `SERVER_MAP_PERSISTENCE_COALESCE_WINDOW_MS` | `3000` | 高频地图域合并窗口 |
| `SERVER_MAP_TIME_CHECKPOINT_INTERVAL_MS` | `300000` | 地图时间 checkpoint 周期 |
| `SERVER_MAP_TIME_CHECKPOINT_FLUSH_BATCH_SIZE` | `16` | 时间 checkpoint 批量 |
| `SERVER_MAP_MONSTER_RUNTIME_FLUSH_INTERVAL_MS` | `60000` | 妖兽运行态刷盘周期 |
| `SERVER_MAP_MONSTER_RUNTIME_SLOW_THRESHOLD_MS` | `1000` | 妖兽慢刷盘阈值 |
| `SERVER_PERSISTENCE_FLUSH_SLOW_THRESHOLD_MS` | 玩家 `120` / 地图 `100` | 慢刷盘阈值 |
| `SERVER_PERSISTENCE_FLUSH_SLOW_BACKOFF_MS` | `5000` | 慢刷盘退避 |
| `SERVER_MAP_TIME_CHECKPOINT_INTERVAL_TICKS` | `300` | 实例内时间脏标记 tick 间隔 |
| `SERVER_FLUSH_WAKEUP_KEY_LIMIT` | `20000` | flush 唤醒 key 内存上限 |

容量口径：`1024 / 1.5s` 约等于每个 scope 每秒 682 个任务认领能力。10000 实例在 300s `time` checkpoint 周期下约 34 个任务/秒，在 60s `monster_runtime` 周期下约 167 个任务/秒；默认实例 flush 预算可以覆盖这两类周期任务并保留 tile/overlay/fengshui 余量。玩家侧同样按任务合并后的 domain flush 预算设计，不按每次玩家输入逐条落库。

## Outbox

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `SERVER_OUTBOX_RUNTIME_ENABLED` | `true` | 是否启用 outbox runtime；仍受 role 守卫 |
| `SERVER_OUTBOX_DISPATCH_INTERVAL_MS` | `250` | 派发周期下限 |
| `SERVER_OUTBOX_DISPATCH_BATCH_SIZE` | `128` | 每轮派发批量 |
| `SERVER_OUTBOX_RETRY_DELAY_MS` | `5000` | 重试延迟 |
| `SERVER_OUTBOX_MAX_ATTEMPTS` | `8` | 最大尝试次数 |
| `SERVER_OUTBOX_LOCAL_DEDUPE_LIMIT` | `10000` | 本地去重缓存上限 |
| `SERVER_OUTBOX_DISPATCHER_ID` / `SERVER_OUTBOX_CONSUMER_ID` | `outbox-*:pid` | 未配置时使用进程级标识 |

## 节点、会话与恢复队列

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `SERVER_NODE_HEARTBEAT_INTERVAL_MS` | `5000` | 节点心跳间隔 |
| `SERVER_NODE_SUSPECT_AFTER_MS` | `15000` | 节点疑似失联阈值 |
| `SERVER_NODE_DEAD_AFTER_MS` | `30000` | 节点死亡阈值 |
| `SERVER_NODE_CAPACITY_WEIGHT` | `1` | 节点容量权重 |
| `SERVER_BOOTSTRAP_RECOVERY_CONCURRENCY` | `32` | 登录/恢复并发 |
| `SERVER_BOOTSTRAP_RECOVERY_TIMEOUT_MS` | `15000` | 单个恢复任务超时 |
| `SERVER_BOOTSTRAP_RECOVERY_QUEUE_MAX` | `5000` | 恢复队列长度 |
| `SERVER_SESSION_DETACH_EXPIRE_MS` | `30000` | 会话分离过期 |
| `SERVER_SESSION_REAPER_MAX_RETRIES` | `3` | 会话回收重试 |

## GM 可管理配置默认值

这些默认值来自 `packages/server/src/config/game-config-registry.ts`，可由 GM 配置表覆盖，默认均有上下限。

| 环境变量 | 默认值 |
|----------|--------|
| `SERVER_INSTANCE_WORKER_COUNT` | `6` |
| `SERVER_PERSISTENCE_WORKER_COUNT` | `4` |
| `SERVER_WORKER_POOL_FORCE_SYNC` | `false` |
| `SERVER_SESSION_DETACH_EXPIRE_MS` | `30000` |
| `SERVER_SESSION_REAPER_MAX_RETRIES` | `3` |
| `SERVER_CONSOLE_LOG_BUFFER_LINES` | `2000` |
| `SERVER_OUTBOX_DISPATCH_INTERVAL_MS` | `250` |
| `SERVER_OUTBOX_DISPATCH_BATCH_SIZE` | `128` |
| `SERVER_OUTBOX_RETRY_DELAY_MS` | `5000` |
| `SERVER_OUTBOX_MAX_ATTEMPTS` | `8` |
| `SERVER_OUTBOX_RUNTIME_ENABLED` | `true` |
| `SERVER_NODE_HEARTBEAT_INTERVAL_MS` | `5000` |
| `SERVER_NODE_SUSPECT_AFTER_MS` | `15000` |
| `SERVER_NODE_DEAD_AFTER_MS` | `30000` |
| `SERVER_GM_NETWORK_PERF_ENABLED` | `false` |
| `SERVER_GM_NETWORK_PERF_RESET_INTERVAL_MS` | `60000` |
| `SERVER_DEBUG_MOVEMENT` | `false` |
| `SERVER_HEAP_SNAPSHOT_TOP_LIMIT` | `20` |
| `SERVER_BUILDING_OPERATION_RESULTS_LIMIT` | `100` |
| `SERVER_FLUSH_WAKEUP_KEY_LIMIT` | `20000` |

## 部署与 Compose 默认值

| 文件 | 默认策略 |
|------|----------|
| `docker-stack.tencent.yml` | 生产 `server=api/off`，`server_worker=worker/worker`，密码和密钥均必须由环境变量提供 |
| `docker-compose.yml` | 默认 `server=api/off`；`DB_PASSWORD`、`REDIS_PASSWORD` 必填，不再给固定弱默认 |
| `deploy-latest.sh` / `deploy-prod.sh` | 首次部署自动生成数据库密码、玩家 token、GM token、GM 加密密钥、GM 密码；CORS 默认收敛到 `https://daojie.yuohira.com` |

## 工具和测试专用默认值

以下默认值只存在于 `packages/server/src/tools` 或 `scripts`，不进入生产 `dist/main.js` 运行路径：

| 类型 | 示例 | 说明 |
|------|------|------|
| smoke 端口 | `SERVER_SMOKE_PORT=3212/3312` | 本地测试端口 |
| smoke 怪物/地图 | `public:wildlands`、`m_dust_vulture` | 测试夹具 |
| GM smoke 密码 | `admin123` | 仅在本地 smoke 配合 `SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD=1` 使用 |
| bench 参数 | `BUILDING_ROOM_BENCH_SIZE=32`、`BUILDING_ROOM_BENCH_ITERATIONS=25` | 本地性能基准 |
| release 脚本探测 | `SERVER_AUTH_TRACE_ENABLED=1` | 验证脚本开启诊断输出 |

这些默认值不得复制到生产服务环境；release gate 会继续卡住生产 stack、compose 和部署脚本的关键默认策略。

# Worker Pool 运维手册

解决 Worker 崩溃、主线程 CPU 未下降、任务积压和降级定位问题。

Worker pool 默认开启，不是可选功能。

## 默认配置

| Pool | 默认 Worker 数 | 职责 |
|------|----------------|------|
| Encoding (CPU) | `min(N_cpu - 2, 6)` | A* 寻路、FOV 计算；AOI envelope 当前保持 JSON 直发 |
| Instance | `min(N_cpu - 2, 6)` | 怪物 AI intent proposals；空实例和无妖兽实例不提交任务，灵气流转仍在主线程 |
| Persistence | `2` | 持久化 write plan 构造 |

可调环境变量：`SERVER_ENCODING_WORKER_COUNT`、`SERVER_INSTANCE_WORKER_COUNT`、`SERVER_PERSISTENCE_WORKER_COUNT`

## 监控

GM 性能页 `perf.workerPool` 域查看各 pool 指标。

### 告警阈值

| 指标 | 阈值 | 含义 |
|---|---|---|
| `totalTimedOut` 持续增长 | > 10/min | Worker 负载过高，增加 worker 数 |
| `totalFailed` 持续增长 | > 5/min | Worker 代码异常，检查日志堆栈 |
| `p95Ms` | > 200ms | 单任务耗时过高，检查 payload 大小 |
| `inFlight` 持续 > poolSize | — | 任务积压 |
| `totalFallback` 持续增长 | > 20/min | Worker 不健康，频繁重启 |
| `activeWorkers` = 0 | — | 所有 worker 死亡 |

## 故障处理

### Worker 频繁崩溃

1. 检查日志中 `Worker N exited with code X` 堆栈
2. 确认是否 OOM（检查容器内存限制）
3. 修复后重启服务端
4. 期间任务自动 fallback 到主线程，玩家体验不受影响

### 主线程 CPU 未下降

1. 确认 `activeWorkers > 0`（为 0 说明 worker 全部死亡）
2. 检查 `totalFallback` 是否异常高
3. 检查 worker 数量配置（8 核建议 encoding=4, instance=4, persistence=2）
4. 检查是否误设了 `SERVER_WORKER_POOL_FORCE_SYNC=1`

### 启动期 Worker 拉起失败

1. 不影响 readiness，启动期失败会 WARN 并 1s 后重试
2. 持续失败检查 `dist/concurrency/workers/*.js` 是否存在（构建问题）

## 强制同步模式（仅故障定位）

```bash
SERVER_WORKER_POOL_FORCE_SYNC=1
```

**严格限制**：仅用于故障定位，定位完成后立即移除。不允许写入生产配置。

## 验证命令

```bash
# 等价性验证
pnpm --filter @mud/server compile && node packages/server/dist/tools/worker-pool-equivalence-smoke.js

# 性能基准
pnpm --filter @mud/server compile && node packages/server/dist/tools/worker-pool-perf-bench.js
```

## 已废弃环境变量（不再生效）

旧的 `SERVER_*_WORKER_ENABLED` 开关已经全部移除，不再读取也不再影响启动行为。

唯一保留的调试开关是：

```bash
SERVER_WORKER_POOL_FORCE_SYNC=1
```

它只用于故障定位，禁止写入生产配置模板或长期保留。

# Worker Pool 运维手册

> 适用范围：`packages/server/src/concurrency/` 多线程并行化基础设施
> 配套阅读：`docs/plans/服务端与客户端多线程并行化改造计划.md`
> 核心原则：**Worker pool 默认开启，不是可选功能**

---

## 1. 默认行为

服务端启动后**自动 spawn 三类 worker pool**，无需设置任何环境变量：

| Pool | 默认 Worker 数 | 职责 |
|------|----------------|------|
| Encoding (CPU) | `min(N_cpu - 2, 6)` | AOI envelope 编码、A* 寻路、FOV 计算 |
| Instance | `min(N_cpu - 2, 6)` | 实例 tick 子阶段（monster intent proposals） |
| Persistence | `2` | 持久化 write plan 构造 |

启动后 GM 性能页 `perf.workerPool` 域即可看到 `activeWorkers > 0`。

---

## 2. 可调参数

仅允许调整 worker 数量，不允许关闭 worker pool：

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `SERVER_ENCODING_WORKER_COUNT` | `min(N_cpu - 2, 6)` | CPU pool worker 数 |
| `SERVER_INSTANCE_WORKER_COUNT` | `min(N_cpu - 2, 6)` | Instance pool worker 数 |
| `SERVER_PERSISTENCE_WORKER_COUNT` | `2` | Persistence pool worker 数 |

---

## 3. 故障降级（唯一的"关闭"路径）

Worker pool 的降级是**容错机制**，不是产品配置：

### 3.1 任务级自动降级

单个任务在以下情况自动 fallback 到主线程同步执行：
- Worker 启动失败
- `postMessage` 异常
- 任务超过 `deadlineMs` 未返回
- Worker 进程异常退出

降级对调用方透明，指标记录到 `totalFallback`。

### 3.2 Worker 自动重启

Worker 异常退出后，pool 在 1s 后自动重 spawn 新 worker，不影响后续任务路由。

### 3.3 强制同步模式（仅故障定位）

```bash
# 临时禁用所有 worker pool，强制走主线程同步路径
SERVER_WORKER_POOL_FORCE_SYNC=1
```

**严格限制**：
- 此 env 仅用于故障定位，定位完成后**立即移除**
- **不允许**写入生产配置模板、docker-stack.yml 或 .env.production
- 长期设置此 env 等于放弃多核性能优势

---

## 4. 监控指标

GM 性能页 `perf.workerPool` 域：

```json
{
  "encoding": {
    "totalSubmitted": 12345,
    "totalCompleted": 12300,
    "totalTimedOut": 5,
    "totalFailed": 2,
    "totalFallback": 7,
    "p50Ms": 3.2,
    "p95Ms": 12.8,
    "inFlight": 2,
    "activeWorkers": 4
  },
  "instance": { "..." },
  "persistence": { "..." }
}
```

### 告警阈值建议

| 指标 | 阈值 | 含义 |
|---|---|---|
| `totalTimedOut` 持续增长 | > 10/min | Worker 负载过高，考虑增加 worker 数 |
| `totalFailed` 持续增长 | > 5/min | Worker 代码异常，检查日志堆栈 |
| `p95Ms` | > 200ms | 单任务耗时过高，检查 payload 大小 |
| `inFlight` 持续 > poolSize | — | 任务积压，增加 worker 数或降低提交频率 |
| `totalFallback` 持续增长 | > 20/min | Worker 不健康，检查是否频繁重启 |
| `activeWorkers` = 0 | — | 所有 worker 死亡，检查 OOM / 启动异常 |

---

## 5. 异常应急

### 5.1 Worker 频繁崩溃

1. 检查日志中 `Worker N exited with code X` 或 `Worker N error` 堆栈
2. 确认是否 OOM（检查容器内存限制）
3. 如果是代码 bug，修复后重启服务端
4. 期间任务自动 fallback 到主线程，玩家体验不受影响

### 5.2 主线程 CPU 未下降

1. 确认 GM 性能页 `activeWorkers > 0`（如果为 0，说明 worker 全部死亡）
2. 检查 `totalFallback` 是否异常高（说明 worker 频繁失败，任务都在主线程跑）
3. 检查 worker 数量配置是否合理（8 核机器建议 encoding=4, instance=4, persistence=2）
4. 检查是否误设了 `SERVER_WORKER_POOL_FORCE_SYNC=1`

### 5.3 启动期 Worker 拉起失败

1. Worker pool init 是非阻塞的，不影响 readiness
2. 启动期 worker 失败会记录 WARN 日志并在 1s 后重试
3. 如果持续失败，检查 `dist/concurrency/workers/*.js` 是否存在（构建问题）

---

## 6. 验证命令

```bash
# 等价性验证（worker 路径 vs 同步路径输出一致）
pnpm --filter @mud/server compile && node packages/server/dist/tools/worker-pool-equivalence-smoke.js

# 性能基准
pnpm --filter @mud/server compile && node packages/server/dist/tools/worker-pool-perf-bench.js

# 协议审计
pnpm audit:protocol

# 快速门禁
pnpm verify:quick
```

---

## 7. 已废弃的环境变量（不再生效）

以下 env 已在 Phase 8 收口中移除，设置它们不会产生任何效果：

- ~~`SERVER_WORKER_POOL_ENABLED`~~
- ~~`SERVER_ENCODING_WORKER_ENABLED`~~
- ~~`SERVER_AOI_ENVELOPE_WORKER_ENABLED`~~
- ~~`SERVER_AOI_ENVELOPE_WORKER_GRAY_PERCENT`~~
- ~~`SERVER_PATHFINDING_WORKER_ENABLED`~~
- ~~`SERVER_FOV_WORKER_ENABLED`~~
- ~~`SERVER_INSTANCE_WORKER_ENABLED`~~
- ~~`SERVER_PERSISTENCE_BUILD_WORKER_ENABLED`~~

客户端已废弃的 URL 参数：
- ~~`?disablePathWorker=1`~~
- ~~`?disableRenderWorker=1`~~

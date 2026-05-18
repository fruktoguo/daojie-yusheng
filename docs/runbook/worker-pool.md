# Worker Pool 运维手册

> 适用范围：`packages/server/src/concurrency/` 多线程并行化基础设施
> 配套阅读：`docs/plans/服务端与客户端多线程并行化改造计划.md`

---

## 1. 特性开关一览

| 开关 | 默认值 | 作用 |
|------|--------|------|
| `SERVER_WORKER_POOL_ENABLED` | `false` | 总开关：是否启用 worker_threads 池 |
| `SERVER_AOI_ENVELOPE_WORKER_ENABLED` | `false` | Phase 1：AOI envelope 以 JSON binary 发送 |
| `SERVER_AOI_ENVELOPE_WORKER_GRAY_PERCENT` | `100` | Phase 1 灰度比例（0-100），按 playerId hash 分流 |
| `SERVER_PATHFINDING_WORKER_ENABLED` | `false` | Phase 2：服务端寻路走 worker pool |
| `SERVER_FOV_WORKER_ENABLED` | `false` | Phase 3：FOV 计算走 worker pool |
| `SERVER_INSTANCE_WORKER_ENABLED` | `false` | Phase 4：实例 tick 子阶段走 worker pool |
| `SERVER_PERSISTENCE_BUILD_WORKER_ENABLED` | `false` | Phase 5：持久化序列化走 worker pool |

客户端调试参数：
| 参数 | 作用 |
|------|------|
| `?disablePathWorker=1` | 禁用客户端寻路 Web Worker |
| `?disableRenderWorker=1` | 禁用客户端 OffscreenCanvas 渲染 Worker |

---

## 2. 启用步骤

### 2.1 最小启用（仅 AOI binary）

```bash
SERVER_WORKER_POOL_ENABLED=true
SERVER_AOI_ENVELOPE_WORKER_ENABLED=true
SERVER_AOI_ENVELOPE_WORKER_GRAY_PERCENT=10  # 先灰度 10%
```

### 2.2 全量启用

```bash
SERVER_WORKER_POOL_ENABLED=true
SERVER_AOI_ENVELOPE_WORKER_ENABLED=true
SERVER_PATHFINDING_WORKER_ENABLED=true
SERVER_FOV_WORKER_ENABLED=true
SERVER_INSTANCE_WORKER_ENABLED=true
SERVER_PERSISTENCE_BUILD_WORKER_ENABLED=true
```

---

## 3. 异常应急

### 3.1 Worker 崩溃

**现象**：日志出现 `Worker N exited with code X` 或 `Worker N error`

**影响**：该 worker 负责的任务自动 fallback 到主线程同步执行，不影响玩家体验

**处理**：
1. 检查日志中的错误堆栈
2. Worker 会自动重启（`EncodingWorkerPoolService` 内置重启逻辑）
3. 如果持续崩溃，关闭对应开关

### 3.2 Worker 超时

**现象**：日志出现 `Worker N tick 超时` 或 GM 性能页 `totalTimedOut` 持续增长

**影响**：超时任务自动 fallback 到主线程，可能导致主线程 CPU 升高

**处理**：
1. 检查 GM 性能页 worker pool 指标中的 `p95Ms`
2. 如果 p95 > 200ms，说明 worker 负载过高
3. 考虑减少灰度比例或关闭开关

### 3.3 协议不一致

**现象**：客户端报 JSON.parse 错误或数据异常

**影响**：部分玩家看到异常数据

**处理**：
1. 立即关闭 `SERVER_AOI_ENVELOPE_WORKER_ENABLED`
2. 运行 `pnpm --filter @mud/server smoke:worker-pool-equivalence` 验证
3. 检查 `pnpm audit:protocol` 是否通过

---

## 4. 回退步骤

### 4.1 紧急回退（不重启）

所有开关设为 `false` 后，下一个 tick 立即生效（worker pool 的 `isEnabled()` 每次调用时检查）。

### 4.2 完全回退（重启）

```bash
# 关闭所有 worker 开关
SERVER_WORKER_POOL_ENABLED=false
# 重启服务
docker service update --force daojie-yusheng_server
```

---

## 5. 监控指标

GM 性能页 `perf.workerPool` 域包含三个 pool 的指标：

```json
{
  "encoding": { "totalSubmitted": 0, "totalCompleted": 0, "totalTimedOut": 0, "totalFailed": 0, "totalFallback": 0, "p50Ms": 0, "p95Ms": 0, "inFlight": 0, "activeWorkers": 0 },
  "instance": { ... },
  "persistence": { ... }
}
```

**关注指标**：
- `totalTimedOut` 持续增长 → worker 负载过高
- `totalFailed` 持续增长 → worker 代码异常
- `p95Ms` > 200 → 考虑减少负载或增加 worker 数
- `inFlight` 持续 > poolSize → 任务积压

---

## 6. 验证命令

```bash
# equivalence smoke（验证 worker/同步路径输出一致）
pnpm --filter @mud/server compile && node packages/server/dist/tools/worker-pool-equivalence-smoke.js

# 协议审计
pnpm audit:protocol

# 快速门禁
pnpm verify:quick
```

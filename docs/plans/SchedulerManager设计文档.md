# SchedulerManager 设计文档
> 目标：把当前分散在 `ServerLifecycleCoordinatorService`、`WorldTickService`、`FlushTaskRuntimeService`、`BackgroundWorkerRuntimeService`、`OutboxDispatcherRuntimeService` 等处的调度逻辑，收敛为一个统一、可观测、可控、可扩展的商业级调度器。

## 1. 设计目标
- 统一管理周期任务、延迟任务、条件触发任务、DB 认领任务。
- 将启动顺序、执行节拍、反压、重试、暂停、恢复、关停放到同一控制面。
- 保留现有领域服务作为执行器，不把业务逻辑硬塞进调度器。
- 支持多节点、单 leader、DB claim、fencing、幂等、退避和资源反压。
- 提供 GM 可观测和运维控制入口。

## 2. 现状与痛点
### 现有能力
- `ServerLifecycleCoordinatorService`：启动链路和闸门。
- `WorldTickService`：世界主循环。
- `FlushTaskRuntimeService`：dirty 采集、ledger 认领、flush 执行。
- `BackgroundWorkerRuntimeService`：后台定时 worker orchestrator。
- `OutboxDispatcherRuntimeService`：outbox 派发。
- `FlushLedgerService`：claim / retry / flushed 的可靠调度。
### 主要问题
- 调度策略分散在多个 service，缺少统一 registry。
- 不同任务的节拍、优先级、反压、状态上报格式不一致。
- 缺少统一的 pause / resume / drain / disable 语义。
- GM 面板看到的是碎片化状态，不是统一调度视图。
- 难以把 tick、flush、outbox、cleanup、backup 挂到同一控制面上。

## 3. 设计原则
1. **领域执行器与调度器分离**：SchedulerManager 只管调度，不承载业务真源。
2. **状态驱动优先于纯定时器**：能落库的任务就落库，不能丢的任务不只靠内存 timer。
3. **单飞 + 幂等 + 退避**：任何任务都必须具备重入保护和失败退避。
4. **闸门统一**：traffic / tick / flush / worker 由统一生命周期闸门控制。
5. **可观测优先**：每个任务都要有 heartbeat、last success、last failure、processed count、next run。
6. **分层扩展**：先统一编排，再逐步把现有任务迁移到 registry。

## 4. 目标架构
```text
ServerLifecycleCoordinatorService
  └── SchedulerManagerService
        ├── TaskRegistry
        ├── TriggerPlanner
        ├── ExecutionGovernor
        ├── StateStore
        └── ControlPlane / Metrics
              ├── WorldTickTaskAdapter
              ├── FlushTaskAdapter
              ├── OutboxTaskAdapter
              ├── BackgroundWorkerTaskAdapter
              └── MaintenanceTaskAdapter
```
### 角色定义
- **SchedulerManagerService**：统一调度核心，负责注册、启动、暂停、恢复、关停、触发、执行编排。
- **TaskRegistry**：任务元数据注册表，保存定义、节拍、优先级、并发、重试策略。
- **TriggerPlanner**：根据 interval / timeout / ledger / manual / state change 计算下一次调度。
- **ExecutionGovernor**：根据 DB pool waiting、lock wait、CPU、backlog 决定是否放行或降频。
- **StateStore**：保存任务状态和最近一次执行摘要；可先内存、后 DB 化。
- **TaskAdapter**：把现有领域 service 包装成 SchedulerTask 的执行端。

## 5. 完整链路
### 5.1 启动链路
1. `ServerLifecycleCoordinatorService` 完成基础注入。
2. 读取 runtime role、game config、worker 配置。
3. `SchedulerManagerService.initialize()` 读取 registry 并恢复状态。
4. 生命周期闸门按顺序打开：`trafficOpen` → `tickOpen` → `flushOpen` → `workerOpen`。
5. Manager 为可运行任务创建计划器。
6. 任务在满足闸门后进入首轮执行。
### 5.2 运行链路
1. 触发源到达：interval、timeout、DB backlog、dirty signal、manual admin trigger。
2. `TriggerPlanner` 生成待执行任务。
3. `ExecutionGovernor` 检查是否已运行、是否 pause、是否触发 backpressure、是否满足闸门。
4. `SchedulerManager` 选择对应 `TaskAdapter` 执行。
5. 执行器返回 processed count、duration、failure、next hint。
6. `StateStore` 更新 last heartbeat / success / failure / processed count / next run。
7. `Metrics` 上报到 GM worker 状态和容量面板。
8. 失败进入 retry / backoff / dead-letter 或诊断通道。
### 5.3 关停链路
1. 收到 drain / SIGTERM / module destroy。
2. `SchedulerManager` 进入 stopping，停止接受新触发。
3. 等待 in-flight 任务完成，或到达关停 deadline。
4. 保存最终状态摘要。
5. 交给现有 shutdown drain 链路完成世界关停。

## 6. 任务模型
```ts
interface SchedulerTaskDefinition {
  id: string;
  kind: 'tick' | 'flush' | 'outbox' | 'maintenance' | 'manual';
  scope: 'global' | 'player' | 'instance' | 'node';
  enabled: boolean;
  priority: 'high' | 'normal' | 'low';
  intervalMs?: number;
  timeoutMs?: number;
  maxConcurrency?: number;
  retryPolicy?: RetryPolicy;
  backoffPolicy?: BackoffPolicy;
  leaderMode?: 'single' | 'sharded' | 'claim';
}
```
### 必备状态
- `enabled` / `running` / `paused`
- `lastHeartbeatAt` / `lastSuccessAt` / `lastFailureAt`
- `lastFailure` / `processedCount`
- `nextRunAt` / `backlogCount` / `lastDurationMs`

## 7. 实现策略
### 7.1 先做壳，再迁移
先抽一个 `SchedulerManagerService` 壳，只包裹现有服务，不改领域逻辑。
### 7.2 现有服务如何接入
- `WorldTickService`：作为 tick adapter，保留递归 `setTimeout`，由 manager 统一开关。
- `FlushTaskRuntimeService`：作为 flush adapter，继续负责 ledger claim 和消费，manager 负责启动/暂停/反压。
- `BackgroundWorkerRuntimeService`：改成 registry 驱动，不再自行决定哪些任务能跑。
- `OutboxDispatcherRuntimeService`：改成 scheduler task，延迟与 backoff 由 manager 决定。
- `MapPersistenceFlushService` / `PlayerPersistenceFlushService`：保留执行逻辑，不负责全局节拍。
### 7.3 状态落地顺序
- 第一阶段：内存 state store。
- 第二阶段：GM 侧只读快照。
- 第三阶段：关键调度状态落 DB，支持重启恢复。

## 8. 目录建议
```text
packages/server/src/scheduler/
├── scheduler-manager.service.ts
├── scheduler-registry.service.ts
├── scheduler-governor.service.ts
├── scheduler-state.service.ts
├── scheduler.types.ts
├── adapters/
│   ├── world-tick.adapter.ts
│   ├── flush-task.adapter.ts
│   ├── outbox.adapter.ts
│   └── background-worker.adapter.ts
└── scheduler.module.ts
```

## 9. 修改计划
### Phase 1：建立统一骨架
- [x] 新增 `packages/server/src/scheduler/` 基础模块。
- [x] 定义 `SchedulerTaskDefinition`、`SchedulerTaskRuntimeState`、`RetryPolicy`、`BackoffPolicy`。
- [x] 实现 `SchedulerManagerService`、`SchedulerRegistryService`、`SchedulerStateService`。
- [x] 接入 `StartupBarrierService`，统一开闸/关闸。
  - 验证（2026-05-22）：`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/scheduler-manager-smoke.js` 通过；当前仅证明 Phase 1 骨架、registry/state、StartupBarrier 快照、pause/失败记录/stop，不证明 Phase 2 迁移。
### Phase 2：迁移只读调度
- [x] 把 `BackgroundWorkerRuntimeService` 改成 registry 驱动。
- [x] 把 `OutboxDispatcherRuntimeService` 改为 scheduler task adapter。
- [x] 把 `WorldTickService` 的启动/停止交给 manager 管控。
  - 验证（2026-05-22）：`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/background-worker-runtime-smoke.js`、`node packages/server/dist/tools/world-tick-scheduler-smoke.js` 通过；当前仅证明 registry 接入、运行状态记录、pause/stop 控制与 outbox/tick 的 scheduler 注册，不证明后续反压与 GM 快照。
### Phase 3：迁移受控反压
- [x] 新增 `ExecutionGovernor`，读取 flush pool waiting、lock wait、backlog、CPU。
- [x] 为 tick / flush / outbox 配置不同 priority 和 backoff。
- [x] 在 GM worker 面板展示统一调度快照。
  - 验证（2026-05-22）：`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/scheduler-governor-smoke.js`、`node packages/server/dist/tools/gm-worker-scheduler-smoke.js` 通过；当前仅证明 governor 读取与低优先级反压、GM worker 可见 scheduler 快照，不证明 Phase 4 恢复控制面。
### Phase 4：状态恢复与可控运维
- [x] 为关键任务增加 DB/state store 恢复。
- [x] 支持 pause / resume / manual trigger / drain / disable。
- [x] GM 页面增加任务明细和手动控制。
  - 验证（2026-05-22）：`pnpm --filter @mud/server compile`、`node packages/server/dist/tools/scheduler-control-smoke.js`、`node packages/server/dist/tools/gm-worker-scheduler-smoke.js` 通过；当前仅证明 scheduler 快照可从持久化摘要恢复、GM 控制面能操作 scheduler，不证明 Phase 5 清理旧入口已完成。
### Phase 5：清理旧入口
- [ ] 清理重复的 interval/schedule 逻辑。
- [ ] 保留领域执行器，移除各自手工编排分支。
- [ ] 补齐 smoke、release gate、with-db proof。

## 10. 验证矩阵
- `pnpm verify:quick`
- `pnpm verify:client`
- `pnpm verify:release:with-db`
- `background-worker-runtime-smoke`
- `flush-task-worker-db-smoke`
- `outbox-dispatcher-worker-smoke`
- `world-tick-smoke` / `runtime-smoke`
- 新增 SchedulerManager smoke：启停链路、pause / resume、backpressure 降频、失败退避、重启恢复。

## 11. 完成判定
- 所有关键调度任务都能在统一 registry 中看到。
- 调度状态能从 GM 面板解释“为什么跑 / 为什么停 / 为什么慢”。
- 同类任务不再各自维护重复 timer 逻辑。
- flush、outbox、cleanup、backup、tick 都能被统一开关和统一观测。
- 多副本场景下仍保持幂等、claim 和 fencing 正确。

## 12. 非目标
- 不把业务真源逻辑塞进 SchedulerManager。
- 不把 SchedulerManager 做成通用工作流引擎。
- 不替代 DB ledger、outbox、session、world runtime 自身的领域真源。
- 不追求一次性重写，先收敛再替换。

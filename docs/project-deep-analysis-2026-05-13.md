# 道劫余生 深度架构分析与潜在问题报告

**分析日期**: 2026-05-13  
**分析范围**: packages/server（持久化、网络、运行时）、packages/shared（协议、类型）、packages/client（网络、渲染、运行时）  
**基于**: 代码实际阅读，非静态扫描

---

## 一、架构总览（当前实际状态）

### 1.1 服务端分层

```
WorldTickService (1Hz setInterval)
  └─ WorldRuntimeFrameService
       └─ WorldRuntimeInstanceTickOrchestrationService
            └─ 遍历所有 MapInstanceRuntime，按 speed 累积 tick
                 └─ 每个实例内部：资源流动 → 阵法 → 建筑 → 传送 → 怪物AI → 玩家修炼
  └─ WorldSyncService.flushConnectedPlayers()
       └─ 遍历所有 binding → getPlayerView → createDeltaEnvelope → emit
  └─ RuntimeGmStateService.flushQueuedStatePushes()
```

### 1.2 持久化分层

```
运行时内存态 (tick 内只读写内存)
  ↓ FlushWakeupService 收集脏信号
  ↓ PlayerFlushLedgerService (claim/markFlushed 分布式调度)
  ↓ PlayerPersistenceFlushService (26张分域表写入)
  ↓ OutboxDispatcherRuntimeService (250ms 轮询 outbox_event 表)
  ↓ PostgreSQL 真源
```

### 1.3 网络同步分层

```
WorldProjectorService (per-player projection cache)
  → projector-diff.ts (diffPlayerEntries/diffMonsterEntries/...)
    → 生成 add/remove/update patch
      → protobuf 编码 (TickPayload)
        → Socket.IO emit
```

---

## 二、高优先级潜在问题

### 2.1 WorldRuntimeService 巨型 Facade（1111行，~30个委托服务）

**位置**: `packages/server/src/runtime/world/world-runtime.service.ts`

**现状**: 该服务注入了约 30 个子服务，自身 1111 行，几乎所有方法都是一行委托调用。它是整个运行时的"上帝对象"入口，所有外部调用者（网络层、持久化层、GM 层）都通过它访问世界状态。

**问题**:
- 任何子服务的接口变更都需要同步修改 facade
- 构造器注入列表极长，NestJS DI 容器启动时解析成本高
- 所有方法签名都是 `any`，完全丧失类型安全
- 子服务之间通过 `this`（即 WorldRuntimeService 实例）互相访问，形成隐式循环依赖

**风险**: 重构困难度随时间指数增长；新增功能时容易在 facade 层引入不一致

**建议**: 按调用者分组，将 facade 拆为 3-4 个领域入口（PlayerAccess、InstanceAccess、QueryAccess、WriteAccess），各自只暴露对应消费者需要的方法子集

---

### 2.2 MapInstanceRuntime 单文件 6958 行

**位置**: `packages/server/src/runtime/instance/map-instance.runtime.ts`

**现状**: 单个文件包含地图实例的全部运行态逻辑：地块平面、占位检测、怪物 AI（aggro/chase/skill/respawn）、战斗触发、建筑、资源刷新、灵气流动、AOI 广播、持久化脏域追踪。

**问题**:
- 7000 行单文件，认知负载极高
- 怪物 AI 逻辑（视野追踪、技能选择、特殊 Boss 行为如幻灵真人 8 个技能 ID 硬编码）与地图基础设施混在一起
- 已有 `map-instance-building.delegate.ts` 和 `map-instance-monster-advancer.ts` 的拆分尝试，但主体仍在单文件
- 特殊 Boss 技能 ID 硬编码（HUANLING_* 系列 9 个常量）说明内容与逻辑耦合

**风险**: 
- 修改怪物 AI 时容易误触地图基础设施
- 新增地形类型或建筑逻辑时需要在 7000 行中定位插入点
- 5000 并发 × 10000 实例场景下，单文件内的性能热点难以隔离优化

**建议**: 
- 怪物 AI 完全提取到 `map-instance-monster.delegate.ts`
- 灵气/资源流动提取到 `map-instance-aura.delegate.ts`
- Boss 特殊行为通过内容模板驱动，而非硬编码技能 ID

---

### 2.3 网络层核心服务全量 `any` 注入

**位置**: 
- `packages/server/src/network/world-sync.service.ts`（7 个 `any` 注入）
- `packages/server/src/network/world-sync-envelope.service.ts`（4 个 `any` 注入）
- `packages/server/src/network/world.gateway.ts`（大量 `any`）

**现状**: 网络同步层的核心服务构造器全部使用 `@Inject(XxxService) xxx: any` 模式，完全绕过 TypeScript 类型检查。

**问题**:
- 调用方法时无法获得参数类型提示和返回值类型
- 重构子服务接口时，编译器不会报错，只能在运行时发现问题
- 与 AGENTS.md 中"禁止 `any`"的规范直接冲突

**风险**: 网络同步是每 tick 必经的热路径，类型错误会导致全服玩家收到错误数据或断连

**建议**: 为每个注入定义 Port 接口（项目中已有 `WorldRuntimePort`、`WorldSyncPort` 等模式），逐步替换 `any`

---

### 2.4 Tick 内同步遍历所有在线玩家

**位置**: `packages/server/src/network/world-sync.service.ts` → `flushConnectedPlayers()`

**现状**: 每个 tick 结束后，同步遍历所有 binding，对每个玩家执行：
1. `getPlayerView()` — 构建视野快照
2. `refreshPlayerContextActions()` — 刷新上下文动作
3. `syncFromWorldView()` — 同步玩家运行时
4. `createDeltaEnvelope()` — 生成 diff
5. `emitEnvelope()` — 发包
6. `emitAuxDeltaSync()` — 辅助同步
7. `emitQuestSyncIfChanged()` — 任务同步
8. `emitPendingNotices()` — 通知
9. `emitPendingPlayerStatisticRecords()` — 统计

**问题**: 5000 玩家时，单 tick 内需要执行 5000 × 9 步操作。如果单个玩家的 diff 计算耗时 0.1ms，总计 500ms，已经占满 1Hz tick 的全部预算。

**风险**: 
- tick 超时导致 `tickInFlight` 锁死，后续 tick 被跳过
- 玩家越多，每个玩家感知到的延迟越高（排队效应）

**建议**:
- 将 flushConnectedPlayers 改为分批处理（每 tick 处理一部分玩家，轮转）
- 或者将 diff 计算移到 tick 外的异步队列
- 对无变化的玩家（视野内无实体变动）跳过 diff 计算

---

### 2.5 Projector Diff 每帧全量比较

**位置**: `packages/server/src/network/projector-diff.ts`

**现状**: `diffPlayerEntries` / `diffMonsterEntries` 等函数每帧对 previous Map 和 current Map 做全量遍历比较，逐字段检查变化。

**问题**:
- 即使视野内 50 个实体都没变化，仍然需要遍历 50 次并逐字段比较
- 没有利用 revision/dirty flag 跳过未变化的实体
- `isSameItem` / `isSameBuffEntry` 等比较函数做深度对象比较

**风险**: 5000 玩家 × 平均视野 30 实体 = 每 tick 15 万次实体比较

**建议**:
- 在实体上维护 revision 号，只有 revision 变化时才进入 diff
- 或者在 MapInstanceRuntime 层维护 per-tick 变化集合（changedEntityIds），diff 时只处理变化集合

---

### 2.6 断线重连恢复队列并发上限偏高

**位置**: `packages/server/src/network/world-session-recovery-queue.service.ts`

**现状**: 默认并发 32，超时 15s。VIP > recent > normal 优先级排序。

**问题**:
- 32 个并发恢复任务，每个可能涉及数据库读取（加载玩家快照）
- 如果服务器重启后 5000 玩家同时重连，队列瞬间积压 5000 个任务
- 没有看到队列长度上限或拒绝策略

**风险**: 大规模重连风暴时，数据库连接池（默认 max=24）被恢复任务占满，正常玩家操作被阻塞

**建议**:
- 添加队列长度上限（如 500），超出时返回"服务器繁忙"让客户端延迟重试
- 恢复任务的数据库查询使用独立连接池或限流
- 考虑分批唤醒：服务器重启后不立即接受所有重连，而是按批次放行

---

## 三、中优先级潜在问题

### 3.1 Outbox 轮询间隔 250ms 与 Tick 1Hz 的时序竞争

**位置**: `packages/server/src/persistence/outbox-dispatcher-runtime.service.ts`

**现状**: Outbox 每 250ms 轮询一次 `outbox_event` 表，认领并分发事件。Tick 每 1000ms 执行一次。

**问题**: 
- Outbox 轮询和 tick 执行在同一个 Node.js 事件循环中
- 如果 outbox 消费者执行耗时操作（如发邮件、市场结算），可能阻塞 tick 的 setInterval 回调
- `running` 标志位防止并发，但不防止单次执行超时

**建议**: 为 outbox 消费添加单次执行超时（如 5s），超时后释放 running 锁并记录告警

---

### 3.2 PlayerPersistenceFlushService 26 张表的事务边界

**位置**: `packages/server/src/persistence/player-persistence-flush.service.ts`

**现状**: 玩家持久化涉及 26 张表（player_presence、player_wallet、player_inventory_item、player_equipment_slot、player_quest_progress、player_active_job、player_enhancement_record、player_mail 等）。

**问题**:
- 如果 flush 过程中部分表写入成功、部分失败，玩家数据处于不一致状态
- 没有看到显式的事务包裹（BEGIN/COMMIT）将所有表写入原子化
- FlushLedger 的 claim/markFlushed 机制可以重试，但重试时可能重复写入已成功的表

**风险**: 崩溃恢复后玩家背包和装备不一致（如装备已卸下但背包没收到物品）

**建议**: 确认 flush 是否在单个 PostgreSQL 事务内完成；如果不是，需要设计补偿机制或幂等写入

---

### 3.3 客户端 MapRuntime requestAnimationFrame 无节流

**位置**: `packages/client/src/game-map/runtime/map-runtime.ts`

**现状**: MapRuntime 使用 `requestAnimationFrame` 驱动渲染循环，有 `targetFps` 字段和 `MAP_TARGET_FPS_RANGE` 配置。

**问题**:
- 高刷新率显示器（144Hz/240Hz）上，渲染循环会以 144/240 FPS 运行
- 如果 targetFps 节流逻辑有 bug 或未生效，移动端电池消耗严重
- 服务端只有 1Hz 更新，客户端 60+ FPS 渲染的大部分帧都是重复绘制

**建议**: 确认 targetFps 节流是否正确实现；考虑在无变化时降低到 10-15 FPS（idle mode）

---

### 3.4 Protobuf Schema 内联字符串定义

**位置**: `packages/shared/src/network-protobuf-schema.ts`

**现状**: Protobuf schema 以模板字符串形式内联在 TypeScript 文件中，运行时通过 `protobufjs` 解析。

**问题**:
- 每次 import 该模块时都需要解析 protobuf schema 字符串
- 没有预编译的 `.proto` → `.js` 静态代码生成
- schema 变更时无法通过 protobuf 工具链做兼容性检查

**风险**: 
- 启动时解析开销（一次性，影响不大）
- 更严重的是：字段编号变更或删除时没有工具检测向后兼容性破坏

**建议**: 
- 将 schema 提取为 `.proto` 文件，使用 `pbjs` 预编译为静态代码
- 添加 CI 步骤检查 proto 兼容性（`buf breaking`）

---

### 3.5 WorldSyncService 中 clearPurgedPlayerCaches 的时序

**位置**: `packages/server/src/network/world-sync.service.ts` 行 113-116

**现状**: `flushConnectedPlayers()` 开头调用 `clearPurgedPlayerCaches()`，消费已断开玩家的 ID 列表并清理 projector 缓存。

**问题**: 如果玩家在 tick 中间断开，其 projector 缓存在下一个 tick 开头才被清理。在这个窗口期内，如果有其他逻辑尝试为该玩家生成 envelope，会使用过期的 projection cache。

**风险**: 极端情况下可能向已断开的 socket 发送数据（socket 已关闭，发送会静默失败，不会崩溃但浪费 CPU）

**建议**: 低风险，但可以在 disconnect handler 中立即清理 projector cache

---

### 3.6 怪物 AI 硬编码 Boss 行为

**位置**: `packages/server/src/runtime/instance/map-instance.runtime.ts` 行 32-45

**现状**: 幻灵真人（HUANLING_ZHENREN）的 9 个技能 ID 和特殊行为逻辑硬编码在地图实例运行时中。

**问题**:
- 每新增一个有特殊行为的 Boss，都需要修改 7000 行的核心文件
- 特殊行为逻辑与通用怪物 AI 混在一起，增加认知负载
- 无法通过配置编辑器调整 Boss 行为

**建议**: 设计 Boss 行为脚本系统（可以是简单的状态机配置），将特殊行为从硬编码迁移到内容模板

---

### 3.7 数据库连接池共享问题

**位置**: `packages/server/src/persistence/database-pool.provider.ts`

**现状**: DatabasePoolProvider 按名称懒创建连接池，默认 max=24。PlayerFlushLedgerService 使用名为 `player-flush-ledger` 的独立池。

**问题**:
- 默认池（max=24）被所有非 flush-ledger 的持久化服务共享
- 5000 并发玩家场景下，如果多个 flush worker 同时执行，加上 outbox 轮询、恢复队列、GM 查询，24 个连接可能不够
- `PlayerPersistenceFlushService` 在构造器中直接 `new Pool()`（行 11），绕过了 DatabasePoolProvider

**风险**: 连接池耗尽导致持久化延迟或失败

**建议**: 
- 统一通过 DatabasePoolProvider 管理所有连接池
- 为不同优先级的操作分配独立池（flush 池、query 池、outbox 池）
- 监控连接池使用率

---

## 四、低优先级但值得关注的问题

### 4.1 客户端 SocketManager 单例无重连状态机

**位置**: `packages/client/src/network/socket.ts`

**现状**: SocketManager 依赖 Socket.IO 内置的重连机制（`SOCKET_RECONNECTION_ATTEMPTS`、`SOCKET_RECONNECTION_DELAY_MS`）。

**问题**: 没有看到显式的连接状态机（connecting → connected → disconnected → reconnecting → failed），UI 层可能无法精确展示连接状态。

---

### 4.2 server-tick 客户端估算精度

**位置**: `packages/client/src/runtime/server-tick.ts`

**现状**: 客户端通过 `performance.now()` 差值估算当前服务端 tick，用于冷却倒计时显示。

**问题**: 如果网络延迟波动大（如移动网络），估算 tick 可能与实际服务端 tick 偏差 1-2 个 tick，导致冷却显示闪烁。

**建议**: 可以在每次收到 envelope 时校准，已有 `syncEstimatedServerTick` 机制，确认调用频率即可。

---

### 4.3 Flush Worker 数量与调度

**位置**: `packages/server/src/runtime/world/worker/` 目录下 14 个 worker

**现状**: 14 个独立 worker 负责不同域的 flush：
- player-state-flush
- player-anchor-checkpoint-flush
- instance-ground-item-flush
- instance-container-flush
- instance-monster-runtime-flush
- instance-tile-damage-flush
- instance-resource-flush
- instance-overlay-flush
- instance-state-purge
- instance-ground-item-ttl
- mail-soft-delete-purge
- mail-expiration-cleanup
- checkpoint-compaction
- asset-audit-log-retention

**问题**: 14 个 worker 各自有独立的定时器，可能在同一时刻同时触发，造成数据库写入尖峰。

**建议**: 考虑错峰调度（stagger），或使用统一的 flush 调度器按优先级排队执行。

---

### 4.4 Combat Pipeline 随机数确定性

**位置**: `packages/server/src/runtime/combat/combat-pipeline.ts`

**现状**: 战斗管线使用 `cryptoRandom`（来自 `combat-resolution.helpers`），注释说明"保证 smoke 可注入"。

**优点**: 随机数消费顺序固定（broken → dodged → resolved → crit），支持确定性回放。

**潜在问题**: 如果 `cryptoRandom` 使用 `crypto.getRandomValues()`，在高并发战斗时可能成为性能瓶颈（crypto 随机比 Math.random 慢 10-100x）。

**建议**: 确认是否在 tick 热路径中使用 crypto 随机；如果是，考虑使用 seeded PRNG（如 xoshiro256）替代，保留确定性的同时提升性能。

---

## 五、架构亮点（做得好的地方）

1. **战斗管线设计**: Stage Pipeline 模式，纯函数环节，零分配 context 贯穿，支持 smoke 回归测试
2. **持久化分层**: Flush Ledger + Outbox + Durable Operation 三层保障，claim/retry 机制完善
3. **网络同步分层**: Projector + Diff + Protobuf 编码，增量同步设计合理
4. **Tick 编排**: 支持 per-instance tick speed，维护模式跳过，lease 检查防止脑裂
5. **恢复队列**: VIP/recent/normal 优先级，并发控制，超时告警
6. **技艺管线**: 策略模式 + 统一生命周期（start/tick/interrupt/cancel），扩展性好
7. **结构化通知**: 服务端只发数据 key+vars，客户端负责 i18n 和渲染，国际化友好

---

## 六、优先级排序建议

| 优先级 | 问题 | 影响 | 工作量 |
|--------|------|------|--------|
| P0 | 2.4 Tick 内同步遍历 5000 玩家 | 高并发时 tick 超时 | 大 |
| P0 | 2.5 Projector Diff 无 dirty flag | 热路径性能 | 中 |
| P1 | 2.3 网络层全量 any | 类型安全 | 大（渐进） |
| P1 | 2.6 重连风暴无背压 | 服务器重启后雪崩 | 小 |
| P1 | 3.2 Flush 事务边界 | 数据一致性 | 中 |
| P2 | 2.1 WorldRuntimeService 巨型 facade | 可维护性 | 大 |
| P2 | 2.2 MapInstanceRuntime 7000 行 | 可维护性 | 大 |
| P2 | 3.7 连接池管理 | 高并发稳定性 | 小 |
| P3 | 3.4 Protobuf 内联 schema | 工程规范 | 中 |
| P3 | 3.6 Boss 行为硬编码 | 内容扩展性 | 中 |
| P3 | 4.3 Worker 错峰调度 | DB 写入尖峰 | 小 |

---

## 七、与上次审查（2026-05-12）的关系

上次审查侧重安全和代码规范（GM 密码、Redis 无密码、any 类型、JWT 密钥、频率限制 GC）。本次分析侧重**架构层面的性能瓶颈和可扩展性风险**，两份报告互补：

- 上次的 2.1（626 处 any）→ 本次 2.3 聚焦到网络层核心路径的 any 问题
- 上次的 2.3（频率限制无 GC）→ 本次 2.6 扩展到恢复队列的类似问题
- 本次新增：tick 性能瓶颈、projector diff 优化、flush 事务边界、连接池管理等

---

*本报告基于代码静态阅读，部分性能结论需要在 5000 并发负载下实测验证。*

# 服务端持久化落盘问题审计

> 审计时间：2026-03  
> 范围：`packages/server/src/persistence/` + `packages/server/src/runtime/` 中所有涉及数据落盘的代码路径  
> 关注点：数据丢失、写入不完整、崩溃后无法恢复、并发写入冲突、幂等性缺失

---

## 一、已发现问题

### P1 — 关停顺序竞态：tick 超时强制关停可能丢失脏数据

**文件**：`runtime/tick/world-tick.service.ts:185-195`

**描述**：`beforeApplicationShutdown` 设置 5 秒超时等待当前 tick 完成。若 tick 在 5 秒内未结束（如 tick 内有慢 IO 或大量计算），强制继续关停流程。此时 tick 中可能已修改了玩家/实例的内存状态并标记了 dirty，但 flush 服务的 `beforeApplicationShutdown` 可能已经执行完毕（NestJS 关停 hook 的调用顺序取决于模块注册顺序，不保证 tick 先于 flush 完成）。

**影响**：极端情况下，tick 超时后产生的脏数据永远不会被 flush 到数据库。

**严重度**：中高（生产环境 tick 通常远小于 5 秒，但高负载或 DB 慢查询时可能触发）

---

### P2 — 市场操作队列无超时保护

**文件**：`runtime/market/market-runtime.service.ts:107-128`

**描述**：`beforeApplicationShutdown` 直接 `await this.marketOperationQueue`。该队列是一个 Promise 链，如果链中某个 promise 永远不 resolve（如数据库连接池耗尽、网络分区），关停流程将永久阻塞。

**影响**：进程无法正常退出，可能需要 SIGKILL 强杀，导致所有未 flush 的数据丢失。

**严重度**：中（需要数据库完全不可用才会触发，但一旦触发后果严重）

---

### P3 — 市场 restoreMutationContext 与数据库状态不一致

**文件**：`runtime/market/market-runtime.service.ts:3286-3371`

**描述**：市场 mutation 流程为：
1. 拍内存快照 → 2. 修改内存 → 3. `persistMutation` 事务写库 → 4. `flushAffectedPlayers`

如果步骤 3 成功但步骤 4 中某个玩家 flush 失败，不会回滚（设计如此，dirty 标记保留）。但如果步骤 3 的事务**部分提交**（理论上 PostgreSQL 事务是原子的，不会部分提交），或者步骤 3 抛出非事务错误（如连接断开后 COMMIT 状态未知），`restoreMutationContext` 会回滚内存状态，但数据库可能已经写入了数据。

**影响**：内存与数据库不一致。下次从数据库恢复时会加载已提交的数据，但当前运行时已回滚。

**严重度**：低中（PostgreSQL 事务原子性保证了大多数场景安全，但网络分区导致 COMMIT 状态未知时存在风险窗口）

---

### P4 — 玩家 flush 失败后 dirty 标记保留但无告警升级

**文件**：`persistence/player-persistence-flush.service.ts:305-310`

**描述**：玩家 flush 失败时仅 `logger.error`，dirty 标记保留等下一轮重试。但如果失败原因是持续性的（如该玩家数据格式异常导致序列化失败），dirty 标记会永远保留，每轮 flush 都失败，形成"永久脏"状态。没有机制将持续失败的玩家升级为告警或隔离。

**影响**：特定玩家数据可能永远无法落盘，且日志中的 error 可能被淹没。

**严重度**：中

---

### P5 — flush 降级退避期间的数据丢失窗口

**文件**：`persistence/player-persistence-flush.service.ts:407-419`、`persistence/map-persistence-flush.service.ts:266-287`

**描述**：当 flush 耗时超过阈值时，触发降级退避（`flushThrottleUntilAt`），在退避期间跳过所有 flush。如果此时进程崩溃（OOM、SIGKILL），退避期间积累的所有脏数据将丢失。

**影响**：高负载时恰好崩溃会丢失更多数据。

**严重度**：中（退避是为了保护数据库，但增加了崩溃时的数据丢失窗口）

---

### P6 — FlushWakeupService 内存 Set 有上限截断

**文件**：`persistence/flush-wakeup.service.ts:42-54`

**描述**：`wakeupKeys` Set 有最大容量限制（默认 20000），超出时按 FIFO 淘汰最早的 key。被淘汰的 key 对应的玩家/实例可能错过本轮唤醒信号。

**影响**：极高并发时，部分脏实体的 flush 可能被延迟到下一个完整扫描周期。

**严重度**：低（wakeup 只是提示信号，flush 周期扫描仍会兜底）

---

### P7 — InstanceOverlayFlushWorker flush 失败后未更新 ledger

**文件**：`runtime/world/worker/instance-overlay-flush.worker.ts:98-104`

**描述**：当 `flushInstanceDomains` 抛出异常时，catch 块仅记录 warn 日志，不调用 `markInstanceFlushLedgerFlushed`。这意味着该条目的 `claimed_by` 和 `claim_until` 仍然保留，直到 claim 过期（5 秒）后才能被重新认领。

**影响**：flush 失败后有 5 秒的"死区"，该实例无法被其他 worker 认领重试。

**严重度**：低（5 秒后自动恢复，但频繁失败时会降低吞吐）

---

### P8 — 崩溃恢复依赖"最终一致"窗口

**文件**：整体架构

**描述**：玩家和地图实例采用定时 flush 模式（默认间隔数秒），内存状态与数据库之间始终存在一个"最终一致窗口"。进程异常退出（SIGKILL、OOM）时，窗口内的所有未 flush 修改将丢失。

**影响**：崩溃后玩家可能回退数秒的进度（经验、物品位置、buff 状态等）。

**严重度**：中（这是架构设计的 trade-off，但需要明确文档化可接受的数据丢失窗口）

---

### P9 — GM 审计日志写入失败不阻断主操作

**文件**：`persistence/gm-audit-log-persistence.service.ts:124-181`

**描述**：`recordEntry` 设计为"失败不抛异常、不阻断主操作"。如果数据库连接异常，GM 操作会成功执行但审计记录丢失，仅有 logger.error 可追溯。

**影响**：审计链路断裂，无法追溯特定 GM 操作。

**严重度**：低中（审计是合规需求，丢失审计记录可能有监管风险）

---

### P10 — DirtyTracker.markPersisted 的 revision 竞态

**文件**：`runtime/instance/map-instance-persistence-projector.ts:245-256`

**描述**：`markPersisted` 在所有 dirty domains 清空后将 `persistedRevision = revision`。但在 flush IO 期间，如果有新的 `markDirty` 调用增加了 revision，`markPersisted` 完成后 `persistedRevision` 会被设为 flush 开始前的 revision，而非当前最新 revision。这是正确的（因为 flush 的是旧快照），但如果 `dirtyDomains` 恰好在 flush 期间被清空又重新标脏，`persistedRevision` 可能跳过中间版本。

**影响**：实际上影响有限——flush 服务在 IO 前拍快照 revision，IO 后用快照 revision 调用 markPersisted，不会误推。但代码可读性和维护性存在隐患。

**严重度**：低（当前实现正确，但逻辑脆弱）

---

## 二、已确认安全 / 设计合理的机制

### S1 — DurableOperationService 幂等事务

邮件领取、市场交易、NPC 购买等关键资产变更操作通过 `durable_operation_log` 表实现幂等性：
- 每次操作携带唯一 `operationId`
- 事务内先 `SELECT ... FOR UPDATE` 检查是否已提交
- 已提交则直接返回 `alreadyCommitted: true`
- 所有资产变更、outbox 事件、审计日志在同一事务内原子提交

**结论**：幂等性和原子性保证完善，崩溃后重试安全。

### S2 — Player Presence Fencing（会话围栏）

DurableOperationService 在事务内校验 `player_presence` 表的 `runtime_owner_id` 和 `session_epoch`，防止旧会话的操作覆盖新会话的数据。结合 instance lease 校验，形成双重围栏。

**结论**：有效防止分布式环境下的脑裂写入。

### S3 — FlushLedgerService 分布式认领

使用 `FOR UPDATE SKIP LOCKED` 实现无锁竞争的分布式 flush 任务认领，claim 有 TTL 自动过期，避免 worker 死亡后任务永久锁定。

**结论**：设计合理，无数据丢失风险。

### S4 — 玩家 flush 防覆盖保护

`PlayerPersistenceFlushService` 在 flush 前检查：如果玩家不是从持久化恢复的（空白角色），且数据库中已有 `recovery_watermark`，则拒绝写入。有效防止空白角色覆盖已有存档。

**结论**：关键安全防线，设计正确。

### S5 — Outbox 事件分发的重试与死信

`OutboxDispatcherService` 实现了完整的事件生命周期：
- `claimReadyEvents`：`FOR UPDATE SKIP LOCKED` 无锁认领
- `markFailed`：指数退避重试，超过最大次数转入死信表
- `claimConsumerDedupe`：消费端去重防止重复处理

**结论**：at-least-once 语义保证完善。

### S6 — 市场 mutation 后立即 flush 受影响玩家

市场交易成功后，`flushAffectedPlayersAfterMutation` 立即对买卖双方执行 flush，关闭"订单已落库但玩家 inventory 未落库"的窗口。单玩家 flush 失败不回滚交易，dirty 标记保留等下一轮重试。

**结论**：设计合理，兼顾一致性和可用性。

### S7 — 通天塔异步写入队列 + 关闭前强刷

`TongtianTowerPersistenceService` 实现了 `BeforeApplicationShutdown`，关闭前强制 flush 队列中所有待写入数据。

**结论**：关停路径安全。

### S8 — 实例分域持久化事务性写入

`InstanceDomainPersistenceService.saveBuildingRoomFengShuiState` 等方法在事务内执行 upsert + 删除 stale key，使用 advisory lock 防止并发写入冲突。

**结论**：事务原子性保证数据完整。

### S9 — NodeRegistryService 心跳与过期扫描

节点注册使用 upsert 模式，心跳超时自动标记为 suspect/dead。设计简洁，无持久化风险。

**结论**：无问题。

### S10 — GmRuntimeFlagPersistenceService 即时写入

flag 变更即时写入数据库（`ON CONFLICT DO UPDATE`），内存 cache 同步更新。无延迟 flush 窗口。

**结论**：无数据丢失风险。

---

## 三、待确认问题（已全部解决）

### U1 — NestJS 关停 hook 执行顺序 ✅ 已确认安全

**结论**：`app.module.ts` 采用单模块扁平注册，NestJS 关停 hook 按 providers 数组**逆序**调用。关键服务在 providers 中的位置：
- `WorldTickService`：第 396 行（最后注册，最先关停）
- `MarketRuntimeService`：第 336 行
- `PlayerPersistenceFlushService`：第 324 行
- `MapPersistenceFlushService`：第 308 行

实际关停顺序：tick 停止 → market 队列排空 → player flush → map flush。**顺序正确**，P1 的风险仅限于 tick 5 秒超时的极端场景，不会因关停顺序错误而放大。

### U2 — player-domain-persistence.service.ts 的域写入原子性 ✅ 已确认安全

**结论**：`savePlayerSnapshotProjectionDomains` 内部调用 `this.withTransaction(async (client) => { ... })`，`withTransaction` 实现为标准的 `BEGIN` → `work(client)` → `COMMIT`（失败则 `ROLLBACK`）。所有脏域的写入在同一事务内原子完成，不存在部分域写入成功部分失败的情况。

### U3 — 多节点部署下的 flush 冲突 ✅ 已确认安全

**结论**：`isPlayerPersistenceWritable` 的实现（`world-runtime.controller.ts:85-91`）通过检查玩家所在实例的 lease 状态来判断写入权限。具体逻辑：获取玩家位置 → 获取实例 → 调用 `isInstanceLeaseWritable(instance)`。如果实例 lease 已被其他节点接管，当前节点的 flush 会被跳过（dirty 标记保留）。结合 DurableOperationService 的 presence fencing，多节点不会同时 flush 同一玩家。

### U4 — 实例 overlay flush worker 的 runLoop 无退出条件 ✅ 已确认安全

**结论**：`InstanceOverlayFlushWorker` 在主服务进程中仅作为 NestJS provider 注入，主服务只调用 `runOnce`（由 `MapPersistenceFlushService` 的周期调度驱动）。`runLoop` 仅在独立进程（`tools/instance-overlay-flush-worker.ts`）中使用，该进程通过 OS 信号（SIGTERM/SIGINT）终止，`while(true)` 随进程退出自然结束。不存在生命周期管理缺陷。

### U5 — flush 重试次数是否足够 ⚠️ 已确认存在风险

**结论**：`PLAYER_PERSISTENCE_FLUSH_RETRY_COUNT = 1`（`player-persistence-flush.service.ts:34`），即**不重试**，首次失败即放弃本轮。虽然 dirty 标记保留等下一个 flush 周期重试，但这意味着瞬时数据库抖动（如连接池瞬间耗尽）会导致该玩家至少延迟一个 flush 周期（默认数秒）才能落盘。结合 P5（退避期间窗口），极端情况下延迟可能更长。

**风险等级**：低中（周期重试兜底，但无即时重试增加了崩溃时数据丢失的概率）

---

## 四、总结

| 类别 | 数量 | 关键项 |
|------|------|--------|
| 已发现问题 | 10 | P1(关停竞态)、P3(内存/DB不一致)、P5(退避窗口)、P8(崩溃丢数据) |
| 已确认安全 | 10 | S1(幂等事务)、S2(会话围栏)、S4(防覆盖)、S8(事务原子写入) |
| 待确认问题 | 5（已全部解决） | U1-U4 确认安全，U5 确认存在低中风险 |

**整体评估**：
- 关键资产变更（邮件、交易、购买）通过 DurableOperationService 保证了强一致性和幂等性，设计优秀
- 非关键状态（经验、位置、buff）采用最终一致 flush，崩溃时可能丢失数秒数据，属于可接受的 trade-off
- 关停顺序已确认正确（tick → market → player flush → map flush），P1 风险仅限于 tick 5 秒超时极端场景
- 玩家分域写入已确认为单事务原子操作，不存在部分域写入不一致
- 多节点 flush 冲突通过 instance lease guard 有效防护
- 主要残余风险：flush 无即时重试（U5）+ 退避期间崩溃窗口（P5）的组合

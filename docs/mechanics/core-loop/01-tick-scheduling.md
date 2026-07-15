# Tick 与调度系统

## 核心常量

| 常量 | 值 | 源文件 |
|------|-----|--------|
| TICK_INTERVAL | 1000 ms | `packages/shared/src/constants/gameplay/core.ts` |
| WORLD_TICK_INTERVAL_MS | 1000 ms | 同上 |
| WORLD_TICK_RATE_HZ | 1 Hz | 同上 |
| TICK_BUDGET | 200 ms | 同上 |
| MIN_INTERVAL_MS | 100 ms（10 倍实例 deadline 下限） | `packages/server/src/runtime/world/world-runtime-instance-schedule.service.ts` |
| BASE_INTERVAL_MS | 1000 ms | 同上 |
| MAX_CATCH_UP_STEPS_PER_INSTANCE | 4 息/批 | 同上 |
| MAX_PLANS_PER_BATCH | 2048 实例/批 | 同上 |
| MAX_CONSECUTIVE_FAILURES_BEFORE_UNHEALTHY | 5 | 同上 |
| MAP_TIME_PERSISTENCE_CHECKPOINT_INTERVAL_TICKS | 300 | `packages/server/src/runtime/instance/map-instance.runtime.ts` |
| DEATH_WAIT_TIME | 10 秒 | `packages/shared/src/constants/gameplay/core.ts` |
| DISCONNECT_RETAIN_TIME | 120 秒 | 同上 |
| DEFAULT_OFFLINE_PLAYER_TIMEOUT_SEC | 172800 (48h) | 同上 |
| PERSIST_INTERVAL | 60 秒 | 同上 |

## Tick 调度流程

源文件: `packages/server/src/runtime/tick/world-tick.service.ts`

```
实例创建/恢复/改速 → WorldRuntimeInstanceScheduleService.registerOrUpdate()
  ↓
普通实例最小堆 + 加速实例最小堆（单调时钟 deadline，旧 generation 惰性失效）
  ↓
scheduleNextTick() → 按最近有效 deadline 递归 setTimeout，并限制全局帧起始频率
  ↓
runTickOnce():
  1. 检查 shuttingDown / startupBarrier / tickInFlight
  2. collectDue(now)：普通堆优先，再取加速堆；单批最多 2048 个实例
  3. worldRuntimeService.advanceFrame(actualElapsedMs, duePlans)
  4. 只同步到期实例以及本批跨图涉及的玩家
  5. 只清理到期实例的事件队列
  6. 每 1 秒按真实经过时间执行世界维护，不因密室加速而提频
```

调度器不为每个实例注册独立系统定时任务。单服 10000 个实例只维护两个内存最小堆和实例索引；普通地图与加速地图的 deadline、命令物化、同步和事件收尾彼此隔离。

全局 dispatcher 两次帧开始之间至少间隔 `100ms`，对应当前实例最高 `10x`，不会因为大量错峰 deadline 退化为 `5ms` 轮询。`setTimeout` 的单次剩余等待量仍可能小于 `100ms`（例如本帧已执行 `95ms` 时只需再等 `5ms`），但它不是逻辑 tick 周期。慢帧指标直接读取 deadline 调度器因补帧上限真实丢弃的逻辑息，并以 10 秒窗口限频告警，不再根据 timer 剩余等待量估算。

## 实例级 Tick 编排

源文件: `packages/server/src/runtime/instance/`

### 阶段划分（advanceFrame）

```
1.  resetFrameEffects()                    — 清除上帧战斗特效
2.  reconcileDefeatedPlayersBeforeTick()   — 清理死亡玩家仇恨/命令
3.  消费调度器给出的实例计划：`instanceId / speed / steps`
      - 正常到期通常为 1 step
      - 积压时单实例单批最多追赶 4 step
      - 超过 4 step 的旧债务计数后丢弃，并从当前时间重同步 deadline
      - 密室没有有效使用时段时强制回落 `1x`；存在有效时段时按管理端设定倍率推进，运行成本已在购买时段时预扣
4.  processPendingRespawns()               — 复活队列
5.  materializeNavigationCommands()        — 寻路意图物化
6.  materializeAutoUsePills()              — 自动嗑药
7.  materializeAutoCombatCommands()        — 自动战斗
8.  dispatchPendingCommands()              — 玩家命令分发（async）
9.  dispatchPendingSystemCommands()        — 系统命令
10. precomputeInstanceWorkerIntents()      — Worker 预计算怪物意图
11. 逐实例逐 step 循环:
      a. instance.tickOnce(intents, options)— 实例核心 tick；空实例休眠怪物主动 AI
      b. instance.advanceTileResourceFlow() — 灵气流转
      c. advanceInstanceFormations()        — 阵法推进
      d. advanceTemporaryTiles()            — 临时地块衰减
      e. advanceTileRecovery()              — 地块修复
      f. 建筑完工通知 / 传送 / 怪物动作
      g. 玩家 tick: 修炼、灵气消耗、qi投影
```

- 世界 `tick` 按真实经过时间以 `1Hz` 推进，并保留高频调度帧的毫秒余数。
- 实例逻辑 step 只推进各自 `instance.tick`；不得按实例数或 step 数重复增加世界 `tick`。
- 阵法、地块、玩家成长等实例内周期使用 `instance.tick`；通天塔空闲回收等跨实例周期使用世界 `tick`。

### 玩家与地图异速行动

- 每个地图实例有独立 `tickSpeed`（默认 1.0，当前统一上限 10.0）。
- `nextDueAt` 从上次 deadline 递推，避免按执行完成时间重排造成长期漂移。
- 服务冷启动重建索引时，按稳定 `instanceId` 将首个 deadline 确定性分散到各自 tick 间隔内，避免大量同速实例在同一毫秒形成启动尖峰；运行中的创建和主动改速仍从完整新间隔起算。
- 普通实例先于加速积压出队；高倍实例即使欠下追赶息，也不能饿死正常地图。
- 单实例单批最多补 4 息；超额积压不会永久追债。密室按现实使用时段预扣运行成本，不按实际补帧数量重复计费。
- 改速、暂停、恢复、创建和销毁都会更新调度 generation；过期堆节点不会再次推进实例。
- `lease_degraded / fenced` 等暂时不可写状态只会把该实例延后 1 秒重试，不会永久删除索引；`stopped / destroyed` 才是终态。
- 高频批次只枚举到期实例的玩家索引，不扫描全部连接，也不调用全局事件清空。
- 无玩家实例仍保持 1Hz 逻辑时间推进，不再降到 0.1Hz；调度层传入 `sleepMonsterAi=true`，只休眠怪物主动寻敌、移动、攻击和吟唱，复活倒计时、地块恢复、临时地块、灵气流转、阵法与地图时间仍按 1Hz 推进。

## 异步任务调度

- 玩家输入不限每秒一次，可在一息内多次提交
- 同类可覆盖意图以最后一次为准（如寻路目标）
- 不可覆盖意图（资产/战斗/交易）有排队、幂等、去重、冷却规则
- socket handler 只接收意图、鉴权、排队和返回结果，不直接改权威世界态

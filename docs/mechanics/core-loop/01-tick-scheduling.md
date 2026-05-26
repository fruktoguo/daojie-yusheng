# Tick 与调度系统

## 核心常量

| 常量 | 值 | 源文件 |
|------|-----|--------|
| TICK_INTERVAL | 1000 ms | `packages/shared/src/constants/gameplay/core.ts` |
| WORLD_TICK_INTERVAL_MS | 1000 ms | 同上 |
| WORLD_TICK_RATE_HZ | 1 Hz | 同上 |
| TICK_BUDGET | 200 ms | 同上 |
| MIN_TICK_INTERVAL_MS | 100 ms（加速实例下限） | `packages/server/src/runtime/tick/world-tick.service.ts` |
| BASE_TICK_INTERVAL_MS | 1000 ms | 同上 |
| MAX_CONSECUTIVE_FAILURES_BEFORE_UNHEALTHY | 5 | 同上 |
| MAP_TIME_PERSISTENCE_CHECKPOINT_INTERVAL_TICKS | 300 | `packages/server/src/runtime/instance/map-instance.runtime.ts` |
| DEATH_WAIT_TIME | 10 秒 | `packages/shared/src/constants/gameplay/core.ts` |
| DISCONNECT_RETAIN_TIME | 120 秒 | 同上 |
| DEFAULT_OFFLINE_PLAYER_TIMEOUT_SEC | 172800 (48h) | 同上 |
| PERSIST_INTERVAL | 60 秒 | 同上 |

## Tick 调度流程

源文件: `packages/server/src/runtime/tick/world-tick.service.ts`

```
scheduleNextTick() → 递归 setTimeout
  ↓
resolveEffectiveTickIntervalMs():
  扫描所有实例 tickSpeed，取最大值 maxSpeed
  动态间隔 = max(100, round(1000 / maxSpeed))
  ↓
runTickOnce():
  1. 检查 shuttingDown / startupBarrier / tickInFlight
  2. actualElapsedMs = now - lastTickStartedAt
  3. 检查维护模式 → 跳过
  4. worldRuntimeService.advanceFrame(actualElapsedMs, null)
  5. worldSyncService.flushConnectedPlayers()    ← 同步推送
  6. runtimeEventBusService.flushTick()          ← 事件总线收尾
  7. 跳帧检测: actualInterval > target × 1.5 → 记录 skippedFrameCount
```

## 实例级 Tick 编排

源文件: `packages/server/src/runtime/instance/`

### 阶段划分（advanceFrame）

```
1.  resetFrameEffects()                    — 清除上帧战斗特效
2.  reconcileDefeatedPlayersBeforeTick()   — 清理死亡玩家仇恨/命令
3.  计算每实例 steps:
      accumulated = previousProgress + speed × (frameDurationMs / 1000)
      steps = floor(accumulated)
      余数存回 TickProgress
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

### 玩家与地图异速行动

- 每个地图实例有独立 `tickSpeed`（默认 1.0）
- 加速实例: `steps = floor(accumulated + speed × elapsed/1000)`
- 余数跨帧保留，保证精确步进
- 动态调整全局 tick 间隔以适配最快实例
- 无玩家实例仍保持 1Hz 逻辑时间推进，不再降到 0.1Hz；调度层传入 `sleepMonsterAi=true`，只休眠怪物主动寻敌、移动、攻击和吟唱，复活倒计时、地块恢复、临时地块、灵气流转、阵法与地图时间仍按 1Hz 推进。

## 异步任务调度

- 玩家输入不限每秒一次，可在一息内多次提交
- 同类可覆盖意图以最后一次为准（如寻路目标）
- 不可覆盖意图（资产/战斗/交易）有排队、幂等、去重、冷却规则
- socket handler 只接收意图、鉴权、排队和返回结果，不直接改权威世界态

# 离线挂机一致性审计报告

**审计时间**：2026-05-19  
**审计范围**：`packages/server/src/runtime/` 全域离线挂机（`player.sessionId === null`）与在线状态行为一致性  
**核心原则**：离线挂机 = 无头客户端，tick 照跑、战斗照打、收益照算，唯一区别是没有 socket 连接

---

## 总结

| 维度 | 结论 | 严重度 |
|------|------|--------|
| 1. Tick 循环覆盖 | ✅ 一致 | - |
| 2. 自动战斗触发 | ✅ 一致 | - |
| 3. 修炼/采集/炼丹 | ✅ 一致 | - |
| 4. 战斗结算 | ✅ 一致 | - |
| 5. 收益计算 | ✅ 一致 | - |
| 6. 事件总线与通知 | ⚠️ 设计如此但需注意 | 低 |
| 7. 玩家卸载边界 | ❌ **存在 BUG** | **高** |
| 8. 导航与移动 | ✅ 一致 | - |
| 9. Buff/Debuff 系统 | ✅ 一致 | - |
| 10. 宗门/社交 | ✅ 一致 | - |
| 11. 坊市/经济 | ✅ 一致 | - |
| 12. 持久化 | ✅ 一致 | - |

---

## 维度 1: Tick 循环覆盖一致性

**结论：✅ 一致**

### 证据

1. `MapInstanceRuntime.listPlayerIds()` 返回 `Array.from(this.playersById.keys())`（第 529 行），包含所有在实例中的玩家，不区分在线/离线。

2. `WorldRuntimeInstanceTickOrchestrationService.advanceFrame` 第 189 行：
   ```typescript
   const currentPlayerIds = instance.listPlayerIds();
   deps.playerRuntimeService.advanceTickForPlayerIds(currentPlayerIds, instance.tick, {...});
   ```
   对所有玩家统一调用。

3. `advanceSinglePlayerTick`（第 3011 行）内部无任何 `sessionId` / `online` 守卫。

4. 加速 tick 补偿（`index > 0` 分支，第 142-145 行）同样通过 `listConnectedPlayerIds()` 覆盖离线玩家。

---

## 维度 2: 自动战斗触发一致性

**结论：✅ 一致**

### 证据

1. `listConnectedPlayerIds()` 实际返回 `WorldRuntimePlayerLocationService.playerLocations.keys()`（第 33 行），这是所有在世界中的玩家（含离线挂机）。

2. `detachSession()`（第 393 行）仅设置 `player.sessionId = null`，**不会**从 `playerLocations` 中移除玩家。

3. `materializeAutoCombatCommands`（第 305-350 行）遍历条件仅检查：
   - `hasPendingCommand` / `hasNavigationIntent`
   - `player.hp <= 0`
   - `pendingSkillCast`
   - `autoBattle` / `autoRetaliate` / `manualEngagePending`
   
   **无** `sessionId` 或 `online` 检查。

4. `materializeAutoUsePills`（第 220 行）同理，无在线守卫。

---

## 维度 3: 修炼/采集/炼丹 tick 一致性

**结论：✅ 一致**

### 证据

1. `shouldResumeIdleCultivation`（第 7314 行）检查条件：
   - `player.hp <= 0` / `cultivationActive` / `autoIdleCultivation === false`
   - `blockedPlayerIds` / `lastActiveTick` 延迟
   - **无** 在线状态检查

2. `advanceCraftJobs`（第 91 行）仅检查 `player` 是否存在，无在线守卫。

3. 炼丹/锻造/强化/采集/建筑 job 推进均基于 `remainingTicks > 0`，与在线状态无关。

---

## 维度 4: 战斗结算一致性

**结论：✅ 一致**

### 证据

1. 战斗伤害计算在 `world-runtime-player-skill-dispatch.service.ts` 中，通过 `resolveAttackableTargetRef` 解析目标，无在线状态检查。

2. 玩家被攻击时 `recordActivity` 被调用（第 1418 行），会中断修炼并更新 `lastActiveTick`，对离线玩家同样生效。

3. 怪物仇恨系统通过 `aggroTargetPlayerId` 锁定目标，不区分在线/离线。

4. 死亡处理 `handlePlayerDefeat`（第 1421 行）对所有 hp <= 0 的玩家触发，无在线守卫。

5. PVP 杀气/魂伤 buff 施加基于战斗结果，不检查在线状态。

---

## 维度 5: 收益计算一致性

**结论：✅ 一致**

### 证据

1. `captureOfflineGainBeforeTick`（第 3020 行）在每个 `advanceSinglePlayerTick` 开头调用。

2. `accumulateOfflineGainAfterTick`（第 3059 行）在每个 tick 结尾调用。

3. `recordPlayerStatisticMutation`（第 3104 行）正确区分在线/离线路径：
   - 离线（有 offlineSession 且无 sessionId）：累积到 `offlineSession.accumulatedPayload`
   - 在线（有 sessionId）：写入日总账 `recordPlayerStatisticTotals`
   
   两条路径都完整记录灵石/物品/经验变化。

---

## 维度 6: 事件总线与通知

**结论：⚠️ 设计如此，低风险**

### 证据

1. `queuePlayerNotice`（event-bus 第 96 行）对所有玩家入队，不检查在线状态。

2. **但**：`flushTick()`（第 475-516 行）在每个 tick 末尾清空**所有**玩家队列：
   ```typescript
   // 清空未被在线同步 drain 的玩家维度队列
   for (const [playerId, queue] of this.playerQueues) {
     this.playerQueues.delete(playerId);
   }
   ```

3. 在线玩家的通知在 `flushConnectedPlayers()` 中被 `drainPlayer` 消费后推送给客户端。

4. 离线玩家的通知在同一 tick 内入队后，因无人 drain，在 `flushTick()` 时被丢弃。

### 影响

- 离线期间的逐条战斗消息、系统通知等**不会**保留到上线后下发
- 但离线收益统计（`offlineGainSession`）完整记录了所有资产变化
- 这是**设计如此**：离线收益报告替代了逐条通知

### 潜在风险

- 如果有重要的一次性通知（如宗门被攻击、邮件到达）仅通过 eventBus 通知而无其他持久化渠道，离线玩家会永久丢失该通知
- 建议：确保关键通知有独立持久化渠道（邮件系统、logbook 等）

---

## 维度 7: 玩家卸载边界

**结论：❌ 存在 BUG — `hasDetachedRuntimeActivity` 未检查 `autoBattle`**

### 证据

`hasDetachedRuntimeActivity`（第 7328 行）：
```typescript
function hasDetachedRuntimeActivity(player) {
    if (!player) return false;
    const combat = player.combat ?? {};
    if (combat.cultivationActive === true || combat.autoRootFoundation === true) {
        return true;
    }
    return hasRemainingRuntimeJob(player.alchemyJob)
        || hasRemainingRuntimeJob(player.forgingJob)
        || hasRemainingRuntimeJob(player.enhancementJob)
        || hasRemainingRuntimeJob(player.gatherJob)
        || hasRemainingRuntimeJob(player.buildingJob);
}
```

**缺失检查**：`combat.autoBattle === true`

### 触发场景

1. 玩家开启自动战斗后断线
2. 自动战斗持续进行，但玩家未在修炼、未有制作任务
3. 会话回收器（`WorldSessionReaperService`）触发 `unloadDetachedPlayerRuntime`
4. `canUnloadDetachedPlayerRuntime` → `hasDetachedRuntimeActivity` 返回 `false`
5. 玩家被错误卸载，自动战斗中断

### 修复建议

在 `hasDetachedRuntimeActivity` 中增加 `autoBattle` 检查。

---

## 维度 8: 导航与移动

**结论：✅ 一致**

### 证据

1. `materializeNavigationCommands`（第 306 行）遍历 `this.navigationIntents` Map，按 playerId 索引，不检查在线状态。

2. 导航意图物化仅检查：`hasPendingCommand` / `player.hp <= 0` / `player.instanceId`。

3. 离线玩家断线时通常不会有残留导航意图（断线前的移动命令已执行完毕或被清理）。

4. 即使有残留意图，也会在下一 tick 正常物化或因目标到达而清除。

---

## 维度 9: Buff/Debuff 系统

**结论：✅ 一致**

### 证据

1. `tickTemporaryBuffs`（在 `advanceSinglePlayerTick` 第 3025 行调用）对所有玩家统一执行 buff 衰减。

2. 新 buff 施加来自战斗伤害结算，走统一的 `applyBuff` 路径，无在线守卫。

3. buff 过期清理在 `tickTemporaryBuffs` 内完成，按 `remainingTicks` 递减，与在线状态无关。

4. 环境效果（如灵气消耗 `applyTileQiDrainForPlayers`，第 197 行）对 `currentPlayerIds`（含离线）统一施加。

---

## 维度 10: 宗门/社交系统

**结论：✅ 一致**

### 证据

1. `world-runtime-sect.service.ts` 第 1579 行正确区分显示状态：
   ```typescript
   return typeof player.sessionId === 'string' && player.sessionId.trim()
       ? '在线'
       : '离线挂机';
   ```
   这仅影响**显示**，不影响逻辑。

2. 护宗大阵等宗门被动效果通过 buff 系统施加，走统一 tick 路径。

3. 宗门成员列表中离线挂机玩家正确标记为"离线挂机"而非"离线"（后者指已卸载的玩家）。

---

## 维度 11: 坊市/经济系统

**结论：✅ 一致**

### 证据

1. `MarketRuntimeService` 的挂单成交回调通过 `playerRuntimeService` 直接修改玩家钱包/背包状态，不检查在线状态。

2. 坊市仓库缓存驱逐策略（第 67 行注释）按 LRU 驱逐"离线/无挂单玩家"，但这只影响缓存层，不影响持久化数据。

3. 钱包余额变动通过 `playerRuntimeService` 的统一接口，对在线/离线玩家一致。

---

## 维度 12: 持久化一致性

**结论：✅ 一致**

### 证据

1. `PlayerPersistenceFlushService` 的 `describePersistencePresence` 接口包含 `online` / `offlineSinceAt` 字段，但这仅用于**记录状态**，不用于决定是否持久化。

2. 脏域标记（`markPlayerDirtyDomains`）在 `advanceSinglePlayerTick` 中对所有玩家统一触发。

3. 低频 flush 机制基于脏域标记触发，不检查在线状态。

4. 离线收益基线（`beginOfflineGainSession`）在断线时保存到数据库，服务器重启后可恢复。

---

## 修复方案

### BUG #1: `hasDetachedRuntimeActivity` 未检查 `autoBattle`

**文件**：`packages/server/src/runtime/player/player-runtime.service.ts`  
**位置**：第 7328 行  
**修复**：在 `cultivationActive` / `autoRootFoundation` 检查后增加 `autoBattle` 检查

```typescript
function hasDetachedRuntimeActivity(player) {
    if (!player) return false;
    const combat = player.combat ?? {};
    if (combat.cultivationActive === true || combat.autoRootFoundation === true) {
        return true;
    }
    // 修复：自动战斗中的玩家不应被卸载
    if (combat.autoBattle === true) {
        return true;
    }
    return hasRemainingRuntimeJob(player.alchemyJob)
        || hasRemainingRuntimeJob(player.forgingJob)
        || hasRemainingRuntimeJob(player.enhancementJob)
        || hasRemainingRuntimeJob(player.gatherJob)
        || hasRemainingRuntimeJob(player.buildingJob);
}
```

**影响**：开启自动战斗的离线玩家将被正确保留在运行时中，不会被会话回收器错误卸载。


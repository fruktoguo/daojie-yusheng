# 参考 `main` 分支真实玩家存档盘点

## 1. 文档定位

这份文档只负责回答一件事：

- 参考项目 `main` 分支当前线上口径的玩家数据，到底真实落了哪些字段

它不是终局设计文档，也不是拆表方案文档。  
它的作用是给 [mmo商业级数据落盘方案.md](./mmo商业级数据落盘方案.md) 提供真实输入，避免“还没把现有数据盘全就先设计终局表”。

## 2. 盘点边界

本次盘点基于参考主线 `/home/yuohira/mud-mmo` 的真实保存/回读链，而不是只看某一张表名猜测。

重点参考了以下代码路径：

- `packages/server/src/game/player.service.ts`
- `packages/server/src/game/player-storage.ts`
- `packages/server/src/database/entities/player.entity.ts`
- `packages/server/src/database/entities/player-collections.entity.ts`
- `packages/server/src/database/entities/player-settings.entity.ts`
- `packages/server/src/database/entities/player-presence.entity.ts`

本次盘点得到的结论是：参考主线当前真正参与“玩家下次还在”的真源，不是单个 JSON 文件，而是以下几组数据共同组成：

- `players`
- `player_collections`
- `player_settings`
- `player_presence`
- `users.displayName`
- `players.pendingLogbookMessages`

## 3. 当前真实玩家数据面

### 3.1 `players` 当前承载的真实字段

- 身份与角色基础
  - `id`
  - `userId`
  - `name`
- 世界落点与重生点
  - `mapId`
  - `respawnMapId`
  - `x`
  - `y`
  - `facing`
  - `viewRange`
- 生存态
  - `hp`
  - `maxHp`
  - `qi`
  - `dead`
- 成长计数
  - `foundation`
  - `combatExp`
  - `playerKillCount`
  - `monsterKillCount`
  - `eliteMonsterKillCount`
  - `bossMonsterKillCount`
  - `deathCount`
  - `boneAgeBaseYears`
  - `lifeElapsedTicks`
  - `lifespanYears`
- 长期属性与突破相关
  - `baseAttrs`
  - `bonuses`
  - `questCrossMapNavCooldownUntilLifeTicks`
  - `revealedBreakthroughRequirementIds`
  - `heavenGate`
  - `spiritualRoots`
- 仍挂在宽表中的兼容镜像
  - `temporaryBuffs`
  - `inventory`
  - `marketStorage`
  - `equipment`
  - `techniques`
  - `bodyTraining`
  - `quests`
  - `unlockedMinimapIds`
  - `alchemySkill`
  - `gatherSkill`
  - `alchemyPresets`
  - `alchemyJob`
  - `enhancementSkillLevel`
  - `enhancementJob`
  - `enhancementRecords`
  - `autoBattle`
  - `autoBattleSkills`
  - `autoUsePills`
  - `combatTargetingRules`
  - `autoBattleTargetingMode`
  - `combatTargetId`
  - `combatTargetLocked`
  - `autoRetaliate`
  - `autoBattleStationary`
  - `allowAoePlayerHit`
  - `autoIdleCultivation`
  - `autoSwitchCultivation`
  - `cultivatingTechId`
- 会话镜像
  - `online`
  - `inWorld`
  - `lastHeartbeatAt`
  - `offlineSinceAt`
- 独立小持久化但仍挂在主表的消息态
  - `pendingLogbookMessages`

### 3.2 `player_collections` 当前承载的真实字段

- `temporaryBuffs`
  - 已知 Buff 的最小快照为：
    - `buffId`
    - `sourceSkillId`
    - `sourceCasterId?`
    - `realmLv`
    - `remainingTicks`
    - `duration`
    - `stacks`
    - `maxStacks`
    - `sustainTicksElapsed?`
  - 未知 Buff 或老数据会回退为完整 `TemporaryBuffState`
- `inventory`
  - 结构为 `{ capacity, items[] }`
  - 已知物品最小项为：
    - `itemId`
    - `count`
    - `enhanceLevel?`
  - 未知物品回退为完整 `ItemStack`
- `marketStorage`
  - 结构与 `inventory.items[]` 相同
  - 这是旧方案里漏掉但线上真实在用的域
- `equipment`
  - 固定槽位：
    - `weapon`
    - `head`
    - `body`
    - `legs`
    - `accessory`
  - 已知装备最小项为：
    - `itemId`
    - `enhanceLevel?`
  - 未知装备回退为完整 `ItemStack`
- `techniques`
  - 已知功法最小快照为：
    - `techId`
    - `level`
    - `exp`
    - `expToNext`
    - `skillsEnabled?`
  - 未知功法回退为完整 `TechniqueState`
- `bodyTraining`
  - `level`
  - `exp`
  - `expToNext`
- `quests`
  - 已知任务最小快照为：
    - `id`
    - `status`
    - `progress`
  - 未知或已下线任务回退为完整 `QuestState`

### 3.3 `player_settings` 当前承载的真实字段

- 地图与采集/炼丹/强化成长
  - `unlockedMinimapIds`
  - `alchemySkill`
    - `level`
    - `exp`
    - `expToNext`
  - `gatherSkill`
    - `level`
    - `exp`
    - `expToNext`
  - `enhancementSkillLevel`
- 炼丹配置与任务
  - `alchemyPresets[]`
    - `presetId`
    - `recipeId`
    - `name`
    - `ingredients[]`
      - `itemId`
      - `count`
    - `updatedAt`
  - `alchemyJob`
    - `recipeId`
    - `outputItemId`
    - `outputCount`
    - `quantity`
    - `completedCount`
    - `successCount`
    - `failureCount`
    - `ingredients[]`
    - `phase`
    - `preparationTicks`
    - `batchBrewTicks`
    - `currentBatchRemainingTicks`
    - `pausedTicks`
    - `spiritStoneCost`
    - `totalTicks`
    - `remainingTicks`
    - `successRate`
    - `exactRecipe`
    - `startedAt`
- 强化配置与任务
  - `enhancementJob`
    - `target`
    - `item`
    - `targetItemId`
    - `targetItemName`
    - `targetItemLevel`
    - `currentLevel`
    - `targetLevel`
    - `desiredTargetLevel`
    - `spiritStoneCost`
    - `materials[]`
    - `protectionUsed`
    - `protectionStartLevel?`
    - `protectionItemId?`
    - `protectionItemName?`
    - `protectionItemSignature?`
    - `phase`
    - `pausedTicks`
    - `successRate`
    - `totalTicks`
    - `remainingTicks`
    - `startedAt`
    - `roleEnhancementLevel`
    - `totalSpeedRate`
  - `enhancementRecords`
    - 这里在参考主线里存在历史兼容脏点：
      - 旧名字叫 `enhancementRecords`
      - 当前部分新存档实际承载的是强化技艺状态镜像
      - 老存档可能仍残留真正的 `PlayerEnhancementRecord[]`
    - 终局设计里必须拆开，不能沿用这个兼容列名
- 自动战斗与行为设置
  - `autoBattle`
  - `autoBattleSkills[]`
    - `skillId`
    - `enabled`
    - `skillEnabled?`
  - `autoUsePills[]`
    - `itemId`
    - `conditions[]`
      - `resource_ratio`
        - `resource`
        - `op`
        - `thresholdPct`
      - `buff_missing`
  - `combatTargetingRules`
    - `hostile[]`
    - `friendly[]`
  - `autoBattleTargetingMode`
  - `combatTargetId`
  - `combatTargetLocked`
  - `autoRetaliate`
  - `autoBattleStationary`
  - `allowAoePlayerHit`
  - `autoIdleCultivation`
  - `autoSwitchCultivation`
  - `cultivatingTechId`

### 3.4 `player_presence` 当前承载的真实字段

- `online`
- `inWorld`
- `lastHeartbeatAt`
- `offlineSinceAt`

### 3.5 `users` 与 `pendingLogbookMessages` 的额外字段

- `users.displayName`
  - 这是玩家对外显示名，但所有权属于账号，不属于角色主档
- `players.pendingLogbookMessages`
  - 每条消息的实际字段为：
    - `id`
    - `kind`
    - `text`
    - `from?`
    - `at`

## 4. 对 next 终局设计的直接约束

从参考主线真实存档看，至少有以下数据域不能在终局方案里漏掉：

- `marketStorage`
- `pendingLogbookMessages`
- `alchemySkill / gatherSkill / alchemyPresets / alchemyJob`
- `enhancementJob / enhancementRecords`
- `player_presence`
- `questCrossMapNavCooldownUntilLifeTicks / revealedBreakthroughRequirementIds / heavenGate / spiritualRoots`

同时，也不能把参考主线里所有现存字段照抄成终局列：

- `viewRange`
  - 更适合作为派生运行态，不应作为高频正式真源
- `realmLv / realmName / realmStage`
  - 属于运行时派生或内容计算结果，不应直接作为玩家主真源
- `enhancementRecords`
  - 属于兼容历史列名，不应原样沿用
- 每一步移动坐标
  - 不应继续当成“每秒正式真源”，而应拆成跨实例锚点与关键 checkpoint

## 5. 与主方案文档的关系

这份文档只负责“现状盘全”。  
基于这份盘点得到的终局拆表、恢复链、刷盘链、强持久化事务链，统一收敛在 [mmo商业级数据落盘方案.md](./mmo商业级数据落盘方案.md)。

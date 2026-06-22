# 自动化/挂机

## 自动战斗

源文件: `packages/server/src/runtime/world/combat/world-runtime-auto-combat.service.ts`

### 触发条件

- `player.combat.autoBattle === true` 或 `player.combat.autoRetaliate === true`
- 玩家 HP > 0
- 无 pending command
- 无导航意图
- 无 pendingSkillCast
- 有战斗行动预算: `combatActionsUsedThisTick < actionsPerTurn`

### 行动预算

```typescript
actionsPerTurn = max(1, trunc(player.attrs.numericStats.actionsPerTurn))
hasBudget = combatActionsUsedThisTick < actionsPerTurn
```

### 目标选择评分

```typescript
score = threatValue
      × THREAT_DISTANCE_FALLOFF_PER_TILE^(distance-1)
      × preferenceMultiplier
```

目标偏好模式:
- `nearest`: 最近目标 ×5
- `low_hp`: 最低血量 ×5
- `full_hp`: 最高血量 ×5
- `boss`: demon_king 级怪物 ×5
- `player`: 玩家目标 ×5

不可达目标仇恨 ×0.2 衰减

### 静止模式

`player.combat.autoBattleStationary === true` 时不移动追击

## 自动用药

### 常量

| 常量 | 值 | 说明 |
|------|-----|------|
| AUTO_USE_PILL_SLOT_LIMIT | 12 | 自动用药槽位上限 |

### 触发条件类型

- `resource_ratio`: 资源比例判断 `ratio < threshold` 或 `ratio > threshold`
- `buff_missing`: 目标 buff 不存在时触发
- 同一药品配置内多条条件为“且”关系，全部满足才会触发；空条件不触发。

### 资源比例计算

```typescript
resolveResourceRatio(player, resource):
  current = resource === 'qi' ? player.qi : player.hp
  max = resource === 'qi' ? player.maxQi : player.maxHp
  return current / max  // [0, 1]
```

### 候选物品条件

```typescript
healAmount > 0 || healPercent > 0 || qiPercent > 0 || consumeBuffs.length > 0
```

### 执行规则

- 每 tick 最多使用 1 个丹药（break after first success）
- 背包前 12 格内的消耗品可被自动使用

## 自动技能选择

```
1. 遍历 player.actions.actions（技能栏）
2. 跳过 autoBattleEnabled === false 或 skillEnabled === false
3. 跳过冷却中的技能
4. 检查真气消耗: player.qi >= resolveAutoBattleSkillQiCost(skill.cost, maxQiOutputPerTick)
5. 自我 buff 技能: buff 缺失时自动释放
6. 无目标 AOE: 以自身为中心释放
7. 有目标技能: 计算有效射程 = baseRange + extraRange
8. 若首个可用目标技能当前距离不可释放，继续顺延检查后续技能；没有任何技能可释放时，追击停距仍使用首个可用技能射程
```

## 自动修炼

- 玩家处于修炼状态时，每 tick 自动获得修炼经验
- 修炼收益受灵气场加成影响
- 离线时继续修炼（见离线收益系统）

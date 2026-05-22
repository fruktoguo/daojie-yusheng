# 采集与挖矿

## 采集系统

源文件: `packages/server/src/runtime/craft/pipeline/strategies/gather.strategy.ts`

### 策略特征

| 属性 | 值 |
|------|-----|
| kind | gather |
| jobSlot | gatherJob |
| skillSlot | gatherSkill |
| pauseTicks | 0 |
| conditional | true |

### 条件检查

- 玩家在容器 1 格内（切比雪夫距离）
- 容器存在且为 herb 类型
- 容器仍有可采集物

条件不满足 → 自动休眠入队列尾部，5 ticks 后重试

### 队列常量

```typescript
TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH = 20
TECHNIQUE_ACTIVITY_SLEEP_RETRY_TICKS = 5
```

## 挖矿系统

### 核心常量

源文件: `packages/shared/src/constants/gameplay/craft.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| MINING_DAMAGE_BONUS_PER_LEVEL | 0.02 | 每级伤害提升（指数底数） |
| MINING_EXP_BASE_ACTION_TICKS | 0.3 | 每次伤害视为 0.3 息动作 |

### 挖矿伤害公式

源文件: `packages/server/src/runtime/world/combat/tile-drop.helpers.ts`

```typescript
levelMultiplier = (1 + 0.02)^miningLevel  // 指数增长
equipMultiplier = 1 + max(0, weapon.miningDamageRate)
finalDamage = max(1, round(baseDamage × levelMultiplier × equipMultiplier))
```

### 挖矿经验

```typescript
referenceLevel = min(oreTileLevel, miningLevel, realmLevel)
gain = computeCraftSkillExpGain({
  skillLevel: miningLevel,
  targetLevel: referenceLevel,
  baseActionTicks: 0.3,  // MINING_EXP_BASE_ACTION_TICKS
  successCount: 1,
  successMultiplier: 1,
})
```

### 矿脉 HP

```typescript
// 地块境界HP公式
TERRAIN_REALM_BASE_HP = 100
TERRAIN_REALM_HP_GROWTH_RATE = 1.4
getTerrainRealmBaseHp(realmLv) = 100 × 1.4^(realmLv - 1)
```

### 掉落倍率

```typescript
resolveTileDamageDropMultiplier(damage):
  if damage <= 0: return 0
  if damage < 100: return 0.5
  multiplier = 1, threshold = 300
  while damage >= threshold:
    multiplier += 1
    threshold *= 3
  return multiplier
```

| 伤害范围 | 掉落倍率 |
|----------|----------|
| < 100 | 0.5 |
| 100~299 | 1 |
| 300~899 | 2 |
| 900~2699 | 3 |
| 2700+ | 4+ |

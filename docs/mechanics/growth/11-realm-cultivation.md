# 境界与修炼

## 境界等级体系

34 个大境界，等级范围 1-127：

| 大境界 | 等级范围 | progressToNext |
|--------|----------|---------------|
| 凡俗 | 1-5 | 60 |
| 淬体 | 6-8 | 120 |
| 锻骨 | 9-11 | 180 |
| 通脉 | 12-15 | 260 |
| 先天 | 16-18 | 360 |
| 练气前期 | 19-22 | 1040 |
| 练气中期 | 23-26 | 1120 |
| 练气后期 | 27-30 | 1200 |
| 筑基前期 | 31-34 | 1240 |
| 筑基中期 | 35-38 | 1320 |
| 筑基后期 | 39-42 | 1400 |
| 金丹前期 | 43-46 | 2000 |
| 金丹中期 | 47-50 | 2200 |
| 金丹后期 | 51-54 | 2400 |
| 元婴前期 | 55-58 | 3000 |
| 元婴中期 | 59-62 | 3300 |
| 元婴后期 | 63-66 | 3600 |
| 化神前期 | 67-70 | 4500 |
| 化神中期 | 71-74 | 5000 |
| 化神后期 | 75-78 | 5500 |
| 炼虚前期 | 79-82 | 7000 |
| 炼虚中期 | 83-86 | 7500 |
| 炼虚后期 | 87-90 | 8000 |
| 合体前期 | 91-94 | 10000 |
| 合体中期 | 95-98 | 11000 |
| 合体后期 | 99-102 | 12000 |
| 大乘前期 | 103-106 | 15000 |
| 大乘中期 | 107-110 | 16000 |
| 大乘后期 | 111-114 | 18000 |
| 渡劫前期 | 115-118 | 22000 |
| 渡劫中期 | 119-122 | 25000 |
| 渡劫后期 | 123-126 | 30000 |
| 飞升 | 127 | 0 |

源文件：`packages/shared/src/constants/gameplay/realm.ts`

## 突破条件

每个大境界突破需要满足：
- **修为上限**：progress ≥ progressToNext
- **突破材料**：breakthroughItems（配置指定）
- **功法要求**：minTechniqueLevel（最低层数）、minTechniqueRealm（最低境界）
- **外部条件**：breakthroughs.json 配置的额外条件（属性总值、灵根等）

## 修炼经验计算

### 闭关修炼（advanceCultivation）

```ts
realmBasePerTick = numericStats.realmExpPerTick × auraMultiplier
techniqueBasePerTick = numericStats.techniqueExpPerTick × auraMultiplier
realmGain = applyRateBonus(realmBasePerTick × ticks, playerExpRate)
techniqueGain = applyRateBonus(techniqueBasePerTick × ticks, techniqueExpRate)
```

### applyRateBonus 公式

```ts
exactGain = max(minimumGain, baseGain × (1 + bonusRateBp / 10000))
return floor(exactGain) + (random < fractional ? 1 : 0)
```

bonusRateBp 为万分比加成。

## 底蕴机制

### 底蕴补充

修为未满时，底蕴可额外补充：
```ts
foundationSpent = min(foundation, gain × 2, room)
```

### 溢出转底蕴

修为溢出时，溢出部分转化为底蕴（对数衰减）：
```ts
decayRate = ln(2) / (progressToNext × 10)
foundationGain = ln(1 + decayRate × overflow × e^(-decayRate × currentFoundation)) / decayRate
```

## 击杀经验

```ts
getRealmCombatExp = expToNext × expMultiplier × levelAdjustment × monsterLevelDecay × contributionRatio / 1000
getTechniqueCombatExp = 同上 / 200（功法经验是境界经验的 5 倍基数）
```

单次击杀上限：`SINGLE_COMBAT_REALM_EXP_CAP_MULTIPLIER = 5`（最多给当前境界需求的 5 倍）

## 炼体系统

```ts
BODY_TRAINING_EXP_BASE = 10000
BODY_TRAINING_EXP_GROWTH_RATE = 1.2
getBodyTrainingExpToNext(level) = round(10000 × 1.2^level)
BODY_TRAINING_ATTR_PERCENT_PER_LEVEL = 1  // 每层全属性+1%
```

## 相关源文件

- `packages/shared/src/constants/gameplay/realm.ts` — 境界配置
- `packages/server/src/runtime/player/player-progression.service.ts` — 修炼推进
- `packages/shared/src/monster.ts` — 击杀经验

# 伤害计算系统

## 核心对抗率公式（RatioValue）

源文件: `packages/shared/src/numeric.ts`

```typescript
ratioValue(value, divisor) = value / (value + divisor)
// 正值: value / (value + divisor)，收益递减
// 零值: 返回 0
// divisor ≤ 0: 返回 1（正值）或 -1（负值）

DEFAULT_RATIO_DIVISOR = 100
```

## 对抗率判定公式

源文件: `packages/server/src/runtime/combat/combat-resolution.helpers.ts`

```typescript
resolveOpposedCombatRate(value, opposingValue) =
  ratioValue(value, max(1, opposingValue + DEFAULT_RATIO_DIVISOR))
```

用于: 命中 vs 闪避、破防 vs 化解、暴击 vs 抗暴

## 各判定环节

### 1. 破防判定（随机数第1位）

```
条件: breakPower > resolvePower
breakChance = resolveOpposedCombatRate(breakPower, resolvePower)
broken = random() < breakChance
效果: 后续命中和暴击属性翻倍
```

### 2. 命中/闪避判定（随机数第2位）

```
combatAdvantage = resolveCombatExperienceAdvantage(attackerExp, defenderExp)
effectiveHit = hit × (broken ? 2 : 1) × (1 + attackerBonus)
effectiveDodge = dodge × (1 + defenderBonus)
dodgeChance = resolveOpposedCombatRate(effectiveDodge, effectiveHit)
dodged = random() < dodgeChance
```

### 3. 化解判定（随机数第3位）

```
条件: resolvePower > breakPower
resolveChance = resolveOpposedCombatRate(resolvePower, breakPower)
resolved = random() < resolveChance
效果: 防御力翻倍
```

### 4. 暴击判定（随机数第4位）

```
effectiveCrit = crit × (broken ? 2 : 1)
critChance = resolveOpposedCombatRate(effectiveCrit, antiCrit)
crit = random() < critChance
```

## 防御减伤公式

```typescript
// 常量
DEFENSE_REDUCTION_ATTACK_RATIO = 0.1
DEFENSE_REDUCTION_BASELINE = 100

reductionBasis = max(1, attackBasis × 0.1 + 100)
defenseReductionRate = ratioValue(defense, reductionBasis)
```

- 攻击力越高，防御有效减伤率越低（穿透效果）
- 化解成功时 defense × 2

## 元素减免叠乘

```typescript
totalReduction = 1 - (1 - defenseReduction) × (1 - elementReduce)
finalDamage = max(1, round(damage × max(0, 1 - totalReduction)))
```

## 暴击乘区

```typescript
critMultiplier = (200 + max(0, critDamage) / 10) / 100
// 基础暴击倍率 = 2.0
// critDamage 每 10 点增加 1% 暴击伤害
```

## 境界差乘区

源文件: `packages/shared/src/combat.ts`

```typescript
realmGap = attackerRealmLv - defenderRealmLv
if realmGap > 0: multiplier = (1 + 0.2)^realmGap    // 高打低加成
if realmGap < 0: multiplier = (1 - 0.2)^|realmGap|  // 低打高衰减
```

| 常量 | 值 |
|------|-----|
| REALM_DAMAGE_ADVANTAGE_RATE | 0.2 |
| REALM_DAMAGE_DISADVANTAGE_RATE | 0.2 |

## 战斗经验优势加成

```typescript
normalizedCurrent = max(0, currentExp) + 100  // COMBAT_EXPERIENCE_ADVANTAGE_BASELINE
normalizedOpposite = max(0, oppositeExp) + 100
ratio = normalizedCurrent / normalizedOpposite
bonus = min(1, max(0, (ratio - 1) / (threshold - 1)))
```

| 常量 | 值 |
|------|-----|
| COMBAT_EXPERIENCE_ADVANTAGE_THRESHOLD | 5 |
| COMBAT_EXPERIENCE_ADVANTAGE_BASELINE | 100 |

## 普攻战斗经验伤害乘区

```typescript
ratio = attackerExp / defenderExp
multiplier = clamp(ratio, 0.5, 2.0)
```

| 常量 | 值 |
|------|-----|
| BASIC_ATTACK_COMBAT_EXPERIENCE_DAMAGE_MULTIPLIER_MIN | 0.5 |
| BASIC_ATTACK_COMBAT_EXPERIENCE_DAMAGE_MULTIPLIER_MAX | 2.0 |

## 百分比修饰转乘区

```typescript
percentModifierToMultiplier(percent):
  percent > 0: return 1 + percent/100
  percent < 0: return 1 / (1 + |percent|/100)  // 反比衰减，不会压到0
```

## 灵力消耗超限惩罚

```typescript
calcQiCostWithOutputLimit(plannedCost, maxOutput):
  if plannedCost ≤ maxOutput: return plannedCost
  segment = maxOutput × 0.2
  overflow = plannedCost - maxOutput
  fullSegments = floor(overflow / segment)
  remainder = overflow - fullSegments × segment
  fullSegmentCost = segment × fullSegments × (fullSegments + 3) / 2
  remainderCost = remainder × (fullSegments + 2)
  return maxOutput + fullSegmentCost + remainderCost
```

## 冷却速度计算

```typescript
cooldownRate = signedRatioValue(cooldownSpeed, cooldownDivisor)
cooldownMultiplier = percentModifierToMultiplier(-cooldownRate × 100)
actualCooldown = max(1, ceil(baseCooldown × cooldownMultiplier))
```

## 技能公式求值系统

源文件: `packages/server/src/runtime/combat/player-combat.service.ts`

### 公式结构

支持递归求值:
- 数值字面量
- 变量引用: `{var: "xxx", scale?: number}`
- 运算符: add, sub, mul, div, min, max, clamp

### 可用变量

| 变量 | 含义 |
|------|------|
| techLevel | 功法等级 |
| targetCount | 目标数量 |
| caster.hp/maxHp/qi/maxQi | 施法者资源 |
| target.hp/maxHp/qi/maxQi | 目标资源 |
| caster.realmLv | 施法者境界等级 |
| caster.attr.{key} | 施法者最终属性 |
| caster.stat.{key} | 施法者数值属性 |
| target.attr.{key} | 目标最终属性 |
| target.stat.{key} | 目标数值属性 |
| caster.buff.{id}.stacks | 施法者 buff 层数 |
| target.buff.{id}.stacks | 目标 buff 层数 |

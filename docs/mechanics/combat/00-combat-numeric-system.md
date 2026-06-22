# 战斗公式与数值系统总览

本文是战斗域的总入口，描述服务端权威战斗结算、属性数值结算、技能冷却与灵力消耗的当前公式。更细的专题文档仍保留在同目录和 `growth/`、`design/balance/` 下；本文只收口运行时已经消费的主链路。

## 权威来源

| 范围 | 源文件 |
|------|--------|
| 战斗管线 | `packages/server/src/runtime/combat/combat-pipeline-compose.ts` |
| 判定、减伤、随机源 | `packages/server/src/runtime/combat/combat-pipeline.ts`, `packages/server/src/runtime/combat/combat-resolution.helpers.ts` |
| 通用数值函数 | `packages/shared/src/numeric.ts`, `packages/shared/src/combat.ts` |
| 属性结算 | `packages/server/src/runtime/player/player-attributes.service.ts` |
| 属性常量 | `packages/shared/src/constants/gameplay/attributes.ts`, `packages/shared/src/constants/gameplay/combat.ts` |
| 玩家技能施放 | `packages/server/src/runtime/world/combat/world-runtime-player-skill-dispatch.service.ts` |
| 怪物属性 | `packages/shared/src/monster.ts`, `packages/shared/src/constants/gameplay/monster.ts` |

客户端只展示和预判，最终战斗结果、资源扣除、冷却写入、死亡和掉落都以服务端为准。

## 通用数值函数

### RatioValue

`ratioValue(value, divisor)` 用于收益递减。

```text
value = 0          -> 0
divisor <= 0      -> value > 0 ? 1 : -1
value > 0         -> value / (value + divisor)
value < 0         -> -value / divisor
```

默认除数 `DEFAULT_RATIO_DIVISOR = 100`。

常见用途：

- 闪避、暴击、破防、化解等对抗概率。
- 元素减免。
- 冷却速度等允许正负变化的比例属性。

### SignedRatioValue

`signedRatioValue(value, divisor)` 保留正负方向：

```text
magnitude = ratioValue(abs(value), divisor)
value > 0 -> magnitude
value < 0 -> -magnitude
```

冷却速度使用这个函数，因此正冷却速度会缩短冷却，负冷却速度会拉长冷却。

### 百分比乘区

`percentModifierToMultiplier(percent)`：

```text
percent = 0 -> 1
percent > 0 -> 1 + percent / 100
percent < 0 -> 1 / (1 + abs(percent) / 100)
```

负值使用反比衰减，不会把乘区直接压成 0。

### 万分比乘区

`basisPointModifierToMultiplier(rateBp)`：

```text
100 = +1%
-500 = -5%
multiplier = percentModifierToMultiplier(rateBp / 100)
```

常用于经验率、掉落率、灵气消耗减免等以万分比表达的字段。

## 属性系统

### 六维属性

| 字段 | 中文 | 默认值 |
|------|------|--------|
| `constitution` | 体质 | 10 |
| `spirit` | 神识 | 10 |
| `perception` | 感知 | 10 |
| `talent` | 根骨 | 10 |
| `strength` | 力量 | 10 |
| `meridians` | 经脉 | 10 |

### 六维到数值属性

六维不直接写入大多数战斗数值，而是提供百分比加成。

| 六维 | 加成目标 |
|------|----------|
| 体质 | 最大生命 +1%、生命回复 +1%、物理防御 +1% |
| 神识 | 法术攻击 +1%、法术防御 +1%、命中 +1% |
| 感知 | 闪避 +1%、移动速度 +0.5%、抗暴 +1% |
| 根骨 | 最大生命 +1%、最大灵力 +1%、化解 +1% |
| 力量 | 物理攻击 +1%、暴击 +1%、破防 +1% |
| 经脉 | 最大灵力 +1%、每息灵力输出 +1%、灵力回复 +1% |

### 基础数值

| 字段 | 含义 | 基础值 |
|------|------|--------|
| `maxHp` | 最大生命 | 100 |
| `maxQi` | 最大灵力 | 50 |
| `physAtk` | 物理攻击 | 10 |
| `spellAtk` | 法术攻击 | 5 |
| `physDef` | 物理防御 | 0 |
| `spellDef` | 法术防御 | 0 |
| `hit` | 命中 | 0 |
| `maxQiOutputPerTick` | 每息灵力输出上限 | 10 |
| `hpRegenRate` | 每息生命回复 | 5 |
| `qiRegenRate` | 每息灵力回复 | 2.5 |
| `actionsPerTurn` | 每息战斗行动次数 | 1 |

### 玩家六维结算顺序

`finalAttrs` 的结算顺序：

```text
rawBaseAttrs
+ 境界六维加成
+ 功法六维加成
+ 运行时六维加成
clamp >= 0
+ 装备六维
clamp >= 0
* 炼体百分比
* 功法满层百分比
* 根基百分比
+ buff 固定六维
* buff 百分比
* 丹药百分比
clamp >= 0
```

装备六维会先按装备境界有效性折算，再进入最终六维。

### 玩家数值属性结算顺序

`numericStats` 的结算顺序：

```text
境界数值模板
+ 六维原始点数加成
+ 六维百分比加成池
+ 功法特殊属性
+ 装备数值
+ 装备进度效果
+ buff 固定数值
+ 运行时数值加成
+ 修炼基础数值
* 六维/装备百分比池
* 境界等级缩放
+ 灵根五行加成
+ vital 基准加成
* buff 百分比
* 丹药百分比
* 世界时间视野修正
round
```

最终 `roundNumericStats` 会把大多数数值压到非负整数；允许负值的字段包括 `moveSpeed`、`cooldownSpeed`、`auraCostReduce`、`auraPowerRate`、`playerExpRate`、`techniqueExpRate`、`lootRate`、`rareLootRate`、`extraAggroRate`。

### 境界数值缩放

指数成长：

```text
getRealmAttributeMultiplier(realmLv) = 1.1 ^ (realmLv - 1)
```

适用字段：

```text
maxHp, maxQi, physAtk, spellAtk, physDef, spellDef,
hit, dodge, crit, antiCrit, breakPower, resolvePower,
maxQiOutputPerTick, qiRegenRate, hpRegenRate
```

线性成长：

```text
getRealmLinearGrowthMultiplier(realmLv, rate) = 1 + rate * (realmLv - 1)
```

当前字段：

| 字段 | rate |
|------|------|
| `critDamage` | 0.1 |
| `realmExpPerTick` | 0.1 |
| `techniqueExpPerTick` | 0.1 |

### Buff 境界有效性

```text
effectFactor = stacks * realmEffectiveness

buffRealmLv >= targetRealmLv -> realmEffectiveness = 1
buffRealmLv < targetRealmLv  -> realmEffectiveness = 0.9 ^ (targetRealmLv - buffRealmLv)
```

## 战斗结算管线

完整战斗者目标使用以下顺序：

```text
破防 -> 闪避 -> 化解 -> 暴击 -> 五行加成 -> 防御减伤 -> 暴击乘区 -> 境界差 -> 额外乘区
```

地块、阵法、容器类目标使用简化链路：

```text
五行加成 -> 额外乘区
```

地块链路不吃命中、闪避、破防、化解、暴击、防御和境界差。

### 输入伤害

所有战斗者伤害先生成 `baseDamage`，然后进入管线：

```text
baseDamage = max(1, round(input.baseDamage))
damage = baseDamage
rawDamage = baseDamage
```

`damage` 会吃防御减伤；`rawDamage` 不吃防御减伤，用于保留未减伤口径。后续五行加成、暴击、境界差和额外乘区会同时影响二者。

### 对抗率判定

通用对抗概率：

```text
resolveOpposedCombatRate(value, opposingValue)
= ratioValue(max(0, value), max(1, max(0, opposingValue) + 100))
```

等价展开：

```text
value <= 0 -> 0
value > 0  -> value / (value + opposingValue + 100)
```

用于：

- 破防 vs 化解
- 闪避 vs 命中
- 化解 vs 破防
- 暴击 vs 抗暴

### 破防

随机数消费顺序第 1 位。

```text
条件: attacker.breakPower > target.resolvePower
breakChance = resolveOpposedCombatRate(attacker.breakPower, target.resolvePower)
broken = random() < breakChance
```

破防成功后：

- 命中属性翻倍。
- 暴击属性翻倍。

### 闪避

随机数消费顺序第 2 位。

```text
attackerBonus = combatExperienceBonus(attackerCombatExp, targetCombatExp)
defenderBonus = combatExperienceBonus(targetCombatExp, attackerCombatExp)

effectiveHit = attacker.hit * (broken ? 2 : 1) * (1 + attackerBonus)
effectiveDodge = target.dodge * (1 + defenderBonus)
dodgeChance = resolveOpposedCombatRate(effectiveDodge, effectiveHit)
dodged = random() < dodgeChance
```

闪避成功后：

```text
hit = false
damage = 0
rawDamage = 0
```

后续环节不再执行。

### 战斗经验优势

命中和闪避判定会计算双方战斗经验优势：

```text
normalizedCurrent = max(0, currentExp) + 100
normalizedOpposite = max(0, oppositeExp) + 100

if normalizedCurrent <= normalizedOpposite:
  bonus = 0
else:
  ratio = normalizedCurrent / normalizedOpposite
  bonus = clamp((ratio - 1) / (5 - 1), 0, 1)
```

经验达到对方 5 倍时，该方向加成封顶为 `1`，即用于命中/闪避时形成 `* (1 + 1)`。

### 化解

随机数消费顺序第 3 位。

```text
条件: target.resolvePower > attacker.breakPower
resolveChance = resolveOpposedCombatRate(target.resolvePower, attacker.breakPower)
resolved = random() < resolveChance
```

化解成功后，防御减伤环节中的防御值翻倍。

### 暴击

随机数消费顺序第 4 位。

```text
effectiveCrit = attacker.crit * (broken ? 2 : 1)
critChance = resolveOpposedCombatRate(effectiveCrit, target.antiCrit)
crit = random() < critChance
```

暴击是否发生和暴击伤害倍率分开计算。

## 伤害乘区

### 五行伤害加成

当技能或攻击带有元素 `element` 时：

```text
bonusValue = attacker.elementDamageBonus[element] ?? 0
bonusMultiplier = percentModifierToMultiplier(bonusValue)
damage = round(damage * bonusMultiplier)
rawDamage = round(rawDamage * bonusMultiplier)
```

`bonusValue = 100` 表示 `* 2`；`bonusValue = -50` 表示 `* 1 / 1.5`。

### 物理防御与法术防御减伤

当前系统里的“护甲/魔抗”分别对应：

| 通俗叫法 | 运行时字段 | 适用伤害 |
|----------|------------|----------|
| 护甲 | `physDef` | `damageKind = physical` |
| 魔抗 | `spellDef` | `damageKind = spell` |

防御选择：

```text
defense = damageKind == physical ? target.physDef : target.spellDef
attackBasis = damageKind == physical ? attacker.physAtk : attacker.spellAtk

if resolved:
  defense = defense * 2
```

防御减伤：

```text
scaledDefense = defense * 1.11 ^ targetRealmLv
reductionBasis = max(1, attackBasis + 100)
defenseReduction = ratioValue(scaledDefense, reductionBasis)

damage = max(1, round(damage * max(0, 1 - defenseReduction)))
```

等价正值公式：

```text
defenseReduction =
  scaledDefense / (scaledDefense + attackBasis + 100)
```

要点：

- 防御越高，减伤越高，但收益递减。
- 攻击方对应攻击越高，目标同样防御带来的减伤越低。
- 目标境界越高，同样防御会通过 `1.11 ^ targetRealmLv` 放大。
- 化解成功时只放大本次结算使用的防御值，不永久改属性。
- 防御只影响 `damage`，不影响 `rawDamage`。

### 元素减免

目标有对应元素减免且本次伤害带元素时：

```text
elementReduceValue = target.elementDamageReduce[element]
elementReduceDivisor = target.ratioDivisors.elementDamageReduce[element]
elementReduce = ratioValue(elementReduceValue, elementReduceDivisor)
```

元素减免和防御减伤叠乘：

```text
totalReduction = 1 - (1 - defenseReduction) * (1 - elementReduce)
damage = round(damageBeforeReduction * (1 - totalReduction))
```

也可以理解为先吃防御剩余伤害，再吃元素减免剩余伤害。

### 暴击伤害

暴击发生后才应用暴击乘区：

```text
critMultiplier = (200 + max(0, attacker.critDamage) / 10) / 100
damage = round(damage * critMultiplier)
rawDamage = round(rawDamage * critMultiplier)
```

当前含义：

- `critDamage = 0` 表示基础暴击倍率 `2.0`。
- `critDamage` 每 10 点增加 1% 暴击伤害。
- 负数暴击伤害不会降低基础暴击倍率。

### 境界差伤害

```text
realmGap = attackerRealmLv - defenderRealmLv

realmGap > 0 -> multiplier = 1.2 ^ realmGap
realmGap < 0 -> multiplier = 0.8 ^ abs(realmGap)
realmGap = 0 -> multiplier = 1
```

该乘区同时作用于 `damage` 和 `rawDamage`。

### 普攻战斗经验伤害乘区

普通攻击可以额外传入 `extraMultiplier`，其中战斗经验乘区为：

```text
ratio = max(1, attackerExp) / max(1, defenderExp)
multiplier = clamp(ratio, 0.5, 2.0)
```

技能伤害不默认套用这个普攻经验伤害乘区。

## 技能施放

### 技能效果公式

技能伤害、治疗等效果使用结构化公式 AST：

```text
number
{ var: "caster.stat.physAtk", scale?: number }
{ op: "add" | "sub" | "mul" | "div" | "min" | "max", args: SkillFormula[] }
{ op: "clamp", value: SkillFormula, min?: number, max?: number }
```

常用变量：

| 变量 | 含义 |
|------|------|
| `techLevel` | 功法等级 |
| `targetCount` | 目标数量 |
| `caster.hp/maxHp/qi/maxQi` | 施法者资源 |
| `target.hp/maxHp/qi/maxQi` | 目标资源 |
| `caster.realmLv` | 施法者境界 |
| `caster.attr.*` | 施法者六维 |
| `caster.stat.*` | 施法者数值属性 |
| `target.attr.*` | 目标六维 |
| `target.stat.*` | 目标数值属性 |
| `caster.buff.{id}.stacks` | 施法者 buff 层数 |
| `target.buff.{id}.stacks` | 目标 buff 层数 |

公式求值后会作为 `baseDamage` 或治疗基础值进入后续流程。

### 灵力消耗

技能配置或展开结果先得到计划消耗：

```text
plannedCost = max(0, round(skill.cost))
```

实际扣除经过每息灵力输出上限惩罚：

```text
if plannedCost <= 0:
  cost = 0
if maxQiOutputPerTick <= 0:
  cost = Infinity
if plannedCost <= maxQiOutputPerTick:
  cost = plannedCost
else:
  segment = maxQiOutputPerTick * 0.2
  overflow = plannedCost - maxQiOutputPerTick
  fullSegments = floor(overflow / segment)
  remainder = overflow - fullSegments * segment
  fullSegmentCost = segment * fullSegments * (fullSegments + 3) / 2
  remainderCost = remainder * (fullSegments + 2)
  cost = maxQiOutputPerTick + fullSegmentCost + remainderCost
```

含义：

- 不超过每息灵力输出上限时，按原值消耗。
- 超出上限后，每 20% 上限为一段，越往后倍率越高。
- 上限为 0 时无法支付正消耗技能。

### 冷却

基础冷却：

```text
baseCooldown = max(1, round(skill.cooldown || 1))
```

冷却速度：

```text
cooldownSpeed = trunc(player.numericStats.cooldownSpeed)
cooldownDivisor = max(1, trunc(player.ratioDivisors.cooldownSpeed || 100))
cooldownRate = signedRatioValue(cooldownSpeed, cooldownDivisor)
cooldownMultiplier = percentModifierToMultiplier(-cooldownRate * 100)
actualCooldown = max(1, ceil(baseCooldown * cooldownMultiplier))
```

例子：

```text
cooldownSpeed = 100, divisor = 100
cooldownRate = 100 / (100 + 100) = 0.5
cooldownMultiplier = percentModifierToMultiplier(-50) = 1 / 1.5
actualCooldown = ceil(baseCooldown * 0.666...)
```

冷却写入：

```text
readyTick = currentTick + actualCooldown
player.combat.cooldownReadyTickBySkillId[skill.id] = readyTick
```

检查时：

```text
currentTick < readyTick -> 仍在冷却
currentTick >= readyTick -> 可释放
```

如果保存的 `readyTick` 已过期，或者大于当前公式可得最大冷却窗口，会清理该冷却记录。

### 吟唱

玩家技能可配置：

```text
playerCast.windupTicks
playerCast.warningColor
```

吟唱期间存在 pending cast。取消、超时、配置版本不匹配时按 pending cast 策略处理；当前资源策略为已提交不退还，冷却策略为已提交不回滚。

## 行动预算与自动战斗

每息可执行战斗行动数：

```text
actionsPerTurn = max(1, trunc(player.numericStats.actionsPerTurn))
hasBudget = combatActionsUsedThisTick < actionsPerTurn
```

自动战斗触发前提：

- `autoBattle` 或 `autoRetaliate` 开启。
- 玩家存活。
- 没有未处理 pending command、导航意图或 pendingSkillCast。
- 当前 tick 仍有行动预算。

自动目标评分：

```text
score =
  threatValue
  * distanceMultiplier
  * targetingPreferenceMultiplier
```

偏好目标通常提供 `* 5`，不可达目标仇恨按 `* 0.2` 衰减。

## 怪物数值

怪物配置长期主线字段：

```text
level
grade
tier
attrTendency
statTendency
skills
aggroRange / leashRange / wanderRadius / attackRange
drop / respawn
```

### 品阶倍率

```text
gradePercent = 100 + gradeRank * 10
```

| 品阶 | rank | 全属性百分比 |
|------|------|--------------|
| mortal | 0 | 100% |
| yellow | 1 | 110% |
| mystic | 2 | 120% |
| earth | 3 | 130% |
| heaven | 4 | 140% |
| spirit | 5 | 150% |
| saint | 6 | 160% |
| emperor | 7 | 170% |

### 血脉层次倍率

| 层次 | 全属性 | 最大生命 |
|------|--------|----------|
| mortal_blood | 100% | 100% |
| variant | 120% | 360% |
| demon_king | 140% | 1400% |

### 怪物全局压制

```text
hpRegenRate = 25%
dodge = 25%
antiCrit = 25%
其余 = 100%
```

### 怪物境界成长

```text
getRealmAttributeMultiplier(lv) = 1.1 ^ (lv - 1)
```

适用字段和玩家主要战斗指数属性一致。

### 怪物普攻

```text
attack = max(monster.physAtk, monster.spellAtk)
baseDamage = max(1, round(attack))
```

随后进入完整战斗者伤害管线。

### 怪物恢复

```text
hpRecover = round(hpRegenRate)
qiRecover = round(qiRegenRate)
```

每 tick 恢复，非正数不恢复。

## 掉落与经验相关数值

### 掉落率

```text
baseChance = drop.chance ?? 1
totalRateBonus = lootRate + (baseChance <= 0.001 ? rareLootRate : 0)

bonus >= 0 -> killEquivalent = 1 + bonus / 10000
bonus < 0  -> killEquivalent = 1 / (1 + abs(bonus) / 10000)

chance = 1 - (1 - baseChance) ^ killEquivalent
```

稀有掉落率只作用于 `baseChance <= 0.001` 的掉落。

### 普通怪越级货币掉落衰减

```text
玩家等级超过怪物 1 级以上:
  普通怪自动灵石和自动功德掉率 *= 0.7
```

### 击杀经验等级差

```text
levelDelta = min(10, abs(monsterLevel - playerLevel))

玩家低于怪物:
  mortal_blood: adjustment = 1.1 ^ levelDelta
  variant:      adjustment = 1.25 ^ levelDelta
  demon_king:   adjustment = 1.4 ^ levelDelta

玩家高于怪物:
  adjustment = 0.75 ^ levelDelta
```

### 怪物等级分段衰减

```text
levelDecay =
  0.98 ^ (min(level, 18) - 1)
  * 0.95 ^ max(0, min(level, 30) - 18)
  * 0.92 ^ max(0, level - 30)
```

### 血脉层次经验倍率

| 层次 | 倍率 |
|------|------|
| mortal_blood | 1 |
| variant | 5 |
| demon_king | 100 |

## 常见设计判断

### 护甲和魔抗是不是固定百分比？

不是。`physDef` 和 `spellDef` 先经过目标境界放大，再和攻击方对应攻击一起进入收益递减公式。攻击越高，同样防御的减伤越低。

### 暴击伤害字段为什么可以是 0？

因为基础暴击倍率内建为 `200%`。`critDamage = 0` 已经是 2 倍暴击；该字段只表示额外暴击伤害。

### 冷却速度为什么不是直接减百分比？

冷却速度先走 `signedRatioValue`，再转成百分比乘区。这样高冷却速度收益递减，负冷却速度也不会把冷却无限拉大。

### 数值系统的主线是什么？

主线是：

```text
配置/持久化动态字段
-> 启动期或重算期展开
-> player.attrs.finalAttrs / numericStats / ratioDivisors
-> 战斗 tick 只读取展开结果
```

战斗 tick 不解析 AI 草稿、不跑 schema、不根据长文本配置临时拼公式。

## 相关文档

- `docs/mechanics/combat/05-combat-flow.md`
- `docs/mechanics/combat/06-damage-calculation.md`
- `docs/mechanics/combat/07-threat-system.md`
- `docs/mechanics/combat/08-monster-ai.md`
- `docs/mechanics/combat/09-monster-spawn-drop.md`
- `docs/mechanics/growth/10-attributes.md`
- `docs/mechanics/growth/13-technique-skill.md`
- `docs/design/balance/全战斗数值量化设计.md`
- `docs/design/balance/术法预算量化设计.md`
- `docs/design/balance/怪物当前属性计算总览.md`

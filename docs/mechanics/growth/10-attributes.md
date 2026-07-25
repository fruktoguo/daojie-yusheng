# 属性系统

## 六维属性定义

源文件: `packages/shared/src/constants/gameplay/attributes.ts`

| 属性键 | 含义 | 默认初始值 |
|--------|------|-----------|
| constitution | 体质 | 10 |
| spirit | 神识 | 10 |
| perception | 感知 | 10 |
| talent | 根骨 | 10 |
| strength | 力量 | 10 |
| meridians | 经脉 | 10 |

## 六维→数值面板百分比加成权重

`ATTR_TO_PERCENT_NUMERIC_WEIGHTS`:

| 属性 | 加成目标 |
|------|----------|
| constitution | maxHp +1%, hpRegenRate +1%, physDef +1% |
| spirit | spellAtk +1%, spellDef +1%, hit +1% |
| perception | dodge +1%, moveSpeed +0.5%, antiCrit +1% |
| talent | maxHp +1%, maxQi +1%, resolvePower +1% |
| strength | physAtk +1%, crit +1%, breakPower +1% |
| meridians | maxQi +1%, maxQiOutputPerTick +1%, qiRegenRate +1% |

每点属性提供对应数值面板的 1% 百分比乘区加成（perception→moveSpeed 为 0.5%）。

## 百分比乘区公式

源文件: `packages/shared/src/numeric.ts`

```typescript
percentModifierToMultiplier(percent):
  if percent > 0: return 1 + percent / 100
  if percent < 0: return 1 / (1 + |percent| / 100)  // 负向反比衰减
```

## 属性结算流程

源文件: `packages/server/src/runtime/player/player-attributes.service.ts`

### 六维属性叠加顺序

```
1. rawBaseAttrs（角色初始六维）
2. + 境界六维加成 resolvePlayerRealmAttributeBonus(stage)
3. + 功法六维加成 calcTechniqueFinalAttrBonus
4. + runtimeBonuses（非派生来源的运行时加成）
5. clamp ≥ 0 → baseAttrs
6. + 装备六维（经 realmLv 有效性折算）→ finalAttrs
7. 百分比乘区依次叠加:
   bodyTraining → techniqueMax → realm(根基) → flatBuff → buff% → pill%
8. clamp ≥ 0
```

### 数值面板叠加顺序

```
1.  境界数值模板 resolvePlayerRealmNumericTemplate(stage) 作为基底
2.  + 六维→数值权重（flat + percent 分别累积）
3.  + 装备 equipStats / valueStats
4.  + buff flat stats
5.  + 修炼态加成（realmExpPerTick, techniqueExpPerTick）
6.  applyPercentBonuses（六维百分比 + 装备百分比）
7.  applyRealmNumericScaling（境界等级指数/线性缩放）
8.  applySpiritualRoots（灵根→五行伤害/减伤）
9.  + vitalBaselineBonus
10. buff% → pill%
11. 世界时间视野修正
12. round 取整
```

## 境界等级数值缩放

源文件: `packages/shared/src/combat.ts`

### 指数成长属性

```typescript
REALM_ATTRIBUTE_GROWTH_RATE = 0.1
getRealmAttributeMultiplier(realmLv) = (1 + 0.1)^(realmLv - 1)
```

适用: maxHp, maxQi, physAtk, spellAtk, physDef, spellDef, hit, dodge, crit, antiCrit, breakPower, resolvePower, maxQiOutputPerTick, qiRegenRate, hpRegenRate

### 线性成长属性

```typescript
REALM_COMBAT_LINEAR_GROWTH_RATE = 0.02
getRealmLinearGrowthMultiplier(realmLv, rate) = 1 + rate × (realmLv - 1)
```

| 属性 | 成长率 |
|------|--------|
| realmExpPerTick | 0.1 |
| techniqueExpPerTick | 0.1 |

`critDamage = 0` 表示基础暴击伤害为 200%；当前基准属性不分配额外暴伤，只有显式来源才会提高暴击倍率。

## 基础数值常量

| 常量 | 值 |
|------|-----|
| BASE_MAX_HP | 100 |
| BASE_MAX_QI | 50 |
| BASE_PHYS_ATK | 10 |
| BASE_SPELL_ATK | 5 |
| BASE_MAX_QI_OUTPUT_PER_TICK | 10 |
| BASE_HP_REGEN_RATE | 5（每息固定值） |
| BASE_QI_REGEN_RATE | 2.5（每息固定值） |
| HP_PER_CONSTITUTION | 10 |

## Buff 效果因子

```typescript
getBuffEffectFactor(buff, targetRealmLv) = stacks × realmEffectiveness
realmEffectiveness = buffRealmLv >= targetRealmLv ? 1 : 0.9^(targetRealmLv - buffRealmLv)
```

## 装备属性有效性折算

```typescript
EQUIPMENT_REALM_EFFECTIVENESS_PENALTY_PER_LEVEL = 0.05
// 装备境界低于玩家时，每级差减少 5% 有效性
```

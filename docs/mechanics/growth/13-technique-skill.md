# 功法与技能

## 功法品阶与经验

源文件: `packages/shared/src/constants/gameplay/technique.ts`

### 品阶经验基线倍率

`TECHNIQUE_GRADE_EXP_BASE_FACTORS`:

| 品阶 | 倍率 |
|------|------|
| mortal | 10 |
| yellow | 30 |
| mystic | 90 |
| earth | 270 |
| heaven | 810 |
| spirit | 2430 |
| saint | 7290 |
| emperor | 21870 |

### 功法升级经验

```typescript
getTechniqueExpToNext(level, layers) → 由 layers 配置定义每层 expToNext
```

### 经验缩放

```typescript
scaleTechniqueExp(expFactor, realmLv) = round(expFactor × 100 × realmLv)
```

## 功法经验等级差修正

```typescript
TECHNIQUE_EXP_LEVEL_DELTA_MULTIPLIER_STEP = 0.3

getTechniqueExpLevelAdjustment(playerRealmLv, techniqueRealmLv):
  if player < technique: return 0.7^(technique - player)  // 惩罚
  if player > technique: return 1.3^(player - technique)  // 加速
  else: return 1
```

## 功法境界推导

```typescript
deriveTechniqueRealm(level, layers):
  progress = level / maxLevel
  >= 1.0 → Perfection（圆满）
  >= 0.66 → Major（大成）
  >= 0.33 → Minor（小成）
  else → Entry（入门）
```

## 技能灵力消耗

```typescript
cost = costMultiplier × gradeQiCostMultiplier × realmLv × realmAttributeMultiplier
```

品阶消耗倍率: mortal:1, yellow:2, mystic:3, earth:4, heaven:5, spirit:6, saint:7, emperor:8

## 技能定义（SkillDef）

关键字段:
- id, name, desc
- cooldown（息）
- cost（灵力）
- range（射程）
- targeting（目标选择）
- effects[]（效果列表: damage / heal / buff）
- unlockLevel, unlockRealm

## 技能公式结构（SkillFormula）

递归 AST:
- 常数: `number`
- 变量引用: `{ var: SkillFormulaVar, scale? }`
- 运算: `{ op: 'add'|'sub'|'mul'|'div'|'min'|'max', args: SkillFormula[] }`
- 钳位: `{ op: 'clamp', value, min?, max? }`

## AI 术法权重展开

源文件: `packages/shared/src/technique-arts-strength.ts`

内容和 AI 草稿只写权重，不直接写运行时 `effects[].formula`、`cost`、`cooldown`、`targeting`。
伤害/治疗的效果强度只来自属性基底或变量基底，不再支持固定基础伤害值。

```typescript
structureBudgetMultiplier =
  product(structureStrength.cost/cooldown/chant/area/range 对应的预算乘数)

weight >= 0: multiplier = 1.2^weight
weight < 0:  multiplier = 0.9^abs(weight)

totalBudget = effectStrength * structureBudgetMultiplier
effectBudget = totalBudget / structureBudgetMultiplier
effectScale = effectBudget / effectStrength
```

`totalBudget` 是结构折算后的技能总预算；运行时公式效果预算由服务端反推。多效果技能使用 `effectsStrength[].effectBudget` 表示单个伤害/治疗效果预算，纯 buff 不消耗效果预算。

## 炼体系统

```typescript
BODY_TRAINING_EXP_BASE = 10000
BODY_TRAINING_EXP_GROWTH_RATE = 1.2
getBodyTrainingExpToNext(level) = round(10000 × 1.2^level)
BODY_TRAINING_ATTR_PERCENT_PER_LEVEL = 1  // 每层全属性+1%
```

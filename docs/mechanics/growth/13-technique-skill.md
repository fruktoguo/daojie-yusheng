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

## 功法领悟进度

未领悟功法使用 `requiredProgress/progress` 表示领悟总需求和当前进度。

```typescript
requiredProgress = ceil(base × techniqueRealmLv × gradeFactor)
```

`base`：普通功法 10，自创功法 300。

`gradeFactor`：mortal=1, yellow=2, mystic=3, earth=4, heaven=5, spirit=6, saint=7, emperor=8。

境界差、学习者传法技能、传授者传法技能不改变 `requiredProgress`，只改变每息获得的 `progressGain`：

```typescript
progressGain = baseProgress / difficultyFactor
difficultyFactor =
  realmFactor(techniqueRealmLv, learnerRealmLv)
  × transmissionSkillFactor(learnerTransmissionLevel, techniqueRealmLv)
  × transmissionSkillFactor(teacherTransmissionLevel, techniqueRealmLv) // 仅传法时

realmFactor:
  technique > learner → 1.1^(technique - learner)
  technique < learner → 0.98^(learner - technique)
  same → 1

transmissionSkillFactor:
  skill > technique → 0.95^(skill - technique)
  skill < technique → 1.05^(technique - skill)
  same → 1
```

领悟进度可保留小数；客户端文本当前按整数展示，服务端持久化使用 double precision 保存。

传法不是 pending 功法条目上的旁路状态，而是学习者身上的正式通用技艺 job。学习者同一时间只能接受一个传法 job；传授者由 job 私有字段记录，作为距离、功法掌握和传法技能加成的条件来源。传法未取消或完成时，对应 pending 功法不能自行领悟；取消后保留已有领悟进度，可由其他传授者重新开始传法并继续推进。传法 job 每实际推进 1 息时，学习者和当前传授者都按 1 息获得传法技艺经验；自行领悟 pending 功法时，自学者按本次修炼投入息数获得传法技艺经验，领悟速度加成只影响进度，不额外放大技艺经验。

传法与自行领悟界面应展示当前估算速率、预计剩余完成息数和速率构成。速率构成至少包含基准进度、境界差影响、自身传法等级影响；传法 job 额外展示传授者传法等级影响和合计影响。传法速率与构成由服务端随 job 投影给学习者；自行领悟速率与构成可由客户端按当前玩家境界、传法等级和 pending 功法境界本地推算。速率展示只用于估算，不要求每息额外发送网络包。

功法玩家态持久化只保存动态真源字段，不保存模板可补全的重复字段。已掌握功法从 `player_technique_state` 的 `tech_id/level/exp/exp_to_next/realm_lv/skills_enabled` 恢复，并在运行时通过内容模板补全 `name/grade/category/skills/layers`。未领悟功法从 `player_technique_comprehension` 的 `tech_id/source_kind/progress/required_progress/realm_lv/grade/category/creator_player_id/self_comprehension_allowed/created_at_tick/updated_at_tick` 恢复；`raw_payload` 不作为功法重复字段真源。

`self_comprehension_allowed` 表示是否允许通过主修修炼自行领悟。功法书开启的普通功法、自己创建的自创功法为 `true`；被其他玩家传授加入的 pending 功法为 `false`，只能由传法 job 推进，不能设为主修；客户端按钮必须置灰，服务端必须拒绝该主修切换。

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

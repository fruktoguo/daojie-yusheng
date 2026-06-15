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

自动切换主修同样会考虑允许自悟的 pending 功法：当前已学功法圆满后，若轮到 pending 功法，主修可自动切换到该 pending 并继续按自悟规则推进。

怪物击杀可推进当前主修 pending 的领悟进度，但领悟量不使用怪物经验值、等级差、血脉层次或掉落倍率换算；每击杀一个怪物只等同于自悟修炼 1 息的领悟增量。

传法与自行领悟界面应展示当前估算速率、预计剩余完成息数和速率构成。速率构成至少包含基准进度、境界差影响、自身传法等级影响；传法 job 额外展示传授者传法等级影响和合计影响。传法速率与构成由服务端随 job 投影给学习者；自行领悟速率与构成可由客户端按当前玩家境界、传法等级和 pending 功法境界本地推算。速率展示只用于估算，不要求每息额外发送网络包。

功法玩家态持久化只保存动态真源字段，不保存模板可补全的重复字段。已掌握功法从 `player_technique_state` 的 `tech_id/level/exp/exp_to_next/realm_lv/skills_enabled` 恢复，并在运行时通过内容模板补全 `name/grade/category/skills/layers`。未领悟功法从 `player_technique_comprehension` 的 `tech_id/source_kind/progress/required_progress/realm_lv/grade/category/creator_player_id/self_comprehension_allowed/created_at_tick/updated_at_tick` 恢复；`raw_payload` 不作为功法重复字段真源。

`self_comprehension_allowed` 表示是否允许通过主修修炼自行领悟。功法书开启的普通功法、自己创建的自创功法为 `true`；被其他玩家传授加入的 pending 功法为 `false`，只能由传法 job 推进，不能设为主修；客户端按钮必须置灰，服务端必须拒绝该主修切换。

已掌握功法可以从功法详情底部发起遗忘。客户端必须使用独立确认弹窗收集二次确认；服务端收到遗忘意图后只删除 `player_technique_state` 中对应的已掌握功法，若它正是主修功法则同时清空主修并停止修炼，随后重算属性、技能行动和自动战斗技能列表并标记 `technique/auto_battle_skill/attr` 脏域。遗忘不删除同名未领悟进度，也不绕过服务端权威校验。

## 技能灵力消耗

```text
品阶序号：mortal=0, yellow=1, mystic=2, earth=3, heaven=4, spirit=5, saint=6, emperor=7
品阶指数倍率 = 1.4 ^ 品阶序号
标准灵力输出 = 当前功法境界等级对应的玩家最终基准灵力输出

cost = round(标准灵力输出 × 0.2 × 品阶指数倍率 × costMultiplier)
```

实际施法扣灵还会再经过 `calcQiCostWithOutputLimit(cost, maxQiOutputPerTick)`，超过当前玩家每息灵力输出上限时递增惩罚。

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

目标展开口径：

```typescript
positiveWeight = sum(max(itemWeight, 0))
sacrificeBudget = sum(BUDGET(layer) * abs(negativeWeight) / 100)
positiveBudgetPool = BUDGET(layer) + sacrificeBudget
positive itemBudget = positiveBudgetPool * itemWeight / positiveWeight
negative itemBudget = -BUDGET(layer) * abs(itemWeight) / 100
realValue = convertByItem(itemBudget)
```

- `target.type/targetMode` 只描述目标形状和目标模式，不承载预算权重。
- `structureStrength.damage/cost/cooldown/chant/castRange/area` 是强度权重，不是真实伤害、消耗、冷却、吟唱、距离或覆盖范围。
- 旧草稿里的 `target.castRangeWeight/areaWeight` 仍可作为兼容输入读取；新 AI 生成入口应写 `structureStrength.castRange/area`。
- 负权重会让本项变差，并按绝对权重折算牺牲预算加入正向预算池，由正权重项目继续瓜分。
- 冷却、消耗、施法距离、范围覆盖、属性基底和百分比组各自使用独立转换公式。
- 有最小值或最大值的项目先展开真实值，再按真实可生效值反推已使用预算。
- 每个转换方法返回真实值、已使用预算和未使用预算；触顶或离散档位暂时用不完的正预算按固定轮次平均回流到仍可增长的项目。

详细公式见 `docs/design/balance/术法预算量化设计.md`。正式运行时仍保存展开后的 `SkillDef`，战斗 tick 不读取 AI 权重草稿。

已发布 AI 术法的 `generated_technique.template.skills` 不会因公式代码更新而自动重算。公式调整后，运维需要先通过 GM 快捷指令“迁移旧版AI术法草稿”从 `rawCandidate` 重新展开模板，再通过“刷新在线玩家功法模板”让在线玩家已学技能重新水合；离线玩家下次登录时读取最新模板。

系统自带功法为了迁移旧版手写 `SkillDef`，允许在 `artsStrength` 中使用显式还原参数：`target.rawRange/rawTargeting`、`structureStrength.costMultiplier/cooldownTicks` 和效果里的 `formulaStrength.rawFormula/hpFormulaStrength.rawFormula`。这些字段只用于静态系统内容等价还原旧数值，不进入 AI 生成提示词，也不改变预算公式本身。

## 炼体系统

```typescript
BODY_TRAINING_EXP_BASE = 10000
BODY_TRAINING_EXP_GROWTH_RATE = 1.2
getBodyTrainingExpToNext(level) = round(10000 × 1.2^level)
BODY_TRAINING_ATTR_PERCENT_PER_LEVEL = 1  // 每层全属性+1%
```

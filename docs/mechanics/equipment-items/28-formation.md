# 阵法系统

## 核心常量

源文件: `packages/shared/src/constants/gameplay/formation.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| FORMATION_AURA_PER_SPIRIT_STONE | 100 | 每灵石灵气值 |
| FORMATION_DEFAULT_QI_COST_PER_SPIRIT_STONE | 100 | 每灵石灵力消耗 |
| FORMATION_DEFAULT_DURATION_HOURS | 2 | 默认持续时间（小时） |
| FORMATION_DEFAULT_GROWTH_COST_RATIO | 1.5 | 成长消耗比 |
| FORMATION_DEFAULT_EFFECT_COST_RATIO | 100 | 效果消耗比 |
| FORMATION_TICKS_PER_DAY | 86400 | 每天 tick 数 |
| FORMATION_DEFAULT_DAMAGE_PER_AURA | 100 | 每灵气伤害值 |
| FORMATION_QI_HALF_LIFE_TICKS | 259200 | 阵法灵力半衰期（三天） |
| FORMATION_SKILL_STRENGTH_BONUS_PER_LEVEL | 0.05 | 阵法技艺每级强度增幅 |

## 阵盘品阶倍率

源文件: `packages/shared/src/formation-types.ts`

| 品阶 | 倍率 | 标签 |
|------|------|------|
| mortal | 1 | 凡品 |
| yellow | 2 | 黄阶 |
| mystic | 4 | 玄阶 |
| earth | 8 | 地阶 |

## 阵法资源

阵法运行态拆分为两个资源池：

- 灵力池：维持阵法效果、承受攻击、阵法维护补充的资源。
- 灵石池：维持阵法存在的资源，只被运行持续消耗和补充操作影响，不会因受击减少。

每 tick 运行时同时结算灵力池和灵石池。灵力池统一按三天半衰期衰减；灵石池按每日固定成本扣除。灵力不足时阵法关闭但不摧毁；灵石不足时阵法损毁并从运行态移除。阵法被攻击时只扣灵力池。阵法维护只补充灵力池。

## 基础强度与效果

```typescript
skillStrengthMultiplier = 1.05 ^ 阵法技艺等级
actualStrength = floor(baseStrength × diskMultiplier × skillStrengthMultiplier)
```

- 聚灵阵: `targetAura = actualStrength × 100`
- 固脉阵: `damageReduction = actualStrength / (actualStrength + 1000)`，约 10 强度降低 1% 地块受击伤害
- 太玄封界阵: `damageReduction = actualStrength / (actualStrength + 1000)`，约 10 强度降低 1% 边界受击损耗
- 护宗大阵: `damageReduction = actualStrength / (actualStrength + 100)`，约 1 强度降低 1% 边界受击损耗

所有屏障阵法仍按 `100` 减伤后伤害扣 `1` 点阵法灵力。

## 灵力/灵石预算计算（分配模式）

```typescript
baseAuraBudget = spiritStoneCount × 100
totalAuraBudget = round(baseAuraBudget × diskMultiplier)
totalQiBudget = totalAuraBudget
totalSpiritStoneBudget = spiritStoneCount
effectAura = floor(totalAuraBudget × effectPercent / 100)
rangeAura = floor(totalAuraBudget × rangePercent / 100)
skillStrengthMultiplier = 1.05 ^ 阵法技艺等级
effectValue = floor(effectAura × conversionRatio × skillStrengthMultiplier)
durationScale = max(0.01, durationPercent / 33.33)
dailyQiDecayEstimate = totalQiBudget × (1 - 0.5^(86400 / 259200))
dailySpiritStoneCost = effectAura × diskMultiplier × skillStrengthMultiplier / durationScale
tickQiCost = currentQiBudget × (1 - 0.5^(1 / 259200))
tickSpiritStoneCost = dailySpiritStoneCost / 86400
```

默认三等分: effectPercent=rangePercent=durationPercent=33.33%

## 半径计算（geometric_radius）

```typescript
rawSteps = log(rangeAura / baseAura) / log(ratioPerStep)
steps = max(0, floor(rawSteps / stepDivisor))
radius = max(minRadius, trunc(baseRadius + steps))
```

## Setup 模式成本计算

```typescript
rangeMultiplier = rangeCostRatio ^ (radius - defaultRadius)
durationMultiplier = 短时间用指数插值, 长时间用线性
actualStrength = baseStrength × diskMultiplier × (1.05 ^ 阵法技艺等级)
requiredAuraBudget = ceil(actualStrength × effectCostRatio × rangeMultiplier × durationMultiplier)
dailySpiritStoneCost = requiredAuraBudget
spiritStoneCount = ceil(dailySpiritStoneCost × durationTicks / 86400)
qiCost = ceil(spiritStoneCount × qiPerSpiritStone)
totalQiBudget = requiredAuraBudget
totalSpiritStoneBudget = spiritStoneCount
tickQiCost = currentQiBudget × (1 - 0.5^(1 / 259200))
tickSpiritStoneCost = dailySpiritStoneCost / 86400
```

Setup 模式中，输入框显示为“基础强度”，协议字段仍沿用 `effectValue`。实际效果再吃阵盘倍率和阵法技艺等级增幅。预览中的消耗按每日灵力半衰期估算和每日灵石固定衰减展示。

## 内置阵法模板

| ID | 名称 | 效果类型 | 最低灵石 | minEffectValue |
|----|------|----------|----------|----------------|
| spirit_gathering | 聚灵阵 | tile_aura_source | 100 | 1 |
| earth_stabilizing | 固脉阵 | terrain_stabilizer | 1000 | 1 |
| warding_barrier | 太玄封界阵 | boundary_barrier | 100 | 1 |
| sect_guardian_barrier | 护宗大阵 | boundary_barrier | 1 | 1 |

## 阵法激活条件

- 需要足够灵石投入
- 需要满足 minEffectValue
- 需要阵盘品阶匹配
- 每 tick 按三天半衰期衰减灵力池，并按每日固定成本消耗灵石池
- 玩家从背包布阵时，阵盘目标必须使用 `itemInstanceId` 定位；背包格子顺序只影响 UI 展示。

## 阵法维护

- 玩家站在阵眼/控制点位时，可以开始“阵法维护”。
- 阵法维护走统一技艺活动队列，使用 `formationJob` 记录运行态，并进入统一技艺任务列表。
- 每息注入阵法灵力池的数值为 `floor(sqrt(maxQiOutputPerTick))`，最低 1 点，并消耗同等玩家当前灵力。
- 每息按统一技艺经验公式获得 1 息“阵法”技艺经验。
- 离开阵法控制点位时，按条件型技艺规则休眠或取消，并释放占用。
- 攻击、移动、手动开始修炼等触发的恢复等待必须显示为独立等待条，不改变维护 job 的实际工作进度。
- 玩家持续注入灵力、可等待、可打断、可取消的“阵法补充灵力”必须纳入 `formation` job，并在技艺任务列表中可见、可取消。
- 一次性把资源转入阵法池的补给按钮只属于资源管理命令，不显示为持续 job，不获得阵法技艺经验，也不参与打断等待。

## 阵法效果

- tile_aura_source: 向地块注入灵气
  - 每息注入量按 `(目标灵气 - 当前灵气) / convergenceHalfLifeTicks` 计算，地块灵气以 double 保存。
- terrain_stabilizer: 稳定地形，防止破坏
- boundary_barrier: 边界屏障，阻挡进入

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

## 阵盘品阶倍率

源文件: `packages/shared/src/formation-types.ts`

| 品阶 | 倍率 | 标签 |
|------|------|------|
| mortal | 1 | 凡品 |
| yellow | 2 | 黄阶 |
| mystic | 4 | 玄阶 |
| earth | 8 | 地阶 |

## 灵气预算计算（分配模式）

```typescript
baseAuraBudget = spiritStoneCount × 100
totalAuraBudget = round(baseAuraBudget × diskMultiplier)
effectAura = floor(totalAuraBudget × effectPercent / 100)
rangeAura = floor(totalAuraBudget × rangePercent / 100)
effectValue = floor(effectAura × conversionRatio)
durationScale = max(0.01, durationPercent / 33.33)
dailyActiveCost = totalAuraBudget / durationScale
dailyInactiveCost = dailyActiveCost / 10
tickActiveCost = dailyActiveCost / 86400
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
requiredAuraBudget = ceil(effectValue × effectCostRatio × rangeMultiplier × durationMultiplier)
spiritStoneCount = ceil(requiredAuraBudget / (auraPerSpiritStone × diskMultiplier))
qiCost = ceil(spiritStoneCount × qiPerSpiritStone)
```

## 内置阵法模板

| ID | 名称 | 效果类型 | 最低灵石 | minEffectValue |
|----|------|----------|----------|----------------|
| spirit_gathering | 聚灵阵 | tile_aura_source | 100 | 1000 |
| earth_stabilizing | 固脉阵 | terrain_stabilizer | 1000 | 100000 |
| warding_barrier | 太玄封界阵 | boundary_barrier | 100 | 10000 |
| sect_guardian_barrier | 护宗大阵 | boundary_barrier | 1 | 10000 |

## 阵法激活条件

- 需要足够灵石投入
- 需要满足 minEffectValue
- 需要阵盘品阶匹配
- 每 tick 消耗灵气维持
- 玩家从背包布阵时，阵盘目标必须使用 `itemInstanceId` 定位；背包格子顺序只影响 UI 展示。

## 阵法维护

- 玩家站在阵眼/控制点位时，可以开始“阵法维护”。
- 阵法维护走统一技艺活动队列，使用 `formationJob` 记录运行态。
- 每息注入阵法的灵力为 `floor(sqrt(maxQiOutputPerTick))`，最低 1 点，并消耗同等玩家当前灵力。
- 每息按统一技艺经验公式获得 1 息“阵法”技艺经验。
- 离开阵法控制点位会取消维护；攻击或主动进入修炼会让维护暂停 10 息。

## 阵法效果

- tile_aura_source: 向地块注入灵气
- terrain_stabilizer: 稳定地形，防止破坏
- boundary_barrier: 边界屏障，阻挡进入

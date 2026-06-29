# 装备系统

## 装备槽位

源文件: `packages/shared/src/constants/gameplay/equipment.ts`

```typescript
COMBAT_EQUIP_SLOTS = ['weapon', 'head', 'body', 'legs', 'accessory']
TECHNIQUE_EQUIP_SLOTS = [
  'technique_alchemy',
  'technique_forging',
  'technique_enhancement',
  'technique_mining',
  'technique_building',
]
EQUIP_SLOTS = [...COMBAT_EQUIP_SLOTS, ...TECHNIQUE_EQUIP_SLOTS]
ARTIFACT_SLOTS = ['artifact_1']
// 排序权重:
// weapon=0, head=1, body=2, legs=3, accessory=4
// technique_alchemy=5, technique_forging=6, technique_enhancement=7
// technique_mining=8, technique_building=9
```

战斗装备只占用 `COMBAT_EQUIP_SLOTS`。技艺工具装备占用对应技艺槽，不再占用战斗装备槽：

| 技艺槽 | 用途 | 工具标签 |
|---|---|---|
| technique_alchemy | 炼丹工具 | alchemy_furnace |
| technique_forging | 炼器工具 | forging_tool |
| technique_enhancement | 强化工具 | enhancement_hammer |
| technique_mining | 挖矿工具 | mining_pickaxe |
| technique_building | 营造工具 | building_hammer |

技艺工具的数值属性直接写入物品模板 `craftEffectStats`，在玩家属性结算阶段汇总到 `player.attrs.craftEffectStats`。该投影只供服务端技艺运行时和对应技艺面板预估使用，不并入公开 `numericStats`，也不在属性面板展示。

## 法宝槽位

法宝使用独立槽位，不占用战斗装备或技艺装备槽。当前版本提供 `artifact_1` 一个法宝槽，玩家历史最高境界达到半步金丹（`realmLv = 42`）后解锁。解锁状态绑定历史最高境界 `highestRealmLv`，后续即使转生或当前境界下降也不会关闭。

法宝槽位状态包含：
- `unlocked`：槽位是否解锁
- `enabled`：槽位开关，绑定槽位而非具体法宝
- `qi/maxQi`：法宝当前灵力与最大灵力
- `item`：当前装备的法宝物品

当前内置法宝：

| 法宝 | 等级 | 最大灵力系数 | 效果 |
|---|---:|---:|---|
| 巡天飞剑 | 42 | 1 | 槽位解锁、启用、装备后授予玩家“忽略静态障碍”移动能力；启用后每息固定消耗未强化默认最大灵力的 10%，再受盈能层数放大 |

法宝灵力在玩家 tick 中自动补充：每个已装备且灵力未满的法宝槽位，不论槽位是否启用，每息最多抽取玩家 `maxQiOutputPerTick` 的十分之一注入法宝，并从玩家当前灵力中扣除等额数值；法宝已满或玩家灵力不足时只按实际可注入量扣除。

如果某个已启用法宝槽的当前灵力低于该法宝的固定每息消耗，系统会在 tick 中直接将该槽自动停用，避免继续授予移动能力。

当至少一个法宝槽保持启用时，玩家每息获得 1 层“盈能” Buff；没有法宝槽启用时，每息减少 1 层。盈能每层使法宝固定灵力消耗提高 1%，例如基础每息消耗 100 点时，5 层盈能会使消耗变为 105 点。

客户端表现上，玩家自身存在已解锁、已装备且已启用的法宝槽时，世界地图中的玩家实体会显示明亮天蓝色正方形流转虚线。

法宝可复用强化系统强化。法宝强化不放大特效消耗，只提高最大灵力上限：

```typescript
artifactBaseMaxQi = round(getTechniqueStandardMaxQiBaseline(42) × artifactMaxQiFactor)
artifactMaxQi = round(artifactBaseMaxQi × getEnhancementPercent(enhanceLevel) / 100)
baseSustainCostPerTick = ceil(artifactBaseMaxQi × costMaxQiRatio)
sustainCostPerTick = ceil(baseSustainCostPerTick × (100 + artifactOverchargeStacks) / 100)
```

强化倍率使用装备同一套指数公式：

```typescript
enhancementPercent = ceil(100 × 1.1^enhanceLevel)
```

## 装备基准值计算公式

源文件: `packages/shared/src/value.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| EQUIPMENT_BASELINE_BASE_VALUE | 8 | 0级基础值 |
| EQUIPMENT_BASELINE_VALUE_PER_LEVEL | 0.5 | 每级成长 |
| EQUIPMENT_BASELINE_GRADE_MULTIPLIER | 1.2 | 品阶指数倍率 |

### 公式

```typescript
baselineValue = 8 + level × 0.5
gradeMultiplier = 1.2^gradeIndex
// gradeIndex: mortal=0, yellow=1, mystic=2, earth=3, heaven=4, spirit=5, saint=6, emperor=7
actualValue = round(baselineValue × gradeMultiplier × (percent/100) × pointsPerValue)
```

### 特殊 pointsPerValue 覆盖

- realmExpPerTick: 1
- techniqueExpPerTick: 1

## 数值属性折算表

`NUMERIC_STAT_POINTS_PER_VALUE`:

| 属性 | 每价值点数 |
|------|-----------|
| maxHp | 12 |
| maxQi | 8 |
| physAtk/spellAtk/physDef/spellDef | 1 |
| hit/dodge/crit/antiCrit/critDamage | 1 |
| breakPower/resolvePower | 1 |
| actionsPerTurn | 10 |
| moveSpeed/viewRange/lootRate 等 | 1 |

## 装备品质

品阶按 TECHNIQUE_GRADE_ORDER 索引:
- mortal(凡品), yellow(黄阶), mystic(玄阶), earth(地阶)
- heaven(天阶), spirit(灵阶), saint(圣阶), emperor(帝阶)

## 装备效果类型

源文件: `packages/shared/src/item-runtime-types.ts`

| 效果类型 | 说明 |
|----------|------|
| stat_aura | 常驻数值光环（可带条件） |
| progress_boost | 成长推进效果 |
| periodic_cost | 持续代价（on_tick/on_cultivation_tick） |
| timed_buff | 触发 Buff（支持 trigger/cooldown/chance/conditions） |

### 触发器

on_equip, on_unequip, on_tick, on_move, on_attack, on_hit, on_kill, on_skill_cast, on_cultivation_tick, on_time_segment_changed, on_enter_map

## 强化属性增幅

```typescript
enhancementPercent = ceil(100 × 1.1^enhanceLevel)
// +1 = 110%, +5 ≈ 161%, +10 ≈ 259%
```

## 装备境界有效性

```typescript
EQUIPMENT_REALM_EFFECTIVENESS_PENALTY_PER_LEVEL = 0.05
// 装备境界低于玩家时，每级差减少 5% 有效性
```

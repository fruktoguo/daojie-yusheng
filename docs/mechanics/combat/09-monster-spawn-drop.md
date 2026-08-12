# 怪物刷新与掉落

## 怪物刷新机制

### 基础刷新

- 怪物死亡后设置 `respawnLeft = resolveMonsterRespawnTicks(monster)`
- 每 tick `respawnLeft--`，到 0 时调用 `respawnMonster()`
- 复活位置：出生点附近最近可占用格

### 清场加速机制

```ts
常量：
  MONSTER_RESPAWN_ACCELERATION_BASE_PERCENT = 100
  MONSTER_RESPAWN_ACCELERATION_STEP_PERCENT = 100
  MONSTER_RESPAWN_ACCELERATION_MAX_PERCENT = 1000
```

仅对 mortal_blood 层次（普通怪）生效。

```ts
resolveMonsterRespawnTicksWithBonus(respawnTicks, bonusPercent):
  return max(1, round(respawnTicks × 100 / (100 + bonusPercent)))
```

清场判定：
- 同一刷新点所有怪物全部死亡 → 触发 handleMonsterDefeat
- 在 clearDeadlineTick 之前清完 → bonusPercent += 100（步进）
- 超时清完 → bonusPercent 重置为 0
- 最大加速 1000%（即刷新时间缩短到 1/11）

整组复活后：
- 重设 clearDeadlineTick = tick + 加速后的刷新间隔

### 怪物死亡处理

```
markMonsterDefeated(monster):
  - 从地块占位移除
  - alive = false, hp = 0, qi = 0
  - 设置 respawnLeft
  - 清除攻击冷却、技能冷却、仇恨目标、追击记忆、buff
  - 重算派生状态
  - 触发清场加速判定
```

## 掉落表结构

```ts
interface MonsterTemplateDropRecord {
  itemId: string;
  name: string;
  type: ItemType;
  count: number;
  chance?: number;  // 0~1，默认 1
}
```

## 掉落概率计算

```ts
rollMonsterDrops(monsterId, rolls, lootRateBonus, rareLootRateBonus, context):
  for each drop in dropTable:
    baseChance = drop.chance（0~1）
    totalRateBonus = lootRateBonus + (baseChance ≤ 0.001 ? rareLootRateBonus : 0)
    killEquivalent:
      bonus ≥ 0: 1 + bonus/10000
      bonus < 0: 1 / (1 + |bonus|/10000)
    chance = (1 - (1-baseChance)^killEquivalent) × currencyDropMultiplier
    if random() ≤ chance: 掉落该物品
```

- lootRate/rareLootRate 来自玩家属性 numericStats
- rareLootRate 仅对 baseChance ≤ 0.001 的稀有物品生效
- 同物品多次掉落时 count 累加
- 筑基阶段三名 `demon_king` Boss（焚木妖王、玄壤地龙、五行噬脉兽）各自独立以 `0.001` 基础概率掉落 1 枚「太虚界晶」，用于建造密室。

### 自动货币掉落

服务端启动期会为怪物掉落表自动补充货币掉落：

| 货币 | 普通怪 | 变异怪 | 妖王 | 数量 |
|------|--------|--------|------|------|
| 灵石 | 1% | 3% | 10% | 按品阶和等级估算 |
| 功德 | 0.1% | 0.3% | 1% | 1 |

功德基础概率固定为同层次灵石基础概率的 1/10，并复用 `rollMonsterDrops` 的 lootRate/rareLootRate 概率公式。通天塔等配置了 `suppressSpiritStoneDrop` 的怪物只禁用自动灵石，仍按血脉层次参与功德自动掉落。

### 普通怪越级货币掉落衰减

```ts
ORDINARY_MONSTER_OVERLEVEL_SPIRIT_STONE_DROP_THRESHOLD = 1
ORDINARY_MONSTER_OVERLEVEL_SPIRIT_STONE_DROP_MULTIPLIER = 0.7
```

玩家等级超过怪物 1 级以上时，普通怪自动灵石和自动功德掉率 ×0.7

## 虚境低境界击杀压制

- 仅公开世界虚境中，由实际完成击杀的玩家承受；助攻玩家、现世、宗门、通天塔和密室不触发。
- 击杀怪物时使用奖励结算前的玩家 `realmLv` 与怪物 `level` 计算境界差。差值小于 18 不触发；差 18 级增加 1 层，之后每多差 1 级再增加 1 层，即 `addedStacks = realmGap - 17`。
- 触发后增加运行时 Debuff `virtual_world.heavenly_dao_suppression`（天道压制），每次获得都会把整组层数的剩余时间刷新为 3600 息。
- Buff 随玩家 Buff 分域持久化；死亡、遁返和断线重连均不能清除。

## LootPool 结构

```ts
rollLootPoolItems(query):
  chance: 整体触发概率
  candidates: 候选物品 ID 列表
  rolls: 抽取次数
  countMin/countMax: 每次抽取数量范围
  allowDuplicates: 是否允许重复
  随机从候选中抽取
```

## 地块掉落倍率

```ts
resolveTileDamageDropMultiplier(appliedDamage):
  if damage ≤ 0: return 0
  if damage < 100: return 0.5
  multiplier = 1, threshold = 300
  while damage >= threshold:
    multiplier += 1
    threshold *= 3
  return multiplier
// 即: <100→0.5, 100~299→1, 300~899→2, 900~2699→3, ...
```

## 击杀经验

### 现世击杀增益

- 仅公开世界现世分线生效；虚境、宗门、通天塔、密室等独立实例不触发。
- 怪物击杀基础经验在模板、阵法和贡献分摊口径上额外乘 `1.2`；所有符合现有贡献规则的参战者均使用该倍率。
- 怪物掉落仅对实际击杀者额外增加 `10000` 点 `lootRate`，即 100% 爆率增幅；`rareLootRate` 不额外增加，但稀有掉落同样会叠加通用 `lootRate`。
- 增益只进入怪物击杀经验与怪物掉落链路，不影响修炼、任务、采集、地块、容器、PVP 或其他经验和掉落来源。

### 等级差修正

```ts
MONSTER_KILL_EXP_LEVEL_DELTA_CAP = 10  // 最多按10级差计算
levelDelta = min(10, |monsterLevel - playerLevel|)

if player < monster:  // 越级打怪加成
  bonusRate = { mortal_blood: 0.1, variant: 0.25, demon_king: 0.4 }
  adjustment = (1 + bonusRate)^levelDelta

if player > monster:  // 碾压衰减
  MONSTER_OVERLEVEL_EXP_MULTIPLIER = 0.75
  adjustment = 0.75^levelDelta
```

### 怪物等级分段衰减

```ts
MONSTER_LEVEL_EXP_DECAY_MULTIPLIER_EARLY = 0.98  // 1-18级
MONSTER_LEVEL_EXP_DECAY_MULTIPLIER_MID = 0.95    // 19-30级
MONSTER_LEVEL_EXP_DECAY_MULTIPLIER_LATE = 0.92   // 31+级

getMonsterLevelExpDecayMultiplier(monsterLevel) =
  0.98^(min(level,18)-1) × 0.95^(max(0,min(level,30)-18)) × 0.92^(max(0,level-30))
```

### 血脉层次经验倍率

| 层次 | 倍率 |
|------|------|
| mortal_blood | 1× |
| variant | 5× |
| demon_king | 100× |

当前主修为可自悟 pending 功法时，击杀怪物还会推进领悟进度；该领悟推进不使用上述怪物经验倍率，而固定等同自悟修炼 1 息的进度增量。

## 相关源文件

- `packages/server/src/runtime/instance/map-instance.runtime.ts` — 刷新逻辑
- `packages/server/src/content/registries/drop-table.registry.ts` — 掉落表
- `packages/server/src/runtime/world/combat/tile-drop.helpers.ts` — 地块掉落
- `packages/shared/src/constants/gameplay/monster.ts` — 怪物常量
- `packages/shared/src/monster.ts` — 经验公式

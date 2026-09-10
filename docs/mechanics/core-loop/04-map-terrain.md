# 地图与地形系统

## 地形恢复常量

| 常量 | 值 | 源文件 |
|------|-----|--------|
| TERRAIN_DESTROYED_RESTORE_TICKS | 7200 息（≈2小时） | `packages/shared/src/constants/gameplay/terrain.ts` |
| TERRAIN_RESTORE_RETRY_DELAY_TICKS | 60 息 | 同上 |
| TERRAIN_REGEN_RATE_PER_TICK | 0.01（每息恢复 maxHp 的 1%） | 同上 |
| TERRAIN_REALM_BASE_HP | 100 | 同上 |
| TERRAIN_REALM_HP_GROWTH_RATE | 1.4 | 同上 |

## 地形耐久公式

```typescript
// 地图境界等级对应基础血量
getTerrainRealmBaseHp(realmLv) = 100 × 1.4^(realmLv - 1)

// 所有可破坏地形与结构统一使用地图 mapLv
maxHp = round(getTerrainRealmBaseHp(mapLv) × profile.multiplier)

// 特殊地形恢复速度倍率
SPECIAL_TILE_RESTORE_SPEED_MULTIPLIERS = { cloud: 100 }

// 摧毁后复生时间
calculateTileRestoreTicks(tileType) =
  max(1, ceil(7200 / getTileRestoreSpeedMultiplier(tileType)))
  // cloud: 7200/100 = 72 息

// 复生受阻重试时间
calculateTileRestoreRetryTicks(tileType) =
  max(1, ceil(60 / getTileRestoreSpeedMultiplier(tileType)))
```

## 矿物受击掉落公式

矿物等级统一取矿物所在地图的 `mapLv`。每个矿脉目标按自己的实际伤害和最大生命独立计算，但不再按命中次数提供固定基础掷骰收益。

```text
baseDamage = maxHp × 0.1%
damageRatio = appliedDamage / baseDamage

damageMultiplier = damageRatio <= 1 ? damageRatio : sqrt(damageRatio)

mineralLinearMultiplier =
  1 + (mapLv - 1) × 0.1,      1 <= mapLv <= 10 (每级+10%)
  1.9 + (mapLv - 10) × 0.2,   11 <= mapLv <= 20 (每级+20%)
  3.9 + (mapLv - 20) × 0.3,   21 <= mapLv <= 30 (每级+30%)
  6.9 + (mapLv - 30) × 0.4,   31 <= mapLv <= 40 (每级+40%)
  分段平滑累加...

mineralLevelMultiplier =
  1.1^(mapLv - 1) + mineralLinearMultiplier - 1

realmGapMultiplier =
  0.8^(attackerRealmLv - mapLv), attackerRealmLv > mapLv
  1,                              attackerRealmLv = mapLv
  0.9^(mapLv - attackerRealmLv), attackerRealmLv < mapLv

aoeMultiplier =
  1 / (1 + 0.1 × (miningAoeHitCount - 1))

otherMultiplier =
  (1 + 挖矿等级掉率加成 + 幸运加成)
  × (1 + mining.outputRate)

expectedCount =
  基础掉率 × 基础数量
  × damageMultiplier
  × mineralLevelMultiplier
  × realmGapMultiplier
  × aoeMultiplier
  × otherMultiplier
```

伤害乘区以 `0.1% maxHp` 为 1 倍基准：低于基准时按实际扣除生命值线性缩放，超过 0.1% 基准的伤害增幅开平方根平滑增长（例如一击造成 10% 生命伤害时，增幅由原本的 100 倍平滑为 10 倍）；过量伤害先截断到矿脉当前生命，公式内部再截断到 `maxHp`，单次伤害乘区最高为 `sqrt(1000) ≈ 31.62` 倍。

矿物地图等级乘区由 10% 指数复利与分段线性增幅相加叠加组成（`1.1^(mapLv - 1) + linear - 1`）：1 级为 1 倍；1-10 级每级 +10%（10 级为 1.9 倍线性）；11-20 级每级 +20%（20 级为 3.9 倍线性）；21-30 级每级 +30%；31-40 级每级 +40%，依此类推分段平滑累加，无跨档断层，既保障高阶矿脉收益递增，又平稳可控。

AOE 衰减只作用于矿物受击掉落，`miningAoeHitCount` 表示同一玩家同次攻击命中的矿脉地块数量，不按队伍合并，也不影响妖兽、玩家、建筑、云朵等非矿目标。单矿 `N=1` 时为 `1`；同次命中 5 个矿时单矿为 `1/1.4≈0.714`，总量为单矿的 `5/1.4≈3.57`，并随命中矿数严格递增。

最终期望数量使用最高 10% 的触发率结算：

```text
k = max(1, ceil(expectedCount / 10%))
triggerChance = expectedCount / k
dropCountOnTrigger = 均匀随机整数 [1, 2k - 1]
```

`triggerChance` 始终不超过 10%，触发后的平均数量为 `k`，因此严格保持原始 `expectedCount`。例如 20% 转为 10% 概率掉落 1-3 个；65% 转为约 9.2857% 概率掉落 1-13 个。矿脉摧毁配置中的固定掉落独立结算，不进入该概率换算，也不再次应用 `mining.outputRate`。

## 地块修复流程

源文件: `packages/server/src/runtime/instance/map-instance.runtime.ts`

```
每 tick 遍历 tileDamageByTile:
1. destroyed=true:
   - respawnLeft > 1 → respawnLeft -= 1
   - respawnLeft ≤ 1:
     - 有阻挡实体 → 重置为 calculateTileRestoreRetryTicks
     - 无阻挡 → 删除 damage 记录，恢复原始地块
2. destroyed=false (受损):
   - repairAmount = max(1, floor(maxHp × 0.01))
   - 若处于固脉效果范围内，额外追加同等一份 `max(1, floor(maxHp × 0.01))`
   - nextHp = min(maxHp, hp + repairAmount)
   - nextHp ≥ maxHp → 完全恢复，删除 damage 记录
```

矿脉与其他可破坏地块统一按地图 `mapLv` 计算耐久。矿脉受击后同一次恢复推进仍结算自然回血；固脉覆盖时再额外结算一份 `1% maxHp`。

## 固脉额外回血

- 固脉效果包括固脉阵和宗门核心范围内的先天固脉；两者共享同一套地块回血语义。
- 固脉只给“受损但未摧毁”的地块回血，不直接修复 destroyed=true 的地块。
- 系统地块已有自然恢复 `1%/息`，被固脉覆盖时额外获得 `1%/息`，合计 `2%/息`。
- 玩家建筑地块和技能创建的临时地块默认没有自然回血；被固脉覆盖时获得 `1%/息`。
- 多个固脉来源重叠不叠加回血，固脉阵强度只影响减伤，不影响回血比例。

## 挖矿与地块破坏边界

- 战斗攻击或技能命中地块可以继续造成地块伤害，但不能在同一次伤害中重复结算挖矿 job 的经验和掉落。
- 玩家主动挖矿应建模为技艺 job，记录矿脉/地块目标、实际工作进度、产出和挖矿经验。
- 挖矿 job 必须进入统一技艺任务列表，显示实际工作进度、独立打断等待和取消按钮；攻击、移动、手动开始修炼等等待恢复不能改写挖矿实际工作量。
- 迁移到挖矿 job 前，必须审计现有地块伤害、阵法减伤、掉落和地形恢复链路，避免破坏战斗地块交互。

## 地形类型与地图字符映射

| 地形 | 字符 | 地形 | 字符 |
|------|------|------|------|
| floor | `.` | road | `=` |
| trail | `:` | wall | `#` |
| door | `+` | window | `W` |
| portal | `P` | stairs | `S` |
| stone_stairs | `梯` | grass | `,` |
| hill | `^` | cliff | `崖` |
| mud | `;` | swamp | `%` |
| cold_bog | `寒` | molten_pool | `熔` |
| water | `~` | cloud | `云` |
| cloud_floor | `霞` | void | `空` |
| tree | `T` | bamboo | `竹` |
| stone | `o` | spirit_ore | `L` |
| black_iron_ore | `铁` | broken_sword_heap | `刃` |

源文件: `packages/shared/src/constants/gameplay/terrain.ts`

## 地图实例生命周期

- 模板地图: 地块恢复 enabled=true
- 宗门地图: 地块恢复 enabled=true
- 秘境/副本: 地块恢复 enabled=false
- 实例支持 tickSpeed 加速和 paused 暂停
- 持久化脏域追踪: time, room, fengshui, tileDamage 等
- 空闲超时销毁（通天塔: 3600 息）

## 地图层级（map-layer）

地图使用多层结构:
- 基础地形层（TileType）
- 建筑结构层
- 建筑地板层
- 建筑设施层
- 建筑家具层
- 建筑装饰层
- 实体占位层（occupancy）

已摧毁的结构只在 `tile_damage` 存在时投影为可通行地面。建筑完工接管该格时，服务端必须先把摧毁后的 terrain/surface/structure 落到权威分层，再删除损坏记录并推进静态寻路 revision。否则铺设地板后旧石块结构会重新生效并阻挡通行。

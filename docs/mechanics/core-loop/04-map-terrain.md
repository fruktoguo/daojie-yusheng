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
   - nextHp = min(maxHp, hp + repairAmount)
   - nextHp ≥ maxHp → 完全恢复，删除 damage 记录
```

## 挖矿与地块破坏边界

- 战斗攻击或技能命中地块可以继续造成地块伤害，但不能在同一次伤害中重复结算挖矿 job 的经验和掉落。
- 玩家主动挖矿应建模为技艺 job，记录矿脉/地块目标、实际工作进度、产出和挖矿经验。
- 挖矿 job 必须进入统一技艺任务列表，显示进度、打断等待和取消按钮。
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

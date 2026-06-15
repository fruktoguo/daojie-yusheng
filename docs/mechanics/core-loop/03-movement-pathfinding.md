# 移动与寻路系统

## 核心常量

| 常量 | 值 | 源文件 |
|------|-----|--------|
| MOVE_POINT_UNIT | 100 | `packages/shared/src/constants/gameplay/terrain.ts` |
| BASE_MOVE_POINTS_PER_TICK | 100 | 同上 |
| MAX_STORED_MOVE_POINTS | 100 | 同上 |
| MOVE_SPEED_SOFT_CAP | 500 | 同上 |
| MOVE_SPEED_SOFT_CAP_LOG_GAIN | 300 | 同上 |

## 移动公式

### 有效移速（软上限衰减）

```ts
getEffectiveMoveSpeed(moveSpeed):
  if raw ≤ SOFT_CAP(500): return raw
  if raw > SOFT_CAP: return 500 + 300 × log₂(raw / 500)
```

### 每 tick 移动点数

```ts
getMovePointsPerTick(moveSpeed):
  return max(1, round(100 + max(0, moveSpeed)))
```

> 注：调用方通常先调用 `getEffectiveMoveSpeed(rawMoveSpeed)` 做软上限衰减，再将结果传入此函数。

### 最大可存储移动点数

```ts
getMaxStoredMovePoints(moveSpeed, requiredMovePoints):
  return max(100, getMovePointsPerTick(moveSpeed), requiredMovePoints)
```

### 移动消耗判定

每次移动消耗 = 目标地块的 TILE_TRAVERSAL_COST。当累积移动点数 ≥ 地块代价时可移动一格。

## 地形移动代价

| 地形 | 代价 | 地形 | 代价 |
|------|------|------|------|
| road | 30 | trail | 50 |
| grass | 80 | cloud_floor | 90 |
| veranda | 90 | floor/door/portal/stairs/stone_stairs | 100 |
| hill | 120 | mud | 200 |
| swamp | 300 | cold_bog | 360 |
| wall/window/cliff/water/cloud/void | 400 | tree/bamboo/stone | 400 |
| spirit_ore/black_iron_ore/broken_sword_heap | 400 | house_eave/house_corner/screen_wall | 400 |
| molten_pool | 800 | — | — |

> 代价 400 的地形通常不可行走（被阻挡），仅在特殊情况下可穿越。

## 法宝穿越例外

服务端移动裁定仍以地图边界、动态阻挡、NPC/怪物/玩家占位为硬规则。法宝只允许覆盖静态地形的不可移动判定，不改变全局 `isWalkable`。

当前内置法宝“飞剑”在对应法宝槽已解锁、启用、装备且灵气足够时生效。玩家当息首次尝试移动到不可移动静态地块时，消耗 10% 法宝最大灵气，并按该地块原始 `TILE_TRAVERSAL_COST` 扣除移动点数完成移动；同一 tick 后续继续穿越不可移动地块不重复扣法宝灵气。

## 寻路参数

| 常量 | 值 | 源文件 |
|------|-----|--------|
| PATHFINDING_MIN_STEP_COST | 1 | `packages/shared/src/constants/gameplay/navigation.ts` |
| PATHFINDING_PLAYER_MAX_TARGET_DISTANCE | 96（曼哈顿距离） | 同上 |
| PATHFINDING_PLAYER_MAX_EXPANDED_NODES | 16384 | 同上 |
| PATHFINDING_PLAYER_MAX_PATH_LENGTH | 16384 | 同上 |
| PATHFINDING_REPATH_MAX_EXPANDED_NODES | 16384 | 同上 |
| PATHFINDING_REPATH_MAX_PATH_LENGTH | 16384 | 同上 |
| PATHFINDING_BOT_MAX_EXPANDED_NODES | 512 | 同上 |
| PATHFINDING_BOT_MAX_PATH_LENGTH | 24 | 同上 |
| PATHFINDING_APPROACH_MAX_EXPANDED_NODES | 1024 | 同上 |
| PATHFINDING_APPROACH_MAX_PATH_LENGTH | 32 | 同上 |

## A* 寻路

- 使用 A* 算法，启发函数为曼哈顿距离
- 代价函数 = TILE_TRAVERSAL_COST（地形代价）
- 最小步进代价 = 1（用于启发函数归一化）
- 路径重算：当路径被阻挡时触发 repath，参数与首次寻路相同

## 占位规则

- 使用 `Uint32Array` occupancy 按 cellIndex 存储占位 handle
- `INVALID_OCCUPANCY = 0` 表示空闲
- 移动前检查：`occupancy[nextTileIndex] !== INVALID_OCCUPANCY` → 阻止移动
- 玩家不可重叠，服务端保证占位检测
- 建筑放置也检查占位冲突

## 相关源文件

- `packages/shared/src/constants/gameplay/terrain.ts` — 地形常量
- `packages/shared/src/constants/gameplay/navigation.ts` — 寻路常量
- `packages/shared/src/terrain.ts` — 移动公式
- `packages/server/src/runtime/instance/map-instance.runtime.ts` — 占位管理

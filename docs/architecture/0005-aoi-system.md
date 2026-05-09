# AOI 与视野同步

## 概述

AOI（Area of Interest）系统负责管理玩家视野范围内的实体同步，是 MMO 网络优化的核心机制。只向玩家发送其视野范围内的实体变化，避免全图广播。

## 决策背景

### 问题

- 全图广播导致带宽爆炸
- 玩家数量增加时网络成本呈 O(n²) 增长
- 客户端处理大量无关实体造成性能问题

### 决策

采用基于格子的 AOI 系统，只同步玩家视野范围内的实体。

## 架构

```
┌─────────────────────────────────────────────────────┐
│                    地图实例                          │
│  ┌─────┬─────┬─────┬─────┬─────┐                   │
│  │     │     │  ●  │     │     │  ● = 玩家         │
│  ├─────┼─────┼─────┼─────┼─────┤                   │
│  │     │ AOI │ AOI │ AOI │     │  AOI = 视野范围   │
│  ├─────┼─────┼─────┼─────┼─────┤                   │
│  │     │ AOI │  ●  │ AOI │     │                   │
│  ├─────┼─────┼─────┼─────┼─────┤                   │
│  │     │ AOI │ AOI │ AOI │     │                   │
│  ├─────┼─────┼─────┼─────┼─────┤                   │
│  │     │     │     │     │     │                   │
│  └─────┴─────┴─────┴─────┴─────┘                   │
└─────────────────────────────────────────────────────┘
```

## 核心概念

### 视野半径

```typescript
const AOI_RADIUS = 15; // 格子数

// 视野范围计算（切比雪夫距离）
function isInAOI(viewer: Position, target: Position): boolean {
  const dx = Math.abs(viewer.x - target.x);
  const dy = Math.abs(viewer.y - target.y);
  return Math.max(dx, dy) <= AOI_RADIUS;
}
```

### 实体类型

| 类型 | 说明 | AOI 行为 |
|------|------|----------|
| Player | 玩家 | 进入/离开视野时通知 |
| Monster | 怪物 | 进入/离开视野时通知 |
| NPC | NPC | 静态，首包发送 |
| Item | 掉落物 | 进入/离开视野时通知 |
| Building | 建筑 | 静态，首包发送 |

## 同步事件

### 实体进入视野

```typescript
// 当实体进入玩家视野时
function onEntityEnterAOI(viewer: Player, entity: Entity) {
  // 发送实体完整信息
  sendToPlayer(viewer, {
    type: 'entity_enter',
    entity: serializeEntity(entity),
  });
}
```

### 实体离开视野

```typescript
// 当实体离开玩家视野时
function onEntityLeaveAOI(viewer: Player, entityId: string) {
  // 只发送 ID，客户端移除
  sendToPlayer(viewer, {
    type: 'entity_leave',
    entityId,
  });
}
```

### 实体状态更新

```typescript
// 当视野内实体状态变化时
function onEntityUpdate(entity: Entity) {
  // 获取所有能看到该实体的玩家
  const viewers = getViewersOf(entity);

  // 只发送变化的字段
  for (const viewer of viewers) {
    sendToPlayer(viewer, {
      type: 'entity_update',
      entityId: entity.id,
      patch: getEntityPatch(entity),
    });
  }
}
```

## 玩家移动时的 AOI 更新

```
玩家从 A 移动到 B
  │
  ├─▶ 计算离开视野的实体
  │     - 在 A 视野内但不在 B 视野内
  │     - 发送 entity_leave
  │
  ├─▶ 计算进入视野的实体
  │     - 在 B 视野内但不在 A 视野内
  │     - 发送 entity_enter
  │
  └─▶ 通知其他玩家
        - 对于能看到移动的玩家
        - 发送位置更新
```

## 优化策略

### 1. 九宫格索引

将地图划分为大格子，快速查找附近实体：

```typescript
const GRID_SIZE = 16; // 每个大格子 16x16

class SpatialIndex {
  private grids: Map<string, Set<Entity>> = new Map();

  getGridKey(x: number, y: number): string {
    const gx = Math.floor(x / GRID_SIZE);
    const gy = Math.floor(y / GRID_SIZE);
    return `${gx},${gy}`;
  }

  getNearbyEntities(x: number, y: number): Entity[] {
    const entities: Entity[] = [];
    // 检查周围 9 个格子
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = this.getGridKey(x + dx * GRID_SIZE, y + dy * GRID_SIZE);
        const grid = this.grids.get(key);
        if (grid) {
          entities.push(...grid);
        }
      }
    }
    return entities;
  }
}
```

### 2. 增量同步

只发送变化的字段，不发送完整实体：

```typescript
// 位置更新只发送坐标
{
  type: 'entity_move',
  entityId: 'xxx',
  x: 10,
  y: 20,
}

// HP 更新只发送 HP
{
  type: 'entity_hp',
  entityId: 'xxx',
  hp: 80,
  maxHp: 100,
}
```

### 3. 批量发送

将同一 tick 内的多个更新合并发送：

```typescript
// 收集一个 tick 内的所有更新
const updates: EntityUpdate[] = [];

// tick 结束时批量发送
function flushUpdates(viewer: Player) {
  if (updates.length > 0) {
    sendToPlayer(viewer, {
      type: 'entity_batch_update',
      updates,
    });
    updates.length = 0;
  }
}
```

## 特殊情况

### 传送

玩家传送时需要完整重建视野：

```typescript
function onPlayerTeleport(player: Player, newPos: Position) {
  // 1. 清除旧视野
  sendToPlayer(player, { type: 'clear_entities' });

  // 2. 发送新视野内所有实体
  const entities = getEntitiesInAOI(newPos);
  sendToPlayer(player, {
    type: 'entity_batch_enter',
    entities: entities.map(serializeEntity),
  });
}
```

### 断线重连

重连时需要同步当前视野：

```typescript
function onPlayerReconnect(player: Player) {
  // 发送当前视野内所有实体
  const entities = getEntitiesInAOI(player.position);
  sendToPlayer(player, {
    type: 'entity_batch_enter',
    entities: entities.map(serializeEntity),
  });
}
```

## 监控指标

| 指标 | 正常范围 | 告警阈值 |
|------|----------|----------|
| AOI 更新延迟 | < 50ms | > 200ms |
| 单玩家视野实体数 | < 100 | > 500 |
| AOI 广播包大小 | < 1KB | > 10KB |

## 相关文档

- [网络同步分层](0003-network-sync-layers.md)
- [Tick 调度模型](0002-tick-model.md)
- [地图实例](0006-map-instance.md)

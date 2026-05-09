# 地图实例化

## 概述

地图实例化系统支持同一地图模板创建多个独立运行的实例，用于副本、分线、个人空间等场景。

## 决策背景

### 问题

- 单一地图无法支撑大量玩家
- 副本需要独立的怪物和状态
- 个人空间需要隔离

### 决策

采用模板-实例分离架构，地图模板定义静态结构，实例维护运行时状态。

## 架构

```
┌─────────────────────────────────────────────────────┐
│                  MapTemplate                         │
│  (地图模板：地形、NPC、刷怪点等静态配置)              │
└─────────────────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Instance A  │  │ Instance B  │  │ Instance C  │
│ (主线实例)   │  │ (副本实例)   │  │ (个人空间)   │
└─────────────┘  └─────────────┘  └─────────────┘
```

## 核心概念

### 地图模板（MapTemplate）

静态配置，定义地图的基础结构：

```typescript
interface MapTemplate {
  templateId: string;
  name: string;
  width: number;
  height: number;
  tiles: TileData[][];      // 地形数据
  npcs: NpcConfig[];        // NPC 配置
  spawners: SpawnerConfig[]; // 刷怪点配置
  portals: PortalConfig[];  // 传送点配置
}
```

### 地图实例（MapInstance）

运行时状态，每个实例独立：

```typescript
interface MapInstance {
  instanceId: string;
  templateId: string;
  players: Map<string, Player>;
  monsters: Map<string, Monster>;
  items: Map<string, DroppedItem>;
  buildings: Map<string, Building>;
  tickState: InstanceTickState;
}
```

## 实例类型

| 类型 | 说明 | 生命周期 |
|------|------|----------|
| persistent | 持久实例（主城、野外） | 服务器生命周期 |
| dungeon | 副本实例 | 副本结束后销毁 |
| personal | 个人空间 | 玩家下线后保留 |
| temporary | 临时实例 | 无人后自动销毁 |

## 实例生命周期

### 创建实例

```
请求创建实例
  │
  ├─▶ 加载地图模板
  │     - 从配置文件读取
  │     - 验证模板完整性
  │
  ├─▶ 初始化实例状态
  │     - 创建实例 ID
  │     - 初始化空容器
  │
  ├─▶ 生成初始实体
  │     - 根据刷怪点生成怪物
  │     - 初始化资源点
  │
  └─▶ 注册到实例目录
        - 加入 tick 调度
        - 可被玩家进入
```

### 销毁实例

```
触发销毁条件
  │
  ├─▶ 检查销毁条件
  │     - 无玩家在线
  │     - 超时未使用
  │     - 副本完成
  │
  ├─▶ 保存实例状态（如需要）
  │     - 持久化建筑状态
  │     - 保存资源点状态
  │
  ├─▶ 清理运行时
  │     - 移除所有实体
  │     - 释放内存
  │
  └─▶ 从目录注销
        - 移出 tick 调度
        - 标记为已销毁
```

## 玩家进入实例

```typescript
async function enterInstance(player: Player, instanceId: string) {
  // 1. 验证实例存在
  const instance = instanceCatalog.get(instanceId);
  if (!instance) throw new Error('Instance not found');

  // 2. 验证进入条件
  if (!canEnter(player, instance)) {
    throw new Error('Cannot enter instance');
  }

  // 3. 离开当前实例
  if (player.currentInstance) {
    await leaveInstance(player);
  }

  // 4. 进入新实例
  instance.players.set(player.id, player);
  player.currentInstance = instance;

  // 5. 发送首包
  sendInstanceData(player, instance);

  // 6. 通知其他玩家
  broadcastPlayerEnter(instance, player);
}
```

## 实例 Tick

每个实例独立 tick：

```typescript
class MapInstance {
  tick() {
    // 1. 处理玩家输入
    this.processPlayerInputs();

    // 2. 更新怪物 AI
    this.updateMonsters();

    // 3. 处理战斗
    this.processCombat();

    // 4. 更新刷怪
    this.updateSpawners();

    // 5. 清理过期实体
    this.cleanupExpired();

    // 6. 广播状态变化
    this.broadcastChanges();
  }
}
```

## 实例目录

```typescript
class InstanceCatalogService {
  private instances: Map<string, MapInstance> = new Map();

  // 获取实例
  get(instanceId: string): MapInstance | undefined;

  // 创建实例
  create(templateId: string, type: InstanceType): MapInstance;

  // 销毁实例
  destroy(instanceId: string): void;

  // 获取模板的所有实例
  getByTemplate(templateId: string): MapInstance[];

  // 获取可进入的实例（分线）
  getAvailableInstance(templateId: string): MapInstance;
}
```

## 分线机制

当单个实例玩家过多时，自动创建新分线：

```typescript
const MAX_PLAYERS_PER_INSTANCE = 200;

function getOrCreateInstance(templateId: string): MapInstance {
  // 查找有空位的实例
  const instances = instanceCatalog.getByTemplate(templateId);
  for (const instance of instances) {
    if (instance.players.size < MAX_PLAYERS_PER_INSTANCE) {
      return instance;
    }
  }

  // 创建新分线
  return instanceCatalog.create(templateId, 'persistent');
}
```

## 副本系统

### 创建副本

```typescript
async function createDungeon(
  player: Player,
  dungeonTemplateId: string
): Promise<MapInstance> {
  // 1. 验证进入条件
  const template = getDungeonTemplate(dungeonTemplateId);
  if (!canEnterDungeon(player, template)) {
    throw new Error('Cannot enter dungeon');
  }

  // 2. 创建副本实例
  const instance = instanceCatalog.create(
    template.mapTemplateId,
    'dungeon'
  );

  // 3. 设置副本参数
  instance.dungeonState = {
    ownerId: player.id,
    startTime: Date.now(),
    timeLimit: template.timeLimit,
    objectives: template.objectives,
  };

  // 4. 玩家进入
  await enterInstance(player, instance.instanceId);

  return instance;
}
```

### 副本结束

```typescript
function onDungeonComplete(instance: MapInstance) {
  // 1. 发放奖励
  for (const player of instance.players.values()) {
    grantDungeonRewards(player, instance.dungeonState);
  }

  // 2. 传送玩家出副本
  for (const player of instance.players.values()) {
    teleportToSafeZone(player);
  }

  // 3. 销毁副本
  instanceCatalog.destroy(instance.instanceId);
}
```

## 监控指标

| 指标 | 正常范围 | 告警阈值 |
|------|----------|----------|
| 活跃实例数 | < 100 | > 500 |
| 单实例玩家数 | < 200 | > 300 |
| 实例创建延迟 | < 100ms | > 500ms |
| 实例 tick 延迟 | < 50ms | > 200ms |

## 相关文档

- [Tick 调度模型](0002-tick-model.md)
- [AOI 与视野同步](0005-aoi-system.md)
- [持久化分层策略](0004-persistence-layers.md)

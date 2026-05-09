# 地图配置指南

## 概述

地图是游戏世界的基础单元，定义了地形、怪物刷新点、NPC、传送点等内容。

## 配置文件位置

- 服务端: `packages/server/data/maps/{地图名}.json`
- 组合地图: `packages/server/data/maps/compose/{地图名}/`
- 共享类型: `packages/shared/src/map-document.ts`

## 地图类型

| 类型 | 说明 | 示例 |
|------|------|------|
| 野外地图 | 开放区域，怪物刷新 | `bamboo_forest.json` |
| 副本地图 | 实例化区域 | `sky_ruins_core_well.json` |
| 城镇地图 | 安全区，NPC 聚集 | `qizhen_crossing.json` |
| 组合地图 | 由多个子地图组成 | `compose/qizhen_crossing/` |

## 基础字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 地图唯一标识 |
| `name` | string | 是 | 地图显示名称 |
| `width` | number | 是 | 地图宽度（格子数） |
| `height` | number | 是 | 地图高度（格子数） |
| `defaultSpawn` | object | 是 | 默认出生点 `{x, y}` |
| `terrain` | array | 是 | 地形数据 |
| `auraLevel` | number | 否 | 灵气浓度等级 |

## 地形配置

### 地形类型

| 类型 | 字符 | 说明 |
|------|------|------|
| `floor` | `.` | 可通行地面 |
| `wall` | `#` | 不可通行墙壁 |
| `water` | `~` | 水域 |
| `grass` | `,` | 草地 |
| `tree` | `T` | 树木 |
| `rock` | `o` | 岩石 |

### 地形数据格式

```json
{
  "terrain": [
    "##########",
    "#........#",
    "#..T..T..#",
    "#........#",
    "##########"
  ]
}
```

或使用对象格式：

```json
{
  "terrain": [
    { "x": 0, "y": 0, "type": "wall" },
    { "x": 1, "y": 0, "type": "floor" }
  ]
}
```

## 实体配置

### 怪物刷新点

```json
{
  "monsters": [
    {
      "monsterId": "m_bamboo_mantis",
      "spawnPoints": [
        { "x": 10, "y": 15 },
        { "x": 20, "y": 25 }
      ]
    }
  ]
}
```

### NPC 配置

```json
{
  "npcs": [
    {
      "npcId": "npc_blacksmith",
      "name": "铁匠王老五",
      "position": { "x": 5, "y": 8 },
      "services": ["forge", "repair"]
    }
  ]
}
```

### 传送点

```json
{
  "portals": [
    {
      "id": "portal_to_town",
      "position": { "x": 0, "y": 10 },
      "targetMap": "qizhen_crossing",
      "targetPosition": { "x": 50, "y": 30 }
    }
  ]
}
```

### 资源节点

```json
{
  "resourceNodes": [
    {
      "nodeId": "herb_lingzhi",
      "position": { "x": 15, "y": 20 },
      "respawnSec": 300
    }
  ]
}
```

## 地图属性

### 灵气配置

```json
{
  "auraLevel": 3,
  "auraModifiers": [
    {
      "region": { "x1": 10, "y1": 10, "x2": 20, "y2": 20 },
      "bonus": 1.5
    }
  ]
}
```

### 环境效果

```json
{
  "environment": {
    "weather": "rain",
    "visibility": 0.8,
    "movementModifier": 0.9
  }
}
```

## 完整示例

```json
{
  "id": "bamboo_forest",
  "name": "青竹林",
  "width": 50,
  "height": 50,
  "defaultSpawn": { "x": 25, "y": 45 },
  "auraLevel": 2,
  "terrain": [
    "##################################################",
    "#................................................#",
    "#..T..T..T..T..T..T..T..T..T..T..T..T..T..T..T..#",
    "#................................................#"
  ],
  "monsters": [
    {
      "monsterId": "m_bamboo_mantis",
      "spawnPoints": [
        { "x": 10, "y": 15 },
        { "x": 30, "y": 20 }
      ]
    }
  ],
  "portals": [
    {
      "id": "exit_south",
      "position": { "x": 25, "y": 49 },
      "targetMap": "qizhen_crossing",
      "targetPosition": { "x": 10, "y": 5 }
    }
  ]
}
```

## 组合地图

大型地图可拆分为多个子地图：

```
compose/qizhen_crossing/
├── main.json           # 主地图配置
├── house_01.json       # 子地图：房屋1
├── house_02.json       # 子地图：房屋2
└── market.json         # 子地图：市场
```

主地图引用子地图：

```json
{
  "id": "qizhen_crossing",
  "name": "岐真渡",
  "composites": [
    { "ref": "house_01", "offset": { "x": 10, "y": 20 } },
    { "ref": "house_02", "offset": { "x": 30, "y": 20 } }
  ]
}
```

## 添加步骤

1. 设计地图布局和尺寸
2. 创建地图 JSON 文件
3. 配置地形数据
4. 添加怪物刷新点、NPC、传送点
5. 配置灵气等级和环境效果
6. 在怪物配置中添加对应地图的怪物
7. 运行验证

## 验证方式

```bash
# 构建服务端
pnpm build:server

# 启动并检查地图加载
pnpm --filter @mud/server start:dev

# 使用 GM 工具查看地图
# 在客户端使用 GM 面板的地图查看器
```

## 常见问题

### Q: 地图加载失败？

检查：
- JSON 格式是否正确
- `id` 是否唯一
- `terrain` 尺寸是否与 `width`/`height` 匹配

### Q: 怪物不刷新？

检查：
- `monsters` 配置是否正确
- `monsterId` 是否存在于怪物配置中
- `spawnPoints` 坐标是否在可通行区域

### Q: 传送点不工作？

检查：
- `targetMap` 是否存在
- `targetPosition` 是否在目标地图的可通行区域

## 相关内容

- [怪物配置指南](monsters.md)
- [地图实例持久化](../plans/地图实例持久化分域收口计划.md)

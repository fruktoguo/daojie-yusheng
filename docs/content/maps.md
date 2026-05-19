# 地图配置

配置位置：
- 单体地图：`packages/server/data/maps/{地图名}.json`
- 组合地图：`packages/server/data/maps/compose/{地图名}/`
- 类型定义：`packages/shared/src/map-document.ts`

## 地图类型

| 类型 | 说明 | 示例 |
|------|------|------|
| 野外地图 | 开放区域，怪物刷新 | `bamboo_forest.json` |
| 副本地图 | 实例化区域 | `sky_ruins_core_well.json` |
| 城镇地图 | 安全区，NPC 聚集 | `qizhen_crossing.json` |
| 组合地图 | 多个子地图组成 | `compose/qizhen_crossing/` |

## 基础字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 地图唯一标识 |
| `name` | string | 显示名称 |
| `width` / `height` | number | 地图尺寸（格子数） |
| `defaultSpawn` | `{x, y}` | 默认出生点 |
| `terrain` | array | 地形数据（字符串数组或对象数组） |
| `auraLevel` | number | 灵气浓度等级（可选） |

## 地形字符

| 字符 | 类型 | 可通行 |
|------|------|--------|
| `.` | 地面 | 是 |
| `#` | 墙壁 | 否 |
| `~` | 水域 | 否 |
| `,` | 草地 | 是 |
| `T` | 树木 | 否 |
| `o` | 岩石 | 否 |

## 实体配置

### 怪物刷新点

```json
"monsters": [
  { "monsterId": "m_bamboo_mantis", "spawnPoints": [{ "x": 10, "y": 15 }] }
]
```

### 传送点

```json
"portals": [
  { "id": "exit_south", "position": { "x": 25, "y": 49 },
    "targetMap": "qizhen_crossing", "targetPosition": { "x": 10, "y": 5 } }
]
```

### 资源节点

```json
"resourceNodes": [
  { "nodeId": "herb_lingzhi", "position": { "x": 15, "y": 20 }, "respawnSec": 300 }
]
```

## 组合地图

大型地图可拆分为多个子地图：

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

## 灵气配置

```json
{
  "auraLevel": 3,
  "auraModifiers": [
    { "region": { "x1": 10, "y1": 10, "x2": 20, "y2": 20 }, "bonus": 1.5 }
  ]
}
```

## 常见问题

- **地图加载失败**：检查 JSON 格式、`id` 唯一性、`terrain` 尺寸与 `width`/`height` 匹配
- **怪物不刷新**：检查 `monsterId` 是否存在于怪物配置，`spawnPoints` 是否在可通行区域
- **传送点不工作**：检查 `targetMap` 是否存在，`targetPosition` 是否可通行

## 相关

- [怪物配置](monsters.md)
- [NPC 配置](npcs.md)

# 炼器配置指南

## 概述

炼器系统允许玩家制作装备和工具。配置文件位于 `packages/server/data/content/forging/recipes.json`。

## 配方结构

```json
{
  "recipeId": "forging.copper_enhancement_hammer",
  "outputItemId": "equip.copper_enhancement_hammer",
  "outputCount": 1,
  "level": 1,
  "grade": "yellow",
  "category": "special",
  "baseBrewTicks": 10,
  "ingredients": [
    { "itemId": "black_iron_chunk", "count": 10, "role": "main" }
  ]
}
```

## 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| recipeId | string | 是 | 配方唯一 ID，格式 `forging.{名称}` |
| outputItemId | string | 是 | 产出装备 ID |
| outputCount | number | 是 | 产出数量（通常为 1） |
| level | number | 是 | 配方等级，影响解锁条件 |
| grade | string | 是 | 品质等级 |
| category | string | 是 | 装备类别 |
| baseBrewTicks | number | 是 | 基础炼制时间 |
| ingredients | array | 是 | 材料列表 |

## 品质等级

| 等级 | 说明 | 颜色 |
|------|------|------|
| yellow | 凡品 | 黄色 |
| blue | 良品 | 蓝色 |
| purple | 上品 | 紫色 |
| orange | 极品 | 橙色 |
| red | 仙品 | 红色 |

## 装备类别

| 类别 | 说明 |
|------|------|
| weapon | 武器 |
| armor | 防具 |
| accessory | 饰品 |
| special | 特殊工具（丹炉、锻造锤等） |

## 添加新配方

### 1. 定义产出装备

在 `items/` 目录下添加装备定义：

```json
{
  "itemId": "equip.iron_sword",
  "name": "铁剑",
  "type": "equipment",
  "subType": "weapon",
  "slot": "weapon",
  "grade": "yellow",
  "stats": {
    "atk": 15,
    "critRate": 0.05
  }
}
```

### 2. 添加炼器配方

```json
{
  "recipeId": "forging.iron_sword",
  "outputItemId": "equip.iron_sword",
  "outputCount": 1,
  "level": 1,
  "grade": "yellow",
  "category": "weapon",
  "baseBrewTicks": 15,
  "ingredients": [
    { "itemId": "iron_ingot", "count": 5, "role": "main" },
    { "itemId": "wood_handle", "count": 1, "role": "aux" }
  ]
}
```

### 3. 验证

```bash
pnpm --filter @mud/server smoke:craft
```

## 现有配方

| 配方 | 产出 | 等级 | 品质 | 类别 |
|------|------|------|------|------|
| forging.copper_enhancement_hammer | 铜强化锤 | 1 | 凡品 | 特殊 |
| forging.copper_pill_furnace | 铜丹炉 | 1 | 凡品 | 特殊 |
| forging.copper_forging_tool | 铜炼器炉 | 1 | 凡品 | 特殊 |
| forging.copper_building_hammer | 铜建造锤 | 1 | 凡品 | 特殊 |
| forging.copper_array_plate | 铜阵盘 | 1 | 凡品 | 特殊 |

## 特殊工具说明

| 工具 | 用途 |
|------|------|
| 强化锤 | 装备强化，提升装备属性 |
| 丹炉 | 炼丹，减少炼丹时间 |
| 炼器炉 | 炼器，减少炼器时间 |
| 建造锤 | 建筑建造，用于房间系统 |
| 阵盘 | 阵法布置，用于风水系统 |

## 设计建议

1. **材料梯度**：低级配方用常见材料，高级配方需要稀有材料
2. **时间成本**：装备炼制时间应比丹药长
3. **品质递进**：同类装备应有多个品质版本
4. **工具前置**：高级炼器需要对应品质的炼器炉

## 相关文档

- [物品配置](items.md)
- [炼丹配置](alchemy.md)

# 炼器配置

配方文件：`packages/server/data/content/forging/recipes.json`

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

## 关键字段

| 字段 | 说明 |
|------|------|
| recipeId | 格式 `forging.{名称}`，全局唯一 |
| outputItemId | 产出装备 ID |
| level | 配方等级，影响解锁条件 |
| grade | 品质：yellow(凡) / blue(良) / purple(上) / orange(极) / red(仙) |
| category | 类别：weapon / armor / accessory / special |
| baseBrewTicks | 基础炼制时间 |

## 特殊工具

| 工具 | 用途 |
|------|------|
| 强化锤 | 装备强化，提升属性 |
| 丹炉 | 炼丹，减少炼丹时间 |
| 炼器炉 | 炼器，减少炼器时间 |
| 建造锤 | 建筑建造，用于房间系统 |
| 阵盘 | 阵法布置，用于风水系统 |

## 添加新配方

1. 在 `items/` 中定义产出装备
2. 在 `forging/recipes.json` 中添加配方
3. 验证：`pnpm --filter @mud/server smoke:craft`

## 设计要点

- 低级配方用常见材料，高级配方需稀有材料
- 装备炼制时间应比丹药长
- 同类装备应有多个品质版本
- 高级炼器需要对应品质的炼器炉

## 现有配方

| 配方 | 产出 | 等级 | 品质 | 类别 |
|------|------|------|------|------|
| forging.copper_enhancement_hammer | 铜强化锤 | 1 | 凡品 | 特殊 |
| forging.copper_pill_furnace | 铜丹炉 | 1 | 凡品 | 特殊 |
| forging.copper_forging_tool | 铜炼器炉 | 1 | 凡品 | 特殊 |
| forging.copper_building_hammer | 铜建造锤 | 1 | 凡品 | 特殊 |
| forging.copper_array_plate | 铜阵盘 | 1 | 凡品 | 特殊 |

## 相关

- [物品配置](items.md)
- [炼丹配置](alchemy.md)

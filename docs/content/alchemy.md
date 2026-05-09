# 炼丹配置指南

## 概述

炼丹系统允许玩家消耗材料制作丹药。配置文件位于 `packages/server/data/content/alchemy/recipes.json`。

## 配方结构

```json
{
  "recipeId": "alchemy.pill.minor_heal",
  "outputItemId": "pill.minor_heal",
  "outputCount": 1,
  "baseBrewTicks": 12,
  "ingredients": [
    { "itemId": "mat.moondew_grass", "count": 2, "role": "main" },
    { "itemId": "mat.beast_bone", "count": 1, "role": "aux" },
    { "itemId": "rat_tail", "count": 1, "role": "aux" }
  ]
}
```

## 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| recipeId | string | 是 | 配方唯一 ID，格式 `alchemy.{类型}.{名称}` |
| outputItemId | string | 是 | 产出物品 ID，必须在 items 中存在 |
| outputCount | number | 是 | 单次产出数量 |
| baseBrewTicks | number | 是 | 基础炼制时间（tick 数，1 tick = 1 秒） |
| ingredients | array | 是 | 材料列表 |

## 材料配置

```json
{
  "itemId": "mat.moondew_grass",
  "count": 2,
  "role": "main"
}
```

| 字段 | 说明 |
|------|------|
| itemId | 材料物品 ID |
| count | 所需数量 |
| role | 材料角色：`main`（主药）或 `aux`（辅药） |

### 材料角色

- **main**：主药，决定丹药核心效果
- **aux**：辅药，影响成功率和品质

## 炼制时间计算

实际炼制时间受以下因素影响：

1. **基础时间**：`baseBrewTicks`
2. **丹炉加成**：装备的丹炉可减少炼制时间
3. **炼丹技能**：玩家炼丹熟练度影响效率

```
实际时间 = baseBrewTicks × 丹炉系数 × 技能系数
```

## 添加新配方

### 1. 确保产出物品存在

在 `items/` 目录下添加丹药物品定义：

```json
{
  "itemId": "pill.new_pill",
  "name": "新丹药",
  "type": "consumable",
  "subType": "pill",
  "desc": "丹药效果描述",
  "effects": [
    { "type": "heal", "value": 100 }
  ]
}
```

### 2. 添加配方

在 `alchemy/recipes.json` 数组中添加：

```json
{
  "recipeId": "alchemy.pill.new_pill",
  "outputItemId": "pill.new_pill",
  "outputCount": 1,
  "baseBrewTicks": 15,
  "ingredients": [
    { "itemId": "mat.herb_a", "count": 2, "role": "main" },
    { "itemId": "mat.herb_b", "count": 1, "role": "aux" }
  ]
}
```

### 3. 验证

```bash
pnpm --filter @mud/server smoke:craft
```

## 现有配方示例

| 配方 | 产出 | 主药 | 炼制时间 |
|------|------|------|----------|
| alchemy.pill.minor_heal | 回春散 | 月露草×2 | 12 tick |
| alchemy.minor_qi_pill | 小还灵丹 | 月露草×2 + 青灵茎×1 | 16 tick |
| alchemy.pill.crimson_bud_elixir | 赤蕾丹 | 血蕾果×2 + 赤焰叶×1 | 20 tick |
| alchemy.major_qi_pill | 大还灵丹 | 青灵茎×1 + 清心花×1 | 22 tick |

## 设计建议

1. **材料获取**：确保主药材料有稳定获取途径（采集、掉落、商店）
2. **时间平衡**：高级丹药炼制时间应更长，但不宜超过 60 tick
3. **产出价值**：丹药效果应略高于材料直接使用的总和
4. **配方解锁**：考虑通过任务或境界解锁高级配方

## 相关文档

- [物品配置](items.md)
- [技能配置](skills.md)

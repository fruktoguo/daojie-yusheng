# 炼丹配置

配方文件：`packages/server/data/content/alchemy/recipes.json`

## 配方结构

```json
{
  "recipeId": "alchemy.pill.minor_heal",
  "outputItemId": "pill.minor_heal",
  "outputCount": 1,
  "baseBrewTicks": 12,
  "ingredients": [
    { "itemId": "mat.moondew_grass", "count": 2, "role": "main" },
    { "itemId": "mat.beast_bone", "count": 1, "role": "aux" }
  ]
}
```

## 关键字段

| 字段 | 说明 |
|------|------|
| recipeId | 格式 `alchemy.{类型}.{名称}`，全局唯一 |
| outputItemId | 产出物品 ID，必须在 items 中存在 |
| baseBrewTicks | 基础炼制时间（1 tick = 1 秒） |
| ingredients[].role | `main`（主药，决定核心效果）或 `aux`（辅药，影响成功率和品质） |

## 炼制时间

```
实际时间 = baseBrewTicks × 丹炉系数 × 技能系数
```

丹炉加成来自装备的丹炉工具，技能系数来自玩家炼丹熟练度。

## 添加新配方

1. 确保产出物品已在 `items/` 中定义（type: `consumable`, subType: `pill`）
2. 在 `alchemy/recipes.json` 数组中添加配方
3. 验证：`pnpm --filter @mud/server smoke:craft`

## 设计要点

- 主药材料需有稳定获取途径（采集、掉落、商店）
- 炼制时间不宜超过 60 tick
- 丹药效果应略高于材料直接使用的总和
- 高级配方可通过任务或境界解锁

## 现有配方

| 配方 | 产出 | 主药 | 时间 |
|------|------|------|------|
| alchemy.pill.minor_heal | 回春散 | 月露草×2 | 12 tick |
| alchemy.minor_qi_pill | 小还灵丹 | 月露草×2 + 青灵茎×1 | 16 tick |
| alchemy.pill.crimson_bud_elixir | 赤蕾丹 | 血蕾果×2 + 赤焰叶×1 | 20 tick |
| alchemy.major_qi_pill | 大还灵丹 | 青灵茎×1 + 清心花×1 | 22 tick |

## 相关

- [物品配置](items.md)
- [技能配置](skills.md)

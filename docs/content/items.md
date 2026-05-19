# 物品配置

配置位置：`packages/server/data/content/items/{境界}/{类型}.json`  
类型定义：`packages/shared/src/item-runtime-types.ts`

## 目录结构

```
items/
├── 凡人期/
│   ├── 装备.json
│   ├── 消耗品.json
│   ├── 材料.json
│   └── 书籍.json
├── 练气期/
└── ...
```

## 通用字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `itemId` | string | 唯一标识。装备 `equip.xxx`，材料 `mat.xxx` |
| `name` | string | 显示名称 |
| `type` | string | `equipment` / `consumable` / `material` / `book` |
| `grade` | string | 品阶：white / yellow / blue / purple / orange |
| `level` | number | 等级要求 |

## 装备特有字段

| 字段 | 说明 |
|------|------|
| `equipSlot` | 槽位：head / body / legs / weapon / accessory |
| `equipBaselinePercents` | 基准属性百分比，100 为该等级该槽位基准值 |
| `effects` | 特效列表（条件触发的属性加成等） |

## 装备示例

```json
{
  "itemId": "equip.gate_headcloth",
  "name": "门丁裹头巾",
  "type": "equipment",
  "grade": "yellow",
  "level": 2,
  "desc": "值夜门丁常用的厚布头巾",
  "equipSlot": "head",
  "effects": [
    {
      "effectId": "night-watch",
      "type": "stat_aura",
      "conditions": {
        "mode": "all",
        "items": [{ "type": "time_segment", "in": ["dusk", "night", "late_night"] }]
      },
      "valueStats": { "hit": 2 }
    }
  ],
  "equipBaselinePercents": { "resolvePower": 110, "hpRegenRate": 70 }
}
```

## 消耗品特有字段

| 字段 | 说明 |
|------|------|
| `useEffect` | 使用效果（必填） |
| `cooldown` | 冷却时间（秒） |
| `stackLimit` | 堆叠上限 |

## 材料特有字段

| 字段 | 说明 |
|------|------|
| `stackLimit` | 堆叠上限，默认 99 |
| `category` | 分类：herb / ore / monster / misc |

## 常见问题

- **装备属性不生效**：检查 `equipSlot` 和 `equipBaselinePercents` 字段名拼写
- **特效不触发**：检查 `conditions` 条件是否满足，`effectId` 是否唯一

## 相关

- [怪物配置](monsters.md) — 掉落配置
- [炼丹配置](alchemy.md) — 材料用途
- [炼器配置](forging.md) — 装备锻造

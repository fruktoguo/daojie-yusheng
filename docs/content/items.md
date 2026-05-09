# 物品配置指南

## 概述

物品包括装备、消耗品、材料、书籍等，是玩家背包和交易系统的核心内容。

## 配置文件位置

- 服务端: `packages/server/data/content/items/{境界}/{类型}.json`
- 共享类型: `packages/shared/src/item-runtime-types.ts`

## 目录结构

```
items/
├── 凡人期/
│   ├── 装备.json
│   ├── 消耗品.json
│   ├── 材料.json
│   └── 书籍.json
├── 练气期/
│   └── ...
└── 更高境界/
    └── ...
```

## 通用字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `itemId` | string | 是 | 唯一标识，装备建议 `equip.xxx`，材料建议 `mat.xxx` |
| `name` | string | 是 | 显示名称 |
| `type` | string | 是 | 类型：`equipment` / `consumable` / `material` / `book` |
| `desc` | string | 是 | 物品描述 |
| `grade` | string | 是 | 品阶：`white` / `yellow` / `blue` / `purple` / `orange` |
| `level` | number | 是 | 等级要求 |

## 装备字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `equipSlot` | string | 是 | 装备槽位 |
| `equipBaselinePercents` | object | 否 | 基准属性百分比 |
| `equipSpecialStats` | object | 否 | 特殊属性 |
| `effects` | array | 否 | 特效列表 |

### 装备槽位

- `head`: 头部
- `body`: 身体
- `legs`: 腿部
- `weapon`: 武器
- `accessory`: 饰品

### 基准属性

```json
{
  "equipBaselinePercents": {
    "physAtk": 100,
    "physDef": 80,
    "resolvePower": 110,
    "hpRegenRate": 70
  }
}
```

数值为百分比，100 为该等级该槽位的基准值。

## 消耗品字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `useEffect` | object | 是 | 使用效果 |
| `cooldown` | number | 否 | 冷却时间（秒） |
| `stackLimit` | number | 否 | 堆叠上限 |

## 材料字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `stackLimit` | number | 否 | 堆叠上限，默认 99 |
| `category` | string | 否 | 材料分类：`herb` / `ore` / `monster` / `misc` |

## 装备示例

```json
{
  "itemId": "equip.gate_headcloth",
  "name": "门丁裹头巾",
  "type": "equipment",
  "grade": "yellow",
  "level": 2,
  "desc": "值夜门丁常用的厚布头巾，夜里守门的人比白日看得更细。",
  "equipSlot": "head",
  "effects": [
    {
      "effectId": "night-watch",
      "type": "stat_aura",
      "conditions": {
        "mode": "all",
        "items": [
          {
            "type": "time_segment",
            "in": ["dusk", "first_night", "night", "late_night", "before_dawn", "deep_night"]
          }
        ]
      },
      "valueStats": {
        "hit": 2
      }
    }
  ],
  "equipBaselinePercents": {
    "resolvePower": 110,
    "hpRegenRate": 70
  }
}
```

## 材料示例

```json
{
  "itemId": "mat.rat_tail",
  "name": "鼠尾",
  "type": "material",
  "grade": "white",
  "level": 1,
  "desc": "灰尾鼠的尾巴，可用于炼制低阶丹药。",
  "category": "monster",
  "stackLimit": 99
}
```

## 添加步骤

1. 确定物品类型和所属境界
2. 在对应目录的 JSON 文件中添加配置
3. 如果是装备，确保 `equipSlot` 正确
4. 如果有特效，配置 `effects` 数组
5. 运行验证

## 验证方式

```bash
# 构建服务端
pnpm build:server

# 检查物品加载
pnpm --filter @mud/server start:dev
```

## 常见问题

### Q: 装备属性不生效？

检查：
- `equipSlot` 是否正确
- `equipBaselinePercents` 字段名是否正确
- 玩家等级是否满足 `level` 要求

### Q: 特效不触发？

检查：
- `effects` 数组格式是否正确
- `conditions` 条件是否满足
- `effectId` 是否唯一

## 相关内容

- [怪物配置指南](monsters.md) — 掉落配置
- [炼丹设计](../design/systems/炼丹设计.md) — 材料用途
- [炼器设计](../design/systems/炼器设计.md) — 装备锻造

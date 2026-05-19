# NPC 配置

NPC 定义嵌入在地图 JSON 文件的 `npcs` 数组中：`packages/server/data/maps/{地图名}.json`

## 结构示例

```json
{
  "id": "npc_shen_qiniang",
  "name": "沈七娘",
  "x": 30, "y": 45,
  "char": "沈",
  "color": "#c9b38a",
  "dialogue": "能走到这儿的人，至少还有口气。",
  "role": "innkeeper",
  "shopItems": [
    { "itemId": "pill.minor_heal", "price": 50, "stock": 10 }
  ],
  "quests": ["q_intro_south_gate_rollcall"]
}
```

## 基础字段

| 字段 | 说明 |
|------|------|
| id | 格式 `npc_{名称}`，全局唯一 |
| name | 显示名称 |
| x, y | 地图坐标 |
| char | 地图显示字符（单字） |
| color | 字符颜色（十六进制） |
| dialogue | 默认对话文本 |

## 角色类型

| role | 说明 | 功能 |
|------|------|------|
| guide | 引导者 | 新手引导 |
| innkeeper | 店主 | 住宿、基础商店 |
| merchant | 商人 | 物品买卖 |
| blacksmith | 铁匠 | 修理、强化 |
| alchemist | 炼丹师 | 丹药商店 |
| elder | 长老 | 主线剧情 |
| guard | 守卫 | 区域守护 |
| villager | 村民 | 支线任务 |
| mysterious | 神秘人 | 隐藏任务 |

## 商店配置

```json
"shopItems": [
  { "itemId": "pill.minor_heal", "price": 50, "stock": 10, "refreshInterval": 3600 }
]
```

| 字段 | 说明 |
|------|------|
| itemId | 商品物品 ID |
| price | 售价（灵石） |
| stock | 库存数量，-1 表示无限 |
| refreshInterval | 库存刷新间隔（秒），可选 |

## 添加 NPC 注意事项

- 坐标必须在可行走区域
- 避免与其他实体重叠
- `quests` 中引用的任务 ID 必须已配置

## 条件对话（规划中）

```json
"dialogues": [
  { "condition": { "questCompleted": "q_intro_manual" }, "text": "你已经学会了基础功法。" },
  { "condition": null, "text": "先去学一门功法护身吧。" }
]
```

## 相关

- [地图配置](maps.md)
- [任务配置](quests.md)
- [物品配置](items.md)

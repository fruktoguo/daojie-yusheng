# NPC 配置指南

## 概述

NPC 是游戏世界的重要组成部分，负责任务发放、商店、对话等功能。NPC 配置嵌入在地图配置文件中。

## 配置位置

NPC 定义在地图 JSON 文件的 `npcs` 数组中：

```
packages/server/data/maps/{地图名}.json
```

## NPC 结构

```json
{
  "id": "npc_shen_qiniang",
  "name": "沈七娘",
  "x": 30,
  "y": 45,
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

## 字段说明

### 基础信息

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | NPC 唯一 ID，格式 `npc_{名称}` |
| name | string | 是 | NPC 显示名称 |
| x | number | 是 | 地图 X 坐标 |
| y | number | 是 | 地图 Y 坐标 |
| char | string | 是 | 地图上显示的字符（单字） |
| color | string | 是 | 字符颜色（十六进制） |

### 交互配置

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| dialogue | string | 是 | 默认对话文本 |
| role | string | 否 | NPC 角色类型 |
| shopItems | array | 否 | 商店物品列表 |
| quests | array | 否 | 可接取的任务 ID 列表 |

### NPC 角色类型

| 角色 | 说明 | 功能 |
|------|------|------|
| guide | 引导者 | 新手引导、教程 |
| innkeeper | 店主 | 住宿、基础商店 |
| merchant | 商人 | 物品买卖 |
| blacksmith | 铁匠 | 装备修理、强化 |
| alchemist | 炼丹师 | 丹药商店、炼丹指导 |
| elder | 长老 | 主线剧情、重要任务 |
| guard | 守卫 | 区域守护、信息提供 |
| villager | 村民 | 支线任务、世界观补充 |
| mysterious | 神秘人 | 隐藏任务、特殊剧情 |

## 商店配置

```json
"shopItems": [
  {
    "itemId": "pill.minor_heal",
    "price": 50,
    "stock": 10,
    "refreshInterval": 3600
  },
  {
    "itemId": "mat.moondew_grass",
    "price": 20,
    "stock": -1
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| itemId | string | 商品物品 ID |
| price | number | 售价（灵石） |
| stock | number | 库存数量，-1 表示无限 |
| refreshInterval | number | 库存刷新间隔（秒），可选 |

## 添加新 NPC

### 1. 选择地图

确定 NPC 所在地图，打开对应的地图配置文件。

### 2. 添加 NPC 配置

在 `npcs` 数组中添加：

```json
{
  "id": "npc_herb_vendor",
  "name": "药材贩子",
  "x": 35,
  "y": 42,
  "char": "药",
  "color": "#7cb342",
  "dialogue": "新鲜的药材，便宜卖了！",
  "role": "merchant",
  "shopItems": [
    { "itemId": "mat.moondew_grass", "price": 15, "stock": 20 },
    { "itemId": "mat.beast_bone", "price": 25, "stock": 10 }
  ],
  "quests": []
}
```

### 3. 确保位置可达

- 检查坐标是否在可行走区域
- 避免与其他实体重叠
- 考虑玩家交互便利性

### 4. 验证

```bash
pnpm build:server
```

## 现有 NPC 示例

### 云来镇

| ID | 名称 | 角色 | 功能 |
|----|------|------|------|
| npc_shen_qiniang | 沈七娘 | innkeeper | 脚店老板，序章任务 |
| npc_zhao_laoliu | 赵老六 | guide | 引导者，序章任务 |
| npc_ma_huitou | 马会头 | guard | 南门守卫 |
| npc_qingxuan | 清玄执事 | elder | 功法指导，主线任务 |
| npc_old_gate_guard | 老关卒 | guard | 北关守卫，序章起点 |

### 其他地图

| 地图 | NPC | 角色 |
|------|-----|------|
| ancient_ruins | npc_ruin_scholar_spirit | 遗迹学者之灵 |
| ancient_ruins | npc_rune_keeper | 符文守护者 |
| wildlands | npc_hunter_luo | 猎人 |
| wildlands | npc_wild_recluse | 荒野隐士 |
| spirit_ridge | npc_ridge_sage | 灵脊贤者 |
| beast_valley | npc_wounded_patrol | 受伤巡逻兵 |

## 对话系统

### 简单对话

单条对话文本：

```json
"dialogue": "欢迎来到云来镇。"
```

### 条件对话（规划中）

```json
"dialogues": [
  {
    "condition": { "questCompleted": "q_intro_manual" },
    "text": "你已经学会了基础功法，继续努力。"
  },
  {
    "condition": null,
    "text": "先去学一门功法护身吧。"
  }
]
```

## 设计建议

1. **位置合理**：NPC 应放在玩家容易找到的位置
2. **角色明确**：通过名称和外观暗示 NPC 功能
3. **对话风格**：对话应符合 NPC 身份和世界观
4. **商品定价**：价格应与物品获取难度匹配
5. **任务关联**：重要 NPC 应有任务或剧情关联

## 相关文档

- [地图配置](maps.md)
- [任务配置](quests.md)
- [物品配置](items.md)

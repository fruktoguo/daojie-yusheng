# 任务配置指南

## 概述

任务系统是游戏剧情和引导的核心。配置文件位于 `packages/server/data/content/quests/` 目录，按章节组织。

## 目录结构

```
quests/
├── 序章_主线.json
├── 序章_支线.json
├── 第一章_主线.json
├── 第一章_支线.json
├── 第二章_主线.json
├── 第二章_支线.json
...
└── 终章_主线.json
```

## 任务结构

```json
{
  "id": "q_intro_south_gate_rollcall",
  "title": "先进镇里",
  "line": "main",
  "chapter": "序章·断道入镇",
  "story": "任务背景故事...",
  "desc": "任务简短描述",
  "objectiveType": "talk",
  "objectiveText": "去沈记脚店见沈七娘",
  "targetNpcId": "npc_shen_qiniang",
  "targetNpcName": "沈七娘",
  "targetMapId": "yunlai_town",
  "targetName": "沈七娘",
  "required": 1,
  "reward": [
    { "itemId": "pill.minor_heal", "name": "回春散", "type": "consumable", "count": 2 }
  ],
  "nextQuestId": "q_intro_old_road_witness",
  "giverMapId": "yunlai_town",
  "giverNpcId": "npc_old_gate_guard",
  "submitMapId": "yunlai_town",
  "submitNpcId": "npc_shen_qiniang"
}
```

## 字段说明

### 基础信息

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 任务唯一 ID，格式 `q_{章节}_{名称}` |
| title | string | 是 | 任务标题，显示在任务列表 |
| line | string | 是 | 任务线：`main`（主线）或 `side`（支线） |
| chapter | string | 是 | 所属章节名称 |
| story | string | 是 | 任务背景故事，详细叙述 |
| desc | string | 是 | 任务简短描述，显示在任务追踪 |

### 目标配置

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| objectiveType | string | 是 | 目标类型（见下表） |
| objectiveText | string | 是 | 目标描述文本 |
| required | number | 是 | 完成所需数量 |
| targetNpcId | string | 条件 | 目标 NPC ID（talk 类型必填） |
| targetNpcName | string | 条件 | 目标 NPC 名称 |
| targetMapId | string | 条件 | 目标地图 ID |
| targetMonsterId | string | 条件 | 目标怪物 ID（kill 类型必填） |
| targetItemId | string | 条件 | 目标物品 ID（collect 类型必填） |
| targetTechniqueId | string | 条件 | 目标功法 ID（learn_technique 类型必填） |

### 目标类型

| 类型 | 说明 | 必需字段 |
|------|------|----------|
| talk | 与 NPC 对话 | targetNpcId, targetMapId |
| kill | 击杀怪物 | targetMonsterId, required |
| collect | 收集物品 | targetItemId, required |
| reach | 到达地点 | targetMapId |
| learn_technique | 学习功法 | targetTechniqueId |
| craft | 制作物品 | targetItemId, required |
| explore | 探索区域 | targetMapId |

### NPC 关联

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| giverMapId | string | 是 | 任务发放者所在地图 |
| giverNpcId | string | 是 | 任务发放者 NPC ID |
| submitMapId | string | 是 | 任务提交地点地图 |
| submitNpcId | string | 是 | 任务提交 NPC ID |

### 奖励配置

```json
"reward": [
  { "itemId": "pill.minor_heal", "name": "回春散", "type": "consumable", "count": 2 },
  { "itemId": "equip.iron_sword", "name": "铁剑", "type": "equipment", "count": 1 }
]
```

| 字段 | 说明 |
|------|------|
| itemId | 奖励物品 ID |
| name | 物品名称（用于显示） |
| type | 物品类型 |
| count | 奖励数量 |

### 任务链

| 字段 | 类型 | 说明 |
|------|------|------|
| nextQuestId | string | 完成后自动接取的下一个任务 |
| prerequisiteQuestId | string | 前置任务 ID（可选） |

## 添加新任务

### 1. 确定章节和任务线

选择合适的文件：
- 主线任务：`第X章_主线.json`
- 支线任务：`第X章_支线.json`

### 2. 编写任务配置

```json
{
  "id": "q_ch1_herb_gathering",
  "title": "采药初试",
  "line": "side",
  "chapter": "第一章·云来初境",
  "story": "清玄执事说镇外的青萝谷有不少药草，让你去采些月露草回来，也算是熟悉一下周边环境。",
  "desc": "去青萝谷采集 5 株月露草",
  "objectiveType": "collect",
  "objectiveText": "采集月露草",
  "targetItemId": "mat.moondew_grass",
  "targetName": "月露草",
  "required": 5,
  "reward": [
    { "itemId": "minor_qi_pill", "name": "小还灵丹", "type": "consumable", "count": 3 }
  ],
  "giverMapId": "yunlai_town",
  "giverNpcId": "npc_qingxuan",
  "submitMapId": "yunlai_town",
  "submitNpcId": "npc_qingxuan"
}
```

### 3. 确保关联实体存在

- NPC 已在地图配置中定义
- 目标物品/怪物/功法已配置
- 奖励物品已配置

### 4. 验证

```bash
pnpm build:server
```

## 章节规划

| 章节 | 主题 | 主线任务数 | 支线任务数 |
|------|------|------------|------------|
| 序章 | 断道入镇 | 5-8 | 3-5 |
| 第一章 | 云来初境 | 8-12 | 5-8 |
| 第二章 | 青竹探秘 | 8-12 | 5-8 |
| 第三章 | 灵脊历险 | 8-12 | 5-8 |
| 第四章 | 深渊试炼 | 8-12 | 5-8 |
| 第五章 | 天穹之战 | 8-12 | 5-8 |
| 终章 | 道劫余生 | 5-8 | 3-5 |

## 设计建议

1. **故事连贯**：主线任务应有清晰的剧情推进
2. **难度递进**：任务难度随章节逐步提升
3. **奖励平衡**：奖励应与任务难度匹配
4. **引导功能**：早期任务应引导玩家熟悉系统
5. **支线丰富**：支线任务可探索世界观细节

## 相关文档

- [NPC 配置](npcs.md)
- [地图配置](maps.md)
- [物品配置](items.md)

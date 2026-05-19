# 任务配置

配置位置：`packages/server/data/content/quests/`，按章节组织（如 `序章_主线.json`、`第一章_支线.json`）。

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
  "targetMapId": "yunlai_town",
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

## 目标类型

| objectiveType | 说明 | 必需字段 |
|---------------|------|----------|
| talk | 与 NPC 对话 | targetNpcId, targetMapId |
| kill | 击杀怪物 | targetMonsterId, required |
| collect | 收集物品 | targetItemId, required |
| reach | 到达地点 | targetMapId |
| learn_technique | 学习功法 | targetTechniqueId |
| craft | 制作物品 | targetItemId, required |
| explore | 探索区域 | targetMapId |

## NPC 关联

| 字段 | 说明 |
|------|------|
| giverMapId / giverNpcId | 任务发放者 |
| submitMapId / submitNpcId | 任务提交地点 |

## 任务链

- `nextQuestId`：完成后自动接取的下一个任务
- `prerequisiteQuestId`：前置任务（可选）

## 添加新任务

1. 选择对应章节文件（主线/支线）
2. 编写任务配置，确保所有关联实体（NPC、物品、怪物）已存在
3. 验证：`pnpm build:server`

## 章节规划

| 章节 | 主题 | 主线 | 支线 |
|------|------|------|------|
| 序章 | 断道入镇 | 5-8 | 3-5 |
| 第一章 | 云来初境 | 8-12 | 5-8 |
| 第二章 | 青竹探秘 | 8-12 | 5-8 |
| 第三章 | 灵脊历险 | 8-12 | 5-8 |
| 第四章 | 深渊试炼 | 8-12 | 5-8 |
| 第五章 | 天穹之战 | 8-12 | 5-8 |
| 终章 | 道劫余生 | 5-8 | 3-5 |

## 设计要点

- 主线任务保持剧情连贯
- 早期任务引导玩家熟悉系统
- 奖励与任务难度匹配
- 支线任务可探索世界观细节

## 相关

- [NPC 配置](npcs.md)
- [地图配置](maps.md)
- [物品配置](items.md)

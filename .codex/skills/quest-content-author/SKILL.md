---
name: quest-content-author
description: Use this skill when creating or updating quest content in this repo, including chapter quest JSON, main or side lines, quest chains, rewards, NPC or monster targets, and map-linked progression data.
---

# 任务内容编写

这个 skill 用于直接编写正式任务配置。

适用场景：

- 新增主线或支线任务
- 调整章节任务链
- 修正任务奖励、目标 NPC、目标怪物、目标地图
- 补齐 `nextQuestId`、提交流程、章节文本

## 真源位置

任务正式真源：

- `packages/server/data/content/quests/*.json`

常用参考：

- `docs/story/README.md`
- 同章节相邻任务文件

## 强制流程

1. 先定位目标章节文件与任务线。
2. 至少阅读前后相邻任务，确认命名、章节、奖励密度、叙事口吻一致。
3. 再写或修改任务条目，不要先拍脑袋发明字段。
4. 改完后检查所有引用：
   - `nextQuestId`
   - `giverNpcId` / `submitNpcId`
   - `targetNpcId` / `targetMonsterId`
   - `targetMapId`
   - `requiredItemId`
   - `reward[].itemId`
5. 最后执行 `pnpm build`。

## 硬规则

- 不要在任务文件里发明新协议字段；先复用现有结构。
- 玩家可见文本优先写人话，不写技术术语。
- 任务链变更必须同时看前置和后续任务，避免断链。
- 奖励引用必须来自现有物品真源；如果奖励本身不存在，先补物品真源再回填任务。

## 交付时必须说明

- 改了哪条任务线、哪几个 quest id
- 是否变更了任务链顺序或奖励
- 是否完成 id 引用检查
- 是否执行了 `pnpm build`

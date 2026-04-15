---
name: monster-content-author
description: Use this skill when creating, expanding, or rebalancing monster content in this repo, including monster JSON, stats, drops, equipment, spawn parameters, and map-specific monster packs. Covers source-of-truth monster files and their linked item/drop consistency.
---

# 怪物内容编写

这个 skill 用于直接写正式怪物配置，不是只写策划脑图。

适用场景：

- 新增地图怪物
- 重做某张地图的怪物组
- 调整怪物数值、装备、技能、掉落
- 修正怪物与物品、功法书、编辑器目录的联动

## 真源位置

怪物正式真源：

- `legacy/server/data/content/monsters/*.json`

常用参考：

- `docs/story/练气/练气期地图怪物草案.md`
- `legacy/server/data/content/items/`
- `packages/config-editor/src/main.ts`

## 写怪前必须先做

1. 先定位目标地图文件。
2. 至少阅读同地图、同 tier、同品阶的相邻怪物。
3. 先确认这次改动是设计稿落地、数值平衡、还是掉落联动修正。
4. 如果牵涉装备掉落、丹药来源、功法书掉落，后续必须转到 `content-pipeline` 跑同步脚本。

## 硬规则

- 不要手改客户端生成目录来伪造怪物数据联动。
- 装备 `itemId`、掉落 `itemId`、技能 id 必须引用现有真源。
- `count`、`maxAlive`、`radius`、`aggroRange`、`viewRange`、`respawnSec` 都是玩法参数，不要拿来临时凑表现。
- 优先保持同地图怪物的命名、颜色、tier、掉落密度、数值节奏一致。
- 没有明确需求时，不顺手改整张地图所有怪。

## 推荐流程

1. 先找目标怪物和同组样例。
2. 再改基础字段：`id`、`name`、`grade`、`tier`、`level`、刷新参数。
3. 再改 `attrs` 与 `statPercents`。
4. 再改 `equipment`、`skills`、`drops`。
5. 如果涉及来源联动，调用 `content-pipeline`。
6. 最后执行 `pnpm build`。

## 交付时必须说明

- 改的是哪张地图、哪几只怪
- 是否涉及掉落/装备/功法书联动
- 是否补跑了内容同步脚本
- 是否执行了 `pnpm build`

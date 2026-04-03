---
name: item-content-author
description: Use this skill when creating, expanding, or rebalancing item content in this repo, including equipment, consumables, materials, books, map unlock items, item JSON tuning, effects/buffs, and reward/drop/source-linked item content.
---

# 物品内容编写

这个 skill 用于直接编写正式物品真源，不是只写物品脑图。

适用场景：

- 新增装备、消耗品、材料、书籍、地图解锁道具
- 调整物品数值、描述、品阶、等级、效果、部位
- 修正任务奖励、怪物掉落、功法书来源、地图图纸等物品引用
- 补齐同境界、同地图、同主题的一组物品内容

## 真源位置

物品正式真源：

- `packages/server/data/content/items/凡人期/*.json`
- `packages/server/data/content/items/练气期/*.json`
- `packages/server/data/content/items/更高境界/*.json`

常用参考：

- 同境界、同类型相邻物品文件
- `packages/shared/src/types.ts`
- `docs/物品来源审计.md`

## 强制流程

1. 先定位目标境界与目标类型文件。
2. 至少阅读 2 个同境界、同类型、同 level 段的相邻样例。
3. 先确认这次改动属于新增内容、数值平衡、来源联动，还是奖励修正。
4. 再写或修改物品条目，优先复用现有字段结构，不要先发明新字段。
5. 如果涉及怪物掉落、任务奖励、功法书、客户端/编辑器可见来源联动，转到 `content-pipeline` 跑最小必要同步脚本。
6. 最后执行 `pnpm build`。

## 硬规则

- 不要手改任何生成物来伪造物品联动。
- `itemId` 必须唯一，并保持同域命名风格一致，例如 `equip.`、`pill.`、`map.`。
- 物品描述是玩家可见文案，不要写设计注释或实现术语。
- 装备、丹药、材料、书籍优先保持同阶段的数值节奏一致，不要单件跳档。
- 新增效果、buff、特殊字段前，先检查相邻现有物品是否已有同类写法。
- 奖励、掉落、商店、任务引用必须指向现有真源；如果物品不存在，先补物品真源再回填引用。
- 地图解锁类物品的 `mapUnlockId` 必须引用现有地图 id。

## 交付时必须说明

- 改了哪些物品文件、哪些 `itemId`
- 是否涉及奖励/掉落/来源联动
- 是否补跑了 `content-pipeline`
- 是否执行了 `pnpm build`

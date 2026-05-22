# 任务系统

## 共享常量

源文件: `packages/shared/src/constants/gameplay/quest.ts`

```typescript
QUEST_LINE_KEYS = ['main', 'side', 'daily', 'encounter']
QUEST_STATUS_KEYS = ['available', 'active', 'ready', 'completed']
QUEST_OBJECTIVE_TYPE_KEYS = ['kill', 'talk', 'submit_item', 'learn_technique', 'realm_progress', 'realm_stage']
QUEST_CROSS_MAP_NAV_COOLDOWN_TICKS = 1
```

## 任务状态机

```
available → active → ready → completed
                ↑         |
                └─────────┘ (条件不满足时回退)
```

### 状态转换规则

- `available → active`: 玩家接取任务
- `active → ready`: `progress >= required` 且提交物品满足
- `ready → active`: 条件不再满足时回退（如物品被消耗）
- `ready → completed`: 玩家向 NPC 提交

## 进度计算（resolveQuestProgress）

源文件: `packages/server/src/runtime/world/world-runtime-quest-state.service.ts`

| objectiveType | 进度计算方式 |
|---------------|-------------|
| kill | 击杀目标怪物时 +1，上限 = required |
| talk | 与目标 NPC 对话时直接设为 required |
| submit_item | `min(required, 背包中目标物品数量)` |
| learn_technique | 已学会目标功法 → required，否则 0 |
| realm_stage | 境界 ≥ 目标境界 → required |
| realm_progress | 境界 > 目标境界（严格大于）→ required |

## 完成条件

```typescript
canQuestBecomeReady = progress >= required
  && (!requiredItemId || inventoryCount(requiredItemId) >= requiredItemCount)
```

## 任务链

- 每个任务可有 `nextQuestId`，完成后自动接取下一个
- NPC 任务列表按顺序解锁: 前一个未完成则后续不可见

## 奖励发放

```
1. 扣除提交物品: consumeInventoryItemByItemId(requiredItemId, requiredItemCount)
2. 发放背包奖励: receiveInventoryItem(playerId, reward)
3. 发放灵石奖励: creditWallet(playerId, 'spirit_stone', count)
```

- `spirit_stone` 被识别为钱包类奖励，不占背包格

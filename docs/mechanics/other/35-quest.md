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
| realm_stage | 境界等级 `realmLv` ≥ `targetRealmLv` → required |
| realm_progress | 境界等级 `realmLv` > `targetRealmLv`（严格大于）→ required |

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
1. 在玩家资产串行区内预演扣除提交物品
2. 把普通奖励与灵石奖励统一合入下一版背包快照
3. durable 路径把背包真源、钱包投影与任务状态放入同一事务提交
4. 提交成功后用背包快照刷新运行态，钱包展示由背包中的灵石派生
```

- `spirit_stone` 是背包货币真源：已有同签名灵石堆时直接合并；没有灵石堆时会占用一个背包格，背包不足则任务不能提交。
- 任务提交物品本身若为灵石，钱包投影同样按扣除后的背包数量更新，不能只对奖励做增量累加。
- 普通奖励、灵石、提交物品和任务完成态必须同成同败；数据库提交失败时不提前修改运行态。

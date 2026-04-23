# main 主线落盘剩余旧链路与 fallback 清单

## 1. 文档定位

本文档记录 `mud-mmo-next` 当前 **还没有完全切净** 的旧落盘链路、兼容层与条件式 fallback。

它回答的是：

- 当前项目是否已经 100% 只使用新的商业级落盘体系
- 还剩哪些真实旧链路没有退役
- 哪些路径只是“durable 成功后的运行态回填”，哪些是真正需要继续清理的 fallback

它不回答的是：

- 最终终局架构应该怎么设计
- 全量数据分表方案
- 计划执行进度本身是否完成

进度与计划口径仍以 [计划/商业级数据落盘改造计划.md](./计划/商业级数据落盘改造计划.md) 为准。

## 2. 当前结论

当前仓库已经是：

- **新商业级落盘体系成为主路径**
- **旧快照与少量 fallback 仍未完全删除**

所以准确口径不是“已经完全只用新的商业级落盘”，而是：

> 主恢复链、主资产事务链已经大面积切到新体系，但仓库里仍保留旧 `server_player_snapshot` 兼容层，以及少量条件式 fallback 资产入口。

## 3. 剩余旧链路与 fallback

### 3.1 `server_player_snapshot` 仍然存在

`server_player_snapshot` 当前已经不是恢复主链，但仍然保留为：

- checkpoint
- backup
- 兼容层
- GM / flush / 审计 / 恢复证明链的辅助材料

主要代码位置：

- [packages/server/src/persistence/player-persistence.service.ts](/home/yuohira/mud-mmo-next/packages/server/src/persistence/player-persistence.service.ts:7)
- [packages/server/src/persistence/player-persistence-flush.service.ts](/home/yuohira/mud-mmo-next/packages/server/src/persistence/player-persistence-flush.service.ts:232)
- [packages/server/src/network/world-player-snapshot.service.ts](/home/yuohira/mud-mmo-next/packages/server/src/network/world-player-snapshot.service.ts:154)
- [packages/server/src/http/native/native-gm-player.service.ts](/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-player.service.ts:332)

说明：

- 当前恢复主链已优先走 `player domain projection`
- 但旧快照表并未删除，也仍有真实写入
- 因此“完全摆脱旧整档 JSON 快照”这件事尚未完成

### 3.2 兑换码奖励仍有 direct fallback

兑换码非钱包奖励主线已经能走 `grantInventoryItems`，但当 durable 条件不满足时，仍会直接写运行态背包。

主要位置：

- [packages/server/src/runtime/redeem/redeem-code-runtime.service.ts](/home/yuohira/mud-mmo-next/packages/server/src/runtime/redeem/redeem-code-runtime.service.ts:533)
- [packages/server/src/runtime/redeem/redeem-code-runtime.service.ts](/home/yuohira/mud-mmo-next/packages/server/src/runtime/redeem/redeem-code-runtime.service.ts:536)

同时，钱包奖励当前仍直接走：

- [packages/server/src/runtime/redeem/redeem-code-runtime.service.ts](/home/yuohira/mud-mmo-next/packages/server/src/runtime/redeem/redeem-code-runtime.service.ts:338)

说明：

- 这属于真实 fallback，不是单纯 durable 成功后的运行态回填

### 3.3 战斗掉落与 PvP 奖励仍有 direct fallback

怪物掉落直入背包、PvP 血精奖励已经接入 `grantInventoryItems` 主链，但当前仍保留 durable 条件不满足时的运行态直写。

主要位置：

- 怪物掉落：
  [packages/server/src/runtime/world/world-runtime-player-combat.service.ts](/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-player-combat.service.ts:204)
- PvP 奖励：
  [packages/server/src/runtime/world/world-runtime-player-combat.service.ts](/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-player-combat.service.ts:293)

说明：

- 当前主路径已是 durable
- 但 fallback 还在，因此不能说该类路径已经 100% 纯新体系

### 3.4 NPC 任务提交奖励仍有 direct fallback

`submitNpcQuestRewards` 已有 durable 组合事务，但 `canUseDurableQuestSubmit(...)` 不成立时，仍会走旧的运行态直写奖励链。

主要位置：

- durable 分支入口：
  [packages/server/src/runtime/world/world-runtime-npc-quest-write.service.ts](/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-npc-quest-write.service.ts:139)
- 直接发背包奖励：
  [packages/server/src/runtime/world/world-runtime-npc-quest-write.service.ts](/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-npc-quest-write.service.ts:161)
- 直接发钱包奖励：
  [packages/server/src/runtime/world/world-runtime-npc-quest-write.service.ts](/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-npc-quest-write.service.ts:164)

说明：

- 这是当前仍需继续清理的真实旧分支

### 3.5 GM 钱包路由仍保留 direct runtime 路径

GM 钱包路由并不是无条件强制走新的 durable 事务链，当前仍保留直接 runtime 写法。

主要位置：

- [packages/server/src/runtime/world/world-runtime.controller.ts](/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime.controller.ts:589)

说明：

- 这类管理口径通常优先保证可用性，但从“完全切净旧链路”的角度看，它仍是一个残留点

## 4. 需要区分的两类“直接运行态写法”

仓库里仍能搜到不少：

- `receiveInventoryItem(...)`
- `creditWallet(...)`

但它们不能一概当成“旧落盘没切完”。

需要区分：

### 4.1 可以接受的情况

- durable 事务已经成功提交
- 随后只是把运行态内存对象回填到已提交结果

这类属于正常的“提交后回写运行态”。

### 4.2 需要继续清理的情况

- durable 条件不满足时
- 直接把资产结果写进运行态
- 然后绕开新的事务主链

这类才是本文档重点列出的 fallback。

## 5. 建议后续清理顺序

如果继续往“完全切净旧链路”推进，建议优先顺序如下：

1. 兑换码奖励 fallback
2. NPC 任务提交奖励 fallback
3. 战斗掉落 / PvP 奖励 fallback
4. GM 钱包 direct runtime 路径
5. 最后再评估 `server_player_snapshot` 的进一步弱化或退役

原因：

- 前四项都属于真实业务资产入口
- `server_player_snapshot` 则已经降级成兼容层，删除风险更高，通常应该放在更后面

## 6. 一句话结论

当前项目已经不是“旧 JSON 存档主导”的状态，但也还没有到“旧快照删除、所有资产入口零 fallback、100% 纯新商业级落盘”的终局。

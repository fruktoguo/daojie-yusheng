# NPC 与商店

## 核心常量

源文件: `packages/server/src/runtime/world/world-runtime-npc-shop.service.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| NPC_SHOP_CURRENCY_ITEM_ID | spirit_stone | 商店货币（灵石） |

## 定价规则

- 商品价格由 NPC 模板中 `shopItems[].price` 静态定义
- 总价公式: `totalCost = quantity × shopItem.price`
- 无动态定价、无刷新机制（商品列表固定）

## 购买校验流程

```
1. 玩家必须在 NPC 邻近范围内（getAdjacentNpc）
2. NPC 必须有商店（npc.hasShop === true）
3. 商品必须存在于 NPC 的 shopItems 列表
4. totalCost 必须为安全整数且 > 0
5. 背包空间检查: canReceiveInventoryItem(playerId, itemId)
6. 余额检查: canAffordWallet(playerId, 'spirit_stone', totalCost)
```

## 购买执行流程

```
1. 扣除灵石: debitWallet(playerId, 'spirit_stone', totalCost)
2. 发放物品: receiveInventoryItem(playerId, item)
3. 刷新任务状态: refreshQuestStates(playerId)
4. 支持 Durable Operation 强事务路径
```

## NPC 邻近判定

- 通过 `instance.getAdjacentNpc(playerId, npcId)` 判定
- 不在范围内抛出 `NotFoundException('你离这位商人太远了')`

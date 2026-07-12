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
5. 余额检查: canAffordWallet(playerId, 'spirit_stone', totalCost)
6. 背包空间预检；若本次恰好耗尽灵石堆，则允许进入最终预演，由扣款释放的格子接收商品
```

## 购买执行流程

```
1. 在玩家资产串行区内克隆当前背包并扣除灵石
2. 按共享物品堆叠签名合入商品，校验扣款后的实际容量与单堆数量上限 `2_147_483_647`
3. Durable Operation 同事务写背包真源与钱包投影；提交成功后一次替换运行态背包
4. durable 未启用的兼容路径也复用同一快照预演，禁止先扣款再单独发物
5. 刷新任务状态: refreshQuestStates(playerId)
```

## NPC 邻近判定

- 通过 `instance.getAdjacentNpc(playerId, npcId)` 判定
- 不在范围内抛出 `NotFoundException('你离这位商人太远了')`

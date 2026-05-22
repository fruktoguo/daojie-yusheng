# 背包与物品

## 背包常量

源文件: `packages/shared/src/constants/gameplay/inventory.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| DEFAULT_INVENTORY_CAPACITY | 200 | 默认背包容量 |
| GROUND_ITEM_EXPIRE_TICKS | 7200 | 地面物品保留时间（息） |
| DEFAULT_INSTANT_CONSUMABLE_COOLDOWN_TICKS | 5 | 即时消耗品冷却 |

## 物品类型

```typescript
ItemType = 'consumable' | 'equipment' | 'material' | 'quest_item' | 'skill_book'
```

- 可使用类型: `['consumable', 'skill_book']`
- 排序权重: equipment=0, consumable=1, material=2, skill_book=3, quest_item=4

## 物品堆叠规则

源文件: `packages/shared/src/item-stack.ts`

### 堆叠签名

```typescript
signature = itemId + '#' + enhanceLevel
```

### 规则

- 签名相同则可合并 count
- 实例态字段白名单: `['enhanceLevel']`
- 带 `itemInstanceId` 的装备也按签名合并
- 合并时现有堆叠的 itemInstanceId 胜出，新进入的被丢弃
- 拆出时必须分配新 instanceId

## 物品实例 ID 生成

源文件: `packages/shared/src/item-runtime-types.ts`

- 装备类强制存在 `itemInstanceId`，由服务端 `randomUUID v4` 分配
- 全程不变（装/卸/强化/掉落/拾取/邮件领取）
- 市场挂单脱壳后买家成交会重新分配 ID
- 历史 fallback 值（含":"）视为"未稳定"，水合时 lazy 升级为新 UUID

## 物品使用逻辑

- consumable: 检查冷却 → 消耗 → 触发效果（heal/buff/qi恢复）
- skill_book: 检查学习条件 → 消耗 → 学习功法/技能
- 自动用药: 背包前 12 格内的消耗品可被自动战斗系统使用

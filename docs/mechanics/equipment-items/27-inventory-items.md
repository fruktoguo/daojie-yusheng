# 背包与物品

## 背包常量

源文件: `packages/shared/src/constants/gameplay/inventory.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| DEFAULT_INVENTORY_CAPACITY | 200 | 默认背包容量 |
| GROUND_ITEM_EXPIRE_TICKS | 7200 | 地面物品保留时间（息） |
| DEFAULT_INSTANT_CONSUMABLE_COOLDOWN_TICKS | 60 | 即时恢复类消耗品默认冷却 |

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
  - `healAmount`: 固定气血瞬回。
  - `healPercent`: 按玩家当前最大气血比例瞬回。
  - `baselineHealPercent`: 按物品 `level` 对应标准玩家最大气血比例瞬回；配置保留百分比，运行时按 `player-final-attr-baselines.json` 计算实际数值。
  - `qiPercent`: 按玩家当前最大真气比例瞬回。
  - `baselineQiPercent`: 按物品 `level` 对应标准玩家最大灵力比例瞬回；配置保留百分比，运行时按 `player-final-attr-baselines.json` 计算实际数值。
- skill_book: 检查学习条件 → 消耗 → 学习功法/技能
- 玩家主动使用、丢弃、摧毁、装备、布阵、强化、市场上架等资产操作必须以 `itemInstanceId` 定位背包目标；背包数组顺序和 UI 格子只用于展示、排序和面板 patch。
- 自动用药: 背包前 12 格内的消耗品可被自动战斗系统使用
- 恢复药效果: 当前恢复丹药统一为基准瞬回 + 120 息自动恢复提升；恢复气血和恢复灵力分别使用 `hp` / `qi` 两组通用冷却，当前恢复药配置为 60 息，同组 60 息内只能服用一枚。

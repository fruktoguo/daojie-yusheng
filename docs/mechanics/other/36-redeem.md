# 兑换码系统

## 核心常量

源文件: `packages/server/src/runtime/redeem/redeem-code-runtime.service.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| REDEEM_CODE_LENGTH | 36 | 兑换码长度 |
| REDEEM_CODE_ALPHABET | 0-9A-Z | 字符表（36字符） |
| MAX_BATCH_REDEEM_CODES | 50 | 输入归一化阶段的内部截断上限；当前玩家入口另有 5 码硬限制 |
| MAX_GROUP_CREATE_COUNT | 500 | 单分组最多生成码数 |
| REDEEM_RATE_LIMIT_MS | 3000 | 兑换频率限制（3秒） |
| REDEEM_RATE_CACHE_TTL_MS | 60000 | 频率缓存过期时间 |
| REDEEM_RATE_CACHE_MAX_PLAYERS | 10000 | 频率缓存最大玩家数 |

## 使用限制

- 当前玩家入口单次最多兑换 **5** 个兑换码；`MAX_BATCH_REDEEM_CODES = 50` 只控制归一化阶段的内部截断，两个口径是否统一见审计待决项
- 同一玩家两次兑换间隔 ≥ 3 秒
- 每个兑换码只能使用一次
- 兑换码状态: `active` / `pending` / `used` / `destroyed`；`pending` 是奖励事务与最终核销之间的可补偿中间态
- 已使用或已销毁的码返回"兑换码无效或已过期"

## 兑换流程

```
1. 归一化输入码（trim + toUpperCase + 去重）
2. 频率限制检查
3. 逐码校验：查找码 → 检查状态 → 检查分组奖励和物品模板 → 检查背包空间
4. 数据库条件更新把码抢占为 `pending`，同时冻结该次兑换的奖励快照和稳定 `operationId`
5. 全部奖励通过同一个 `grantInventoryItems` durable operation 写入背包真源
6. 奖励事务成功后把同一 `operationId` 的 `pending` 码 finalize 为 `used`
7. 若奖励已提交但 finalize 失败，重试只补核销，不再次规划、发放或应用运行态奖励
```

## 奖励发放

- 所有奖励（包括 `spirit_stone`）统一走一次 Durable Inventory Grant 事务；`player_inventory_item` 是灵石正式真源，`wallet` 只是运行态投影缓存
- 单次兑换的普通物品和灵石不得拆成多个资产事务，避免前半成功、后半失败后形成部分发奖
- 奖励事务需要 `runtimeOwnerId` + `sessionEpoch`，玩家处于实例时还必须携带当前 instance lease/ownership fence
- `pending` 记录保存首次 claim 时的奖励快照；后续 GM 修改分组奖励不改变已经开始兑换的码
- `used` / `destroyed` 是不可回退的终态；GM 可以显式把无法继续补偿的 `pending` 码销毁，但普通全量保存不能把它回退为 `active`
- 奖励数量必须是正数且不超过单物品运行态上限 `2_147_483_647`；同一分组里的重复 `itemId` 在写入前合并并检查总量

## 分组名称限制

- 不能为空
- 最大长度 120 字符
- 同名分组不允许重复

## 分组删除

- GM 可删除尚未产生使用记录的兑换码分组
- 删除分组会同步删除该分组下未使用或已销毁的兑换码
- 只要分组内存在 `used` 或 `pending` 兑换码，删除会被拒绝，以保留核销审计或待补偿记录

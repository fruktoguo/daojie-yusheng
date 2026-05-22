# 兑换码系统

## 核心常量

源文件: `packages/server/src/runtime/redeem/redeem-code-runtime.service.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| REDEEM_CODE_LENGTH | 36 | 兑换码长度 |
| REDEEM_CODE_ALPHABET | 0-9A-Z | 字符表（36字符） |
| MAX_BATCH_REDEEM_CODES | 50 | 单次最大提交码数（内部上限） |
| MAX_GROUP_CREATE_COUNT | 500 | 单分组最多生成码数 |
| REDEEM_RATE_LIMIT_MS | 3000 | 兑换频率限制（3秒） |
| REDEEM_RATE_CACHE_TTL_MS | 60000 | 频率缓存过期时间 |
| REDEEM_RATE_CACHE_MAX_PLAYERS | 10000 | 频率缓存最大玩家数 |

## 使用限制

- 单次最多兑换 **50** 个兑换码（`MAX_BATCH_REDEEM_CODES`）
- 同一玩家两次兑换间隔 ≥ 3 秒
- 每个兑换码只能使用一次
- 兑换码状态: `active` / `used` / `destroyed`
- 已使用或已销毁的码返回"兑换码无效或已过期"

## 兑换流程

```
1. 归一化输入码（trim + toUpperCase + 去重）
2. 频率限制检查
3. 逐码校验: 查找码 → 检查状态 → 检查分组奖励 → 检查背包空间
4. 发放奖励（区分钱包类和背包类）
5. 标记码为 used，记录使用者信息
6. 持久化整个文档
```

## 奖励发放

- `spirit_stone` → 走 Durable Wallet 事务
- 其他物品 → 走 Durable Inventory Grant 事务
- 两者都需要 `runtimeOwnerId` + `sessionEpoch` 上下文

## 分组名称限制

- 不能为空
- 最大长度 120 字符
- 同名分组不允许重复

# 市场交易

## 价格常量

源文件: `packages/shared/src/constants/gameplay/market.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| MARKET_MIN_UNIT_PRICE | 0.01 | 最低单价 |
| MARKET_MAX_UNIT_PRICE | 10,000,000,000 | 最高单价 |
| MARKET_PRICE_PRESET_VALUES | [0.01, 1, 100, 10000, 1000000] | 价格预设 |
| MARKET_CURRENCY_ITEM_ID | 'spirit_stone' | 交易货币 |
| MARKET_MAX_ORDER_QUANTITY | 999,900,000,000 | 最大挂单数量 |
| MARKET_MAX_ENHANCE_LEVEL | 20 | 可交易强化上限 |

## 价格档位规则（Band）

源文件: `packages/shared/src/market-price.ts`

```typescript
base = 10^floor(log10(price))
normalized = price / base
if normalized < 3: step = base/20
if normalized < 5: step = base/10
else: step = base/5
```

- 小数价格: 精度为 1/100，有效值 0.01~0.99

## 交易总价计算

```typescript
// 整数价
total = quantity × unitPrice  // 需为安全整数

// 小数价
total = (quantity × scaledPrice) / 100  // 需整除
最小交易数量 = 100 / gcd(100, scaledPrice)
```

## 拍卖行常量

| 常量 | 值 | 说明 |
|------|-----|------|
| AUCTION_LISTING_FEE_BASE | 10 | 上架基础费 |
| AUCTION_LISTING_FEE_RATE | 0.01 | 起拍总价 1% |
| AUCTION_MIN_DURATION_HOURS | 1 | 最短拍卖时间 |
| AUCTION_MAX_DURATION_HOURS | 48 | 最长拍卖时间 |
| AUCTION_DEFAULT_DURATION_HOURS | 12 | 默认拍卖时间 |
| AUCTION_EXTENSION_WINDOW_MS | 30000 | 延时窗口（30秒） |
| AUCTION_MAX_EXTENSION_MS | 3600000 | 最大延时（1小时） |

### 上架费公式

```typescript
fee = 10 + ceil(startPrice × 0.01)
```

## 服务端市场常量

源文件: `packages/server/src/constants/gameplay/market.ts`

| 常量 | 值 |
|------|-----|
| MARKET_TRADE_HISTORY_VISIBLE_LIMIT | 100 |
| MARKET_TRADE_HISTORY_PAGE_SIZE | 10 |
| AUCTION_GLOBAL_TRADE_HISTORY_LIMIT | 20 |
| AUCTION_MY_TRADE_HISTORY_VISIBLE_LIMIT | 100 |
| AUCTION_TRADE_HISTORY_PAGE_SIZE | 20 |
| MARKET_TRADE_HISTORY_RUNTIME_CACHE_LIMIT | 500 |
| MARKET_STORAGE_RUNTIME_CACHE_LIMIT | 5000 |

## 交易限制

- 强化等级 > 20 的装备不可上架普通坊市
- 交易数量必须为安全整数
- 小数价格交易数量必须满足整除条件
- 货币统一为灵石（spirit_stone）
- 玩家从背包发起普通寄售、拍卖寄售或快速出售时，服务端必须按 `itemInstanceId` 拆分目标物品，不能按背包格子位置定位。

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
- GM 封禁账号时，服务端会自动取消该账号仍开放的普通求购、普通挂售和拍卖寄拍订单；求购预留灵石、挂售物品、寄拍物品会按坊市返还链路回到玩家背包，背包不可收取或玩家离线时进入坊市托管仓；寄拍已有出价时，竞拍者冻结灵石同步退回。
- 封禁联动撤单失败时，封禁操作会失败并尝试回滚账号封禁状态，避免账号状态与坊市资产状态半完成。

## 天道商店

源文件: `packages/shared/src/constants/gameplay/market.ts`

- 入口位于坊市 tab 的「天道商店」独立按钮；打开后进入独立商店界面，布局复用 NPC 商店式货架与详情区
- 坊市 tab 首屏只保留「坊市」「拍卖行」「天道商店」独立入口按钮，不常驻展示坊市摘要、拍卖行摘要或天道商店商品列表
- 只消耗专属货币 `merit`（功德），不参与普通坊市撮合、挂单和成交历史
- 客户端只发送商品 `itemId` 与购买份数；商品、数量和价格由服务端按固定表校验
- 购买成功后直接扣除功德并发放商品；背包不足时沿用坊市托管/玩家持久化刷新链路

| 商品 | 数量 | 价格 |
|------|------|------|
| 灵石 | 240 | 100 功德 |
| 天品灵根幼苗 | 1 | 2000 功德 |
| 神品灵根幼苗 | 1 | 10000 功德 |
| 建宗令 | 1 | 2000 功德 |
| 悟道玉简 | 1 | 1000 功德 |
| 凝相丹 | 1 | 1 功德 |
| 往生丹 | 1 | 100 功德 |
| 碎灵丹 | 1 | 10 功德 |

# 坊市系统运维手册

## 概述

坊市（Market）系统负责玩家间物品交易，包括一口价、求购、拍卖等功能。本手册描述坊市系统的运维操作和故障排查。

## 架构

```
┌─────────────────┐     ┌─────────────────┐
│ MarketRuntime   │────▶│MarketPersistence│
│  (挂单/仓库)     │     │  (PostgreSQL)   │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│  WorldGateway   │
│  (协议投影)      │
└─────────────────┘
```

## 核心组件

| 组件 | 位置 | 职责 |
|------|------|------|
| MarketRuntimeService | `runtime/market/` | 坊市运行时，挂单撮合和仓库管理 |
| MarketPersistenceService | `persistence/` | 坊市持久化，订单和仓库数据库读写 |
| WorldGatewayMarketHelper | `network/` | 协议投影，客户端同步 |

## 交易类型

| 类型 | 说明 |
|------|------|
| sell | 出售挂单，一口价 |
| buy | 求购挂单 |
| auction | 拍卖，竞价模式 |

## 状态检查

### 检查坊市服务状态

```bash
# 查看坊市相关日志
docker service logs daojie-yusheng_server --tail 200 | grep -i market

# 检查挂单表状态
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "SELECT COUNT(*) FROM market_orders WHERE status = 'open'"
```

### 检查活跃挂单

```bash
# 查看当前活跃挂单
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    SELECT order_type, COUNT(*) as count, SUM(price) as total_value
    FROM market_orders
    WHERE status = 'open'
    GROUP BY order_type
  "
```

### 检查交易历史

```bash
# 查看最近成交
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    SELECT * FROM market_trades
    ORDER BY traded_at DESC
    LIMIT 20
  "
```

## 常见故障

### 挂单失败

**症状**：玩家无法创建挂单

**排查步骤**：

```bash
# 1. 检查坊市日志
docker service logs daojie-yusheng_server --tail 500 | grep -i "market.*error"

# 2. 检查玩家背包
# 确认物品存在且数量足够

# 3. 检查挂单限制
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    SELECT COUNT(*) FROM market_orders
    WHERE seller_id = '玩家ID' AND status = 'open'
  "
```

**常见原因**：
- 物品不可交易
- 达到挂单数量上限
- 价格超出范围
- 背包物品不足

### 购买失败

**症状**：玩家无法购买挂单物品

**排查步骤**：

```bash
# 1. 检查挂单状态
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    SELECT * FROM market_orders WHERE id = '挂单ID'
  "

# 2. 检查买家灵石
# 确认灵石余额足够

# 3. 检查买家背包空间
```

**常见原因**：
- 挂单已被购买或取消
- 灵石不足
- 背包已满
- 并发购买冲突

### 拍卖异常

**症状**：拍卖出价失败或结算异常

**排查步骤**：

```bash
# 1. 检查拍卖状态
docker service logs daojie-yusheng_server --tail 200 | grep -i auction

# 2. 检查拍卖时间
# 确认拍卖未结束

# 3. 检查出价记录
```

**常见原因**：
- 出价低于当前最高价
- 拍卖已结束
- 延时窗口内出价冲突

### 仓库物品丢失

**症状**：玩家坊市仓库物品消失

**排查步骤**：

```bash
# 1. 检查仓库数据
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    SELECT * FROM market_storage WHERE player_id = '玩家ID'
  "

# 2. 检查交易历史
# 确认是否被购买或提取

# 3. 检查操作日志
docker service logs daojie-yusheng_server --tail 500 | grep "玩家ID.*market"
```

## 数据维护

### 清理过期挂单

```bash
# 检查过期挂单
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    SELECT COUNT(*) FROM market_orders
    WHERE status = 'open' AND expires_at < NOW()
  "

# 过期挂单会在 tick 中自动处理，物品退回仓库
```

### 强制取消挂单（GM）

```bash
# 通过 GM 面板或直接数据库操作（谨慎）
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    UPDATE market_orders
    SET status = 'cancelled', cancelled_at = NOW()
    WHERE id = '挂单ID'
  "
# 注意：需要同步处理仓库物品退回
```

## Smoke 测试

```bash
# 坊市存储运行时边界测试
pnpm --filter @mud/server smoke:market-storage-runtime-boundary

# 一口价购买测试
pnpm --filter @mud/server smoke:market-runtime-buy-now

# 一口价出售测试
pnpm --filter @mud/server smoke:market-runtime-sell-now
```

## 拍卖机制

### 延时规则

- 延时窗口：30 秒
- 最大延时：1 小时
- 在结束前 30 秒内出价会延长拍卖时间

### 结算流程

1. 拍卖到期
2. 确定最高出价者
3. 扣除出价者灵石
4. 物品转入出价者仓库
5. 灵石转入卖家账户
6. 记录交易历史

## 监控指标

| 指标 | 正常范围 | 告警阈值 |
|------|----------|----------|
| 活跃挂单数 | < 10000 | > 50000 |
| 单玩家挂单数 | < 50 | > 100 |
| 交易撮合延迟 | < 100ms | > 500ms |
| 仓库物品总数 | < 100000 | > 500000 |

## 经济监控

### 交易量统计

```bash
# 每日交易量
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    SELECT DATE(traded_at) as date, COUNT(*) as trades, SUM(price) as volume
    FROM market_trades
    WHERE traded_at > NOW() - INTERVAL '7 days'
    GROUP BY DATE(traded_at)
    ORDER BY date DESC
  "
```

### 价格异常检测

```bash
# 检查异常高价挂单
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    SELECT item_id, price, seller_id
    FROM market_orders
    WHERE status = 'open' AND price > 1000000
    ORDER BY price DESC
    LIMIT 20
  "
```

## 相关文档

- [故障排查手册](incident-response.md)
- [邮件系统运维手册](mail-system.md)

# 坊市系统运维手册

解决挂单失败、购买异常、拍卖结算问题和仓库物品丢失。

## 状态检查

```bash
# 坊市日志
docker service logs daojie-yusheng_server --tail 200 | grep -i market

# 活跃挂单统计
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    SELECT order_type, COUNT(*) as count, SUM(price) as total_value
    FROM market_orders WHERE status = 'open' GROUP BY order_type"

# 最近成交
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    SELECT * FROM market_trades ORDER BY traded_at DESC LIMIT 20"
```

## 故障排查

### 挂单失败

```bash
docker service logs daojie-yusheng_server --tail 500 | grep -i "market.*error"

# 检查玩家挂单数
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    SELECT COUNT(*) FROM market_orders WHERE seller_id = '玩家ID' AND status = 'open'"
```

常见原因：物品不可交易、达到挂单上限、价格超出范围、背包物品不足。

### 购买失败

```bash
# 检查挂单状态
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "SELECT * FROM market_orders WHERE id = '挂单ID'"
```

常见原因：挂单已被购买/取消、灵石不足、背包已满、并发购买冲突。

### 拍卖异常

```bash
docker service logs daojie-yusheng_server --tail 200 | grep -i auction
```

常见原因：出价低于当前最高价、拍卖已结束、延时窗口内出价冲突。

拍卖延时规则：结束前 30 秒内出价延长拍卖，最大延时 1 小时。

### 仓库物品丢失

```bash
# 检查仓库数据
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "SELECT * FROM market_storage WHERE player_id = '玩家ID'"

# 检查操作日志
docker service logs daojie-yusheng_server --tail 500 | grep "玩家ID.*market"
```

确认是否被购买、提取或过期退回。

## GM 操作

### 强制取消挂单

```bash
# 直接数据库操作（谨慎，需同步处理仓库物品退回）
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    UPDATE market_orders SET status = 'cancelled', cancelled_at = NOW() WHERE id = '挂单ID'"
```

## 经济监控

```bash
# 每日交易量
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    SELECT DATE(traded_at) as date, COUNT(*) as trades, SUM(price) as volume
    FROM market_trades WHERE traded_at > NOW() - INTERVAL '7 days'
    GROUP BY DATE(traded_at) ORDER BY date DESC"

# 异常高价挂单
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    SELECT item_id, price, seller_id FROM market_orders
    WHERE status = 'open' AND price > 1000000 ORDER BY price DESC LIMIT 20"
```

## Smoke 测试

```bash
pnpm --filter @mud/server smoke:market-storage-runtime-boundary
pnpm --filter @mud/server smoke:market-runtime-buy-now
pnpm --filter @mud/server smoke:market-runtime-sell-now
```

## 监控阈值

| 指标 | 正常 | 告警 |
|------|------|------|
| 活跃挂单数 | < 10000 | > 50000 |
| 单玩家挂单数 | < 50 | > 100 |
| 交易撮合延迟 | < 100ms | > 500ms |
| 仓库物品总数 | < 100000 | > 500000 |

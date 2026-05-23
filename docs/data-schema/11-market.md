# 坊市交易

## server_market_order

市场挂单。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| order_id | varchar(160) | PK | 订单 ID |
| owner_id | varchar(100) | NOT NULL | 挂单玩家 |
| side | varchar(16) | NOT NULL | 方向（sell/buy） |
| status | varchar(24) | NOT NULL | 状态（open/filled/cancelled） |
| item_key | varchar(240) | NOT NULL | 物品匹配键（item_id + 品质等） |
| item_id | varchar(160) | NOT NULL | 物品模板 ID |
| remaining_quantity | bigint | NOT NULL, DEFAULT 0 | 剩余数量 |
| unit_price | numeric(20,2) | NOT NULL, DEFAULT 1 | 单价 |
| created_at_ms | bigint | NOT NULL | 创建时间（毫秒） |
| updated_at_ms | bigint | NOT NULL | 更新时间（毫秒） |
| raw_payload | jsonb | NOT NULL, DEFAULT '{}' | 扩展数据（装备详情等） |
| updated_at | timestamptz | DEFAULT now() | |

**索引**：
- status + item_key + side + unit_price + created_at_ms（撮合查询）
- owner_id + status + updated_at_ms DESC（玩家订单列表）

**特点**：
- 撮合逻辑：买单按价格降序、卖单按价格升序匹配
- `item_key` 是复合匹配键，同类物品（不同强化等级）可能有不同 key
- 挂单时冻结货币/物品，成交/取消时释放
- 属于"强持久化事务域"

---

## server_market_trade_history

市场成交记录。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| trade_id | varchar(160) | PK | 成交 ID |
| buyer_id | varchar(100) | NOT NULL | 买家 |
| seller_id | varchar(100) | NOT NULL | 卖家 |
| item_id | varchar(160) | NOT NULL | 物品模板 ID |
| quantity | bigint | NOT NULL, DEFAULT 1 | 成交数量 |
| unit_price | numeric(20,2) | NOT NULL, DEFAULT 1 | 成交单价 |
| created_at_ms | bigint | NOT NULL | 成交时间 |
| raw_payload | jsonb | NOT NULL, DEFAULT '{}' | 扩展数据 |
| updated_at | timestamptz | DEFAULT now() | |

**索引**：
- created_at_ms DESC + trade_id ASC（全局时间线）
- buyer_id + seller_id + created_at_ms DESC（参与方查询）
- buyer_id + created_at_ms DESC（买家历史）
- seller_id + created_at_ms DESC（卖家历史）

**特点**：
- 只增不改，成交后永久保留
- 用于价格走势、交易审计

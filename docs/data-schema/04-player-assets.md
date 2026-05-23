# 资产：背包、装备、钱包、市场仓库

## player_inventory_item

玩家背包物品，每个物品栈一行。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| item_instance_id | varchar(180) | PK | 物品实例 UUID |
| player_id | varchar(100) | NOT NULL | 所属玩家 |
| slot_index | bigint | NOT NULL | 背包槽位索引 |
| item_id | varchar(160) | NOT NULL | 物品模板 ID |
| count | bigint | NOT NULL, DEFAULT 1 | 堆叠数量 |
| raw_payload | jsonb | NOT NULL, DEFAULT '{}' | 个性化数据 |
| locked_by | varchar(180) | DEFAULT NULL | 锁定来源（强化/市场托管） |
| updated_at | timestamptz | DEFAULT now() | |

**唯一约束**：(player_id, slot_index)

**索引**：
- player_id + slot_index ASC（按槽位顺序查询）
- item_id + player_id ASC（按物品类型查询）
- player_id + locked_by WHERE locked_by IS NOT NULL（锁定物品查询）

**特点**：
- **raw_payload 只存个性化字段**：装备类存 `{ enhanceLevel }`，普通物品存 `{}`
- 模板字段（name/type/desc/equipAttrs 等）运行时通过 `Object.create(template)` 从 Registry 水合
- `locked_by` 非 NULL 时物品进入锁定空间，不参与正常背包操作
- 装备类 count 恒为 1，通过 item_instance_id 全局唯一标识
- 属于"强持久化事务域"（durable operation）

---

## player_equipment_slot

玩家装备栏，每个槽位一行。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | NOT NULL | 玩家 ID |
| slot_type | varchar(32) | NOT NULL | 槽位类型（weapon/head/body/legs/accessory） |
| item_instance_id | varchar(180) | NOT NULL, UNIQUE | 装备实例 UUID |
| item_id | varchar(120) | NOT NULL | 物品模板 ID |
| raw_payload | jsonb | NOT NULL | 个性化数据（enhanceLevel） |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(player_id, slot_type)

**唯一约束**：item_instance_id（一件装备只能在一个槽位）

**索引**：player_id

**特点**：
- 穿戴/卸下装备时整行 UPSERT/DELETE
- raw_payload 同样只存 `{ enhanceLevel }`
- 与 player_inventory_item 通过 item_instance_id 关联（同一件装备）
- 属于"强持久化事务域"

---

## player_wallet

玩家钱包，每种货币一行。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | NOT NULL | 玩家 ID |
| wallet_type | varchar(64) | NOT NULL | 货币类型（gold/spirit_stone 等） |
| balance | bigint | NOT NULL, DEFAULT 0 | 可用余额 |
| frozen_balance | bigint | NOT NULL, DEFAULT 0 | 冻结余额（市场挂单） |
| version | bigint | NOT NULL, DEFAULT 0 | 乐观锁版本号 |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(player_id, wallet_type)

**索引**：player_id + wallet_type ASC

**特点**：
- `version` 用于乐观并发控制，防止并发扣款
- `frozen_balance` 在市场挂单时冻结，成交/取消时释放
- 属于"强持久化事务域"

---

## player_market_storage_item

坊市仓库物品（市场下架后暂存）。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| storage_item_id | varchar(160) | PK | 仓库物品 ID |
| player_id | varchar(100) | NOT NULL | 玩家 ID |
| slot_index | bigint | NOT NULL | 仓库槽位 |
| item_id | varchar(160) | NOT NULL | 物品模板 ID |
| count | bigint | NOT NULL, DEFAULT 1 | 数量 |
| enhance_level | bigint | | 强化等级 |
| raw_payload | jsonb | NOT NULL, DEFAULT '{}' | 个性化数据 |
| updated_at | timestamptz | DEFAULT now() | |

**唯一约束**：(player_id, slot_index)

**索引**：player_id + slot_index ASC、item_id + player_id ASC

**特点**：
- 市场成交后买家物品先进入此仓库，玩家手动领取到背包
- 结构与 player_inventory_item 类似
- 属于"强持久化事务域"

---

## tongtian_tower_progress

通天塔进度。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar | PK | 玩家 ID |
| current_layer | integer | NOT NULL, DEFAULT 1, CHECK >= 1 | 当前层 |
| highest_layer | integer | NOT NULL, DEFAULT 1, CHECK >= 1 | 历史最高层 |
| updated_at | timestamptz | DEFAULT now() | |

**特点**：
- 通关一层时更新
- CHECK 约束保证层数不为负

# 持久化操作、Outbox、审计

## durable_operation_log

持久化操作日志，所有资产变更的事务记录。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| operation_id | varchar(180) | PK | 操作 ID（幂等键） |
| operation_type | varchar(64) | NOT NULL | 操作类型 |
| aggregate_type | varchar(64) | NOT NULL | 聚合类型（player/instance） |
| aggregate_id | varchar(180) | NOT NULL | 聚合 ID |
| player_id | varchar(100) | NOT NULL | 关联玩家 |
| runtime_owner_id | varchar(120) | | 执行节点 |
| session_epoch | bigint | | 会话纪元 |
| request_id | varchar(180) | | 请求 ID |
| payload_jsonb | jsonb | NOT NULL | 操作载荷 |
| status | varchar(32) | NOT NULL | 状态（pending/committed/failed） |
| error_code | varchar(64) | | 错误码 |
| created_at | timestamptz | DEFAULT now() | |
| committed_at | timestamptz | | 提交时间 |

**索引**：player_id + created_at DESC、status + created_at DESC

**特点**：
- 所有资产变更（背包增删、货币变动、装备穿卸）都通过此表保证原子性
- `operation_id` 保证幂等，重复提交不会重复执行
- 失败的操作保留记录用于排查

---

## outbox_event

事件发件箱，异步事件投递。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| event_id | varchar(180) | PK | 事件 ID |
| operation_id | varchar(180) | NOT NULL | 关联操作 |
| topic | varchar(120) | NOT NULL | 事件主题 |
| partition_key | varchar(180) | NOT NULL | 分区键 |
| payload_jsonb | jsonb | NOT NULL | 事件载荷 |
| status | varchar(32) | NOT NULL | 状态（pending/delivered/failed） |
| attempt_count | bigint | DEFAULT 0 | 尝试次数 |
| next_retry_at | timestamptz | | 下次重试时间 |
| claimed_by | varchar(120) | | 处理节点 |
| claim_until | timestamptz | | 认领过期时间 |
| created_at | timestamptz | DEFAULT now() | |
| delivered_at | timestamptz | | 投递时间 |

**索引**：
- operation_id（按操作查事件）
- partition_key + status + claim_until + created_at DESC（分区消费）
- status + next_retry_at + created_at（重试调度）

**特点**：
- 与 durable_operation_log 同事务写入，保证"操作成功 = 事件必发"
- Dispatcher 轮询消费，支持重试和死信

---

## outbox_consumer_dedupe

事件消费去重表。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| dedupe_key | varchar(180) | PK | 去重键 |
| event_id | varchar(180) | NOT NULL | 事件 ID |
| operation_id | varchar(180) | | 操作 ID |
| topic | varchar(200) | | 主题 |
| state | varchar(32) | DEFAULT 'processing' | 状态 |
| claimed_by | varchar(120) | | 处理节点 |
| claim_until | timestamptz | | 认领过期 |
| delivered_at | timestamptz | | 投递时间 |
| updated_at | timestamptz | DEFAULT now() | |

**索引**：event_id、operation_id (WHERE NOT NULL)

**特点**：
- 防止同一事件被多个消费者重复处理

---

## dead_letter_event

死信事件（多次重试失败后转入）。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| dead_letter_id | bigserial | PK | 自增 ID |
| event_id | varchar(180) | NOT NULL | 原事件 ID |
| operation_id | varchar(180) | | 原操作 ID |
| topic | varchar(200) | NOT NULL | 主题 |
| partition_key | varchar(200) | NOT NULL | 分区键 |
| payload_jsonb | jsonb | NOT NULL | 载荷 |
| status | varchar(32) | NOT NULL | 状态 |
| attempt_count | bigint | DEFAULT 0 | 已尝试次数 |
| failed_at | timestamptz | DEFAULT now() | 失败时间 |
| created_at | timestamptz | DEFAULT now() | |

**索引**：topic + failed_at DESC

**特点**：
- 人工介入处理的最后兜底
- 运维可查看死信并手动重放

---

## asset_audit_log / asset_audit_log_archive

资产审计日志，记录每次资产变更的前后快照。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| log_id | varchar(180) | PK | 日志 ID |
| operation_id | varchar(180) | NOT NULL | 关联操作 |
| player_id | varchar(100) | NOT NULL | 玩家 ID |
| asset_type | varchar(64) | NOT NULL | 资产类型（inventory/wallet/equipment） |
| asset_ref_id | varchar(180) | NOT NULL | 资产引用 ID |
| action | varchar(64) | NOT NULL | 动作（add/remove/update） |
| delta_jsonb | jsonb | NOT NULL | 变更差量 |
| before_jsonb | jsonb | NOT NULL | 变更前快照 |
| after_jsonb | jsonb | NOT NULL | 变更后快照 |
| created_at | timestamptz | DEFAULT now() | |

**索引**：operation_id + created_at DESC、player_id + created_at DESC

**特点**：
- 完整的资产变更审计链，支持回溯和争议处理
- archive 表定期从主表迁入历史数据

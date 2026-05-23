# 账号身份与会话

## server_player_identity

玩家账号主表，创建角色时写入，全生命周期不删除。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| user_id | varchar(100) | PK | 账号 ID（来自 auth 层） |
| username | varchar(80) | UNIQUE, NOT NULL | 登录用户名 |
| player_id | varchar(100) | UNIQUE, NOT NULL | 游戏内玩家 ID |
| player_no | bigint | UNIQUE | 玩家编号（自增序列） |
| display_name | varchar(32) | | 显示名称（可改名） |
| player_name | varchar(120) | NOT NULL | 角色名 |
| persisted_source | varchar(32) | NOT NULL | 数据来源标记 |
| updated_at | timestamptz | DEFAULT now() | 最后更新时间 |
| payload | jsonb | NOT NULL | 扩展字段（头像等） |

**索引**：username、player_id、display_name、player_no (WHERE NOT NULL)

**特点**：
- 写入触发器同步到 `player_identity` 镜像表
- 一次写入后极少更新（仅改名时）
- `player_no` 用于排行榜等需要数字 ID 的场景

---

## player_identity

`server_player_identity` 的镜像表，结构完全相同。由触发器自动同步。

**用途**：供外部系统（如 auth 服务）读取，避免直接访问主表。

---

## player_presence

玩家在线状态与会话归属，高频更新。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | PK | 玩家 ID |
| online | boolean | NOT NULL, DEFAULT false | 是否在线 |
| in_world | boolean | NOT NULL, DEFAULT false | 是否在世界中 |
| last_heartbeat_at | bigint | | 最后心跳时间戳 |
| offline_since_at | bigint | | 离线起始时间戳 |
| runtime_owner_id | varchar(180) | | 当前持有该玩家的运行时节点 |
| session_epoch | bigint | NOT NULL, DEFAULT 1 | 会话纪元（防脑裂） |
| transfer_state | varchar(32) | | 跨图传送状态 |
| transfer_target_node_id | varchar(120) | | 传送目标节点 |
| updated_at | timestamptz | DEFAULT now() | |

**索引**：player_id (UNIQUE)

**特点**：
- 每次心跳、上下线、跨图都会更新
- `runtime_owner_id + session_epoch` 构成租约，防止多节点同时操作同一玩家
- 是"小事务即时写域"，不走批量 flush

---

## server_player_snapshot

旧链路整档快照表，硬切后仅作为历史备份。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | PK | 玩家 ID |
| template_id | varchar(120) | NOT NULL | 出生地图模板 |
| instance_id | varchar(160) | | 最后所在实例 |
| persisted_source | varchar(32) | NOT NULL | 数据来源 |
| seeded_at | bigint | | 种子时间 |
| saved_at | bigint | NOT NULL | 保存时间 |
| updated_at | timestamptz | DEFAULT now() | |
| payload | jsonb | NOT NULL | 完整玩家状态快照 |

**索引**：template_id、instance_id、persisted_source

**特点**：
- 已废弃为运行时真源，仅保留用于离线导出/迁移
- payload 包含完整 PlayerState 的 JSONB 序列化

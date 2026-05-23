# 地图实例目录与节点注册

## instance_catalog

地图实例注册表，管理所有实例的生命周期和归属。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| instance_id | varchar(160) | PK | 实例 ID |
| template_id | varchar(120) | NOT NULL | 地图模板 ID |
| instance_type | varchar(32) | NOT NULL | 实例类型（persistent/ephemeral/personal） |
| persistent_policy | varchar(32) | NOT NULL | 持久化策略 |
| owner_player_id | varchar(100) | | 所有者玩家（个人副本） |
| owner_sect_id | varchar(100) | | 所有者宗门 |
| party_id | varchar(100) | | 队伍 ID |
| line_id | varchar(100) | | 线路 ID |
| status | varchar(32) | NOT NULL | 逻辑状态（active/destroying/destroyed） |
| runtime_status | varchar(32) | NOT NULL | 运行时状态（loaded/unloaded/loading） |
| assigned_node_id | varchar(120) | | 分配的服务节点 |
| lease_token | varchar(180) | | 租约令牌 |
| lease_expire_at | timestamptz | | 租约过期时间 |
| ownership_epoch | bigint | NOT NULL, DEFAULT 0 | 所有权纪元 |
| cluster_id | varchar(120) | | 集群 ID |
| shard_key | varchar(120) | NOT NULL | 分片键 |
| route_domain | varchar(120) | | 路由域 |
| destroy_at | timestamptz | | 计划销毁时间 |
| created_at | timestamptz | DEFAULT now() | |
| last_active_at | timestamptz | | 最后活跃时间 |
| last_persisted_at | timestamptz | | 最后持久化时间 |

**索引**：
- status + runtime_status（按状态筛选）
- assigned_node_id + lease_expire_at（节点租约查询）
- shard_key（分片路由）

**特点**：
- 所有地图实例的"户口本"，启动时扫描此表恢复实例
- 租约机制防止多节点同时加载同一实例
- `ownership_epoch` 递增防止旧节点的过期写入

---

## node_registry

服务节点注册表。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| node_id | varchar(120) | PK | 节点 ID |
| address | varchar(180) | NOT NULL | 节点地址 |
| port | bigint | NOT NULL | 端口 |
| status | varchar(32) | NOT NULL | 状态（active/draining/dead） |
| heartbeat_at | timestamptz | | 最后心跳 |
| started_at | timestamptz | DEFAULT now() | 启动时间 |
| capacity_weight | bigint | NOT NULL, DEFAULT 1 | 容量权重 |

**索引**：status + heartbeat_at DESC

**特点**：
- 多节点部署时的服务发现
- 心跳超时的节点标记为 dead，其持有的实例可被其他节点接管

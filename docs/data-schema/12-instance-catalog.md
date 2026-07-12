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
| metadata_version | bigint | NOT NULL, DEFAULT 0 | catalog 元数据版本，阻止低版本 upsert 覆盖新状态 |
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
- `ownership_epoch` 只允许单调递增；普通目录 upsert 即使面对已过期或已释放 lease，也必须取现有值与新值的最大值，不能用新建 runtime shell 的默认 `0` 回退历史 fence
- 实例销毁必须用运行态持有的 `assigned_node_id + lease_token + ownership_epoch` 做原子 CAS；销毁成功时先递增 `ownership_epoch` 和 `metadata_version`、清空 lease，再卸载本地运行态。CAS 冲突或数据库失败时保留运行态，等待租约同步收敛，不能先删内存再补写 catalog
- 普通启动和 GM 数据库恢复只重建本节点内存运行态，不得把 catalog 真源批量改写为 `destroyed/stopped`；实例终态只能由显式销毁流程按上述 lease/epoch CAS 产生
- 启动恢复必须先把 catalog 的 lease/epoch 元数据承接到新建 runtime shell，再注册 catalog、完成旧 epoch durable payload replay，并成功 claim/renew 本节点 lease，之后才允许水合实例分域；水合可能触发建筑清理、宝库返还或阵法修正，不能被当作无副作用只读步骤。大量实例排队恢复时，每个实例还必须在实际水合前即时续租，不能依赖队首取得的短租约覆盖整条恢复队列

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

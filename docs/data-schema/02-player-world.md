# 世界落点与位置

## player_world_anchor

玩家的世界锚点（复活点、安全点、线路偏好），低频更新。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | PK | 玩家 ID |
| respawn_template_id | varchar(120) | NOT NULL | 复活地图模板 ID |
| respawn_instance_id | varchar(160) | | 复活实例 ID |
| respawn_x | bigint | NOT NULL | 复活坐标 X |
| respawn_y | bigint | NOT NULL | 复活坐标 Y |
| last_safe_template_id | varchar(120) | NOT NULL | 最后安全地图模板 |
| last_safe_instance_id | varchar(160) | | 最后安全实例 |
| last_safe_x | bigint | NOT NULL | 安全坐标 X |
| last_safe_y | bigint | NOT NULL | 安全坐标 Y |
| preferred_line_preset | varchar(16) | NOT NULL, DEFAULT 'peaceful' | 线路偏好（和平/真实） |
| last_transfer_at | bigint | | 最后传送时间 |
| updated_at | timestamptz | DEFAULT now() | |

**特点**：
- 跨图传送、使用复活道具时更新
- `respawn` 是死亡后复活位置，`last_safe` 是遁返位置
- 属于"小事务即时写域"

---

## player_position_checkpoint

玩家位置检查点，用于崩溃恢复时确定玩家位置。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | PK | 玩家 ID |
| instance_id | varchar(160) | NOT NULL | 当前实例 ID |
| x | bigint | NOT NULL | 坐标 X |
| y | bigint | NOT NULL | 坐标 Y |
| facing | bigint | NOT NULL | 朝向 |
| checkpoint_kind | varchar(32) | NOT NULL | 检查点类型 |
| updated_at | timestamptz | DEFAULT now() | |

**特点**：
- 不是每步移动都写，而是在关键节点（跨图、下线、定时）写入
- 崩溃恢复时从此表读取位置，而非依赖每 tick 坐标
- 属于"小事务即时写域"

---

## player_map_unlock

玩家已解锁的地图列表。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | NOT NULL | 玩家 ID |
| map_id | varchar(120) | NOT NULL | 地图模板 ID |
| unlocked_at | bigint | NOT NULL | 解锁时间戳 |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(player_id, map_id)

**索引**：player_id + unlocked_at ASC

**特点**：
- 只增不删（解锁后永久有效）
- 使用地图解锁道具或完成任务时写入
- 属于"小事务即时写域"

# 地图实例分域

地图实例的运行时状态按域拆分存储，与玩家分域设计一致。

## instance_checkpoint

实例级检查点快照。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| instance_id | varchar(100) | PK | 实例 ID |
| checkpoint_payload | jsonb | NOT NULL, DEFAULT '{}' | 检查点数据 |
| updated_at | timestamptz | DEFAULT now() | |

---

## instance_recovery_watermark

实例分域恢复水位。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| instance_id | varchar(100) | PK | 实例 ID |
| watermark_payload | jsonb | NOT NULL, DEFAULT '{}' | 各域版本号 |
| updated_at | timestamptz | DEFAULT now() | |

---

## instance_tile_cell

地图地块数据（静态层覆盖）。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| instance_id | varchar(100) | NOT NULL | 实例 ID |
| x | bigint | NOT NULL | 坐标 X |
| y | bigint | NOT NULL | 坐标 Y |
| tile_type | varchar(64) | NOT NULL | 地块类型 |
| terrain_type | varchar(64) | | 地形类型 |
| surface_type | varchar(64) | | 表面类型 |
| structure_type | varchar(64) | | 结构类型 |
| interactable_kinds | text[] | DEFAULT '{}' | 可交互类型列表 |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(instance_id, x, y)

---

## instance_tile_resource_state

地块资源状态（灵气、矿脉等）。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| instance_id | varchar(100) | NOT NULL | 实例 ID |
| resource_key | varchar(100) | NOT NULL | 资源键 |
| tile_index | bigint | NOT NULL | 地块索引 |
| value | double precision | NOT NULL, DEFAULT 0 | 资源值 |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(instance_id, resource_key, tile_index)

---

## instance_tile_damage_state

地块伤害状态（可破坏地形）。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| instance_id | varchar(100) | NOT NULL | 实例 ID |
| tile_index | bigint | NOT NULL | 地块索引 |
| x / y | bigint | | 坐标 |
| hp | double precision | NOT NULL, DEFAULT 0 | 当前 HP |
| max_hp | double precision | NOT NULL, DEFAULT 1 | 最大 HP |
| destroyed | boolean | NOT NULL, DEFAULT false | 是否已摧毁 |
| respawn_left_ticks | bigint | NOT NULL, DEFAULT 0 | 重生剩余 tick |
| modified_at_ms | bigint | NOT NULL, DEFAULT 0 | 修改时间 |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(instance_id, tile_index)

---

## instance_temporary_tile_state

临时地块（技能创建的临时地形）。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| instance_id | varchar(100) | NOT NULL | 实例 ID |
| tile_index | bigint | NOT NULL | 地块索引 |
| x / y | bigint | | 坐标 |
| tile_type | varchar(64) | NOT NULL, DEFAULT 'stone' | 地块类型 |
| hp / max_hp | double precision | | 生命值 |
| expires_at_tick | bigint | NOT NULL, DEFAULT 1 | 过期 tick |
| owner_player_id | varchar(100) | | 创建者 |
| source_skill_id | varchar(160) | | 来源技能 |
| created_at_ms / modified_at_ms | bigint | | 时间戳 |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(instance_id, tile_index)

---

## instance_ground_item

地面掉落物。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| ground_item_id | varchar(100) | PK | 掉落物 ID |
| instance_id | varchar(100) | NOT NULL | 实例 ID |
| tile_index | bigint | NOT NULL | 地块索引 |
| item_instance_payload | jsonb | NOT NULL | 物品数据 |
| expire_at | timestamptz | | 过期时间 |
| updated_at | timestamptz | DEFAULT now() | |

**索引**：instance_id + tile_index、expire_at ASC

---

## instance_monster_runtime_state

怪物运行时状态。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| monster_runtime_id | varchar(100) | PK | 怪物运行时 ID |
| instance_id | varchar(100) | NOT NULL | 实例 ID |
| monster_id | varchar(100) | NOT NULL | 怪物模板 ID |
| monster_name | varchar(200) | NOT NULL | 怪物名称 |
| monster_tier | varchar(32) | NOT NULL | 怪物品阶 |
| monster_level | bigint | | 等级 |
| tile_index | bigint | NOT NULL | 位置 |
| x / y | bigint | NOT NULL | 坐标 |
| hp / max_hp | double precision | NOT NULL | 生命值 |
| alive | boolean | NOT NULL, DEFAULT true | 是否存活 |
| respawn_left / respawn_ticks | bigint | | 重生计时 |
| aggro_target_player_id | varchar(100) | | 仇恨目标 |
| state_payload | jsonb | NOT NULL, DEFAULT '{}' | 扩展状态 |
| updated_at | timestamptz | DEFAULT now() | |

**索引**：instance_id + monster_tier + monster_runtime_id

---

## instance_overlay_chunk

实例覆盖层分块（地图动态修改的增量记录）。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| instance_id | varchar(100) | NOT NULL | 实例 ID |
| patch_kind | varchar(32) | NOT NULL | 补丁类型 |
| chunk_key | varchar(180) | NOT NULL | 分块键 |
| patch_version | bigint | NOT NULL, DEFAULT 0 | 补丁版本 |
| patch_payload | jsonb | NOT NULL, DEFAULT '{}' | 补丁数据 |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(instance_id, patch_kind, chunk_key)

---

## instance_building_state / instance_building_cell

建筑系统状态和占地格子，详见建筑系统文档。

---

## instance_room_state / instance_room_cell

房间系统状态和格子归属，详见风水系统文档。

---

## instance_fengshui_state

风水评分状态，详见风水系统文档。

---

## instance_container_state / instance_container_entry / instance_container_timer

容器系统（宝箱、采集点等），管理容器内容和刷新计时。

---

## instance_event_state

实例事件状态（世界事件、限时活动等）。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| event_id | varchar(180) | PK | 事件 ID |
| instance_id | varchar(100) | NOT NULL | 实例 ID |
| event_kind | varchar(80) | NOT NULL | 事件类型 |
| event_key | varchar(180) | NOT NULL | 事件键 |
| state_payload | jsonb | NOT NULL, DEFAULT '{}' | 状态数据 |
| resolved_at | timestamptz | | 结束时间 |
| updated_at | timestamptz | DEFAULT now() | |

---

## instance_building_operation_idempotency / instance_building_audit_log

建筑操作幂等性保证和审计日志。

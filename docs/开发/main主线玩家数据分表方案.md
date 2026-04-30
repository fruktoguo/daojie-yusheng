# main 主线玩家数据分表方案

## 1. 文档定位

这份文档只回答一件事：

- 基于参考 `main` 主线当前真实在线玩家数据面，玩家数据应该如何分表

它和另外两份文档的关系如下：

- [参考main分支真实玩家存档盘点.md](./参考main分支真实玩家存档盘点.md)
  - 负责回答“现在到底存了什么”
- [mmo商业级数据落盘方案.md](./mmo商业级数据落盘方案.md)
  - 负责回答“整个 MMO 持久化系统终局怎么收口”
- 本文
  - 负责回答“基于当前 main 真实玩家数据，玩家域具体拆成哪些表，每张表存什么，怎么迁”

本文默认面向 `packages/server` 的玩家持久化重构，不讨论地图实例、邮件系统、市场撮合、宗门、GM、配置编辑器等非玩家主档域。

## 1.1 当前 next 实现映射（2026-04-23）

这份文档描述的是玩家域终局拆表口径；当前 `next` 主线已经开始落地，但命名和覆盖面还没有完全到终局。

当前已落地或已对齐的关键映射：

- 逻辑上的 `player_identity`，当前真实表名仍是 `server_next_player_identity`
- 旧玩家快照主表仍是 `server_next_player_snapshot`，当前是“旧快照 + 分域投影双写”状态，不是已经完全退役
- `player_presence`、`player_world_anchor`、`player_position_checkpoint`、`player_vitals`、`player_progression_core`、`player_attr_state`、`player_body_training_state`、`player_inventory_item`、`player_map_unlock`、`player_equipment_slot`、`player_technique_state`、`player_persistent_buff_state`、`player_quest_progress`、`player_combat_preferences`、`player_auto_battle_skill`、`player_auto_use_item_rule`、`player_profession_state`、`player_alchemy_preset`、`player_active_job`、`player_enhancement_record`、`player_logbook_message`、`player_recovery_watermark` 已经开始承接 当前生产主线写入
- `player_vitals` 当前已落地字段子集是 `hp / max_hp / qi / max_qi`；`dead` 还不属于当前 next 快照真源
- `player_progression_core` 当前已落地字段子集是 `foundation / combat_exp / bone_age_base_years / life_elapsed_ticks / lifespan_years`；击杀计数与跨图导航冷却还不属于当前 next 快照真源
- `player_attr_state` 当前已落地字段子集是 `base_attrs_payload / bonus_entries_payload / revealed_breakthrough_requirement_ids / realm_payload / heaven_gate_payload / spiritual_roots_payload`
- `player_body_training_state` 当前已落地字段子集是 `level / exp / exp_to_next`
- `player_persistent_buff_state` 当前已落地字段子集是 `buff_id / source_skill_id / source_caster_id / realm_lv / remaining_ticks / duration / stacks / max_stacks / sustain_ticks_elapsed / raw_payload`
- `player_enhancement_record` 当前已落地字段子集是 `record_id / item_id / highest_level / levels_payload / action_started_at / action_ended_at / start_level / initial_target_level / desired_target_level / protection_start_level / status`
- `player_market_storage_item` 当前已落地字段子集是 `storage_item_id / player_id / slot_index / item_id / count / enhance_level / raw_payload / updated_at`；当前由 `MarketPersistenceService` 读写，运行时启动与 restore 后重载都会优先从该表回读
- `WorldPlayerSnapshotService` 已在旧快照 miss 时接入 `PlayerDomainPersistenceService.loadProjectedSnapshot()`；当前可从 `player_world_anchor / player_position_checkpoint / player_vitals / player_progression_core / player_attr_state / player_body_training_state / player_inventory_item / player_map_unlock / player_equipment_slot / player_technique_state / player_persistent_buff_state / player_quest_progress / player_combat_preferences / player_auto_battle_skill / player_auto_use_item_rule / player_profession_state / player_alchemy_preset / player_active_job / player_enhancement_record / player_logbook_message / player_recovery_watermark` 这一组已落地投影子集回组装玩家快照
- `PlayerDomainPersistenceService` 当前已对上述已落地投影子集补齐单域直写接口；除 `player_wallet / player_market_storage_item` 外，玩家域主线可以不经整档快照、直接按单域事务 upsert 并推进对应 recovery watermark
- 当前这条分域恢复读链对外仍保持 `source=next`，并通过 `fallbackReason+=player_domain_projection` 标记来源；`player_presence` 单独存在时不会触发恢复
- `player_active_job` 已采用统一作业表口径，不再继续按“炼丹作业表 / 强化作业表”分成两张当前作业表
- 当前 `player_active_job` 投影已开始保留 `job_run_id / job_version`，不会在同一作业的普通快照投影里反复重置作业实例身份
- `import-legacy-persistence-once --domains=player-domain` 已落地，当前迁移目标与上面的已落地投影子集一致，不包含 `player_presence`
- 当前 GM backup payload 已显式带出 `player_market_storage_item`，`gm-database-smoke` 也已经补上 restore 后的值级回滚断言，并已在 2026-04-23 的完整 destructive smoke 与 `verify:proof:with-db` 中再次通过

当前尚未等价落地的部分：

- 本文中的多数玩家分域表仍处于终局设计态，不应解读为 `next` 已经全部建表完成
- 文末的 `player_checkpoint` 仍是设计占位；当前实现落点以 `player_world_anchor + player_position_checkpoint + player_recovery_watermark` 为主

## 2. 输入基线

本文的输入不是想象出来的字段，而是参考主线 `/home/yuohira/mud-mmo` 当前真实参与“玩家下次还在”的数据面：

- `players`
- `player_collections`
- `player_settings`
- `player_presence`
- `users.displayName`
- `players.pendingLogbookMessages`

完整字段清单见 [参考main分支真实玩家存档盘点.md](./参考main分支真实玩家存档盘点.md)。

## 3. 分表目标

### 3.1 要解决的问题

- 不能再把大量互不相关的数据卷在一行大 JSON 或宽表里
- 不能因为一个小字段变化就整档重写
- 不能让玩家移动、战斗、挂机、炼丹、强化、自动战斗设置共用同一条刷盘链
- 不能让恢复流程依赖“把所有最新字段拼一起”这种不一致读法
- 不能继续保留 `enhancementRecords` 这种历史兼容脏边界

### 3.2 分表后的目标状态

- 角色身份、在线会话、世界锚点、当前位置 checkpoint、成长、属性、资产、职业、设置、日志消息各有自己的真源表
- 高频小改动只写对应子域
- 资产类操作进入强持久化事务链
- 恢复时按域加载，再由聚合水位确保时间截面一致
- 参考主线里所有真实在线字段都能找到归属表，不留“暂时先放 raw JSON 以后再说”的结构性缺口

## 4. 总体拆分原则

### 4.1 先按拥有者拆

- 账号拥有：`users.displayName`
- 角色拥有：本文所有 `player_*` 表
- 邮件拥有：未领取附件仍属于邮件域，不进入玩家物品表

### 4.2 再按一致性等级拆

- 强持久化资产域
  - 钱包
  - 背包
  - 市场仓
  - 装备
- 最终一致业务域
  - 生命资源
  - 进度计数
  - 功法
  - buff
  - 任务
  - 自动战斗设置
  - 炼丹/强化长作业
- 小事务即时写域
  - `player_presence`
  - `player_world_anchor`
  - `player_position_checkpoint`
  - `player_map_unlock`
  - `player_logbook_message`

### 4.3 不能原样照搬的旧字段

- `viewRange`
  - 改为运行时派生，不入正式真源表
- `realmLv / realmName / realmStage`
  - 改为运行时派生，不入正式真源表
- `enhancementRecords`
  - 拆成真正的强化记录表和职业状态表
- `x / y / facing`
  - 不再代表“每一步正式真源”
  - 只保留为 checkpoint 或迁移落点

## 5. 分表总览

| 分组 | 目标表 |
| --- | --- |
| 身份与会话 | `player_identity` `player_presence` |
| 世界落点与恢复 | `player_world_anchor` `player_position_checkpoint` |
| 生存与成长 | `player_vitals` `player_progression_core` `player_attr_state` |
| 资产与装备 | `player_wallet` `player_inventory_item` `player_market_storage_item` `player_equipment_slot` |
| 功法与养成 | `player_technique_state` `player_body_training_state` `player_persistent_buff_state` |
| 任务与地图 | `player_quest_progress` `player_map_unlock` |
| 战斗偏好与自动化 | `player_combat_preferences` `player_auto_battle_skill` `player_auto_use_item_rule` |
| 职业与长作业 | `player_profession_state` `player_alchemy_preset` `player_active_job` `player_enhancement_record` |
| 消息与恢复水位 | `player_logbook_message` `player_recovery_watermark` `player_checkpoint` |

## 6. 按表展开

### 6.1 `player_identity`

用途：

- 角色基础身份真源
- 角色主键入口

主键与约束：

- 主键：`player_id`
- 唯一：`user_id + role_name`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | `players.id` |
| `user_id` | 账号主键 | `players.userId` |
| `role_name` | 角色名 | `players.name` |
| `created_at` | 创建时间 | 新增 |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 创角
- 改名
- 迁移导入

不应存：

- 显示名 `displayName`
- 在线状态
- 位置
- 属性与资产

### 6.2 `player_presence`

用途：

- 角色在线与连接所有权真源
- 顶号、重连、旧连接失效的 fencing 入口

主键与约束：

- 主键：`player_id`
- 索引：`runtime_owner_id`、`last_heartbeat_at`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | `player_presence` |
| `online` | 是否在线 | `player_presence.online` |
| `in_world` | 是否已入世界 | `player_presence.inWorld` |
| `last_heartbeat_at` | 最近心跳 | `player_presence.lastHeartbeatAt` |
| `offline_since_at` | 离线起点 | `player_presence.offlineSinceAt` |
| `runtime_owner_id` | 当前运行时所有者节点 | 新增 |
| `session_epoch` | 角色会话 epoch | 新增 |
| `transfer_state` | 是否处于跨节点转移中 | 新增 |
| `transfer_target_node_id` | 转移目标节点 | 新增 |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 登录成功
- 断线
- 顶号
- 心跳节流更新
- 节点接管

不应存：

- 玩家资产
- 地图真实落点

### 6.3 `player_world_anchor`

用途：

- 角色长期恢复锚点真源
- 跨实例迁移后的正式落点
- 死亡回点与安全点真源

主键与约束：

- 主键：`player_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | 新拆分 |
| `respawn_template_id` | 重生模板图 | `players.respawnMapId` |
| `respawn_instance_id` | 重生实例 | 新增 |
| `respawn_x` | 重生点 x | `players.x` 的重生语义 |
| `respawn_y` | 重生点 y | `players.y` 的重生语义 |
| `last_safe_template_id` | 最近安全模板图 | `players.mapId` 的长期语义 |
| `last_safe_instance_id` | 最近安全实例 | 新增 |
| `last_safe_x` | 最近安全点 x | 旧坐标长期语义 |
| `last_safe_y` | 最近安全点 y | 旧坐标长期语义 |
| `last_transfer_at` | 最近正式迁移时间 | 新增 |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 跨图迁移成功
- 死亡回点
- GM 传送确认成功
- 洞府/宗门锚点更新

不应存：

- 每一步移动坐标

### 6.4 `player_position_checkpoint`

用途：

- 角色实例内恢复点
- 登出、停服、fallback 恢复点

主键与约束：

- 主键：`player_id`
- 索引：`instance_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | 新拆分 |
| `instance_id` | 当前实例 | 旧 `mapId` 实例化后语义 |
| `x` | checkpoint x | `players.x` |
| `y` | checkpoint y | `players.y` |
| `facing` | 朝向 | `players.facing` |
| `checkpoint_kind` | `logout` `transfer` `gm` `fallback` `shutdown` | 新增 |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 登出
- 跨图完成
- GM 传送
- 停服
- 强制 fallback

不应存：

- 高频移动过程

### 6.5 `player_vitals`

用途：

- 生存态真源

主键与约束：

- 主键：`player_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | 新拆分 |
| `hp` | 当前生命 | `players.hp` |
| `max_hp` | 当前最大生命 | `players.maxHp` |
| `qi` | 当前气 | `players.qi` |
| `max_qi` | 当前最大气 | 当前 next 快照真实字段 `maxQi` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 战斗结束合批
- 死亡/复活
- 下线前刷盘

### 6.6 `player_progression_core`

用途：

- 成长进度、击杀计数、寿元时钟核心真源

主键与约束：

- 主键：`player_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | 新拆分 |
| `foundation` | 修为基础值 | `players.foundation` |
| `combat_exp` | 战斗经验 | `players.combatExp` |
| `bone_age_base_years` | 骨龄基线 | `players.boneAgeBaseYears` |
| `life_elapsed_ticks` | 已流逝寿元 ticks | `players.lifeElapsedTicks` |
| `lifespan_years` | 寿元上限年数 | `players.lifespanYears` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 战斗结算
- 境界成长
- 寿元流逝批刷
- 任务推进影响跨图冷却

当前 next 已落地说明：

- 这张表当前只承接 `foundation / combat_exp / bone_age_base_years / life_elapsed_ticks / lifespan_years`
- `player_kill_count / monster_kill_count / elite_kill_count / boss_kill_count / death_count / quest_cross_map_nav_cooldown_until_life_ticks` 仍属于后续补齐项，不能假定 next 当前快照已经稳定提供

### 6.7 `player_attr_state`

用途：

- 基础属性与突破要求揭示状态真源

主键与约束：

- 主键：`player_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | 新拆分 |
| `base_attrs_payload` | 基础属性 | `players.baseAttrs` |
| `bonus_entries_payload` | 属性加成项 | `players.bonuses` |
| `revealed_breakthrough_requirement_ids` | 已揭示突破条件 | `players.revealedBreakthroughRequirementIds` |
| `heaven_gate_payload` | 天门状态 | `players.heavenGate` |
| `spiritual_roots_payload` | 灵根状态 | `players.spiritualRoots` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 突破
- 属性培养
- 任务或玩法解锁新突破要求

不应存：

- 最终派生面板属性

当前 next 已落地说明：

- 这张表当前已经落地，并进入分域投影恢复链
- 当前 GM backup payload 已显式带出这张表，`gm-database-smoke` 也已经补上 restore 后的值级回滚断言，并已在 2026-04-23 的完整 destructive smoke 中再次通过

### 6.8 `player_wallet`

用途：

- 货币类资产真源

主键与约束：

- 主键：`player_id + wallet_type`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | 新拆分 |
| `wallet_type` | 钱包类型，如 `spirit_stone` | 从旧资产语义拆出 |
| `balance` | 可用余额 | 新增 |
| `frozen_balance` | 冻结金额 | 新增 |
| `version` | 幂等/并发版本 | 新增 |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 消耗货币
- 奖励货币
- 市场挂单冻结/解冻
- 炼丹/强化扣费

要求：

- 必须进入强持久化事务

### 6.9 `player_inventory_item`

用途：

- 背包物品真源

主键与约束：

- 主键：`item_instance_id`
- 唯一：`player_id + slot_index`
- 索引：`player_id + item_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `item_instance_id` | 物品实例主键 | 新增 |
| `player_id` | 所属角色 | `inventory.items[]` |
| `slot_index` | 槽位 | `inventory.items[]` 顺序语义 |
| `item_id` | 物品模板 id | `itemId` |
| `count` | 堆叠数量 | `count` |
| `enhance_level` | 强化等级 | `enhanceLevel?` |
| `bind_state` | 绑定态 | 新增 |
| `raw_payload` | 兼容未知字段 | 未知物品完整 `ItemStack` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 拾取
- 消耗
- 奖励
- 拆分/合并
- 使用强化产出
- 邮件领取入包

要求：

- 必须进入强持久化事务

不应存：

- 未领取邮件附件

### 6.10 `player_market_storage_item`

当前 next 已落地说明：

- 当前 next 已落地该表，真实表名即 `player_market_storage_item`
- 当前由 `MarketPersistenceService` 读写，运行时启动与 restore 后重载会优先从该表回读，`server_market_storage_v1` 只保留兼容镜像
- 当前 GM backup payload 已显式带出这张表，`gm-database-smoke` 也已经补上 restore 后的值级回滚断言，并已在 2026-04-23 的完整 destructive smoke 中再次通过
- `persistence-smoke` 已补成直接 proof：会先删除 compat 文档，再证明 `player_market_storage_item` 在服务重启后仍能被运行时真实回读并领取

用途：

- 市场托管仓真源

主键与约束：

- 主键：`storage_item_id`
- 唯一：`player_id + slot_index`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `storage_item_id` | 仓物品主键 | 新增 |
| `player_id` | 所属角色 | `marketStorage.items[]` |
| `slot_index` | 仓槽位 | `marketStorage.items[]` 顺序语义 |
| `item_id` | 物品模板 id | `itemId` |
| `count` | 数量 | `count` |
| `enhance_level` | 强化等级 | `enhanceLevel?` |
| `raw_payload` | 兼容未知字段 | 未知 `ItemStack` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 上架前转入
- 下架返还
- 交易取消
- 市场交割

要求：

- 必须进入强持久化事务

### 6.11 `player_equipment_slot`

用途：

- 装备栏真源

主键与约束：

- 主键：`player_id + slot_type`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | `equipment.*` |
| `slot_type` | `weapon` `head` `body` `legs` `accessory` | 槽位类型 |
| `item_instance_id` | 装备物品实例 | 从装备物品实例化 |
| `raw_payload` | 兼容未知装备结构 | 未知 `ItemStack` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 穿戴
- 卸下
- 装备强化结果落地

要求：

- 必须进入强持久化事务

### 6.12 `player_technique_state`

用途：

- 功法成长真源

主键与约束：

- 主键：`player_id + tech_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | `techniques[]` |
| `tech_id` | 功法 id | `techId` |
| `level` | 等级 | `level` |
| `exp` | 当前经验 | `exp` |
| `exp_to_next` | 到下一阶经验 | `expToNext` |
| `realm_lv` | 当前境界层级快照 | `realmLv` |
| `skills_enabled` | 已启用技能列表 | `skillsEnabled?` |
| `raw_payload` | 兼容未知结构 | 完整 `TechniqueState` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 修炼
- 切换功法配置
- 功法升级

当前 next 已落地说明：

- 这张表当前已经按 `level / exp / exp_to_next / realm_lv / skills_enabled / raw_payload` 落地，并进入分域投影恢复链

### 6.13 `player_body_training_state`

用途：

- 炼体成长真源

主键与约束：

- 主键：`player_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | `bodyTraining` |
| `level` | 炼体等级 | `level` |
| `exp` | 炼体经验 | `exp` |
| `exp_to_next` | 下一阶经验 | `expToNext` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 炼体推进
- 炼体升级

当前 next 已落地说明：

- 这张表当前已经按 `level / exp / exp_to_next` 落地，并进入分域投影恢复链

### 6.14 `player_persistent_buff_state`

用途：

- 只保存跨重启仍要保留的 buff

主键与约束：

- 主键：`player_id + buff_id + source_skill_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | `temporaryBuffs[]` |
| `buff_id` | buff id | `buffId` |
| `source_skill_id` | 来源技能 | `sourceSkillId` |
| `source_caster_id` | 来源施放者 | `sourceCasterId?` |
| `realm_lv` | 当时境界 | `realmLv` |
| `remaining_ticks` | 剩余 ticks | `remainingTicks` |
| `duration` | 总持续时长 | `duration` |
| `stacks` | 当前层数 | `stacks` |
| `max_stacks` | 最大层数 | `maxStacks` |
| `sustain_ticks_elapsed` | 持续行为进度 | `sustainTicksElapsed?` |
| `raw_payload` | 未知结构回退 | 完整 `TemporaryBuffState` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- Buff 获得
- Buff 层数变化
- 下线前
- 需要跨重启保存的持续行为推进

不应存：

- 明确允许重启丢弃的临时战斗态 buff

当前 next 已落地说明：

- 这张表当前已经落地，并进入分域投影恢复链
- 当前 GM backup payload 已显式带出这张表，`gm-database-smoke` 也已经补上 restore 后的值级回滚断言，并已在 2026-04-23 的完整 destructive smoke 中再次通过

### 6.15 `player_quest_progress`

用途：

- 任务进度真源

主键与约束：

- 主键：`player_id + quest_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | `quests[]` |
| `quest_id` | 任务 id | `id` |
| `status` | 任务状态 | `status` |
| `progress_payload` | 进度 payload | `progress` |
| `raw_payload` | 完整回退 | 完整 `QuestState` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 接任务
- 推进
- 完成
- 放弃

当前 next 已落地说明：

- 这张表当前已经按 `status / progress_payload / raw_payload` 落地，并进入分域投影恢复链

### 6.16 `player_map_unlock`

用途：

- 已解锁地图或小地图真源

主键与约束：

- 主键：`player_id + map_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | `unlockedMinimapIds[]` |
| `map_id` | 地图 id | 解锁项 |
| `unlocked_at` | 解锁时间 | 新增 |

写入时机：

- 地图首次解锁

### 6.17 `player_combat_preferences`

用途：

- 自动战斗总开关、索敌规则、挂机偏好真源

主键与约束：

- 主键：`player_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | 新拆分 |
| `auto_battle` | 自动战斗开关 | `autoBattle` |
| `auto_retaliate` | 自动反击开关 | `autoRetaliate` |
| `auto_battle_stationary` | 原地自动战斗 | `autoBattleStationary` |
| `auto_battle_targeting_mode` | 目标模式 | `autoBattleTargetingMode` |
| `retaliate_player_target_id` | 反击玩家目标 | `retaliatePlayerTargetId` |
| `combat_target_locked` | 是否锁定目标 | `combatTargetLocked` |
| `combat_target_id` | 当前锁定目标 | `combatTargetId` |
| `allow_aoe_player_hit` | 是否允许 AOE 伤人 | `allowAoePlayerHit` |
| `auto_idle_cultivation` | 自动挂机修炼 | `autoIdleCultivation` |
| `auto_switch_cultivation` | 自动切换修炼 | `autoSwitchCultivation` |
| `sense_qi_active` | 灵气感知开关 | `senseQiActive` |
| `cultivating_tech_id` | 当前修炼功法 | `cultivatingTechId` |
| `targeting_rules_payload` | 敌我索敌规则 | `combatTargetingRules` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 设置变更
- 目标锁定策略变更

当前 next 已落地说明：

- 这张表当前已经按 `auto_battle / auto_retaliate / auto_battle_stationary / auto_battle_targeting_mode / retaliate_player_target_id / combat_target_id / combat_target_locked / allow_aoe_player_hit / auto_idle_cultivation / auto_switch_cultivation / sense_qi_active / cultivating_tech_id / targeting_rules_payload` 落地，并进入分域投影恢复链

### 6.18 `player_auto_battle_skill`

用途：

- 自动战斗技能白名单/黑名单真源

主键与约束：

- 主键：`player_id + skill_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | `autoBattleSkills[]` |
| `skill_id` | 技能 id | `skillId` |
| `enabled` | 条目启用 | `enabled` |
| `skill_enabled` | 技能自身启用 | `skillEnabled?` |
| `auto_battle_order` | 自动战斗排序 | `autoBattleOrder?` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 自动战斗技能配置变更

当前 next 已落地说明：

- 这张表当前已经按 `enabled / skill_enabled / auto_battle_order` 落地，并进入分域投影恢复链

### 6.19 `player_auto_use_item_rule`

用途：

- 自动用药/自动道具规则真源

主键与约束：

- 主键：`player_id + item_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | `autoUsePills[]` |
| `item_id` | 物品 id | `itemId` |
| `condition_payload` | 触发条件 | `conditions[]` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 自动用药规则变更

当前 next 已落地说明：

- 这张表当前已经按 `condition_payload` 落地，并进入分域投影恢复链

### 6.20 `player_profession_state`

用途：

- 炼丹、采集、强化技艺这类职业成长真源

主键与约束：

- 主键：`player_id + profession_type`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | 新拆分 |
| `profession_type` | `alchemy` `gather` `enhancement` | `alchemySkill` `gatherSkill` `enhancementSkillLevel` |
| `level` | 技艺等级 | 各职业等级 |
| `exp` | 当前经验 | `alchemySkill.exp` `gatherSkill.exp` |
| `exp_to_next` | 下一阶经验 | `alchemySkill.expToNext` `gatherSkill.expToNext` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 职业经验变化
- 职业升级

说明：

- 旧 `enhancementSkillLevel` 只提供等级，没有经验字段时允许 `exp / exp_to_next` 为空

### 6.21 `player_alchemy_preset`

用途：

- 炼丹预设真源

主键与约束：

- 主键：`preset_id`
- 索引：`player_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `preset_id` | 预设主键 | `presetId` |
| `player_id` | 角色主键 | `alchemyPresets[]` |
| `recipe_id` | 配方 id | `recipeId` |
| `name` | 预设名 | `name` |
| `ingredients_payload` | 原料清单 | `ingredients[]` |
| `updated_at` | 最后更新时间 | `updatedAt` |

写入时机：

- 新建预设
- 修改预设
- 删除预设

### 6.22 `player_active_job`

用途：

- 当前活跃技艺作业真源
- 同一玩家同一时刻只保留 1 个活跃 job

主键与约束：

- 主键：`player_id`
- 唯一：`job_run_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | `alchemyJob` / `enhancementJob` |
| `job_run_id` | 本次作业实例 id | 新增 |
| `job_type` | `alchemy` / `enhancement` | 新增 |
| `status` | `running` / `paused` / `completed` / `cancelled` / `failed` | 综合状态 |
| `phase` | 当前阶段 | `phase` |
| `started_at` | 开始时间 | `startedAt` |
| `finished_at` | 结束时间 | 新增 |
| `paused_ticks` | 暂停累计 ticks | `pausedTicks` |
| `total_ticks` | 总 ticks | `totalTicks` |
| `remaining_ticks` | 剩余 ticks | `remainingTicks` |
| `success_rate` | 成功率 | `successRate` |
| `speed_rate` | 总速度倍率 | `totalSpeedRate` / 运行时换算值 |
| `job_version` | 当前作业状态版本 | 新增 |
| `detail_jsonb` | 作业差异明细 | `alchemyJob` / `enhancementJob` 差异字段 |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 开始作业
- 暂停/继续
- 每轮推进
- 取消
- 结束

说明：

- `job_run_id` 每次开新作业都必须刷新，旧 job 的延迟完成/重试包必须因 `job_run_id` 不匹配而失败
- `job_version` 在同一 `job_run_id` 内单调递增，所有推进/取消/完成都按 `player_id + job_run_id + job_version` 做 CAS
- `detail_jsonb` 仅存差异字段：
  - 炼丹：`recipe_id`、`output_item_id`、`output_count`、`quantity`、`completed_count`、`success_count`、`failure_count`、`ingredients_payload`、`preparation_ticks`、`batch_brew_ticks`、`current_batch_remaining_ticks`、`spirit_stone_cost`、`exact_recipe`
  - 强化：`target_payload`、`item_payload`、`target_item_id`、`target_item_name`、`target_item_level`、`current_level`、`target_level`、`desired_target_level`、`spirit_stone_cost`、`materials_payload`、`protection_used`、`protection_start_level`、`protection_item_id`、`protection_item_name`、`protection_item_signature`、`role_enhancement_level`

### 6.23 `player_enhancement_record`

用途：

- 强化历史记录真源
- 替代脏兼容字段 `enhancementRecords`

主键与约束：

- 主键：`record_id`
- 索引：`player_id + item_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `record_id` | 记录主键 | 新增 |
| `player_id` | 角色主键 | 真正的 `PlayerEnhancementRecord[]` |
| `item_id` | 物品 id | 同上 |
| `highest_level` | 历史最高等级 | 同上 |
| `levels_payload` | 各等级记录 | 同上 |
| `action_started_at` | 本次动作开始 | 同上 |
| `action_ended_at` | 本次动作结束 | 同上 |
| `start_level` | 起始等级 | 同上 |
| `initial_target_level` | 初始目标等级 | 同上 |
| `desired_target_level` | 期望等级 | 同上 |
| `protection_start_level` | 保护起点 | 同上 |
| `status` | 记录状态 | 同上 |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 强化结果结算
- 强化作业结束

要求：

- 禁止继续沿用旧列名 `enhancementRecords`

当前 next 已落地说明：

- 这张表当前已经落地，并进入分域投影恢复链
- 当前 GM backup payload 已显式带出这张表，`gm-database-smoke` 也已经补上 restore 后的值级回滚断言，并已在 2026-04-23 的完整 destructive smoke 中再次通过

### 6.24 `player_logbook_message`

用途：

- 待展示日志消息真源

主键与约束：

- 主键：`message_id`
- 索引：`player_id + occurred_at`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `message_id` | 消息主键 | `pendingLogbookMessages[].id` |
| `player_id` | 角色主键 | 日志所属角色 |
| `kind` | 消息类型 | `kind` |
| `text` | 消息正文 | `text` |
| `from_name` | 来源名 | `from?` |
| `occurred_at` | 发生时间 | `at` |
| `acked_at` | 已读/确认时间 | 新增 |

写入时机：

- append 新消息
- 玩家确认已读

### 6.25 `player_recovery_watermark`

用途：

- 聚合恢复版本真源
- 防止恢复时拼出跨域错位时间截面

主键与约束：

- 主键：`player_id`

字段：

| 字段 | 含义 |
| --- | --- |
| `player_id` | 角色主键 |
| `identity_version` | 身份域版本 |
| `presence_version` | 在线域版本 |
| `anchor_version` | 锚点域版本 |
| `position_checkpoint_version` | 位置 checkpoint 版本 |
| `vitals_version` | 生存态版本 |
| `progression_version` | 成长版本 |
| `attr_version` | 属性版本 |
| `wallet_version` | 钱包版本 |
| `inventory_version` | 背包版本 |
| `market_storage_version` | 市场仓版本 |
| `equipment_version` | 装备版本 |
| `technique_version` | 功法版本 |
| `body_training_version` | 炼体版本 |
| `buff_version` | buff 版本 |
| `quest_version` | 任务版本 |
| `map_unlock_version` | 地图解锁版本 |
| `combat_pref_version` | 战斗偏好版本 |
| `auto_battle_skill_version` | 自动战斗技能版本 |
| `auto_use_item_rule_version` | 自动用药规则版本 |
| `profession_version` | 职业成长版本 |
| `alchemy_preset_version` | 炼丹预设版本 |
| `active_job_version` | 当前活跃作业版本 |
| `enhancement_record_version` | 强化记录版本 |
| `logbook_version` | 日志消息版本 |
| `mail_version` | 邮件主表版本 |
| `mail_counter_version` | 邮件计数聚合版本 |
| `updated_at` | 最后更新时间 |

写入时机：

- 每个正式提交域在事务内推进自己的版本

### 6.26 `player_checkpoint`

用途：

- 玩家低频聚合快照
- 冷启动与备份恢复加速

主键与约束：

- 主键：`player_id + checkpoint_version`

字段：

| 字段 | 含义 |
| --- | --- |
| `player_id` | 角色主键 |
| `checkpoint_version` | 快照版本 |
| `payload` | 聚合快照 |
| `generated_at` | 生成时间 |

写入时机：

- 定时生成
- 停服前
- 大版本迁移前

限制：

- 只做恢复加速
- 不作为正式真源

## 7. 迁移关系

### 7.1 旧表到新表的映射

| 旧真源 | 新归属 |
| --- | --- |
| `players.id userId name` | `player_identity` |
| `players.online inWorld lastHeartbeatAt offlineSinceAt` + `player_presence` | `player_presence` |
| `players.mapId respawnMapId x y facing` | `player_world_anchor` + `player_position_checkpoint` |
| `players.hp maxHp qi dead` | `player_vitals` |
| `players.foundation combatExp killCount deathCount lifeElapsedTicks lifespanYears` | `player_progression_core` |
| `players.baseAttrs bonuses heavenGate spiritualRoots revealedBreakthroughRequirementIds` | `player_attr_state` |
| `player_collections.inventory` | `player_inventory_item` |
| `player_collections.marketStorage` | `player_market_storage_item` |
| `player_collections.equipment` | `player_equipment_slot` |
| `player_collections.techniques` | `player_technique_state` |
| `player_collections.bodyTraining` | `player_body_training_state` |
| `player_collections.temporaryBuffs` | `player_persistent_buff_state` |
| `player_collections.quests` | `player_quest_progress` |
| `player_settings.unlockedMinimapIds` | `player_map_unlock` |
| `player_settings.autoBattle* combatTarget* autoRetaliate ...` | `player_combat_preferences` + `player_auto_battle_skill` + `player_auto_use_item_rule` |
| `player_settings.alchemySkill gatherSkill enhancementSkillLevel` | `player_profession_state` |
| `player_settings.alchemyPresets` | `player_alchemy_preset` |
| `player_settings.alchemyJob` + `player_settings.enhancementJob` | `player_active_job` |
| `player_settings.enhancementRecords` | `player_enhancement_record` |
| `players.pendingLogbookMessages` | `player_logbook_message` |
| `users.displayName` | 继续留在账号域 |

### 7.2 迁移顺序

建议顺序：

1. 先建新表，只读旧表
2. 做一次性 backfill
3. 进入双写
4. 新读链切到新表
5. 观察稳定后，把旧宽字段降级成兼容镜像
6. 最后删除旧镜像字段

### 7.3 迁移阶段禁止事项

- 禁止直接把 `players` 宽表删掉后再临时补洞
- 禁止边迁移边改玩家语义
- 禁止把 `enhancementRecords` 原样复制进新系统
- 禁止继续把 checkpoint 坐标当高频热写真源

## 8. 写入策略

### 8.1 强持久化事务域

以下表必须进入同一类强持久化事务链：

- `player_wallet`
- `player_inventory_item`
- `player_market_storage_item`
- `player_equipment_slot`
- `player_active_job`（仅限创建/取消/完成或伴随资产结算的场景）
- `player_enhancement_record`（强化结算时）
- 必要时联动 `player_world_anchor`
- 必要时联动 `player_position_checkpoint`
- 提交前必须校验 `player_presence.runtime_owner_id + session_epoch`
- 同事务推进 `player_recovery_watermark`

补充：

- 后续接入 `player_mail / player_mail_counter` 后，邮件领取也进入同类强持久化事务链

### 8.2 最终一致 flush 域

以下表可以走分域 dirty flush：

- `player_vitals`
- `player_progression_core`
- `player_attr_state`
- `player_technique_state`
- `player_body_training_state`
- `player_persistent_buff_state`
- `player_quest_progress`
- `player_combat_preferences`
- `player_auto_battle_skill`
- `player_auto_use_item_rule`
- `player_profession_state`
- `player_active_job`（仅限运行中进度字段）

### 8.3 小事务即时写域

- `player_presence`
- `player_world_anchor`
- `player_position_checkpoint`
- `player_map_unlock`
- `player_alchemy_preset`
- `player_logbook_message`

## 9. 恢复顺序

以下顺序是终局推荐顺序；当前 next 实际已接入的分域恢复链，以本文第 1.1 节列出的“当前已落地投影子集”为准，不应把这里直接解读成“全部已经上线可恢复”。

推荐顺序：

1. `player_identity`
2. 账号域 `users.displayName`
3. `player_presence`
4. `player_world_anchor`
5. `player_position_checkpoint`
6. `player_vitals`
7. `player_progression_core`
8. `player_attr_state`
9. `player_wallet`
10. `player_inventory_item`
11. `player_market_storage_item`
12. `player_equipment_slot`
13. `player_technique_state`
14. `player_body_training_state`
15. `player_persistent_buff_state`
16. `player_quest_progress`
17. `player_map_unlock`
18. `player_combat_preferences`
19. `player_auto_battle_skill`
20. `player_auto_use_item_rule`
21. `player_profession_state`
22. `player_alchemy_preset`
23. `player_active_job`
24. `player_enhancement_record`
25. `player_logbook_message`
26. 按 `player_recovery_watermark` 校验版本一致
27. 必要时用 `player_checkpoint` 做加速或 fallback

## 10. 最终结论

基于参考 `main` 主线的真实玩家数据面，玩家域不能只粗糙地拆成“主档 / 背包 / 设置 / 任务”四五块，而必须至少拆成本文这 26 张表对应的职责边界。

其中真正的核心不是“表变多了”，而是三件事：

- 每个真实在线字段都找到了明确归属
- 资产域、位置恢复域、职业长作业域、自动化配置域不再共用同一条刷盘链
- 恢复链和版本水位已经能支撑商业级 MMO 的一致性要求

这份文档是玩家域分表的直接施工蓝图；再往上的实例、地图、地面物品、怪物、邮件、市场等系统，继续以 [mmo商业级数据落盘方案.md](./mmo商业级数据落盘方案.md) 为总入口。

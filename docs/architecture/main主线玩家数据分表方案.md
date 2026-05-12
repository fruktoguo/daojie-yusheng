# main 主线玩家数据分表方案

## 1. 文档定位

本文回答：基于 `main` 主线当前真实在线玩家数据面，玩家域具体拆成哪些表。

相关文档：
- [mmo商业级数据落盘方案.md](./mmo商业级数据落盘方案.md) — 整体持久化终局方案
- [持久化设计.md](./持久化设计.md) — 调度、真源边界、刷盘域拆分

### 当前 next 实现状态（2026-04-23）

以下表已落地并进入分域投影恢复链：

player_identity / player_presence / player_world_anchor / player_position_checkpoint / player_vitals / player_progression_core / player_attr_state / player_body_training_state / player_inventory_item / player_map_unlock / player_equipment_slot / player_technique_state / player_persistent_buff_state / player_quest_progress / player_combat_preferences / player_auto_battle_skill / player_auto_use_item_rule / player_profession_state / player_alchemy_preset / player_active_job / player_enhancement_record / player_logbook_message / player_recovery_watermark / player_market_storage_item

`PlayerDomainPersistenceService` 已对上述子集补齐单域直写接口，玩家恢复从分域装配，不再读旧整档快照。

## 2. 分表总览

| 分组 | 目标表 |
|------|--------|
| 身份与会话 | `player_identity` `player_presence` |
| 世界落点与恢复 | `player_world_anchor` `player_position_checkpoint` |
| 生存与成长 | `player_vitals` `player_progression_core` `player_attr_state` |
| 资产与装备 | `player_wallet` `player_inventory_item` `player_market_storage_item` `player_equipment_slot` |
| 功法与养成 | `player_technique_state` `player_body_training_state` `player_persistent_buff_state` |
| 任务与地图 | `player_quest_progress` `player_map_unlock` |
| 战斗偏好与自动化 | `player_combat_preferences` `player_auto_battle_skill` `player_auto_use_item_rule` |
| 职业与长作业 | `player_profession_state` `player_alchemy_preset` `player_active_job` `player_enhancement_record` |
| 消息与恢复水位 | `player_logbook_message` `player_recovery_watermark` `player_checkpoint` |

## 3. 拆分原则

- 按拥有者拆：账号域 / 角色域 / 邮件域
- 按一致性等级拆：强持久化资产域 / 最终一致业务域 / 小事务即时写域
- `viewRange`、`realmLv`、`realmName`、`realmStage` 作为运行时派生，不建真源列
- `enhancementRecords` 旧列名禁止沿用，拆成 `player_enhancement_record`
- 每步移动坐标不是正式真源，只保留 checkpoint

## 4. 写入策略分类

### 强持久化事务域（durable operation）

player_wallet / player_inventory_item / player_market_storage_item / player_equipment_slot / player_active_job（创建/取消/完成） / player_enhancement_record（结算时）

要求：提交前校验 `player_presence.runtime_owner_id + session_epoch`，同事务推进 `player_recovery_watermark`。

### 最终一致 flush 域

player_vitals / player_progression_core / player_attr_state / player_technique_state / player_body_training_state / player_persistent_buff_state / player_quest_progress / player_combat_preferences / player_auto_battle_skill / player_auto_use_item_rule / player_profession_state / player_active_job（运行中进度）

### 小事务即时写域

player_presence / player_world_anchor / player_position_checkpoint / player_map_unlock / player_alchemy_preset / player_logbook_message

## 5. 按表展开

### `player_identity`

主键：`player_id`，唯一：`user_id + role_name`

| 字段 | 含义 |
|------|------|
| player_id | 角色主键 |
| user_id | 账号主键 |
| role_name | 角色名 |
| created_at / updated_at | 时间戳 |

写入：创角、改名、迁移导入

### `player_presence`

主键：`player_id`，索引：`runtime_owner_id`、`last_heartbeat_at`

| 字段 | 含义 |
|------|------|
| player_id | 角色主键 |
| online / in_world | 在线状态 |
| last_heartbeat_at / offline_since_at | 心跳与离线时间 |
| runtime_owner_id | 当前运行时所有者节点 |
| session_epoch | 会话 epoch |
| transfer_state / transfer_target_node_id | 跨节点转移 |

写入：登录、断线、顶号、心跳、节点接管

### `player_world_anchor`

主键：`player_id`

| 字段 | 含义 |
|------|------|
| respawn_template_id / respawn_instance_id / respawn_x / respawn_y | 重生点 |
| last_safe_template_id / last_safe_instance_id / last_safe_x / last_safe_y | 最近安全点 |
| last_transfer_at | 最近正式迁移时间 |

写入：跨图迁移、死亡回点、GM 传送、洞府/宗门锚点更新

### `player_position_checkpoint`

主键：`player_id`，索引：`instance_id`

| 字段 | 含义 |
|------|------|
| instance_id | 当前实例 |
| x / y / facing | checkpoint 坐标 |
| checkpoint_kind | logout / transfer / gm / fallback / shutdown |

写入：登出、跨图、GM 传送、停服。不按每步移动刷库。

### `player_vitals`

主键：`player_id`

| 字段 | 含义 |
|------|------|
| hp / max_hp / qi / max_qi | 生存态 |

写入：战斗结束合批、死亡/复活、下线前刷盘

### `player_progression_core`

主键：`player_id`

| 字段 | 含义 |
|------|------|
| foundation | 根基 |
| combat_exp | 战斗经验 |
| bone_age_base_years | 骨龄 |
| life_elapsed_ticks / lifespan_years | 寿元时钟 |
| kill_count / death_count | 击杀/死亡计数 |
| cross_map_nav_cooldown_until_life_ticks | 跨图导航冷却 |

写入：战斗结算、修炼推进、死亡/复活

### `player_attr_state`

主键：`player_id`

| 字段 | 含义 |
|------|------|
| base_attrs_payload | 基础属性 |
| bonus_entries_payload | 加成条目 |
| revealed_breakthrough_requirement_ids | 已揭示突破条件 |
| realm_payload | 境界数据 |
| heaven_gate_payload | 天门数据 |
| spiritual_roots_payload | 灵根数据 |

写入：属性变化、突破、灵根变化

### `player_wallet`

主键：`player_id + wallet_type`

| 字段 | 含义 |
|------|------|
| wallet_type | 钱包类型（spirit_stone 等） |
| balance / frozen_balance | 可用/冻结余额 |
| version | 幂等/并发版本 |

写入：消耗/奖励货币、市场冻结/解冻、炼丹/强化扣费。必须走强持久化事务。

### `player_inventory_item`

主键：`item_instance_id`，唯一：`player_id + slot_index`，索引：`player_id + item_id`

| 字段 | 含义 |
|------|------|
| item_instance_id | 物品实例主键 |
| player_id / slot_index | 所属角色与槽位 |
| item_id / count / enhance_level / bind_state | 物品信息 |
| raw_payload | 兼容未知字段 |

写入：拾取、消耗、奖励、拆分/合并、强化、邮件领取。必须走强持久化事务。

### `player_market_storage_item`

主键：`storage_item_id`，唯一：`player_id + slot_index`

| 字段 | 含义 |
|------|------|
| storage_item_id | 仓物品主键 |
| player_id / slot_index | 所属角色与槽位 |
| item_id / count / enhance_level / raw_payload | 物品信息 |

写入：上架转入、下架返还、交易取消、市场交割。必须走强持久化事务。

### `player_equipment_slot`

主键：`player_id + slot_type`

| 字段 | 含义 |
|------|------|
| slot_type | weapon / head / body / legs / accessory |
| item_instance_id / raw_payload | 装备物品实例 |

写入：穿戴、卸下、替换。必须走强持久化事务。

### `player_technique_state`

主键：`player_id + tech_id`

| 字段 | 含义 |
|------|------|
| tech_id | 功法 id |
| level / exp / exp_to_next / realm_lv | 修炼进度 |
| skills_enabled | 技能启用状态 |
| raw_payload | 完整回退 |

写入：修炼推进、升级、技能启用变更

### `player_body_training_state`

主键：`player_id`

| 字段 | 含义 |
|------|------|
| level / exp / exp_to_next | 炼体进度 |

写入：炼体推进、升级

### `player_persistent_buff_state`

主键：`player_id + buff_id`

| 字段 | 含义 |
|------|------|
| buff_id / source_skill_id / source_caster_id | buff 来源 |
| realm_lv / remaining_ticks / duration | 时间信息 |
| stacks / max_stacks / sustain_ticks_elapsed | 层数与持续行为 |
| raw_payload | 完整 TemporaryBuffState |

写入：buff 获得、层数变化、下线前。不存明确允许重启丢弃的临时战斗态 buff。

### `player_quest_progress`

主键：`player_id + quest_id`

| 字段 | 含义 |
|------|------|
| quest_id / status / progress_payload / raw_payload | 任务进度 |

写入：接任务、推进、完成、放弃

### `player_map_unlock`

主键：`player_id + map_id`

| 字段 | 含义 |
|------|------|
| map_id / unlocked_at | 已解锁地图 |

写入：地图首次解锁

### `player_combat_preferences`

主键：`player_id`

| 字段 | 含义 |
|------|------|
| auto_battle / auto_retaliate / auto_battle_stationary | 自动战斗开关 |
| auto_battle_targeting_mode / retaliate_player_target_id | 索敌模式 |
| combat_target_id / combat_target_locked | 目标锁定 |
| allow_aoe_player_hit | AOE 伤人开关 |
| auto_idle_cultivation / auto_switch_cultivation | 挂机修炼 |
| sense_qi_active / cultivating_tech_id | 灵气感知与修炼功法 |
| targeting_rules_payload | 敌我索敌规则 |

写入：设置变更、目标锁定策略变更

### `player_auto_battle_skill`

主键：`player_id + skill_id`

| 字段 | 含义 |
|------|------|
| skill_id / enabled / skill_enabled / auto_battle_order | 自动战斗技能配置 |

写入：自动战斗技能配置变更

### `player_auto_use_item_rule`

主键：`player_id + item_id`

| 字段 | 含义 |
|------|------|
| item_id / condition_payload | 自动用药触发条件 |

写入：自动用药规则变更

### `player_profession_state`

主键：`player_id + profession_type`

| 字段 | 含义 |
|------|------|
| profession_type | alchemy / gather / enhancement |
| level / exp / exp_to_next | 技艺进度 |

写入：职业经验变化、升级

### `player_alchemy_preset`

主键：`preset_id`，索引：`player_id`

| 字段 | 含义 |
|------|------|
| preset_id / player_id | 预设归属 |
| recipe_id / name / ingredients_payload | 配方与原料 |

写入：新建/修改/删除预设

### `player_active_job`

主键：`player_id`，唯一：`job_run_id`

| 字段 | 含义 |
|------|------|
| job_run_id | 本次作业实例 id（每次开新作业刷新） |
| job_type | alchemy / enhancement |
| status | running / paused / completed / cancelled / failed |
| phase / started_at / finished_at | 阶段与时间 |
| paused_ticks / total_ticks / remaining_ticks | tick 进度 |
| success_rate / speed_rate | 成功率与速度 |
| job_version | 状态版本（CAS 用） |
| detail_jsonb | 作业差异明细 |

写入：开始、暂停/继续、每轮推进、取消、结束

CAS 规则：所有推进/取消/完成按 `player_id + job_run_id + job_version` 做 CAS。

### `player_enhancement_record`

主键：`record_id`，索引：`player_id + item_id`

| 字段 | 含义 |
|------|------|
| record_id / player_id / item_id | 记录归属 |
| highest_level / levels_payload | 历史最高与各等级记录 |
| action_started_at / action_ended_at | 动作时间 |
| start_level / initial_target_level / desired_target_level / protection_start_level | 强化参数 |
| status | 记录状态 |

写入：强化结果结算、强化作业结束

### `player_logbook_message`

主键：`message_id`，索引：`player_id + occurred_at`

| 字段 | 含义 |
|------|------|
| message_id / player_id | 消息归属 |
| kind / text / from_name | 消息内容 |
| occurred_at / acked_at | 时间 |

写入：append 新消息、玩家确认已读

### `player_recovery_watermark`

主键：`player_id`

各域版本字段（identity_version / presence_version / anchor_version / ... / mail_counter_version），每个正式提交域在事务内推进自己的版本。

恢复时只组装不高于该水位的已提交域版本，防止跨域错位。

### `player_checkpoint`

主键：`player_id + checkpoint_version`

| 字段 | 含义 |
|------|------|
| checkpoint_version / payload / generated_at | 聚合快照 |

写入：定时生成、停服前、大版本迁移前。只做恢复加速，不作为正式真源。

## 6. 旧表到新表映射

| 旧真源 | 新归属 |
|--------|--------|
| `players.id userId name` | `player_identity` |
| `players.online inWorld lastHeartbeatAt` + `player_presence` | `player_presence` |
| `players.mapId respawnMapId x y facing` | `player_world_anchor` + `player_position_checkpoint` |
| `players.hp maxHp qi dead` | `player_vitals` |
| `players.foundation combatExp killCount deathCount lifeElapsedTicks lifespanYears` | `player_progression_core` |
| `players.baseAttrs bonuses heavenGate spiritualRoots` | `player_attr_state` |
| `player_collections.inventory` | `player_inventory_item` |
| `player_collections.marketStorage` | `player_market_storage_item` |
| `player_collections.equipment` | `player_equipment_slot` |
| `player_collections.techniques` | `player_technique_state` |
| `player_collections.bodyTraining` | `player_body_training_state` |
| `player_collections.temporaryBuffs` | `player_persistent_buff_state` |
| `player_collections.quests` | `player_quest_progress` |
| `player_settings.unlockedMinimapIds` | `player_map_unlock` |
| `player_settings.autoBattle* combatTarget* autoRetaliate ...` | `player_combat_preferences` + `player_auto_battle_skill` + `player_auto_use_item_rule` |
| `player_settings.alchemySkill gatherSkill` | `player_profession_state` |
| `player_settings.alchemyPresets` | `player_alchemy_preset` |
| `player_settings.alchemyJob + enhancementJob` | `player_active_job` |
| `player_settings.enhancementRecords` | `player_enhancement_record` |
| `players.pendingLogbookMessages` | `player_logbook_message` |
| `users.displayName` | 继续留在账号域 |

## 7. 恢复顺序

1. `player_identity` + 账号 displayName
2. `player_presence`
3. `player_world_anchor` + `player_position_checkpoint`
4. `player_vitals` + `player_progression_core` + `player_attr_state`
5. `player_wallet` + `player_inventory_item` + `player_market_storage_item` + `player_equipment_slot`
6. `player_technique_state` + `player_body_training_state` + `player_persistent_buff_state` + `player_quest_progress`
7. `player_map_unlock` + `player_combat_preferences` + `player_auto_battle_skill` + `player_auto_use_item_rule`
8. `player_profession_state` + `player_alchemy_preset` + `player_active_job` + `player_enhancement_record` + `player_logbook_message`
9. 按 `player_recovery_watermark` 校验版本一致
10. 组装运行时，重算派生态

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
| 职业与长作业 | `player_profession_state` `player_alchemy_preset` `player_alchemy_job` `player_enhancement_job` `player_enhancement_record` |
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
| `dead` | 是否死亡 | `players.dead` |
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
| `player_kill_count` | 玩家击杀 | `players.playerKillCount` |
| `monster_kill_count` | 怪物击杀 | `players.monsterKillCount` |
| `elite_kill_count` | 精英击杀 | `players.eliteMonsterKillCount` |
| `boss_kill_count` | Boss 击杀 | `players.bossMonsterKillCount` |
| `death_count` | 死亡次数 | `players.deathCount` |
| `bone_age_base_years` | 骨龄基线 | `players.boneAgeBaseYears` |
| `life_elapsed_ticks` | 已流逝寿元 ticks | `players.lifeElapsedTicks` |
| `lifespan_years` | 寿元上限年数 | `players.lifespanYears` |
| `quest_cross_map_nav_cooldown_until_life_ticks` | 跨图导航冷却 | `players.questCrossMapNavCooldownUntilLifeTicks` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 战斗结算
- 境界成长
- 寿元流逝批刷
- 任务推进影响跨图冷却

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
| `skills_enabled` | 已启用技能列表 | `skillsEnabled?` |
| `raw_payload` | 兼容未知结构 | 完整 `TechniqueState` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 修炼
- 切换功法配置
- 功法升级

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
| `progress` | 进度 payload | `progress` |
| `raw_payload` | 完整回退 | 完整 `QuestState` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 接任务
- 推进
- 完成
- 放弃

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
| `auto_battle_targeting_mode` | 目标模式 | `autoBattleTargetingMode` |
| `combat_target_locked` | 是否锁定目标 | `combatTargetLocked` |
| `combat_target_id` | 当前锁定目标 | `combatTargetId` |
| `auto_retaliate` | 自动反击 | `autoRetaliate` |
| `auto_battle_stationary` | 原地自动战斗 | `autoBattleStationary` |
| `allow_aoe_player_hit` | 是否允许 AOE 伤人 | `allowAoePlayerHit` |
| `auto_idle_cultivation` | 自动挂机修炼 | `autoIdleCultivation` |
| `auto_switch_cultivation` | 自动切换修炼 | `autoSwitchCultivation` |
| `cultivating_tech_id` | 当前修炼功法 | `cultivatingTechId` |
| `targeting_rules_payload` | 敌我索敌规则 | `combatTargetingRules` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 设置变更
- 目标锁定策略变更

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
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 自动战斗技能配置变更

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

### 6.22 `player_alchemy_job`

用途：

- 炼丹长作业真源

主键与约束：

- 主键：`player_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | `alchemyJob` |
| `recipe_id` | 配方 id | `recipeId` |
| `output_item_id` | 产物 id | `outputItemId` |
| `output_count` | 单批产量 | `outputCount` |
| `quantity` | 总批次数量 | `quantity` |
| `completed_count` | 已完成批次 | `completedCount` |
| `success_count` | 成功次数 | `successCount` |
| `failure_count` | 失败次数 | `failureCount` |
| `ingredients_payload` | 原料列表 | `ingredients[]` |
| `phase` | 当前阶段 | `phase` |
| `preparation_ticks` | 准备阶段 ticks | `preparationTicks` |
| `batch_brew_ticks` | 单批炼制 ticks | `batchBrewTicks` |
| `current_batch_remaining_ticks` | 当前批剩余 ticks | `currentBatchRemainingTicks` |
| `paused_ticks` | 暂停累计 ticks | `pausedTicks` |
| `spirit_stone_cost` | 消耗灵石 | `spiritStoneCost` |
| `total_ticks` | 总 ticks | `totalTicks` |
| `remaining_ticks` | 剩余 ticks | `remainingTicks` |
| `success_rate` | 成功率 | `successRate` |
| `exact_recipe` | 配方快照 | `exactRecipe` |
| `started_at` | 开始时间 | `startedAt` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 开始炼丹
- 暂停/继续
- 每批完成
- 取消
- 结束

### 6.23 `player_enhancement_job`

用途：

- 强化长作业真源

主键与约束：

- 主键：`player_id`

字段：

| 字段 | 含义 | 来源 |
| --- | --- | --- |
| `player_id` | 角色主键 | `enhancementJob` |
| `target_payload` | 目标对象快照 | `target` |
| `item_payload` | 被强化物品快照 | `item` |
| `target_item_id` | 目标物品 id | `targetItemId` |
| `target_item_name` | 目标物品名 | `targetItemName` |
| `target_item_level` | 目标物品等级 | `targetItemLevel` |
| `current_level` | 当前强化等级 | `currentLevel` |
| `target_level` | 本轮目标等级 | `targetLevel` |
| `desired_target_level` | 最终期望等级 | `desiredTargetLevel` |
| `spirit_stone_cost` | 消耗灵石 | `spiritStoneCost` |
| `materials_payload` | 材料列表 | `materials[]` |
| `protection_used` | 是否使用保护 | `protectionUsed` |
| `protection_start_level` | 保护起始等级 | `protectionStartLevel?` |
| `protection_item_id` | 保护物品 id | `protectionItemId?` |
| `protection_item_name` | 保护物品名 | `protectionItemName?` |
| `protection_item_signature` | 保护物品签名 | `protectionItemSignature?` |
| `phase` | 当前阶段 | `phase` |
| `paused_ticks` | 暂停累计 ticks | `pausedTicks` |
| `success_rate` | 成功率 | `successRate` |
| `total_ticks` | 总 ticks | `totalTicks` |
| `remaining_ticks` | 剩余 ticks | `remainingTicks` |
| `started_at` | 开始时间 | `startedAt` |
| `role_enhancement_level` | 角色强化技艺等级 | `roleEnhancementLevel` |
| `total_speed_rate` | 总速度倍率 | `totalSpeedRate` |
| `updated_at` | 最后更新时间 | 新增 |

写入时机：

- 开始强化
- 暂停/继续
- 每轮推进
- 取消
- 结束

### 6.24 `player_enhancement_record`

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

### 6.25 `player_logbook_message`

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

### 6.26 `player_recovery_watermark`

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
| `profession_version` | 职业成长版本 |
| `alchemy_job_version` | 炼丹作业版本 |
| `enhancement_job_version` | 强化作业版本 |
| `logbook_version` | 日志消息版本 |
| `updated_at` | 最后更新时间 |

写入时机：

- 每个正式提交域在事务内推进自己的版本

### 6.27 `player_checkpoint`

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
| `player_settings.alchemyJob` | `player_alchemy_job` |
| `player_settings.enhancementJob` | `player_enhancement_job` |
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
- 必要时联动 `player_world_anchor`
- 必要时联动 `player_position_checkpoint`
- 同事务推进 `player_recovery_watermark`

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
- `player_alchemy_job`
- `player_enhancement_job`

### 8.3 小事务即时写域

- `player_presence`
- `player_world_anchor`
- `player_position_checkpoint`
- `player_map_unlock`
- `player_alchemy_preset`
- `player_logbook_message`

## 9. 恢复顺序

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
23. `player_alchemy_job`
24. `player_enhancement_job`
25. `player_enhancement_record`
26. `player_logbook_message`
27. 按 `player_recovery_watermark` 校验版本一致
28. 必要时用 `player_checkpoint` 做加速或 fallback

## 10. 最终结论

基于参考 `main` 主线的真实玩家数据面，玩家域不能只粗糙地拆成“主档 / 背包 / 设置 / 任务”四五块，而必须至少拆成本文这 27 张表对应的职责边界。

其中真正的核心不是“表变多了”，而是三件事：

- 每个真实在线字段都找到了明确归属
- 资产域、位置恢复域、职业长作业域、自动化配置域不再共用同一条刷盘链
- 恢复链和版本水位已经能支撑商业级 MMO 的一致性要求

这份文档是玩家域分表的直接施工蓝图；再往上的实例、地图、地面物品、怪物、邮件、市场等系统，继续以 [mmo商业级数据落盘方案.md](./mmo商业级数据落盘方案.md) 为总入口。

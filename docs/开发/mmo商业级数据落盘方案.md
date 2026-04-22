# MMO 商业级数据落盘方案

## 1. 文档定位

本文档描述 `道劫余生` next 主线面向商业级 MMO 的数据落盘终局方案。

这份文档重点回答：

- 当前数据落盘为什么会卡
- 针对本项目的格子地图、tick 权威、AOI、实例地图扩展，应该如何设计真源
- 玩家、地图实例、地块资源、地面物品、怪物、邮件、市场等数据分别该怎么落
- 在“静态地图只有几十张，但运行态地图可能几千个”的前提下，怎样把刷盘做成可扩展系统

这份文档不回答：

- 本次是否已经实现
- 具体 SQL migration 文件
- 每一张表的最终 ORM 代码

当前实现进度、已落地分域清单、当前 with-db / gm-database proof 状态，以 [计划/商业级数据落盘改造计划.md](./计划/商业级数据落盘改造计划.md) 为准；本文默认描述终局口径，不把这里的表清单直接等同于“当前已经全部落地”。

## 2. 问题定义

你当前最核心的问题不是“数据库不够强”，而是“真源拆分不够彻底”。

现状里最伤性能的点是：

- 玩家几乎整档状态一起写
- 运行时变更没有按域拆分
- 地图实例快照还是偏粗粒度
- 持久化调度是“把脏对象攒起来后整体刷”，不是“按域增量、按优先级、按实例冷热分层刷”

在几十玩家时这还能勉强工作，但一旦：

- 在线玩家到几百
- 地图实例到几千
- 每秒还有战斗、掉落、地块资源、容器、市场、邮件等低频持久化写入

就会出现两类灾难：

1. 单次刷盘 payload 太大
   - 一个玩家的 inventory/equipment/quest/buff/combat/settings 绑成一个 JSON
   - 一个实例的地块资源、地面物品、容器状态绑成一个大快照
2. 刷盘调度粒度太粗
   - 明明只改了一个背包格子，却重写整档
   - 明明只掉了一个地面物品，却重写整实例快照

于是最后表现成：

- 几百玩家落盘能堵几分钟
- 实例数一多就不敢频繁刷
- 重启恢复只能依赖大快照
- 很难做到按域恢复、按域审计、按域回滚

## 3. 本项目的约束

方案必须严格适配你的游戏特性，而不是照搬通用后台系统。

### 3.1 世界模型约束

- 这是服务端权威 tick MMO
- 地图模板是静态真源，实例才是世界
- 单个静态地图数量不一定很多，但运行态实例可能上千
- 不同实例的持久化价值不一样
  - 主地图分线
  - 宗门地图
  - 洞府地图
  - 公共秘境
  - 临时副本

### 3.2 数据访问约束

- 高频逻辑不能被数据库写入阻塞
- Redis 可以承载在线热态和短期投影，但不能充当正式真源
- PostgreSQL 必须是“下次还在”的正式真源
- 任何玩家资产类操作，不能在“成功返回客户端”后仍只停留在内存或 Redis
- 客户端不能拥有决定正确性的真源

### 3.3 落盘目标约束

- 玩家掉线、重连、重启后状态正确
- 地图实例能按策略恢复，而不是所有实例都强制恢复
- 单玩家写放大足够小
- 单实例写放大足够小
- 可审计、可回放、可恢复

## 4. 商业级目标

商业级 MMO 数据落盘系统在本项目里应满足 6 条目标：

1. 正式真源清晰
   - 每个域都能明确回答“数据库真源是谁”
2. 在线热态与正式真源分离
   - tick 不直接依赖数据库 IO
3. 增量落盘
   - 不再整档 JSON 重写
4. 多实例可扩展
   - 数千运行态地图下仍能稳定刷盘
5. 恢复策略分层
   - 不同实例、不同域按策略恢复，不搞“一把梭全恢复”
6. 审计与运维可控
   - 能查、能补、能重试、能限流、能观测

### 4.1 一致性等级

大型商业级 MMO 不能把所有数据都按同一持久化等级处理。

本项目必须把状态分成 4 个等级：

#### L0 静态内容真源

- 地图模板
- 怪物模板
- 物品模板
- NPC / quest / drop 模板

特点：

- 不在运行时修改
- 不参与在线刷盘

#### L1 强持久化资产与路由真源

- 货币变化
- 背包与装备实例变化
- 邮件附件领取
- 市场成交与资产转移
- 任务关键奖励发放
- 玩家位置正式迁移
- 实例所有权切换
- GM destructive 写操作

要求：

- 成功返回前必须完成正式持久化提交
- 必须带幂等 `operation_id`
- 必须有审计或命令日志

#### L2 最终一致业务状态

- vitals
- 普通 quest 进度
- technique 修炼进度
- 玩家设置
- 普通实例地块资源
- 普通地面掉落
- 普通容器状态

要求：

- 可以 1-5 秒内批量提交
- 允许 worker 合批
- 但必须可恢复、可重试、可观测

#### L3 可重建运行时状态

- 普通怪物运行态
- 临时战斗特效
- AOI cache
- 路径缓存
- 瞬时 projector 结果

要求：

- 默认不入正式真源
- 重启后允许重建

## 5. 总体架构

目标架构不是一个“统一存档服务”，而是五层：

1. 静态内容真源层
   - 地图模板
   - 怪物模板
   - 物品模板
   - NPC/任务/掉落模板
2. 强持久化命令层
   - `operation_id`
   - 幂等约束
   - durable command log
   - outbox / audit
3. 正式持久化真源层
   - PostgreSQL 专表
4. 在线热态层
   - 运行时内存对象
   - Redis 在线投影与 flush 队列
5. 落盘调度层
   - 域级 dirty 标记
   - 分域 batch flush worker
   - 恢复与补偿任务

一句话概括就是：

“静态模板仍走 JSON，正式状态走 PostgreSQL 分域专表，在线高频态走内存 + Redis 投影，刷盘通过异步 worker 做增量提交。”

## 6. 真源拆分原则

先给出最重要的原则。

### 6.1 不能再存在“玩家整档唯一 JSON 真源”

玩家所有数据写一个 JSON，最大的问题不是技术过时，而是：

- 写放大极高
- 单字段冲突会放大成整档冲突
- 无法只恢复某个域
- 无法做细粒度审计
- 很难做并行刷盘

所以玩家必须拆域。

### 6.2 不能把“所有实例世界状态”都当成必须永久保存

几千运行态地图不是几千张都要完整落库。

必须引入实例持久化策略：

- 永久型
- 长期型
- 会话型
- 临时型

不同策略决定：

- 是否落盘
- 落哪些域
- 多久刷一次
- 重启后是否恢复

### 6.3 地图模板和实例状态必须彻底分离

模板负责：

- 地形
- 门点
- 基础 NPC / landmark / container 布局
- 怪物刷新点
- 初始资源基线

实例状态只负责：

- 被改过的地块资源
- 已生成且未清理的地面物品
- 容器运行态
- Boss / 事件对象状态
- 实例元信息

### 6.4 怪物必须分为“可重建”和“必须持久化”两类

普通刷怪怪物不需要持久化全状态。

只有以下怪物需要进入正式状态表：

- 世界 Boss
- 长生命周期事件怪
- 洞府/宗门专属守卫且会跨重启保留状态
- 正在进行特殊战斗流程、不能重建的实体

否则怪物应从模板 + spawn rule 重建。

### 6.5 强资产操作不能只靠异步刷盘

以下操作不能进入“先改内存，稍后 flush”模式：

- 玩家货币增减
- 玩家物品获得 / 消耗 / 删除 / 装备 / 卸下
- 邮件附件领取
- 市场成交
- 关键任务奖励发放
- 跨实例正式迁移

这些操作必须走：

1. tick 或命令层产出 mutation intent
2. 写正式真源事务
3. 写命令日志 / outbox
4. 成功后再返回成功结果

否则就不算商业级。

## 7. 目标数据分层

### 7.1 静态内容真源

继续保持 JSON 内容真源：

- `packages/server/data/maps/*`
- `packages/server/data/content/monsters/*`
- `packages/server/data/content/items/*`
- `packages/server/data/content/npcs/*`
- `packages/server/data/content/quests/*`

这些数据不进运行态数据库真源。

原因：

- 配置频繁由内容编辑器和内容文件驱动
- 模板体量大但变更频率低
- 它们不是“玩家产生”的状态

### 7.2 正式持久化真源

正式真源只存“下次还在”的业务状态。

建议分为 4 组：

1. 玩家域
2. 实例目录域
3. 实例状态域
4. 运营/经济/社交域

### 7.3 在线热态

在线热态保留在：

- `PlayerRuntimeService`
- `MapInstanceRuntime`
- `WorldRuntimeService`
- Redis 在线索引 / flush 队列 / 最近增量投影

但 Redis 不是正式真源。

## 8. 玩家数据落盘设计

这一章不再按想象列字段，而是先以参考 `main` 分支当前真实玩家存档链为基线，再做商业级拆分。

### 8.1 参考 `main` 分支真实玩家存档盘点

现有数据盘点已经抽成独立文档：[参考main分支真实玩家存档盘点.md](./参考main分支真实玩家存档盘点.md)。

这里只保留与终局设计直接相关的结论：

- 参考主线当前真正参与“玩家下次还在”的真源，不是单个 JSON 文件
- 实际数据面至少覆盖 `players`、`player_collections`、`player_settings`、`player_presence`、`users.displayName`、`players.pendingLogbookMessages`
- 终局拆表必须先覆盖这批真实在线字段，再谈商业级收敛

### 8.2 基于真实数据盘点后的拆分原则

从参考主线真实存档看，旧文档至少漏了 6 组必须覆盖的数据域：

- `marketStorage`
- `pendingLogbookMessages`
- `alchemySkill / gatherSkill / alchemyPresets / alchemyJob`
- `enhancementJob / enhancementRecords`
- `player_presence`
- `questCrossMapNavCooldownUntilLifeTicks / revealedBreakthroughRequirementIds / heavenGate / spiritualRoots`

所以 next 终局方案不能只拆“位置 / 背包 / 装备 / 任务 / 设置”这几个粗域，而必须覆盖参考主线已经实际在线使用的完整玩家数据面。

同时，也不能把参考主线里所有现存字段照抄成最终列：

- `viewRange`
  - 在商业级终局里更适合作为派生运行态，不应作为主真源列高频落盘
- `realmLv / realmName / realmStage`
  - 这是运行时派生或内容计算结果，不应直接作为玩家主真源
- `enhancementRecords`
  - 这是兼容历史列名，不应原样沿用
- 每一步移动坐标
  - 不应再当作“每秒正式真源”，而应拆成跨实例锚点与必要 checkpoint

### 8.3 基于真实数据面的终局拆表

如果需要按表逐张展开字段、主键、写入时机与迁移关系，见 [main主线玩家数据分表方案.md](./main主线玩家数据分表方案.md)。

下表不是泛泛而谈，而是把参考主线的真实字段面映射成 next 终局表。

| 目标表 | 存储内容 | 对应参考字段 |
| --- | --- | --- |
| `player_identity` | `player_id`、`user_id`、`role_name`、`created_at`、`updated_at` | `players.id/userId/name` |
| `player_presence` | `player_id`、`online`、`in_world`、`last_heartbeat_at`、`offline_since_at`、`runtime_owner_id`、`session_epoch`、`transfer_state`、`transfer_target_node_id` | `player_presence` + `players` 会话镜像 |
| `player_world_anchor` | `player_id`、`respawn_template_id`、`respawn_instance_id?`、`respawn_x`、`respawn_y`、`last_safe_template_id`、`last_safe_instance_id?`、`last_safe_x`、`last_safe_y`、`last_transfer_at` | `mapId`、`respawnMapId`、`x`、`y` 的长期恢复语义 |
| `player_position_checkpoint` | `player_id`、`instance_id`、`x`、`y`、`facing`、`checkpoint_kind`、`updated_at` | 旧 `x/y/facing`，但只在登出、跨图、GM 传送、死亡回点等关键节点写入 |
| `player_vitals` | `player_id`、`hp`、`max_hp`、`qi`、`dead`、`updated_at` | `hp/maxHp/qi/dead` |
| `player_progression_core` | `player_id`、`foundation`、`combat_exp`、`player_kill_count`、`monster_kill_count`、`elite_kill_count`、`boss_kill_count`、`death_count`、`bone_age_base_years`、`life_elapsed_ticks`、`lifespan_years`、`quest_cross_map_nav_cooldown_until_life_ticks` | 参考主线成长计数与时间相关字段 |
| `player_attr_state` | `player_id`、`base_attrs_payload`、`bonus_entries_payload`、`revealed_breakthrough_requirement_ids`、`heaven_gate_payload`、`spiritual_roots_payload` | `baseAttrs`、`bonuses`、`revealedBreakthroughRequirementIds`、`heavenGate`、`spiritualRoots` |
| `player_wallet` | `player_id`、`wallet_type`、`balance`、`frozen_balance`、`version`、`updated_at` | 旧主线未彻底独立的钱包/货币语义 |
| `player_inventory_item` | `item_instance_id`、`player_id`、`slot_index`、`item_id`、`count`、`enhance_level`、`bind_state`、`raw_payload`、`updated_at` | `inventory.items[]` |
| `player_market_storage_item` | `storage_item_id`、`player_id`、`slot_index`、`item_id`、`count`、`enhance_level`、`raw_payload`、`updated_at` | `marketStorage.items[]` |
| `player_equipment_slot` | `player_id`、`slot_type`、`item_instance_id`、`raw_payload`、`updated_at` | `equipment.weapon/head/body/legs/accessory` |
| `player_technique_state` | `player_id`、`tech_id`、`level`、`exp`、`exp_to_next`、`realm_lv`、`skills_enabled`、`raw_payload`、`updated_at` | `techniques[]` |
| `player_body_training_state` | `player_id`、`level`、`exp`、`exp_to_next`、`updated_at` | `bodyTraining` |
| `player_persistent_buff_state` | `player_id`、`buff_id`、`source_skill_id`、`source_caster_id?`、`realm_lv`、`remaining_ticks`、`duration`、`stacks`、`max_stacks`、`sustain_ticks_elapsed?`、`raw_payload`、`updated_at` | `temporaryBuffs[]` 中需要跨重启保留的部分 |
| `player_quest_progress` | `player_id`、`quest_id`、`status`、`progress_payload`、`raw_payload`、`updated_at` | `quests[]` |
| `player_map_unlock` | `player_id`、`map_id`、`unlocked_at` | `unlockedMinimapIds[]` |
| `player_combat_preferences` | `player_id`、`auto_battle`、`auto_retaliate`、`auto_battle_stationary`、`auto_battle_targeting_mode`、`retaliate_player_target_id`、`combat_target_id`、`combat_target_locked`、`allow_aoe_player_hit`、`auto_idle_cultivation`、`auto_switch_cultivation`、`sense_qi_active`、`cultivating_tech_id`、`targeting_rules_payload`、`updated_at` | 自动战斗与索敌主设置 |
| `player_auto_battle_skill` | `player_id`、`skill_id`、`enabled`、`skill_enabled?`、`auto_battle_order`、`updated_at` | `autoBattleSkills[]` |
| `player_auto_use_item_rule` | `player_id`、`item_id`、`condition_payload`、`updated_at` | `autoUsePills[]` |
| `player_profession_state` | `player_id`、`profession_type`、`level`、`exp`、`exp_to_next`、`updated_at` | `alchemySkill`、`gatherSkill`、强化技艺等级 |
| `player_alchemy_preset` | `preset_id`、`player_id`、`recipe_id`、`name`、`ingredients_payload`、`updated_at` | `alchemyPresets[]` |
| `player_active_job` | `player_id`、`job_run_id`、`job_type`、`status`、`phase`、`started_at`、`finished_at?`、`paused_ticks`、`total_ticks`、`remaining_ticks`、`success_rate`、`speed_rate`、`job_version`、`detail_jsonb`、`updated_at` | `alchemyJob` + `enhancementJob` |
| `player_enhancement_record` | `record_id`、`player_id`、`item_id`、`highest_level`、`levels_payload`、`action_started_at?`、`action_ended_at?`、`start_level?`、`initial_target_level?`、`desired_target_level?`、`protection_start_level?`、`status?`、`updated_at` | 真正的 `PlayerEnhancementRecord[]` 语义 |
| `player_logbook_message` | `message_id`、`player_id`、`kind`、`text`、`from_name?`、`occurred_at`、`acked_at?` | `pendingLogbookMessages[]` |
| `player_recovery_watermark` | 各域最近正式提交版本 | 聚合恢复水位 |
| `player_checkpoint` | 冷启动/备份用聚合快照 | 玩家低频 checkpoint |

补充约束：

- `displayName` 继续归 `users` / 账号域，不并入角色真源
- 邮件附件在未领取前归邮件域，不进入 `player_inventory_item`
- `viewRange`、`realmLv`、`realmName`、`realmStage` 作为运行时派生，不直接建真源列

### 8.4 玩家恢复策略

登录恢复不再读一个大快照，而应按真实数据面分层恢复：

1. 读 `player_identity`
2. 读账号域 `displayName`
3. 读 `player_presence`
4. 读 `player_world_anchor` 与 `player_position_checkpoint`
5. 读 `player_vitals`
6. 读 `player_progression_core`
7. 读 `player_attr_state`
8. 读 `player_wallet`
9. 读 `player_inventory_item / player_market_storage_item / player_equipment_slot`
10. 读 `player_technique_state / player_body_training_state / player_persistent_buff_state / player_quest_progress`
11. 读 `player_map_unlock`
12. 读 `player_combat_preferences / player_auto_battle_skill / player_auto_use_item_rule`
13. 读 `player_profession_state / player_alchemy_preset / player_active_job / player_enhancement_record`
14. 读 `player_logbook_message`
15. 组装运行时对象，并重新计算派生态：
    - `viewRange`
    - `realmLv / realmName / realmStage`
    - 数值总属性
    - 当前可见面板态

这样做的好处：

- 某个域损坏不会拖垮整档
- 真实使用中的复杂域不会在迁移时被漏掉
- 可以按域修复
- 可以按域缓存
- 可以只写改动域

### 8.5 玩家刷盘策略

玩家刷盘必须按真实域划分，而不是把参考主线里的所有字段继续卷回一个 `player_core`。

推荐：

- `player_presence`
  - 登录、掉线、心跳节流后即时小写
- `player_world_anchor`
  - 跨实例迁移、死亡回点、强制传送、登出时写
- `player_position_checkpoint`
  - 只在登出、跨图、GM 传送、fallback 恢复点等关键节点写
  - 不允许按每步移动高频刷库
- `player_vitals / player_progression_core / player_attr_state`
  - `2-5s` 合批刷
  - 下线、长战斗结束、强制停服时优先刷
- `player_technique_state / player_body_training_state / player_persistent_buff_state / player_quest_progress`
  - `1-3s` 合批刷
- `player_map_unlock / player_combat_preferences / player_auto_battle_skill / player_auto_use_item_rule / player_alchemy_preset`
  - 改动即写或短 debounce
- `player_wallet / player_inventory_item / player_market_storage_item / player_equipment_slot / player_active_job`
  - 不走普通定时 flush 主链
  - 其中资产域走强持久化事务
  - 活跃作业的创建/取消/完成进入强持久化事务，运行中进度可走短延迟确认写
- `player_logbook_message`
  - append / ack 走独立小事务

关键点：

- 不是每秒把所有域都写一次
- 不是每一步移动都把坐标打进数据库
- 是“哪个域脏了写哪个域”，并且把资产域和恢复锚点域单独提升优先级

### 8.6 玩家强持久化资产操作链

商业级 MMO 下，玩家资产相关操作必须走强持久化命令链。

建议正式流程：

1. `WorldRuntime` 在 tick 内判定操作是否合法
2. 产出 mutation intent
3. 生成全局唯一 `operation_id`
4. 在同一数据库事务里完成：
   - 写 `durable_operation_log`
   - 校验 `player_presence.runtime_owner_id + session_epoch`
   - 修改 `player_wallet`
   - 修改 `player_inventory_item`
   - 修改 `player_market_storage_item`
   - 修改 `player_equipment_slot`
   - 必要时修改 `player_world_anchor / player_position_checkpoint`
   - 更新 `player_recovery_watermark`
   - 写 `outbox_event`
5. 事务提交成功后，才返回成功结果
6. 运行时对象根据已提交结果回写 confirmed state

禁止路径：

- 先发成功消息，再等 worker 落库
- 只写 Redis dirty set，就认为资产已经持久化
- 把市场托管仓和背包仍当成同一个大 JSON 写回

### 8.7 玩家聚合恢复版本与 checkpoint

玩家分域后，必须补聚合恢复水位。

建议新增：

- `player_recovery_watermark`
  - `player_id`
  - `identity_version`
  - `presence_version`
  - `anchor_version`
  - `position_checkpoint_version`
  - `vitals_version`
  - `progression_version`
  - `attr_version`
  - `wallet_version`
  - `inventory_version`
  - `market_storage_version`
  - `equipment_version`
  - `technique_version`
  - `body_training_version`
  - `buff_version`
  - `quest_version`
  - `map_unlock_version`
  - `combat_pref_version`
  - `auto_battle_skill_version`
  - `auto_use_item_rule_version`
  - `profession_version`
  - `alchemy_preset_version`
  - `active_job_version`
  - `enhancement_record_version`
  - `logbook_version`
  - `mail_version`
  - `mail_counter_version`
  - `updated_at`
- `player_checkpoint`
  - `player_id`
  - `checkpoint_version`
  - `payload`
  - `generated_at`

规则：

- 强持久化事务必须同步推进 `player_recovery_watermark`
- `player_world_anchor` 与 `player_position_checkpoint` 不能落后于成功返回给客户端的正式迁移结果
- 定时 checkpoint 只做冷启动加速，不做正式真源
- 恢复时不能盲读“每张表最新一行”，而要按 watermark 组装一致时间截面

## 9. 地图与实例数据落盘设计

### 9.1 继续保留地图模板 JSON 真源

`MapTemplate` 不进业务真源表。

数据库不负责保存：

- 地图底图
- 静态 tile 字符
- 静态 NPC 布局
- 静态怪物刷新配置
- 静态 portal 配置

这些仍然由内容文件真源负责。

### 9.2 新增实例目录真源 `instance_catalog`

这是商业级 MMO 最关键的一张表之一。

建议字段：

- `instance_id`
- `template_id`
- `instance_type`
  - `main_line`
  - `realm_public`
  - `sect_private`
  - `dwelling_private`
  - `dungeon_session`
- `persistent_policy`
  - `permanent`
  - `long_lived`
  - `session`
  - `ephemeral`
- `owner_player_id`
- `owner_sect_id`
- `party_id`
- `line_id`
- `cluster_id`
- `route_domain`
- `status`
  - `active`
  - `idle`
  - `archived`
  - `destroyed`
- `assigned_node_id`
- `lease_token`
- `lease_expire_at`
- `runtime_status`
  - `active`
  - `sleeping`
  - `migrating`
  - `recovering`
  - `offline`
- `recovering_from_snapshot`
- `ownership_epoch`
- `created_at`
- `last_active_at`
- `last_persisted_at`
- `shard_key`

作用：

- 实例正式存在性真源
- 玩家重连落点查询面
- 恢复入口
- GM 查询面
- 分布式实例所有权真源

### 9.3 实例状态拆分

不要把一个实例所有状态落成一个大 JSON。

应拆为以下几类。

#### 9.3.1 `instance_tile_resource_state`

保存相对于模板基线被改过的地块资源：

- `instance_id`
- `tile_index`
- `resource_key`
- `value`
- `updated_at`

只存 diff，不存整图。

#### 9.3.2 `instance_ground_item`

保存地面物品堆：

- `ground_item_id`
- `instance_id`
- `tile_index`
- `item_instance_payload`
- `expire_at`
- `created_at`
- `updated_at`

不要再把整个 ground pile 数组塞回单快照。

#### 9.3.3 `instance_container_state`

保存容器运行态：

- `instance_id`
- `container_id`
- `source_id`
- `state_payload`
- `updated_at`

#### 9.3.4 `instance_monster_runtime_state`

只给“必须持久化的怪”使用：

- `instance_id`
- `runtime_monster_id`
- `monster_id`
- `spawn_rule_id`
- `x`
- `y`
- `hp`
- `state_payload`
- `updated_at`

普通刷怪不进这张表。

#### 9.3.5 `instance_event_state`

保存实例事件态：

- 门已开
- Boss 已激活
- 剧情阶段
- 洞府装饰/机关状态

#### 9.3.6 `instance_overlay_chunk`

这是地图动态能力的正式真源，不允许只靠零散状态表拼装。

建议字段：

- `instance_id`
- `patch_kind`
- `chunk_key`
- `patch_version`
- `patch_payload`
- `updated_at`

负责承载：

- 动态门
- 动态阻挡
- 动态 portal / anchor
- 动态 NPC 布局
- 实例级地形改造
- 高频 tile 改图按 chunk 拆分，避免整实例 overlay 热行

#### 9.3.7 `instance_recovery_watermark`

建议字段：

- `instance_id`
- `ownership_epoch`
- `tile_resource_version`
- `ground_item_version`
- `container_version`
- `monster_version`
- `event_version`
- `overlay_version`
- `updated_at`

作用：

- 恢复时按一致版本组装实例状态
- 防止读到跨域半提交数据

#### 9.3.8 `instance_checkpoint`

建议字段：

- `instance_id`
- `checkpoint_version`
- `payload`
- `generated_at`

说明：

- 只做冷启动与休眠唤醒加速
- 不作为正式真源

### 9.4 实例持久化策略分级

#### 9.4.1 `permanent`

必须长期存在：

- 主地图分线
- 洞府
- 宗门图

策略：

- 必须落盘
- 重启后恢复

#### 9.4.2 `long_lived`

持续数小时或数天：

- 公共秘境
- 长时活动地图

策略：

- 落盘
- 重启后按 TTL 判断是否恢复

#### 9.4.3 `session`

持续一场活动：

- 队伍副本
- 临时事件实例

策略：

- 可选择只存关键元信息
- 重启后可不恢复，只做失败补偿

#### 9.4.4 `ephemeral`

纯临时实例：

- 教学引导实例
- 临时测试实例

策略：

- 不做正式落盘
- 直接销毁即可

### 9.5 实例所有权、租约与 fencing

只要目标是大型商业级 MMO，实例目录必须自带所有权机制。

规则如下：

1. 任一时刻，一个实例只能有一个有效执行所有者
2. 所有实例状态写入都必须附带当前 `ownership_epoch` 或 `lease_token`
3. 旧节点失去 lease 后，后续写入必须全部拒绝
4. 实例迁移前先切换 catalog 所有权，再允许目标节点恢复
5. 没有有效 lease 的 worker，不允许刷该实例

推荐流程：

1. 节点尝试认领实例
2. 通过 compare-and-swap 更新 `assigned_node_id + lease_token + lease_expire_at + ownership_epoch`
3. 成功后进入 `recovering`
4. 恢复完成后切为 `active`
5. 周期性续约
6. 续约失败则停止写入并下线实例

这是把方案提升到“真正商业级”的关键步骤。

## 10. 怪物与世界对象策略

### 10.1 普通怪物

普通怪物不应默认持久化。

理由：

- 数量大
- 变化频繁
- 可由模板和 respawn 规则重建
- 把它们全部入库会拖死实例刷盘

### 10.2 高价值怪物

以下对象才需要正式状态：

- 世界 Boss
- 宗门守卫
- 洞府守护灵
- 长流程事件怪
- 正在推进特殊战斗脚本的对象

这些对象应进入 `instance_monster_runtime_state` 或专门的 `boss_state` 表。

### 10.3 地面物品

地面物品要分两类：

1. 可重建掉落
   - 普通怪物掉落
   - 重启后允许清空
2. 不可重建掉落
   - 玩家主动丢弃
   - 关键任务物品
   - 高价值活动掉落

建议默认策略：

- 玩家丢弃物、任务物、关键奖励物：正式落盘
- 普通短时怪物掉落：按 TTL 落盘，过期自动清理

### 10.4 普通怪与高价值对象的恢复边界

必须明确写死：

- 普通怪、普通巡逻、普通掉落
  - 可重建
  - 不要求跨重启保留精确血量与位置
- 世界 Boss、宗门守卫、洞府守护灵、剧情事件怪
  - 必须可恢复
  - 必须具备独立状态真源

否则后期会在 Boss、活动和宗门玩法上反复返工。

## 11. Redis 与在线热态设计

Redis 在这个方案里不是正式真源，而是热态加速层。

建议用途：

- 在线玩家 presence
- flush 唤醒信号
- 最近需要优先刷新的玩家/实例 hint
- 最近未落盘增量缓存
- 登录恢复加速投影

### 11.1 Flush ledger 真源

真正的待刷真源不在 Redis，而在数据库 ledger：

- `player_flush_ledger(player_id, domain, latest_version, flushed_version, next_attempt_at, claimed_by, claim_until)`
- `instance_flush_ledger(instance_id, domain, ownership_epoch, latest_version, flushed_version, next_attempt_at, claimed_by, claim_until)`

worker 只认 `latest_version > flushed_version` 的 ledger 行。

### 11.2 Redis 唤醒键

例如：

- `flush:wakeup:player`
- `flush:wakeup:instance`

这样 flush worker 可以被快速唤醒，但不依赖 Redis 保存待刷边界。

### 11.3 Redis 中禁止承担的职责

以下数据禁止只存在 Redis：

- 玩家正式货币真源
- 玩家正式背包真源
- 玩家正式位置真源
- 实例正式目录真源
- 实例所有权真源
- 强持久化命令唯一日志

Redis 只能是：

- 加速层
- 队列层
- 投影层
- 恢复辅助层

### 11.4 Redis 故障恢复

商业级设计必须默认 Redis 可能丢数据或被清空。

所以需要：

- worker cursor 进入数据库
- `durable_operation_log` 可重建未完成 outbox
- Redis 唤醒键丢失后，可由 ledger 的 `latest_version > flushed_version` 扫描回补
- gateway / presence 丢失后，可由 session 真源重建

## 12. Flush Worker 设计

这是解决“几百玩家落盘堵几分钟”的核心。

### 12.1 不再只有一个 flush loop

改为多个独立 worker：

- `player-anchor-checkpoint-flush-worker`
- `player-state-flush-worker`
- `instance-resource-flush-worker`
- `instance-ground-item-flush-worker`
- `instance-container-flush-worker`
- `checkpoint-compaction-worker`
- `outbox-dispatcher`

### 12.2 调度规则

每个 worker 按以下规则工作：

1. 从数据库 flush ledger 认领 `latest_version > flushed_version` 的条目
2. Redis 只负责加速唤醒，不负责 dirty 真源
3. 合并短时间内重复改动
4. 按 batch size 写库
5. 成功后推进 `flushed_version`
6. 失败进入 retry 队列

### 12.3 推荐批次参数

初始推荐：

- 玩家 `presence`：事件触发即时写
- 玩家 `worldAnchor / positionCheckpoint`：`batch 128-256`，`1s`
- 玩家 `vitals / progression / attr`：`batch 128`，`2-5s`
- 玩家 `quest / technique / bodyTraining / buff`：`batch 128`，`1-3s`
- 玩家 `activeJob` 运行中进度：`batch 64-128`，`1-3s`
- 实例 tile resource：`batch 256`，`2s`
- 实例 ground item：`batch 128`，`1-2s`
- 实例 container：`batch 64`，`1-3s`
- `outbox-dispatcher`：常驻拉取 `ready` 事件
- checkpoint / compaction：按低峰期执行

这些不是最终值，但方向必须是：

- 小 payload
- 高频合批
- 多 worker 并行

### 12.4 事务边界

事务边界按业务域决定，不做“世界全局大事务”。

建议：

- 单玩家一次背包变更：一个事务
- 单玩家一次装备切换：一个事务
- 单玩家一次邮件领取：一个事务，可同时覆盖 `player_mail* + player_inventory_item/player_wallet`
- 单实例一批 ground item upsert：一个事务
- 单实例一批 tile resource upsert：一个事务

不要把多个玩家、多个实例和无关市场批处理混成一个全局大事务。

### 12.5 强持久化命令链

大型商业级 MMO 不能把所有写入都丢给 flush worker。

以下操作必须走即时事务：

- 货币增减
- 背包实例变更
- 装备穿戴与卸下
- 邮件附件领取
- 市场成交
- 关键任务奖励
- 跨实例正式迁移
- 实例 lease 变更

推荐新增：

- `durable_operation_log`
- `outbox_event`
- `asset_audit_log`

其中：

- `durable_operation_log` 负责幂等与恢复
- `outbox_event` 负责跨服务、跨节点事件投递
- 独立 `outbox-dispatcher` worker 通过 claim 机制消费，不由游戏节点各自消费自己产出的事件
- `asset_audit_log` 负责运营追责与审计

### 12.6 Flush worker 只处理最终一致域

worker 应只处理：

- vitals
- progression
- attr
- 普通 quest 进度
- 普通 technique 进度
- bodyTraining
- persistent buff
- map unlock
- combat preferences
- auto battle skill / auto use item rule
- alchemy preset
- 普通实例资源
- 普通地面掉落
- 普通容器状态
- checkpoint 生成

worker 不应承担：

- 玩家资产正式提交
- 市场成交正式提交
- 邮件附件正式提交
- 实例所有权切换

### 12.7 幂等、重试与 outbox

商业级系统必须预设“重复执行”和“半途失败”。

要求：

- 每个强持久化命令都带 `operation_id`
- 每张关键资产表都要有幂等唯一键或版本校验
- worker 重试必须可重复提交而不重复生效
- outbox 投递失败不能影响主事务提交
- 失败事件必须进入 dead-letter 队列

## 13. 恢复设计

### 13.1 玩家恢复

登录时：

1. 读取 `player_identity` 与账号显示名
2. 读取 `player_presence`
3. 读取 `player_world_anchor / player_position_checkpoint / player_vitals`
4. 读取 `player_progression_core / player_attr_state / player_wallet`
5. 读取 `player_inventory_item / player_market_storage_item / player_equipment_slot`
6. 读取 `player_technique_state / player_body_training_state / player_persistent_buff_state / player_quest_progress`
7. 读取 `player_map_unlock / player_combat_preferences / player_auto_battle_skill / player_auto_use_item_rule`
8. 读取 `player_profession_state / player_alchemy_preset / player_active_job / player_enhancement_record / player_logbook_message`
9. 组装运行时并重算派生态
10. 若锚点或 checkpoint 指向失效实例，则转入 fallback 恢复流程

### 13.2 实例恢复

启动时不恢复全部实例。

只恢复：

- `permanent`
- 仍在 TTL 内的 `long_lived`
- 有玩家落点引用的实例

不恢复：

- 已过期 `session`
- `ephemeral`

### 13.3 惰性恢复

实例不应在启动时全量恢复到内存。

正确策略：

- 启动阶段只恢复 `instance_catalog`
- 真正需要进入实例时，再按需加载实例状态

这对于几千实例非常关键。

### 13.4 玩家聚合恢复水位

恢复玩家时必须遵守：

1. 优先读取 `player_recovery_watermark`
2. 只组装不高于该 watermark 的已提交域版本
3. 若某域版本超前但 watermark 未推进，则视为未正式提交
4. checkpoint 仅用于加速，不用于覆盖正式真源

否则就会出现“新背包 + 旧货币 + 旧任务”的混合恢复。

### 13.5 实例恢复水位

实例恢复时必须同时校验：

- `instance_catalog.ownership_epoch`
- `instance_recovery_watermark`
- `instance_overlay_chunk.patch_version`
- 当前 lease 是否仍有效

恢复顺序建议：

1. 加载 catalog
2. 认领 lease
3. 校验 epoch
4. 读取 watermark
5. 读取 tile resource / ground item / container / monster / event / overlay
6. 组装运行时
7. 标记 `runtime_status=active`

### 13.6 fallback 与自愈

商业级系统必须有自愈策略：

- 玩家位置指向不存在实例
  - 转入安全 fallback 出生点
- 某域数据损坏但其他域正常
  - 只隔离坏域，不拖垮整档恢复
- checkpoint 失效
  - 回退到分域真源恢复
- lease 冲突
  - 立即停止旧实例写入并报警

## 14. 观测与运维

商业级落盘方案必须可观测。

至少要有这些指标：

- 每个 worker 每秒写入量
- 每个 worker 队列积压量
- 平均 flush 延迟
- 最大 flush 延迟
- 强持久化事务提交耗时
- 强持久化失败率
- outbox backlog
- dead-letter backlog
- lease 冲突次数
- lease 接管次数
- 单玩家恢复耗时
- 单实例恢复耗时
- 单表 upsert 耗时
- 脏实例数
- 脏玩家数
- 恢复失败数

至少要有这些运维能力：

- 强制刷单玩家
- 强制刷单实例
- 强制重建某实例
- 强制重放单个 `operation_id`
- 查询单实例当前 lease 与 owner
- 手工冻结某实例写入
- 手工迁移实例 owner
- 查询某玩家各域落盘时间
- 查询某实例各域落盘时间
- 查看 dirty backlog
- 查看失败重试队列

## 15. 推荐表结构总览

推荐新增或保留的正式真源表：

- `player_identity`
- `player_presence`
- `player_session_route`
- `player_world_anchor`
- `player_position_checkpoint`
- `player_vitals`
- `player_progression_core`
- `player_attr_state`
- `player_wallet`
- `player_inventory_item`
- `player_market_storage_item`
- `player_equipment_slot`
- `player_technique_state`
- `player_body_training_state`
- `player_persistent_buff_state`
- `player_quest_progress`
- `player_map_unlock`
- `player_combat_preferences`
- `player_auto_battle_skill`
- `player_auto_use_item_rule`
- `player_profession_state`
- `player_alchemy_preset`
- `player_active_job`
- `player_enhancement_record`
- `player_logbook_message`
- `player_mail`
- `player_mail_attachment`
- `player_mail_counter`
- `player_recovery_watermark`
- `player_checkpoint`
- `player_flush_ledger`
- `node_registry`
- `instance_catalog`
- `instance_tile_resource_state`
- `instance_ground_item`
- `instance_container_state`
- `instance_monster_runtime_state`
- `instance_event_state`
- `instance_overlay_chunk`
- `instance_recovery_watermark`
- `instance_checkpoint`
- `instance_flush_ledger`
- `durable_operation_log`
- `outbox_event`
- `asset_audit_log`
- `dead_letter_event`

可继续保留但后续应压缩职责的：

- `server_next_player_identity`
- 邮件/市场/建议/兑换码等已有专域或文档域

应逐步退出“主真源”角色的：

- 玩家整档 JSON 快照
- 大实例整包 JSON 快照

### 15.1 分区策略

为了支撑大型 MMO，大表必须预留分区。

建议：

- `player_inventory_item`
  - 按 `hash(player_id)` 分区
- `player_market_storage_item`
  - 按 `hash(player_id)` 分区
- `player_wallet`
  - 按 `hash(player_id)` 分区
- `instance_ground_item`
  - 按 `hash(instance_id)` 分区
- `instance_tile_resource_state`
  - 按 `hash(instance_id)` 分区
- `instance_container_state`
  - 按 `hash(instance_id)` 分区
- `durable_operation_log / outbox_event / asset_audit_log / dead_letter_event`
  - 按 `created_at` 月分区，必要时再叠 hash

### 15.2 索引策略

至少需要这些索引：

- `player_world_anchor(player_id)`
- `player_position_checkpoint(player_id)`
- `player_position_checkpoint(instance_id)`
- `player_wallet(player_id, wallet_type)`
- `player_inventory_item(player_id, slot_index)`
- `player_market_storage_item(player_id, slot_index)`
- `player_equipment_slot(player_id, slot_type)`
- `player_quest_progress(player_id, quest_id)`
- `player_profession_state(player_id, profession_type)`
- `player_logbook_message(player_id, acked_at, occurred_at)`
- `instance_catalog(status, runtime_status)`
- `instance_catalog(assigned_node_id, lease_expire_at)`
- `instance_tile_resource_state(instance_id, tile_index, resource_key)`
- `instance_ground_item(instance_id, tile_index)`
- `instance_ground_item(instance_id, expire_at)`
- `durable_operation_log(operation_id)`
- `outbox_event(status, created_at)`

### 15.3 TTL、归档与清理

商业级系统必须自带生命周期管理：

- 普通地面掉落
  - TTL 到期后异步清理
- destroyed / expired 实例
  - 先归档 catalog，再批量清理子表
- 审计与命令日志
  - 热表保留 7-30 天
  - 冷数据归档到历史表或对象存储

### 15.4 大表膨胀控制

必须提前约束：

- 批量 upsert 使用稳定顺序
- 避免高频 delete/insert 抖动，优先 soft-delete + 周期清理
- 归档与 vacuum 要有单独运维窗口
- 不允许无限增长的事件表长期放在热分区

## 16. 分阶段实施路线

### 阶段 1：先止血

目标：

- 不再让几百玩家整档刷盘堵几分钟

实施：

- 保留现有玩家快照表作为兜底
- 先把 `player_presence`、`player_world_anchor`、`player_position_checkpoint` 拆出来
- 先把 `player_inventory_item`、`player_market_storage_item`、`player_equipment_slot` 拆出来
- 加入 `player_wallet`
- 加入 `player_logbook_message`
- 让恢复锚点、背包、市场托管仓、装备、货币、待确认消息不再写整档快照
- 现有大快照退化为低频兜底 checkpoint

### 阶段 1.5：强资产命令链

目标：

- 资产类操作不再依赖异步 flush

实施：

- 新增 `durable_operation_log`
- 新增 `outbox_event`
- 新增 `player_recovery_watermark`
- 把货币、背包、市场托管仓、装备、邮件领取、市场成交改成即时事务提交

### 阶段 1.8：玩家完整域补齐

目标：

- 先把参考主线里真实存在但旧文档漏掉的玩家域补齐

实施：

- 新增 `player_progression_core`
- 新增 `player_attr_state`
- 新增 `player_body_training_state`
- 新增 `player_quest_progress`
- 新增 `player_persistent_buff_state`
- 新增 `player_map_unlock`
- 新增 `player_combat_preferences`
- 新增 `player_auto_battle_skill`
- 新增 `player_auto_use_item_rule`
- 新增 `player_profession_state`
- 新增 `player_alchemy_preset`
- 新增 `player_active_job`
- 新增 `player_enhancement_record`

### 阶段 2：实例目录化

目标：

- 支持大量实例恢复和查询

实施：

- 新增 `instance_catalog`
- 玩家位置正式绑定 `instance_id`
- 启动阶段改为恢复实例目录而不是恢复全量实例对象

### 阶段 2.5：实例 lease 与路由

目标：

- 为多执行器和故障接管立边界

实施：

- 在 `instance_catalog` 引入 `assigned_node_id / lease_token / lease_expire_at / ownership_epoch`
- 实例写入带 fencing 字段
- 会话路由与实例路由分离

### 阶段 3：实例状态拆域

目标：

- 去掉 `server_next_map_aura_v1` 单实例整包快照依赖

实施：

- 拆成 `instance_tile_resource_state`
- `instance_ground_item`
- `instance_container_state`
- 高价值对象专表
- `instance_overlay_chunk`
- `instance_recovery_watermark`

### 阶段 4：Worker 化

目标：

- 把 flush 从服务逻辑里抽成专门调度层

实施：

- flush ledger + Redis 唤醒
- 独立 flush worker
- 重试与监控

### 阶段 4.5：物理层收口

目标：

- 真正支撑大型 MMO 的数据规模

实施：

- 大表分区
- TTL 清理
- 审计归档
- vacuum 与热点索引调优

### 阶段 5：清理旧快照主链

目标：

- 大快照不再是正式真源

实施：

- 玩家快照改为 checkpoint / backup 用途
- 地图整包快照改为兼容恢复或下线

## 17. 最终结论

适合你这个项目的商业级 MMO 数据落盘方案，不是“把现在的 JSON 存快一点”，而是：

- 静态模板继续走 JSON
- 玩家数据改成分域专表真源
- 地图实例引入实例目录真源
- 实例状态按资源/地面物品/容器/overlay/高价值对象拆表
- 普通怪物默认不持久化，按模板重建
- 玩家资产操作走强持久化命令链
- Redis 只做热态、dirty 队列和 flush 调度
- PostgreSQL 才是正式真源
- 实例目录自带 lease/fencing
- 玩家与实例恢复都必须有 watermark / checkpoint
- flush 通过多 worker 增量提交，而不是整档大 JSON 重写

只有这样，系统才能同时满足：

- 商业级 MMO 的正确性
- 强资产零丢单
- 数百玩家并发刷盘能力
- 上千运行态地图扩展能力
- 多执行器 / 多节点扩展能力
- 重启恢复与运维可控性

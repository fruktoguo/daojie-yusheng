# main 主线玩家数据分表方案

## 1. 文档定位

本文回答：基于 `main` 主线当前真实在线玩家数据面，玩家域具体拆成哪些表。

相关文档：
- [持久化设计.md](./持久化设计.md) — 调度、真源边界、刷盘域拆分

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

## 5. 恢复顺序

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

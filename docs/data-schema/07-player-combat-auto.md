# 战斗偏好与自动化

## player_combat_preferences

玩家战斗设置，单行存储。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | PK | 玩家 ID |
| auto_battle | boolean | NOT NULL, DEFAULT false | 自动战斗开关 |
| auto_retaliate | boolean | NOT NULL, DEFAULT true | 自动反击开关 |
| auto_battle_stationary | boolean | NOT NULL, DEFAULT false | 站桩战斗 |
| auto_battle_targeting_mode | varchar(32) | NOT NULL, DEFAULT 'auto' | 自动选敌模式 |
| retaliate_player_target_id | varchar(120) | | 反击锁定玩家 |
| retaliate_player_target_last_attack_tick | bigint | | 反击目标最后攻击 tick |
| combat_target_id | varchar(120) | | 当前战斗目标 |
| combat_target_locked | boolean | NOT NULL, DEFAULT false | 目标锁定 |
| allow_aoe_player_hit | boolean | NOT NULL, DEFAULT false | 允许 AOE 命中玩家 |
| auto_idle_cultivation | boolean | NOT NULL, DEFAULT true | 空闲自动修炼 |
| auto_switch_cultivation | boolean | NOT NULL, DEFAULT true | 自动切换修炼功法 |
| auto_root_foundation | boolean | NOT NULL, DEFAULT false | 自动凝练根基 |
| sense_qi_active | boolean | NOT NULL, DEFAULT false | 感气视角 |
| cultivating_tech_id | varchar(120) | | 当前修炼功法 ID |
| targeting_rules_payload | jsonb | | 自定义选敌规则 |
| updated_at | timestamptz | DEFAULT now() | |

**特点**：
- 玩家手动切换设置时更新
- 属于"最终一致 flush 域"
- `cultivating_tech_id` 记录当前正在修炼的功法

---

## player_auto_battle_skill

自动战斗技能配置，每个技能一行。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | NOT NULL | 玩家 ID |
| skill_id | varchar(160) | NOT NULL | 技能 ID |
| enabled | boolean | NOT NULL, DEFAULT true | 是否启用 |
| skill_enabled | boolean | NOT NULL, DEFAULT true | 技能本身是否可用 |
| auto_battle_order | bigint | NOT NULL, DEFAULT 0 | 释放优先级 |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(player_id, skill_id)

**索引**：player_id + auto_battle_order ASC + skill_id ASC

**特点**：
- 控制自动战斗时技能的释放顺序和开关
- `auto_battle_order` 越小优先级越高
- 玩家调整技能优先级时批量 UPSERT
- 属于"最终一致 flush 域"

---

## player_auto_use_item_rule

自动使用物品规则（如自动嗑药）。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | NOT NULL | 玩家 ID |
| item_id | varchar(120) | NOT NULL | 物品模板 ID |
| condition_payload | jsonb | NOT NULL | 触发条件 |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(player_id, item_id)

**索引**：player_id + item_id ASC

**condition_payload 示例**：
```json
{
  "trigger": "hp_below",
  "threshold": 0.3,
  "cooldown": 5
}
```

**特点**：
- 玩家配置"血量低于 30% 自动使用回血丹"等规则
- 运行时 tick 内检查条件并自动消耗物品
- 属于"最终一致 flush 域"

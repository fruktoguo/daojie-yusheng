# 功法、炼体、Buff

## player_technique_state

玩家已学功法，每个功法一行。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | NOT NULL | 玩家 ID |
| tech_id | varchar(120) | NOT NULL | 功法模板 ID |
| level | bigint | NOT NULL, DEFAULT 1 | 当前层数 |
| exp | double precision | | 当前经验 |
| exp_to_next | double precision | | 升级所需经验 |
| realm_lv | bigint | | 功法境界等级 |
| skills_enabled | boolean | NOT NULL, DEFAULT true | 技能是否启用 |
| raw_payload | jsonb | NOT NULL | 动态字段 |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(player_id, tech_id)

**索引**：player_id + realm_lv ASC + tech_id ASC

**raw_payload 内容**（仅动态字段）：
```json
{
  "techId": "basic_sword",
  "level": 3,
  "exp": 150,
  "expToNext": 500,
  "skillsEnabled": true,
  "realm": 1,
  "realmLv": 2
}
```

**不存储的字段**（运行时从模板水合）：
- `name` — 功法名称
- `grade` — 品阶（mortal/yellow/mystic/earth/heaven）
- `category` — 分类（arts/internal/divine/secret）
- `skills[]` — 技能定义列表
- `layers[]` — 层级属性配置
- `desc` — 描述文本

**特点**：
- 核心设计：**只存 ID + 进度，不存模板数据**
- Load 时调用 `TechniqueTemplateRegistry.hydrate(techId, { level, exp, ... })` 恢复完整 TechniqueState
- 模板热更新后，下次 hydrate 自动获取最新 skills/layers
- 属于"最终一致 flush 域"

---

## player_persistent_buff_state

玩家持久化 Buff（下线保留的 buff）。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | NOT NULL | 玩家 ID |
| buff_id | varchar(160) | NOT NULL | Buff 模板 ID |
| source_skill_id | varchar(160) | NOT NULL | 来源技能 ID |
| source_caster_id | varchar(120) | | 施放者 ID |
| realm_lv | bigint | | Buff 境界等级 |
| remaining_ticks | bigint | NOT NULL, DEFAULT 0 | 剩余 tick 数 |
| duration | bigint | NOT NULL, DEFAULT 0 | 总持续 tick 数 |
| stacks | bigint | NOT NULL, DEFAULT 1 | 当前层数 |
| max_stacks | bigint | NOT NULL, DEFAULT 1 | 最大层数 |
| sustain_ticks_elapsed | bigint | | 维持代价已消耗 tick |
| raw_payload | jsonb | NOT NULL | 扩展数据 |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(player_id, buff_id, source_skill_id)

**索引**：player_id + buff_id ASC + source_skill_id ASC

**特点**：
- 复合主键支持同一 buff 来自不同技能的多实例
- `remaining_ticks` 每 tick 递减，归零时移除
- 临时 buff（战斗内短暂效果）不入此表，仅持久化需要跨下线保留的 buff
- raw_payload 存 buff 的属性修正等运行时数据
- 属于"最终一致 flush 域"

---

## player_body_training_state

（已在 03-player-vitals-growth.md 中描述）

炼体等级/经验，独立于功法系统的成长线。

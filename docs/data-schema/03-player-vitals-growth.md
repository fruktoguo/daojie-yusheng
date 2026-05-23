# 生存、成长与属性

## player_vitals

玩家生命值与灵气，高频变化。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | PK | 玩家 ID |
| hp | double precision | NOT NULL | 当前生命值 |
| max_hp | double precision | NOT NULL | 最大生命值 |
| qi | double precision | NOT NULL | 当前灵气 |
| max_qi | double precision | NOT NULL | 最大灵气 |
| updated_at | timestamptz | DEFAULT now() | |

**特点**：
- 每次战斗、回复、消耗都会变化
- 属于"最终一致 flush 域"，1.5s 批量写入
- max_hp/max_qi 是运行时派生值的快照，恢复时会重算

---

## player_progression_core

玩家核心成长数值。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | PK | 玩家 ID |
| foundation | double precision | NOT NULL, DEFAULT 0 | 根基值 |
| root_foundation | double precision | NOT NULL, DEFAULT 0 | 根基点数（六维境界乘区） |
| combat_exp | double precision | NOT NULL, DEFAULT 0 | 战斗经验 |
| bone_age_base_years | bigint | NOT NULL, DEFAULT 18 | 骨龄基础年数 |
| life_elapsed_ticks | bigint | NOT NULL, DEFAULT 0 | 已存活 tick 数 |
| lifespan_years | bigint | | 寿元上限 |
| updated_at | timestamptz | DEFAULT now() | |

**特点**：
- 修炼、战斗、时间流逝时更新
- `bone_age_base_years + life_elapsed_ticks` 计算实际骨龄
- 属于"最终一致 flush 域"

---

## player_attr_state

玩家属性状态（基础六维、加成、境界、灵根等）。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | PK | 玩家 ID |
| base_attrs_payload | jsonb | | 基础六维属性 |
| bonus_entries_payload | jsonb | NOT NULL, DEFAULT '[]' | 运行时加成条目 |
| revealed_breakthrough_requirement_ids | jsonb | NOT NULL, DEFAULT '[]' | 已揭示的突破条件 |
| realm_payload | jsonb | | 境界状态（阶段/经验/突破） |
| heaven_gate_payload | jsonb | | 天门状态 |
| spiritual_roots_payload | jsonb | | 灵根数值 |
| updated_at | timestamptz | DEFAULT now() | |

**特点**：
- 使用 JSONB 存储复杂嵌套结构
- `base_attrs_payload` 存六维基础值，finalAttrs 运行时派生不落库
- 境界突破、灵根变化时更新
- 属于"最终一致 flush 域"

---

## player_body_training_state

炼体状态。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | PK | 玩家 ID |
| level | bigint | NOT NULL, DEFAULT 0 | 炼体等级 |
| exp | double precision | NOT NULL, DEFAULT 0 | 当前经验 |
| exp_to_next | double precision | NOT NULL, DEFAULT 1 | 升级所需经验 |
| updated_at | timestamptz | DEFAULT now() | |

**特点**：
- 炼体修炼时经验增长
- 属于"最终一致 flush 域"

---

## player_counters

玩家通用计数器（击杀数、使用次数等）。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | NOT NULL | 玩家 ID |
| counter_key | varchar(64) | NOT NULL | 计数器键名 |
| value | bigint | NOT NULL, DEFAULT 0 | 计数值 |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(player_id, counter_key)

**特点**：
- 通用 KV 计数器，用于成就、统计等
- 按需创建行，不预分配

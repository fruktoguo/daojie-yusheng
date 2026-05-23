# 职业、长作业、强化记录

## player_profession_state

玩家职业技能等级（炼丹、锻造、采集等）。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | NOT NULL | 玩家 ID |
| profession_type | varchar(32) | NOT NULL | 职业类型（alchemy/forging/gather/mining/enhancement/building） |
| level | bigint | NOT NULL | 等级 |
| exp | double precision | | 当前经验 |
| exp_to_next | double precision | | 升级所需经验 |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(player_id, profession_type)

**索引**：player_id + profession_type ASC

**特点**：
- 每种职业独立一行，按需创建
- 制作成功时增加经验
- 属于"最终一致 flush 域"

---

## player_alchemy_preset

炼丹预设配方。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | NOT NULL | 玩家 ID |
| preset_id | varchar(180) | NOT NULL | 预设 ID |
| recipe_id | varchar(120) | | 配方 ID |
| name | varchar(160) | NOT NULL | 预设名称 |
| ingredients_payload | jsonb | NOT NULL | 材料配置 |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(player_id, preset_id)

**索引**：player_id

**特点**：
- 玩家保存的炼丹材料组合，方便一键炼丹
- 属于"小事务即时写域"

---

## player_active_job

玩家当前进行中的长作业（炼丹/锻造/强化/采集等），同时只能有一个。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | PK | 玩家 ID |
| job_run_id | varchar(180) | NOT NULL, UNIQUE | 作业运行 ID |
| job_type | varchar(32) | NOT NULL | 作业类型 |
| status | varchar(32) | NOT NULL | 状态（running/paused/completed/failed） |
| phase | varchar(64) | NOT NULL | 当前阶段 |
| started_at | bigint | NOT NULL | 开始时间 |
| finished_at | bigint | | 结束时间 |
| paused_ticks | bigint | NOT NULL, DEFAULT 0 | 暂停累计 tick |
| total_ticks | bigint | NOT NULL, DEFAULT 0 | 总需 tick |
| remaining_ticks | bigint | NOT NULL, DEFAULT 0 | 剩余 tick |
| success_rate | double precision | NOT NULL, DEFAULT 0 | 成功率 |
| speed_rate | double precision | NOT NULL, DEFAULT 1 | 速度倍率 |
| job_version | bigint | NOT NULL, DEFAULT 1 | 作业版本 |
| detail_jsonb | jsonb | NOT NULL | 作业详情 |
| updated_at | timestamptz | DEFAULT now() | |

**唯一约束**：job_run_id

**索引**：job_type + status ASC + player_id ASC

**特点**：
- PK 是 player_id，保证同时只有一个活跃作业
- `detail_jsonb` 存作业特定数据（配方、材料、目标等级等）
- 创建/取消/完成走"强持久化事务域"，运行中进度走"最终一致 flush"

---

## player_enhancement_record

装备强化记录。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| record_id | varchar(180) | PK | 记录 ID |
| player_id | varchar(100) | NOT NULL | 玩家 ID |
| item_id | varchar(160) | NOT NULL | 装备模板 ID |
| highest_level | bigint | NOT NULL, DEFAULT 0 | 历史最高强化等级 |
| levels_payload | jsonb | NOT NULL, DEFAULT '[]' | 各等级尝试记录 |
| action_started_at | bigint | | 本次强化开始时间 |
| action_ended_at | bigint | | 本次强化结束时间 |
| start_level | bigint | | 起始等级 |
| initial_target_level | bigint | | 初始目标等级 |
| desired_target_level | bigint | | 期望目标等级 |
| protection_start_level | bigint | | 保护起始等级 |
| status | varchar(32) | | 状态 |
| updated_at | timestamptz | DEFAULT now() | |

**索引**：player_id + item_id ASC

**特点**：
- 记录每件装备的强化历史，用于保护机制和统计
- 结算时走"强持久化事务域"

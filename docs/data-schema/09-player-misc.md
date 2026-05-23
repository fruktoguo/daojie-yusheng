# 消息、统计、离线收益、恢复水位

## player_logbook_message

玩家日志消息（系统通知、战斗日志等）。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | NOT NULL | 玩家 ID |
| message_id | varchar(180) | NOT NULL | 消息 ID |
| kind | varchar(32) | NOT NULL | 类型（system/chat/quest/combat/loot/grudge） |
| text | text | NOT NULL | 消息文本 |
| from_name | varchar(120) | | 发送者名称 |
| occurred_at | bigint | NOT NULL | 发生时间 |
| acked_at | bigint | | 确认时间 |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(player_id, message_id)

**索引**：player_id + occurred_at DESC

**特点**：
- 有上限（最多 200 条），超出时淘汰最旧的
- 属于"最终一致 flush 域"

---

## player_statistic_day_total

玩家每日统计汇总。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | NOT NULL | 玩家 ID |
| day_key | varchar(16) | NOT NULL | 日期键（如 "2026-06-15"） |
| spirit_gained | double precision | NOT NULL, DEFAULT 0 | 当日获得灵石 |
| spirit_lost | double precision | NOT NULL, DEFAULT 0 | 当日消耗灵石 |
| progress_gained | double precision | NOT NULL, DEFAULT 0 | 当日获得修为 |
| progress_lost | double precision | NOT NULL, DEFAULT 0 | 当日消耗修为 |
| technique_gained | double precision | NOT NULL, DEFAULT 0 | 当日功法经验获得 |
| technique_lost | double precision | NOT NULL, DEFAULT 0 | 当日功法经验消耗 |
| profession_gained | double precision | NOT NULL, DEFAULT 0 | 当日职业经验获得 |
| profession_lost | double precision | NOT NULL, DEFAULT 0 | 当日职业经验消耗 |
| created_at | timestamptz | DEFAULT now() | |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(player_id, day_key)

**索引**：player_id + day_key DESC

**特点**：
- 每日一行，用于离线收益计算和运营统计
- 跨日时自动创建新行

---

## player_offline_gain_session

玩家离线收益会话（当前离线期间的基线快照）。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | PK | 玩家 ID |
| session_id | varchar(180) | NOT NULL | 会话 ID |
| started_at | bigint | NOT NULL | 离线开始时间 |
| baseline_payload | jsonb | NOT NULL | 离线时的基线状态 |
| accumulated_payload | jsonb | DEFAULT '{}' | 累计收益 |
| accumulated_duration_ms | bigint | DEFAULT 0 | 累计离线时长 |
| created_at | timestamptz | DEFAULT now() | |
| updated_at | timestamptz | DEFAULT now() | |

**特点**：
- 玩家下线时创建，上线时结算并删除
- `baseline_payload` 记录离线时的修炼状态，用于计算收益

---

## player_offline_gain_report

离线收益结算报告。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | NOT NULL | 玩家 ID |
| report_id | varchar(180) | NOT NULL | 报告 ID |
| started_at | bigint | NOT NULL | 离线开始时间 |
| ended_at | bigint | NOT NULL | 离线结束时间 |
| duration_ms | bigint | NOT NULL, DEFAULT 0 | 离线时长 |
| payload | jsonb | NOT NULL | 收益详情 |
| created_at | timestamptz | DEFAULT now() | |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(player_id, report_id)

**索引**：player_id + ended_at DESC

**特点**：
- 上线时生成，展示给玩家"离线期间获得了什么"
- 保留历史记录供查询

---

## player_recovery_watermark

玩家分域恢复水位，记录每个域的最新持久化版本。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | PK | 玩家 ID |
| identity_version | bigint | NOT NULL, DEFAULT 0 | 身份域版本 |
| presence_version | bigint | NOT NULL, DEFAULT 0 | 在线状态版本 |
| anchor_version | bigint | NOT NULL, DEFAULT 0 | 世界锚点版本 |
| position_checkpoint_version | bigint | NOT NULL, DEFAULT 0 | 位置检查点版本 |
| vitals_version | bigint | NOT NULL, DEFAULT 0 | 生命值版本 |
| progression_version | bigint | NOT NULL, DEFAULT 0 | 成长版本 |
| attr_version | bigint | NOT NULL, DEFAULT 0 | 属性版本 |
| wallet_version | bigint | NOT NULL, DEFAULT 0 | 钱包版本 |
| inventory_version | bigint | NOT NULL, DEFAULT 0 | 背包版本 |
| market_storage_version | bigint | NOT NULL, DEFAULT 0 | 市场仓库版本 |
| equipment_version | bigint | NOT NULL, DEFAULT 0 | 装备版本 |
| technique_version | bigint | NOT NULL, DEFAULT 0 | 功法版本 |
| body_training_version | bigint | NOT NULL, DEFAULT 0 | 炼体版本 |
| buff_version | bigint | NOT NULL, DEFAULT 0 | Buff 版本 |
| quest_version | bigint | NOT NULL, DEFAULT 0 | 任务版本 |
| map_unlock_version | bigint | NOT NULL, DEFAULT 0 | 地图解锁版本 |
| combat_pref_version | bigint | NOT NULL, DEFAULT 0 | 战斗偏好版本 |
| auto_battle_skill_version | bigint | NOT NULL, DEFAULT 0 | 自动技能版本 |
| auto_use_item_rule_version | bigint | NOT NULL, DEFAULT 0 | 自动用药版本 |
| profession_version | bigint | NOT NULL, DEFAULT 0 | 职业版本 |
| alchemy_preset_version | bigint | NOT NULL, DEFAULT 0 | 炼丹预设版本 |
| active_job_version | bigint | NOT NULL, DEFAULT 0 | 活跃作业版本 |
| enhancement_record_version | bigint | NOT NULL, DEFAULT 0 | 强化记录版本 |
| logbook_version | bigint | NOT NULL, DEFAULT 0 | 日志版本 |
| mail_version | bigint | NOT NULL, DEFAULT 0 | 邮件版本 |
| mail_counter_version | bigint | NOT NULL, DEFAULT 0 | 邮件计数版本 |
| updated_at | timestamptz | DEFAULT now() | |

**特点**：
- 每次 flush 成功后递增对应域的版本号
- 崩溃恢复时对比版本号，判断哪些域数据有效
- 防止旧数据覆盖新数据

# 任务与地图解锁

## player_quest_progress

玩家任务进度，每个任务一行。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | NOT NULL | 玩家 ID |
| quest_id | varchar(160) | NOT NULL | 任务 ID |
| status | varchar(32) | NOT NULL | 状态（active/completed/failed） |
| progress_payload | jsonb | | 进度数据（击杀数/收集数等） |
| raw_payload | jsonb | NOT NULL | 完整任务运行时状态 |
| updated_at | timestamptz | DEFAULT now() | |

**主键**：(player_id, quest_id)

**索引**：player_id + status ASC + quest_id ASC

**特点**：
- `progress_payload` 存结构化进度（如 `{ "kill_wolf": 3, "collect_herb": 5 }`）
- `raw_payload` 存完整任务运行时状态（对话进度、阶段等）
- 任务完成后行保留（status=completed），用于前置条件判断
- 属于"最终一致 flush 域"

---

## player_map_unlock

（已在 02-player-world.md 中描述）

玩家已解锁地图列表，只增不删。

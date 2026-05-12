# MMO 商业级数据落盘方案

## 1. 文档定位

本文档描述 `道劫余生` 面向商业级 MMO 的数据落盘终局方案。

执行口径（2026-04-28 起）：数据层一次性商业级硬切。正式完成口径以"无兼容 runtime 读写路径、无资产 fallback、无高频整包/整域刷盘"为准。

相关文档：
- [main主线玩家数据分表方案.md](./main主线玩家数据分表方案.md) — 玩家域具体拆表
- [持久化设计.md](./持久化设计.md) — 调度、真源边界、刷盘域拆分

## 2. 目标运行环境

8 核 / 16GB / 30Mbps 单服，5000 并发玩家，10000 地图实例。

## 3. 约束

### 世界模型

- 服务端权威 tick MMO，1Hz
- 地图模板是静态真源，实例才是运行态世界
- 运行态实例可达 10000
- 不同实例持久化价值不同（permanent / long_lived / session / ephemeral）

### 数据访问

- 高频逻辑不能被数据库写入阻塞
- Redis 可承载在线热态，但不是正式真源
- PostgreSQL 是"下次还在"的唯一正式真源
- 资产类操作成功返回前必须完成持久化提交
- 客户端不拥有决定正确性的真源

### 落盘目标

- 玩家掉线、重连、重启后状态正确
- 地图实例按策略恢复，不全量恢复
- 单玩家写放大足够小
- 单实例写放大足够小
- 可审计、可回放、可恢复

## 4. 一致性等级

| 等级 | 内容 | 要求 |
|------|------|------|
| L0 静态 | 地图/怪物/物品/NPC/任务模板 | 不在运行时修改，不参与在线刷盘 |
| L1 强持久化 | 货币、背包、装备、邮件领取、市场成交、任务奖励、位置迁移、实例所有权、GM 写操作 | 成功返回前必须提交；带幂等 operation_id；有审计日志 |
| L2 最终一致 | vitals、quest 进度、technique、buff、设置、地块资源、地面掉落、容器 | 1-5s 批量提交；允许 worker 合批；可恢复可重试 |
| L3 可重建 | 普通怪物、临时特效、AOI cache、路径缓存 | 不入正式真源；重启后重建 |

## 5. 总体架构

五层：

1. **静态内容真源层** — 地图/怪物/物品/NPC 模板，JSON 文件
2. **强持久化命令层** — durable_operation_log + outbox_event + asset_audit_log
3. **正式持久化真源层** — PostgreSQL 专表
4. **在线热态层** — 运行时内存 + Redis 投影
5. **落盘调度层** — 域级 dirty 标记 + 分域 batch flush worker

## 6. 真源拆分原则

- 玩家必须拆域，不能整档 JSON 重写
- 实例必须引入持久化策略（permanent / long_lived / session / ephemeral）
- 地图模板和实例状态彻底分离
- 怪物分为"可重建"和"必须持久化"两类
- 强资产操作必须走即时事务，不能只靠异步 flush

## 7. 玩家数据落盘

### 终局拆表总览

详见 [main主线玩家数据分表方案.md](./main主线玩家数据分表方案.md)。

| 分组 | 目标表 |
|------|--------|
| 身份与会话 | `player_identity` `player_presence` |
| 世界落点 | `player_world_anchor` `player_position_checkpoint` |
| 生存与成长 | `player_vitals` `player_progression_core` `player_attr_state` |
| 资产与装备 | `player_wallet` `player_inventory_item` `player_market_storage_item` `player_equipment_slot` |
| 功法与养成 | `player_technique_state` `player_body_training_state` `player_persistent_buff_state` |
| 任务与地图 | `player_quest_progress` `player_map_unlock` |
| 战斗偏好 | `player_combat_preferences` `player_auto_battle_skill` `player_auto_use_item_rule` |
| 职业与长作业 | `player_profession_state` `player_alchemy_preset` `player_active_job` `player_enhancement_record` |
| 消息与恢复 | `player_logbook_message` `player_recovery_watermark` `player_checkpoint` |

### 玩家刷盘策略

| 域 | 写入时机 |
|----|----------|
| `player_presence` | 登录/掉线/心跳即时写 |
| `player_world_anchor` | 跨实例迁移、死亡回点、登出时写 |
| `player_position_checkpoint` | 登出、跨图、GM 传送等关键节点写，不按每步移动刷库 |
| `player_vitals / progression / attr` | 2-5s 合批 |
| `player_technique / bodyTraining / buff / quest` | 1-3s 合批 |
| `player_map_unlock / combat_preferences / auto_*` | 改动即写或短 debounce |
| `player_wallet / inventory / equipment / active_job` | 走 durable operation 即时事务，不走定时 flush |

### 玩家恢复策略

按域分层恢复，不读整档快照：

1. `player_identity` + 账号显示名
2. `player_presence` + `player_world_anchor` + `player_position_checkpoint`
3. `player_vitals` + `player_progression_core` + `player_attr_state`
4. `player_wallet` + `player_inventory_item` + `player_equipment_slot`
5. 其余域按需加载
6. 组装运行时，重算派生态（viewRange、realmLv 等）

恢复规则：
- 优先读 `player_recovery_watermark`，只组装不高于该水位的已提交域版本
- checkpoint 仅用于加速，不覆盖正式真源
- 锚点指向失效实例时阻断登录，不做静默 fallback

## 8. 地图与实例数据落盘

### 静态模板

地图模板继续走 JSON 文件真源（`packages/server/data/maps/*`），不进业务数据库。

### 实例目录 `instance_catalog`

核心字段：

| 字段 | 说明 |
|------|------|
| `instance_id` | 实例主键 |
| `template_id` | 地图模板 |
| `instance_type` | main_line / realm_public / sect_private / dwelling_private / dungeon_session |
| `persistent_policy` | permanent / long_lived / session / ephemeral |
| `owner_player_id / owner_sect_id` | 归属 |
| `assigned_node_id / lease_token / lease_expire_at / ownership_epoch` | 所有权与租约 |
| `status` | active / idle / archived / destroyed |
| `runtime_status` | active / sleeping / migrating / recovering / offline |

### 实例状态拆域

| 表 | 内容 |
|----|------|
| `instance_tile_resource_state` | 相对模板基线被改过的地块资源（只存 diff） |
| `instance_ground_item` | 地面物品堆 |
| `instance_container_state` | 容器运行态（拆 state/entry/timer） |
| `instance_monster_runtime_state` | 高价值怪物状态（世界 Boss、宗门守卫等） |
| `instance_event_state` | 实例事件状态 |
| `instance_overlay_chunk` | 大地图分块覆盖层 |
| `instance_recovery_watermark` | 各域恢复水位 |

### 实例恢复策略

- 启动时只恢复 `instance_catalog`，实例状态惰性加载
- permanent + 仍在 TTL 内的 long_lived + 有玩家落点引用的实例才恢复
- session/ephemeral 不恢复

恢复顺序：catalog → 认领 lease → 校验 epoch → 读 watermark → 加载分域 → 组装运行时 → 标记 active

### 实例所有权规则

1. 任一时刻一个实例只有一个有效执行所有者
2. 所有写入必须附带当前 `ownership_epoch` 或 `lease_token`
3. 旧节点失去 lease 后写入全部拒绝
4. 迁移前先切换 catalog 所有权，再允许目标节点恢复
5. 没有有效 lease 的 worker 不允许刷该实例

## 9. 怪物与世界对象策略

| 对象 | 持久化 | 恢复方式 |
|------|--------|----------|
| 普通刷怪怪物 | 不持久化 | 从模板 + spawn rule 重建 |
| 世界 Boss / 宗门守卫 / 洞府守护灵 | `instance_monster_runtime_state` | 从表恢复 |
| 普通怪物掉落 | 按 TTL 落盘，过期清理 | 重启后允许清空 |
| 玩家丢弃物 / 任务物 / 高价值掉落 | 正式落盘 | 从表恢复 |

## 10. 落盘调度

### Worker 类型

- `player-domain-flush-worker` — 玩家最终一致域
- `instance-domain-flush-worker` — 实例最终一致域
- `checkpoint-compaction-worker` — 低峰期 checkpoint
- `outbox-dispatcher` — 事件投递

### 调度规则

1. 从 flush ledger 认领 `latest_version > flushed_version` 的条目
2. Redis 只负责加速唤醒，不负责 dirty 真源
3. 合并短时间内重复改动
4. 按 batch size 写库
5. 成功后推进 `flushed_version`
6. 失败进入 retry 队列

### 批次参数

| 域 | batch size | 间隔 |
|----|-----------|------|
| 玩家 presence | 事件触发即时写 | — |
| 玩家 worldAnchor / positionCheckpoint | 128-256 | 1s |
| 玩家 vitals / progression / attr | 128 | 2-5s |
| 玩家 quest / technique / buff | 128 | 1-3s |
| 玩家 activeJob 进度 | 64-128 | 1-3s |
| 实例 tile resource | 256 | 2s |
| 实例 ground item | 128 | 1-2s |
| 实例 container | 64 | 1-3s |
| outbox-dispatcher | 512 | 1s 轮询 |

### 事务边界

- 单玩家单域一个事务，不做世界全局大事务
- 不把多个玩家、多个实例混成一个事务

### 强持久化命令链

以下操作走即时事务（durable operation）：
- 货币增减、背包变更、装备穿戴/卸下
- 邮件附件领取、市场成交
- 关键任务奖励、跨实例迁移、实例 lease 变更

要求：
- 每个命令带 `operation_id`（幂等）
- worker 重试可重复提交而不重复生效
- outbox 投递失败不影响主事务
- 失败事件进 dead-letter 队列

## 11. 表结构总览

### 正式真源表

**玩家域**：player_identity / player_presence / player_session_route / player_world_anchor / player_position_checkpoint / player_vitals / player_progression_core / player_attr_state / player_wallet / player_inventory_item / player_market_storage_item / player_equipment_slot / player_technique_state / player_body_training_state / player_persistent_buff_state / player_quest_progress / player_map_unlock / player_combat_preferences / player_auto_battle_skill / player_auto_use_item_rule / player_profession_state / player_alchemy_preset / player_active_job / player_enhancement_record / player_logbook_message / player_mail / player_mail_attachment / player_mail_counter / player_recovery_watermark / player_checkpoint / player_flush_ledger

**实例域**：instance_catalog / instance_tile_resource_state / instance_ground_item / instance_container_state / instance_monster_runtime_state / instance_event_state / instance_overlay_chunk / instance_formation_state / instance_recovery_watermark / instance_checkpoint / instance_flush_ledger

**基础设施**：node_registry / durable_operation_log / outbox_event / asset_audit_log / dead_letter_event

### 分区策略

| 表 | 分区方式 |
|----|----------|
| player_inventory_item / player_market_storage_item / player_wallet | hash(player_id) |
| instance_ground_item / instance_tile_resource_state / instance_container_state | hash(instance_id) |
| durable_operation_log / outbox_event / asset_audit_log / dead_letter_event | 按 created_at 月分区 |

### TTL 与清理

- 普通地面掉落：TTL 到期后异步清理
- destroyed/expired 实例：先归档 catalog，再批量清理子表
- 审计与命令日志：热表 7-30 天，冷数据归档

## 12. 硬切任务包

| 任务包 | 目标 | 状态 |
|--------|------|------|
| 1. 玩家真源硬切 | 玩家恢复从 player_* 分域装配，不读旧快照 | 已完成 |
| 2. 强资产命令链 | 资产操作走 durable operation 即时事务 | 已完成 |
| 3. 玩家完整域补齐 | 补齐 progression/attr/technique/quest/buff 等域 | 已完成 |
| 4. 实例目录化 | instance_catalog + 惰性恢复 | 已完成 |
| 5. 实例 lease 与路由 | 所有权 fencing + 会话路由分离 | 已完成 |
| 6. 实例状态拆域 | 旧地图快照删除，row-level delta | 已完成 |

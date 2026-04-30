# main 主线落盘硬切后旧链路边界清单

## 1. 文档定位

本文记录 `mud-mmo-next` 在 2026-04-28 数据层硬切后的旧落盘链路边界。它不再列“后续慢慢删”的兼容任务，而是说明：

- 正式 runtime 已经不能再触发哪些旧链路
- 仓库里仍保留哪些离线迁移、历史导入或审计工具
- 哪些直接运行态写法只是 durable 成功后的内存回填，不再算 fallback

进度与终局验收口径仍以 [计划/商业级数据落盘改造计划.md](./计划/商业级数据落盘改造计划.md) 为准。

## 2. 当前结论

当前代码口径已经从“新体系为主、旧链路兜底”切到：

- 玩家恢复、GM 玩家查询、GM 广播收件人枚举、durable asset 写入不再依赖 `server_player_snapshot`。
- 地图 runtime 不再读写旧 map snapshot；`MapPersistenceService.loadMapSnapshot()` 返回空，`saveMapSnapshot()` 直接拒绝。
- 兑换码、建议、GM auth、GM 地图配置、宗门、市场订单、市场成交历史、市场托管仓、爱发电配置/订单、数据库备份元数据和数据库任务状态已经从 `persistent_documents` 迁到专表或结构化玩家表。
- 兑换码奖励、战斗掉落、PvP 奖励、NPC 任务奖励、GM 钱包/发物入口缺少 durable 条件时返回硬错误，不再直写运行态资产作为 fallback。
- 新增 `persistence-retirement-audit` 静态门禁，用于阻断主线 runtime 重新读写旧快照或通用文档桶真源。

所以当前文档结论是：

> 旧快照、旧业务文档和 direct asset fallback 已从正式 runtime 主线移除；仓库残留只允许服务于离线转换、历史 JSON 备份导入、审计和少量迁移 smoke。

## 3. 已删除的正式 runtime 角色

### 3.1 `server_player_snapshot`

已从以下正式路径移除：

- `AppModule` 不再注册 `PlayerPersistenceService`。
- `WorldPlayerSnapshotService`、`WorldPlayerSourceService` 不再回读旧整档快照。
- GM 玩家管理、GM 状态查询、GM 邮件广播收件人枚举改为从 `PlayerDomainPersistenceService.listProjectedSnapshots()` 装配。
- `DurableOperationService` 不再顺手写 `server_player_snapshot`。
- `PlayerPersistenceFlushService` 不再写整档 checkpoint。

仍保留的边界：

- [packages/server/src/persistence/player-persistence.service.ts](/home/yuohira/mud-mmo-next/packages/server/src/persistence/player-persistence.service.ts:7) 仍存在，作为离线迁移、旧 dump 转换、历史 smoke 的输入读取工具。
- 任何正式 runtime provider 重新注入它，都会被 `persistence-retirement-audit` 视为失败。

### 3.2 旧地图快照

已从以下正式路径移除：

- 地图恢复主链只从 `instance_catalog`、`instance_*` 分域表和 checkpoint 恢复。
- `MapPersistenceFlushService` 不再调用 `saveMapSnapshot()`。
- `MapPersistenceService` 不再初始化 `persistent_documents`，`loadMapSnapshot()` 返回 `null`，`saveMapSnapshot()` 抛出 `legacy_map_snapshot_disabled:use_instance_domain_persistence`。

仍保留的边界：

- 旧地图 JSON 只允许被离线 converter 或迁移审计读取。
- 正式启动、恢复、GM 普通操作、刷盘不得回退旧 map JSON。

### 3.3 `persistent_documents`

以下业务 scope 已退出 runtime 真源：

| 旧 scope / 旧用途 | 新真源 |
| --- | --- |
| `server_redeem_codes_v1` | `server_redeem_code_state / server_redeem_code_group / server_redeem_code` |
| `server_suggestions_v1` | `server_suggestion_state / server_suggestion` |
| `server_gm_auth_v1` | `server_gm_auth` |
| `server_gm_map_config_v1` | `server_gm_map_config` |
| `server_market_orders_v1` | `server_market_order` |
| `server_market_trade_history_v1` | `server_market_trade_history` |
| `server_market_storage_v1` | `player_market_storage_item` |
| `server_sects_v1` | `server_sect` |
| `server_afdian_config_v1` | `server_afdian_config` |
| `server_afdian_orders_v1` | `server_afdian_order` |
| `server_db_backups_v1` | `server_db_backup_metadata` |
| `server_db_jobs_v1` | `server_db_job_state` |
| 旧 mailbox JSON | `player_mail / player_mail_attachment / player_mail_counter` |

仍保留的边界：

- `persistent_documents` 表工具只给历史 JSON 备份导入、离线迁移和审计工具使用。
- `NativeGmAdminService` 对 legacy JSON 备份恢复会懒初始化该表，但普通 runtime 初始化和业务服务不再把它当真源。

## 4. 已删除的 direct fallback

### 4.1 兑换码奖励

- 钱包奖励必须走 `DurableOperationService.mutatePlayerWallet()`。
- 非钱包奖励必须走 `DurableOperationService.grantInventoryItems()`。
- session、lease、owner 或 durable service 不满足时抛错，不再直接写背包或钱包。

### 4.2 战斗掉落与 PvP 奖励

- 可进入背包的奖励走 durable grant。
- 背包满导致地面掉落是玩法结果，不是绕过持久化的 fallback。
- durable 条件不满足时抛错，不再直接 `receiveInventoryItem()`。

### 4.3 NPC 任务奖励

- 任务扣物、发物、发钱统一走 `submitNpcQuestRewards()` durable 事务。
- durable 条件不满足时抛错，不再直接扣背包、发背包或发钱包。

### 4.4 GM 钱包和发物

- GM 钱包变更和发物路由都要求 session fencing、instance lease 与 durable service。
- durable 提交成功后允许回写运行态内存；提交前不允许 direct runtime write。

## 5. 仍允许存在的“直接运行态写法”

仓库里仍会看到：

- `receiveInventoryItem(...)`
- `creditWallet(...)`
- 运行态容器或地面物品变化

这些只有在以下场景才允许：

- durable 事务已经提交，随后把已提交结果同步回运行态内存。
- 背包满导致地面掉落，且该地面物品属于实例分域持久化真源。
- 新号初始化、GM 显式修复或离线迁移工具在受控流程里写入正式结构化表。

如果出现“durable 不可用 -> 直接写运行态并继续成功返回”，即视为硬切回退，门禁必须失败。

## 6. 当前验证入口

旧真源退役静态门禁：

```bash
pnpm --filter @mud/server audit:persistence-retirement
```

重点证明：

- 玩家、地图、GM、坊市、兑换码、建议、宗门主线不再使用旧整档快照或 `persistent_documents` 真源。
- durable operation 不再维护旧玩家整档表。
- 会话恢复不再回读或补种旧 `server_player_snapshot`。

仍需单独证明的内容：

- `verify:release:with-db / shadow / acceptance / full` 全套门禁。
- 迁移 dry-run、真实迁移、回滚演练和备份恢复演练。
- 1000 玩家、1000 实例规模下的 p95/p99、worker backlog、数据库连接池和故障注入报告。

## 7. 一句话结论

正式 runtime 的旧快照、旧业务文档和资产 direct fallback 已完成硬切；剩下的不是兼容运行路径，而是离线迁移、历史导入、审计和容量验证边界。

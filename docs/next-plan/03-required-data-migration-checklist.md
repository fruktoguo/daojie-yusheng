# 03 必须迁移的数据清单

目标：先把“必须迁什么”写清，再动迁移脚本。

## 状态分类规则

只要是“下次还在”的状态，正式真源必须落数据库。

迁移时每个数据域都按这四层判断：

1. 正式真源是谁
2. 运行时副本是谁
3. legacy 来源是什么
4. 这项是必须迁移、建议迁移，还是可以重建

状态级别约定：

- `必须迁移`：不迁会导致玩家资产、账号身份、核心进度或管理能力丢失
- `建议迁移`：不迁不会让主链失效，但会造成玩家体验或运营数据明显损失
- `可重建`：可以直接丢弃，由 next 按默认值或新规则重建

## 真源总表

| 数据域 | 迁移级别 | next 正式真源 | 运行时副本 | 当前可确认的 legacy 来源 | 迁移建议 |
| --- | --- | --- | --- | --- | --- |
| 账号认证记录 | 必须迁移 | `server_next_player_auth` 专表 | `NextPlayerAuthStoreService` 内存索引 | 旧 `persistent_documents` scope `server_next_player_auth_v1`；更旧 legacy 账号表来源待锁定 | 迁移到 next auth 专表，不再继续依赖 legacy 账号表 |
| 玩家身份映射 | 必须迁移 | `server_next_player_identity` 专表 | auth/bootstrap 链路内存态 | 旧 `persistent_documents` scope `server_next_player_identities_v1`；compat identity backfill 来源待锁定 | 迁移成 `userId/username/playerId/displayName/playerName` 单一映射 |
| 玩家持久化快照 | 必须迁移 | `server_next_player_snapshot` 专表 | `PlayerRuntimeService` 在线玩家状态 | 旧 `persistent_documents` scope `server_next_player_snapshots_v1`；显式 migration snapshot 来源待锁定 | 迁成 next snapshot，不再运行时回退 compat |
| 玩家在线时长与登录态衍生字段 | 建议迁移 | `server_next_player_auth` 专表中的在线字段 | `NextPlayerAuthStoreService` / session 链 | 旧 auth 文档或 legacy 账号表来源待锁定 | 能迁就迁；迁不了可保守置零 |
| 地图运行环境快照 | 建议迁移 | `persistent_documents` scope `server_next_map_aura_v1` | map/world runtime 实例态 | `legacy/server/src/game/map.service.ts` 的 `runtime/map-aura-state.json` | 如果你不要求继承地图演化，可直接重建 |
| 邮件箱 | 必须迁移 | `persistent_documents` scope `server_next_mailboxes_v1` | `MailRuntimeService` | legacy mailbox 来源待锁定 | 邮件、附件、已读/领取/删除状态都要迁 |
| 市场订单 | 建议迁移 | `persistent_documents` scope `server_next_market_orders_v1` | `MarketRuntimeService` | `market_orders` 表 | 如果市场要延续，必须迁；否则可在切服时清盘 |
| 市场成交历史 | 建议迁移 | `persistent_documents` scope `server_next_market_trade_history_v1` | `MarketRuntimeService` | `market_trade_history` 表 | 可迁可不迁，取决于是否保留历史展示 |
| 市场暂存仓库 | 必须迁移 | `persistent_documents` scope `server_next_market_storage_v1` | `MarketRuntimeService` | `players.market_storage` / `players.marketStorage` | 这是玩家资产，默认必须迁 |
| 建议与回复 | 建议迁移 | `persistent_documents` scope `server_next_suggestions_v1` key `global` | `SuggestionRuntimeService` | legacy suggestion 来源待锁定 | 如果你要保留社区上下文则迁，否则可清空 |
| 兑换码组与兑换状态 | 必须迁移 | `persistent_documents` scope `server_next_redeem_codes_v1` key `global` | `RedeemCodeRuntimeService` | legacy redeem-code 来源待锁定 | 默认必须迁，避免重复兑换或运营丢单 |
| GM 密码记录 | 必须迁移 | `persistent_documents` scope `server_next_gm_auth_v1` key `gm_auth` | `RuntimeGmAuthService` 内存记录 | 兼容 scope `server_next_legacy_gm_auth_v1`、`server_config` | 至少迁当前有效 GM 密码记录 |
| GM 数据库备份元数据 / 作业状态 | 建议迁移 | `persistent_documents` scopes `server_next_db_backups_v1` / `server_next_db_jobs_v1` | `NextGmAdminService` | legacy 对应 scope 已存在兼容读 | 如切服前要保留运维记录则迁 |
| Afdian 配置与订单 | 待确认 | `persistent_documents` scopes `server_next_afdian_config_v1` / `server_next_afdian_orders_v1` | `NextGmAdminService` | legacy 对应 scope 已存在兼容读 | 若当前线上在用，升级为必须迁移；否则可暂缓 |

## “下次还在”状态矩阵

下面这张表只保留当前 hard cut 还必须明确的长期状态，统一写清真源、副本、legacy 来源和转换口径。

| 数据域 | next 正式真源 | 运行时副本 | legacy 来源 | 转换规则 |
| --- | --- | --- | --- | --- |
| auth | `server_next_player_auth` | `NextPlayerAuthStoreService` | `server_next_player_auth_v1` 文档；更旧 legacy 账号表 | 归一成 `user_id/username/player_id/password_hash/online fields`，非法主键整条失败 |
| identity | `server_next_player_identity` | auth/bootstrap 链内存态 | `server_next_player_identities_v1` 文档；显式 migration identity 源 | 归一成单一 `userId/username/playerId/displayName/playerName` 映射，非法主键整条失败 |
| snapshot | `server_next_player_snapshot` | `PlayerRuntimeService` 在线态 | `server_next_player_snapshots_v1` 文档；显式 migration snapshot 源 | 主链只认 next snapshot；legacy 只允许一次性迁移或显式 backfill |
| progression / attrs | `server_next_player_snapshot.payload.progression/attrs` | `PlayerRuntimeService` 数值态 | legacy snapshot 内的 progression/attrs 字段 | 基础成长字段保留；非法派生字段直接丢弃并由 next 重算 |
| inventory / equipment | `server_next_player_snapshot.payload.inventory/equipment` | `PlayerRuntimeService` 背包/装备态 | legacy snapshot 内的 inventory/equipment 字段 | 物品与槽位逐项归一；非法子项跳过；缺失补 starter 或空槽 |
| techniques | `server_next_player_snapshot.payload.techniques` | `PlayerRuntimeService` 修炼态 | legacy snapshot 内的 techniques 字段 | 保留可恢复的功法/修炼字段，非法等级/经验回最小合法值 |
| quests | `server_next_player_snapshot.payload.quests` | `PlayerRuntimeService` 任务态 | legacy snapshot 内的 quests 字段 | 保留 next 可恢复的任务条目、目标状态和奖励领取态，非法子项跳过 |
| mail | `persistent_documents(server_next_mailboxes_v1)` | `MailRuntimeService` | `mail_campaigns / mail_audience_members / player_mail_receipts` | 按玩家聚合邮箱；非法邮件或附件子项跳过，其余继续写入 |
| market | `persistent_documents(server_next_market_orders_v1/server_next_market_trade_history_v1/server_next_market_storage_v1)` | `MarketRuntimeService` | `market_orders / market_trade_history / players.marketStorage 或 market_storage` | 订单、成交、暂存仓库分别归一；非法单条跳过，其余继续写入 |
| suggestion | `persistent_documents(server_next_suggestions_v1, global)` | `SuggestionRuntimeService` | `suggestions` 表；兜底 `runtime/suggestions.json` | 过滤非法建议/回复子项，保留有效记录并重排 revision |
| redeem | `persistent_documents(server_next_redeem_codes_v1, global)` | `RedeemCodeRuntimeService` | `redeem_code_groups / redeem_codes` | 分组与兑换码分别归一，孤儿 group/code 直接跳过 |
| gm-auth | `persistent_documents(server_next_gm_auth_v1, gm_auth)` | `RuntimeGmAuthService` | `server_next_legacy_gm_auth_v1 / server_config` | legacy bcrypt 或 next 形态统一归一成 `hash/salt/updatedAt` |
| gm-database | `persistent_documents(server_next_db_backups_v1/server_next_db_jobs_v1)` | `NextGmAdminService` | `server_next_legacy_db_backups_v1 / server_next_legacy_db_jobs_v1` | backup/job 元数据分别归一，非法 payload 回默认值并记失败清单 |
| map aura | `persistent_documents(server_next_map_aura_v1)` | map/world runtime 实例态 | `legacy/server/src/game/map.service.ts` 导出的 `runtime/map-aura-state.json` | 若不要求继承演化可重建；要继承则按 mapId 逐图归一 |

## 玩家快照内部迁移项

下面这些属于玩家快照里的核心内容，默认按“必须迁移”处理。

| 子域 | 迁移级别 | next 目标 | 默认值策略 | 备注 |
| --- | --- | --- | --- | --- |
| 基础身份 | 必须迁移 | `name` `displayName` | 缺失时回退到账号映射 | 不应和 auth 映射冲突 |
| 位置与朝向 | 必须迁移 | `placement.instanceId/templateId/x/y/facing` | 缺失 `instanceId` 时按 `public:${templateId}` 补公共实例；缺 `templateId` 时回默认出生点 | 这是进世界最基础数据，`instanceId` 已开始收为正式落点入口 |
| 血量与灵力 | 必须迁移 | `vitals.hp/maxHp/qi/maxQi` | 上限缺失时按 starter 修复 | 不应迁出非法值 |
| 战斗开关 | 建议迁移 | `combat.*` | 缺失时按 next 默认关闭或兜底 | 可接受部分重置 |
| 基础属性 | 必须迁移 | `attrs.baseAttrs/finalAttrs/numericStats` | 缺失时按 next 重算 | 如果能由基础属性重算，可迁基础不迁派生 |
| 境界与进度 | 必须迁移 | `progression.realm` 等 | 缺失时按最低境界 | 核心成长，不应丢 |
| 功法列表与当前修炼 | 必须迁移 | `techniques.techniques/cultivatingTechId` | 缺失时空列表 | 核心成长，不应丢 |
| 背包 | 必须迁移 | `inventory.capacity/items` | 缺失时 starter inventory | 玩家资产 |
| 装备 | 必须迁移 | `equipment.slots` | 缺失时空装备 | 玩家资产 |
| 任务 | 必须迁移 | `quests.entries` | 缺失时空任务 | 主线/支线进度 |
| Buff | 建议迁移 | `buffs.buffs` | 可清空重建 | 临时态较强，可视规则决定 |
| 挂机/日志本消息 | 可重建 | `pendingLogbookMessages` 等 | 可直接清空 | 更适合视为会话态 |
| runtimeBonuses | 可重建 | `runtimeBonuses` | 直接由 next 重算 | 不应把运行时 bonus 当正式真源 |

## 已补到字段级的核心阻塞域

### 账号认证记录 `server_next_player_auth`

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| `payload.id` / `payload.userId` / `key` | `user_id` | 取首个非空字符串 | 缺失则整条失败 |
| `payload.username` / `payload.accountName` / `payload.loginName` | `username` | 取首个非空字符串并按 next 账号规范使用 | 缺失则整条失败 |
| `payload.playerId` / `payload.roleId` / `payload.pendingRoleName` / `payload.playerName` | `player_id` | 取首个非空字符串 | 缺失则整条失败 |
| `payload.pendingRoleName` / `payload.playerName` / `payload.roleName` | `pending_role_name` | 取首个非空字符串 | 缺失时回退 `player_id` |
| `payload.displayName` | `display_name` | 可空字符串归一成 `null` | 可缺失 |
| `payload.passwordHash` / `payload.password` | `password_hash` | 原样迁移 hash；不做重算 | 缺失则整条失败 |
| `payload.totalOnlineSeconds` | `total_online_seconds` | 归一为非负整数 | 缺失时置 `0` |
| `payload.currentOnlineStartedAt` | `current_online_started_at` | 统一转 ISO 时间戳 | 非法时置 `null` |
| `payload.createdAt` | `created_at` | 统一转 ISO 时间戳 | 非法时回当前时间并记失败清单 |
| legacy 整体 payload | `payload` | 补齐上述归一字段后整体写回 jsonb | 迁移时保留原始扩展字段 |

### 玩家身份映射 `server_next_player_identity`

legacy 来源当前锁定为：

- `legacy users`：`users.id -> userId`、`users.username -> username`、`users.displayName -> displayName`、`users.pendingRoleName -> pendingRoleName`
- `legacy players`：通过 `players.userId = users.id` 左连接补 `players.id -> playerId`、`players.name -> playerName`
- next 侧显式 migration 读取入口：`packages/server/src/network/world-player-source.service.js -> queryMigrationIdentityRow()`

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| `payload.userId` / `payload.id` / `key` | `user_id` | 取首个非空字符串 | 缺失则整条失败 |
| `payload.username` | `username` | 原样归一 | 缺失则整条失败 |
| `payload.playerId` / `payload.playerName` | `player_id` | 取首个非空字符串 | 缺失则整条失败 |
| `payload.displayName` | `display_name` | 可空字符串归一成 `null` | 可缺失 |
| `payload.playerName` / `payload.playerId` | `player_name` | 取首个非空字符串 | 缺失则整条失败 |
| `payload.persistedSource` | `persisted_source` | 保留 `native/legacy_backfill/legacy_sync/token_seed` | 缺失时置 `native` |
| legacy 整体 payload | `payload` | 补齐身份字段后整体写回 jsonb | 迁移时保留原始扩展字段 |

### 玩家快照 `server_next_player_snapshot`

legacy 来源当前锁定为：

- `legacy players`：`players.id` 单表直接作为 player snapshot 来源
- next 侧显式 migration 读取入口：`packages/server/src/network/world-player-source.service.js -> queryMigrationSnapshotRow()`
- 这条来源只服务显式 migration / backfill，不再是 next 主链真源

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| `payload.playerId` / `key` | `player_id` | 取首个非空字符串 | 缺失则整条失败 |
| `payload.placement.templateId` / `payload.templateId` | `template_id` | 取首个非空字符串 | 缺失则整条失败 |
| `payload.placement.instanceId` / `payload.instanceId` | `instance_id` | 取首个非空字符串；缺失时按 `public:${template_id}` 回填 | 允许兼容旧快照，但新主链应写真实实例落点 |
| `payload.__snapshotMeta.persistedSource` / `payload.persistedSource` | `persisted_source` | 保留 `native/legacy_seeded` 等来源标签 | 缺失时置 `native` |
| `payload.__snapshotMeta.seededAt` | `seeded_at` | 归一为非负整数 | 非法时置 `null` |
| `payload.savedAt` / `payload.__snapshotMeta.savedAt` | `saved_at` | 归一为非负整数 | 缺失时置当前毫秒时间 |
| legacy 整体 payload | `payload` | 原样保留为 next snapshot jsonb | 缺 placement / vitals 等关键结构则整条失败 |

### 玩家快照内部字段：背包 / 装备 / 功法 / 任务

#### 背包 `payload.inventory`

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| `payload.inventory.capacity` | `payload.inventory.capacity` | 归一为 `>= 0` 整数 | 非法时回退 starter capacity |
| `payload.inventory.items[].itemId` | `payload.inventory.items[].itemId` | 原样迁移 | 缺失则该物品跳过 |
| `payload.inventory.items[].count` | `payload.inventory.items[].count` | 归一为 `>= 1` 整数 | 非法时置 `1` |
| `payload.inventory.items[].enhanceLevel / durability / bindFlags` 等扩展字段 | `payload.inventory.items[]` | 保留 next 可识别字段，临时态字段剔除 | 不可识别字段保留在 payload 扩展区或剔除 |

#### 装备 `payload.equipment`

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| `payload.equipment.slots[].slot` | `payload.equipment.slots[].slot` | 原样迁移到 next 槽位名 | 缺失则该槽位跳过 |
| `payload.equipment.slots[].item` | `payload.equipment.slots[].item` | 复用背包物品归一规则 | 非法时该槽位置 `null` |
| legacy 未出现的 next 固定槽位 | `payload.equipment.slots[]` | 按 next 固定壳补空槽位 | 缺失时补 `item=null` |

#### 功法 / 修炼 `payload.techniques`

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| `payload.techniques.techniques[].techId` | `payload.techniques.techniques[].techId` | 原样迁移 | 缺失则该功法跳过 |
| `payload.techniques.techniques[].level` | `payload.techniques.techniques[].level` | 归一为 `>=1` 整数 | 非法时置 `1` |
| `payload.techniques.techniques[].exp` | `payload.techniques.techniques[].exp` | 归一为非负整数 | 非法时置 `0` |
| `payload.techniques.techniques[].skillsEnabled` | `payload.techniques.techniques[].skillsEnabled` | 归一为布尔值 | 缺失时按 next 默认 |
| `payload.techniques.cultivatingTechId` | `payload.techniques.cultivatingTechId` | 仅保留仍存在于技术列表中的 id | 不存在时置 `null` |

#### 任务 `payload.quests`

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| `payload.quests.entries[].questId` | `payload.quests.entries[].questId` | 原样迁移 | 缺失则该任务条目跳过 |
| `payload.quests.entries[].status` | `payload.quests.entries[].status` | 归一为 next 可识别状态值 | 非法时回退 `active` 或任务默认态 |
| `payload.quests.entries[].acceptedAt` | `payload.quests.entries[].acceptedAt` | 归一为毫秒整数或 `null` | 非法时置 `null` |
| `payload.quests.entries[].updatedAt` | `payload.quests.entries[].updatedAt` | 归一为毫秒整数或 `null` | 非法时置 `null` |
| `payload.quests.entries[].progress` / `steps` | `payload.quests.entries[]` | 仅保留 next 任务运行时可恢复字段 | 非法计数置 `0` |
| `payload.quests.entries[].objectiveStates[]` | `payload.quests.entries[].objectiveStates[]` | 仅保留 next 仍能恢复的目标计数/完成态字段 | 非法子项跳过 |
| `payload.quests.entries[].rewardsClaimed` | `payload.quests.entries[].rewardsClaimed` | 归一为布尔值 | 缺失时置 `false` |
| `payload.quests.entries[].completedAt` | `payload.quests.entries[].completedAt` | 归一为毫秒整数或 `null` | 非法时置 `null` |

#### 境界 / 属性 / 数值成长 `payload.progression` + `payload.attrs`

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| `payload.progression.realm.stage` | `payload.progression.realm.stage` | 归一为 `>=0` 整数 | 非法时置 `0` |
| `payload.progression.realm.realmLv` | `payload.progression.realm.realmLv` | 归一为 `>=1` 整数 | 非法时置 `1` |
| `payload.progression.realm.progress` | `payload.progression.realm.progress` | 归一为 `>=0` 整数 | 非法时置 `0` |
| `payload.progression.realm.progressToNext` | `payload.progression.realm.progressToNext` | 归一为 `>=1` 整数 | 非法时按 next 当前境界默认值 |
| `payload.progression.foundation/combatExp/bodyTraining.level/bodyTraining.exp` | next 同名字段 | 原样保留可恢复成长字段 | 非法时置 `0` |
| `payload.attrs.baseAttrs.*` | `payload.attrs.baseAttrs.*` | 仅保留 next 可识别属性键并归一为非负整数 | 缺失时按 starter 基础属性 |
| `payload.attrs.finalAttrs.*` | `payload.attrs.finalAttrs.*` | 若与 `baseAttrs` 一致可保留；若明显脏值则允许回退重算 | 非法时删除该段，由 next 重算 |
| `payload.attrs.numericStats.*` | `payload.attrs.numericStats.*` | 仅保留 next 仍直接持久化的标量；元素映射字段按子键归一 | 非法时删除该段，由 next 重算 |
| `payload.attrs.ratioDivisors.*` | `payload.attrs.ratioDivisors.*` | 仅保留 next 比例除数字段 | 非法时按 next 默认除数 |
| legacy 已废弃成长派生字段 | 不迁移 | 统一视为可重算派生值 | 缺失或非法时直接丢弃 |

### 邮件箱 `persistent_documents(scope=server_next_mailboxes_v1, key=playerId)`

legacy 来源当前锁定为：

- `legacy/server/src/database/entities/mail-campaign.entity.ts` -> 表 `mail_campaigns`
- `legacy/server/src/database/entities/mail-audience-member.entity.ts` -> 表 `mail_audience_members`
- `legacy/server/src/database/entities/player-mail-receipt.entity.ts` -> 表 `player_mail_receipts`

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| `mail_campaigns.id` | `mails[].mailId` | 原样迁移 uuid | 缺失则该邮件跳过 |
| `mail_campaigns.senderLabel` | `mails[].senderLabel` | 原样迁移 | 缺失时置 `司命台` |
| `mail_campaigns.templateId` | `mails[].templateId` | 字符串或 `null` | 可缺失 |
| `mail_campaigns.args` | `mails[].args` | 保留为数组 | 非数组时置空数组 |
| `mail_campaigns.fallbackTitle` | `mails[].fallbackTitle` | 字符串或 `null` | 可缺失 |
| `mail_campaigns.fallbackBody` | `mails[].fallbackBody` | 字符串或 `null` | 可缺失 |
| `mail_campaigns.attachments` | `mails[].attachments` | 过滤为 `{ itemId, count>=1 }[]` | 非法附件项剔除 |
| `mail_campaigns.createdAt` | `mails[].createdAt` | 归一为毫秒整数 | 非法时取 `Date.now()` 并记失败清单 |
| `mail_campaigns.updatedAt` | `mails[].updatedAt` | 归一为毫秒整数 | 非法时回退 `createdAt` |
| `mail_campaigns.expireAt` | `mails[].expireAt` | 归一为毫秒整数或 `null` | 非法时置 `null` |
| `player_mail_receipts.firstSeenAt` | `mails[].firstSeenAt` | 归一为毫秒整数或 `null` | 非法时置 `null` |
| `player_mail_receipts.readAt` | `mails[].readAt` | 归一为毫秒整数或 `null` | 非法时置 `null` |
| `player_mail_receipts.claimedAt` | `mails[].claimedAt` | 归一为毫秒整数或 `null` | 非法时置 `null` |
| `player_mail_receipts.deletedAt` | `mails[].deletedAt` | 归一为毫秒整数或 `null` | 非法时置 `null` |
| `mail_audience_members.playerId` / `player_mail_receipts.playerId` | `persistent_documents.key` | 统一收成 player mailbox key | 缺失则该玩家邮箱跳过 |
| 按玩家聚合后的 legacy 邮件集 | `payload.revision` | 取聚合后邮件数，最少为 `1` | 空邮箱时置 `1` |
| 按玩家聚合后的 legacy 邮件集 | `payload.mails` | 过滤非法邮件后按 `createdAt desc, mailId asc` 排序 | 全部非法时写空邮箱 |

### 建议与回复 `persistent_documents(scope=server_next_suggestions_v1, key=global)`

legacy 来源当前锁定为：

- 主来源：`legacy/server/src/database/entities/suggestion.entity.ts` -> 表 `suggestions`
- 兜底来源：`legacy/server/data/runtime/suggestions.json`

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| `suggestions.id` | `suggestions[].id` | 原样迁移 uuid | 缺失则该建议跳过 |
| `suggestions.authorId` | `suggestions[].authorId` | 原样迁移 | 缺失则该建议跳过 |
| `suggestions.authorName` | `suggestions[].authorName` | 原样迁移 | 缺失时回退 `authorId` |
| `suggestions.title` | `suggestions[].title` | 原样迁移并 trim | 缺失则该建议跳过 |
| `suggestions.description` | `suggestions[].description` | 原样迁移并 trim | 缺失则该建议跳过 |
| `suggestions.status` | `suggestions[].status` | 仅保留 `pending/completed` | 其他值回退 `pending` |
| `suggestions.upvotes` | `suggestions[].upvotes` | 过滤成字符串数组 | 非数组时置空 |
| `suggestions.downvotes` | `suggestions[].downvotes` | 过滤成字符串数组 | 非数组时置空 |
| `suggestions.replies[].id` | `suggestions[].replies[].id` | 原样迁移 | 缺失则该回复跳过 |
| `suggestions.replies[].authorType` | `suggestions[].replies[].authorType` | 仅保留 `author/gm` | 其他值回退 `author` |
| `suggestions.replies[].authorId` | `suggestions[].replies[].authorId` | 原样迁移 | 缺失则该回复跳过 |
| `suggestions.replies[].authorName` | `suggestions[].replies[].authorName` | 原样迁移 | 缺失时回退 `authorId` |
| `suggestions.replies[].content` | `suggestions[].replies[].content` | 原样迁移并 trim | 缺失则该回复跳过 |
| `suggestions.replies[].createdAt` | `suggestions[].replies[].createdAt` | 归一为毫秒整数 | 非法时回当前时间并记失败清单 |
| `suggestions.authorLastReadGmReplyAt` | `suggestions[].authorLastReadGmReplyAt` | 归一为非负整数 | 缺失时置 `0` |
| `suggestions.createdAt` | `suggestions[].createdAt` | 归一为毫秒整数 | 非法时回当前时间并记失败清单 |
| 全量建议集 | `payload.revision` | 取有效建议数，最少为 `1` | 空列表时置 `1` |
| 全量建议集 | `payload.suggestions` | 过滤非法记录后原样写入 next 文档 | 全部非法时写空文档 |

### 兑换码组与兑换状态 `persistent_documents(scope=server_next_redeem_codes_v1, key=global)`

legacy 来源当前锁定为：

- `legacy/server/src/database/entities/redeem-code-group.entity.ts` -> 表 `redeem_code_groups`
- `legacy/server/src/database/entities/redeem-code.entity.ts` -> 表 `redeem_codes`

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| `redeem_code_groups.id` | `groups[].id` | 原样迁移 uuid | 缺失则该分组跳过 |
| `redeem_code_groups.name` | `groups[].name` | trim 后迁移 | 缺失则该分组跳过 |
| `redeem_code_groups.rewards[].itemId` | `groups[].rewards[].itemId` | 原样迁移 | 缺失则该奖励项跳过 |
| `redeem_code_groups.rewards[].count` | `groups[].rewards[].count` | 归一为 `>=1` 整数 | 非法时置 `1` |
| `redeem_code_groups.createdAt` | `groups[].createdAt` | 统一转 ISO 时间戳 | 非法时置 `1970-01-01T00:00:00.000Z` |
| `redeem_code_groups.updatedAt` | `groups[].updatedAt` | 统一转 ISO 时间戳 | 非法时回退 `createdAt` |
| `redeem_codes.id` | `codes[].id` | 原样迁移 uuid | 缺失则该兑换码跳过 |
| `redeem_codes.groupId` | `codes[].groupId` | 仅保留能匹配到有效分组的记录 | 缺失或孤儿 groupId 时该码跳过 |
| `redeem_codes.code` | `codes[].code` | trim 后大写归一 | 缺失则该兑换码跳过 |
| `redeem_codes.status` | `codes[].status` | 仅保留 `active/used/destroyed` | 其他值回退 `active` |
| `redeem_codes.usedByPlayerId` | `codes[].usedByPlayerId` | 字符串或 `null` | 可缺失 |
| `redeem_codes.usedByRoleName` | `codes[].usedByRoleName` | 字符串或 `null` | 可缺失 |
| `redeem_codes.usedAt` | `codes[].usedAt` | 统一转 ISO 时间戳或 `null` | 非法时置 `null` |
| `redeem_codes.destroyedAt` | `codes[].destroyedAt` | 统一转 ISO 时间戳或 `null` | 非法时置 `null` |
| `redeem_codes.createdAt` | `codes[].createdAt` | 统一转 ISO 时间戳 | 非法时置 `1970-01-01T00:00:00.000Z` |
| `redeem_codes.updatedAt` | `codes[].updatedAt` | 统一转 ISO 时间戳 | 非法时回退 `createdAt` |
| 全部分组与兑换码 | `payload.revision` | 取 `groups.length + codes.length`，最少为 `1` | 空文档时置 `1` |

### GM 密码记录 `persistent_documents(scope=server_next_gm_auth_v1, key=gm_auth)`

legacy 来源当前锁定为：

- `server_next_legacy_gm_auth_v1`
- `server_config`

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| `payload.passwordHash` | `hash` | 若为 legacy bcrypt 记录，则直接写入 `hash` | 缺失则整条失败 |
| legacy bcrypt 记录 | `salt` | 固定写为 `__legacy_bcrypt__` 哨兵盐值 | 若不是 bcrypt 兼容记录则按 next 规则处理 |
| `payload.updatedAt` | `updatedAt` | 统一转 ISO 时间戳 | 非法时回当前时间并记失败清单 |
| `payload.salt` / `payload.hash` / `payload.updatedAt` | next 同名字段 | 已是 next 形态时原样迁移 | 任一核心字段缺失则整条失败 |

### GM 数据库备份元数据 / 作业状态

legacy 来源当前锁定为：

- `server_next_legacy_db_backups_v1`
- `server_next_legacy_db_jobs_v1`

#### 备份元数据 `persistent_documents(scope=server_next_db_backups_v1, key=backupId)`

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| `payload.id` / `key` | `key` | 取备份 id 作为 next key | 缺失则整条失败 |
| `payload.filePath` / `payload.fileName` | `payload.filePath/fileName` | 原样迁移 | 缺失时允许为 `null`，但需记失败清单 |
| `payload.kind` | `payload.kind` | 仅保留 `manual/pre_import/...` 合法值 | 非法时回退 `manual` |
| `payload.createdAt` / `payload.updatedAt` | 同名字段 | 统一转 ISO 时间戳 | 非法时回当前时间并记失败清单 |
| `payload.sizeBytes` | `payload.sizeBytes` | 归一为 `>=0` 整数 | 非法时整条失败 |
| `payload.documentsCount` | `payload.documentsCount` | 归一为 `>=0` 整数 | 非法时置 `null` |
| `payload.checksumSha256` | `payload.checksumSha256` | trim 后迁移 | 缺失时置 `null` |
| `payload.filePath` | `payload.filePath` | 仅在 legacy 已有绝对路径时保留 | 缺失时允许为 `null` |
| `payload.scope/compatScope` | `payload.scope` | 统一收成 `persistent_documents_only` | 缺失时回退固定常量 |

#### 作业状态 `persistent_documents(scope=server_next_db_jobs_v1, key=gm_database)`

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| `payload.currentJob` | `payload.currentJob` | 原样迁移可恢复字段 | 非法结构时置 `null` |
| `payload.lastJob` | `payload.lastJob` | 原样迁移可恢复字段 | 非法结构时置 `null` |
| `payload.currentJob.type/status/phase` | `payload.currentJob.*` | 仅保留 next 可识别枚举值 | 非法时按“失败并终止当前任务”归一 |
| `payload.lastJob.type/status/phase` | `payload.lastJob.*` | 同上 | 非法时按“最后失败任务”归一 |
| `payload.currentJob.startedAt/finishedAt/appliedAt` | `payload.currentJob.*` | 统一转 ISO 时间戳 | 非法时删掉单字段 |
| `payload.currentJob.backupId/sourceBackupId/checkpointBackupId` | `payload.currentJob.*` | trim 后迁移 | 空字符串时置 `null` |
| `payload.currentJob.kind` | `payload.currentJob.kind` | 仅保留 `hourly/daily/manual/pre_import` | 非法时置 `null` |
| `payload.currentJob.error` | `payload.currentJob.error` | trim 后迁移 | 空字符串时置 `null` |
| `payload.lastJob.startedAt/finishedAt/appliedAt` | `payload.lastJob.*` | 同上 | 非法时删掉单字段 |
| `payload.lastJob.backupId/sourceBackupId/checkpointBackupId/kind/error` | `payload.lastJob.*` | 同上 | 非法时置 `null` |

### 市场订单 / 成交历史 / 暂存仓库

legacy 来源当前锁定为：

- `legacy/server/src/database/entities/market-order.entity.ts` -> `market_orders`
- `legacy/server/src/database/entities/market-trade-history.entity.ts` -> `market_trade_history`
- `legacy/server/src/database/entities/player.entity.ts` -> `players.marketStorage / market_storage`

#### 市场订单 `persistent_documents(scope=server_next_market_orders_v1, key=orderId)`

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| legacy 订单 id | `key` / `payload.id` | 原样迁移 | 缺失则整条失败 |
| legacy owner/player id | `payload.ownerId` | 原样迁移 | 缺失则整条失败 |
| legacy side | `payload.side` | 仅保留 `buy/sell` | 非法则整条失败 |
| legacy status | `payload.status` | 仅保留 `open/filled/cancelled` | 非法时回退 `open` |
| legacy item key / item id | `payload.itemKey` / `payload.item` | 归一到 next 单件 item 结构 | 缺失则整条失败 |
| legacy remaining quantity | `payload.remainingQuantity` | 归一为 `>=0` 整数 | 非法时置 `0` |
| legacy unit price | `payload.unitPrice` | 归一为 next 合法价格 | 非法时置 `1` |
| legacy created/updated 时间 | `payload.createdAt/updatedAt` | 归一为毫秒整数 | 非法时回当前时间并记失败清单 |

#### 市场成交历史 `persistent_documents(scope=server_next_market_trade_history_v1, key=tradeId)`

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| legacy trade id | `key` / `payload.id` | 原样迁移 | 缺失则整条失败 |
| legacy buyerId / sellerId | `payload.buyerId` / `payload.sellerId` | 原样迁移 | 缺失则整条失败 |
| legacy itemId | `payload.itemId` | 原样迁移 | 缺失则整条失败 |
| legacy quantity | `payload.quantity` | 归一为 `>=1` 整数 | 非法时置 `1` |
| legacy unit price | `payload.unitPrice` | 归一为 next 合法价格 | 非法时置 `1` |
| legacy created 时间 | `payload.createdAt` | 归一为毫秒整数 | 非法时回当前时间并记失败清单 |

#### 市场暂存仓库 `persistent_documents(scope=server_next_market_storage_v1, key=playerId)`

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| legacy player id | `key` | 原样迁移 | 缺失则整条失败 |
| legacy storage items[].itemId | `payload.items[].itemId` | 原样迁移 | 缺失则该物品跳过 |
| legacy storage items[].count | `payload.items[].count` | 归一为 `>=1` 整数 | 非法时置 `1` |
| legacy storage item 扩展字段 | `payload.items[]` | 仅保留 next 可识别字段 | 非法字段剔除 |

### 地图环境快照 `persistent_documents(scope=server_next_map_aura_v1, key=instanceId)`

legacy 来源当前锁定为：

- `legacy/server/src/game/map.service.ts`
- `legacy/server/data/runtime/map-aura-state.json`

next 结构已明确为 `MapPersistenceService` 的 map snapshot。

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| legacy instance/map id | `key` / `payload.instanceId` / `payload.templateId` | 保留实例和模板标识 | 缺任一关键 id 则整条失败 |
| legacy aura tile entries | `payload.auraEntries[]` | 归一为 `{ x,y,value }` 或等价 tile entry 结构 | 非法条目跳过 |
| legacy saved 时间 | `payload.savedAt` | 归一为毫秒整数 | 非法时回当前时间并记失败清单 |
| legacy 其他可重算地图态 | next map snapshot | 可重算态不迁 | 缺失时允许只写 aura snapshot |

### Afdian 配置与订单

legacy 来源当前锁定为：

- `server_next_legacy_afdian_config_v1`
- `server_next_legacy_afdian_orders_v1`

#### Afdian 配置 `persistent_documents(scope=server_next_afdian_config_v1, key=afdian)`

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| `payload.userId` | `payload.userId` | trim 后迁移 | 可缺失 |
| `payload.apiBaseUrl` | `payload.apiBaseUrl` | 归一为 canonical Afdian URL | 非法时回退默认 `https://afdian.net` |
| `payload.publicBaseUrl` | `payload.publicBaseUrl` | 归一为合法公开 URL | 非法时置空 |

#### Afdian 订单 `persistent_documents(scope=server_next_afdian_orders_v1, key=outTradeNo)`

| legacy 字段 | next 字段 | 转换规则 | 默认值 / 失败策略 |
| --- | --- | --- | --- |
| legacy out trade no | `key` / `payload.outTradeNo` | 原样迁移 | 缺失则整条失败 |
| legacy user/plan/order status 字段 | next 同名 payload 字段 | 原样迁移并做字符串归一 | 缺失时保留 `null` 并记失败清单 |
| legacy created/updated 时间 | next 同名 payload 字段 | 统一转 ISO 时间戳 | 非法时回当前时间并记失败清单 |

## legacy 来源锁定清单

下面这些来源目前可以从代码确认到 next 侧的读取/迁移入口，但 legacy 真源位置还没有完全锁死，需要单独补定位。

- [x] `server_next_player_auth_v1`
- [x] `server_next_player_identities_v1`
- [x] `server_next_player_snapshots_v1`
- [x] `server_next_legacy_gm_auth_v1`
- [x] `server_config`
- [x] legacy `users` / `players` 正式来源已锁定到 `users LEFT JOIN players(userId)` 的 identity 映射，以及 `players` 单表快照来源
- [x] legacy 邮件真源已锁定到 `mail_campaigns / mail_audience_members / player_mail_receipts`
- [x] legacy 市场真源已锁定到 `market_orders / market_trade_history / players.marketStorage`
- [x] legacy 建议真源已锁定到 `suggestions` 表，空表时回退 `legacy/server/data/runtime/suggestions.json`
- [x] legacy 兑换码真源已锁定到 `redeem_code_groups / redeem_codes`
- [x] legacy 地图环境状态真源已锁定到 `legacy/server/src/game/map.service.ts -> runtime/map-aura-state.json`
- [x] legacy Afdian 真源已锁定到 `server_next_legacy_afdian_config_v1 / server_next_legacy_afdian_orders_v1`

## 默认值 / 失败策略 / 可跳过条件

### 默认值表

| 数据域 | 默认值策略 |
| --- | --- |
| auth / identity | 缺 displayName 置 `null`；缺在线时长置 `0` |
| snapshot | 缺 `savedAt` 置当前毫秒；缺 `persistedSource` 置 `native` |
| inventory / equipment | 缺容量回 starter；缺槽位补固定空槽 |
| techniques / quests | 缺 exp/progress 置 `0`；缺当前修炼/完成时间置 `null` |
| progression / attrs | 缺 stage/realmLv/progress 置最低合法值；缺派生 attrs/numericStats 时按 next 重算 |
| mail | 缺 sender 回 `司命台`；缺附件数量置 `1`；空邮箱 `revision=1` |
| market | 缺订单状态回 `open`；缺数量回最小合法值；缺时间回当前毫秒 |
| suggestion | 缺 status 回 `pending`；缺已读时间置 `0`；空文档 `revision=1` |
| redeem | 缺状态回 `active`；缺时间回 epoch 或 `null`；空文档 `revision=1` |
| gm-auth | 缺 `updatedAt` 回当前时间；legacy bcrypt 记录补 `salt=__legacy_bcrypt__` |
| gm backup/job | 缺 kind 回 `manual`；非法 currentJob/lastJob 置 `null` |
| Afdian config/order | 缺 `apiBaseUrl` 回 `https://afdian.net`；缺公开地址置空 |

### 失败策略

| 数据域 | 失败策略 |
| --- | --- |
| auth / identity / snapshot | 缺主键或关键映射字段时整条失败并记失败清单 |
| inventory / equipment / techniques / quests | 非法子项按条目跳过，外层 snapshot 继续迁 |
| progression / attrs | 非法派生字段直接丢弃并由 next 重算；基础成长关键字段缺失时整条 snapshot 失败 |
| mail / suggestion / redeem | 非法子记录跳过，文档其余合法项继续写入 |
| market | 非法订单/成交/暂存条目按单条跳过，其余记录继续写入 |
| gm-auth | 缺 hash/passwordHash 时整条失败 |
| gm backup/job / Afdian | 非法结构回退 `null` 或默认值，同时记失败清单 |

### 可跳过条件

| 数据域 | 可跳过条件 |
| --- | --- |
| buff / runtimeBonuses / pendingLogbookMessages | 运行时可重算或会话态，允许整域不迁 |
| 市场成交历史 | 若切服时不保留历史展示，可整域跳过 |
| 地图环境快照 | 若不要求继承动态灵气演化，可整域跳过并按地图真源重建 |
| Afdian | 当前线上未启用时可整域跳过 |
| GM 备份/作业 | 若不要求保留运维历史，可仅迁当前有效状态或整域跳过 |

## 迁移优先级

按实际切服顺序，建议先做下面这几批。

### 第一批：切服阻塞项

- [x] 账号认证记录
- [x] 玩家身份映射
- [x] 玩家持久化快照
- [x] 邮件箱
- [x] 市场暂存仓库
- [x] GM 密码记录

### 第二批：核心体验延续项

- [x] 市场订单
- [x] 兑换码组与兑换状态
- [x] 建议与回复

### 第三批：可选延续项

- [x] 市场成交历史
- [x] 地图环境快照
- [x] 数据库备份元数据 / 作业状态
- [x] Afdian 配置与订单

## 下一步要补的内容

- [x] 为每个必须迁移的数据域补字段级映射
- [x] 单独锁定 legacy 正式来源文件 / 表 / scope
- [x] 把这份清单和 `04-one-off-migration-script.md` 对齐
- [x] 把“可重建”项同步回 `main.md`

## 与 04 迁移脚本的 domain 对齐

| 03 数据域 | 04 对应 domain | 04 批次 | 当前 04 范围说明 |
| --- | --- | --- | --- |
| 账号认证记录 | `auth` | 第 1 批 | 已进入脚本主链 |
| 玩家身份映射 | `identity` | 第 1 批 | 已进入脚本主链 |
| 玩家持久化快照 | `snapshot` | 第 1 批 | 脚本先写身份/快照主链，核心资产子域继续在 snapshot 内展开 |
| 境界 / 属性 / 数值成长 | `progression / attrs` | 第 2 批 | 对应 03 的 progression/attrs 字段级表 |
| 背包 / 装备 / 物品 | `inventory / equipment / items` | 第 2 批 | 对应 03 的 inventory/equipment 字段级表 |
| 功法 / 技能 / 修炼状态 | `techniques / skills / cultivating` | 第 2 批 | 对应 03 的 techniques 字段级表 |
| 任务 | `quests` | 第 2 批 | 对应 03 的 quests 字段级表 |
| 邮件箱 | `mail` | 第 3 批 | 对应 03 的 mailbox 字段级表 |
| 市场订单 / 成交历史 / 暂存仓库 | `market` | 第 3 批 | 04 用单一 `market` domain 覆盖 order/trade-history/storage 三类持久状态 |
| 建议与回复 | `suggestion` | 第 3 批 | 对应 03 的 suggestion 字段级表 |
| 兑换码组与兑换状态 | `redeem` | 第 3 批 | 对应 03 的 redeem 字段级表 |
| GM 密码记录 | `gm-auth` | 第 3 批 | 对应 03 的 gm-auth 字段级表 |
| GM 数据库备份元数据 / 作业状态 | `gm-database` | 第 3 批 | 对应 03 的 gm backup/job 字段级表 |
| 地图环境快照 | 暂不单列 domain | 不在 04 当前必跑批次 | 03 已定义字段级来源与转换，待脚本是否纳入正式 `--domains` 再单独落地 |
| Afdian 配置与订单 | 暂不单列 domain | 不在 04 当前必跑批次 | 03 已定义字段级来源与转换，是否迁移取决于线上启用状态 |

## 完成定义

- [x] 有一份按真源 / 运行态 / legacy 来源组织的数据迁移清单
- [x] 每个主要数据域都能回答“正式真源是谁、运行时副本是谁、是否必须迁”
- [x] 有一份覆盖全部切服阻塞域的字段级可执行数据迁移清单
- [x] 每个数据域都能回答“从哪来、到哪去、怎么转”

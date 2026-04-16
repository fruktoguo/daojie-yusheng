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
| 地图运行环境快照 | 建议迁移 | `persistent_documents` scope `server_next_map_aura_v1` | map/world runtime 实例态 | legacy 动态地图状态 / aura 状态来源待锁定 | 如果你不要求继承地图演化，可直接重建 |
| 邮件箱 | 必须迁移 | `persistent_documents` scope `server_next_mailboxes_v1` | `MailRuntimeService` | legacy mailbox 来源待锁定 | 邮件、附件、已读/领取/删除状态都要迁 |
| 市场订单 | 建议迁移 | `persistent_documents` scope `server_next_market_orders_v1` | `MarketRuntimeService` | legacy market order 来源待锁定 | 如果市场要延续，必须迁；否则可在切服时清盘 |
| 市场成交历史 | 建议迁移 | `persistent_documents` scope `server_next_market_trade_history_v1` | `MarketRuntimeService` | legacy trade history 来源待锁定 | 可迁可不迁，取决于是否保留历史展示 |
| 市场暂存仓库 | 必须迁移 | `persistent_documents` scope `server_next_market_storage_v1` | `MarketRuntimeService` | legacy market storage 来源待锁定 | 这是玩家资产，默认必须迁 |
| 建议与回复 | 建议迁移 | `persistent_documents` scope `server_next_suggestions_v1` key `global` | `SuggestionRuntimeService` | legacy suggestion 来源待锁定 | 如果你要保留社区上下文则迁，否则可清空 |
| 兑换码组与兑换状态 | 必须迁移 | `persistent_documents` scope `server_next_redeem_codes_v1` key `global` | `RedeemCodeRuntimeService` | legacy redeem-code 来源待锁定 | 默认必须迁，避免重复兑换或运营丢单 |
| GM 密码记录 | 必须迁移 | `persistent_documents` scope `server_next_gm_auth_v1` key `gm_auth` | `RuntimeGmAuthService` 内存记录 | 兼容 scope `server_next_legacy_gm_auth_v1`、`server_config` | 至少迁当前有效 GM 密码记录 |
| GM 数据库备份元数据 / 作业状态 | 建议迁移 | `persistent_documents` scopes `server_next_db_backups_v1` / `server_next_db_jobs_v1` | `NextGmAdminService` | legacy 对应 scope 已存在兼容读 | 如切服前要保留运维记录则迁 |
| Afdian 配置与订单 | 待确认 | `persistent_documents` scopes `server_next_afdian_config_v1` / `server_next_afdian_orders_v1` | `NextGmAdminService` | legacy 对应 scope 已存在兼容读 | 若当前线上在用，升级为必须迁移；否则可暂缓 |

## 玩家快照内部迁移项

下面这些属于玩家快照里的核心内容，默认按“必须迁移”处理。

| 子域 | 迁移级别 | next 目标 | 默认值策略 | 备注 |
| --- | --- | --- | --- | --- |
| 基础身份 | 必须迁移 | `name` `displayName` | 缺失时回退到账号映射 | 不应和 auth 映射冲突 |
| 位置与朝向 | 必须迁移 | `placement.templateId/x/y/facing` | 缺失时回默认出生点 | 这是进世界最基础数据 |
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

## legacy 来源锁定清单

下面这些来源目前可以从代码确认到 next 侧的读取/迁移入口，但 legacy 真源位置还没有完全锁死，需要单独补定位。

- [x] `server_next_player_auth_v1`
- [x] `server_next_player_identities_v1`
- [x] `server_next_player_snapshots_v1`
- [x] `server_next_legacy_gm_auth_v1`
- [x] `server_config`
- [ ] legacy `users` / `players` 正式来源仍需补最终定位
- [ ] legacy 邮件真源仍需补最终定位
- [ ] legacy 市场真源仍需补最终定位
- [ ] legacy 建议真源仍需补最终定位
- [ ] legacy 兑换码真源仍需补最终定位
- [ ] legacy 地图环境状态真源仍需补最终定位

## 默认转换规则

这些规则后面写脚本时应直接照搬，不要临时决定。

- [x] 所有 next 正式真源优先落 PostgreSQL
- [x] Redis、内存态、前端缓存都不能当正式迁移目标
- [x] 玩家资产类数据默认不能丢
- [x] 运行时可重算数据默认不迁
- [x] 非法数值统一做归一化，不把坏数据原样写入 next
- [x] 无法证明来源正确的 legacy 临时态，不迁入正式真源
- [ ] 为每个数据域补字段级默认值表
- [ ] 为每个数据域补失败策略
- [ ] 为每个数据域补“可跳过迁移”的条件

## 迁移优先级

按实际切服顺序，建议先做下面这几批。

### 第一批：切服阻塞项

- [ ] 账号认证记录
- [ ] 玩家身份映射
- [ ] 玩家持久化快照
- [ ] 邮件箱
- [ ] 市场暂存仓库
- [ ] GM 密码记录

### 第二批：核心体验延续项

- [ ] 市场订单
- [ ] 兑换码组与兑换状态
- [ ] 建议与回复

### 第三批：可选延续项

- [ ] 市场成交历史
- [ ] 地图环境快照
- [ ] 数据库备份元数据 / 作业状态
- [ ] Afdian 配置与订单

## 下一步要补的内容

- [ ] 为每个必须迁移的数据域补字段级映射
- [ ] 单独锁定 legacy 正式来源文件 / 表 / scope
- [ ] 把这份清单和 `04-one-off-migration-script.md` 对齐
- [ ] 把“可重建”项同步回 `main.md`

## 完成定义

- [x] 有一份按真源 / 运行态 / legacy 来源组织的数据迁移清单
- [x] 每个主要数据域都能回答“正式真源是谁、运行时副本是谁、是否必须迁”
- [ ] 有一份字段级可执行的数据迁移清单
- [ ] 每个数据域都能回答“从哪来、到哪去、怎么转”

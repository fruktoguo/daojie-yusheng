# 数据库表结构文档

本目录记录项目所有 PostgreSQL 表的完整字段定义、索引、约束和设计特点。

## 文档索引

| 文件 | 内容 | 表数量 |
|------|------|--------|
| [01-player-identity.md](./01-player-identity.md) | 账号身份与会话 | 4 |
| [02-player-world.md](./02-player-world.md) | 世界落点与位置 | 3 |
| [03-player-vitals-growth.md](./03-player-vitals-growth.md) | 生存、成长与属性 | 5 |
| [04-player-assets.md](./04-player-assets.md) | 资产：背包、装备、钱包、市场 | 5 |
| [05-player-technique-buff.md](./05-player-technique-buff.md) | 功法、炼体、Buff | 3 |
| [06-player-quest-map.md](./06-player-quest-map.md) | 任务与地图解锁 | 2 |
| [07-player-combat-auto.md](./07-player-combat-auto.md) | 战斗偏好与自动化 | 3 |
| [08-player-profession-job.md](./08-player-profession-job.md) | 职业、长作业、强化记录 | 4 |
| [09-player-misc.md](./09-player-misc.md) | 消息、统计、离线收益、恢复水位 | 5 |
| [10-mail.md](./10-mail.md) | 邮件系统 | 5 |
| [11-market.md](./11-market.md) | 坊市交易 | 2 |
| [12-instance-catalog.md](./12-instance-catalog.md) | 地图实例目录与节点注册 | 2 |
| [13-instance-domain.md](./13-instance-domain.md) | 地图实例分域 | 16 |
| [14-durable-outbox.md](./14-durable-outbox.md) | 持久化操作、Outbox、审计 | 5 |
| [15-misc-systems.md](./15-misc-systems.md) | 兑换码、建议、GM、通天塔 | 7 |

## 总体设计特点

- **总计 75 张表**，全部使用 PostgreSQL
- **无外键约束**：所有表间关联通过应用层维护，避免级联锁和跨表死锁
- **分域增量刷盘**：玩家数据按 21 个 dirty domain 独立写入，只刷脏域
- **恢复水位机制**：`player_recovery_watermark` 记录每域版本号，支持崩溃恢复
- **物品只存动态字段**：`raw_payload` 仅保留 enhanceLevel 等个性化数据，模板字段运行时从 Registry 水合
- **功法只存进度**：tech_id + level/exp/realm_lv，skills/layers 从模板恢复
- **强持久化 vs 最终一致**：资产类走 durable operation 事务，进度类走 1.5s 批量 flush

# 邮件系统

## player_mail

玩家邮件主表。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| mail_id | varchar(180) | PK | 邮件 ID |
| player_id | varchar(100) | NOT NULL | 收件人 |
| sender_type | varchar(32) | NOT NULL, DEFAULT 'system' | 发送者类型 |
| sender_label | varchar(120) | NOT NULL | 发送者显示名 |
| template_id | varchar(120) | | 邮件模板 ID |
| mail_type | varchar(32) | NOT NULL, DEFAULT 'system' | 邮件类型 |
| title | varchar(240) | | 标题 |
| body | text | | 正文 |
| source_type | varchar(64) | | 来源类型（market/quest/gm） |
| source_ref_id | varchar(180) | | 来源引用 ID |
| metadata_jsonb | jsonb | NOT NULL, DEFAULT '{}' | 元数据 |
| mail_version | bigint | NOT NULL, DEFAULT 1 | 版本号 |
| created_at | bigint | NOT NULL | 创建时间 |
| expire_at | bigint | | 过期时间 |
| first_seen_at | bigint | | 首次查看时间 |
| read_at | bigint | | 已读时间 |
| claimed_at | bigint | | 领取附件时间 |
| deleted_at | bigint | | 删除时间 |
| updated_at | timestamptz | DEFAULT now() | |

**索引**：player_id + created_at DESC

**特点**：
- 软删除（deleted_at 非空表示已删除）
- 过期邮件由后台任务清理
- 属于"强持久化事务域"

---

## player_mail_attachment

邮件附件（物品/货币）。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| attachment_id | varchar(180) | PK | 附件 ID |
| mail_id | varchar(180) | NOT NULL | 所属邮件 |
| player_id | varchar(100) | NOT NULL | 收件人 |
| attachment_kind | varchar(32) | NOT NULL, DEFAULT 'item' | 附件类型（item/currency） |
| item_id | varchar(120) | | 物品模板 ID |
| count | bigint | | 数量 |
| currency_type | varchar(64) | | 货币类型 |
| amount | bigint | | 货币数量 |
| item_payload_jsonb | jsonb | NOT NULL, DEFAULT '{}' | 物品详情 |
| claim_operation_id | varchar(180) | | 领取操作 ID |
| claimed_at | bigint | | 领取时间 |
| created_at | timestamptz | DEFAULT now() | |

**索引**：mail_id、player_id + mail_id

**特点**：
- 领取时通过 durable operation 原子性转移到背包
- `claim_operation_id` 保证幂等（重复领取不会多发）

---

## player_mail_counter

邮件计数器（未读/未领取数量缓存）。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| player_id | varchar(100) | PK | 玩家 ID |
| unread_count | bigint | NOT NULL, DEFAULT 0 | 未读数 |
| unclaimed_count | bigint | NOT NULL, DEFAULT 0 | 未领取数 |
| latest_mail_at | bigint | | 最新邮件时间 |
| counter_version | bigint | NOT NULL, DEFAULT 0 | 版本号 |
| welcome_mail_delivered_at | bigint | | 欢迎邮件发送时间 |
| updated_at | timestamptz | DEFAULT now() | |

**特点**：
- 避免每次查询都 COUNT 全表
- 收到新邮件/领取/已读时原子更新

---

## player_mail_archive

已归档邮件（从 player_mail 移入）。

结构与 player_mail 相同，额外增加 `archived_at` 列。

**索引**：player_id + created_at DESC

**特点**：
- 定期将已删除/已过期邮件移入归档表
- 减少主表数据量，提升查询性能

---

## player_mail_attachment_archive

已归档邮件附件。

结构与 player_mail_attachment 相同，额外增加 `archived_at` 列。

**索引**：player_id + mail_id

**特点**：
- 随邮件一起归档

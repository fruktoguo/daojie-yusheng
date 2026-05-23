# 杂项系统

## gm_audit_log

GM 操作审计日志。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| audit_id | uuid | PK | 审计 ID |
| created_at | timestamptz | NOT NULL, DEFAULT now() | 操作时间 |
| actor_token_rev | varchar(120) | | 操作者令牌版本 |
| actor_ip | varchar(80) | | 操作者 IP |
| actor_user_agent | text | | UA |
| actor_received_at | timestamptz | | 请求接收时间 |
| op | varchar(120) | NOT NULL | 操作类型 |
| target_type | varchar(80) | | 目标类型 |
| target_id | varchar(160) | | 目标 ID |
| before_jsonb | jsonb | NOT NULL, DEFAULT '{}' | 操作前状态 |
| after_jsonb | jsonb | NOT NULL, DEFAULT '{}' | 操作后状态 |
| delta_jsonb | jsonb | NOT NULL, DEFAULT '{}' | 变更差量 |
| success | boolean | NOT NULL | 是否成功 |
| error_message | text | | 错误信息 |

**索引**：created_at DESC、target_id + created_at DESC (WHERE NOT NULL)、op + created_at DESC

---

## gm_config

GM 配置键值对。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| key | varchar(120) | PK | 配置键 |
| value | text | NOT NULL, DEFAULT '' | 配置值 |
| updated_at | timestamptz | DEFAULT now() | |

---

## gm_runtime_flag

GM 运行时开关。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| key | varchar(120) | PK | 开关键 |
| value | boolean | NOT NULL, DEFAULT false | 开关值 |
| updated_at | timestamptz | DEFAULT now() | |

**特点**：
- 用于运行时动态开关功能（如关闭市场、禁止 PVP 等）
- GM 面板直接修改，服务端定时轮询

---

## redeem_code_group

兑换码组。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| group_id | varchar(120) | PK | 组 ID |
| name | varchar(160) | NOT NULL | 组名称 |
| rewards_payload | jsonb | NOT NULL, DEFAULT '[]' | 奖励配置 |
| raw_payload | jsonb | NOT NULL, DEFAULT '{}' | 扩展数据 |
| created_at / updated_at | timestamptz | DEFAULT now() | |

---

## redeem_code

兑换码。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| code_id | varchar(160) | PK | 码 ID |
| group_id | varchar(120) | NOT NULL | 所属组 |
| code | varchar(160) | NOT NULL, UNIQUE | 兑换码文本 |
| status | varchar(32) | NOT NULL | 状态（active/used/destroyed） |
| used_by_player_id | varchar(100) | | 使用者 |
| used_by_role_name | varchar(120) | | 使用者角色名 |
| used_at | timestamptz | | 使用时间 |
| destroyed_at | timestamptz | | 销毁时间 |
| raw_payload | jsonb | NOT NULL, DEFAULT '{}' | 扩展数据 |
| created_at / updated_at | timestamptz | DEFAULT now() | |

**索引**：group_id + status、used_by_player_id

---

## redeem_code_state

兑换码系统状态。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| state_key | varchar(64) | PK | 状态键 |
| revision | bigint | NOT NULL, DEFAULT 1 | 版本号 |
| updated_at | timestamptz | DEFAULT now() | |

---

## suggestion / suggestion_state

玩家建议/反馈系统。

| 列（suggestion） | 类型 | 约束 | 说明 |
|---|---|---|---|
| suggestion_id | varchar(160) | PK | 建议 ID |
| status | varchar(32) | | 状态 |
| category | varchar(80) | | 分类 |
| author_player_id | varchar(100) | | 作者 |
| created_at_ms / updated_at_ms | bigint | NOT NULL | 时间戳 |
| author_last_read_gm_reply_at | bigint | DEFAULT 0 | 作者最后阅读 GM 回复时间 |
| upvotes_payload | jsonb | DEFAULT '[]' | 点赞列表 |
| downvotes_payload | jsonb | DEFAULT '[]' | 踩列表 |
| replies_payload | jsonb | DEFAULT '[]' | 回复列表 |
| raw_payload | jsonb | DEFAULT '{}' | 建议内容 |
| updated_at | timestamptz | DEFAULT now() | |

**索引**：author_player_id + created_at_ms DESC、status + updated_at_ms DESC

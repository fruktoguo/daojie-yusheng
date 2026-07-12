# 邮件系统

## 核心常量

源文件: `packages/shared/src/constants/gameplay/mail.ts`, `packages/shared/src/constants/ui/mail.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| MAIL_PAGE_SIZE_DEFAULT | 12 | 默认分页大小 |
| MAIL_PAGE_SIZE_MAX | 50 | 最大分页大小 |
| MAIL_BATCH_OPERATION_MAX | 20 | 批量操作上限 |
| MAILBOX_CACHE_MAX_PLAYERS | 5000（可配置） | 邮箱缓存上限 |

## 邮件过滤器

```typescript
filters = ['all', 'unread', 'claimable']
```

## 过期机制

- 邮件 `expireAt` 由发送方指定（可选）
- 为 null 则永不过期
- 无全局固定过期时间常量，由 GM/系统发送时按需设置

## 附件规则

- 附件无数量上限硬编码
- normalizeAttachments 只做格式校验
- 附件类型: 物品（含数量）或灵石

## 邮件运行时

源文件: `packages/server/src/runtime/mail/mail-runtime.service.ts`

- 邮箱缓存: LRU 策略
- 上限: `env.SERVER_MAILBOX_CACHE_MAX_PLAYERS || 5000`（范围 100~50000）
- 默认发件人: `'司命台'`
- 低频写命令执行前会回读结构化数据库真源，不以可能过期的本地缓存判定领取或删除

## 邮件发送规则

- 系统邮件: 由服务端直接发送（掉落、奖励、GM 等）
- 玩家邮件: 暂未开放
- 邮件持久化到数据库
- 领取附件时走 Durable Operation 事务
- 领取操作 ID 对最多 20 封邮件的稳定集合做 hash，长度不超过 173，保证 `outbox:` 事件 ID 不超过表字段上限 180

### GM 广播邮件

- 全服广播只从玩家恢复水位读取已建立角色分域的 `player_id`，并与当前运行态玩家 ID 合并；不得为了枚举收件人逐玩家装配完整快照。
- GM 客户端为一次发送生成全局唯一 `batchId`；网络失败重试同一草稿时必须复用，草稿变化或明确成功后才换代，迟到响应不得清空或重绘后续草稿。每名玩家的 `mail_id` 由 `batchId + playerId` 确定性生成；同一批次重放不得重复创建邮件或重复推进计数，复用同一 ID 却改变正文、附件或收件人集合时必须拒绝。
- 收件人 advisory lock 按玩家 ID 稳定排序后一次获取；本批邮件、附件、邮箱计数和邮件恢复水位必须在同一数据库事务内批量提交，任一环节失败时整批回滚。
- 广播提交后只失效本节点命中的邮箱缓存，不批量加载或常驻全部玩家邮箱。

## 跨节点一致性

- `first_seen_at / read_at / claimed_at / deleted_at` 都是单调状态，一旦进入后续状态就不得被旧节点的空值回滚
- 同版本邮件写只合并单调状态，不覆盖已由 Durable Operation 提交的领取结果
- 附件状态只做单调 upsert，普通邮件写不删除后重建附件行，避免清掉 `claim_operation_id / claimed_at`
- 未读和未领取计数在同一玩家邮箱事务锁内从结构化真源重新计算，不接受运行时旧快照统计
- 普通全量快照不使用“快照未出现”作为删除依据；邮件删除只通过 `deleted_at` 软删除推进
- 附件领取的 COMMIT 确认包丢失时先按 operation 状态回读，确认未提交才幂等重试；已提交重放不会再次发放附件，也不会因只读事务结束失败误报领取失败

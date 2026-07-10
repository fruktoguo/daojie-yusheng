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

## 跨节点一致性

- `first_seen_at / read_at / claimed_at / deleted_at` 都是单调状态，一旦进入后续状态就不得被旧节点的空值回滚
- 同版本邮件写只合并单调状态，不覆盖已由 Durable Operation 提交的领取结果
- 附件状态只做单调 upsert，普通邮件写不删除后重建附件行，避免清掉 `claim_operation_id / claimed_at`
- 未读和未领取计数在同一玩家邮箱事务锁内从结构化真源重新计算，不接受运行时旧快照统计
- 普通全量快照不使用“快照未出现”作为删除依据；邮件删除只通过 `deleted_at` 软删除推进
- 附件领取的 COMMIT 确认包丢失时先按 operation 状态回读，确认未提交才幂等重试；已提交重放不会再次发放附件，也不会因只读事务结束失败误报领取失败

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

## 邮件发送规则

- 系统邮件: 由服务端直接发送（掉落、奖励、GM 等）
- 玩家邮件: 暂未开放
- 邮件持久化到数据库
- 领取附件时走 Durable Operation 事务

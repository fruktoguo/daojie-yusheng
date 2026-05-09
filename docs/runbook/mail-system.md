# 邮件系统运维手册

## 概述

邮件系统负责系统通知、附件发放、玩家间邮件等功能。本手册描述邮件系统的运维操作和故障排查。

## 架构

```
┌─────────────────┐     ┌─────────────────┐
│  MailRuntime    │────▶│ MailPersistence │
│  (内存邮箱缓存)  │     │  (PostgreSQL)   │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│  WorldGateway   │
│  (协议投影)      │
└─────────────────┘
```

## 核心组件

| 组件 | 位置 | 职责 |
|------|------|------|
| MailRuntimeService | `runtime/mail/` | 邮件运行时，内存缓存和业务逻辑 |
| MailPersistenceService | `persistence/` | 邮件持久化，数据库读写 |
| WorldGatewayMailHelper | `network/` | 协议投影，客户端同步 |
| NativeGmMailService | `http/native/` | GM 邮件发送接口 |

## 状态检查

### 检查邮件服务状态

```bash
# 查看邮件相关日志
docker service logs daojie-yusheng_server --tail 200 | grep -i mail

# 检查邮件表状态
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "SELECT COUNT(*) FROM player_mails"
```

### 检查邮件队列

```bash
# 查看未读邮件数量
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    SELECT player_id, COUNT(*) as unread_count 
    FROM player_mails 
    WHERE read_at IS NULL 
    GROUP BY player_id 
    ORDER BY unread_count DESC 
    LIMIT 10
  "
```

## 常见故障

### 邮件发送失败

**症状**：系统邮件未送达，日志显示发送错误

**排查步骤**：

```bash
# 1. 检查邮件服务日志
docker service logs daojie-yusheng_server --tail 500 | grep -i "mail.*error"

# 2. 检查数据库连接
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "SELECT 1"

# 3. 检查邮件表结构
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "\d player_mails"
```

**常见原因**：
- 数据库连接失败
- 玩家 ID 不存在
- 附件物品 ID 无效

### 邮件附件领取失败

**症状**：玩家无法领取邮件附件

**排查步骤**：

```bash
# 1. 检查玩家背包状态
docker service logs daojie-yusheng_server --tail 200 | grep -i "inventory.*full"

# 2. 检查邮件附件数据
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    SELECT id, attachments 
    FROM player_mails 
    WHERE player_id = '目标玩家ID' 
    AND attachments IS NOT NULL
  "
```

**常见原因**：
- 背包已满
- 附件数据损坏
- 物品模板不存在

### 邮件过期未清理

**症状**：过期邮件堆积，数据库膨胀

**处理**：

```bash
# 手动触发过期清理
pnpm --filter @mud/server ts-node src/tools/mail-expiration-cleanup-worker.ts

# 检查清理结果
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    SELECT COUNT(*) FROM player_mails WHERE expired_at < NOW()
  "
```

## GM 邮件操作

### 发送系统邮件

通过 GM 面板或 API 发送：

```bash
# API 方式（需要 GM token）
curl -X POST http://127.0.0.1:11922/api/gm/mail/send \
  -H "Authorization: Bearer <GM_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "目标玩家ID",
    "title": "系统通知",
    "content": "邮件内容",
    "attachments": [
      { "itemId": "minor_qi_pill", "count": 5 }
    ]
  }'
```

### 批量发送邮件

```bash
# 全服邮件（谨慎使用）
curl -X POST http://127.0.0.1:11922/api/gm/mail/broadcast \
  -H "Authorization: Bearer <GM_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "维护补偿",
    "content": "感谢您的耐心等待",
    "attachments": [
      { "itemId": "minor_qi_pill", "count": 10 }
    ]
  }'
```

## 数据维护

### 清理软删除邮件

```bash
# 运行软删除清理 worker
pnpm --filter @mud/server ts-node src/tools/mail-soft-delete-purge-worker.ts
```

### 归档过期邮件

```bash
# 运行过期归档 worker
pnpm --filter @mud/server ts-node src/tools/mail-expiration-archive-worker.ts
```

### 邮件数据一致性检查

```bash
# 运行一致性报告
pnpm --filter @mud/server ts-node src/tools/mail-counter-consistency-report.ts
```

## Smoke 测试

```bash
# 邮件结构化变更测试
pnpm --filter @mud/server smoke:mail-structured-mutation

# 邮件 schema 报告
pnpm --filter @mud/server smoke:mail-schema-report

# 过期清理 worker 测试
pnpm --filter @mud/server smoke:mail-expiration-cleanup-worker

# 软删除清理 worker 测试
pnpm --filter @mud/server smoke:mail-soft-delete-purge-worker

# 过期归档 worker 测试
pnpm --filter @mud/server smoke:mail-expiration-archive-worker
```

## 监控指标

| 指标 | 正常范围 | 告警阈值 |
|------|----------|----------|
| 未读邮件总数 | < 10000 | > 50000 |
| 单玩家未读数 | < 100 | > 500 |
| 过期未清理数 | < 1000 | > 5000 |
| 邮件发送延迟 | < 100ms | > 1000ms |

## 相关文档

- [故障排查手册](incident-response.md)
- [持久化分层策略](../architecture/0004-persistence-layers.md)

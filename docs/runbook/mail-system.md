# 邮件系统运维手册

解决邮件发送失败、附件领取异常、过期邮件堆积问题。

## 状态检查

```bash
# 邮件服务日志
docker service logs daojie-yusheng_server --tail 200 | grep -i mail

# 邮件总量
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "SELECT COUNT(*) FROM player_mails"

# 未读邮件 Top 10
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    SELECT player_id, COUNT(*) as unread_count 
    FROM player_mails WHERE read_at IS NULL 
    GROUP BY player_id ORDER BY unread_count DESC LIMIT 10"
```

## 故障排查

### 邮件发送失败

```bash
docker service logs daojie-yusheng_server --tail 500 | grep -i "mail.*error"
```

| 原因 | 处理 |
|------|------|
| 数据库连接失败 | 检查 PG 服务状态 |
| 玩家 ID 不存在 | 确认玩家数据 |
| 附件物品 ID 无效 | 检查物品模板配置 |

### 附件领取失败

```bash
docker service logs daojie-yusheng_server --tail 200 | grep -i "inventory.*full"

# 检查邮件附件数据
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "
    SELECT id, attachments FROM player_mails 
    WHERE player_id = '目标玩家ID' AND attachments IS NOT NULL"
```

常见原因：背包已满、附件数据损坏、物品模板不存在。

### 过期邮件堆积

```bash
# 手动触发清理
pnpm --filter @mud/server ts-node src/tools/mail-expiration-cleanup-worker.ts

# 检查清理结果
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "SELECT COUNT(*) FROM player_mails WHERE expired_at < NOW()"
```

## GM 邮件操作

```bash
# 发送单人邮件
curl -X POST http://127.0.0.1:11922/api/gm/mail/send \
  -H "Authorization: Bearer <GM_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"playerId":"目标玩家ID","title":"系统通知","content":"内容","attachments":[{"itemId":"minor_qi_pill","count":5}]}'

# 全服广播邮件（谨慎）
curl -X POST http://127.0.0.1:11922/api/gm/mail/broadcast \
  -H "Authorization: Bearer <GM_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"title":"维护补偿","content":"感谢等待","attachments":[{"itemId":"minor_qi_pill","count":10}]}'
```

## 数据维护

```bash
# 软删除清理
pnpm --filter @mud/server ts-node src/tools/mail-soft-delete-purge-worker.ts

# 过期归档
pnpm --filter @mud/server ts-node src/tools/mail-expiration-archive-worker.ts

# 一致性检查
pnpm --filter @mud/server ts-node src/tools/mail-counter-consistency-report.ts
```

## Smoke 测试

```bash
pnpm --filter @mud/server smoke:mail-structured-mutation
pnpm --filter @mud/server smoke:mail-schema-report
pnpm --filter @mud/server smoke:mail-expiration-cleanup-worker
pnpm --filter @mud/server smoke:mail-soft-delete-purge-worker
pnpm --filter @mud/server smoke:mail-expiration-archive-worker
```

## 监控阈值

| 指标 | 正常 | 告警 |
|------|------|------|
| 未读邮件总数 | < 10000 | > 50000 |
| 单玩家未读数 | < 100 | > 500 |
| 过期未清理数 | < 1000 | > 5000 |

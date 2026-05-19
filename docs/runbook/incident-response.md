# 故障排查手册

解决生产环境常见故障的快速诊断和恢复。

## 快速诊断

```bash
docker stack services daojie-yusheng
curl http://127.0.0.1:11922/health
docker service logs daojie-yusheng_server --tail 100
```

## 故障决策树

### 服务端无响应

症状：客户端无法连接，health 超时

```bash
# 诊断
docker service ps daojie-yusheng_server --no-trunc
docker stats $(docker ps -q -f name=daojie-yusheng_server)
```

| 原因 | 特征 | 处理 |
|------|------|------|
| OOM | 容器重启 + 日志中断 | 检查内存限制，参考 heap-snapshot-summary.md |
| 连接池耗尽 | 日志有 connection timeout | 重启服务，检查 DB 连接数 |
| 死循环 | CPU 100% | 重启服务，检查最近部署变更 |

```bash
# 恢复
docker service update --force daojie-yusheng_server
# 持续失败则回滚
docker service rollback daojie-yusheng_server
```

### 数据库连接失败

症状：日志 `ECONNREFUSED` 或 `connection timeout`

```bash
docker service ps daojie-yusheng_postgres
docker service logs daojie-yusheng_postgres --tail 100
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "SELECT 1"
```

| 原因 | 处理 |
|------|------|
| PG 未启动 | `docker service update --force daojie-yusheng_postgres` |
| 连接数超限 | 查 `pg_stat_activity` count，必要时重启 |
| 密码错误 | 检查环境变量 |

### Redis 连接失败

```bash
docker service ps daojie-yusheng_redis
docker exec -it $(docker ps -q -f name=daojie-yusheng_redis) redis-cli ping
# 恢复
docker service update --force daojie-yusheng_redis
```

### 玩家无法登录

```bash
docker service logs daojie-yusheng_server --tail 200 | grep -i auth
docker exec -it $(docker ps -q -f name=daojie-yusheng_redis) \
  redis-cli keys "session:*" | head -10
```

常见原因：Token 密钥配置错误、Redis 会话过期、用户表异常。

### 战斗异常

参考 [战斗链路运维手册](战斗链路运维手册.md)。

## 紧急恢复

### 完全重启 Stack

```bash
docker stack rm daojie-yusheng
sleep 30
docker stack deploy --with-registry-auth -c docker-stack.tencent.yml daojie-yusheng
```

### 数据库恢复

```bash
# 找到最近备份
ls -la /var/lib/docker/volumes/daojie-yusheng_gm-backup/_data/
# 恢复（需停服）
docker exec -i $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng < backup.sql
```

## 监控阈值

| 指标 | 正常 | 告警 |
|------|------|------|
| 服务端内存 | < 1GB | > 2GB |
| 数据库连接数 | < 50 | > 80 |
| Redis 内存 | < 500MB | > 1GB |
| Tick 延迟 | < 100ms | > 500ms |

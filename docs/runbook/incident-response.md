# 故障排查手册

## 概述

本文档描述常见故障的排查和处理流程。

## 快速诊断

```bash
# 1. 检查所有服务状态
docker stack services daojie-yusheng

# 2. 检查健康端点
curl http://127.0.0.1:11922/health

# 3. 查看最近日志
docker service logs daojie-yusheng_server --tail 100
```

## 常见故障

### 服务端无响应

**症状**：客户端无法连接，health 接口超时

**排查步骤**：

```bash
# 1. 检查服务状态
docker service ps daojie-yusheng_server --no-trunc

# 2. 查看日志
docker service logs daojie-yusheng_server --tail 200

# 3. 检查资源使用
docker stats $(docker ps -q -f name=daojie-yusheng_server)
```

**常见原因**：
- 内存不足：检查是否 OOM
- 数据库连接池耗尽：检查连接数
- 死循环或阻塞：检查 CPU 使用率

**处理**：

```bash
# 重启服务
docker service update --force daojie-yusheng_server

# 如果持续失败，回滚
docker service rollback daojie-yusheng_server
```

---

### 数据库连接失败

**症状**：日志显示 `ECONNREFUSED` 或 `connection timeout`

**排查步骤**：

```bash
# 1. 检查 PostgreSQL 服务
docker service ps daojie-yusheng_postgres

# 2. 检查数据库日志
docker service logs daojie-yusheng_postgres --tail 100

# 3. 测试连接
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "SELECT 1"
```

**常见原因**：
- PostgreSQL 服务未启动
- 密码错误
- 连接数超限

**处理**：

```bash
# 重启数据库服务
docker service update --force daojie-yusheng_postgres

# 检查连接数
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "SELECT count(*) FROM pg_stat_activity"
```

---

### Redis 连接失败

**症状**：日志显示 Redis 连接错误

**排查步骤**：

```bash
# 1. 检查 Redis 服务
docker service ps daojie-yusheng_redis

# 2. 测试连接
docker exec -it $(docker ps -q -f name=daojie-yusheng_redis) redis-cli ping
```

**处理**：

```bash
# 重启 Redis
docker service update --force daojie-yusheng_redis
```

---

### 玩家无法登录

**症状**：登录请求返回错误或超时

**排查步骤**：

```bash
# 1. 检查认证日志
docker service logs daojie-yusheng_server --tail 200 | grep -i auth

# 2. 检查 Redis 会话
docker exec -it $(docker ps -q -f name=daojie-yusheng_redis) \
  redis-cli keys "session:*" | head -10
```

**常见原因**：
- Token 密钥配置错误
- Redis 会话过期
- 数据库用户表异常

---

### 地图加载失败

**症状**：玩家进入地图卡住或报错

**排查步骤**：

```bash
# 1. 检查地图加载日志
docker service logs daojie-yusheng_server --tail 200 | grep -i map

# 2. 检查内存使用
docker stats $(docker ps -q -f name=daojie-yusheng_server)
```

**常见原因**：
- 地图配置文件损坏
- 内存不足
- 怪物配置引用不存在的 ID

---

### 战斗异常

**症状**：战斗不结算、伤害异常、技能不生效

**排查步骤**：

```bash
# 1. 检查战斗日志
docker service logs daojie-yusheng_server --tail 500 | grep -i combat

# 2. 使用 smoke 测试
pnpm --filter @mud/server smoke:combat
```

**相关文档**：
- [战斗链路运维手册](战斗链路运维手册.md)
- [战斗链路-smoke说明](战斗链路-smoke说明.md)

---

## 紧急恢复

### 完全重启 Stack

```bash
# 1. 停止 Stack
docker stack rm daojie-yusheng

# 2. 等待完全停止
sleep 30

# 3. 重新部署
docker stack deploy --with-registry-auth -c docker-stack.tencent.yml daojie-yusheng
```

### 数据库恢复

```bash
# 1. 找到最近备份
ls -la /var/lib/docker/volumes/daojie-yusheng_gm-backup/_data/

# 2. 恢复备份（需要停止服务）
docker exec -i $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng < backup.sql
```

## 监控指标

| 指标 | 正常范围 | 告警阈值 |
|------|----------|----------|
| 服务端内存 | < 1GB | > 2GB |
| 数据库连接数 | < 50 | > 80 |
| Redis 内存 | < 500MB | > 1GB |
| Tick 延迟 | < 100ms | > 500ms |

## 相关文档

- [部署手册](deployment.md)
- [服务端环境变量](../config/server-env.md)

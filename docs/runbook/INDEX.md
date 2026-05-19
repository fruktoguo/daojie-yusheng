# 运维手册索引

快速定位生产环境问题的入口。

## 手册列表

| 手册 | 解决什么问题 |
|------|------|
| [部署手册](deployment.md) | 首次部署、更新、回滚、自动更新器 |
| [故障排查手册](incident-response.md) | 服务无响应、DB/Redis 连接失败、登录异常 |
| [战斗链路运维手册](战斗链路运维手册.md) | 战斗不结算、技能不生效、怪物行为异常 |
| [战斗链路-smoke说明](战斗链路-smoke说明.md) | 各 smoke/audit/bench 回答什么、不回答什么 |
| [邮件系统运维手册](mail-system.md) | 邮件发送失败、附件领取、过期清理 |
| [坊市系统运维手册](market-system.md) | 挂单失败、购买异常、拍卖结算、仓库丢失 |
| [GM系统运维手册](gm-system.md) | GM 登录失败、操作无响应、密码更新 |
| [Worker Pool 运维手册](worker-pool.md) | Worker 崩溃、主线程 CPU 未下降、降级定位 |
| [Heap Snapshot 摘要诊断](heap-snapshot-summary.md) | 内存泄漏定位、RSS 异常增长 |

## 紧急命令速查

```bash
# 状态检查
docker stack services daojie-yusheng
curl http://127.0.0.1:11922/health

# 重启服务
docker service update --force daojie-yusheng_server

# 回滚服务
docker service rollback daojie-yusheng_server

# 完全重启 Stack
docker stack rm daojie-yusheng && sleep 30 && \
docker stack deploy --with-registry-auth -c docker-stack.tencent.yml daojie-yusheng
```

## 紧急程度

- **P0**: 生产事故，立即处理
- **P1**: 功能受损，1小时内处理
- **P2**: 非紧急，计划内处理

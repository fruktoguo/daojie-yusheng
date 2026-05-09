# 运维手册索引

本目录记录部署、故障响应、回滚、验证等运维操作流程。

## 手册列表

| 手册 | 场景 |
|------|------|
| [部署手册](deployment.md) | 首次部署、更新、回滚 |
| [故障排查手册](incident-response.md) | 常见故障诊断和处理 |
| [战斗链路运维手册](战斗链路运维手册.md) | 战斗系统诊断和验证 |
| [战斗链路-smoke说明](战斗链路-smoke说明.md) | smoke 测试覆盖范围 |

## 快速命令

### 状态检查

```bash
# 服务状态
docker stack services daojie-yusheng

# 健康检查
curl http://127.0.0.1:11922/health

# 查看日志
docker service logs daojie-yusheng_server -f --tail 100
```

### 紧急操作

```bash
# 重启服务
docker service update --force daojie-yusheng_server

# 回滚服务
docker service rollback daojie-yusheng_server

# 完全重启 Stack
docker stack rm daojie-yusheng && sleep 30 && \
docker stack deploy --with-registry-auth -c docker-stack.tencent.yml daojie-yusheng
```

## 使用说明

- 新增手册时复制 `template.md`
- 每个手册必须包含：触发条件、操作步骤、验证方式、回滚方案
- 命令必须可直接复制执行
- 异常情况必须有对应处理分支

## 紧急程度定义

- **P0**: 生产事故，立即处理
- **P1**: 功能受损，1小时内处理
- **P2**: 非紧急，计划内处理

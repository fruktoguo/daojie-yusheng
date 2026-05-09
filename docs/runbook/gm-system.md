# GM 系统运维手册

## 概述

GM（Game Master）系统提供游戏管理功能，包括玩家管理、物品发放、数据查询、地图编辑等。本手册描述 GM 系统的运维操作和安全管理。

## 架构

```
┌─────────────────┐     ┌─────────────────┐
│   GM Client     │────▶│   GM API        │
│  (gm.html)      │     │  (/api/gm/*)    │
└─────────────────┘     └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │ RuntimeGmAuth   │
                        │ (鉴权服务)       │
                        └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │ RuntimeGmState  │
                        │ (状态服务)       │
                        └─────────────────┘
```

## 核心组件

| 组件 | 位置 | 职责 |
|------|------|------|
| RuntimeGmAuthService | `runtime/gm/` | GM 鉴权，密码验证和 token 签发 |
| RuntimeGmStateService | `runtime/gm/` | GM 状态，在线 GM 管理 |
| NativeGmController | `http/native/` | GM HTTP API 入口 |
| NativeGmMailService | `http/native/` | GM 邮件发送服务 |

## GM 入口

| 入口 | URL | 说明 |
|------|-----|------|
| GM 面板 | `/gm.html` | Web GM 控制台 |
| 地图编辑器 | `/gm-world-viewer.html` | 地图查看和编辑 |
| GM API | `/api/gm/*` | RESTful API |

## 鉴权机制

### 密码配置

GM 密码通过环境变量配置：

```bash
export GM_PASSWORD='强密码'
```

**安全要求**：
- 生产环境必须设置强密码
- 密码长度至少 12 位
- 包含大小写字母、数字和特殊字符

### Token 机制

- Token 有效期：12 小时
- Token 存储：客户端 localStorage
- Token 验证：每次 API 请求

### 登录流程

```
1. GM 输入密码
2. 服务端验证密码（bcrypt）
3. 签发 JWT token
4. 客户端存储 token
5. 后续请求携带 token
```

## 状态检查

### 检查 GM 服务状态

```bash
# 查看 GM 相关日志
docker service logs daojie-yusheng_server --tail 200 | grep -i gm

# 检查 GM 鉴权表
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "SELECT * FROM server_gm_auth"
```

### 检查在线 GM

```bash
# 通过日志查看 GM 活动
docker service logs daojie-yusheng_server --tail 500 | grep "GM.*login\|GM.*action"
```

## 常见故障

### GM 登录失败

**症状**：输入正确密码但无法登录

**排查步骤**：

```bash
# 1. 检查环境变量
echo $GM_PASSWORD

# 2. 检查鉴权日志
docker service logs daojie-yusheng_server --tail 200 | grep -i "gm.*auth"

# 3. 检查数据库连接
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "SELECT 1"
```

**常见原因**：
- 环境变量未设置
- 密码不匹配
- 数据库连接失败
- Token 签发失败

### GM 操作无响应

**症状**：GM 操作提交后无反馈

**排查步骤**：

```bash
# 1. 检查 API 日志
docker service logs daojie-yusheng_server --tail 200 | grep -i "api/gm"

# 2. 检查 token 有效性
# 客户端控制台查看 token 是否过期

# 3. 检查目标玩家状态
# 确认玩家在线或数据存在
```

### GM 面板加载失败

**症状**：GM 面板页面空白或报错

**排查步骤**：

```bash
# 1. 检查静态资源
curl -I http://127.0.0.1:11921/gm.html

# 2. 检查客户端日志
# 浏览器控制台查看错误

# 3. 检查 CORS 配置
# 确认 GM 域名在允许列表
```

## GM 操作指南

### 玩家管理

```bash
# 查询玩家信息
curl http://127.0.0.1:11922/api/gm/player/info?playerId=xxx \
  -H "Authorization: Bearer <GM_TOKEN>"

# 踢出玩家
curl -X POST http://127.0.0.1:11922/api/gm/player/kick \
  -H "Authorization: Bearer <GM_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"playerId": "xxx"}'
```

### 物品发放

```bash
# 发放物品（通过邮件）
curl -X POST http://127.0.0.1:11922/api/gm/mail/send \
  -H "Authorization: Bearer <GM_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "xxx",
    "title": "GM 发放",
    "content": "测试物品",
    "attachments": [{"itemId": "minor_qi_pill", "count": 10}]
  }'
```

### 数据查询

```bash
# 查询玩家背包
curl http://127.0.0.1:11922/api/gm/player/inventory?playerId=xxx \
  -H "Authorization: Bearer <GM_TOKEN>"

# 查询玩家位置
curl http://127.0.0.1:11922/api/gm/player/location?playerId=xxx \
  -H "Authorization: Bearer <GM_TOKEN>"
```

## 安全管理

### 密码更新

1. 更新环境变量：
```bash
export GM_PASSWORD='新密码'
```

2. 重启服务：
```bash
docker service update --force daojie-yusheng_server
```

3. 通知所有 GM 重新登录

### 审计日志

GM 操作会记录审计日志：

```bash
# 查看 GM 操作日志
docker service logs daojie-yusheng_server --tail 500 | grep "GM.*action"
```

### 权限控制

当前 GM 系统为单一权限级别。如需分级权限，需要扩展：

- 超级 GM：所有权限
- 普通 GM：查询和基础操作
- 客服 GM：仅查询权限

## 开发环境

### 本地 GM 密码

开发环境使用默认密码：

```bash
# 仅限开发环境
GM_PASSWORD=dev123456
```

**警告**：生产环境禁止使用默认密码

### 跳过鉴权（仅开发）

开发环境可配置跳过鉴权：

```bash
# 仅限开发环境
NODE_ENV=development
```

## 监控指标

| 指标 | 正常范围 | 告警阈值 |
|------|----------|----------|
| GM 登录失败次数 | < 5/小时 | > 20/小时 |
| GM 操作延迟 | < 200ms | > 1000ms |
| 在线 GM 数量 | 1-5 | > 10 |

## 紧急操作

### 强制登出所有 GM

```bash
# 重启服务会清除所有 GM session
docker service update --force daojie-yusheng_server
```

### 禁用 GM 系统

```bash
# 临时禁用（设置无效密码）
export GM_PASSWORD='DISABLED_$(date +%s)'
docker service update --force daojie-yusheng_server
```

## 相关文档

- [服务端环境变量](../config/server-env.md)
- [故障排查手册](incident-response.md)
- [邮件系统运维手册](mail-system.md)

# GM 系统运维手册

解决 GM 登录失败、操作无响应、密码管理和安全审计问题。

## GM 入口

| 入口 | URL |
|------|-----|
| GM 面板 | `/gm.html` |
| 地图编辑器 | `/gm-world-viewer.html` |
| GM API | `/api/gm/*` |

## 故障排查

### GM 登录失败

```bash
# 检查环境变量是否设置
echo $GM_PASSWORD

# 检查鉴权日志
docker service logs daojie-yusheng_server --tail 200 | grep -i "gm.*auth"

# 检查数据库
docker exec -it $(docker ps -q -f name=daojie-yusheng_postgres) \
  psql -U mud -d daojie_yusheng -c "SELECT * FROM server_gm_auth"
```

常见原因：环境变量未设置、密码不匹配、DB 连接失败。

### GM 操作无响应

```bash
docker service logs daojie-yusheng_server --tail 200 | grep -i "api/gm"
```

检查：Token 是否过期（12小时有效期）、目标玩家是否存在。

### GM 面板加载失败

```bash
curl -I http://127.0.0.1:11921/gm.html
```

检查静态资源是否正常、浏览器控制台错误。

## 常用 GM 操作

```bash
# 查询玩家
curl http://127.0.0.1:11922/api/gm/player/info?playerId=xxx \
  -H "Authorization: Bearer <GM_TOKEN>"

# 踢出玩家
curl -X POST http://127.0.0.1:11922/api/gm/player/kick \
  -H "Authorization: Bearer <GM_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"playerId": "xxx"}'

# 发放物品（通过邮件）
curl -X POST http://127.0.0.1:11922/api/gm/mail/send \
  -H "Authorization: Bearer <GM_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"playerId":"xxx","title":"GM发放","content":"测试","attachments":[{"itemId":"minor_qi_pill","count":10}]}'
```

## 安全操作

### 更新密码

```bash
export GM_PASSWORD='新密码'
docker service update --force daojie-yusheng_server
# 通知所有 GM 重新登录
```

### 强制登出所有 GM

```bash
docker service update --force daojie-yusheng_server
```

### 紧急禁用 GM 系统

```bash
export GM_PASSWORD='DISABLED_$(date +%s)'
docker service update --force daojie-yusheng_server
```

### 审计日志

```bash
docker service logs daojie-yusheng_server --tail 500 | grep "GM.*action"
```

## 监控阈值

| 指标 | 正常 | 告警 |
|------|------|------|
| GM 登录失败次数 | < 5/小时 | > 20/小时（可能暴力破解） |
| GM 操作延迟 | < 200ms | > 1000ms |

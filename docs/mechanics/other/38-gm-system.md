# GM 系统

## GM 鉴权常量

源文件: `packages/server/src/runtime/gm/runtime-gm-auth.service.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| DEFAULT_TOKEN_TTL_SEC | 43200 (12h) | Token 有效期 |
| DEFAULT_GM_PASSWORD | admin123 | 仅开发环境降级用 |
| GM_AUTH_TABLE | server_gm_auth | 数据库表名 |
| 密码最小长度 | 12 | 修改密码时校验 |

## GM 鉴权流程

- 密码存储: `scrypt(password, salt, 64) → hex`
- 兼容旧 bcrypt 记录（哨兵盐 `__legacy_bcrypt__`）
- Token 格式: `v1.{base64url_payload}.{hmac_sha256_signature}`
- Payload: `{ role: 'gm', exp: timestamp, rev: updatedAt }`
- 签名密钥: `SERVER_GM_AUTH_SECRET` 或回退到 `hash:salt:updatedAt`

## GM 命令列表

源文件: `packages/server/src/runtime/world/command/world-runtime-gm-system-command.service.ts`

| 命令 kind | 功能 | 参数 |
|-----------|------|------|
| gmUpdatePlayer | 修改玩家状态 | playerId, instanceId, mapId, x, y, hp, autoBattle |
| gmResetPlayer | 复活玩家 | playerId |
| gmSpawnBots | 生成挂机分身 | anchorPlayerId, count (max 200) |
| gmRemoveBots | 移除分身 | playerIds[], all |

## GM HTTP 端点

源文件: `packages/server/src/http/native/native-gm.controller.ts`

| 端点 | 功能 |
|------|------|
| GET state | 面板快照（玩家列表、性能） |
| GET players | 玩家列表 |
| GET world/summary | 世界摘要 |
| GET world/objects | 世界对象 |
| POST world/instances/:id/freeze | 冻结实例 |
| POST shortcuts/world/cleanup-abnormal-temporary-tiles | 扫描运行时地图并清理异常临时石头 |
| POST shortcuts/maintenance/repair-market-storage-item-ids | 一次性修复坊市托管仓旧 storage_item_id |
| GET database/state | 数据库状态 |
| POST database/backup | 数据库备份 |
| POST database/restore | 数据库恢复 |
| POST diagnostics/query | 诊断查询 |
| GET environment/check | 环境检查 |
| GET workers | 后台任务 |
| POST workers/scheduler/:taskId/trigger | 触发任务 |
| GET ai/providers | AI 提供者管理 |

## GM 权限等级

- 单一 GM 角色，无分级权限
- 所有 GM 端点统一通过 Token 鉴权
- 开发环境可通过 `SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD=1` 降级

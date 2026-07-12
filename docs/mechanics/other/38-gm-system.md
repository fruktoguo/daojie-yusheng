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
- 服务启动时回读当前密码记录的 `updatedAt`；登录、改密和恢复回读串行执行
- 修改密码提交成功后立即替换内存 `rev`，此前签发的 Token 会以版本不匹配失效，重启不会恢复旧 Token

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
| POST shortcuts/players/migrate-recovery-pills | 将旧恢复丹药迁移到当前保留的 8 个恢复丹药 |
| POST shortcuts/maintenance/repair-market-storage-item-ids | 一次性修复坊市托管仓旧 storage_item_id |
| GET database/state | 数据库状态 |
| POST database/backup | 数据库备份 |
| POST database/restore | 数据库恢复 |
| POST diagnostics/query | 诊断查询 |
| GET environment/check | 环境检查 |
| GET workers | 后台任务 |
| POST workers/scheduler/:taskId/trigger | 触发任务 |
| GET ai/providers | AI 提供者管理 |

## GM AI 配置密钥

- AI 提供者 API Key 存储需要数据库可用，并优先使用独立的 `SERVER_SECRET_ENCRYPTION_KEY`（兼容 `SECRET_ENCRYPTION_KEY`）加密。
- 未配置独立密钥时，可复用 `SERVER_PLAYER_TOKEN_SECRET` / `JWT_SECRET` 作为兜底以保持旧生产环境可用。
- GM 环境检测对兜底密钥显示 `warn`；生产建议配置独立 `SERVER_SECRET_ENCRYPTION_KEY`，便于后续密钥轮换与权限隔离。

## GM 权限等级

- 单一 GM 角色，无分级权限
- 所有 GM 端点统一通过 Token 鉴权
- 开发环境可通过 `SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD=1` 降级

## Runtime 调试控制面

- `/runtime/*` 是独立于原生 GM API 的内部调试控制面，默认关闭；它包含玩家资产、位置、市场、邮件和 flush 等高权限操作。
- 非 `test / verify / smoke` 环境只有同时显式设置 `SERVER_RUNTIME_HTTP=1` 和非空 `SERVER_RUNTIME_ADMIN_TOKEN`（兼容 `SERVER_RUNTIME_HTTP_TOKEN`）时才会启用。
- 生产或预发布环境请求启用但缺少 token 时失败关闭；即使继承了 `smoke:*` lifecycle 变量，也不能绕过声明为 `production / prod / staging` 的运行环境。
- 请求通过 `x-runtime-admin-token` 或 `Authorization: Bearer <token>` 携带凭据；token 使用恒定时间比较。
- 仅明确的测试、验证和 smoke 运行环境允许无 token 启用，便于本地门禁启动临时服务；该豁免不适用于生产或预发布环境。
- `wallet/credit`、`wallet/debit` 与 `grant-item` 是资产管理入口：生产请求必须携带调用方生成的稳定 `requestId`，响应同时返回 `requestId` 和内部 `operationId`；网络失败重试必须复用原 `requestId`。
- 钱包增减也统一写入 `player_inventory_item` 背包真源，`wallet` 只由提交后的运行态背包刷新；同 `requestId` 同参数精确重放不会重复变更，不同参数复用会被拒绝。
- 非测试环境的 durable operation 不可用时，资产入口返回失败，不允许只修改易失运行态后返回成功；测试环境仍可使用无数据库运行态 fallback 供协议和玩法 smoke 构造夹具。

## GM 玩家修改持久化边界

- 玩家修改请求只允许已注册的 `section`；未知分区直接拒绝，不执行无意义或扩大范围的存档写入。
- `basic`、`realm`、`techniques`、`craftSkills`、`items`、`quests` 和位置/重置等操作只写实际受影响的玩家分域投影，不回退为整玩家投影覆盖。
- 在线炼体调整完成数据库写入后，只确认 `body_training`、`progression`、`attr` 三个 domain，并携带构建快照时的持久化 revision；数据库 I/O 期间产生的新变更继续保持 dirty，等待下一轮 flush。

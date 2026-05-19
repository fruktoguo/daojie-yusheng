# GM 运行时开关（Runtime Flag）

通用服务端运行时开关表，允许 GM 通过 HTTP 接口在不重启服务的情况下控制功能开关。

## 表结构

```sql
CREATE TABLE server_gm_runtime_flag (
  key varchar(120) PRIMARY KEY,
  value boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

## 已注册的开关

| key | 默认值 | 说明 |
|-----|--------|------|
| `combat_audit_enabled` | `false` | 战斗审计日志写入开关。为 true 时 CombatAuditOutboxService 才会写入 asset_audit_log |

## GM HTTP 接口

所有接口需要 GM 鉴权。

### 列出所有开关

```
GET /gm/runtime-flags
```

响应：
```json
{ "flags": [{ "key": "combat_audit_enabled", "value": false }] }
```

### 设置开关

```
POST /gm/runtime-flags/:key
Content-Type: application/json

{ "value": true }
```

响应：
```json
{ "ok": true, "key": "combat_audit_enabled", "value": true }
```

### 删除开关

```
DELETE /gm/runtime-flags/:key
```

响应：
```json
{ "ok": true, "key": "combat_audit_enabled" }
```

## 服务端行为

- `GmRuntimeFlagPersistenceService` 在启动时自动建表并加载所有 flag 到内存缓存
- `CombatAuditOutboxService` 在 `onModuleInit` 时检查 `combat_audit_enabled`：
  - flag 存在且为 `true` → 启用战斗审计
  - flag 不存在或为 `false` → 禁用战斗审计
  - 如果 `GmRuntimeFlagPersistenceService` 不可用（无数据库），回退到环境变量 `SERVER_COMBAT_AUDIT_ENABLED`
- 开关变更后需要重启服务才能生效（战斗审计的启用/禁用在启动时决定）

## 新增开关的方式

1. 在数据库中插入新的 flag 行（通过 GM 接口或直接 SQL）
2. 在需要检查开关的服务中注入 `GmRuntimeFlagPersistenceService`
3. 调用 `this.flagService.getFlag('your_flag_key')` 获取当前值

## 文件清单

- `packages/server/src/persistence/gm-runtime-flag-persistence.service.ts` — 持久化服务
- `packages/server/src/persistence/combat-audit-outbox.service.ts` — 战斗审计（消费方）
- `packages/server/src/http/native/native-gm.controller.ts` — GM HTTP 端点
- `packages/server/src/app.module.ts` — 模块注册

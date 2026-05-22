# Actor 系统

## Actor 蓝图注册表常量

| 常量 | 值 | 源文件 |
|------|-----|--------|
| DEFAULT_CAPACITY | 1000 | `packages/server/src/runtime/actor/actor-blueprint-registry.service.ts` |
| DEFAULT_TTL_MS | 1800000（30min） | 同上 |
| GC_INTERVAL_MS | 60000（1min） | 同上 |

## 蓝图 ID 格式

```
bp_{base36时间戳}_{6字节hex随机后缀}
```

## 蓝图生命周期

- 注册时设置 TTL（30 分钟）
- 查询时惰性删除过期项
- 超容量时淘汰最旧条目（Map 插入顺序 LRU）
- 每 60 秒 GC 扫描清理过期项
- 服务重启全部失效

## 持久化策略类型

| kind | 说明 | 允许的 domain |
|------|------|--------------|
| full | 完整持久化 | 全部 |
| none | 不持久化 | 无 |
| derived_from_owner | 从 owner 派生（clone） | snapshot, identity, audit |
| owner_sub_resource | owner 子资源（pet） | snapshot, identity, audit |

## 默认策略（按前缀）

| EphemeralActorKind | 默认 policy |
|-------------------|-------------|
| bot | none |
| clone | none（需显式 register） |
| pet | none（需显式 register） |
| 普通玩家 | full |

## 持久化 Domain 枚举

```
snapshot | presence | inventory | equipment | wallet | counters
mail | market | outbox | leaderboard | audit | identity | session_route
```

## 临时 Actor 身份服务常量

| 常量 | 值 | 源文件 |
|------|-----|--------|
| GC_INTERVAL_MS | 60000 | `packages/server/src/runtime/actor/ephemeral-actor-identity.service.ts` |
| DEFAULT_OWNER_QUOTA | 5000 | 同上 |

## 临时 Actor 类型与前缀

| kind | 前缀 |
|------|------|
| bot | `EPHEMERAL_BOT_ID_PREFIX` |
| clone | `EPHEMERAL_CLONE_ID_PREFIX` |
| pet | `EPHEMERAL_PET_ID_PREFIX` |

## 临时身份生命周期

- 注册时设置 `expiresAtMs`
- 查询时惰性删除过期项
- 每 60 秒 GC 扫描
- 单 owner 最多 5000 个活跃身份
- 支持按 owner 反向索引查询

## 相关源文件

- `packages/server/src/runtime/actor/actor-blueprint-registry.service.ts` — 蓝图注册表
- `packages/server/src/runtime/actor/actor-persistence-policy.service.ts` — 持久化策略
- `packages/server/src/runtime/actor/ephemeral-actor-identity.service.ts` — 临时身份

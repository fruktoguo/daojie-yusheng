# 战斗链路 Smoke 说明

说明各 smoke/audit/bench 的验证边界，避免把局部验证误读为完整替换完成。

## Stable Smoke

### `smoke:world-runtime-combat-action-service`

验证：玩家普攻/技能 action plan 产出、怪物技能预警格/吟唱/结构化拒绝、AOI/Notice/Audit/Diagnostic 分层、内部事件查询 helper。

不验证：旧生产分支是否已删除、`CombatLayeredEvents` 是否已替代 `WorldDelta.fx`/`S2C.Notice` 发包链路、战斗审计数据库查询、pending cast 恢复。

### `world-runtime-player-combat`

```bash
node packages/server/dist/tools/world-runtime-player-combat-smoke.js
```

验证：怪物掉落/PvP 奖励走 `grantInventoryItems` durable 主链、缺 durable 条件时 fail closed、提交失败时回滚+地面掉落补偿。

不验证：其他资产入口 durable 化、战斗审计覆盖、掉落审计表。

### `world-runtime-combat-boundary`

```bash
node packages/server/dist/tools/run-stable-smoke-suite.js --case world-runtime-combat-boundary
```

验证：战斗编排器无直接 socket.emit/SQL/JSON.stringify 热路径、分层边界声明。

不验证：旧分支是否已删除、审计数据库查询。

### `smoke:combat`

验证：玩家战斗旧生产路径仍可运行、action plan 路由后旧行为不被破坏。

不验证：是否已全量走统一主链路、旧发包真源是否已删除。

### `smoke:monster-combat`

验证：怪物攻击玩家旧生产路径稳定、命中/闪避通知存在。

### `smoke:monster-skill`

验证：怪物技能配置/释放/吟唱/预警格结算可跑通、唤灵真人技能顺序。

### `world-runtime-monster-los`

```bash
node packages/server/dist/tools/world-runtime-monster-los-smoke.js
```

验证：索敌/攻击不穿墙、阵法阻挡通行不遮挡视线、pending cast 死亡/过期产出 skill_cancel、资源/冷却预提交。

不验证：pending cast Redis/DB 恢复、真实 AOI 广播成本。

### 地块、阵法、容器

```bash
node packages/server/dist/tools/run-stable-smoke-suite.js --case world-runtime-damageable-tile --case world-runtime-formation --case world-runtime-loot-container
```

验证：地块扣耐久/阵法扣灵力/容器扣次数旧行为稳定、action plan 路由后不变。

### `combat-formula-main-parity`

验证：命中伤害公式与参考 main 关键样本一致。

## 协议和边界

### `pnpm audit:protocol`

验证：shared/server/client 协议兼容、内部 audit/diagnostic 不进 S2C、AOI 小包体边界。

### `pnpm audit:boundaries`

验证：无新的明显跨层直连。

### `persistence-retirement-audit`

验证：旧整档快照/通用文档桶/钱包 fallback 等退役主线未被重新引用。

## 性能

### `bench:combat`

验证：单目标结算耗时、100 候选收集耗时、100 事件构建耗时、100 玩家普攻批处理耗时、50 怪物技能批处理耗时。

不验证：完整地图实例 tick < 50ms、AOI 广播序列化 < 10ms。

## with-db 边界

### `smoke:combat-audit-outbox`

验证：CombatAuditEvent 进入内存队列、flushOnce 写入 outbox_event 和 asset_audit_log、按玩家/实例/时间查询、重建后可回读、自动清理。

不验证：真实 tick 覆盖所有语义、outbox worker 消费、pending cast 恢复。

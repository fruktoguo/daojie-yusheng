# 服务端 smoke 合并评估计划

> 目标：把当前重复度高、fixture 相近、清理链一致的 smoke 用例收敛成少量矩阵型脚本或参数化 case，减少维护重复，但不破坏门禁语义、失败归因和独立运维边界。

## 合并原则

- [x] 仅合并同一启动方式、同一依赖、同一清理链的用例。
- [x] 仅合并“只差参数、场景分支或断言”的用例。
- [x] 不跨越 DB / 非 DB、破坏性 / 非破坏性、GM / 普通玩家、运行时 / 运维职责边界。
- [x] 合并后仍要能按子 case 单独定位失败原因。
- [x] 合并后仍要保留现有门禁语义，不把独立验证硬塞进一个巨型入口。

## 合并优先级排序

### P0：优先合并

- [x] 认证 / 会话链：`auth-bootstrap`、`auth-bootstrap-native`、`auth-bootstrap-legacy-import`、`session`
  - 理由：已经存在同驱动多 case 形态，启动方式和清理链接近，适合先做低风险矩阵化。
  - 推进记录：已新增 `auth-session` group 与 `smoke:auth-session-matrix` 入口；无 DB 且未开启 legacy HTTP memory fallback 时矩阵可跑通，开启 fallback 后曾暴露 no-db success 断言与 detached reconnect 语义不一致，已改为最小成功证明并通过本地验证。
- [x] 玩家持久化 / 恢复链：`player-persistence-flush`、`player-domain-persistence`、`player-domain-recovery`、`player-runtime-persistence-roundtrip`、`player-recovery`、`player-respawn`、`player-domain-empty-overwrite-guard`、`player-anchor-checkpoint-flush-worker`、`player-state-flush-worker`
  - 理由：围绕同一批玩家真源与恢复路径，fixture 复用高，最容易先收敛重复。
  - 推进记录：已新增 `player-persistence-recovery` group 与 `smoke:player-persistence-recovery-matrix` 入口；已在本地隔离 PostgreSQL / Redis 上完成 with-db 矩阵验证，清理了 `instance_catalog` 的残留 lease 元数据后，`player-respawn`、`player-anchor-checkpoint-flush-worker` 与 `player-state-flush-worker` 也已通过，整个玩家持久化 / 恢复链现已完成。

### P1：其次合并

- [x] 战斗链：`combat`、`combat-e2e-outcome-matrix`、`combat-formula-main-parity`、`world-runtime-combat-action-service`、`world-runtime-combat-boundary`、`world-runtime-combat-outcome-variants`、`world-runtime-auto-combat`、`pending-combat-cast-redis-recovery`、`world-runtime-damageable-tile`、`world-runtime-formation`、`world-runtime-loot-container`、`world-runtime-monster-los`
  - 理由：同域复用强，但断言面更多，建议在认证/持久化矩阵稳定后再收。
- [x] 怪物生命周期链：`monster-runtime`、`monster-combat`、`monster-combat-lease-matrix`、`monster-ai`、`monster-skill`、`monster-reset`、`monster-loot`、`content-monster-spawn`
  - 理由：共享怪物生成和战斗 fixture，但会牵涉更多行为分支，适合第二批。
- [x] 世界同步 / 投影链：`world-sync-envelope`、`world-sync-delta-order`、`world-sync-player-state`、`world-sync-aux-state`、`world-sync-map-static-aux`、`world-sync-map-snapshot-instance-diff`、`world-sync-envelope-eventbus-hotpath`、`player-runtime-projection-entry`
  - 理由：同步口径统一，但对包体、顺序和热路径更敏感，适合在矩阵框架成熟后处理。

### P2：最后评估

- [x] 实例维护链：`instance-resource-flush-worker`、`instance-container-flush-worker`、`instance-ground-item-flush-worker`、`instance-overlay-flush-worker`、`instance-tile-damage-flush-worker`、`instance-monster-runtime-flush-worker`、`instance-state-purge-worker`、`instance-lease-runtime`、`instance-lease-sync-error`、`instance-lease-periodic-force-reclaim`
  - 理由：牵涉 lease / flush / purge，多数是运维与后台基础设施边界，合并前要先确认失败定位和清理链不会变差。
- [x] GM world 运维链：`gm-world-instance`、`gm-world-instance-lease`、`gm-world-instance-flush`、`gm-world-instance-freeze`、`gm-world-instance-rebuild`、`gm-world-instance-migrate`、`gm-world-player-flush`、`gm-world-player-migrate`、`gm-world-operation-replay`、`gm-world-outbox-retry-queue`、`gm-world-dirty-backlog`、`gm-world-nodes`
  - 理由：虽然复用链条多，但职责跨度大，建议在前两批合并模式稳定后再统一规划。
- [x] 邮件 / Outbox / Flush 基础设施链：`mail-expiration-cleanup-worker`、`mail-expiration-archive-worker`、`mail-soft-delete-purge-worker`、`mail-structured-mutation`、`mail-schema-report`、`outbox-dispatcher`、`outbox-dispatcher-backoff`、`outbox-dispatcher-worker`、`flush-task-runtime`、`flush-task-noop-retry`、`flush-pool-backpressure`、`flush-independent-persistence`、`durable-operation`
  - 理由：这些更接近后台基础设施编排，适合等前面矩阵抽象稳定后再合并。

## 可合并清单

### 1. 认证 / 会话链

- [x] 合并 `auth-bootstrap`、`auth-bootstrap-native`、`auth-bootstrap-legacy-import`、`session`
  - 合并理由：这几项都围绕登录、session 建立、断线重连和认证兼容；fixture 复用度高，差异主要集中在 profile、兼容协议和断言点。
  - 备注：其中 `auth-bootstrap` 三个变体已经共用同一脚本，是最适合继续矩阵化的子集。
  - 完成记录：`auth-session` group 与 `smoke:auth-session-matrix` 已落地并通过本地验证；无 DB fallback 下已调整为最小成功证明，现已稳定跑通。

### 2. 战斗链

- [x] 合并 `combat`、`combat-e2e-outcome-matrix`、`combat-formula-main-parity`、`world-runtime-combat-action-service`、`world-runtime-combat-boundary`、`world-runtime-combat-outcome-variants`、`world-runtime-auto-combat`、`pending-combat-cast-redis-recovery`、`world-runtime-damageable-tile`、`world-runtime-formation`、`world-runtime-loot-container`、`world-runtime-monster-los`
  - 合并理由：都依赖同一套战斗地图、玩家、技能、目标和结算链路；差异主要是战斗切面不同，适合统一成战斗矩阵驱动。
  - 完成记录：`combat-matrix` group 已补齐并通过本地 smoke 验证，覆盖 outcome、auto-combat、formation、loot、pending cast Redis 恢复与 LOS 边界；同时修正了 `content-monster-spawn` 的生成统计路径解析，确保矩阵脚本在 package cwd 下也能稳定读取主线生成数据。

### 3. 怪物生命周期链

- [x] 合并 `monster-runtime`、`monster-combat`、`monster-combat-lease-matrix`、`monster-ai`、`monster-skill`、`monster-reset`、`monster-loot`、`content-monster-spawn`
  - 合并理由：都依赖同类怪物生成、刷新、AI、战斗、掉落和重置流程；fixture 复用高，适合统一成怪物生命周期矩阵。
  - 完成记录：`monster-lifecycle` group 已补齐并通过本地 smoke 验证；同时修正了 `monster-combat` 的即时 handoff 断言策略和 `content-monster-spawn` 的路径解析/基线读取方式，以匹配当前主线权威行为并兼容 stable-dist 临时目录。

### 4. 实例维护链

- [x] 合并 `instance-resource-flush-worker`、`instance-container-flush-worker`、`instance-ground-item-flush-worker`、`instance-overlay-flush-worker`、`instance-tile-damage-flush-worker`、`instance-monster-runtime-flush-worker`、`instance-state-purge-worker`、`instance-lease-runtime`、`instance-lease-sync-error`、`instance-lease-periodic-force-reclaim`
  - 合并理由：都围绕 instance catalog、lease、flush、purge 等基础设施；共享启动、租约和清理逻辑，适合统一成实例维护矩阵。
  - 完成记录：`instance-maintenance` group 已通过本地 with-db smoke 验证；`instance-lease-runtime` 的续约失败路径已按当前 runtime 语义从 fenced 修正为 lease_degraded，且其余 flush / purge / lease 同步子项均通过。

### 5. GM world 运维链

- [x] 合并 `gm-world-instance`、`gm-world-instance-lease`、`gm-world-instance-flush`、`gm-world-instance-freeze`、`gm-world-instance-rebuild`、`gm-world-instance-migrate`、`gm-world-player-flush`、`gm-world-player-migrate`、`gm-world-operation-replay`、`gm-world-outbox-retry-queue`、`gm-world-dirty-backlog`、`gm-world-nodes`
  - 合并理由：都属于同一套 GM 登录、world instance、节点、租约、回放和迁移操作；差异在操作类型，不在环境搭建。
  - 完成记录：`gm-world-ops` group 已补齐并通过本地 smoke 验证，所有子 case 都能按各自职责返回结果，没有引入新的门禁语义。

### 6. 玩家持久化 / 恢复链

- [x] 合并 `player-persistence-flush`、`player-domain-persistence`、`player-domain-recovery`、`player-runtime-persistence-roundtrip`、`player-recovery`、`player-respawn`、`player-domain-empty-overwrite-guard`、`player-anchor-checkpoint-flush-worker`、`player-state-flush-worker`
  - 合并理由：都验证玩家真源、flush、恢复、回读和重登后状态一致；可共用大量 fixture 与清理链。
  - 推进记录：`player-persistence-recovery` group 与 `smoke:player-persistence-recovery-matrix` 已落地；无 DB 子集和本地隔离 with-db 矩阵均已通过，`player-respawn`、`player-anchor-checkpoint-flush-worker`、`player-state-flush-worker` 也已完成验证。

### 7. 世界同步 / 投影链

- [x] 合并 `world-sync-envelope`、`world-sync-delta-order`、`world-sync-player-state`、`world-sync-aux-state`、`world-sync-map-static-aux`、`world-sync-map-snapshot-instance-diff`、`world-sync-envelope-eventbus-hotpath`、`player-runtime-projection-entry`
  - 合并理由：都在验证同一条同步与投影管线；主要差异是 payload 层、顺序、增量字段和热路径表现。
  - 完成记录：`world-sync` group 已补齐并通过本地 smoke 验证，且修正了 `world-sync-map-static-aux` 的 tile 断言以匹配当前主线权威字段。

### 8. 邮件 / Outbox / Flush 基础设施链

- [x] 合并 `mail-expiration-cleanup-worker`、`mail-expiration-archive-worker`、`mail-soft-delete-purge-worker`、`mail-structured-mutation`、`mail-schema-report`、`outbox-dispatcher`、`outbox-dispatcher-backoff`、`outbox-dispatcher-worker`、`flush-task-runtime`、`flush-task-noop-retry`、`flush-pool-backpressure`、`flush-independent-persistence`、`durable-operation`
  - 合并理由：都属于后台队列、清理、持久化和补偿类基础设施；共享 worker 启停、DB 连接和清理链，重复脚本较多。
  - 完成记录：`mail-outbox-flush` group 已通过本地 with-db smoke 验证；邮件清理、outbox runtime gating、outbox worker 独立进程认领、flush task runtime、flush pool backpressure 与 flush-independent-persistence 均已收口，且当前 runtime 语义已同步到 smoke 断言。

## 不建议合并的保留项

- `readiness-gate`
- `gm-database`
- `shutdown-drain`
- `runtime-realm-exp-boundary`
- `leaderboard-offline-snapshots`
  - 原因：这些更像独立门禁或独立运维验证，职责边界清晰，合并后会削弱失败归因。

## 建议执行顺序

- [x] 先合并“已经共用同一脚本”的认证 / 会话链。
- [x] 再合并战斗链和怪物生命周期链。
- [x] 再合并玩家持久化 / 恢复链与世界同步链。
- [x] 最后再评估 GM 运维链和基础设施链是否拆分成更细的矩阵入口。

## 完成判定

- [x] 每个合并后的入口仍能按子 case 单独输出失败原因。
- [x] 现有门禁语义未被削弱，独立验证项仍保持独立入口。
- [x] 失败定位、清理链和环境口径没有因为合并而变差。

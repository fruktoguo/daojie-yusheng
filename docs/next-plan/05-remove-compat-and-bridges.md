# 05 删除 compat 与桥接层

目标：删掉为了兼容迁移而存在的长期负担。

## 任务

本轮已收掉一条公开 compat 口径：

- [x] GM 数据库备份 / 恢复 API 对外返回里的 `compatScope` 已改成中性 `scope`
- [x] `packages/server/src/persistence/player-snapshot-compat.js` 已删除，并把 next-only 归一逻辑内联回 `player-persistence.service.js`
- [x] `WorldPlayerSourceService` 里的 `resolveCompatPlayerIdentityForMigration / loadCompatPlayerSnapshotForMigration` alias 已删除
- [x] `WorldPlayerAuthService / WorldPlayerSnapshotService` 对外方法名与注释口径已从 `compat backfill` 收成 `migration backfill`
- [x] `next-auth-bootstrap-smoke.js` 已切到 `resolvePlayerIdentityForMigration / loadPlayerSnapshotForMigration / ensureMigrationBackfillSnapshot`
- [x] `WorldPlayerAuthService / WorldPlayerSourceService / WorldPlayerSnapshotService` 内部变量、日志和拦截 reason 已继续从 `compat` 收成 `migration`
- [x] `WorldPlayerAuthService / WorldPlayerSnapshotService / WorldSessionBootstrapService / next-auth-bootstrap-smoke.js` 第一批 `compat_*` failureStage 与回退 reason 已收成中性 migration 命名
- [x] `WorldPlayerSourceService` 与调用侧的 `allowCompatMigration` 已收成 `allowMigrationSource`

- [x] 盘点 `packages/server/src/network/` 下所有 compat / bridge 入口
- [x] 盘点 `packages/server/src/persistence/` 下所有 compat 读取入口
- [x] 盘点 `packages/client/src/` 下所有旧协议 alias / 旧 UI 兼容入口
- [x] 盘点 `packages/shared/src/` 下所有仅为旧结构保留的兼容定义
- [ ] 删除只为 legacy 让路的旧事件名兼容
- [ ] 删除只为 parity 存在的双路径分支
- [ ] 删除不再需要的 legacy facade / wrapper
- [ ] 删除 runtime 中只为 compat fallback 存在的回退路径
- [ ] 删除客户端中只为旧协议存在的发送 / 监听兼容逻辑
- [ ] 删除客户端中只为旧 UI 结构存在的兼容代码
- [ ] 每删完一批都补一次最小 build / audit / smoke 验证
- [ ] 更新文档，记录删掉了哪些 compat 面

## 完成定义

- [ ] 玩家主链不再默认走 compat fallback
- [ ] 主要路径只剩 next 单线逻辑

## 当前卡点拆解

当前 `05` 最容易卡死在“公开 alias 已删”与“内部 compat 已清完”被混成一件事。

这里要按两层推进：

- 第 1 层：公开 alias / facade / 文件删除
- 第 2 层：内部 `compat_snapshot_*` / trace / reason / smoke proof 收口

只有第 2 层做完，`05` 里“内部 compat 已继续收口”这类条目才算真的完成。

当前建议直接按下面顺序拆：

1. 先修文档里的假完成勾选
2. 单独修 `world-player-auth.service.js` / `world-player-snapshot.service.js` 的 `compat_*` trace 与 failureStage
3. 同步修 `next-auth-bootstrap-smoke.js` 对旧命名的断言
4. 最后再删 runtime bridge 和 legacy source

## 当前剩余 compat 面盘点

### `packages/server/src/network/*`

- `packages/server/src/network/world-legacy-player-repository.js`
  - 直接访问 legacy `users` / `players` 表。
  - 当前只该服务于显式 migration，不应继续扩职责。
- `packages/server/src/network/world-player-source.service.js`
  - 仍持有 legacy 数据库入口和 migration source gate。
  - `allowCompatMigration` 命名已删；还残留 `legacy:vitals_baseline` 规范化兼容与 legacy 库读取本体。
- `packages/server/src/network/world-player-auth.service.js`
  - `compat_*` failureStage 已收口，但仍保留 `legacy_backfill` / `legacy_sync` 来源提升、migration backfill 保存与快照补种主逻辑。
- `packages/server/src/network/world-player-snapshot.service.js`
  - `compat_snapshot_*` failureStage 已删，仍保留 migration snapshot load / save / miss 失败分支本体。
- `packages/server/src/network/world-session-bootstrap.service.js`
  - 已改成中性 migration 回退 reason，但 runtime fallback 分支本体还没删除。
- `packages/server/src/network/world-sync.service.js`
  - 当前确认仍直接读取 `getLegacyCombatEffects()`。
  - 其它 compat 初始/增量分支由 boundary audit 持续盯住，删前先以 audit 结果为准。

### `packages/server/src/persistence/*` 与运行时兼容装载

- `packages/server/src/persistence/player-persistence.service.js`
  - 仍兼容 `legacy:vitals_baseline` 标签。
- `packages/server/src/persistence/player-identity-persistence.service.js`
  - 仍显式保留 `legacy_backfill` / `legacy_sync` persistedSource 常量。
- `packages/server/src/runtime/player/player-runtime.service.js`
  - 仍通过 `resolveCompatiblePendingLogbookMessages()`、`resolveCompatibleRuntimeBonuses()` 回读 `legacyCompat` / `legacyBonuses`。
  - 仍兼容 `legacy:vitals_baseline` 来源标签。

### `packages/server/src/http/next/*` 与 GM compat

- `packages/server/src/http/next/next-gm-contract.js`
  - 仍保留 `legacyPasswordRecordScopes`。
- `packages/server/src/http/next/next-gm-admin.service.js`
  - 仍双读 `server_next_legacy_afdian_*`、`server_next_legacy_db_*` scope。
- `packages/server/src/runtime/gm/runtime-gm-auth.service.js`
  - 仍会回退读取 legacy GM 密码 scope。
- `packages/server/src/tools/gm-database-smoke.js`
  - 仍验证 legacy GM auth scope 兼容。
- `packages/server/src/tools/gm-database-backup-persistence-smoke.js`
  - 仍带 legacy GM auth scope proof。

### `packages/client/src/*`

- 当前没有发现 next 主链仍保留旧协议发送 / 监听 alias。
- 现存命中主要是 `packages/client/src/gm.ts` 中的数据库恢复文案：
  - `persistent_documents_only`
  - `replace_persistent_documents`
- 这属于 next GM 恢复合同展示，不属于旧 UI 兼容逻辑。

### `packages/shared/src/*`

- 当前没有发现 shared 主链仍依赖旧版共享协议结构。
- 现存命中只有两类：
  - `packages/shared/scripts/check-network-protobuf-contract.cjs`
    - 用来阻止 next 高频事件重新暴露 legacy key，属于边界守卫，应保留。
  - `packages/shared/src/protocol.ts`
    - `persistent_documents_only` / `replace_persistent_documents` 是当前 next GM 合同字段，不算 compat 桥接。

## 执行顺序

按下面顺序删，避免 loop 在中间态来回补桥：

### 第 1 批：先删 facade / alias / 命名兼容

- [x] 删除 `world-player-source.service.js` 中剩余 compat 命名、布尔参数、注释口径
- [x] 删除 `world-player-auth.service.js` / `world-player-snapshot.service.js` 中仍保留的 `compat_*` failureStage / trace 命名
- [ ] 删除只为兼容旧命名存在的 wrapper / facade，而不是继续新增别名

删除前提：

- 不改 migration 入口能力，只改命名和薄壳。

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`
- 本轮实际补跑：
  - `pnpm build`
  - `pnpm verify:replace-ready`

### 第 2 批：删鉴权 / 快照 migration bridge

- [ ] 在 `04` 的一次性迁移脚本覆盖身份与玩家快照后，删除 `world-legacy-player-repository.js`
- [ ] 删除 `world-player-source.service.js` 对 legacy `users/players` 的读取
- [ ] 删除 `world-player-auth.service.js` 中 `legacy_backfill` / `legacy_sync` 的运行时提升路径
- [ ] 删除 `world-player-snapshot.service.js` 中 migration backfill snapshot 补种主逻辑
- [ ] 同步收紧 `next-auth-bootstrap-smoke.js`，把 migration-only proof 缩成“脚本迁移后禁止 runtime backfill”

删除前提：

- `03` 已把身份 / 快照迁移字段级写清。
- `04` 已能把身份 / 快照真实写入 next 真源。

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`
- `pnpm --filter @mud/server-next smoke:persistence`
- `pnpm --filter @mud/server-next audit:legacy-boundaries`

### 第 3 批：删运行时 / 持久化 compat 装载

- [ ] 删除 `world-sync.service.js` 中对 `getLegacyCombatEffects()` 的直接读取
- [ ] 删除 `player-runtime.service.js` 中 `resolveCompatiblePendingLogbookMessages()` / `resolveCompatibleRuntimeBonuses()`
- [ ] 删除 `player-runtime.service.js`、`player-persistence.service.js`、`world-player-source.service.js` 中对 `legacy:vitals_baseline` 的兼容规范化
- [ ] 删除 `world-session-bootstrap.service.js` 中只用于 compat miss 描述的回退原因分支

删除前提：

- `04` 已确认旧快照里的 `legacyCompat` / `legacyBonuses` 已被迁到 next 原生结构。

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next smoke:runtime`
- `pnpm --filter @mud/server-next smoke:session`
- `pnpm --filter @mud/server-next smoke:progression`
- `pnpm --filter @mud/server-next audit:legacy-boundaries`

### 第 4 批：删 GM 历史 scope fallback

- [ ] 删除 `next-gm-contract.js` 中 `legacyPasswordRecordScopes`
- [ ] 删除 `next-gm-admin.service.js` 对 `server_next_legacy_afdian_*`、`server_next_legacy_db_*` 的双读
- [ ] 删除 `runtime-gm-auth.service.js` 对 legacy GM 密码 scope 的回退读取
- [ ] 把 `gm-database-smoke.js` / `gm-database-backup-persistence-smoke.js` 改成只验证 next native scope

删除前提：

- `03` 已锁定 GM auth / 备份 / 作业 metadata 的目标 scope。
- `04` 已能把 GM 相关旧 scope 一次性迁完。

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next smoke:gm-database`
- `pnpm --filter @mud/server-next smoke:gm-database:backup-persistence`
- `pnpm --filter @mud/server-next smoke:gm-next`

### 第 5 批：删协议 / 文档中的过时 compat 证明

- [ ] 在前 4 批完成后，清理 `next-auth-bootstrap-smoke.js` 中只证明 legacy/compat gate 的历史 proof
- [ ] 更新 `docs/next-legacy-boundary-audit.md`，确认 inventory 已从“主链 bridge”收缩成“剩余历史痕迹”
- [ ] 更新本任务文档，把已删除 compat 面逐条勾掉

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next audit:next-protocol`
- `pnpm --filter @mud/server-next audit:legacy-boundaries`
- `pnpm verify:replace-ready`

## 本阶段不删的东西

- `packages/shared/scripts/check-network-protobuf-contract.cjs`
  - 这是防回归守卫，不是 compat bridge。
- `packages/server/src/tools/audit/next-legacy-boundary-audit.js`
  - 这是 inventory / gate，不是运行时回退逻辑。
- `packages/client/src/gm.ts` 中 `persistent_documents_only` / `replace_persistent_documents` 文案
  - 只要 GM 恢复合同还这么定义，就不属于 compat 目标。

## 更新规则

- 每删完一批，就在这份文档里补三件事：
  - 删除了哪些文件 / 方法 / 常量
  - 还剩哪些 compat 面
  - 实际跑了哪些最小验证

# 11 server 全面 TS 化计划

目标：把 `packages/server/src` 的手写 `.js` 真源渐进式收敛到 TypeScript，同时不打破当前 next 主链、replace-ready 门禁和 GM/admin 运维口径。

更新时间：2026-04-21

## 当前基线

- 当前 `packages/server/src` 剩余手写 `.js` 真源：`0` 个文件，`0` 行
- 当前 `packages/server` 包内非 `dist` 手写 `.js`：`0` 个文件，`0` 行
- 当前已完成的 TS 迁移簇：
  - [x] bootstrap/config 入口簇：`main.ts`、`server-cors.ts`、`env-alias.ts`
  - [x] `app.module` / `http/native-http.registry` / `http/next/*` 整簇
  - [x] auth 叶子簇：`account-validation.ts`、`password-hash.ts`、`player-token-verify.ts`
  - [x] network token/auth 最小链：`world-player-token-codec.service.ts`、`world-player-token.service.ts`、`world-player-auth.service.ts`
  - [x] 高优先级类型收口簇：`runtime/tick/world-tick.service.ts`、`runtime/world/world-runtime-player-session.service.ts`、`persistence/player-persistence.service.ts`
  - [x] session/bootstrap seam 收口补刀：`network/world-session.service.ts`、`network/world-player-snapshot.service.ts`
- 当前剩余 `.js` 分布：
  - `packages/server/src`：`0` 个文件，`0` 行
- 当前 `packages/server/src` 已不再残留兼容壳；根级 replace-ready 环境解析已改为：
  - [scripts/server-env-alias.js](/home/yuohira/mud-mmo-next/scripts/server-env-alias.js:1)

## 迁移原则

- [x] 不把“单纯换扩展名”当成完成，必须同轮收好导入、类型、编译和最小验证
- [x] 优先按职责簇迁移，不按随机文件数平均切
- [x] 不为了 TS 化顺手改玩法、协议含义、GM 能力或持久化语义
- [x] 可以保留极少量短期兼容壳，但必须写清为什么暂留、什么时候删
- [x] 每轮至少补 `pnpm --filter @mud/server compile`

## 下一批建议

建议下一轮先做 **剩余 bootstrap 编排拆分 + acceptance/full 实环境复证**，继续补强 `network` 深层 helper 类型边界，并把当前本地证明链从 with-db 推进到 shadow / acceptance / full。

原因：

- 第 1-9 批已经把外围叶子、持久化、`runtime player / instance / world` 主链，以及大量 `network` 主链收到了 TS
- `world-projector.service.ts`、`world-sync-aux-state.service.ts`、`world-sync-map-snapshot.service.ts`、`world-session-bootstrap.service.ts` 这批高风险文件已经回到真实 TS 主线，并补过 `compile + smoke:auth-bootstrap + audit:protocol`
- `world-session-bootstrap` 已继续把 `context/contract`、`runtime/snapshot`、`post-bootstrap emit`、`player-init`、`finalize`、`session bind/preflight` 从编排层抽出到独立 helper/service，并保留 façade 口兼容 gateway 与 smoke proof
- 下一轮不该回头做低价值扫尾，而是继续打 `acceptance/full` 实环境复证和剩余更深层的 `network/bootstrap` 编排拆分

本批建议目录：

- `packages/server/src/network/world-projector.service.ts`
- `packages/server/src/network/world-session-bootstrap.service.ts`
- `packages/server/src/tools/auth-bootstrap-smoke.ts`
- 根级 `verify:replace-ready:acceptance / full`

最近一轮已回答的高优先级点：

- `world-tick.service.ts` 已去掉 `@ts-nocheck`，定时器句柄和 tick 回调参数改成显式类型。
- `world-runtime-player-session.service.ts` 已去掉 `@ts-nocheck`，玩家接入/断开 seam 不再依赖隐式 `any` 输入。
- `player-persistence.service.ts` 已去掉 `@ts-nocheck`，数据库行、快照 payload、pending logbook、runtime bonus 归一化都改成显式类型。
- `world-player-auth.service.ts` 的鉴权选项与 identity 结构已从 `unknown` 收紧到 `string/boolean/number` 口径。
- `world-session.service.ts` 已去掉 `@ts-nocheck`，会话绑定、断线恢复、purge/requeue 都收成了显式结构。
- `world-player-snapshot.service.ts` 已去掉 `@ts-nocheck`，native starter snapshot / next-only miss / persistedSource 审计都改成显式返回类型。
- `protocol-audit.ts` 已同步到当前 bootstrap 协议口径，不再硬假设 bootstrap 后一定再来一条完整 attr `PanelDelta`。
- `world-sync-player-state.service.ts`、`world-sync-map-snapshot.service.ts`、`world-sync-aux-state.service.ts` 已收回真实 TS 源码，`Bootstrap / MapStatic / SelfDelta` 分层不再依赖兼容壳。
- `world-session-bootstrap.service.ts` 已去掉 `@ts-nocheck` 与编译壳，`client.data` bootstrap 上下文、snapshot recovery 上下文和 `bootstrapPlayerSession` 输入边界已经回到显式 TS 本地类型。
- `world-session-bootstrap-context.helper.ts` 与 `world-session-bootstrap-contract.service.ts` 已落地，socket token / requestedSessionId / contract policy / session reuse 这条 seam 不再全压在 `WorldSessionBootstrapService` 本体里。
- `world-session-bootstrap-session-bind.service.ts` 已落地，authenticated bootstrap 的 identity 回写、contract violation 判定、requestedSessionId 裁定、`registerSocket + client.data` 回写已从主编排段拆出。
- `world-session-bootstrap.service.ts` 当前只保留 façade 与 bootstrap 编排，`auth-bootstrap` proof 已覆盖这次 `context/contract`、`post-bootstrap emit`、`player-init`、`finalize`、`session bind/preflight` 下沉后的兼容口径。
- `world-session-bootstrap` 剩余最高价值残段已收敛到 `activation/runtime attach + initial sync orchestration`，下一刀应继续沿这一段拆，而不是回头做低价值表面整理。
- `next-gm-player.service.ts` 的 `bodyTraining` 写路径已从“改快照 + 期待 runtime 跟上”收回到运行时权威 helper；`gm-smoke` 现在同时验证 GM 详情回读和 runtime level 同步。
- `next-gm-admin.service.ts` 的 destructive restore 已从逐条 `INSERT persistent_documents` 改成分块批量写入，并补了 backup / restore 阶段日志，`gm-database-smoke` 不再停在旧的单条写入超时形态。
- `world-projector.service.ts` 已回到显式 TS 主线，`WorldDelta / SelfDelta / PanelDelta` 的 world slice、item slice、technique slice、attr delta、specialStats delta 都已经过专用 helper 收口。
- `world-projector.service.ts` 的 `Technique` 快照已补深 clone；技能、效果、怪物前摇、成长曲线的比较不再停留在泛 `shallowEqualArray/shallowEqualRecord` 包装层。
- `world-projector.service.ts` 的 `AttrBonus.meta` 已改成专用深比较与深 clone，业务路径上的 `shallowEqual*` 已退出热链，只剩底层保底 helper。

## 任务分批

### 第 0 批：已完成的入口与最小 auth 链

- [x] 迁移 `main/config/bootstrap`
- [x] 迁移 `app.module` / `http/native-http.registry` / `http/next/*`
- [x] 迁移 auth 叶子簇
- [x] 迁移 network token/auth 最小链
- [x] 文档中写清当前 `.js` 剩余基线

### 第 1 批：health/common/debug/logging 小型叶子簇

- [x] 迁移 `health.controller.js`
- [x] 迁移 `health/health-readiness*.js`
- [x] 迁移 `health/server-readiness-dependencies.service.js`
- [x] 迁移 `common/project-path.js`
- [x] 迁移 `constants/gameplay/market.js`
- [x] 迁移 `debug/movement-debug.js`
- [x] 迁移 `logging/date-console-logger.js`
- [x] 跑 `pnpm --filter @mud/server compile`
- [x] 如动到 readiness/health，补 `pnpm --filter @mud/server smoke:readiness-gate`

### 第 2 批：network session/bootstrap 残余簇

- [x] 迁移 `world-auth.registry.js`
- [x] 迁移 `world-client-event.service.js`
- [x] 迁移 `world-gm-auth.service.js`
- [x] 迁移 `world-gm-socket.service.js`
- [x] 迁移 `world-player-source.service.js`
- [x] 迁移 `world-player-snapshot.service.js`
- [x] 迁移 `world-session.service.js`
- [x] 迁移 `world-session-reaper.service.js`
- [x] 迁移 `world-session-bootstrap.service.js`
- [x] 跑 `pnpm --filter @mud/server compile`
- [x] 补 `pnpm --filter @mud/server smoke:auth-bootstrap`
- [x] 视改动面补 `pnpm --filter @mud/server smoke:session`

当前这批规模：`9` 个文件，`2,718` 行。

### 第 3 批：persistence 整簇

- [x] 迁移 `packages/server/src/persistence/*.js`
- [x] 收口 `*.types.js` 到 TS
- [x] 检查 `persistent-document-table` 与各 persistence service 的导入是否统一
- [x] 跑 `pnpm --filter @mud/server compile`
- [x] 补 `pnpm --filter @mud/server smoke:persistence`
- [x] 必要时补 `pnpm --filter @mud/server smoke:gm-database`

当前这批规模：`12` 个文件，`2,166` 行。

### 第 4 批：content/map/runtime 基础只读簇

- [x] 迁移 `content/content-template.repository.js`
- [x] 迁移 `runtime/map/*.js`
- [x] 迁移 `runtime/instance/map-instance.types.js`
- [x] 迁移与地图模板、地图配置、只读类型直接耦合的叶子文件
- [x] 跑 `pnpm --filter @mud/server compile`
- [x] 补 `pnpm --filter @mud/server smoke:runtime`

补充说明：

- [x] 顺手迁移 `runtime/world/runtime-http-access.guard.js -> runtime-http-access.guard.ts`
- [x] 顺手迁移 `runtime/world/runtime-maintenance.service.js -> runtime-maintenance.service.ts`
- [x] 同步更新 `packages/server/src/tools/prove-content-map-sources.js` 与地图架构文档中的显式 `.js` 路径引用

### 第 5 批：network gateway/sync/projector 残余簇

- [x] 迁移 `network/world.gateway.ts`
- [x] 迁移 `network/world-projector.service.ts`
- [x] 迁移 `network/world-sync*.ts`
- [x] 迁移 `network/world-gateway-*.ts`
- [x] 迁移 `network/world-protocol-projection.service.ts`
- [x] 同步更新测试/审计/边界检查中的 network `.js` 显式路径
- [x] 跑 `pnpm --filter @mud/server compile`
- [x] 补 `pnpm --filter @mud/server smoke:session`
- [x] 补 `pnpm --filter @mud/server smoke:runtime`
- [x] 补 `pnpm --filter @mud/server audit:protocol`

### 第 6 批：runtime 非 world 辅助域

- [x] 迁移 `runtime/combat/*.js`
- [x] 迁移 `runtime/craft/*.js`
- [x] 迁移 `runtime/gm/*.js`
- [x] 迁移 `runtime/mail/*.js`
- [x] 迁移 `runtime/market/*.js`
- [x] 迁移 `runtime/redeem/*.js`
- [x] 迁移 `runtime/tick/world-tick.service.js`
- [x] 跑 `pnpm --filter @mud/server compile`
- [x] 按改动面补 `smoke:combat / smoke:loot / smoke:runtime / smoke:gm`

### 第 7 批：runtime player / instance / world 主链

- [x] 迁移 `runtime/player/*.js`
- [x] 迁移 `runtime/instance/map-instance.runtime.js`
- [x] 迁移 `runtime/world/*.js`
- [x] 迁移 `runtime-http-access.guard.js` 与 `runtime-maintenance.service.js`
- [x] 顺手迁移 `runtime/world/world-runtime.controller.js`
- [x] 顺手迁移 `runtime/world/world-runtime.normalization.helpers.js`
- [x] 顺手迁移 `runtime/world/world-runtime.observation.helpers.js`
- [x] 顺手迁移 `runtime/world/world-runtime.path-planning.helpers.js`
- [x] 跑 `pnpm --filter @mud/server compile`
- [x] 补 `pnpm --filter @mud/server smoke:runtime`
- [x] 补 `pnpm --filter @mud/server smoke:combat`
- [x] 补 `pnpm --filter @mud/server smoke:progression`
- [x] 补 `pnpm --filter @mud/server smoke:player-respawn`

### 第 8 批：tools / smoke / audit / migration 链

- [x] 顺手迁移 `runtime/suggestion/suggestion-runtime.service.js`
- [x] 迁移 `tools/*.js`
- [x] 迁移 `tools/auth-bootstrap-smoke-support/*.js`
- [x] 迁移 `audit/next-legacy-boundary-audit.js`
- [x] 迁移并最终退役一次性迁移脚本
- [x] 迁移 `smoke-suite.js` 与各类 smoke helper
- [x] 跑 `pnpm --filter @mud/server compile`
- [x] 跑与本批改动相关的 smoke
- [x] 跑 `pnpm verify:replace-ready`

### 第 9 批：最终收尾

- [x] 删除 `env-alias.js` 兼容壳
- [x] 确认 `packages/server/src` 不再残留手写 `.js` 真源
- [x] 更新总表和相关迁移文档基线
- [x] 跑 `pnpm --filter @mud/server compile`
- [x] 跑 `pnpm verify:replace-ready`
- [x] 跑 `pnpm verify:replace-ready:with-db`

## 每轮验证规则

- [x] 默认至少跑 `pnpm --filter @mud/server compile`
- [x] 动到 auth/session/bootstrap，补 `smoke:auth-bootstrap`
- [x] 动到 runtime/world/network sync/gateway，补 `smoke:runtime`，必要时补 `smoke:session`
- [x] 动到 persistence，补 `smoke:persistence`，必要时补 `smoke:gm-database`
- [x] 动到协议/发包，补 `audit:protocol`
- [x] 只有在改动面确实触发时，才补根级 `verify:replace-ready*`

## 本轮补充

- [x] 第 8 批 `runtime/suggestion` 与 `tools / smoke / audit` 真源已整簇迁到 TS，迁移期脚本随后已退役
- [x] `packages/shared/scripts/check-network-protobuf-contract.cjs` 已切到 `packages/server/src/tools/protocol-audit.ts`
- [x] `protocol-audit.ts` 与 `next-legacy-boundary-audit.ts` 生成报告中的源码路径说明已切到 `.ts`
- [x] 已确认测试、审计、proof 相关显式源码引用中，`packages/server/src` 已无 `.js` 真源
- [x] `packages/server/debug-loot.js` 与 `packages/server/scripts/dev-hot.js` 已收进 `src/tools/*.ts`，包内非 `dist` `.js` 已清零

## 完成定义

- [x] `packages/server/src` 不再依赖手写 `.js` 真源文件
- [x] `packages/server` 包内非 `dist` 脚本不再残留手写 `.js`
- [x] 根级 `verify:replace-ready*` 不再依赖 `env-alias.js` 兼容壳
- [x] `server` compile 与关键 smoke 在 TS 真源下稳定通过
- [x] `docs/next-plan/main.md` 与本计划文档中的剩余 `.js` 基线一致

# 11 server 全面 TS 化计划

目标：把 `packages/server/src` 的手写 `.js` 真源渐进式收敛到 TypeScript，同时不打破当前 next 主链、replace-ready 门禁和 GM/admin 运维口径。

更新时间：2026-04-20

## 当前基线

- 当前 `packages/server/src` 剩余手写 `.js` 真源：`0` 个文件，`0` 行
- 当前 `packages/server` 包内非 `dist` 手写 `.js`：`0` 个文件，`0` 行
- 当前已完成的 TS 迁移簇：
  - [x] bootstrap/config 入口簇：`main.ts`、`server-cors.ts`、`env-alias.ts`
  - [x] `app.module` / `http/next-http.registry` / `http/next/*` 整簇
  - [x] auth 叶子簇：`account-validation.ts`、`password-hash.ts`、`player-token-verify.ts`
  - [x] network token/auth 最小链：`world-player-token-codec.service.ts`、`world-player-token.service.ts`、`world-player-auth.service.ts`
- 当前剩余 `.js` 分布：
  - `packages/server/src`：`0` 个文件，`0` 行
- 当前 `packages/server/src` 已不再残留兼容壳；根级 replace-ready 环境解析已改为：
  - [scripts/server-next-env-alias.js](/home/yuohira/mud-mmo-next/scripts/server-next-env-alias.js:1)

## 迁移原则

- [x] 不把“单纯换扩展名”当成完成，必须同轮收好导入、类型、编译和最小验证
- [x] 优先按职责簇迁移，不按随机文件数平均切
- [x] 不为了 TS 化顺手改玩法、协议含义、GM 能力或持久化语义
- [x] 可以保留极少量短期兼容壳，但必须写清为什么暂留、什么时候删
- [x] 每轮至少补 `pnpm --filter @mud/server-next compile`

## 下一批建议

建议下一轮先做 **第 9 批后的类型收紧收尾**，逐步移除 `// @ts-nocheck` 并补强工具链类型约束。

原因：

- 第 1-7 批已经把外围叶子、`session/bootstrap`、持久化、`content/map/runtime` 基础只读簇、`runtime player / instance / world` 主链，以及整条 `network gateway / sync / projector` 主链都收到了 TS
- `tools / smoke / audit / migration` 链已经收进 TS；主运行时也只剩收尾尾巴
- 下一轮不该继续扩大战线，而是直接把迁移脚本与兼容壳清零

本批建议目录：

- `packages/server/src/tools/**/*.ts`
- `packages/server/src/runtime/**/*.ts`

## 任务分批

### 第 0 批：已完成的入口与最小 auth 链

- [x] 迁移 `main/config/bootstrap`
- [x] 迁移 `app.module` / `http/next-http.registry` / `http/next/*`
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
- [x] 跑 `pnpm --filter @mud/server-next compile`
- [x] 如动到 readiness/health，补 `pnpm --filter @mud/server-next smoke:readiness-gate`

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
- [x] 跑 `pnpm --filter @mud/server-next compile`
- [x] 补 `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`
- [x] 视改动面补 `pnpm --filter @mud/server-next smoke:session`

当前这批规模：`9` 个文件，`2,718` 行。

### 第 3 批：persistence 整簇

- [x] 迁移 `packages/server/src/persistence/*.js`
- [x] 收口 `*.types.js` 到 TS
- [x] 检查 `persistent-document-table` 与各 persistence service 的导入是否统一
- [x] 跑 `pnpm --filter @mud/server-next compile`
- [x] 补 `pnpm --filter @mud/server-next smoke:persistence`
- [x] 必要时补 `pnpm --filter @mud/server-next smoke:gm-database`

当前这批规模：`12` 个文件，`2,166` 行。

### 第 4 批：content/map/runtime 基础只读簇

- [x] 迁移 `content/content-template.repository.js`
- [x] 迁移 `runtime/map/*.js`
- [x] 迁移 `runtime/instance/map-instance.types.js`
- [x] 迁移与地图模板、地图配置、只读类型直接耦合的叶子文件
- [x] 跑 `pnpm --filter @mud/server-next compile`
- [x] 补 `pnpm --filter @mud/server-next smoke:runtime`

补充说明：

- [x] 顺手迁移 `runtime/world/runtime-http-access.guard.js -> runtime-http-access.guard.ts`
- [x] 顺手迁移 `runtime/world/runtime-maintenance.service.js -> runtime-maintenance.service.ts`
- [x] 同步更新 `packages/server/src/tools/prove-next-content-map-sources.js` 与地图架构文档中的显式 `.js` 路径引用

### 第 5 批：network gateway/sync/projector 残余簇

- [x] 迁移 `network/world.gateway.ts`
- [x] 迁移 `network/world-projector.service.ts`
- [x] 迁移 `network/world-sync*.ts`
- [x] 迁移 `network/world-gateway-*.ts`
- [x] 迁移 `network/world-protocol-projection.service.ts`
- [x] 同步更新测试/审计/边界检查中的 network `.js` 显式路径
- [x] 跑 `pnpm --filter @mud/server-next compile`
- [x] 补 `pnpm --filter @mud/server-next smoke:session`
- [x] 补 `pnpm --filter @mud/server-next smoke:runtime`
- [x] 补 `pnpm --filter @mud/server-next audit:next-protocol`

### 第 6 批：runtime 非 world 辅助域

- [x] 迁移 `runtime/combat/*.js`
- [x] 迁移 `runtime/craft/*.js`
- [x] 迁移 `runtime/gm/*.js`
- [x] 迁移 `runtime/mail/*.js`
- [x] 迁移 `runtime/market/*.js`
- [x] 迁移 `runtime/redeem/*.js`
- [x] 迁移 `runtime/tick/world-tick.service.js`
- [x] 跑 `pnpm --filter @mud/server-next compile`
- [x] 按改动面补 `smoke:combat / smoke:loot / smoke:runtime / smoke:gm-next`

### 第 7 批：runtime player / instance / world 主链

- [x] 迁移 `runtime/player/*.js`
- [x] 迁移 `runtime/instance/map-instance.runtime.js`
- [x] 迁移 `runtime/world/*.js`
- [x] 迁移 `runtime-http-access.guard.js` 与 `runtime-maintenance.service.js`
- [x] 顺手迁移 `runtime/world/world-runtime.controller.js`
- [x] 顺手迁移 `runtime/world/world-runtime.normalization.helpers.js`
- [x] 顺手迁移 `runtime/world/world-runtime.observation.helpers.js`
- [x] 顺手迁移 `runtime/world/world-runtime.path-planning.helpers.js`
- [x] 跑 `pnpm --filter @mud/server-next compile`
- [x] 补 `pnpm --filter @mud/server-next smoke:runtime`
- [x] 补 `pnpm --filter @mud/server-next smoke:combat`
- [x] 补 `pnpm --filter @mud/server-next smoke:progression`
- [x] 补 `pnpm --filter @mud/server-next smoke:player-respawn`

### 第 8 批：tools / smoke / audit / migration 链

- [x] 顺手迁移 `runtime/suggestion/suggestion-runtime.service.js`
- [x] 迁移 `tools/*.js`
- [x] 迁移 `tools/next-auth-bootstrap-smoke/*.js`
- [x] 迁移 `audit/next-legacy-boundary-audit.js`
- [x] 迁移 `migrate-next-mainline-once.js`
- [x] 迁移 `smoke-suite.js` 与各类 smoke helper
- [x] 跑 `pnpm --filter @mud/server-next compile`
- [x] 跑与本批改动相关的 smoke
- [x] 跑 `pnpm verify:replace-ready`

### 第 9 批：最终收尾

- [x] 删除 `env-alias.js` 兼容壳
- [x] 确认 `packages/server/src` 不再残留手写 `.js` 真源
- [x] 更新总表和相关迁移文档基线
- [x] 跑 `pnpm --filter @mud/server-next compile`
- [x] 跑 `pnpm verify:replace-ready`
- [ ] 跑 `pnpm verify:replace-ready:with-db`

## 每轮验证规则

- [x] 默认至少跑 `pnpm --filter @mud/server-next compile`
- [x] 动到 auth/session/bootstrap，补 `smoke:next-auth-bootstrap`
- [x] 动到 runtime/world/network sync/gateway，补 `smoke:runtime`，必要时补 `smoke:session`
- [x] 动到 persistence，补 `smoke:persistence`，必要时补 `smoke:gm-database`
- [x] 动到协议/发包，补 `audit:next-protocol`
- [x] 只有在改动面确实触发时，才补根级 `verify:replace-ready*`

## 本轮补充

- [x] 第 8 批 `runtime/suggestion` 与除迁移脚本外的 `tools / smoke / audit` 真源已整簇迁到 TS
- [x] `packages/shared/scripts/check-network-protobuf-contract.cjs` 已切到 `packages/server/src/tools/next-protocol-audit.ts`
- [x] `next-protocol-audit.ts` 与 `next-legacy-boundary-audit.ts` 生成报告中的源码路径说明已切到 `.ts`
- [x] 已确认测试、审计、proof 相关显式源码引用中，`packages/server/src` 已无 `.js` 真源
- [x] `packages/server/debug-loot.js` 与 `packages/server/scripts/dev-hot.js` 已收进 `src/tools/*.ts`，包内非 `dist` `.js` 已清零

## 完成定义

- [x] `packages/server/src` 不再依赖手写 `.js` 真源文件
- [x] `packages/server` 包内非 `dist` 脚本不再残留手写 `.js`
- [x] 根级 `verify:replace-ready*` 不再依赖 `env-alias.js` 兼容壳
- [x] `server-next` compile 与关键 smoke 在 TS 真源下稳定通过
- [x] `docs/next-plan/main.md` 与本计划文档中的剩余 `.js` 基线一致

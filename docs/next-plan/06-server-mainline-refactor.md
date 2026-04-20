# 06 服务端主链收口

目标：把 server-next 主链收成单路径、清职责、好验证。

## 当前基线

补充（2026-04-20，server TS loop 当前进度）：

- bootstrap/config 入口簇已从手写 `.js` 真源迁到 `.ts`：`packages/server/src/config/env-alias.ts`、`packages/server/src/config/server-cors.ts`、`packages/server/src/main.ts`
- HTTP/bootstrap 簇已从手写 `.js` 真源迁到 `.ts`：`packages/server/src/app.module.ts`、`packages/server/src/http/next-http.registry.ts` 与 `packages/server/src/http/next/*.ts`
- 前三轮 TS loop 迁移均不改变 next 主链行为、协议、持久化与 GM/admin 语义；已补跑 `pnpm --filter @mud/server-next compile`、`smoke:readiness-gate`、`smoke:next-auth-bootstrap`、`smoke:gm-next`
- 第 3 轮已继续收掉 auth 叶子真源：`packages/server/src/auth/account-validation.ts`、`packages/server/src/auth/password-hash.ts`、`packages/server/src/auth/player-token-verify.ts`
- 第 4-6 轮继续沿 network/auth 最小链路推进：`packages/server/src/network/world-player-token-codec.service.ts`、`packages/server/src/network/world-player-token.service.ts` 与 `packages/server/src/network/world-player-auth.service.ts` 已从手写 `.js` 真源迁到 `.ts`
- `06` 继续只负责 world/gateway/sync/runtime 主链收口，不重复展开 HTTP/bootstrap 与 auth 叶子迁移细节；当前 `packages/server/src` 手写 `.js` 真源已清零

当前最重的服务端主链文件已经说明这不是“文件偏长”，而是“职责失控”：

- `packages/server/src/runtime/world/world-runtime.service.ts`
  - `5426` 行
  - 当前同时混着：实例 tick 编排、移动/占位、战斗、掉落、NPC/任务、炼丹/强化、GM runtime 队列、战斗特效、复活/重生、部分详情查询。
- `packages/server/src/network/world.gateway.ts`
  - `2812` 行
  - 当前同时混着：连接入口、协议握手、鉴权后入口、GM socket、移动/战斗/任务/商店/炼丹/强化等大量 C2S handler。
- `packages/server/src/network/world-sync.service.ts`
  - `2454` 行
  - 当前同时混着：首包/增量同步、quest/loot/threat/minimap 额外同步、socket 发包、同步缓存、compat 残余路径。
- `packages/server/src/network/world-projector.service.ts`
  - `1484` 行
  - 当前同时混着：capture、diff、面板切片、战斗/动作/BUFF/技术/世界对象投影组装。
- `packages/server/src/runtime/player/player-runtime.service.ts`
  - `2564` 行
  - 当前同时混着：玩家运行时、快照恢复、兼容归一、派生属性与通知。
- `packages/server/src/network/world-session-bootstrap.service.ts`
  - `776` 行
  - 当前混着：session reuse 策略、bootstrap 入口、身份提升后首包同步准备。
- `packages/server/src/network/world-player-auth.service.ts`
  - `408` 行
  - 当前混着：token 鉴权、身份提升、migration backfill、持久化来源归一。
- `packages/server/src/network/world-player-snapshot.service.ts`
  - `284` 行
  - 体积不大，但仍在玩家主链上承担 migration backfill 和 next-only miss 收口。

## 本阶段原则

- 不按行数平均切文件，只按职责边界切。
- 先拆冷路径、纯查询、纯投影，再拆热路径状态域。
- 总编排层只保留：
  - 调用顺序
  - tick 事务边界
  - 日志/异常收口
  - 单一入口路由
- 读模型与写状态默认分开：
  - 查询/详情/投影
  - tick 写状态
  - 持久化写入
  - socket 发包
- 不在这一阶段顺手改玩法规则、协议含义、GM 产品职责。

## 任务

- [x] 继续拆 `packages/server/src/runtime/world/world-runtime.service.ts`
- [x] 继续拆 `packages/server/src/network/world.gateway.ts`
- [x] 继续拆 `packages/server/src/network/world-sync.service.ts`
- [x] 继续拆 `packages/server/src/network/world-projector.service.ts`
- [x] 继续拆玩家运行时的混杂职责
- [x] 继续拆 session / bootstrap / auth 的边界
- [x] 明确 tick 内允许写状态的入口
- [x] 明确地图、玩家、战斗、掉落、交互写路径
- [x] 明确哪些 GM 操作必须走 runtime queue
- [x] 明确哪些 GM 操作允许直接改持久态
- [x] 收口玩家从登录到进入世界到持久化的主链
- [x] 收口地图同步、面板同步、详情查询的服务边界
- [x] 补每个拆分阶段的最小 smoke 验证

## 具体拆分顺序

### 第 1 批：先把入口层收成薄路由

- [x] 把 `world.gateway.ts` 收成“事件分发层”，不再继续承载具体业务分支
- [x] 抽离握手 / hello / guest 入口处理
- [x] 抽离 authenticated player action handler
- [x] 抽离 GM socket handler
- [x] 保留一个薄 gateway，只负责：
  - 协议入口
  - client/session 基础校验
  - 把 payload 路由到具体 handler service

建议边界：

- `world.gateway.ts`
  - 最终只保留 `@SubscribeMessage` 与统一 reject / logging / routing
- 从 `world.gateway.ts` 先抽出去的优先块：
  - session / hello / authenticated connect（已抽到 `world-gateway-bootstrap.helper.ts`）
  - movement / combat / interaction
  - item / equipment / cultivate
  - quest / npc / shop / redeem
  - alchemy / enhancement
  - gm socket（已抽到 `world-gateway-gm-command.helper.ts`）

本轮已完成：

- 新增 `packages/server/src/network/world-gateway-bootstrap.helper.ts`
- `world.gateway.ts` 的 `handleConnection / handleHello` 已改为薄委托
- bootstrap promise 跟踪、guest/authenticated bootstrap 输入组装、connect/hello 协议判定、not-ready 拒绝与 hello gate 已移出 gateway 主文件

当前仍未完成：

- `world.gateway.ts` 仍保留少量统一发包/守卫 glue：`emitNext*`、`require*`、`flushMarketResult`、`broadcastSuggestions`
- `world.gateway.ts` 仍保留 `@SubscribeMessage` 装饰入口与 helper 委托，不再直接承载大块 gameplay 业务分支
- 下一阶段重心转入 batch 2：登录到进入世界的单路径，而不是继续机械拆 gateway

本轮已完成：

- 新增 `packages/server/src/network/world-gateway-gm-command.helper.ts`
- `GmGetState / GmSpawnBots / GmRemoveBots / GmUpdatePlayer / GmResetPlayer` 已从 gateway 主文件移出
- 新增 `packages/server/src/network/world-gateway-gm-suggestion.helper.ts`
- `GmMarkSuggestionCompleted / GmRemoveSuggestion` 已从 gateway 主文件移出
- 新增 `packages/server/src/network/world-gateway-movement.helper.ts`
- `handleNextMoveTo / handleMove / handleNextNavigateQuest` 已从 gateway 主文件移出
- 新增 `packages/server/src/network/world-gateway-suggestion.helper.ts`
- `handleNextRequestSuggestions / handleNextCreateSuggestion / handleNextVoteSuggestion / handleNextReplySuggestion / handleNextMarkSuggestionRepliesRead` 已从 gateway 主文件移出
- 新增 `packages/server/src/network/world-gateway-inventory.helper.ts`
- `handleNextDestroyItem / handleNextSortInventory / handleNextUseItem / handleNextDropItem / handleTakeGround / handleNextEquip / handleNextUnequip` 已从 gateway 主文件移出
- 新增 `packages/server/src/network/world-gateway-mail.helper.ts`
- `handleNextRequestMailSummary / handleNextRequestMailPage / handleNextRequestMailDetail / handleNextMarkMailRead / handleNextClaimMailAttachments / handleNextDeleteMail` 已从 gateway 主文件移出
- 新增 `packages/server/src/network/world-gateway-npc.helper.ts`
- `handleNextRequestNpcShop / handleRequestNpcQuests / handleAcceptNpcQuest / handleSubmitNpcQuest / handleNextBuyNpcShopItem` 已从 gateway 主文件移出
- 新增 `packages/server/src/network/world-gateway-craft.helper.ts`
- `handleNextRequestAlchemyPanel / handleNextRequestEnhancementPanel / handleNextStartAlchemy / handleNextCancelAlchemy / handleNextSaveAlchemyPreset / handleNextDeleteAlchemyPreset / handleNextStartEnhancement / handleNextCancelEnhancement` 已从 gateway 主文件移出
- 新增 `packages/server/src/network/world-gateway-market.helper.ts`
- `handleNextRequestMarket / handleNextRequestMarketListings / handleNextRequestMarketItemBook / handleNextRequestMarketTradeHistory / handleNextCreateMarketSellOrder / handleNextCreateMarketBuyOrder / handleNextBuyMarketItem / handleNextSellMarketItem / handleNextCancelMarketOrder / handleNextClaimMarketStorage` 已从 gateway 主文件移出
- 新增 `packages/server/src/network/world-gateway-player-controls.helper.ts`
- `handleNextChat / handleNextAckSystemMessages / handleNextDebugResetSpawn / handleNextUpdateAutoBattleSkills / handleNextUpdateAutoUsePills / handleNextUpdateCombatTargetingRules / handleNextUpdateAutoBattleTargetingMode / handleNextUpdateTechniqueSkillAvailability / handleNextHeavenGateAction / handleRequestQuests` 已从 gateway 主文件移出

本轮继续完成：

- 新增 `packages/server/src/network/world-gateway-read-model.helper.ts`
- `handleNextRequestAttrDetail / handleNextRequestLeaderboard / handleNextRequestWorldSummary / handleRequestDetail / handleRequestTileDetail` 已从 gateway 主文件移出
- AttrDetail / Leaderboard / WorldSummary / Detail / TileDetail 的构造与 next-only 发包行为保持不变

本轮继续完成：

- 新增 `packages/server/src/network/world-gateway-action.helper.ts`
- `handleNextRedeemCodes / handleUsePortal / handleNextCultivate / handleCastSkill / handleUseAction / handleProtocolAction / resolveActionId / emitProtocolActionResult` 已从 gateway 主文件移入 action helper
- `redeemCodes / portal / cultivate / castSkill / useAction` 的 gateway error code、runtime enqueue、loot:open / battle / npc action / body_training 分发语义保持不变

本轮继续完成：

- 新增 `packages/server/src/network/world-gateway-attr-detail.helper.ts`
- `world-gateway-read-model.helper.ts` 里的 `AttrDetail` bonus / numeric breakdown 计算已从 read-model helper 主文件移出，`handleNextRequestAttrDetail()` 现在只保留 socket 入参校验、player 查找、protocol mark 和 emit
- 这次不改 `AttrDetail` 协议字段，也不改 `numericStatBreakdowns` 的 shared 合同语义；只把大段属性详情派生计算从 socket read-model helper 里抽出来
- 新增 `packages/server/src/network/world-gateway-client-emit.helper.ts`
- `world.gateway.ts` 里的 `emitNextQuests / emitNextSuggestionUpdate / emitNextMail* / emitNextMarket* / emitNextNpcShop / flushMarketResult / broadcastSuggestions` 现已统一退为 facade，由 `WorldGatewayClientEmitHelper` 承接 `markProtocol('next')`、单播发包和市场/建议广播边界
- 这次不改任何 socket 事件名、payload shape 或广播范围，只把 gateway 里残留的统一发包 glue 抽成独立 helper；`world.gateway.ts` 仍保留 `@SubscribeMessage` 装饰入口、`require*` 守卫和 helper 路由
- 新增 `packages/server/src/tools/world-gateway-attr-detail-helper-smoke.js` 与 `packages/server/src/tools/world-gateway-client-emit-helper-smoke.js`
- 本轮验证已补跑 `pnpm --filter @mud/server-next compile`、`node dist/tools/world-gateway-attr-detail-helper-smoke.js`、`node dist/tools/world-gateway-client-emit-helper-smoke.js` 与 `node dist/tools/smoke-suite.js --case session --case runtime`；结果通过，说明 gateway 的 attr-detail 读模型抽离与 next emit glue 抽离未打破 session/bootstrap 与 runtime 主链
- 本轮继续把 gateway 的残余守卫与会话侧状态 owner 再收两层：新增 `packages/server/src/network/world-gateway-guard.helper.ts` 承接 `rejectWhenNotReady()`、`requirePlayerId()`、`requireGm()`，新增 `packages/server/src/network/world-gateway-session-state.helper.ts` 承接 `marketSubscriberPlayerIds`、`marketListingRequestsByPlayerId`、`marketTradeHistoryRequestsByPlayerId` 与 disconnect 后的 market/session cleanup；`world.gateway.ts` 自身不再保留这几组 raw state
- 同时各个 `world-gateway-*.helper.js` 已改为直接依赖 `gatewayGuardHelper` / `gatewayClientEmitHelper`，`world.gateway.ts` 里原先那批 `require* / emitNext* / flushMarketResult / broadcastSuggestions` facade 已删除；主文件继续收窄到以 `@SubscribeMessage` 入口、helper 路由和少量 heartbeat/ping glue 为主
- 新增 `packages/server/src/tools/world-gateway-guard-helper-smoke.js` 与 `packages/server/src/tools/world-gateway-session-state-helper-smoke.js`
- 本轮验证已补跑 `pnpm --filter @mud/server-next compile`、`pnpm --filter @mud/server-next smoke:world-gateway-guard-helper`、`pnpm --filter @mud/server-next smoke:world-gateway-session-state-helper`、`pnpm --filter @mud/server-next smoke:world-gateway-client-emit-helper` 与 `node packages/server/dist/tools/smoke-suite.js --case session --case runtime`；结果通过，说明 gateway guard/session-state seam 收口未打破 session/bootstrap 与 runtime 主链
- 新增 `packages/server/src/network/world-sync-aux-state.service.ts`
- `WorldSyncService` 的 `nextAuxStateByPlayerId`、`emitNextInitialSync()`、`emitNextDeltaSync()` 以及 bootstrap / map-static / realm / loot-window / threat 的附加同步编排现已下沉到 `WorldSyncAuxStateService`；主服务只再保留主 envelope、combat effects、quest/notices 触发与 `buildPlayerSyncState()` 等剩余同步骨架
- 这次不改 `world-sync-protocol.service.ts` 的协议边界，不改 `world-projector.service.ts` 的主 envelope 组装，也不扩散到 auth/bootstrap 语义；只把首包/增量附加状态的 aux cache owner 和编排细节从 `world-sync.service.ts` 中真正抽离
- 新增 `packages/server/src/tools/world-sync-aux-state-smoke.js` 与 `pnpm --filter @mud/server-next smoke:world-sync-aux-state`
- 本轮验证已补跑 `pnpm --filter @mud/server-next compile`、`pnpm --filter @mud/server-next smoke:world-sync-aux-state` 与 `node dist/tools/smoke-suite.js --case session --case runtime`；结果通过，说明 sync aux-state seam 抽离未打破会话/同步主链
- 新增 `packages/server/src/network/world-sync-envelope.service.ts`
- 新增 `packages/server/src/network/world-sync-player-state.service.ts`
- `world-sync.service.ts` 现已继续把主 envelope 与 self bootstrap state 收成独立边界：`WorldSyncEnvelopeService` 接管 `createInitialEnvelope()` / `createDeltaEnvelope()`、combat effects 附加、movement debug log 与 projector cache clear；`WorldSyncPlayerStateService` 接管 bootstrap self state 的组装、bonus 投影、equipment/action/realm 只读转换，`WorldSyncAuxStateService` 也不再通过 callback 反调主服务取 player sync state
- `world-sync.service.ts` 不再保留这两组 dead wrapper 与底部残留 helper，本轮之后主文件只剩主循环、quest/notices 触发、socket 发送委托和 cache 清理骨架；体积已从上一轮的 `1508` 行继续压到 `309` 行
- 新增 `packages/server/src/tools/world-sync-envelope-smoke.js` 与 `packages/server/src/tools/world-sync-player-state-smoke.js`
- 本轮验证已补跑 `pnpm --filter @mud/server-next compile`、`pnpm --filter @mud/server-next smoke:world-sync-envelope`、`pnpm --filter @mud/server-next smoke:world-sync-player-state`、`pnpm --filter @mud/server-next smoke:world-sync-aux-state` 与 `node dist/tools/smoke-suite.js --case session --case runtime`；结果通过，说明 envelope/player-state/aux-state 三层同步边界收口未打破会话/同步主链
- 本轮继续把 `world-runtime.service.ts` 的 lifecycle 骨架独立成 owner：新增 `packages/server/src/runtime/world/world-runtime-lifecycle.service.js`，承接 `bootstrapPublicInstances()`、`restorePublicInstancePersistence()` 与 `rebuildPersistentRuntimeAfterRestore()`；`world-runtime.service.ts` 现在只再保留对 lifecycle seam 的薄委托，不再直接混放公共实例 bootstrap、地图持久化恢复和整体验证前 reset/rebuild 细节
- 这次不改 `createInstance()` / `getOrCreatePublicInstance()` 的实例 owner，不改 `world-runtime-instance-state.service.js` 的 registry 所有权，也不动 tick 顺序与主编排；只把“运行时生命周期管理”从主服务里抽出来
- 新增 `packages/server/src/tools/world-runtime-lifecycle-smoke.js`
- 本轮验证已补跑 `pnpm --filter @mud/server-next compile`、`pnpm --filter @mud/server-next smoke:world-runtime-lifecycle` 与 `pnpm --filter @mud/server-next smoke:runtime`；结果通过，说明 lifecycle seam 收口未打破 runtime 主链
- 本轮继续把 `world-runtime-system-command.service.ts` 里还混着的 GM 分发单独抽成 owner：新增 `packages/server/src/runtime/world/world-runtime-gm-system-command.service.ts`，承接 `gmUpdatePlayer / gmResetPlayer / gmSpawnBots / gmRemoveBots` 的 deps 收口与分发；`world-runtime-system-command.service.ts` 现在只再保留 monster/player system-command 路由和对 GM system-command seam 的单点委托，不再自己拼那两段 GM deps object
- 这次不改 `WorldRuntimeGmQueueService` 的 enqueue owner，不改 `WorldRuntimePlayerCombatOutcomeService` 的 respawn 语义，也不改 system-command queue drain 顺序；只把 system-command 中的 GM write-path 分发从混合路由里抽出来
- 新增 `packages/server/src/tools/world-runtime-gm-system-command-smoke.js`
- 新增 `packages/server/src/tools/world-runtime-system-command-smoke.js`
- 本轮验证已补跑 `pnpm --filter @mud/server-next compile`、`pnpm --filter @mud/server-next smoke:world-runtime-gm-system-command`、`pnpm --filter @mud/server-next smoke:world-runtime-system-command` 与 `pnpm --filter @mud/server-next smoke:runtime`；结果通过，说明 GM system-command seam 收口未打破 runtime 主链
- 本轮继续把 `world-runtime.service.ts` 里仍混放的“世界级持久化快照 + frame/tick 外壳”拆成两个 owner：新增 `packages/server/src/runtime/world/world-runtime-persistence-state.service.ts` 承接 `listDirtyPersistentInstances()`、`buildMapPersistenceSnapshot()` 与 `markMapPersisted()`；新增 `packages/server/src/runtime/world/world-runtime-frame.service.ts` 承接 `tickAll()`、`advanceFrame()` 与 `recordSyncFlushDuration()`，主服务现在只再保留对这两组 seam 的薄委托
- 这次不改 `MapPersistenceFlushService` 的刷盘策略，不改 `WorldRuntimeInstanceTickOrchestrationService` 的实例 tick 顺序，也不改 `WorldRuntimeSummaryQueryService` 的 summary payload shape；只把主服务中仍然混杂的世界级 persistence/frame glue 抽出来
- 新增 `packages/server/src/tools/world-runtime-persistence-state-smoke.js`
- 新增 `packages/server/src/tools/world-runtime-frame-smoke.js`
- 本轮验证已补跑 `pnpm --filter @mud/server-next compile`、`pnpm --filter @mud/server-next smoke:world-runtime-persistence-state`、`pnpm --filter @mud/server-next smoke:world-runtime-frame` 与 `pnpm --filter @mud/server-next smoke:runtime`；结果通过，说明 persistence-state/frame seam 收口未打破 runtime 主链
- 本轮继续把 `world-runtime.service.ts` 里剩余的世界级 access/query/utility seam 独立成 owner：新增 `packages/server/src/runtime/world/world-runtime-world-access.service.ts`，承接 `resolveCurrentTickForPlayerId()`、`getRuntimeSummary()`、`getOrCreatePublicInstance()`、`resolveDefaultRespawnMapId()`、`findMapRoute()`、`getPlayerLocationOrThrow()`、`getInstanceRuntimeOrThrow()`、`cancelPendingInstanceCommand()`、`interruptManualNavigation()`、`interruptManualCombat()` 与 `getPlayerViewOrThrow()`；主服务现在只再保留对这组 world-access seam 的薄委托
- 本轮继续把玩家 attach/detach/runtime removal seam 从主服务里抽出：新增 `packages/server/src/runtime/world/world-runtime-player-session.service.ts`，承接 `connectPlayer()`、`disconnectPlayer()` 与 `removePlayer()`，并通过 `WorldRuntimeWorldAccessService` 收口玩家视图与实例存在性依赖；`world-runtime.service.ts` 不再直接混放玩家接入、断开与运行时移除细节
- 这次不改 `WorldSessionBootstrapService` 的登录编排，不改 `WorldPlayerSnapshotService` 的快照恢复语义，也不扩散到 `world.gateway.ts` 的连接入口；只把 `world-runtime` 内部剩余的 player-session / world-access glue 真正抽离
- 新增 `packages/server/src/tools/world-runtime-world-access-smoke.js`
- 新增 `packages/server/src/tools/world-runtime-player-session-smoke.js`
- 本轮验证已补跑 `pnpm --filter @mud/server-next compile`、`pnpm --filter @mud/server-next smoke:world-runtime-world-access`、`pnpm --filter @mud/server-next smoke:world-runtime-player-session` 与 `pnpm --filter @mud/server-next smoke:runtime`；结果通过，说明 world-access/player-session seam 收口未打破 runtime 主链
- 本轮继续把 `world-runtime.service.ts` 里剩余的高层读侧 facade 收成独立 owner：新增 `packages/server/src/runtime/world/world-runtime-read-facade.service.ts`，承接 `buildNpcShopView()`、`buildQuestListView()`、`buildNpcQuestsView()`、`buildDetail()`、`buildTileDetail()`、`buildLootWindowSyncState()`、`refreshPlayerContextActions()`、`createNpcQuestsEnvelope()` 以及 quest/shop/context 的只读 facade；主服务不再直接混放这些 envelope 级 read/query 校验与拼装
- 本轮继续把 `world-runtime.service.ts` 里剩余的世界级 tick/dispatch facade 收成独立 owner：新增 `packages/server/src/runtime/world/world-runtime-tick-dispatch.service.ts`，承接 `getLegacyNavigationPath()`、navigation/auto-combat materialize 与 resolve、`dispatchPendingCommands()`、`dispatchPendingSystemCommands()`、`dispatchInstanceCommand()`、`dispatchPlayerCommand()`、`dispatchSystemCommand()`、monster action apply、combat effect push、`queuePlayerNotice()` 与 `ensureAttackAllowed()`；主服务不再直接混放这组 tick/dispatch glue
- 这次不改 `WorldRuntimeNavigationService`、`WorldRuntimeAutoCombatService`、`WorldRuntimeMonsterActionApplyService` 或 `WorldRuntimeQuestQueryService` 的叶子语义，也不改 tick 顺序；只把主服务里剩余的高层读侧 facade 与世界级 tick/dispatch facade 真正抽离
- 新增 `packages/server/src/tools/world-runtime-read-facade-smoke.js`
- 新增 `packages/server/src/tools/world-runtime-tick-dispatch-smoke.js`
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-read-facade`、`pnpm --filter @mud/server-next smoke:world-runtime-tick-dispatch` 与 `pnpm --filter @mud/server-next smoke:runtime`；结果通过，说明 read-facade/tick-dispatch seam 收口未打破 runtime 主链
- 本轮继续把 `world-runtime.service.ts` 里剩余的高层写侧 gameplay facade 收成独立 owner：新增 `packages/server/src/runtime/world/world-runtime-gameplay-write-facade.service.ts`，承接 combat-command、item-ground、progression、alchemy、enhancement、NPC quest write、monster-system-command 与 player-combat-outcome 上方那层 `dispatch* / handle* / processPendingRespawns()` facade；主服务不再直接混放这组跨子域写侧 glue
- 本轮继续把 quest state 与 NPC access 的运行时 facade 收成独立 owner：新增 `packages/server/src/runtime/world/world-runtime-quest-runtime-facade.service.ts`，承接 `resolveAdjacentNpc()`、`refreshQuestStates()`、`tryAcceptNextQuest()`、`advanceKillQuestProgress()`、`advanceLearnTechniqueQuest()`、`canReceiveRewardItems()` 与 `getNpcForPlayerMap()`；主服务不再直接混放这组 quest/NPC runtime glue
- 这次不改 `WorldRuntimeCombatCommandService`、`WorldRuntimeNpcQuestWriteService`、`WorldRuntimeQuestStateService`、`WorldRuntimeNpcAccessService` 或 `WorldRuntimePlayerCombatOutcomeService` 的叶子语义，也不改 quest 进度规则与 respawn 语义；只把主服务里剩余的 gameplay-write/quest-runtime facade 真正抽离
- 新增 `packages/server/src/tools/world-runtime-gameplay-write-facade-smoke.js`
- 新增 `packages/server/src/tools/world-runtime-quest-runtime-facade-smoke.js`
- 本轮验证已补跑 `pnpm --filter @mud/server-next compile`、`pnpm --filter @mud/server-next smoke:world-runtime-gameplay-write-facade`、`pnpm --filter @mud/server-next smoke:world-runtime-quest-runtime-facade` 与 `pnpm --filter @mud/server-next smoke:runtime`；结果通过，说明 gameplay-write/quest-runtime seam 收口未打破 runtime 主链
- 本轮继续把 `world-runtime.service.ts` 里剩余的 state/registry 薄访问层收成独立 owner：新增 `packages/server/src/runtime/world/world-runtime-state-facade.service.ts`，承接 `pendingCommands`、`playerLocations`、`instance registry` 的 facade，以及 persistence/frame/lifecycle 的薄委托；主服务不再直接混放这组 state/registry accessor glue
- 本轮继续把地图模板、实例和 tile/combat 只读 facade 收成独立 owner：新增 `packages/server/src/runtime/world/world-runtime-instance-read-facade.service.ts`，承接 `listMapTemplates()`、`listInstances()`、`getInstance()`、`listInstanceMonsters()`、`getInstanceMonster()`、`getInstanceTileState()`、`getCombatEffects()` 与 `createInstance()`；主服务不再直接混放实例只读 facade 和实例创建薄壳
- 这次不改 `WorldRuntimeInstanceStateService`、`WorldRuntimeInstanceQueryService`、`WorldRuntimePersistenceStateService`、`WorldRuntimeFrameService` 或 `WorldRuntimeLifecycleService` 的叶子语义，也不改实例 tick 顺序和实例数据结构；只把主服务里剩余的 state/instance-read facade 真正抽离
- 新增 `packages/server/src/tools/world-runtime-state-facade-smoke.js`
- 新增 `packages/server/src/tools/world-runtime-instance-read-facade-smoke.js`
- 本轮验证已补跑 `pnpm --filter @mud/server-next compile`、`pnpm --filter @mud/server-next smoke:world-runtime-state-facade`、`pnpm --filter @mud/server-next smoke:world-runtime-instance-read-facade` 与 `pnpm --filter @mud/server-next smoke:runtime`；结果通过，说明 state/instance-read seam 收口未打破 runtime 主链
- 本轮继续把 `world-runtime.service.ts` 里剩余的命令入口 facade 收成独立 owner：新增 `packages/server/src/runtime/world/world-runtime-command-intake-facade.service.ts`，承接 navigation enqueue、action execution、player-command enqueue、NPC quest/shop enqueue 与 system-command enqueue 这一整簇入口 facade；主服务不再直接混放这批 command-intake thin wrapper
- 这次不改 `WorldRuntimeNavigationService`、`WorldRuntimeActionExecutionService`、`WorldRuntimePlayerCommandEnqueueService`、`WorldRuntimeNpcQuestWriteService` 或 `WorldRuntimeSystemCommandEnqueueService` 的叶子语义，也不改 tick 内 dispatch 顺序；只把主服务里剩余的输入入口 facade 真正抽离
- 新增 `packages/server/src/tools/world-runtime-command-intake-facade-smoke.js`
- 本轮验证已补跑 `pnpm --filter @mud/server-next compile`、`pnpm --filter @mud/server-next smoke:world-runtime-command-intake-facade` 与 `pnpm --filter @mud/server-next smoke:runtime`；结果通过，说明 command-intake seam 收口未打破 runtime 主链

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next smoke:session`
- `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`
- `pnpm --filter @mud/server-next smoke:runtime`
- `pnpm --filter @mud/server-next smoke:loot`
- `pnpm --filter @mud/server-next audit:next-protocol`

### 第 2 批：收口登录到进入世界的单路径

- [x] 以 `world-session-bootstrap.service.js` 为中心，把 `gateway -> auth -> snapshot -> session binding -> init sync` 串成唯一主链
- [x] 明确 `world-player-auth.service.ts` 只负责：
  - token -> identity
  - persistedSource 归一
  - migration identity 收口
- [x] 明确 `world-player-snapshot.service.js` 只负责：
  - next snapshot load
  - migration snapshot 补种
  - next-only miss contract
- [x] 把 session reuse / detached resume 策略固定在 `world-session-bootstrap.service.js`
- [x] 避免 bootstrap 期间再从其它 service 临时兜底身份或快照

删除目标不是“现在就删 migration”，而是让主链只有一个编排入口。

当前已完成的首刀：

- `world-player-auth.service.ts` 不再在 `authenticatePlayerToken()` 里前置执行 `token_seed` starter snapshot 准入
- `token_seed` 身份在持久化成功后直接从 auth 返回，由 `world-session-bootstrap.service.js -> loadAuthenticatedPlayerSnapshot()` 接管缺快照时的恢复/阻断
- `next-auth-bootstrap-smoke.js` 已同步把这条责任边界改成“bootstrap/snapshot 阶段负责 snapshot readiness”

本轮继续完成：

- `world-player-auth.service.ts` 不再对已加载的 next 身份执行 `nextProtocolStrict` 二次拦截
- `world-session-bootstrap.service.js -> resolveAuthenticatedBootstrapContractViolation()` 成为 next 主链准入的唯一合同裁判

本轮继续完成：

- `world-session-bootstrap.service.js` 现在自持 `token_seed -> native` 的 required normalization；一旦 bootstrap 已选择 native 快照，归一失败会直接阻断会话成功
- `world-player-auth.service.ts` 不再暴露 `promoteTokenSeedIdentityToNative()` 一类 bootstrap 回调职责
- `next-auth-bootstrap-smoke.js` 已同步验证“auth 返回 token/token_seed，bootstrap 在快照成功后提升为 next/native”的新边界
- 已进一步收紧：`token/token_seed` 仍可进入 bootstrap，但在 bootstrap 自持提升完成前不再享有 detached-session implicit reuse、requested session reuse 或 connected-session reuse；运行时 session reuse 仅保留给 `next/native`
- 本轮继续收紧：next 协议下，已加载 `legacy_backfill / legacy_sync` 身份会在 `world-player-auth.service.ts` 的 auth 边界直接被拒绝，不再进入 `world-session-bootstrap.service.js` 的 bootstrap 合同裁判；`token_seed -> native` 的 snapshot recovery / required normalization 已由 bootstrap/snapshot 单路径承接，不再决定后续 `world-runtime` batch-5 ownership seam 的执行顺序。

当前结论：

- 登录到进入世界的主链编排已收束到 `world-session-bootstrap.service.js`
- `world-player-auth.service.ts` 与 `world-player-snapshot.service.js` 的职责边界已按本批目标收口
- 下一阶段重心切到 batch 3：把同步与投影拆成三层

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`
- `pnpm --filter @mud/server-next smoke:session`
- `pnpm --filter @mud/server-next smoke:player-recovery`

### 第 3 批：把同步与投影拆成三层

- [x] 把 `world-sync.service.ts` 收成“同步编排层”
- [x] 把 `world-projector.service.ts` 收成“投影 / diff / patch 构建层”
- [x] 把 `world-sync-protocol.service.ts` 固定为“协议发送层”
- [x] 明确区分：
  - 首包静态/低频静态
  - 动态 world/self/panel delta
  - 详情/按需查询
  - 附加同步（quest / loot / threat / minimap）
- [x] 避免 `sync` 继续同时承担：
  - capture/diff
  - 状态缓存
  - 发包
  - 各类附加数据组装

优先先拆的冷路径：

- quest sync
- loot window sync
- threat arrow sync
- minimap marker patch

本轮已完成：

- 新增 `packages/server/src/network/world-sync-quest-loot.service.ts`
- `world-sync.service.ts` 不再自持 `lastQuestRevisionByPlayerId` / `lootWindowByPlayerId`，quest revision 检查与 loot window build/open/cleanup 已委托给 `WorldSyncQuestLootService`
- `world-client-event.service.js` 的 `emitLootWindowUpdate()` 已改为直接复用 `WorldSyncQuestLootService`
- `app.module.ts` 已完成 batch 3 首刀 provider 接线，`world-sync.service.ts` 继续保留 world/self/panel delta、threat、minimap 等主编排与热路径
- 为恢复 batch 3 验证链，补齐了 `world-gateway-read-model.helper.ts` 的 `AttrDetail.numericStatBreakdowns` 结构，使其重新符合 shared 协议约定
- 新增 `packages/server/src/network/world-sync-threat.service.ts`
- `world-sync.service.ts` 的 threat arrow build / diff / emit 冷路径已委托给 `WorldSyncThreatService`，`nextAuxStateByPlayerId.threatArrows` 仍暂留在 sync 编排层，避免第二刀同时扩大到 minimap cache 边界
- 本轮验证已补跑 `smoke:runtime`、`smoke:monster-ai`、`audit:next-protocol`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/network/world-sync-minimap.service.ts`
- `world-sync.service.ts` 的 minimap marker cache / build / visible filter / diff 冷路径已委托给 `WorldSyncMinimapService`，`nextAuxStateByPlayerId.visibleMinimapMarkers` 仍暂留在 sync 编排层，继续由 mapChanged / MapStatic 编排统一控制
- 本轮验证已补跑 `smoke:runtime`、`smoke:progression`、`audit:next-protocol`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- `world-sync-protocol.service.ts` 已接管主 envelope（`InitSession / MapEnter / WorldDelta / SelfDelta / PanelDelta`）与 `Bootstrap` 下发，`world-sync.service.ts` 对这组发包只再保留薄委托
- `packages/server/src/tools/next-protocol-audit.js` 与 `packages/shared/scripts/check-network-protobuf-contract.cjs` 已同步扩展 protocol 静态发包面审计；当前仍保留 `threat` 作为独立 `WorldDelta` 附加同步，不把它误写成 protocol 唯一出口
- 新增 `packages/server/src/network/world-sync-map-snapshot.service.ts`
- `world-sync.service.ts` 的 visible tiles / visible tile keys / render entities / minimap library / game time 构造已委托给 `WorldSyncMapSnapshotService`
- 新增 `packages/server/src/network/world-sync-map-static-aux.service.ts`
- `world-sync.service.ts` 不再自持 player 级 `visibleTiles` / `visibleMinimapMarkers` aux cache 与 `diffVisibleTiles()` patch 规划；这部分已收进 `WorldSyncMapStaticAuxService`
- 本轮验证已补跑 `smoke:next-auth-bootstrap`、`smoke:runtime`、`audit:next-protocol`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 第 3 批到此收口，下一步切到第 4 批：优先从 `world-runtime.service.ts` 的只读查询 / 详情块下手

优先保留原状的热路径：

- world/self/panel delta 主 envelope 结构

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next smoke:runtime`
- `pnpm --filter @mud/server-next smoke:progression`
- `pnpm --filter @mud/server-next audit:next-protocol`

### 第 4 批：先从 `world-runtime` 里拆冷路径和查询块

- [x] 从 `world-runtime.service.ts` 先拆不直接写 tick 热状态的查询/详情块
- [x] 先拆 NPC / quest 查询、shop 校验、导航目标、面板详情、GM 只读辅助查询
- [x] 把纯构建/归一/查询 helper 挪成显式 query/domain 模块
- [x] 保持 `world-runtime.service.ts` 暂时仍作为总编排层，但减掉查询杂质

本轮已完成：

- 新增 `packages/server/src/runtime/world/world-runtime-npc-shop-query.service.js`
- `world-runtime.service.ts` 的 NPC shop 只读封装、货币名称解析与购买前校验已委托给 `WorldRuntimeNpcShopQueryService`
- `world-runtime.service.ts` 仍保留 `resolveAdjacentNpc()`、`buildNpcShopView()` facade、`enqueueBuyNpcShopItem()` 与 `dispatchBuyNpcShopItem()` 的写路径编排，避免第 4 批第一刀越界到 batch 5 的状态域拆分
- 本轮验证已补跑 `audit:next-protocol`、`smoke:progression`、`smoke:redeem-code`、`smoke:gm-next`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/world/world-runtime-quest-query.service.js`
- `world-runtime.service.ts` 的 NPC quest envelope、任务模板展开、reward 构造、progress/ready 判定与导航目标解析已委托给 `WorldRuntimeQuestQueryService`
- `world-runtime.service.ts` 仍保留 `resolveAdjacentNpc()`、`buildNpcQuestsView()` facade、`refreshQuestStates()`、`dispatchAcceptNpcQuest()`、`dispatchSubmitNpcQuest()` 与 `tryAcceptNextQuest()` 的写路径编排，避免第 4 批第二刀越界到 batch 5 的状态域拆分
- 本轮验证已补跑 `audit:next-protocol`、`smoke:progression`、`smoke:redeem-code`、`smoke:gm-next`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/world/world-runtime-npc-quest-interaction-query.service.js`
- `world-runtime.service.ts` 的 NPC quest marker 解析与 `npc_quests:*` 上下文动作构造已委托给 `WorldRuntimeNpcQuestInteractionQueryService`
- `world-runtime.service.ts` 仍保留 `buildNpcQuestsView()` facade、`executeLegacyNpcAction()`、`dispatchNpcInteraction()` 与任务接取/提交写路径，避免第 4 批第三刀越界到 batch 5 的状态域拆分
- 本轮验证已补跑 `smoke:progression`、`smoke:redeem-code`、`smoke:gm-next`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/craft/craft-panel-alchemy-query.service.ts`
- 新增 `packages/server/src/runtime/craft/craft-panel-alchemy-query.helpers.ts`
- `CraftPanelRuntimeService` 的炼丹面板只读 payload/state 构造已委托给 `CraftPanelAlchemyQueryService`，目录版本与 clone helper 已收进共享 helper；炼丹/强化的写路径与 tick 逻辑仍保留在 `CraftPanelRuntimeService`
- 本轮验证已补跑 `audit:next-protocol`、`smoke:progression`、`smoke:redeem-code`、`smoke:gm-next`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/craft/craft-panel-enhancement-query.service.ts`
- `CraftPanelRuntimeService` 的强化面板只读 payload/state/candidates/protection 展示构造已委托给 `CraftPanelEnhancementQueryService`
- 强化写路径、资源消耗、保护物校验与 tick 推进仍保留在 `CraftPanelRuntimeService`，避免第 4 批这一刀越界到 batch 5 的状态域拆分
- 本轮验证已补跑 `audit:next-protocol`、`smoke:progression`、`smoke:redeem-code`、`smoke:gm-next`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/world/world-runtime-detail-query.service.js`
- `world-runtime.service.ts` 的 `buildDetail()` / `buildTileDetail()` 只保留 guard 与 context 组装，详情目标解析、tile detail 聚合、可见性判断与只读 payload 构造已委托给 `WorldRuntimeDetailQueryService`
- `world-runtime.service.ts` 仍保留 `normalizeCoordinate()`、`getPlayerLocationOrThrow()`、`getPlayerViewOrThrow()`、`getInstanceRuntimeOrThrow()` 等总编排 facade，不把第 4 批扩散到 tick 写状态或调用端改线
- 本轮验证已补跑 `pnpm --filter @mud/server-next audit:next-protocol`、根级 `pnpm build` 与 `pnpm verify:replace-ready`，其中 `audit:next-protocol` 实际覆盖了 `RequestDetail` / `RequestTileDetail` 主链
- 新增 `packages/server/src/runtime/world/world-runtime-summary-query.service.js`
- `world-runtime.service.ts` 的 `getRuntimeSummary()` 现已委托给 `WorldRuntimeSummaryQueryService`，仅保留实例列表与计数上下文采集；summary payload 与 tickPerf 汇总构造下沉为显式只读查询服务
- 这一刀没有改 `world-runtime.controller.js`、`runtime-gm-state.service.ts`、`next-gm-world.service.js` 的调用面，继续把 `world-runtime.service.ts` 保留为总编排 facade，避免把 batch 4 扩散到更宽的调用链整理
- 本轮验证已补跑 `pnpm --filter @mud/server-next audit:next-protocol`、根级 `pnpm build` 与 `pnpm verify:replace-ready`；结果继续通过，`audit:next-protocol` 在无库口径下完成整套 runtime bootstrap/protocol 检查并更新审计报告
- 新增 `packages/server/src/runtime/world/world-runtime-instance-query.service.js`
- `world-runtime.service.ts` 的 `listInstances()`、`getInstance()`、`listInstanceMonsters()`、`getInstanceMonster()`、`getInstanceTileState()` 已统一委托给 `WorldRuntimeInstanceQueryService`，只保留实例存在性校验和总编排 facade
- 这组实例只读查询仍保持原 controller / world-sync / GM 调用面不变，不把 batch 4 扩散到持久化快照、脏实例追踪或任何写状态流程
- 本轮验证已补跑 `pnpm --filter @mud/server-next audit:next-protocol`、根级 `pnpm build` 与 `pnpm verify:replace-ready`；结果继续通过，实例只读查询抽离未影响 runtime HTTP、GM 读取口径和 world-sync 审计链
- `packages/server/src/http/next/next-gm-player.service.js` 现已接管 `getPlayerDetail()` 及玩家详情聚合 helper，`NextGmWorldService` 不再承接玩家详情读链
- `packages/server/src/http/next/next-gm.controller.js` 的 `GET /api/gm/players/:playerId` 已改为转发到 `nextGmPlayerService.getPlayerDetail()`，不改路由面和返回结构
- 这一刀只移动 GM 玩家详情只读查询，不触碰 `getState()`、`buildPerformanceSnapshot()`、地图 runtime 观测和任何 GM 写路径
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:gm-next`、`pnpm --filter @mud/server-next audit:next-protocol`、根级 `pnpm build` 与 `pnpm verify:replace-ready`；结果继续通过，其中 `gm-next` 在无库本地口径下返回 `ok: true` 且标记 `skipped`
- 新增 `packages/server/src/http/next/next-gm-map-query.service.js`
- `packages/server/src/http/next/next-gm-world.service.js` 的 `getMaps()` 已委托给 `NextGmMapQueryService`，world service 仅保留 GM world facade，不再承接地图列表展示拼装
- 这一刀只移动 GM 地图列表只读查询，不触碰 `getMapRuntime()`、`getState()`、`buildPerformanceSnapshot()` 或任何 GM 写路径
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:gm-next`、`pnpm --filter @mud/server-next audit:next-protocol`、根级 `pnpm build` 与 `pnpm verify:replace-ready`；结果继续通过，其中 `gm-next` 在无库本地口径下返回 `ok: true` 且标记 `skipped`
- 新增 `packages/server/src/runtime/world/world-runtime-player-view-query.service.js`
- `world-runtime.service.ts` 的 `getPlayerView()` 与 NPC quest marker 装饰已委托给 `WorldRuntimePlayerViewQueryService`；`buildLootWindowSyncState()` 也已把只读 payload 拼装下沉过去，但主服务仍保留一个薄入口，先通过玩家存在/相邻可拿取等读侧 guard，再调用 `WorldRuntimeLootContainerService.prepareContainerLootSource()` 显式准备容器状态，最后交给 query service 读取
- `WorldRuntimeLootContainerService` 已把 loot window 容器来源边界拆成两段：`prepareContainerLootSource()` 负责 ensure/init/search-start 等状态准备，`getPreparedContainerLootSource()` 只负责读取已准备状态并组装容器来源，避免把容器写侧副作用继续混进 query service
- 这一刀只继续下沉 `player view / loot window` 冷路径查询，不触碰 `buildContextActions()`、tick 热状态、GM queue 或任何其它写路径编排，避免把 batch 4 扩散到 batch 5 的状态域拆分
- 本轮验证已补跑 `pnpm compile && node dist/tools/smoke-suite.js --case loot --case session` 与根级 `pnpm verify:replace-ready`；结果通过，说明 `player view / loot window` 的 prepare/read 边界调整未打破 loot、session/bootstrap 与 local replace-ready 主证明链
- 新增 `packages/server/src/runtime/world/world-runtime-context-action-query.service.js`
- 新增 `packages/server/src/tools/world-runtime-context-actions-smoke.js`
- `world-runtime.service.ts` 的 `buildContextActions()` 已委托给 `WorldRuntimeContextActionQueryService`，battle/portal/NPC talk、`npc_quests:*` 上下文动作、shop 入口、突破、alchemy/enhancement 入口与静态 toggle 的只读组装不再留在主服务里
- `world-runtime.service.ts` 仍保留 `refreshPlayerContextActions()` facade，只负责解析 `view` 并调用 `setContextActions(...)`，避免这一刀越界到 tick 写状态、NPC/quest/shop 写路径或 craft runtime 状态域拆分
- 本轮验证已补跑 `pnpm compile && node dist/tools/world-runtime-context-actions-smoke.js && node dist/tools/smoke-suite.js --case runtime` 与根级 `pnpm verify:replace-ready`；结果通过，说明 context-actions query 抽离未打破 runtime 主链与 local replace-ready 证明链
- 新增 `packages/server/src/tools/world-runtime-quest-list-view-smoke.js`
- `world-runtime.service.ts` 的 `buildQuestListView()` 现已改成薄 facade：仍保留 `getPlayerLocationOrThrow()` 与 `refreshQuestStates()` 前置，再把最终 `{ quests }` payload 组装委托给 `WorldRuntimeQuestQueryService.buildQuestListView()`
- `WorldRuntimeQuestQueryService` 本轮新增 quest list 只读拼装入口，但不接管 `refreshQuestStates()`、NPC quest envelope、accept/submit 等写路径边界，避免这一刀越界到 `WorldRuntimeQuestStateService` / NPC quest write 域
- 本轮验证已补跑 `pnpm compile && node packages/server/dist/tools/world-runtime-quest-list-view-smoke.js && node packages/server/dist/tools/smoke-suite.js --case progression` 与根级 `pnpm verify:replace-ready`；结果通过，说明 quest-list query 抽离未打破 progression/runtime 主证明链
- `WorldRuntimeNpcShopQueryService` 本轮新增 `buildNpcShopView(playerId, npcId, deps)`，把“相邻 NPC 解析后构建 shop envelope”的只读编排从主服务移出，继续复用 `createEnvelopeForNpc()` 组装商店 payload
- `world-runtime.service.ts` 的 `buildNpcShopView()` 现已改成薄 facade：仍保留 `getPlayerLocationOrThrow()` 与 `npcId` 归一/空值校验，再委托给 `WorldRuntimeNpcShopQueryService.buildNpcShopView()`；`resolveAdjacentNpc()` 的距离校验和 access ownership 仍留在 `WorldRuntimeNpcAccessService`
- 本轮扩充 `packages/server/src/tools/world-runtime-npc-shop-smoke.js`，补上 query-side `buildNpcShopView()` 与 world-runtime facade 的专项断言，不把这刀扩散到 buy path 或 NPC/quest/shop 写路径拆分
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-npc-shop` 与根级 `pnpm verify:replace-ready`；结果通过，说明 NPC shop view query 抽离未打破 NPC shop 读链与 local replace-ready 证明链
- `WorldRuntimeNpcShopQueryService` 本轮继续新增 `validateNpcShopPurchase(playerId, npcId, itemId, quantity, deps)`，把“相邻 NPC 解析后进入购买前校验”的只读编排从主服务移出，继续复用既有 `validatePurchaseForNpc()` 校验逻辑，不重写价格/背包/货币检查规则
- `world-runtime.service.ts` 的 `validateNpcShopPurchase()` 现已改成薄 facade：不再在主服务里手动解析相邻 NPC，而是直接委托给 `WorldRuntimeNpcShopQueryService.validateNpcShopPurchase()`；`resolveAdjacentNpc()` 的距离校验和 access ownership 仍留在 `WorldRuntimeNpcAccessService`
- 本轮继续扩充 `packages/server/src/tools/world-runtime-npc-shop-smoke.js`，补上 query-side `validateNpcShopPurchase()` 与 world-runtime facade 的专项断言，不把这刀扩散到 `enqueueBuyNpcShopItem()` / `dispatchBuyNpcShopItem()` 写路径或更宽的 NPC/shop 拆分
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-npc-shop` 与根级 `pnpm verify:replace-ready`；结果通过，说明 NPC shop purchase validation query 抽离未打破 NPC shop 校验链与 local replace-ready 证明链
- `WorldRuntimeQuestQueryService` 本轮新增 `buildNpcQuestsView(playerId, npcId, deps)`，把“相邻 NPC 解析后构建 NPC quest envelope”的 query tail 从主服务移出，继续复用既有 `createNpcQuestsEnvelope()` 组装逻辑
- `world-runtime.service.ts` 的 `buildNpcQuestsView()` 现已改成更薄 facade：仍保留 `getPlayerLocationOrThrow()`、`npcId` 归一/空值校验与 `refreshQuestStates()` 前置，再委托给 `WorldRuntimeQuestQueryService.buildNpcQuestsView()`；`refreshQuestStates()` 的归属继续留在 quest-state / write 域，不越界到 query service
- 本轮扩充 `packages/server/src/tools/world-runtime-quest-list-view-smoke.js`，补上 query-side `buildNpcQuestsView()` 与 world-runtime facade 的专项断言，并补跑 `packages/server/src/tools/world-runtime-npc-quest-write-smoke.js` 作为写链回归，不把这刀扩散到 NPC quest accept/submit/interact 写路径拆分
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-quest-list-view`、`pnpm --filter @mud/server-next smoke:world-runtime-npc-quest-write` 与根级 `pnpm verify:replace-ready`；结果通过，说明 NPC quest view query 抽离未打破 NPC quest 读链、写链回归与 local replace-ready 证明链
- 新增 `packages/server/src/http/next/next-gm-editor-query.service.js`
- `packages/server/src/http/next/next-gm-world.service.js` 的 `getEditorCatalog()` / `buildEditorBuffCatalog()` 已委托给 `NextGmEditorQueryService`，world service 继续只保留 GM world facade
- 这一刀只移动 GM editor 只读查询，不触碰 `getState()`、`getMapRuntime()`、`buildPerformanceSnapshot()` 或任何 GM 写路径
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:gm-next`、`pnpm --filter @mud/server-next audit:next-protocol`、根级 `pnpm build` 与 `pnpm verify:replace-ready`；结果继续通过，其中 `gm-next` 在无库本地口径下返回 `ok: true` 且标记 `skipped`
- 新增 `packages/server/src/http/next/next-gm-suggestion-query.service.js`
- `packages/server/src/http/next/next-gm-world.service.js` 的 `getSuggestions()` 已委托给 `NextGmSuggestionQueryService`，world service 只保留建议的写操作与 GM world facade
- 这一刀只移动 GM suggestion 列表只读查询，不触碰 `completeSuggestion()`、`replySuggestion()`、`removeSuggestion()` 或任何其它 GM 写路径
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:gm-next`、`pnpm --filter @mud/server-next audit:next-protocol`、根级 `pnpm build` 与 `pnpm verify:replace-ready`；结果继续通过，其中 `gm-next` 在无库本地口径下返回 `ok: true` 且标记 `skipped`
- 新增 `packages/server/src/http/next/next-gm-map-runtime-query.service.js`
- `packages/server/src/http/next/next-gm-world.service.js` 的 `getMapRuntime()` 已委托给 `NextGmMapRuntimeQueryService`，world service 只保留 observer 标记与 GM world facade
- 这一刀只移动 GM 地图窗口只读查询，不触碰 `updateMapTick()`、`updateMapTime()`、`reloadTickConfig()`、`getState()` 或任何 GM 写路径
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:gm-next`、`pnpm --filter @mud/server-next audit:next-protocol`、根级 `pnpm build` 与 `pnpm verify:replace-ready`；结果继续通过，其中 `gm-next` 在无库本地口径下返回 `ok: true` 且标记 `skipped`
- 新增 `packages/server/src/http/next/next-gm-state-query.service.js`
- `packages/server/src/http/next/next-gm-world.service.js` 的 `getState()` 已委托给 `NextGmStateQueryService`，在线/离线玩家摘要聚合、账号索引查询和 GM perf 组装不再留在 world service
- 这一刀只移动 GM state 只读聚合，不触碰 `resetNetworkPerf()`、`resetCpuPerf()`、`resetPathfindingPerf()`、地图控制写路径或任何其它 GM 写操作
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:gm-next`、`pnpm --filter @mud/server-next audit:next-protocol`、根级 `pnpm build` 与 `pnpm verify:replace-ready`；结果继续通过，其中 `gm-next` 在无库本地口径下返回 `ok: true` 且标记 `skipped`
- `packages/server/src/runtime/world/world-runtime-gm-queue.service.js` 现已真正持有 `pendingSystemCommands` 与 `pendingRespawnPlayerIds`，不再只是 GM enqueue/disptach helper
- `packages/server/src/runtime/world/world-runtime.state.js` 与 `packages/server/src/runtime/world/world-runtime.contract.js` 已同步移除这两个状态位，`WorldRuntimeService` 只保留 tick 顺序、系统命令派发壳与 `respawnPlayer()` 调度入口
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:runtime`、`pnpm --filter @mud/server-next smoke:player-respawn`、`pnpm --filter @mud/server-next smoke:gm-next`、根级 `pnpm build` 与 `pnpm verify:replace-ready`；其中 `pnpm build` 因并发清理 `packages/client/dist` 首次触发 Vite `ENOTEMPTY` 后已串行重跑通过，其余验证均直接通过

第 4 批结论：

- `world-runtime.service.ts` 与 `next-gm-world.service.js` 的主要冷路径查询已下沉到显式 query service
- 下一步应转入第 5 批的热路径状态域拆分，而不是继续在第 4 批里堆 facade 细拆

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next smoke:progression`
- `pnpm --filter @mud/server-next smoke:redeem-code`
- `pnpm --filter @mud/server-next smoke:gm-next`

### 第 5 批：再拆 `world-runtime` 热路径状态域

- [x] 把 `world-runtime.service.ts` 拆成明确状态域，而不是继续堆 helper
- [x] 至少已拆清这些域：
  - 地图实例 / tick 编排
  - 玩家移动 / 占位 / 导航意图
  - 战斗 / 技能 / 特效
  - 掉落 / loot / 地面容器
  - NPC / quest / shop 交互写路径
  - craft runtime（alchemy / enhancement）
  - GM runtime queue
- [x] 总编排层只保留：
  - tick 顺序
  - 跨域事务边界
  - 错误收口

本轮已完成：

- 新增 `packages/server/src/runtime/world/world-runtime-gm-queue.service.js`
- `WorldRuntimeService` 的 `enqueueGm*` 命令归一与 `gmUpdatePlayer / gmSpawnBots / gmRemoveBots` 派发细节已委托给 `WorldRuntimeGmQueueService`
- `WorldRuntimeService` 仍保留 `pendingSystemCommands` 队列所有权、tick 内 `dispatchPendingSystemCommands()`、`dispatchSystemCommand()` 分发与 `respawnPlayer()`，说明这次只是第 5 批第一刀的 helper 级提取，不是完整 GM runtime 子域拆分
- 本轮验证已补跑 `smoke:runtime`、`smoke:gm-next`、`smoke:player-respawn`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/world/world-runtime-player-command.service.js`
- `world-runtime.service.ts` 的 `dispatchPlayerCommand()` 路由与 dead-player gating 已委托给 `WorldRuntimePlayerCommandService`，命令 shape、所有 switch 分支与具体目标方法调用保持不变
- `world-runtime.service.ts` 仍保留 `dispatchPlayerCommand()` facade 与其余玩家写路径编排，说明这次只是把玩家命令路由单独收口，不是扩展到 quest-state 或其它状态域拆分
- 本轮验证已补跑 `smoke:runtime`、`smoke:redeem-code`、`smoke:gm-next`、根级 `pnpm build` 与 `pnpm verify:replace-ready`；结果继续通过，其中 `redeem-code` 与 `gm-next` 在无库本地口径下返回 `ok: true` 且标记 `skipped`
- 新增 `packages/server/src/runtime/world/world-runtime-quest-state.service.js`
- `world-runtime.service.ts` 的 `refreshQuestStates()` / `tryAcceptNextQuest()` / `advanceKillQuestProgress()` / `advanceLearnTechniqueQuest()` / `canReceiveRewardItems()` 已委托给 `WorldRuntimeQuestStateService`，quest-state 写侧 helper 不再留在主服务中
- `world-runtime.service.ts` 仍保留 NPC quest 写路径编排、quest query/read facade 与相邻运行时边界，说明这次只是把 quest-state helper 组单独收口，不是扩展到更大的 NPC/quest 域重构
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-quest-state`、`pnpm --filter @mud/server-next smoke:progression` 与根级 `pnpm build`；结果通过
- 额外复核：`pnpm --filter @mud/server-next smoke:combat` 单跑通过，说明 quest-state helper 抽离未破坏相邻 runtime 主链
- 当前仍有独立验证阻塞：`pnpm verify:replace-ready` 在多 case 连跑时会于后续 case 命中 `dist/main.js` 丢失并失败；现象与 quest-state 这一刀无直接对应关系，需单独排查 smoke/verify 链的构建产物时序问题
- 新增 `packages/server/src/runtime/world/world-runtime-craft.service.js`
- `WorldRuntimeService` 的 craft orchestration（中断、start/cancel/save/delete、tick 推进、面板推送、掉地兜底）已委托给 `WorldRuntimeCraftService`
- `CraftPanelRuntimeService` 仍保留炼丹/强化规则、job/preset/record 写入、resource consume 与 finalize/tick 细节，说明这次只是第 5 批第二刀的 orchestration 级提取，不是完整 craft runtime 子域拆分
- 本轮验证已补跑 `smoke:runtime`、`smoke:combat`、`smoke:loot`、`smoke:player-respawn`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/world/world-runtime-npc-quest-shop.service.js`
- `WorldRuntimeService` 的 NPC/shop/quest 写路径编排（enqueueBuyNpcShopItem / enqueueNpcInteraction / enqueueAcceptNpcQuest / enqueueSubmitNpcQuest / dispatchBuyNpcShopItem / dispatchNpcInteraction / dispatchAcceptNpcQuest / dispatchSubmitNpcQuest）已委托给 `WorldRuntimeNpcQuestShopService`
- `WorldRuntimeService` 仍保留 `pendingCommands` 队列所有权、`resolveAdjacentNpc()`、`refreshQuestStates()`、`tryAcceptNextQuest()` 与 query/service facade，说明这次只是第 5 批第三刀的 orchestration 级提取，不是完整 NPC/quest/shop runtime 子域拆分
- `executeAction()` / `executeLegacyNpcAction()` 也已统一走 `WorldRuntimeNpcQuestShopService`，消除了 `npc_quests:*` 的“先入队后校验”路径
- 本轮验证已补跑 `smoke:progression`、`smoke:runtime`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/world/world-runtime-loot-container.service.js`
- 容器运行态、翻找推进、持久化导出/回填、loot window 容器来源构造，以及容器 take/take-all 链路已委托给 `WorldRuntimeLootContainerService`
- `WorldRuntimeService` 仍保留 outer tick 顺序、ground pile 本体与 monster loot 生产，说明这次只是第 5 批第四刀的 loot/container 状态域提取，不是完整掉落域拆分
- 本轮验证已补跑 `smoke:loot`、`smoke:runtime`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/world/world-runtime-navigation.service.js`
- `navigationIntents` 与导航路径物化/跨图路由逻辑已委托给 `WorldRuntimeNavigationService`，`WorldRuntimeService` 仍保留 tick 顺序、`dispatchInstanceCommand()`、`applyTransfer()` 外壳和 combat 侧调度
- `packages/server/src/runtime/world/world-runtime.state.js` 与 `packages/server/src/runtime/world/world-runtime.contract.js` 已同步移除 `navigationIntents`，让该状态真正脱离 `WorldRuntimeService.runtimeState`
- 本轮验证已补跑 `compile`、`smoke:runtime`、`smoke:player-respawn`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/world/world-runtime-combat-effects.service.js`
- `latestCombatEffectsByInstanceId` 与 `pushActionLabelEffect / pushDamageFloatEffect / pushAttackEffect` 已委托给 `WorldRuntimeCombatEffectsService`
- `WorldRuntimeService` 仍保留 combat/monster 行为触发点和 sync facade `getCombatEffects()`，说明这次只是第 5 批第六刀的 combat-effects buffer 抽离，不是完整 combat 域拆分
- `packages/server/src/runtime/world/world-runtime.state.js` 与 `packages/server/src/runtime/world/world-runtime.contract.js` 已同步移除 `latestCombatEffectsByInstanceId`
- 本轮验证已补跑 `smoke:combat`、`smoke:monster-skill`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/world/world-runtime-monster-action-apply.service.js`
- `applyMonsterAction / applyMonsterBasicAttack / applyMonsterSkill` 已委托给 `WorldRuntimeMonsterActionApplyService`
- `WorldRuntimeService` 仍保留 `advanceFrame()` tick 顺序、`dispatchCastSkill*` 与玩家战斗派发，说明这次只是第 5 批第七刀的 monster-action apply 抽离，不是完整 combat/skill 域拆分
- 本轮验证已补跑 `smoke:monster-ai`、`smoke:monster-skill`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/world/world-runtime-basic-attack.service.js`
- `dispatchBasicAttack(...)` 已委托给 `WorldRuntimeBasicAttackService`，monster/player/tile 三个目标分支都收进该 service
- `WorldRuntimeService` 仍保留 `dispatchEngageBattle(...)`、`dispatchCastSkill*`、`handlePlayerMonsterKill()` 与 `handlePlayerDefeat()`，说明这次只是第 5 批第八刀的 basic-attack 抽离，不是完整 player combat 域拆分
- 本轮验证已补跑 `compile`、`smoke:runtime`、`smoke:combat`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/world/world-runtime-player-skill-dispatch.service.js`
- `dispatchCastSkill / resolveLegacySkillTargetRef / dispatchCastSkillToMonster / dispatchCastSkillToTile` 已委托给 `WorldRuntimePlayerSkillDispatchService`
- `WorldRuntimeService` 仍保留 `dispatchEngageBattle(...)`、auto-targeting、`handlePlayerMonsterKill()` 与 `handlePlayerDefeat()`，说明这次只是第 5 批第九刀的 player-skill dispatch 抽离，不是完整 player combat 域拆分
- 本轮验证已补跑 `compile`、`smoke:combat`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/world/world-runtime-auto-combat.service.js`
- `materializeAutoCombatCommands / buildAutoCombatCommand / selectAutoCombatTarget / resolveTrackedAutoCombatTarget / pickAutoBattleSkill / resolveAutoBattleDesiredRange` 已委托给 `WorldRuntimeAutoCombatService`
- `WorldRuntimeService` 仍保留 `dispatchEngageBattle(...)` 与玩家战斗主编排；monster 分支的首个 handoff 继续在原入口里执行，只把 auto-combat 目标选择、射程判定与命令物化细节下沉到新 service，说明这次只是第 5 批第十刀的 auto-combat orchestration 抽离，不是完整 `dispatchEngageBattle(...)` / player combat 域拆分
- `packages/server/src/tools/monster-combat-smoke.js` 已把 `battle:engage` 的证明链收紧到首个 post-engage `SelfDelta / WorldDelta` 绑定证据，不再接受任意 `fx` 或泛化怪物位移误报
- 本轮验证已补跑 `compile`、`smoke:monster-combat`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/world/world-runtime-battle-engage.service.js`
- `dispatchEngageBattle(...)` 的锁定目标、autoBattle 切换与首个命令 handoff 已委托给 `WorldRuntimeBattleEngageService`
- `WorldRuntimeService` 仍保留 `handlePlayerMonsterKill()`、`handlePlayerDefeat()`、`processPendingRespawns()` 与 `respawnPlayer()`，说明这次只是第 5 批第十一刀的 player-combat engage orchestration 抽离，不是完整玩家战斗 / 复生域拆分
- 本轮验证已补跑 `pnpm build`、`pnpm verify:replace-ready`、`pnpm --filter @mud/server-next smoke:combat` 与 `pnpm --filter @mud/server-next smoke:monster-combat`
- 新增 `packages/server/src/runtime/world/world-runtime-respawn.service.js`
- `WorldRuntimeService` 的 `processPendingRespawns()` / `respawnPlayer()` 已委托给 `WorldRuntimeRespawnService`，复生队列消费、目标实例解析、位置回填与运行态复原不再留在主服务中
- `WorldRuntimeService` 仍保留 `advanceFrame()` 的调用时机、`dispatchSystemCommand()` 对 `respawnPlayer` 的编排入口，以及跨域错误收口，说明这次是第 5 批第十二刀的 respawn orchestration 抽离
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:runtime`、`pnpm --filter @mud/server-next smoke:player-respawn`、`pnpm --filter @mud/server-next smoke:gm-next`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过
- 新增 `packages/server/src/runtime/world/world-runtime-tick-progress.service.js`
- `WorldRuntimeService` 的 `instanceTickProgressById` 已由 `WorldRuntimeTickProgressService` 真正持有，`advanceFrame()` 中实例级进度累计与 `createInstance()` 初始化已委托给该 service；`world-runtime.state.js` 与 `world-runtime.contract.js` 同步移除了该状态位
- `WorldRuntimeService` 仍保留 `tickAll()` / `advanceFrame()` 的总调度顺序和实例推进编排，说明这次是第 5 批下一刀的 tick-progress state ownership 抽离，不是完整 tick runtime 拆分
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:runtime`、`pnpm --filter @mud/server-next smoke:gm-next`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过，其中 `gm-next` 在无库本地口径下返回 `ok: true` 且标记 `skipped`
- 新增 `packages/server/src/runtime/world/world-runtime-pending-command.service.js`
- `WorldRuntimeService` 的 `pendingCommands` 已由 `WorldRuntimePendingCommandService` 真正持有，`dispatchPendingCommands()` 也已委托给新 service；`world-runtime.state.js` 与 `world-runtime.contract.js` 同步移除了该状态位
- `WorldRuntimeService` 仍保留 `advanceFrame()` 的 tick 顺序、`dispatchInstanceCommand()` / `dispatchPlayerCommand()` 的编排壳，以及跨域错误收口，说明这次是第 5 批下一刀的 pending-command state ownership 抽离
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:runtime`、`pnpm --filter @mud/server-next smoke:gm-next`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过，其中 `gm-next` 在无库本地口径下返回 `ok: true` 且标记 `skipped`
- 新增 `packages/server/src/runtime/world/world-runtime-player-location.service.js`
- `WorldRuntimeService` 的 `playerLocations` 已由 `WorldRuntimePlayerLocationService` 真正持有，连接/断开/传送/复生等链路仍通过主服务 facade 访问该索引；`WorldRuntimeLootContainerService` 的 active viewer 检查与 instance-tick / system-command 编排也已改成走显式 player-location accessor，不再透传 raw `playerLocations` Map；`world-runtime.state.js` 与 `world-runtime.contract.js` 同步移除了该状态位
- `WorldRuntimeService` 仍保留跨域编排、tick 顺序与错误收口，说明这次是第 5 批下一刀的 player-location state ownership 抽离，不是完整 transfer/session 域拆分
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-player-location`、`pnpm --filter @mud/server-next smoke:world-runtime-transfer`、`pnpm --filter @mud/server-next smoke:world-runtime-npc-access`、`pnpm --filter @mud/server-next smoke:world-runtime-movement`、`pnpm --filter @mud/server-next smoke:world-runtime-instance-tick-orchestration`、`pnpm --filter @mud/server-next smoke:runtime`、`pnpm --filter @mud/server-next smoke:gm-next`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过，其中 `gm-next` 在无库本地口径下返回 `ok: true` 且标记 `skipped`
- 新增 `packages/server/src/runtime/world/world-runtime-instance-state.service.js`
- `WorldRuntimeService` 的 `instances` 已由 `WorldRuntimeInstanceStateService` 真正持有，`createInstance()`、`getOrCreatePublicInstance()`、实例查询 facade 与 tick 编排仍通过主服务访问该注册表；`world-runtime.state.js` 与 `world-runtime.contract.js` 同步移除了该状态位
- `WorldRuntimeService` 仍保留 `tickAll()` / `advanceFrame()` 的总调度顺序、跨域错误收口和实例级编排壳，说明这次是第 5 批下一刀的 instance-registry state ownership 抽离，不是完整实例 runtime/tick 域拆分
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:runtime`、`pnpm --filter @mud/server-next smoke:gm-next`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过，其中 `gm-next` 在无库本地口径下返回 `ok: true` 且标记 `skipped`
- `packages/server/src/runtime/world/world-runtime-loot-container.service.js` 持有的 `containerStatesByInstanceId` / `dirtyContainerPersistenceInstanceIds` 现已在 `world-runtime.state.js` 与 `world-runtime.contract.js` 中同步删掉旧声明，状态真所有权与文档口径一致
- 这不是新增 service 的一刀，而是把第 5 批第四刀的 loot/container 状态域真正收尾，避免 `runtimeState` / contract 继续误导为主服务仍持有容器状态
- 新增 `packages/server/src/runtime/world/world-runtime-metrics.service.js`
- `WorldRuntimeService` 的 `lastTickDurationMs`、`lastSyncFlushDurationMs`、`lastTickPhaseDurations`、`tickDurationHistoryMs`、`syncFlushDurationHistoryMs` 已由 `WorldRuntimeMetricsService` 真正持有；`getRuntimeSummary()` 与 `recordSyncFlushDuration()` 保持 facade 入口不变
- `WorldRuntimeService` 仍保留 `tick`、`tickAll()` / `advanceFrame()` 的外层编排顺序与错误收口，说明这次是第 5 批下一刀的 runtime metrics ownership 抽离，不是完整 tick runtime 域拆分
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:runtime`、`pnpm --filter @mud/server-next smoke:gm-next`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过，其中 `gm-next` 在无库本地口径下返回 `ok: true` 且标记 `skipped`
- 新增 `packages/server/src/runtime/world/world-runtime-instance-tick-orchestration.service.js`
- `WorldRuntimeService` 的 `advanceFrame()` / `tickAll()` 现已退为 facade，实例级 tick 编排外壳由 `WorldRuntimeInstanceTickOrchestrationService` 承接；`WorldTickService` 的调用面保持不变
- 这次不迁移任何新状态所有权，只移动实例级 tick 编排顺序、相位计时写入时机与 post-step follow-up 外壳，`WorldRuntimeService` 仍保留跨域事务边界、错误收口和业务域 facade
- 新增 `packages/server/src/runtime/world/world-runtime-movement.service.js`
- `WorldRuntimeService` 的 `dispatchInstanceCommand()` 已退为 facade，实例侧移动 / 传送执行编排由 `WorldRuntimeMovementService` 承接；`WorldRuntimeNavigationService` 与 `WorldRuntimeBattleEngageService` 的调用面保持不变
- 这次不迁移导航意图状态或 `MapInstanceRuntime` 占位实现，只移动 move/portal 分支的执行编排、传送 fallback 顺序和 craft 中断 handoff，`WorldRuntimeService` 仍保留 `applyTransfer()` 与跨域错误收口
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-movement`、`pnpm --filter @mud/server-next smoke:runtime`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过
- 新增 `packages/server/src/runtime/world/world-runtime-player-combat.service.js`
- `WorldRuntimeService` 的 `handlePlayerMonsterKill()` / `handlePlayerDefeat()` 已退为 facade，玩家战斗结果收口由 `WorldRuntimePlayerCombatService` 承接；击杀奖励、经验/进度分发、掉落交付和进入复生队列不再留在主服务中
- 这次不迁移基础攻击、技能派发或 battle engage 入口，只移动战斗结果处理链，`WorldRuntimeService` 仍保留 `dispatchBasicAttack()` / `dispatchCastSkill()` / `dispatchEngageBattle()` 的总编排入口
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:combat`、`pnpm --filter @mud/server-next smoke:monster-combat`、`pnpm --filter @mud/server-next smoke:player-recovery`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过
- 新增 `packages/server/src/runtime/world/world-runtime-use-item.service.js`
- `WorldRuntimeService` 的 `dispatchUseItem()` 已退为 facade，地图解锁、地块灵气提升和普通消耗品使用结算由 `WorldRuntimeUseItemService` 承接；物品使用后的 quest refresh / notice 也不再留在主服务中
- 这次不迁移 `dispatchDropItem()` / `dispatchTakeGround()` / `dispatchEquipItem()` 等相邻物品链路，只移动 `useItem` 这一条叶子业务域，`WorldRuntimeService` 仍保留其它物品/装备命令入口的总编排
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-use-item`、`pnpm --filter @mud/server-next smoke:runtime`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过
- 新增 `packages/server/src/runtime/world/world-runtime-item-ground.service.js`
- `WorldRuntimeService` 的 `dispatchDropItem()` / `dispatchTakeGround()` / `dispatchTakeGroundAll()` 已退为 facade，地面与容器物品的丢弃/拾取链路由 `WorldRuntimeItemGroundService` 承接；与 `WorldRuntimeLootContainerService` 的协作边界保持清晰
- 这次不迁移 `dispatchEquipItem()` / `dispatchUnequipItem()` 或 market/NPC 商店链路，只移动 item-ground 这一组叶子业务域，`WorldRuntimeService` 仍保留其他物品/装备命令入口的总编排
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-item-ground`、`pnpm --filter @mud/server-next smoke:loot`、`pnpm --filter @mud/server-next smoke:runtime`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过
- 新增 `packages/server/src/runtime/world/world-runtime-item-ground.service.js`
- `WorldRuntimeService` 的 `dispatchDropItem()` / `dispatchTakeGround()` / `dispatchTakeGroundAll()` 已退为 facade，地面与容器物品的丢弃/拾取链路由 `WorldRuntimeItemGroundService` 承接；与 `WorldRuntimeLootContainerService` 的协作边界保持清晰
- 这次不迁移 `dispatchEquipItem()` / `dispatchUnequipItem()` 或 market/NPC 商店链路，只移动 item-ground 这一组叶子业务域，`WorldRuntimeService` 仍保留其他物品/装备命令入口的总编排
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-item-ground`、`pnpm --filter @mud/server-next smoke:loot`、`pnpm --filter @mud/server-next smoke:runtime`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过
- 新增 `packages/server/src/runtime/world/world-runtime-redeem-code.service.js`
- `WorldRuntimeService` 的 `dispatchRedeemCodes()` 已退为 facade，兑换码结算与结果回推由 `WorldRuntimeRedeemCodeService` 承接；socket 结果回写与失败提示不再留在主服务中
- 这次不迁移 GM 兑换码管理或持久化层，只移动 runtime 侧 `redeemCodes` 这一条叶子业务域，`WorldRuntimeService` 仍保留其它命令入口的总编排
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:redeem-code`、`pnpm --filter @mud/server-next smoke:runtime`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过，其中 `smoke:redeem-code` 在无库口径下返回 `ok: true` 且标记 `skipped`
- 新增 `packages/server/src/runtime/world/world-runtime-equipment.service.js`
- `WorldRuntimeService` 的 `dispatchEquipItem()` / `dispatchUnequipItem()` 已退为 facade，装备穿戴/卸下结算由 `WorldRuntimeEquipmentService` 承接；与 craft panel 锁槽校验和 panel update 的协作边界保持清晰
- 这次不迁移 `dispatchCultivateTechnique()` 或 market/NPC 商店链路，只移动 equipment 这一组叶子业务域，`WorldRuntimeService` 仍保留其余相邻命令入口的总编排
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-equipment`、`pnpm --filter @mud/server-next smoke:runtime`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过
- 新增 `packages/server/src/runtime/world/world-runtime-cultivation.service.js`
- `WorldRuntimeService` 的 `dispatchCultivateTechnique()` 已退为 facade，主修功法切换、craft panel 阻断判断和修炼提示由 `WorldRuntimeCultivationService` 承接
- 这次不迁移 `dispatchStartAlchemy()` / `dispatchStartEnhancement()` 或其它 craft 链路，只移动 cultivateTechnique 这一条最小叶子业务域，`WorldRuntimeService` 仍保留相邻 craft/runtime 命令入口的总编排
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-cultivation`、`pnpm --filter @mud/server-next smoke:runtime`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过
- 新增 `packages/server/src/runtime/world/world-runtime-progression.service.js`
- `WorldRuntimeService` 的 `dispatchBreakthrough()` / `dispatchHeavenGateAction()` 已退为 facade，突破与天门动作结算由 `WorldRuntimeProgressionService` 承接；当前 tick 透传不再留在主服务中
- 这次不迁移更宽的 progression/runtime 链路，只移动突破与天门这一组最小叶子业务域，`WorldRuntimeService` 仍保留相邻命令入口的总编排
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-progression`、`pnpm --filter @mud/server-next smoke:runtime`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过
- 新增 `packages/server/src/runtime/world/world-runtime-enhancement.service.js`
- `WorldRuntimeCraftService` 的 `dispatchStartEnhancement()` / `dispatchCancelEnhancement()` / `tickEnhancement()` 已退为 facade，强化写路径与面板刷新由 `WorldRuntimeEnhancementService` 承接；炼丹与 preset 仍留在 `WorldRuntimeCraftService`
- 这次不迁移 `dispatchStartAlchemy()` / `dispatchCancelAlchemy()` / preset CRUD，只移动 enhancement 这一条更小的 craft 子域，`WorldRuntimeService` 仍保留 `dispatchStartEnhancement()` / `dispatchCancelEnhancement()` 的总编排入口
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-enhancement`、`pnpm --filter @mud/server-next smoke:runtime`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过
- 新增 `packages/server/src/runtime/world/world-runtime-alchemy.service.js`
- `WorldRuntimeCraftService` 的 `dispatchStartAlchemy()` / `dispatchCancelAlchemy()` / `dispatchSaveAlchemyPreset()` / `dispatchDeleteAlchemyPreset()` / `tickAlchemy()` 已退为 facade，炼丹写路径与 preset 维护由 `WorldRuntimeAlchemyService` 承接；强化仍留在 `WorldRuntimeEnhancementService`
- 这次不迁移 craft 总入口或 panel 通道，只移动 alchemy/preset 这一组剩余 craft 子域，`WorldRuntimeService` 仍保留 `dispatchStartAlchemy()` / `dispatchCancelAlchemy()` / preset 入口的总编排
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-alchemy`、`pnpm --filter @mud/server-next smoke:runtime`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过
- 新增 `packages/server/src/runtime/world/world-runtime-system-command.service.ts`
- `WorldRuntimeService` 的 `dispatchPendingSystemCommands()` / `dispatchSystemCommand()` 已退为 facade，系统命令队列消费与分发由 `WorldRuntimeSystemCommandService` 承接；`WorldRuntimeGmQueueService` 继续持有队列，`WorldRuntimeRespawnService` 继续承接复生编排
- 这次不迁移 `spawnMonsterLoot / damageMonster / defeatMonster / damagePlayer` 等叶子执行本体，只移动 system-command orchestration，`WorldRuntimeService` 仍保留各业务域 facade 与跨域错误收口
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:runtime`、`pnpm --filter @mud/server-next smoke:player-respawn`、`pnpm --filter @mud/server-next smoke:gm-next`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过，其中 `gm-next` 在无库本地口径下返回 `ok: true` 且标记 `skipped`
- `packages/server/src/runtime/world/world-runtime-player-combat.service.js` 现已接管 `dispatchDamagePlayer()`，`WorldRuntimeService` 的同名方法退为 facade，`WorldRuntimeSystemCommandService` 的 `damagePlayer` 分支也不再回跳主服务
- 这次只继续收走 system-command 叶子执行里最小的玩家掉血分支，`dispatchSpawnMonsterLoot()` / `dispatchDefeatMonster()` / `dispatchDamageMonster()` 仍留在 `WorldRuntimeService`，避免把 monster/loot 结算和 player combat 混成同一刀
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:player-respawn` 与 `pnpm --filter @mud/server-next build`；结果继续通过
- 新增 `packages/server/src/runtime/world/world-runtime-monster-system-command.service.js`
- `WorldRuntimeService` 的 `dispatchSpawnMonsterLoot()` / `dispatchDefeatMonster()` / `dispatchDamageMonster()` 已退为 facade，`WorldRuntimeSystemCommandService` 的对应分支也改为直接委托 `WorldRuntimeMonsterSystemCommandService`
- 这次只收掉剩余 monster/loot system-command 三件套，不扩散到 monster AI、基础战斗、查询展示或 `spawnGroundItem()` 本体；`WorldRuntimeService` 仍保留地面掉落写入口与更宽的战斗编排边界
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:monster-runtime`、`pnpm --filter @mud/server-next smoke:monster-loot`、根级 `pnpm build` 与 `pnpm verify:replace-ready`；结果继续通过
- 新增 `packages/server/src/runtime/world/world-runtime-npc-shop.service.js`
- `WorldRuntimeService` 的 `enqueueBuyNpcShopItem()` / `dispatchBuyNpcShopItem()` 已退为 facade，NPC 商店购买入队与结算由 `WorldRuntimeNpcShopService` 承接；quest 交互/接取/提交仍留在 `WorldRuntimeNpcQuestShopService`
- 这次不迁移 NPC quest 写链，只把 NPC shop 这一条最小写路径从混合服务里剥开，`WorldRuntimeService` 仍保留 `dispatchNpcInteraction()` / `dispatchAcceptNpcQuest()` / `dispatchSubmitNpcQuest()` 的总编排入口
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-npc-shop`、`pnpm --filter @mud/server-next smoke:runtime`、根级串行 `pnpm build && pnpm verify:replace-ready`；结果全部通过
- 新增 `packages/server/src/runtime/world/world-runtime-npc-quest-write.service.js`
- `WorldRuntimeService` 的 `dispatchInteractNpcQuest()` / `dispatchAcceptNpcQuest()` / `dispatchSubmitNpcQuest()` 已退为 facade，NPC quest 的三个直接写动作已委托给 `WorldRuntimeNpcQuestWriteService`
- `WorldRuntimeNpcQuestShopService` 仍保留 queue/input 归一与 `executeNpcQuestAction()` / `dispatchNpcInteraction()` 编排，说明这次只是把 NPC quest 写侧叶子三件套单独收口，不扩散到更宽的 NPC/quest 域拆分
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-quest-state`、`pnpm --filter @mud/server-next smoke:progression` 与根级 `pnpm build`；结果通过
- `packages/server/src/runtime/world/world-runtime-npc-quest-write.service.js` 现已继续接管 `executeNpcQuestAction()` / `dispatchNpcInteraction()`，NPC quest 的交互分流与写侧编排不再留在 `WorldRuntimeNpcQuestShopService`
- `WorldRuntimeNpcQuestShopService` 现只保留 `enqueueNpcInteraction()` / `enqueueLegacyNpcInteraction()` / `enqueueAcceptNpcQuest()` / `enqueueSubmitNpcQuest()` 四个 queue/input 归一入口；其余 quest 写链均退为委托
- 新增 `packages/server/src/tools/world-runtime-npc-quest-write-smoke.js` 与 `pnpm --filter @mud/server-next smoke:world-runtime-npc-quest-write`，把 NPC quest 写侧 smoke 收成独立证明链
- 这次不迁移 quest query/read、gateway NPC handler 或更宽的 NPC 域重构，只继续把 NPC quest 写侧最小剩余编排收进 `WorldRuntimeNpcQuestWriteService`
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-npc-quest-write`、`pnpm --filter @mud/server-next smoke:progression` 与根级 `pnpm build`；结果通过
- `WorldRuntimeNpcQuestWriteService` 现已继续接管 `enqueueNpcInteraction()` / `enqueueLegacyNpcInteraction()` / `enqueueAcceptNpcQuest()` / `enqueueSubmitNpcQuest()`，NPC quest 的 queue/input 归一也不再留在独立薄壳服务里
- `WorldRuntimeService` 的 NPC quest 入队、交互执行与提交/接取 facade 现已统一直接委托给 `WorldRuntimeNpcQuestWriteService`；`WorldRuntimeNpcQuestShopService` 已删除，避免继续误导为独立边界
- `packages/server/src/tools/world-runtime-npc-quest-write-smoke.js` 已扩展覆盖 enqueue + execute + dispatch 三层最小证明链，继续把 NPC quest 写域验证固定在单个 focused smoke 内
- 这次不迁移 NPC shop、quest query/read 或 gateway 层，只把 NPC quest 命令侧最后一层薄壳真正收尾
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-npc-quest-write` 与根级 `pnpm build`；结果通过
- `WorldRuntimeService` 的 `dispatchStartEnhancement()` / `dispatchCancelEnhancement()` 现已直接委托给 `WorldRuntimeEnhancementService`，不再经由 `WorldRuntimeCraftService` 中转
- `packages/server/src/runtime/world/world-runtime-craft.service.js` 已删除这两个仅做透传的 enhancement wrapper，craft service 继续只保留共享 craft orchestration、alchemy 入口与 tick 推进边界
- `packages/server/src/tools/world-runtime-enhancement-smoke.js` 已扩展覆盖 world-runtime facade 直连路径，并顺手把旧事件名断言修正为当前真实的 `n:s:enhancementPanel`
- 这次不迁移 alchemy/preset、`advanceCraftJobs()` 或更宽的 craft 域重构，只收掉 enhancement 的最小残留 facade hop
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-enhancement` 与根级 `pnpm build`；结果通过
- `WorldRuntimeService` 的 `dispatchStartAlchemy()` / `dispatchCancelAlchemy()` / `dispatchSaveAlchemyPreset()` / `dispatchDeleteAlchemyPreset()` 现已直接委托给 `WorldRuntimeAlchemyService`，不再经由 `WorldRuntimeCraftService` 中转
- `packages/server/src/runtime/world/world-runtime-craft.service.js` 已删除这四个仅做透传的 alchemy/preset wrapper，craft service 继续只保留共享 craft orchestration、cross-panel interrupt 与 tick 推进边界
- `packages/server/src/tools/world-runtime-alchemy-smoke.js` 已扩展覆盖 world-runtime facade 直连路径，把 alchemy/preset 四个入口的最小证明链收进 focused smoke
- 这次不迁移 enhancement、`advanceCraftJobs()`、`interruptCraftForReason()` 或更宽的 craft 域重构，只收掉 alchemy/preset 的最小残留 facade hop
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-alchemy`；结果通过。根级 `pnpm build` 当前被独立的 client/shared 类型导出问题阻塞（`packages/client/src/gm.ts` 等文件报 shared 导出缺失），现象与本轮 server runtime alchemy 切口不直接对应，需单独处理
- 新增 `packages/server/src/runtime/world/world-runtime-craft-mutation.service.js`
- `WorldRuntimeAlchemyService` / `WorldRuntimeEnhancementService` 中重复的 craft mutation flush、panel push 与地面掉落兜底已统一委托给 `WorldRuntimeCraftMutationService`；`WorldRuntimeCraftService` 现只继续保留 `interruptCraftForReason()` 与 `advanceCraftJobs()` 这组共享编排边界
- `WorldRuntimeEquipmentService` 的 craft 面板刷新也已改为直接委托 `WorldRuntimeCraftMutationService`，不再依赖 `WorldRuntimeCraftService` 持有 panel update helper
- 新增 `packages/server/src/tools/world-runtime-craft-smoke.js`，并把 `world-runtime-alchemy` / `world-runtime-enhancement` smoke 改为走真实的 `WorldRuntimeCraftMutationService`，让 craft shared mutation 与相邻子域 proof 链保持收敛
- 这次不迁移 `interruptCraftForReason()` / `advanceCraftJobs()` 本体，不改 alchemy / enhancement 规则，只继续把 craft runtime 的共享 mutation/helper 从剩余 orchestration 壳里拆出去
- 本轮验证已补跑 `pnpm compile && node dist/tools/world-runtime-craft-smoke.js && node dist/tools/world-runtime-alchemy-smoke.js && node dist/tools/world-runtime-enhancement-smoke.js && node dist/tools/world-runtime-equipment-smoke.js && node dist/tools/smoke-suite.js --case runtime`；结果通过。根级 `pnpm build` 仍有既存的 client/shared 类型导出阻塞，未在本轮一并处理
- 新增 `packages/server/src/runtime/world/world-runtime-craft-interrupt.service.js`
- `interruptCraftForReason()` 已从 `WorldRuntimeCraftService` 继续拆到 `WorldRuntimeCraftInterruptService`；移动、普攻与技能派发现在直接依赖新的 interrupt service，`WorldRuntimeCraftService` 只再保留 `advanceCraftJobs()` 这一条 craft tick 编排边界
- `packages/server/src/tools/world-runtime-craft-smoke.js` 与 `world-runtime-movement-smoke.js` 已同步切到新依赖面，继续把 craft interrupt proof 固定在 focused smoke 内
- 这次不迁移 `advanceCraftJobs()`、不改 tick 顺序，也不改 alchemy / enhancement 规则，只继续收掉 craft 跨域 interrupt 的最小残留壳
- 新增 `packages/server/src/runtime/world/world-runtime-craft-tick.service.js`，原 `world-runtime-craft.service.js` 已删除
- `advanceCraftJobs()` 已从 `WorldRuntimeCraftService` 继续拆到 `WorldRuntimeCraftTickService`；`WorldRuntimeInstanceTickOrchestrationService` 现在直接依赖新的 craft tick service，`WorldRuntimeService` 也不再为了这条单方法壳保留 `worldRuntimeCraftService`
- `packages/server/src/tools/world-runtime-craft-smoke.js` 与 `world-runtime-instance-tick-orchestration-smoke.js` 已同步改到新依赖面，继续把 craft tick proof 固定在 focused smoke 内
- 这次不改 tick 顺序、不改 alchemy / enhancement 规则，也不扩散到更宽的 instance tick 重构，只收掉 craft tick 的最后一层残留空壳
- `WorldRuntimeService` 的 `spawnGroundItem()` 现已退成薄 facade，实际地面掉落生成 helper 已下沉到既有的 `WorldRuntimeItemGroundService`
- `packages/server/src/tools/world-runtime-item-ground-smoke.js` 已扩展覆盖 `spawnGroundItem()` 的成功 / 失败路径，继续把 item-ground proof 固定在 focused smoke 内
- 这次不改掉落规则、不改 monster/player/craft 调用面，也不扩散到传送或实例恢复边界，只继续收掉 `world-runtime.service.ts` 中剩余的 loot-side 写 helper
- 新增 `packages/server/src/runtime/world/world-runtime-transfer.service.js`
- `WorldRuntimeService` 的 `applyTransfer()` 现已退成薄 facade，跨实例传送的 disconnect/connect、落点接入、移动速度恢复、`playerLocations` 更新与导航 transfer 通知已下沉到 `WorldRuntimeTransferService`
- 新增 `packages/server/src/tools/world-runtime-transfer-smoke.js` 与 `pnpm --filter @mud/server-next smoke:world-runtime-transfer`，把 transfer 写路径的 no-op / 正常应用 proof 收成 focused smoke
- 这次不改 portal/tick 时序、不改实例创建/恢复逻辑，也不扩散到更宽的玩家主链重构，只继续收掉 `world-runtime.service.ts` 中剩余的 transfer 写 helper
- 新增 `packages/server/src/runtime/world/world-runtime-npc-access.service.js`
- `WorldRuntimeService` 的 `resolveAdjacentNpc()` 现已退成薄 facade，玩家位置读取、实例解析与相邻 NPC 距离校验已下沉到 `WorldRuntimeNpcAccessService`
- 新增 `packages/server/src/tools/world-runtime-npc-access-smoke.js` 与 `pnpm --filter @mud/server-next smoke:world-runtime-npc-access`，把 NPC access 的成功 / 透传异常 / 超距拒绝 proof 收成 focused smoke
- `WorldRuntimeService` 的 `getNpcForPlayerMap()` 现也已退成薄 facade，当前地图 NPC 读取 helper 继续下沉到 `WorldRuntimeNpcAccessService`，保持 `resolveNpcQuestMarker()` 上层编排不变
- `WorldRuntimeService` 的 `resolveNpcQuestMarker()` 现已退成薄 facade，marker 判定逻辑继续下沉到 `WorldRuntimeNpcQuestInteractionQueryService`，并通过既有 `getNpcForPlayerMap()` facade 取当前地图 NPC
- 新增 `packages/server/src/tools/world-runtime-npc-quest-interaction-query-smoke.js` 与 `pnpm --filter @mud/server-next smoke:world-runtime-npc-quest-interaction-query`，把 ready / active / available / 空玩家 / 空 NPC 的 marker proof 固定在 focused smoke 内
- `packages/server/src/tools/world-runtime-npc-shop-smoke.js` 已把购买提示断言同步到当前真实文案 `购买 聚气丹，消耗 灵石 x5`，避免旧 smoke 继续误报
- `WorldRuntimeService.createNpcShopEnvelope()` 已删除；该 helper 已无调用方，本轮只移除死 facade，不改 live 的 `buildNpcShopView()` / shop query / shop validation 路径
- `WorldRuntimeService.buildNpcShopState()` 已删除；该 helper 也已无调用方，本轮同样只移除死 facade，不改 live 的 `buildNpcShopView()` / shop query / shop validation 路径
- `WorldRuntimeService.getNpcShopCurrencyName()` 已删除；该 helper 同样已无调用方，本轮继续只移除死 facade，不改 live 的 `buildNpcShopView()` / shop query / shop validation 路径
- `WorldRuntimeService.collectNpcQuestViews()` 已删除；该 helper 也已无调用方，本轮仅移除 dead facade，不改 live 的 NPC quest/query 路径
- 这次不改 NPC 商店/任务的 query/write 编排，也不扩散到 `buildNpcShopView()` / `buildNpcQuestsView()` 的更宽抽离，只继续收掉 `world-runtime.service.ts` 中剩余的 NPC access helper
- `packages/server/src/runtime/world/world-runtime.state.js` 与 `packages/server/src/runtime/world/world-runtime.contract.js` 空壳已删除，`WorldRuntimeService` 不再保留无实际用途的 state-layer 包装
- 这不是新增状态域，而是第 5 批收尾清理：在状态所有权都已下沉后，把空壳层彻底移除，避免继续误导为主服务仍通过统一 state store 托管热态
- `WorldRuntimePendingCommandService` 本轮从“Map + dispatch”继续收口为真正的 queue owner：新增 `enqueuePendingCommand()` / `getPendingCommand()` / `hasPendingCommand()` / `clearPendingCommand()` / `getPendingCommandCount()`，把 `pendingCommands` 的 overwrite / clear / count 语义都收回到 service
- `WorldRuntimeService` 已不再暴露裸 `pendingCommands` getter；主服务自身、`WorldRuntimeNavigationService`、`WorldRuntimeAutoCombatService`、`WorldRuntimePlayerCombatService`、`WorldRuntimeNpcShopService` 与 `WorldRuntimeNpcQuestWriteService` 都已改成通过显式 queue API 读写 pending queue，不把 `playerLocations` / `instances` 混进同一刀
- 新增 `packages/server/src/tools/world-runtime-pending-command-smoke.js` 与 `pnpm --filter @mud/server-next smoke:world-runtime-pending-command`，把 queue ownership 的 overwrite / clear / dispatch 路由 proof 固定到 focused smoke；既有 `world-runtime-npc-shop-smoke.js`、`world-runtime-npc-quest-write-smoke.js` 也已同步切到新的 queue API
- 本轮验证已补跑 `pnpm --filter @mud/server-next compile && node dist/tools/world-runtime-pending-command-smoke.js && node dist/tools/world-runtime-npc-shop-smoke.js && node dist/tools/world-runtime-npc-quest-write-smoke.js && node dist/tools/world-runtime-instance-tick-orchestration-smoke.js` 与根级 `pnpm verify:replace-ready`；结果通过，说明 pending queue ownership 收口未打破 queue dispatch、NPC shop / quest 入队链与 local replace-ready 证明链
- 这次不改 tick 顺序、不改实例状态归属，也不同时推进 `playerLocations` / `instances`；只把 `pendingCommands` 这一条 batch-5 ownership seam 收成单一切口

- `WorldRuntimePlayerLocationService` 本轮从“Map + reset”继续收口为真正的 location owner：新增 `getPlayerLocation()` / `setPlayerLocation()` / `clearPlayerLocation()` / `getPlayerLocationCount()` / `listConnectedPlayerIds()`，把位置读写、计数与连线玩家枚举都收回到 service
- `WorldRuntimeService` 已不再暴露裸 `playerLocations` getter；主服务自身、`WorldRuntimeTransferService`、`WorldRuntimeRespawnService`、`WorldRuntimeMovementService`、`WorldRuntimeNpcAccessService`、`WorldRuntimeAutoCombatService`、`WorldRuntimePlayerViewQueryService`、`WorldRuntimeMonsterActionApplyService` 与 `WorldRuntimeGmQueueService` 都已改成通过显式 location API 读写位置，`WorldRuntimeLootContainerService`、`WorldRuntimeInstanceTickOrchestrationService` 与 `WorldRuntimeSystemCommandService` 也不再透传 raw `playerLocations` Map
- 新增 `packages/server/src/tools/world-runtime-player-location-smoke.js` 与 `pnpm --filter @mud/server-next smoke:world-runtime-player-location`，把 location ownership 的 get/set/clear/count/list 路由 proof 固定到 focused smoke；既有 `world-runtime-transfer-smoke.js`、`world-runtime-npc-access-smoke.js`、`world-runtime-movement-smoke.js` 与 `world-runtime-instance-tick-orchestration-smoke.js` 也已同步切到新的 location API
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-player-location`、`pnpm --filter @mud/server-next smoke:world-runtime-transfer`、`pnpm --filter @mud/server-next smoke:world-runtime-npc-access`、`pnpm --filter @mud/server-next smoke:world-runtime-movement`、`pnpm --filter @mud/server-next smoke:world-runtime-instance-tick-orchestration`、`pnpm --filter @mud/server-next smoke:runtime`、`pnpm --filter @mud/server-next smoke:gm-next` 与根级串行 `pnpm build && pnpm verify:replace-ready`；结果通过，说明 player-location ownership 收口未打破传送 / 复生 / 视图 / GM 链路与 local replace-ready 证明链
- 这次不改 tick 顺序、不改实例状态归属，也不同时推进 `instances`；只把 `playerLocations` 这一条 batch-5 ownership seam 收成单一切口

- `WorldRuntimeInstanceStateService` 本轮从“Map + reset”继续收口为真正的 instance-registry owner：新增 `getInstanceRuntime()` / `setInstanceRuntime()` / `listInstanceRuntimes()` / `listInstanceEntries()` / `getInstanceCount()`，把实例读写、枚举与计数语义都收回到 service
- `WorldRuntimeService` 已不再暴露裸 `instances` getter；主服务自身、`WorldRuntimeInstanceQueryService`、`WorldRuntimePlayerViewQueryService`、`WorldRuntimeMovementService`、`WorldRuntimeTransferService`、`WorldRuntimeNpcAccessService`、`WorldRuntimeAutoCombatService`、`WorldRuntimeRespawnService`、`WorldRuntimeGmQueueService`、`WorldRuntimeMonsterActionApplyService`、`WorldRuntimeInstanceTickOrchestrationService` 与 `WorldRuntimeSystemCommandService` 都已改成通过显式 instance accessor 读写实例，`WorldRuntimeLootContainerService.advanceContainerSearches()` 也不再接 raw registry object
- 新增 `packages/server/src/tools/world-runtime-instance-state-smoke.js` 与 `pnpm --filter @mud/server-next smoke:world-runtime-instance-state`，把 instance ownership 的 get/set/list/count/reset proof 固定到 focused smoke；既有 `world-runtime-transfer-smoke.js`、`world-runtime-npc-access-smoke.js`、`world-runtime-movement-smoke.js` 与 `world-runtime-instance-tick-orchestration-smoke.js` 也已同步切到新的 instance accessor shape
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:world-runtime-instance-state`、`pnpm --filter @mud/server-next smoke:world-runtime-transfer`、`pnpm --filter @mud/server-next smoke:world-runtime-npc-access`、`pnpm --filter @mud/server-next smoke:world-runtime-movement`、`pnpm --filter @mud/server-next smoke:world-runtime-instance-tick-orchestration`、`pnpm --filter @mud/server-next smoke:runtime`、`pnpm --filter @mud/server-next smoke:gm-next` 与 `pnpm --filter @mud/server-next build`；结果通过，说明 instance ownership 收口未打破实例查询 / 传送 / 复生 / NPC access / tick orchestration / GM 链路与 server-next 本地构建证明链
- 这次不改 tick-progress ownership、不改实例设计，也不回头扩散到 auth/bootstrap 实现；只把 `instances` 这一条 batch-5 ownership seam 收成单一切口
- 新增 `packages/server/src/runtime/world/world-runtime-action-execution.service.js`
- `WorldRuntimeService` 的 `executeAction()` / `executeLegacyNpcAction()` 现已退为 facade，动作入口的低频编排分流由 `WorldRuntimeActionExecutionService` 承接；`portal:travel`、`realm:breakthrough`、`body_training:infuse`、战斗设置 toggle、`cultivation:toggle`、`npc_shop:*` 与 `npc_quests:*` 都不再直接留在主服务里
- 这次不迁移 `dispatchBasicAttack()` / `dispatchCastSkill()` / `dispatchEngageBattle()` 这些真正的战斗热路径，只收掉动作入口编排壳，`WorldRuntimeService` 仍保留相邻玩家命令与战斗 facade
- 新增 `packages/server/src/tools/world-runtime-action-execution-smoke.js` 与 `pnpm --filter @mud/server-next smoke:world-runtime-action-execution`，把 portal / breakthrough / body-training / toggle / NPC shop / NPC quest 动作入口的 proof 固定到 focused smoke
- 本轮验证已补跑 `pnpm --filter @mud/server-next compile`、`pnpm --filter @mud/server-next smoke:world-runtime-action-execution` 与 `pnpm --filter @mud/server-next smoke:runtime`；结果通过，说明动作入口编排抽离未打破 runtime 主链
- 新增 `packages/server/src/runtime/world/world-runtime-combat-command.service.js`
- `WorldRuntimeService` 的 `dispatchBasicAttack()` / `dispatchCastSkill()` / `resolveLegacySkillTargetRef()` / `dispatchCastSkillToMonster()` / `dispatchCastSkillToTile()` / `dispatchEngageBattle()` 现已统一退为 facade，玩家战斗命令入口由 `WorldRuntimeCombatCommandService` 承接；主服务不再直接持有这组六个战斗入口的分发边界
- 这次不迁移 `WorldRuntimeBasicAttackService`、`WorldRuntimePlayerSkillDispatchService`、`WorldRuntimeBattleEngageService` 这些叶子实现，只把它们上方那层 combat-command orchestration 从主服务里抽出来；`WorldRuntimeService` 仍保留相邻 `handlePlayerMonsterKill()` / `handlePlayerDefeat()` 与跨域 facade
- 新增 `packages/server/src/tools/world-runtime-combat-command-smoke.js` 与 `pnpm --filter @mud/server-next smoke:world-runtime-combat-command`，把 basic-attack / cast-skill / legacy target / engage-battle 六个命令入口的委托 proof 固定到 focused smoke
- 本轮验证已补跑 `pnpm --filter @mud/server-next compile`、`pnpm --filter @mud/server-next smoke:world-runtime-combat-command`、`pnpm --filter @mud/server-next smoke:combat` 与 `pnpm --filter @mud/server-next smoke:monster-combat`；结果通过，说明 combat command orchestration 抽离未打破玩家/妖兽战斗主链
- 新增 `packages/server/src/runtime/world/world-runtime-player-command-enqueue.service.js`
- `WorldRuntimeService` 的 `enqueueBasicAttack()` / `enqueueBattleTarget()` / `enqueueUseItem()` / `enqueueDropItem()` / `enqueueTakeGround()` / `enqueueTakeGroundAll()` / `enqueueEquip()` / `enqueueUnequip()` / `enqueueCultivate()` / `enqueueStartAlchemy()` / `enqueueCancelAlchemy()` / `enqueueSaveAlchemyPreset()` / `enqueueDeleteAlchemyPreset()` / `enqueueStartEnhancement()` / `enqueueCancelEnhancement()` / `enqueueRedeemCodes()` / `enqueueHeavenGateAction()` / `enqueueCastSkill()` / `enqueueCastSkillTargetRef()` 现已统一退为 facade，玩家命令入队前的目标归一化、payload clone、技能存在性校验与 pending-command 排队由 `WorldRuntimePlayerCommandEnqueueService` 承接
- 这次不改 `WorldRuntimePendingCommandService` 的队列所有权，也不改 `dispatchPlayerCommand()` 的 tick 内分发；只把 tick 前的玩家命令入队编排从主服务里抽出来，`WorldRuntimeService` 仍保留导航 / NPC quest write / battle command / pending-command dispatch 的相邻 facade
- 新增 `packages/server/src/tools/world-runtime-player-command-enqueue-smoke.js` 与 `pnpm --filter @mud/server-next smoke:world-runtime-player-command-enqueue`，把 basic-attack 目标归一化、alchemy/enhancement payload clone、cast-skill 校验与 heaven-gate action 入队 proof 固定到 focused smoke
- 新增 `packages/server/src/runtime/world/world-runtime-system-command-enqueue.service.js`
- `WorldRuntimeService` 的 `enqueueSpawnMonsterLoot()` / `enqueueDefeatMonster()` / `enqueueDamageMonster()` / `enqueueDamagePlayer()` / `enqueueRespawnPlayer()` / `enqueueResetPlayerSpawn()` / `enqueueGmUpdatePlayer()` / `enqueueGmResetPlayer()` / `enqueueGmSpawnBots()` / `enqueueGmRemoveBots()` 现已统一退为 facade，system/GM 命令入队前的实例/玩家存在性校验、坐标/roll/amount 归一化与 GM queue handoff 由 `WorldRuntimeSystemCommandEnqueueService` 承接
- 这次不改 `WorldRuntimeGmQueueService` 的队列所有权、`dispatchPendingSystemCommands()` 或 `dispatchSystemCommand()`；只把 tick 前的 system/GM enqueue 编排从主服务里抽出来，`WorldRuntimeService` 仍保留 tick 顺序、系统命令分发与跨域错误收口
- 新增 `packages/server/src/tools/world-runtime-system-command-enqueue-smoke.js` 与 `pnpm --filter @mud/server-next smoke:world-runtime-system-command-enqueue`，把 monster-loot / damage-player 入队归一化与 GM enqueue delegations 固定到 focused smoke
- 本轮验证已补跑 `pnpm --filter @mud/server-next compile`、`pnpm --filter @mud/server-next smoke:world-runtime-player-command-enqueue`、`pnpm --filter @mud/server-next smoke:world-runtime-system-command-enqueue` 与 `node dist/tools/smoke-suite.js --case runtime --case combat --case player-respawn`；结果通过，说明 player/system enqueue orchestration 抽离未打破 runtime / combat / respawn 主链
- `packages/server/src/runtime/world/world-runtime-player-command.service.js` 现已从“纯 switch helper + 巨型 deps object 消费者”收成 injected orchestration service：`dispatchPlayerCommand()` 的 use-item / equipment / item-ground / navigation / combat-command / cultivation / alchemy / enhancement / redeem-code / progression / npc-shop / npc-quest 分发都由该 service 直接注入并调用，`world-runtime.service.ts` 不再在主服务里拼接整段 dispatch deps object
- 这次不改 `WorldRuntimePendingCommandService.dispatchPendingCommands()` 的消费顺序，也不改 `battle-engage` / `basic-attack` / `cast-skill` / `npc quest write` 等叶子实现；只把 tick 内 `dispatchPlayerCommand()` 那层命令路由编排从主服务里真正抽出来
- 新增 `packages/server/src/tools/world-runtime-player-command-smoke.js` 与 `pnpm --filter @mud/server-next smoke:world-runtime-player-command`，把 dead-player gating、cast-skill 路由与 NPC quest 路由 proof 固定到 focused smoke
- 新增 `packages/server/src/runtime/world/world-runtime-player-combat-outcome.service.js`
- `WorldRuntimeService` 的 `dispatchDamagePlayer()` / `handlePlayerMonsterKill()` / `handlePlayerDefeat()` / `processPendingRespawns()` / `respawnPlayer()` 现已统一退为 facade，由 `WorldRuntimePlayerCombatOutcomeService` 承接玩家受伤结果、击杀奖励与复生 orchestration；`world-runtime-system-command.service.ts` 也已改成依赖这个 outcome service，不再分别直接依赖 `WorldRuntimePlayerCombatService` 与 `WorldRuntimeRespawnService`
- 这次不改 `WorldRuntimePlayerCombatService` 的击杀奖励/掉落逻辑，也不改 `WorldRuntimeRespawnService` 的复生语义；只把两者上方那层 outcome/respawn seam 从主服务和 system-command service 里抽出来
- 新增 `packages/server/src/tools/world-runtime-player-combat-outcome-smoke.js` 与 `pnpm --filter @mud/server-next smoke:world-runtime-player-combat-outcome`，把 damage / kill / defeat / pending-respawn / respawn delegation proof 固定到 focused smoke
- 本轮验证已补跑 `pnpm --filter @mud/server-next compile`、`pnpm --filter @mud/server-next smoke:world-runtime-player-command`、`pnpm --filter @mud/server-next smoke:world-runtime-player-command-enqueue`、`pnpm --filter @mud/server-next smoke:world-runtime-player-combat-outcome` 与 `node dist/tools/smoke-suite.js --case runtime --case combat --case player-respawn`；结果通过，说明 player command dispatch + outcome/respawn seam 抽离未打破 runtime / combat / respawn 主链

- 本轮继续把 `06` 的最终边界口径固定成可执行 proof：删除 `world.gateway.ts` 中只剩历史意义的 `handleGm* / execute*` 中转壳，删除 `world-sync.service.ts` 底部残留的 dead diff helper，并新增 `packages/server/src/tools/check-mainline-boundaries.js`
- `proof:mainline-boundaries` 现已接入 `@mud/server-next verify / verify:with-db / verify:replace-ready / verify:proof:with-db / verify:replace-ready:with-db`
- 这条 proof 默认检查：
  - `world-runtime.service.ts <= 1200` 且不再自持 `pendingCommands / playerLocations / instances` raw owner
  - `world.gateway.ts <= 1400` 且不再保留 `handleGm* / execute*` 中转壳、raw market session state 或 direct runtime 写路径
  - `world-sync.service.ts <= 180` 且不再保留 raw aux cache 或遗留 diff helper
  - `world-projector.service.ts <= 1500` 且不承担 socket 发包
- 当前基线已固定为：
  - `world-runtime.service.ts` `1177` 行
  - `world.gateway.ts` `1385` 行
  - `world-sync.service.ts` `157` 行
  - `world-projector.service.ts` `1484` 行

这一批结束后，`world-runtime.service.ts` 仍可以存在，但不该再同时拥有所有领域细节。

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next smoke:runtime`
- `pnpm --filter @mud/server-next smoke:combat`
- `pnpm --filter @mud/server-next smoke:loot`
- `pnpm --filter @mud/server-next smoke:monster-runtime`
- `pnpm --filter @mud/server-next smoke:monster-combat`
- `pnpm --filter @mud/server-next smoke:monster-loot`
- `pnpm --filter @mud/server-next smoke:player-respawn`
- `pnpm --filter @mud/server-next smoke:world-runtime-npc-access`
- `pnpm --filter @mud/server-next smoke:world-runtime-npc-quest-interaction-query`
- `pnpm --filter @mud/server-next smoke:world-runtime-npc-shop`
- `pnpm --filter @mud/server-next smoke:world-runtime-npc-quest-write`

### 第 6 批：把 GM 改动边界写死

- [x] 以 `next-gm-contract.js`、`next-gm-player.service.js`、`world-gm-socket.service.js` 为准，明确 GM 改动边界
- [x] 必须继续走 runtime queue 的：
  - `position`
  - 机器人 spawn/remove
  - runtime 在线玩家 reset
- [x] 允许直接改持久态的：
  - `basic`
  - `realm`
  - `buffs`
  - `techniques`
  - `items`
  - `quests`
  - `mail`
  - `persisted`
- [x] 不允许在 gateway / controller 里散落第三种隐式写路径

本轮继续完成：

- `packages/server/src/http/next/next-gm-player.service.js` 的 `updatePlayer()` 现在把 `position` 继续限定为 runtime queue，其余当前已处理 section 统一改为 direct persistence，再按保存结果回写在线 runtime
- 在线玩家的非 `position` GM 更新不再直接形成 runtime-only 写路径，收口到“queue 或 persistence” 两类
- `autoBattleSkills.autoBattleOrder` 已在 direct persistence 分支保留，消除在线/离线 GM 更新时这一字段的保存漂移
- 本轮验证已补跑 `pnpm --filter @mud/server-next smoke:gm-next`、`pnpm --filter @mud/server-next smoke:gm-database`、根级 `pnpm build` 与 `pnpm verify:replace-ready`；其中 `gm-database` 因缺少 `SERVER_NEXT_DATABASE_URL/DATABASE_URL` 按预期跳过，`gm-next` 在无库本地口径下返回 `ok: true` 且标记 `skipped`
- `packages/server/src/http/next/next-gm-player.service.js` 的 `resetHeavenGate()` 现在也改为 persistence-first：在线玩家不再直接形成 runtime-only 清空路径，而是先落 `progression.heavenGate/spiritualRoots`，再按保存结果回写在线 runtime
- 本轮验证已再次补跑 `pnpm --filter @mud/server-next smoke:gm-next`、`pnpm --filter @mud/server-next smoke:gm-database`、根级 `pnpm build` 与 `pnpm verify:replace-ready`；结果与上一轮一致：`gm-next` 在无库本地口径下 `ok: true` 且标记 `skipped`，`gm-database` 因缺少 `SERVER_NEXT_DATABASE_URL/DATABASE_URL` 按预期跳过
- `packages/server/src/network/world-gm-socket.service.js` 不再在 socket 层自行决定 mutate 后的 `queueStatePush()`；GM socket 的 4 个 `enqueue*` 现在只负责转发到 `runtime-gm-state.service.js`
- `packages/server/src/runtime/gm/runtime-gm-state.service.ts` 现在统一在 4 个 `enqueue*` 内按 `NEXT_GM_SOCKET_CONTRACT.pushStateAfterMutation` 决定是否排 GM 状态刷新，把“写入队列 + 刷新策略”收回 runtime GM state 边界内
- 本轮验证再次通过：`pnpm --filter @mud/server-next smoke:gm-next` 返回 `ok: true` 且在无库口径下 `skipped`；`pnpm build` 与 `pnpm verify:replace-ready` 继续通过；`pnpm --filter @mud/server-next smoke:gm-database` 仍因缺少 `SERVER_NEXT_DATABASE_URL/DATABASE_URL` 按预期跳过

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next smoke:gm-next`
- `pnpm --filter @mud/server-next smoke:gm-database`

## 收口检查表

- [x] `world.gateway.ts` 不再自己做大段业务处理
- [x] `world-session-bootstrap.service.js` 成为登录到入图的唯一编排入口
- [x] `world-sync.service.ts` 不再自己做大段 capture/diff 细节
- [x] `world-projector.service.ts` 不再自己承担 socket 发包
- [x] `world-runtime.service.ts` 不再同时持有查询、展示、热路径、GM queue 全部细节
- [x] GM 写路径只剩 runtime queue 或 direct persistence 两类
- [x] 玩家主链不再出现多处兜底身份/快照/同步分支

## 本阶段不做的事

- 不在这里顺手继续做 `05` 的 compat 删除，只消费 `05` 已经收出来的边界。
- 不把 `world-runtime.service.ts` 机械切成 `part1/part2/part3`。
- 不在重构时改协议含义、面板职责、tick 规则。
- 不因为“更现代”而把当前稳定的同步 envelope 全部推倒重写。

## 完成定义

- [x] 服务端主链按职责拆清
- [x] 玩家核心路径没有“又从 A 走，又从 B 兜底”的双路径

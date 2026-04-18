# 06 服务端主链收口

目标：把 server-next 主链收成单路径、清职责、好验证。

## 当前基线

当前最重的服务端主链文件已经说明这不是“文件偏长”，而是“职责失控”：

- `packages/server/src/runtime/world/world-runtime.service.js`
  - `5426` 行
  - 当前同时混着：实例 tick 编排、移动/占位、战斗、掉落、NPC/任务、炼丹/强化、GM runtime 队列、战斗特效、复活/重生、部分详情查询。
- `packages/server/src/network/world.gateway.js`
  - `2812` 行
  - 当前同时混着：连接入口、协议握手、鉴权后入口、GM socket、移动/战斗/任务/商店/炼丹/强化等大量 C2S handler。
- `packages/server/src/network/world-sync.service.js`
  - `2454` 行
  - 当前同时混着：首包/增量同步、quest/loot/threat/minimap 额外同步、socket 发包、同步缓存、compat 残余路径。
- `packages/server/src/network/world-projector.service.js`
  - `1484` 行
  - 当前同时混着：capture、diff、面板切片、战斗/动作/BUFF/技术/世界对象投影组装。
- `packages/server/src/runtime/player/player-runtime.service.js`
  - `2564` 行
  - 当前同时混着：玩家运行时、快照恢复、兼容归一、派生属性与通知。
- `packages/server/src/network/world-session-bootstrap.service.js`
  - `776` 行
  - 当前混着：session reuse 策略、bootstrap 入口、身份提升后首包同步准备。
- `packages/server/src/network/world-player-auth.service.js`
  - `691` 行
  - 当前混着：token 鉴权、身份提升、migration backfill、持久化来源归一。
- `packages/server/src/network/world-player-snapshot.service.js`
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

- [ ] 继续拆 `packages/server/src/runtime/world/world-runtime.service.js`
- [ ] 继续拆 `packages/server/src/network/world.gateway.js`
- [ ] 继续拆 `packages/server/src/network/world-sync.service.js`
- [ ] 继续拆 `packages/server/src/network/world-projector.service.js`
- [ ] 继续拆玩家运行时的混杂职责
- [ ] 继续拆 session / bootstrap / auth 的边界
- [ ] 明确 tick 内允许写状态的入口
- [ ] 明确地图、玩家、战斗、掉落、交互写路径
- [ ] 明确哪些 GM 操作必须走 runtime queue
- [ ] 明确哪些 GM 操作允许直接改持久态
- [ ] 收口玩家从登录到进入世界到持久化的主链
- [ ] 收口地图同步、面板同步、详情查询的服务边界
- [ ] 补每个拆分阶段的最小 smoke 验证

## 具体拆分顺序

### 第 1 批：先把入口层收成薄路由

- [x] 把 `world.gateway.js` 收成“事件分发层”，不再继续承载具体业务分支
- [x] 抽离握手 / hello / guest 入口处理
- [x] 抽离 authenticated player action handler
- [x] 抽离 GM socket handler
- [x] 保留一个薄 gateway，只负责：
  - 协议入口
  - client/session 基础校验
  - 把 payload 路由到具体 handler service

建议边界：

- `world.gateway.js`
  - 最终只保留 `@SubscribeMessage` 与统一 reject / logging / routing
- 从 `world.gateway.js` 先抽出去的优先块：
  - session / hello / authenticated connect（已抽到 `world-gateway-bootstrap.helper.js`）
  - movement / combat / interaction
  - item / equipment / cultivate
  - quest / npc / shop / redeem
  - alchemy / enhancement
  - gm socket（已抽到 `world-gateway-gm-command.helper.js`）

本轮已完成：

- 新增 `packages/server/src/network/world-gateway-bootstrap.helper.js`
- `world.gateway.js` 的 `handleConnection / handleHello` 已改为薄委托
- bootstrap promise 跟踪、guest/authenticated bootstrap 输入组装、connect/hello 协议判定、not-ready 拒绝与 hello gate 已移出 gateway 主文件

当前仍未完成：

- `world.gateway.js` 仍保留少量统一发包/守卫 glue：`emitNext*`、`require*`、`flushMarketResult`、`broadcastSuggestions`
- `world.gateway.js` 仍保留 `@SubscribeMessage` 装饰入口与 helper 委托，不再直接承载大块 gameplay 业务分支
- 下一阶段重心转入 batch 2：登录到进入世界的单路径，而不是继续机械拆 gateway

本轮已完成：

- 新增 `packages/server/src/network/world-gateway-gm-command.helper.js`
- `GmGetState / GmSpawnBots / GmRemoveBots / GmUpdatePlayer / GmResetPlayer` 已从 gateway 主文件移出
- 新增 `packages/server/src/network/world-gateway-gm-suggestion.helper.js`
- `GmMarkSuggestionCompleted / GmRemoveSuggestion` 已从 gateway 主文件移出
- 新增 `packages/server/src/network/world-gateway-movement.helper.js`
- `handleNextMoveTo / handleMove / handleNextNavigateQuest` 已从 gateway 主文件移出
- 新增 `packages/server/src/network/world-gateway-suggestion.helper.js`
- `handleNextRequestSuggestions / handleNextCreateSuggestion / handleNextVoteSuggestion / handleNextReplySuggestion / handleNextMarkSuggestionRepliesRead` 已从 gateway 主文件移出
- 新增 `packages/server/src/network/world-gateway-inventory.helper.js`
- `handleNextDestroyItem / handleNextSortInventory / handleNextUseItem / handleNextDropItem / handleTakeGround / handleNextEquip / handleNextUnequip` 已从 gateway 主文件移出
- 新增 `packages/server/src/network/world-gateway-mail.helper.js`
- `handleNextRequestMailSummary / handleNextRequestMailPage / handleNextRequestMailDetail / handleNextMarkMailRead / handleNextClaimMailAttachments / handleNextDeleteMail` 已从 gateway 主文件移出
- 新增 `packages/server/src/network/world-gateway-npc.helper.js`
- `handleNextRequestNpcShop / handleRequestNpcQuests / handleAcceptNpcQuest / handleSubmitNpcQuest / handleNextBuyNpcShopItem` 已从 gateway 主文件移出
- 新增 `packages/server/src/network/world-gateway-craft.helper.js`
- `handleNextRequestAlchemyPanel / handleNextRequestEnhancementPanel / handleNextStartAlchemy / handleNextCancelAlchemy / handleNextSaveAlchemyPreset / handleNextDeleteAlchemyPreset / handleNextStartEnhancement / handleNextCancelEnhancement` 已从 gateway 主文件移出
- 新增 `packages/server/src/network/world-gateway-market.helper.js`
- `handleNextRequestMarket / handleNextRequestMarketListings / handleNextRequestMarketItemBook / handleNextRequestMarketTradeHistory / handleNextCreateMarketSellOrder / handleNextCreateMarketBuyOrder / handleNextBuyMarketItem / handleNextSellMarketItem / handleNextCancelMarketOrder / handleNextClaimMarketStorage` 已从 gateway 主文件移出
- 新增 `packages/server/src/network/world-gateway-player-controls.helper.js`
- `handleNextChat / handleNextAckSystemMessages / handleNextDebugResetSpawn / handleNextUpdateAutoBattleSkills / handleNextUpdateAutoUsePills / handleNextUpdateCombatTargetingRules / handleNextUpdateAutoBattleTargetingMode / handleNextUpdateTechniqueSkillAvailability / handleNextHeavenGateAction / handleRequestQuests` 已从 gateway 主文件移出

本轮继续完成：

- 新增 `packages/server/src/network/world-gateway-read-model.helper.js`
- `handleNextRequestAttrDetail / handleNextRequestLeaderboard / handleNextRequestWorldSummary / handleRequestDetail / handleRequestTileDetail` 已从 gateway 主文件移出
- AttrDetail / Leaderboard / WorldSummary / Detail / TileDetail 的构造与 next-only 发包行为保持不变

本轮继续完成：

- 新增 `packages/server/src/network/world-gateway-action.helper.js`
- `handleNextRedeemCodes / handleUsePortal / handleNextCultivate / handleCastSkill / handleUseAction / handleProtocolAction / resolveActionId / emitProtocolActionResult` 已从 gateway 主文件移入 action helper
- `redeemCodes / portal / cultivate / castSkill / useAction` 的 gateway error code、runtime enqueue、loot:open / battle / npc action / body_training 分发语义保持不变

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next smoke:session`
- `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`
- `pnpm --filter @mud/server-next smoke:runtime`
- `pnpm --filter @mud/server-next smoke:loot`
- `pnpm --filter @mud/server-next audit:next-protocol`

### 第 2 批：收口登录到进入世界的单路径

- [x] 以 `world-session-bootstrap.service.js` 为中心，把 `gateway -> auth -> snapshot -> session binding -> init sync` 串成唯一主链
- [x] 明确 `world-player-auth.service.js` 只负责：
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

- `world-player-auth.service.js` 不再在 `authenticatePlayerToken()` 里前置执行 `token_seed` starter snapshot 准入
- `token_seed` 身份在持久化成功后直接从 auth 返回，由 `world-session-bootstrap.service.js -> loadAuthenticatedPlayerSnapshot()` 接管缺快照时的恢复/阻断
- `next-auth-bootstrap-smoke.js` 已同步把这条责任边界改成“bootstrap/snapshot 阶段负责 snapshot readiness”

本轮继续完成：

- `world-player-auth.service.js` 不再对已加载的 next 身份执行 `nextProtocolStrict` 二次拦截
- `world-session-bootstrap.service.js -> resolveAuthenticatedBootstrapContractViolation()` 成为 next 主链准入的唯一合同裁判

本轮继续完成：

- `world-session-bootstrap.service.js` 现在自持 `token_seed -> native` best-effort 提升
- `world-player-auth.service.js` 不再暴露 `promoteTokenSeedIdentityToNative()` 一类 bootstrap 回调职责
- `next-auth-bootstrap-smoke.js` 已同步验证“auth 返回 token/token_seed，bootstrap 在快照成功后提升为 next/native”的新边界
- 已进一步收紧：`token/token_seed` 仍可进入 bootstrap，但在 bootstrap 自持提升完成前不再享有 detached-session implicit reuse、requested session reuse 或 connected-session reuse；运行时 session reuse 仅保留给 `next/native`

当前结论：

- 登录到进入世界的主链编排已收束到 `world-session-bootstrap.service.js`
- `world-player-auth.service.js` 与 `world-player-snapshot.service.js` 的职责边界已按本批目标收口
- 下一阶段重心切到 batch 3：把同步与投影拆成三层

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`
- `pnpm --filter @mud/server-next smoke:session`
- `pnpm --filter @mud/server-next smoke:player-recovery`

### 第 3 批：把同步与投影拆成三层

- [x] 把 `world-sync.service.js` 收成“同步编排层”
- [x] 把 `world-projector.service.js` 收成“投影 / diff / patch 构建层”
- [x] 把 `world-sync-protocol.service.js` 固定为“协议发送层”
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

- 新增 `packages/server/src/network/world-sync-quest-loot.service.js`
- `world-sync.service.js` 不再自持 `lastQuestRevisionByPlayerId` / `lootWindowByPlayerId`，quest revision 检查与 loot window build/open/cleanup 已委托给 `WorldSyncQuestLootService`
- `world-client-event.service.js` 的 `emitLootWindowUpdate()` 已改为直接复用 `WorldSyncQuestLootService`
- `app.module.js` 已完成 batch 3 首刀 provider 接线，`world-sync.service.js` 继续保留 world/self/panel delta、threat、minimap 等主编排与热路径
- 为恢复 batch 3 验证链，补齐了 `world-gateway-read-model.helper.js` 的 `AttrDetail.numericStatBreakdowns` 结构，使其重新符合 shared 协议约定
- 新增 `packages/server/src/network/world-sync-threat.service.js`
- `world-sync.service.js` 的 threat arrow build / diff / emit 冷路径已委托给 `WorldSyncThreatService`，`nextAuxStateByPlayerId.threatArrows` 仍暂留在 sync 编排层，避免第二刀同时扩大到 minimap cache 边界
- 本轮验证已补跑 `smoke:runtime`、`smoke:monster-ai`、`audit:next-protocol`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/network/world-sync-minimap.service.js`
- `world-sync.service.js` 的 minimap marker cache / build / visible filter / diff 冷路径已委托给 `WorldSyncMinimapService`，`nextAuxStateByPlayerId.visibleMinimapMarkers` 仍暂留在 sync 编排层，继续由 mapChanged / MapStatic 编排统一控制
- 本轮验证已补跑 `smoke:runtime`、`smoke:progression`、`audit:next-protocol`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- `world-sync-protocol.service.js` 已接管主 envelope（`InitSession / MapEnter / WorldDelta / SelfDelta / PanelDelta`）与 `Bootstrap` 下发，`world-sync.service.js` 对这组发包只再保留薄委托
- `packages/server/src/tools/next-protocol-audit.js` 与 `packages/shared/scripts/check-network-protobuf-contract.cjs` 已同步扩展 protocol 静态发包面审计；当前仍保留 `threat` 作为独立 `WorldDelta` 附加同步，不把它误写成 protocol 唯一出口
- 新增 `packages/server/src/network/world-sync-map-snapshot.service.js`
- `world-sync.service.js` 的 visible tiles / visible tile keys / render entities / minimap library / game time 构造已委托给 `WorldSyncMapSnapshotService`
- 新增 `packages/server/src/network/world-sync-map-static-aux.service.js`
- `world-sync.service.js` 不再自持 player 级 `visibleTiles` / `visibleMinimapMarkers` aux cache 与 `diffVisibleTiles()` patch 规划；这部分已收进 `WorldSyncMapStaticAuxService`
- 本轮验证已补跑 `smoke:next-auth-bootstrap`、`smoke:runtime`、`audit:next-protocol`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 第 3 批到此收口，下一步切到第 4 批：优先从 `world-runtime.service.js` 的只读查询 / 详情块下手

优先保留原状的热路径：

- world/self/panel delta 主 envelope 结构

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next smoke:runtime`
- `pnpm --filter @mud/server-next smoke:progression`
- `pnpm --filter @mud/server-next audit:next-protocol`

### 第 4 批：先从 `world-runtime` 里拆冷路径和查询块

- [ ] 从 `world-runtime.service.js` 先拆不直接写 tick 热状态的查询/详情块
- [ ] 先拆 NPC / quest 查询、shop 校验、导航目标、面板详情、GM 只读辅助查询
- [ ] 把纯构建/归一/查询 helper 挪成显式 query/domain 模块
- [ ] 保持 `world-runtime.service.js` 暂时仍作为总编排层，但减掉查询杂质

本轮已完成：

- 新增 `packages/server/src/runtime/world/world-runtime-npc-shop-query.service.js`
- `world-runtime.service.js` 的 NPC shop 只读封装、货币名称解析与购买前校验已委托给 `WorldRuntimeNpcShopQueryService`
- `world-runtime.service.js` 仍保留 `resolveAdjacentNpc()`、`buildNpcShopView()` facade、`enqueueBuyNpcShopItem()` 与 `dispatchBuyNpcShopItem()` 的写路径编排，避免第 4 批第一刀越界到 batch 5 的状态域拆分
- 本轮验证已补跑 `audit:next-protocol`、`smoke:progression`、`smoke:redeem-code`、`smoke:gm-next`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/world/world-runtime-quest-query.service.js`
- `world-runtime.service.js` 的 NPC quest envelope、任务模板展开、reward 构造、progress/ready 判定与导航目标解析已委托给 `WorldRuntimeQuestQueryService`
- `world-runtime.service.js` 仍保留 `resolveAdjacentNpc()`、`buildNpcQuestsView()` facade、`refreshQuestStates()`、`dispatchAcceptNpcQuest()`、`dispatchSubmitNpcQuest()` 与 `tryAcceptNextQuest()` 的写路径编排，避免第 4 批第二刀越界到 batch 5 的状态域拆分
- 本轮验证已补跑 `audit:next-protocol`、`smoke:progression`、`smoke:redeem-code`、`smoke:gm-next`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/world/world-runtime-npc-quest-interaction-query.service.js`
- `world-runtime.service.js` 的 NPC quest marker 解析与 `npc_quests:*` 上下文动作构造已委托给 `WorldRuntimeNpcQuestInteractionQueryService`
- `world-runtime.service.js` 仍保留 `buildNpcQuestsView()` facade、`executeLegacyNpcAction()`、`dispatchNpcInteraction()` 与任务接取/提交写路径，避免第 4 批第三刀越界到 batch 5 的状态域拆分
- 本轮验证已补跑 `smoke:progression`、`smoke:redeem-code`、`smoke:gm-next`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/craft/craft-panel-alchemy-query.service.js`
- 新增 `packages/server/src/runtime/craft/craft-panel-alchemy-query.helpers.js`
- `CraftPanelRuntimeService` 的炼丹面板只读 payload/state 构造已委托给 `CraftPanelAlchemyQueryService`，目录版本与 clone helper 已收进共享 helper；炼丹/强化的写路径与 tick 逻辑仍保留在 `CraftPanelRuntimeService`
- 本轮验证已补跑 `audit:next-protocol`、`smoke:progression`、`smoke:redeem-code`、`smoke:gm-next`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
- 新增 `packages/server/src/runtime/craft/craft-panel-enhancement-query.service.js`
- `CraftPanelRuntimeService` 的强化面板只读 payload/state/candidates/protection 展示构造已委托给 `CraftPanelEnhancementQueryService`
- 强化写路径、资源消耗、保护物校验与 tick 推进仍保留在 `CraftPanelRuntimeService`，避免第 4 批这一刀越界到 batch 5 的状态域拆分
- 本轮验证已补跑 `audit:next-protocol`、`smoke:progression`、`smoke:redeem-code`、`smoke:gm-next`、根级 `pnpm build` 与 `pnpm verify:replace-ready`

当前优先可拆的冷块：

- 任务详情 / reward / target / navigation 解析
- NPC quest marker / NPC 交互动作列表
- NPC 商店只读查询与校验
- 炼丹 / 强化面板的展示型数据构建

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next smoke:progression`
- `pnpm --filter @mud/server-next smoke:redeem-code`
- `pnpm --filter @mud/server-next smoke:gm-next`

### 第 5 批：再拆 `world-runtime` 热路径状态域

- [ ] 把 `world-runtime.service.js` 拆成明确状态域，而不是继续堆 helper
- [ ] 至少要拆清这些域：
  - 地图实例 / tick 编排
  - 玩家移动 / 占位 / 导航意图
  - 战斗 / 技能 / 特效
  - 掉落 / loot / 地面容器
  - NPC / quest / shop 交互写路径
  - craft runtime（alchemy / enhancement）
  - GM runtime queue
- [ ] 总编排层只保留：
  - tick 顺序
  - 跨域事务边界
  - 错误收口

本轮已完成：

- 新增 `packages/server/src/runtime/world/world-runtime-gm-queue.service.js`
- `WorldRuntimeService` 的 `enqueueGm*` 命令归一与 `gmUpdatePlayer / gmSpawnBots / gmRemoveBots` 派发细节已委托给 `WorldRuntimeGmQueueService`
- `WorldRuntimeService` 仍保留 `pendingSystemCommands` 队列所有权、tick 内 `dispatchPendingSystemCommands()`、`dispatchSystemCommand()` 分发与 `respawnPlayer()`，说明这次只是第 5 批第一刀的 helper 级提取，不是完整 GM runtime 子域拆分
- 本轮验证已补跑 `smoke:runtime`、`smoke:gm-next`、`smoke:player-respawn`、根级 `pnpm build` 与 `pnpm verify:replace-ready`
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

这一批结束后，`world-runtime.service.js` 仍可以存在，但不该再同时拥有所有领域细节。

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next smoke:runtime`
- `pnpm --filter @mud/server-next smoke:combat`
- `pnpm --filter @mud/server-next smoke:loot`
- `pnpm --filter @mud/server-next smoke:monster-runtime`
- `pnpm --filter @mud/server-next smoke:monster-combat`
- `pnpm --filter @mud/server-next smoke:monster-loot`
- `pnpm --filter @mud/server-next smoke:player-respawn`

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
- `packages/server/src/runtime/gm/runtime-gm-state.service.js` 现在统一在 4 个 `enqueue*` 内按 `NEXT_GM_SOCKET_CONTRACT.pushStateAfterMutation` 决定是否排 GM 状态刷新，把“写入队列 + 刷新策略”收回 runtime GM state 边界内
- 本轮验证再次通过：`pnpm --filter @mud/server-next smoke:gm-next` 返回 `ok: true` 且在无库口径下 `skipped`；`pnpm build` 与 `pnpm verify:replace-ready` 继续通过；`pnpm --filter @mud/server-next smoke:gm-database` 仍因缺少 `SERVER_NEXT_DATABASE_URL/DATABASE_URL` 按预期跳过

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next smoke:gm-next`
- `pnpm --filter @mud/server-next smoke:gm-database`

## 收口检查表

- [ ] `world.gateway.js` 不再自己做大段业务处理
- [ ] `world-session-bootstrap.service.js` 成为登录到入图的唯一编排入口
- [x] `world-sync.service.js` 不再自己做大段 capture/diff 细节
- [x] `world-projector.service.js` 不再自己承担 socket 发包
- [ ] `world-runtime.service.js` 不再同时持有查询、展示、热路径、GM queue 全部细节
- [x] GM 写路径只剩 runtime queue 或 direct persistence 两类
- [ ] 玩家主链不再出现多处兜底身份/快照/同步分支

## 本阶段不做的事

- 不在这里顺手继续做 `05` 的 compat 删除，只消费 `05` 已经收出来的边界。
- 不把 `world-runtime.service.js` 机械切成 `part1/part2/part3`。
- 不在重构时改协议含义、面板职责、tick 规则。
- 不因为“更现代”而把当前稳定的同步 envelope 全部推倒重写。

## 完成定义

- [ ] 服务端主链按职责拆清
- [ ] 玩家核心路径没有“又从 A 走，又从 B 兜底”的双路径

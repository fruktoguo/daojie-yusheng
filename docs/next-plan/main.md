# next 原地硬切任务计划

更新时间：2026-04-20

这份文档是原地硬切的实际执行清单。

使用规则：

- `[ ]` 代表未完成
- `[x]` 代表已完成
- 新任务默认只往这份清单里加，不再另起一套“兼容迁移”计划
- 如果某项不做了，直接删掉，不保留僵尸任务

执行时以这份总表为总索引，以编号任务文档为实际落地清单：

- 第 1 阶段对应 [01 冻结 legacy 与边界收口](./01-freeze-legacy-and-boundaries.md)
- 第 2-3 阶段对应 [02 钉死 next 真源与协议主线](./02-pin-next-sources-and-protocol.md)
- 第 4 阶段对应 [03 必须迁移的数据清单](./03-required-data-migration-checklist.md)
- 第 5 阶段对应 [04 一次性迁移脚本](./04-one-off-migration-script.md)
- 第 6 阶段对应 [05 删除 compat 与桥接层](./05-remove-compat-and-bridges.md)
- 第 7 阶段对应 [06 服务端主链收口](./06-server-mainline-refactor.md)
- 第 8 阶段对应 [07 客户端主链收口](./07-client-mainline-refactor.md)
- 第 9-10 阶段对应 [08 shared 与内容地图收口](./08-shared-content-and-map-cleanup.md)
- 第 11 阶段对应 [09 验证门禁与验收](./09-verification-and-acceptance.md)
- 第 12-13 阶段对应 [10 legacy 归档与最终切换](./10-legacy-archive-and-cutover.md)
- 第 14 阶段后的服务端专项迁移对应 [11 server 全面 TS 化计划](./11-server-ts-migration-plan.md)

## 0. 已完成前置

- [x] 明确不再新开第三套主线，继续在当前仓库原地推进
- [x] 明确 `packages/client`、`packages/server`、`packages/shared` 为唯一主线方向
- [x] 写出 [next 系统模块 / API / 数据目录总盘点](../next-system-module-api-inventory.md)
- [x] 写出 [next 原地硬切执行文档](../next-in-place-hard-cut-plan.md)

## 1. 立刻冻结 legacy

对应任务文档：

- [01 冻结 legacy 与边界收口](./01-freeze-legacy-and-boundaries.md)

- [x] 在文档口径里明确 `legacy/*` 只作为参考和迁移来源，不再承担主开发职责
- [x] 停止新增任何“为了对齐 legacy 行为”的新任务
- [x] 停止向 `legacy/client`、`legacy/server`、`legacy/shared` 落新功能
- [x] 盘点当前还在直接读写 `legacy/*` 的 next 主链入口
- [x] 列出必须暂时保留的 legacy 读取点
- [x] 列出可以直接删除的 legacy / compat / parity 入口

## 2. 钉死 next 真源

对应任务文档：

- [02 钉死 next 真源与协议主线](./02-pin-next-sources-and-protocol.md)

- [x] 确认 `packages/shared/src/protocol.ts` 是唯一 next 协议真源
- [x] 确认 `packages/server/data/*` 是唯一内容和地图真源
- [x] 确认 `packages/server/src/runtime/*` 是唯一服务端运行时主链
- [x] 确认 `packages/client/src/network/socket.ts` 是唯一前台 Socket 主链
- [x] 确认 `packages/client/src/main.ts` 是唯一前台入口主链
- [x] 清掉仍然通过 legacy 文件定义 next 行为的地方

## 3. 先补协议硬缺口

对应任务文档：

- [02 钉死 next 真源与协议主线](./02-pin-next-sources-and-protocol.md)

- [x] 决定 `SaveAlchemyPreset` 保留为 next 正式能力
- [x] 决定 `DeleteAlchemyPreset` 保留为 next 正式能力
- [x] 已在 next 网关和 runtime 补齐实现
- [x] 扫一遍所有 `NEXT_C2S` / `NEXT_S2C`，确认不再有“声明了但没实现”的事件
- [x] 跑一遍协议审计，确认共享协议、客户端、服务端三边一致

## 4. 产出必须迁移的数据清单

对应任务文档：

- [03 必须迁移的数据清单](./03-required-data-migration-checklist.md)

- [x] 列出账号身份相关数据
- [x] 列出角色基础信息相关数据
- [x] 列出地图位置 / 出生点 / 当前实例相关数据
- [x] 列出境界 / 属性 / 数值成长相关数据
- [x] 列出背包 / 装备 / 物品相关数据
- [x] 列出功法 / 技能 / 修炼状态相关数据
- [x] 列出任务相关数据
- [x] 列出邮件相关数据
- [x] 列出市场相关数据
- [x] 列出建议 / 回复相关数据
- [x] 列出兑换码和 GM 必要持久化数据
- [x] 对每个数据域写清 legacy 来源、next 目标、转换规则、默认值、可丢弃项
- [x] 把这份数据清单单独落成文档

补充口径：

- [x] 已明确可重建项：`buff / runtimeBonuses / pendingLogbookMessages`
- [x] 已明确可按条件跳过项：`市场成交历史 / 地图环境快照 / Afdian / GM 备份作业历史`

## 5. 写一次性迁移脚本

对应任务文档：

- [04 一次性迁移脚本](./04-one-off-migration-script.md)

- [x] 选定迁移脚本落点目录
- [x] 支持 dry-run
- [x] 支持输出迁移统计摘要
- [x] 支持输出失败清单
- [x] 支持按数据域分段执行
- [x] 支持从 legacy 来源读取账号与角色数据
- [x] 支持从 legacy 来源读取邮件数据
- [x] 支持从 legacy 来源读取市场数据
- [x] 支持从 legacy 来源读取兑换码数据
- [x] 支持从 legacy 来源读取建议 / 回复数据
- [x] 支持从 legacy 来源读取 GM 密码数据
- [x] 支持从 legacy 来源读取 GM 备份 / 作业数据
- [x] 支持迁移背包 / 装备 / 功法 / 任务 / 邮件 / 市场 / 建议等核心数据
- [x] 支持把结果写入 next 所需持久化结构
- [x] 设计迁移后的最小验证命令
- [x] 补一份样本 fixture 并跑通 dry-run
- [x] 用一份样本数据跑通完整转换

## 6. 删除 compat / bridge / parity 层

对应任务文档：

- [05 删除 compat 与桥接层](./05-remove-compat-and-bridges.md)

- [x] 盘点 `packages/server/src/network/` 下仍然存在的 compat / bridge 入口
- [x] 盘点 `packages/server/src/persistence/` 下仍然存在的 compat 读取入口
- [x] 盘点 `packages/client/src/` 下仍然存在的旧协议 alias / 旧 UI 兼容入口
- [x] 删除只为 legacy 让路的旧事件名兼容
- [x] 删除只为 parity 存在的双路径处理分支
- [x] 删除不再需要的 legacy wrapper / facade
- [x] 删除 runtime 中只为了 compat fallback 存在的回退路径
- [x] 删除客户端里只为旧协议 / 旧 UI 结构存在的兼容逻辑
- [x] 每删完一批，就补最小 next 主链验证

## 7. 收口服务端主链

对应任务文档：

- [06 服务端主链收口](./06-server-mainline-refactor.md)

- [x] 继续拆 `packages/server/src/runtime/world/world-runtime.service.ts`
- [x] 继续拆 `packages/server/src/network/world.gateway.ts`
- [x] 继续拆 `packages/server/src/network/world-sync.service.ts`
- [x] 继续拆 `packages/server/src/network/world-projector.service.ts`
- [x] 把 tick 内状态写入口继续收束
- [x] 把玩家、地图、战斗、掉落、交互写路径继续分责
- [x] 明确哪些 GM 操作必须走 runtime queue
- [x] 明确哪些 GM 操作允许直改持久态
- [x] 把玩家从登录到进入世界到持久化的主链整理成单路径

补充说明：登录到进入世界的单路径已基本收口，auth/bootstrap residual 已不再是当前 batch-5 的主阻塞；`token_seed -> native` 的 bootstrap-owned snapshot recovery / required normalization 仅保留为已知残余语义，不再决定 `world-runtime` 主链收口顺序。
本轮继续把 `world-runtime.service.ts` 的 `getPlayerView()` 与 loot window 只读拼装下沉到 `WorldRuntimePlayerViewQueryService`：`buildLootWindowSyncState()` 在主服务里只再保留一个薄编排入口，先过读侧合法性检查，再准备容器状态，最后读取已准备好的 loot window 来源；但 `world-runtime` 章节整体仍未收口。
本轮随后再把 `buildContextActions(view)` 下沉到 `WorldRuntimeContextActionQueryService`：`refreshPlayerContextActions()` 继续只保留解析 `view` 与 `setContextActions(...)` 的薄 facade，portal / NPC / `npc_quests:*` / shop / breakthrough / craft 入口与静态 toggle 的只读组装从主服务移出，并补跑 `world-runtime-context-actions-smoke`、`smoke-suite --case runtime` 与 `verify:replace-ready`；但 `world-runtime` 章节整体仍未收口。
本轮继续再把 `buildQuestListView(playerId, _input)` 的最终 `{ quests }` payload 组装下沉到 `WorldRuntimeQuestQueryService`：`world-runtime.service.ts` 仍保留 `getPlayerLocationOrThrow()` 与 `refreshQuestStates()` 前置，再委托给 query service 返回 quest list view，并补跑 `world-runtime-quest-list-view-smoke`、`smoke-suite --case progression` 与 `verify:replace-ready`；但 `world-runtime` 章节整体仍未收口。
本轮继续把 `buildNpcShopView(playerId, npcIdInput)` 的“相邻 NPC 解析后构建 shop envelope”只读编排下沉到 `WorldRuntimeNpcShopQueryService`：`world-runtime.service.ts` 仍保留 `getPlayerLocationOrThrow()` 与 `npcId` 归一/空值校验，再委托给 query service 处理相邻 NPC 解析与 envelope 拼装，并补跑扩充后的 `world-runtime-npc-shop-smoke` 与 `verify:replace-ready`；但 `world-runtime` 章节整体仍未收口。
本轮继续把 `validateNpcShopPurchase(playerId, npcId, itemId, quantity)` 的“相邻 NPC 解析后进入购买前校验”只读编排下沉到 `WorldRuntimeNpcShopQueryService`：`world-runtime.service.ts` 现只保留对 query service 的薄委托，`validatePurchaseForNpc()` 的实际校验规则继续留在 query service 内部，`resolveAdjacentNpc()` 的 access ownership 继续留在 `WorldRuntimeNpcAccessService`，并补跑扩充后的 `world-runtime-npc-shop-smoke` 与 `verify:replace-ready`；但 `world-runtime` 章节整体仍未收口。
本轮继续把 `buildNpcQuestsView(playerId, npcIdInput)` 的 query tail 下沉到 `WorldRuntimeQuestQueryService`：`world-runtime.service.ts` 仍保留 `getPlayerLocationOrThrow()`、`npcId` 归一/空值校验与 `refreshQuestStates()` 前置，再委托给 query service 处理相邻 NPC 解析与 NPC quest envelope 组装，并补跑扩充后的 `world-runtime-quest-list-view-smoke`、`world-runtime-npc-quest-write-smoke` 与 `verify:replace-ready`；但 `world-runtime` 章节整体仍未收口。
在 batch-4 query/facade 收口已基本榨干后，本轮转入 batch-5 ownership seam：`pendingCommands` 现已由 `WorldRuntimePendingCommandService` 真正持有，`world-runtime.service.ts` 不再暴露裸 `pendingCommands` getter，主服务与 navigation / auto-combat / npc-shop / npc-quest / player-combat 都改成走显式 queue API，并补跑新的 `world-runtime-pending-command-smoke`、受影响的 NPC queue smokes 与 `verify:replace-ready`；但 `world-runtime` 章节整体仍未收口。
本轮继续把 batch-5 ownership seam 推进到 `playerLocations`：`WorldRuntimePlayerLocationService` 现已真正持有玩家实例索引，`world-runtime.service.ts` 不再暴露裸 `playerLocations` getter，主服务与 transfer / respawn / movement / npc-access / auto-combat / player-view / monster-action / GM queue 都改成走显式 location API，loot-container 的 active viewer 检查与 instance-tick / system-command 编排也不再透传 raw `playerLocations` Map，并补跑 `world-runtime-player-location-smoke`、`world-runtime-transfer-smoke`、`world-runtime-npc-access-smoke`、`world-runtime-movement-smoke`、`world-runtime-instance-tick-orchestration-smoke`、`smoke:runtime`、`smoke:gm-next`、根级 `pnpm build` 与 `pnpm verify:replace-ready`；但 `world-runtime` 章节整体仍未收口。
本轮继续把 batch-5 ownership seam 推进到 `instances`：`WorldRuntimeInstanceStateService` 现已真正持有实例注册表，`world-runtime.service.ts` 不再暴露裸 `instances` getter，并补齐 `getInstanceRuntime()` / `setInstanceRuntime()` / `listInstanceRuntimes()` / `listInstanceEntries()` / `getInstanceCount()` facade；`WorldRuntimeInstanceQueryService`、`WorldRuntimePlayerViewQueryService`、movement / transfer / npc-access / auto-combat / respawn / GM queue / monster-action / instance-tick / system-command 也都改成走显式 instance accessor，`WorldRuntimeLootContainerService.advanceContainerSearches()` 不再接 raw registry object。新增 `world-runtime-instance-state-smoke`，并同步更新 `world-runtime-transfer-smoke`、`world-runtime-npc-access-smoke`、`world-runtime-movement-smoke`、`world-runtime-instance-tick-orchestration-smoke` 到新的 accessor shape；本轮验证补跑 `smoke:world-runtime-instance-state`、上述 focused smokes、`smoke:runtime`、`smoke:gm-next` 与 `pnpm --filter @mud/server-next build`。
本轮继续把 batch-5 orchestration seam 推进到 `player/system enqueue`：`WorldRuntimePlayerCommandEnqueueService` 现已承接玩家命令入队前的目标归一化、payload clone、技能存在性校验与 pending-command handoff，`WorldRuntimeSystemCommandEnqueueService` 现已承接 system/GM 命令入队前的实例/玩家校验、坐标/roll/amount 归一化与 GM queue handoff；`world-runtime.service.ts` 的 20 余个 enqueue 方法已统一退为 facade，并补跑 `world-runtime-player-command-enqueue-smoke`、`world-runtime-system-command-enqueue-smoke` 与 `smoke-suite --case runtime --case combat --case player-respawn`；但 `world-runtime` 章节整体仍未收口。
本轮继续把 batch-5 orchestration seam 推进到 `player command dispatch + combat outcome`：`WorldRuntimePlayerCommandService` 现已从纯 switch helper 收成 injected orchestration service，`world-runtime.service.ts` 不再拼装那一大段 `dispatchPlayerCommand()` deps object；同时新增 `WorldRuntimePlayerCombatOutcomeService` 承接 `damage/kill/defeat/pending-respawn/respawn` facade，并让 `world-runtime-system-command.service.ts` 不再分别直接依赖 `WorldRuntimePlayerCombatService` 与 `WorldRuntimeRespawnService`。本轮验证已补跑 `world-runtime-player-command-smoke`、`world-runtime-player-combat-outcome-smoke` 与 `smoke-suite --case runtime --case combat --case player-respawn`；但 `world-runtime` 章节整体仍未收口。
本轮同时回推 `world.gateway.ts` 的残余 glue：新增 `WorldGatewayAttrDetailHelper` 承接 `AttrDetail` bonus / numeric breakdown 计算，`world-gateway-read-model.helper.ts` 不再直接持有那段大块派生逻辑；同时新增 `WorldGatewayClientEmitHelper` 承接 `emitNext* / flushMarketResult / broadcastSuggestions` 的 next markProtocol 与统一发包边界。验证已补跑 `world-gateway-attr-detail-helper-smoke`、`world-gateway-client-emit-helper-smoke` 与 `smoke-suite --case session --case runtime`；`world.gateway.ts` 仍未完全关账，但 gateway 残余职责已继续收窄。
本轮继续把 `world.gateway.ts` 的剩余守卫和会话侧状态 seam 收口：新增 `WorldGatewayGuardHelper` 承接 readiness/player/gm guard，新增 `WorldGatewaySessionStateHelper` 承接 market subscriber/request cache 与 disconnect cleanup；同时各个 `world-gateway-*.helper.js` 已改为直接依赖 `gatewayGuardHelper` / `gatewayClientEmitHelper`，`world.gateway.ts` 里原先那批 `require* / emitNext* / flushMarketResult / broadcastSuggestions` facade 已删掉。验证已补跑 `smoke:world-gateway-guard-helper`、`smoke:world-gateway-session-state-helper`、`smoke:world-gateway-client-emit-helper` 与 `smoke-suite --case session --case runtime`；`world.gateway.ts` 仍未完全关账，但剩余职责已经进一步收窄到 `@SubscribeMessage` 入口和少量 glue。
本轮继续把 `world-sync.service.ts` 的首包/增量附加同步 seam 收成独立状态拥有者：新增 `WorldSyncAuxStateService`，接管 `nextAuxStateByPlayerId`、`emitNextInitialSync()`、`emitNextDeltaSync()` 与 bootstrap / map-static / realm / loot-window / threat 编排；`world-sync.service.ts` 不再自持 next aux cache，也不再直接拼那段附加同步细节。验证已补跑 `world-sync-aux-state-smoke` 与 `smoke-suite --case session --case runtime`；`world-sync.service.ts` 仍未完全关账，但首包/增量附加状态边界已继续收窄。
本轮继续把 `world-sync.service.ts` 的剩余同步骨架再压两层：新增 `WorldSyncEnvelopeService` 承接主 envelope 生成、combat effects 附加、movement debug log 和 projector cache clear；新增 `WorldSyncPlayerStateService` 承接 bootstrap self state、bonus 投影、equipment/action/realm 只读转换，并让 `WorldSyncAuxStateService` 直接依赖这条 player-state 边界而不是回调主服务。验证已补跑 `world-sync-envelope-smoke`、`world-sync-player-state-smoke`、`world-sync-aux-state-smoke` 与 `smoke-suite --case session --case runtime`；`world-sync.service.ts` 已压到 `309` 行，但 `world-sync` 章节整体仍未完全关账。

本轮继续把 `world-runtime.service.ts` 的 lifecycle 骨架收成独立 owner：新增 `WorldRuntimeLifecycleService` 承接公共实例 bootstrap、地图持久化恢复与整体验证前 rebuild，`world-runtime.service.ts` 现在只再保留对这三段生命周期编排的薄委托。验证已补跑 `smoke:world-runtime-lifecycle` 与 `smoke:runtime`；`world-runtime.service.ts` 已压到 `1379` 行，但 `world-runtime` 章节整体仍未完全关账。
本轮继续把 `world-runtime-system-command.service.ts` 里还混着的 GM 分发收成独立 owner：新增 `WorldRuntimeGmSystemCommandService` 承接 `gmUpdatePlayer / gmResetPlayer / gmSpawnBots / gmRemoveBots` 的 deps 收口与分发，`world-runtime-system-command.service.ts` 现在只再保留 monster/player system-command 路由和对 GM seam 的单点委托。验证已补跑 `smoke:world-runtime-gm-system-command`、`smoke:world-runtime-system-command` 与 `smoke:runtime`；`world-runtime.service.ts` 仍是 `1379` 行，但 `system-command` 边界已继续收窄。
本轮继续把 `world-runtime.service.ts` 里仍混放的世界级 persistence/frame 外壳抽成独立 owner：新增 `WorldRuntimePersistenceStateService` 承接 dirty map 检测、快照构造和落盘回标，新增 `WorldRuntimeFrameService` 承接 `tickAll / advanceFrame / recordSyncFlushDuration`；验证已补跑 `smoke:world-runtime-persistence-state`、`smoke:world-runtime-frame` 与 `smoke:runtime`。`world-runtime.service.ts` 已继续压到 `1368` 行，但 `world-runtime` 章节整体仍未完全关账。
本轮继续把 `world-runtime.service.ts` 里剩余的世界级 access/query/utility seam 抽成独立 owner：新增 `WorldRuntimeWorldAccessService` 承接当前 tick、runtime summary、public instance、默认复生地图、路线查询、玩家/实例只读访问与中断/取消命令 facade；同时新增 `WorldRuntimePlayerSessionService` 承接 `connectPlayer / disconnectPlayer / removePlayer`。验证已补跑 `smoke:world-runtime-world-access`、`smoke:world-runtime-player-session` 与 `smoke:runtime`；`world-runtime.service.ts` 已继续压到 `1256` 行，但 `world-runtime` 章节整体仍未完全关账。
本轮继续把 `world-runtime.service.ts` 里剩余的高层读侧 facade 与世界级 tick/dispatch facade 再压两层：新增 `WorldRuntimeReadFacadeService` 承接 detail/shop/quest/context/loot-window 这组 read envelope facade，新增 `WorldRuntimeTickDispatchService` 承接 navigation/auto-combat materialize、pending/system dispatch、monster action apply、combat effect push、notice queue 与安全区攻击校验。验证已补跑 `smoke:world-runtime-read-facade`、`smoke:world-runtime-tick-dispatch` 与 `smoke:runtime`；`world-runtime.service.ts` 已继续压到 `1181` 行，但 `world-runtime` 章节整体仍未完全关账。
本轮继续把 `world-runtime.service.ts` 里剩余的高层写侧 gameplay facade 与 quest/NPC runtime facade 再压两层：新增 `WorldRuntimeGameplayWriteFacadeService` 承接 combat-command、item-ground、progression、alchemy、enhancement、NPC quest write、monster-system-command 与 player-combat-outcome 上方那层 `dispatch* / handle* / processPendingRespawns()` facade，新增 `WorldRuntimeQuestRuntimeFacadeService` 承接 quest state 与 NPC access 的运行时 facade。验证已补跑 `smoke:world-runtime-gameplay-write-facade`、`smoke:world-runtime-quest-runtime-facade` 与 `smoke:runtime`；`world-runtime.service.ts` 已继续压到 `1189` 行，但 `world-runtime` 章节整体仍未完全关账。
本轮继续把 `world-runtime.service.ts` 里剩余的 state/instance 薄 facade 再压两层：新增 `WorldRuntimeStateFacadeService` 承接 `pendingCommands`、`playerLocations`、`instance registry` facade 与 persistence/frame/lifecycle 薄委托，新增 `WorldRuntimeInstanceReadFacadeService` 承接地图模板、实例、tile/combat 只读 facade 和 `createInstance()`。验证已补跑 `smoke:world-runtime-state-facade`、`smoke:world-runtime-instance-read-facade` 与 `smoke:runtime`；`world-runtime.service.ts` 已继续压到 `1173` 行，但 `world-runtime` 章节整体仍未完全关账。
本轮继续把 `world-runtime.service.ts` 里剩余的命令入口 facade 再压一层：新增 `WorldRuntimeCommandIntakeFacadeService` 承接 navigation enqueue、action execution、player-command enqueue、NPC quest/shop enqueue 与 system-command enqueue 这一整簇 thin wrapper。验证已补跑 `smoke:world-runtime-command-intake-facade` 与 `smoke:runtime`；`world-runtime.service.ts` 当前为 `1177` 行，虽然没有继续线性下降，但剩余职责已进一步集中到 world-level getter/barrel 与少量薄编排。 
本轮继续把 `06` 的收口口径固定成可执行 proof：删除 `world.gateway.ts` 中已经只剩历史意义的 `handleGm* / execute*` 中转壳，删除 `world-sync.service.ts` 底部残留的 dead diff helper，并新增 `packages/server/src/tools/check-mainline-boundaries.js`。这条 proof 现已接入 `@mud/server-next verify / verify:with-db / verify:replace-ready / verify:proof:with-db / verify:replace-ready:with-db`，默认检查 `world-runtime.service.ts <= 1200`、`world.gateway.ts <= 1400`、`world-sync.service.ts <= 180`、`world-projector.service.ts <= 1500`，同时确认 gateway 不再自持 raw market state 或 execute/GM 中转壳、sync 不再自持 aux cache 或遗留 diff helper、runtime 不再自持 `pendingCommands / playerLocations / instances` raw owner。当前基线已固定为：`world-runtime.service.ts` `1177` 行、`world.gateway.ts` `1385` 行、`world-sync.service.ts` `157` 行、`world-projector.service.ts` `1484` 行；`06` 主链口径对应的 world/gateway/sync/projector 收口项因此全部勾掉。 

补充说明：server 全面 TS 化已开始按职责簇推进。本轮先迁移 bootstrap/config 入口簇：`packages/server/src/config/env-alias.js -> env-alias.ts`、`packages/server/src/config/server-cors.js -> server-cors.ts`、`packages/server/src/main.js -> main.ts`，不改 next 主链行为、协议或 GM/admin 语义；`pnpm --filter @mud/server-next compile` 与 `pnpm --filter @mud/server-next smoke:readiness-gate` 已实跑通过。当前 `packages/server/src` 还剩 `278` 个 `.js` 真源，`app.module.js`、`http/next-http.registry.js` 与 `http/next/*` 仍暂留在下一批 HTTP/bootstrap 簇内统一迁移，避免本轮跨太多不相干链路。

补充说明：本轮继续把 HTTP/bootstrap 簇整体迁成 TS，统一收掉 `packages/server/src/app.module.js`、`packages/server/src/http/next-http.registry.js` 与 `packages/server/src/http/next/*.js` 这条链路上的真源 `.js`。本轮完成迁移的文件包括：`next-gm-contract.js -> next-gm-contract.ts`、`next-gm.constants.js -> next-gm.constants.ts`、`next-auth-rate-limit.service.js -> next-auth-rate-limit.service.ts`、`next-gm-auth.guard.js -> next-gm-auth.guard.ts`、`next-player-auth-store.service.js -> next-player-auth-store.service.ts`、`next-player-auth.service.js -> next-player-auth.service.ts`、`next-managed-account.service.js -> next-managed-account.service.ts`、`next-gm-map-query.service.js -> next-gm-map-query.service.ts`、`next-gm-editor-query.service.js -> next-gm-editor-query.service.ts`、`next-gm-suggestion-query.service.js -> next-gm-suggestion-query.service.ts`、`next-gm-map-runtime-query.service.js -> next-gm-map-runtime-query.service.ts`、`next-gm-mail.service.js -> next-gm-mail.service.ts`、`next-database-restore-coordinator.service.js -> next-database-restore-coordinator.service.ts`、`next-gm-state-query.service.js -> next-gm-state-query.service.ts`、`next-gm-player.service.js -> next-gm-player.service.ts`、`next-gm-world.service.js -> next-gm-world.service.ts`、`next-gm-admin.service.js -> next-gm-admin.service.ts`、`next-auth.controller.js -> next-auth.controller.ts`、`next-account.controller.js -> next-account.controller.ts`、`next-gm-auth.controller.js -> next-gm-auth.controller.ts`、`next-gm.controller.js -> next-gm.controller.ts`、`next-gm-admin.controller.js -> next-gm-admin.controller.ts`、`packages/server/src/http/next-http.registry.js -> next-http.registry.ts`、`packages/server/src/app.module.js -> app.module.ts`。同轮还同步把 `packages/server/src/tools/audit/next-legacy-boundary-audit.js` 里指向 `app.module.js` 的审计路径改到 `app.module.ts`，并把 `next-gm-admin.service.ts`、`next-http.registry.ts`、`app.module.ts` 清理为真实 ES import/export 风格 TS 源码，不保留编译产物式 `require(...)` 残余。验证已补跑 `pnpm --filter @mud/server-next compile`、`pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case readiness-gate --case next-auth-bootstrap --case gm-next` 并通过；当前 `packages/server/src` 还剩 `254` 个 `.js` 真源。`docs/next-plan/06-server-mainline-refactor.md` 本轮无新增主链收口结论，因此不单独改动；下一批继续按职责簇选择新的 next 主链 `.js -> .ts` 目标。

补充说明：本轮继续以最低风险职责簇推进 server TS loop，已把 `packages/server/src/auth/account-validation.js -> account-validation.ts`、`packages/server/src/auth/password-hash.js -> password-hash.ts` 与 `packages/server/src/auth/player-token-verify.js -> player-token-verify.ts` 一并收口，不扩到 `network` 的 token/bootstrap/session 主链，也不改 `runtime-gm-auth` 现有哈希实现。直接消费端仍维持原扩展名无关导入：`next-player-auth.service.ts`、`next-managed-account.service.ts`、`next-player-auth-store.service.ts` 无需改行为即可继续编译；`player-token-verify.ts` 随后已被 `world-player-token-codec.service.ts` 复用。验证已补跑两轮 `pnpm --filter @mud/server-next compile`，并在前两刀补跑 `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`，结果通过；auth 叶子簇收口后 `packages/server/src` 剩余手写 `.js` 真源基线为 `251`。

补充说明：本轮随后继续沿同一条 network/auth 最小链路推进，把 `packages/server/src/network/world-player-token-codec.service.js -> world-player-token-codec.service.ts` 收口，并复用 `packages/server/src/auth/player-token-verify.ts` 取代 codec 内部重复的 JWT 校验逻辑，不扩到 `world-player-token.service.js`、`world-player-auth.service.js` 与 session/bootstrap 编排。验证已补跑 `pnpm --filter @mud/server-next compile` 与 `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`，结果通过；codec seam 收口后 `packages/server/src` 剩余手写 `.js` 真源基线为 `250`。

补充说明：本轮继续把同职责 token/trace owner 收到 TS，已完成 `packages/server/src/network/world-player-token.service.js -> world-player-token.service.ts`，保持 `WorldPlayerTokenService`、`ensureAuthTraceState`、`recordAuthTrace`、`readAuthTrace` 与 `clearAuthTrace` 的导出面不变，同时把 `globalThis.__NEXT_AUTH_TRACE` 补成 TS 可检查的本地全局声明，不改 auth trace 汇总语义、玩家 token 拒绝原因与 bootstrap 证明链口径。验证已补跑 `pnpm --filter @mud/server-next compile`、`pnpm --filter @mud/server-next smoke:next-auth-bootstrap` 与该 TS 文件 `lsp_diagnostics`，结果通过；当前 `packages/server/src` 剩余手写 `.js` 真源基线更新为 `249`。

补充说明：本轮继续沿同一条 network/auth 最小链路把 `packages/server/src/network/world-player-auth.service.js -> world-player-auth.service.ts` 收口，保持 `loadNextPlayerIdentity()` / `authenticatePlayerToken()`、`token_seed` 保存与 persistedSource 守卫、`token_runtime` gate、`recordAuthTrace(...)` 的 payload 形状与 failure stage 不变；同时用 `@Inject(...) + 本地 port interface` 处理 TS 对 JS provider 注入类型的收束，不扩到 `world-player-source.service.js`、`player-identity-persistence.service.js`、`world-player-snapshot.service.js` 与 session/bootstrap 编排。验证已补跑既有 `pnpm --filter @mud/server-next compile` 与本轮重新执行的 `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`，结果通过；当前 `packages/server/src` 剩余手写 `.js` 真源基线更新为 `248`。

## 8. 收口客户端主链

对应任务文档：

- [07 客户端主链收口](./07-client-mainline-refactor.md)

- 当前口径：
  - 客户端当前阶段只要求完成 next 协议对接、Socket 事件消费收口和必要状态桥接
  - UI 视觉、交互细修、面板重构、patch-first 深挖、浅色/深色/手机样式回归都不作为当前 hard cut 阻塞项
  - 客户端 UI 由后续独立设计迭代处理，不纳入本轮 next 完整性判断
- 当前基线：
  - `packages/client/src/main.ts` `28` 行
  - `packages/client/src/main-app-composition.ts` `8` 行
  - `packages/client/src/main-app-runtime-assembly.ts` `7` 行
  - `packages/client/src/main-app-runtime-context.ts` `154` 行
  - `packages/client/src/main-app-panel-context.ts` `251` 行
  - `packages/client/src/main-app-runtime-owner-context.ts` `391` 行
  - `packages/client/src/main-app-bootstrap-runner.ts` `50` 行
  - `packages/client/src/network/socket.ts` `179` 行
  - `packages/client/src/network/socket-server-events.ts` `49` 行
  - `packages/client/src/network/socket-event-registry.ts` `57` 行
  - `packages/client/src/network/socket-lifecycle-controller.ts` `70` 行
  - `main-root-runtime-source.ts` 已接住 `myPlayer / latestEntities / latestEntityMap` 根状态 owner
  - `main-runtime-monitor-source.ts` 已直接依赖 `runtimeSender.sendPing(...)`，`SocketManager` 上对应薄委托已删除
  - `main-dom-elements.ts / main-frontend-modules.ts` 已接住 DOM 引用采集与前台资源创建
  - `main-app-composition.ts / main-app-runtime-assembly.ts / main-app-runtime-context.ts / main-app-panel-context.ts / main-app-runtime-owner-context.ts / main-app-bootstrap-runner.ts` 已把前台主链固定成六层入口
  - `socket-server-events.ts / socket-event-registry.ts / socket-lifecycle-controller.ts` 已把 socket 主链固定成事件分组、事件回调桶和生命周期三层 owner
- [x] 继续整理 `packages/client/src/main.ts`
- [x] 继续整理 `packages/client/src/network/socket.ts`
- [x] 继续整理地图相关协议状态边界
- [x] 检查 GM 页面、GM 世界查看器、地图编辑器是否都还要长期保留
- [x] 收口详情弹层、邮件、建议、任务、市场、设置等面板的状态来源
- [x] 明确哪些状态只能由 Socket 增量驱动
- [x] 明确哪些状态允许客户端本地派生缓存
- [x] `07` 章节完成定义已全部满足，剩余 UI 视觉/交互/终端适配项明确后置

## 9. 收口共享层

对应任务文档：

- [08 shared 与内容地图收口](./08-shared-content-and-map-cleanup.md)

- [x] 继续整理 `packages/shared/src/protocol.ts`
- [x] 继续整理 `packages/shared/src/types.ts`
- [x] 继续整理 `packages/shared/src/network-protobuf.ts`
- [x] 给新增协议字段补一致性检查
- [x] 给新增数值字段补完整性检查
- [x] 确保 shared 变更默认会被 audit / check 拦住

## 10. 内容与地图整理

对应任务文档：

- [08 shared 与内容地图收口](./08-shared-content-and-map-cleanup.md)

- [x] 重新标注哪些 `packages/server/data/content/*` 是玩法真源
- [x] 重新标注哪些数据是编辑器辅助产物
- [x] 检查地图文档、怪物包、任务、物品、功法之间的引用一致性
- [x] 检查 compose 地图、室内地图、传送点、NPC 锚点规范
- [x] 决定哪些客户端 generated 数据可以重做或删掉
- [x] 决定哪些客户端 generated 数据继续保留

## 11. 验证门禁收口

对应任务文档：

- [09 验证门禁与验收](./09-verification-and-acceptance.md)

- [x] 把 `local / with-db / acceptance / full / shadow-destructive` 继续固定为唯一门禁口径
- [x] 给“数据迁移完成”补一条迁移 proof 链
- [x] 跑通 `pnpm build`
- [x] 跑通 `pnpm verify:replace-ready`
- [x] 跑通 `pnpm verify:replace-ready:with-db`
- [x] 跑通 `pnpm verify:replace-ready:acceptance`
- [x] 跑通 `pnpm verify:replace-ready:full`
- [x] 确认这些门禁都以 next 主链为口径，不再默认证明 legacy 对齐
- [x] 固定 `doctor / acceptance / full` 的脚本与文档合同 proof

补充说明：

- 当前仓库已证明 `local` 与 `with-db` 都在本轮实跑通过。
- `acceptance` 已在本机 next shadow 上实跑通过。
- `full` 也已在本轮实跑通过。
- `shadow-destructive` 仍应以维护窗口与当前轮次实跑记录为准，不能沿用历史 `[x]` 口径。

## 12. legacy 归档收尾

对应任务文档：

- [10 legacy 归档与最终切换](./10-legacy-archive-and-cutover.md)

- [x] 列出仍然必须保留的 legacy 文件范围
- [x] 把不再需要的 legacy 入口从主文档和主流程中移除
- [x] 把 legacy 剩余价值收束为“查规则 / 查旧数据格式 / 迁移来源”
- [x] 更新顶层说明文档，明确当前仓库只有 next 是活跃主线
- [x] 固定 next cutover / readiness 的仓库内 proof
- [x] 固定 next cutover / preflight 的仓库内 proof
- [x] 固定 next cutover / operations 的仓库内 proof

## 13. 硬切完成定义

对应任务文档：

- [10 legacy 归档与最终切换](./10-legacy-archive-and-cutover.md)

- [x] `packages/*` 成为唯一活跃主线
- [x] legacy 数据可以稳定迁到 next
- [x] 玩家主链不再默认走 compat fallback
- [x] GM 关键面与必要管理面能闭环
- [x] 协议、运行时、UI 不再为了 legacy 对齐背额外复杂度
- [x] legacy 只剩归档和迁移参考价值
- [x] next 主线可以作为后续唯一开发入口
- [x] 验证门禁全部按 next 主链口径通过

## 14. 当前建议顺序

- [x] 先完成“必须迁移的数据清单”
- [x] 再补协议空洞和最外层 compat 删除
- [x] 再写一次性迁移脚本
- [x] 再做 server/client/shared 主链收口
- [ ] 最后完成 `10` 的真实切换前/切换后人工检查（本地 destructive proof 已补，真实生产/远程切换仍需按执行清单完成）
  - 当前已补逐步执行手册，剩余是实际环境里的人工执行与记录回写

## 15. server 全面 TS 化

对应任务文档：

- [11 server 全面 TS 化计划](./11-server-ts-migration-plan.md)

- 当前基线：
  - `packages/server/src` 剩余手写 `.js` 真源：`0` 个文件，`0` 行
  - `packages/server` 包内非 `dist` 手写 `.js`：`0` 个文件，`0` 行
  - 已完成 `main/config/bootstrap`、`app/http-next`、`auth` 与最小 `network token/auth` 链的 TS 化
  - `packages/server/src` 已不再残留兼容壳；根级环境解析改为 [scripts/server-next-env-alias.js](/home/yuohira/mud-mmo-next/scripts/server-next-env-alias.js:1)
- [x] 继续迁移 `packages/server/src` 剩余 `.js` 真源
- [x] 优先完成第 1 批 `health/common/debug/logging` 小型叶子簇
- [x] 再推进第 2 批 `network session/bootstrap` 残余簇
- [x] 下一批优先推进第 3 批 `persistence` 整簇
- [x] 再推进第 4 批 `content/map/runtime` 基础只读簇
- [x] 顺手迁移 `runtime-http-access.guard.js` 与 `runtime-maintenance.service.js`
- [x] 再推进第 6 批 `runtime` 非 world 辅助域
- [x] 再推进第 7 批 `runtime player / instance / world` 主链前半段
- [x] 再收掉第 7 批剩余 `runtime/world` 主链
- [x] 再推进第 5 批 `network gateway / sync / projector` 残余簇
- [x] 下一批优先推进第 8 批 `tools / smoke / audit / migration` 链，并顺手带走 `runtime/suggestion` 叶子
- [x] 再推进第 7 批 `runtime player / instance / world` 主链前半段
- [x] 再推进第 5 批 `network gateway / sync / projector` 残余簇
- [x] 再收掉第 7 批剩余 `runtime/world` 主链
- [x] 下一批优先推进第 9 批最终收尾，迁掉 `migrate-next-mainline-once.js` 与 `env-alias.js`
- [x] 最终移除 `env-alias.js` 兼容壳并清零 `packages/server/src` 手写 `.js`
- [ ] 下一阶段逐步去掉迁移期 `// @ts-nocheck` 并补强 server TS 类型约束

## 16. 后续专项通用化规划

说明：

- 这一组不是当前 `replace-ready` 的立即阻塞项。
- 这组文档用于承接下一阶段你明确指定的“通用化”方向，避免它们继续散在口头结论里。

对应专题文档：

- [12 气机资源统一化规划](./12-qi-resource-unification.md)
- [13 敌我判定规则统一化规划](./13-combat-relation-rules-unification.md)
- [14 技艺活动框架统一化规划](./14-technique-activity-framework.md)
- [15 地图地块特征统一化规划](./15-map-tile-feature-unification.md)

- [ ] 先把 `qi / craft-skill / craft-duration / craft-success` 这类 shared 纯函数合同固定下来
- [ ] 再收口手动技能 / 普攻 / 自动战斗的统一敌我关系判定
- [ ] 再把地块单值 `aura` 升成通用 tile resource runtime
- [ ] 最后把炼丹 / 强化 / 采集收口为统一技艺活动框架

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

- [ ] 以 `world-session-bootstrap.service.js` 为中心，把 `gateway -> auth -> snapshot -> session binding -> init sync` 串成唯一主链
- [ ] 明确 `world-player-auth.service.js` 只负责：
  - token -> identity
  - persistedSource 归一
  - migration identity 收口
- [ ] 明确 `world-player-snapshot.service.js` 只负责：
  - next snapshot load
  - migration snapshot 补种
  - next-only miss contract
- [ ] 把 session reuse / detached resume 策略固定在 `world-session-bootstrap.service.js`
- [ ] 避免 bootstrap 期间再从其它 service 临时兜底身份或快照

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

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next smoke:next-auth-bootstrap`
- `pnpm --filter @mud/server-next smoke:session`
- `pnpm --filter @mud/server-next smoke:player-recovery`

### 第 3 批：把同步与投影拆成三层

- [ ] 把 `world-sync.service.js` 收成“同步编排层”
- [ ] 把 `world-projector.service.js` 收成“投影 / diff / patch 构建层”
- [ ] 把 `world-sync-protocol.service.js` 固定为“协议发送层”
- [ ] 明确区分：
  - 首包静态/低频静态
  - 动态 world/self/panel delta
  - 详情/按需查询
  - 附加同步（quest / loot / threat / minimap）
- [ ] 避免 `sync` 继续同时承担：
  - capture/diff
  - 状态缓存
  - 发包
  - 各类附加数据组装

优先先拆的冷路径：

- quest sync
- loot window sync
- threat arrow sync
- minimap marker patch

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

- [ ] 以 `next-gm-contract.js`、`next-gm-player.service.js`、`world-gm-socket.service.js` 为准，明确 GM 改动边界
- [ ] 必须继续走 runtime queue 的：
  - `position`
  - 机器人 spawn/remove
  - runtime 在线玩家 reset
- [ ] 允许直接改持久态的：
  - `basic`
  - `realm`
  - `buffs`
  - `techniques`
  - `items`
  - `quests`
  - `mail`
  - `persisted`
- [ ] 不允许在 gateway / controller 里散落第三种隐式写路径

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next smoke:gm-next`
- `pnpm --filter @mud/server-next smoke:gm-database`

## 收口检查表

- [ ] `world.gateway.js` 不再自己做大段业务处理
- [ ] `world-session-bootstrap.service.js` 成为登录到入图的唯一编排入口
- [ ] `world-sync.service.js` 不再自己做大段 capture/diff 细节
- [ ] `world-projector.service.js` 不再自己承担 socket 发包
- [ ] `world-runtime.service.js` 不再同时持有查询、展示、热路径、GM queue 全部细节
- [ ] GM 写路径只剩 runtime queue 或 direct persistence 两类
- [ ] 玩家主链不再出现多处兜底身份/快照/同步分支

## 本阶段不做的事

- 不在这里顺手继续做 `05` 的 compat 删除，只消费 `05` 已经收出来的边界。
- 不把 `world-runtime.service.js` 机械切成 `part1/part2/part3`。
- 不在重构时改协议含义、面板职责、tick 规则。
- 不因为“更现代”而把当前稳定的同步 envelope 全部推倒重写。

## 完成定义

- [ ] 服务端主链按职责拆清
- [ ] 玩家核心路径没有“又从 A 走，又从 B 兜底”的双路径

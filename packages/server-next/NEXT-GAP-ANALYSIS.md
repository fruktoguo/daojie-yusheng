# server-next 当前缺口分析

更新时间：2026-04-03

## 当前状态

### 已完成的关键进度

- `pnpm verify:server-next` 当前可通过。
- `pnpm --filter @mud/server-next audit:next-protocol` 当前可通过。
- `world-sync.service` 已按连接协议分流：
  - `protocol=next` 不再向客户端发送高频 legacy 同步事件
  - `protocol=legacy` 仍保留旧事件
- `client-next` 这边已经完成一轮真正的 next 收口：
  - bootstrap 改成 `handleBootstrap / applyBootstrap`
  - `WorldDelta / SelfDelta / PanelDelta` 主链直接消费 next
  - `sendAction` 不再 fallback 到 `C2S.Action`
  - `socket.ts` 已不再监听任何 legacy 事件名
- `shared-next` / `shared` 的 `NEXT_S2C_Bootstrap` 已从 `S2C_Init` 类型别名拆成独立 next 类型。
- `shared-next` / `shared` 中这批 next 低频 payload 也已改成独立 next 接口：
  - `NEXT_S2C_LootWindowUpdate`
  - `NEXT_S2C_QuestNavigateResult`
  - `NEXT_S2C_RedeemCodesResult`
  - `NEXT_S2C_GmState`
  - `NEXT_S2C_MapStatic`
  - `NEXT_S2C_Realm`
- `WorldSessionService` 的 `Kick` 已不再冗余双发 legacy `S2C.Kick`。
- `WorldSyncService` 已开始按协议拆开执行：`protocol=next` 连接不再每 tick 进入整套 legacy delta 计算，而是只补 next 仍需要的 `MapStatic / Realm / LootWindow` 同步。
- `WorldSyncService` 的 next 增量 `MapStatic` 路径已不再为可见标记计算整张 legacy 可视瓦片矩阵，改成只构建可见坐标 key 集合，先收掉一段 hot path 的 legacy 投影开销。
- `WorldSyncService` 的 next `Bootstrap / MapStatic` 首包路径已不再直接调用：
  - `buildLegacyVisibleTiles`
  - `buildLegacyRenderEntities`
  - `buildLegacyMinimapLibrary`
  这批 legacy 包装 helper 已从 `world-sync` 内部删除，next/legacy 同步路径统一直接走中性 helper。
- `WorldSyncService` 的时间状态主计算也已切到中性 helper：
  - `buildGameTimeState`
  - `normalizeMapTimeConfig`
  - `resolveDarknessStacks`
  `world-sync` 内部旧的 `buildLegacyTimeState / normalizeLegacyMapTimeConfig / resolveLegacyDarknessStacks` 包装也已删除。
- `loot window` 这一条链已新增 next 语义包装入口：`openLootWindow / buildLootWindowSyncState / getLootWindowTarget` 已成为同步层与 runtime 的主调用名，本轮又继续删掉了一批零引用 legacy 包装。
- `WorldSyncService` 里 `MinimapMarkers / VisibleMinimapMarkers / GameTimeState / ThreatArrows / TickPayload / AttrUpdate / InventoryUpdate / EquipmentUpdate / TechniqueUpdate / ActionsUpdate` 已补齐中性 helper 主名，next 主路径不再继续直接挂 `buildLegacy*` 名称；其中 `Inventory / Equipment / Technique / Actions` 这四组也已经反转为“中性名是主实现”。
- `WorldSyncService` 的 next `Bootstrap.self` 投影也已切到中性 helper：
  - `buildAttrBonuses`
  - `buildEquipmentRecord`
  - `toTechniqueState`
  - `toActionDefinition`
  - `toItemStackState`
  - `cloneTechniqueSkill`
  旧的 `buildLegacyAttrBonuses / buildLegacyEquipmentRecord / toLegacyTechniqueState / toLegacyActionDef / toLegacyItemStack / cloneLegacyTechniqueSkill` 这些本地包装也已从 `world-sync` 删除。
- `WorldSyncService` 的动作 ID 兼容映射也已抽到中性 helper：`normalizeActionEntry` 成为 next `Bootstrap.self.actions` 与 legacy action diff 的共同主入口，旧的 `toLegacyActionEntry` 本地包装也已删除。
- `WorldSyncService` 的 legacy delta 内核又收了一层中性主名：
  - `captureSyncSnapshot`
  - `buildTickPayload`
  - `diffRenderEntities`
  旧的 `captureLegacySnapshot / buildLegacyTickPayload / diffLegacyRenderEntities` 本地包装也已从 `world-sync` 删除。
- `WorldSyncService` 的 legacy 同步缓存和属性投影主名也继续收口：
  - `syncStateByPlayerId`
  - `buildAttrUpdate`
  - `captureAttrState`
  旧的 `legacyStateByPlayerId / buildLegacyAttrUpdate / captureLegacyAttrState` 命名已经退出主路径，其中本地包装也已删除。
- `WorldSyncService` 的 legacy 初始/增量同步方法内部也不再直接调用：
  - `buildLegacyVisibleTiles`
  - `buildLegacyRenderEntities`
  - `buildLegacyMinimapLibrary`
  这些包装 helper 已经从本文件移除，主路径统一走中性 helper。
- `WorldSyncService / PlayerRuntimeService / WorldRuntimeService / LegacyGatewayCompatService` 的 `loot window` 旧入口也继续收口：`emitLegacyLootWindow / openLegacyLootWindow / clearLegacyLootWindow / buildLegacyLootWindow` 这批零引用包装已删除，调用面统一走中性入口。
- `WorldSyncService / WorldTickService` 对地图时间与 tick 速度的读取也补上了中性入口，主逻辑改走：
  - `mapRuntimeConfigService`
  - `getMapTimeConfig`
  - `getMapTickSpeed`
  不再在主路径里直接写 `legacyGmHttpCompatService.getMapTimeConfig/getMapTickSpeed`。
- `WorldSyncService` 内部 next/legacy 双发判定也已从分散的 `shouldEmitNextPayload / shouldEmitLegacyPayload` 收口为单一协议分流入口，减少重复协议判断。
- `PlayerRuntimeService` 已补 next 语义主入口：
  - `getPendingLogbookMessages`
  - `queuePendingLogbookMessage`
  - `acknowledgePendingLogbookMessages`
  - `deferVitalRecoveryUntilTick`
  外部调用已开始从旧名迁到新名。
- `PlayerRuntimeService` 的玩家运行时真源已继续收口：
  - `legacyLootWindow` -> `lootWindowTarget`
  - `legacyCompat.pendingLogbookMessages` -> `pendingLogbookMessages`
  - `legacyCompat.suppressVitalRecoveryUntilTick` -> `vitalRecoveryDeferredUntilTick`
  - `legacyBonuses` -> `runtimeBonuses`
  - 持久化与 legacy 导入仍兼容回读旧字段

### 当前粗略完成度

- `client-next` 主链独立度：约 `80% - 85%`
- `server-next` 独立化：约 `50% - 60%`
- 想整体移除仓库中的 `legacy`：约 `25% - 35%`

### 需要避免的误判

`server-next` 现在已经能稳定支撑 next 前台继续迭代，但它仍不是一条已经摆脱 legacy 的独立服务栈。

当前真正没拆掉的，已经主要收缩到下面四层：

- next 登录 / 会话 / bootstrap 仍走 legacy session/auth
- world sync 仍在大量构建 legacy 投影视图与缓存
- AppModule 仍直接挂 legacy HTTP / GM 控制器
- runtime / persistence 仍正式保存 legacy 状态字段

## 现在最大的阻碍在哪里

## P1. next 登录与 bootstrap 仍依赖 legacy session/auth

当前 `WorldGateway` 的连接处理、Hello、GM token 校验、玩家鉴权、bootstrap、快照装载，都还压在：

- `LegacySessionBootstrapService`
- `LegacyAuthService`
- `LegacyGatewayCompatService`

这意味着 next 会话边界并没有真正独立。

## P1. world sync 仍在维护大块 legacy 投影与缓存

当前 `WorldSyncService` 虽然已经把大量主实现收口到中性 helper，但 legacy 同步支路本身仍完整保留，主要体现在：

- `emitLegacyInitialSync / emitLegacyDeltaSync`
- `protocol === 'legacy'` 的协议分流
- `LegacyGmHttpCompatService` 这类 compat 注入仍在
- legacy compat 目录与少量 runtime 逻辑里仍有部分 `emitLegacy* / buildLegacy* / resolveLegacy*` 名称

这说明 next 高频分流虽然已经完成，但 legacy socket 同步支路还没有被真正外置或拆空。

## P1. runtime 真源仍保留 legacy 玩家状态

当前 runtime / persistence 的玩家真源字段名已基本收口到 next / 中性语义：

- `lootWindowTarget`
- `pendingLogbookMessages`
- `vitalRecoveryDeferredUntilTick`
- `runtimeBonuses`

旧快照和旧库导入仍兼容回读 `legacyCompat.*` / `legacyBonuses`，但 runtime 真源字段名本身已不再继续使用这些 legacy 命名。

这类字段如果不拆，legacy 就仍然是运行时数据模型的一部分，而不是单纯外层兼容层。

## P2. 后台 HTTP / GM 面仍直接挂在 legacy 模块上

当前 `AppModule` 仍直接注册：

- legacy account/auth controller
- legacy GM auth/controller
- legacy GM admin controller
- legacy redeem code controller

如果后续决定“玩家前台先独立，后台兼容面保留”，这一层可以暂时不动；但不能再继续把它反向渗回 runtime 真源。

## 现在已经不是主要阻碍的内容

下面这些在当前阶段已经明显弱化，不再是主要卡点：

- 高频 legacy 同步双发给 next 客户端
- client-next 继续监听 legacy 事件名
- 动作发送仍 fallback 到 `C2S.Action`
- bootstrap 仍通过 `handleInit(S2C_Init)` 进入客户端主入口

也就是说，前台链路已经基本收口，当前该处理的是 server 内核债。

## 建议的下一阶段顺序

### 第一阶段：继续让 next 同步内核脱离 legacy 投影

建议顺序：

1. 继续清理 `WorldSyncService` 的 legacy payload builder / compat 壳，逐步把 legacy socket 分支压缩到更薄的外层适配层。
2. 把 loot window / pending logbook / bonuses 这批 legacy runtime 状态，从“next 主入口 + legacy 真源字段”继续推进到真正的 next 命名真源。
3. 再决定登录 / auth / GM / HTTP 是保留外层 compat 壳，还是继续 next-native 化。

### 第二阶段：再处理 auth / GM / HTTP

之后再明确：

- 是把 legacy auth / GM / HTTP 固化为外层兼容壳
- 还是继续推进 next auth / next GM / next HTTP

在这一步之前，不建议继续扩 compat。

## 当前建议口径

当前最准确的说法是：

> `server-next` 已经完成前台高频同步分流和一轮表层 socket 收口，`client-next` 也基本完成 next 主链收口；真正还没拆掉的是登录/会话、同步投影内核、runtime 真源以及后台 HTTP/GM。

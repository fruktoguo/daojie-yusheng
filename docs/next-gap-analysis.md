# next 现状缺口分析

更新时间：2026-04-03

## 一句话结论

`next` 现在已经不再只是“新事件名包着旧链路”。

截至目前：

- `client-next` 的玩家主链已经基本切到 next-native
- `client-next` 的 socket 已不再监听任何 legacy 事件名
- 但 `server-next` 的登录、bootstrap、同步投影、HTTP/GM 与运行时真源仍大量依赖 legacy

所以结论很明确：

- 可以继续按“前台 next 独立线”推进
- 还不能把整个仓库里的 `legacy` 一把删掉

## 当前最新进度

### 已完成的关键收口

- `pnpm verify:server-next` 当前可通过。
- `pnpm --filter @mud/server-next audit:next-protocol` 当前可通过，报告已生成到 `docs/next-protocol-audit.md`。
- `client-next` 的高频主链已经直接消费 next：
  - `NEXT_S2C.Bootstrap`
  - `NEXT_S2C.MapStatic`
  - `NEXT_S2C.Realm`
  - `NEXT_S2C.WorldDelta`
  - `NEXT_S2C.SelfDelta`
  - `NEXT_S2C.PanelDelta`
- `client-next` 的 `PanelDelta` 已不再回退到旧的 `handleAttrUpdate / InventoryUpdate / EquipmentUpdate / TechniqueUpdate / ActionsUpdate` 监听链。
- `client-next` 的 `WorldDelta / SelfDelta` socket 主链已不再经过 `handleTick(buildLegacyTick...)`。
- `client-next` 的 bootstrap 入口已从 `handleInit(S2C_Init)` 收口为 next 语义的 `handleBootstrap / applyBootstrap`。
- `shared-next` / `shared` 的 `NEXT_S2C_Bootstrap` 已不再是 `S2C_Init` 类型别名，首包类型名已经在共享协议层独立出来。
- `shared-next` / `shared` 中这批 next 低频 payload 也已从 legacy 类型别名拆成独立 next 接口：
  - `NEXT_S2C_LootWindowUpdate`
  - `NEXT_S2C_QuestNavigateResult`
  - `NEXT_S2C_RedeemCodesResult`
  - `NEXT_S2C_GmState`
  - `NEXT_S2C_MapStatic`
  - `NEXT_S2C_Realm`
- `client-next` 的 `sendAction` 已不再 fallback 到 `C2S.Action`，现在只走：
  - `NEXT_C2S.UseAction`
  - `NEXT_C2S.UsePortal`
- `client-next` 的 `socket.ts` 已不再监听任何 legacy 事件名，包含此前残留的 `S2C.Kick`。
- `server-next` 的 `WorldSyncService` 已开始按协议分流同步计算：`protocol=next` 的连接不再进入整套 `emitLegacyDeltaSync` legacy 快照/diff 计算，只保留 next 仍需要的 `MapStatic / Realm / LootWindow` 辅助同步。
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
- `WorldSyncService` 里 `MinimapMarkers / VisibleMinimapMarkers / GameTimeState / ThreatArrows / TickPayload / AttrUpdate / InventoryUpdate / EquipmentUpdate / TechniqueUpdate / ActionsUpdate` 已补上中性 helper 入口，next 主路径不再继续直接挂 `buildLegacy*` 名称；其中 `Inventory / Equipment / Technique / Actions` 这四组已经进一步反转为“中性名是主实现”。
- `WorldSyncService` 的 next `Bootstrap.self` 投影现在也改走中性 helper：`buildAttrBonuses / buildEquipmentRecord / toTechniqueState / toActionDefinition / toItemStackState / cloneTechniqueSkill`，此前对应的本地 legacy 包装已从 `world-sync` 删除。
- `WorldSyncService` 里动作 ID 的兼容映射现在也抽成了中性 helper `normalizeActionEntry`，next `Bootstrap.self.actions` 和 legacy actions diff 复用同一主入口，旧的 `toLegacyActionEntry` 本地包装也已删除。
- `WorldSyncService` 的 legacy delta 内核也继续收口了一层：`captureSyncSnapshot / buildTickPayload / diffRenderEntities` 现在是主实现，旧的 `captureLegacySnapshot / buildLegacyTickPayload / diffLegacyRenderEntities` 本地包装已删除。
- `WorldSyncService` 的同步缓存和属性投影主名也继续收口：`syncStateByPlayerId / buildAttrUpdate / captureAttrState` 现在是内部主实现，旧的 `legacyStateByPlayerId / buildLegacyAttrUpdate / captureLegacyAttrState` 命名已退出主路径，其中本地包装也已删除。
- `WorldSyncService` 的 legacy 初始/增量同步方法内部现在也直接走中性 helper，不再继续直接调用 `buildLegacyVisibleTiles / buildLegacyRenderEntities / buildLegacyMinimapLibrary`；这些本地包装也已从 `world-sync` 删除。
- `WorldSyncService / PlayerRuntimeService / WorldRuntimeService / LegacyGatewayCompatService` 的 `loot window` 旧入口也继续收口：`emitLegacyLootWindow / openLegacyLootWindow / clearLegacyLootWindow / buildLegacyLootWindow` 这批零引用包装已删除，调用面统一走中性入口。
- `WorldSyncService / WorldTickService` 对地图时间与 tick 速度的取数现在也改走中性入口 `mapRuntimeConfigService / getMapTimeConfig / getMapTickSpeed`，主逻辑不再直接挂 `legacyGmHttpCompatService.getMapTimeConfig/getMapTickSpeed`。
- `WorldSyncService` 内部 next/legacy 双发判定也已经从分散的 `shouldEmitNextPayload / shouldEmitLegacyPayload` 收口到单一协议分流入口，减少重复协议判断。
- `player-runtime` 已补上 next 语义主入口：
  - `getPendingLogbookMessages`
  - `queuePendingLogbookMessage`
  - `acknowledgePendingLogbookMessages`
  - `deferVitalRecoveryUntilTick`
  旧的 legacy 方法现退为兼容壳，外部调用已开始切到新名。
- `server-next` 的玩家运行时真源已继续收口：
  - `legacyLootWindow` -> `lootWindowTarget`
  - `legacyCompat.pendingLogbookMessages` -> `pendingLogbookMessages`
  - `legacyCompat.suppressVitalRecoveryUntilTick` -> `vitalRecoveryDeferredUntilTick`
  - `legacyBonuses` -> `runtimeBonuses`
  - 持久化与 legacy 导入仍兼容回读旧字段

### 当前粗略完成度

- `client-next` 主链独立度：约 `80% - 85%`
- `server-next` 独立化：约 `50% - 60%`
- 想整体移除仓库中的 `legacy`：约 `25% - 35%`

### 这意味着什么

现在阻碍“彻底去掉 legacy”的主因，已经不再是客户端收发主链，而是服务端同步投影内核更深层的 legacy builder、登录体系、runtime 真源以及后台 HTTP/GM 面。

## 现在还不能整体去掉 legacy 的原因

### 1. client-next 还残留少量“内部实现级 legacy 痕迹”

这类问题已经不再是网络主链问题，而是内部实现边角：

- `packages/client-next/src/game-map/runtime/map-runtime.ts`
  - 仍在使用 `LegacyCanvasTextRendererAdapter`
- `packages/client-next/src/map-memory.ts`
  - 仍保留旧地图缓存迁移逻辑
- `packages/client-next/src/main.ts`
  - Notice -> UI 的某些展示字段仍保留 `legacyId` 兼容映射

这些不会阻塞 next 前台继续开发，但说明客户端内部还没有完全完成“命名和语义清洗”。

### 2. server-next 的登录 / 会话 / bootstrap 仍压在 legacy 服务上

当前 `WorldGateway` 连接、Hello、GM token 校验、玩家 bootstrap、快照装载，仍依赖：

- `LegacySessionBootstrapService`
- `LegacyAuthService`
- `LegacyGatewayCompatService`

这意味着 `next` 连接虽然已经独立声明 `protocol=next`，但会话体系还不是 next 自己的。

### 3. server-next 的同步投影内核仍在持续构建 legacy 快照

当前 `WorldSyncService` 虽然已经把大量主实现收口到中性 helper，但 legacy socket 同步支路本身仍完整保留，主要体现在：

- `emitLegacyInitialSync / emitLegacyDeltaSync`
- `protocol === 'legacy'` 的协议分流
- `LegacyGmHttpCompatService` 这类 compat 注入仍在
- legacy compat 目录与少量 runtime 逻辑里仍有部分 `emitLegacy* / buildLegacy* / resolveLegacy*` 名称

所以服务端同步内核虽然已经明显收口，但还没有把 legacy 支路真正外置成薄兼容层。

### 4. server-next 的 runtime / persistence 仍把 legacy 状态当正式真源

当前 runtime / persistence 的玩家真源字段名已基本收口到 next / 中性语义：

- `lootWindowTarget`
- `pendingLogbookMessages`
- `vitalRecoveryDeferredUntilTick`
- `runtimeBonuses`

旧快照和旧库导入仍兼容回读 `legacyCompat.*` / `legacyBonuses`，但 runtime 真源字段名本身已不再继续使用这些 legacy 命名。

只要这些字段还在 runtime 和持久化真源里长期存在，legacy 就还不是纯外层兼容面。

### 5. 后台 HTTP / GM 面仍是 legacy 主导

当前 `AppModule` 仍直接注册大量 legacy controller / provider，包括：

- account/auth
- GM auth/controller
- GM admin
- redeem code

这意味着即便玩家前台先独立，后台和运营面也还没有脱离 legacy。

## 现在最值得继续做的事

### 第一阶段：把“前台 next 独立线”彻底做实

建议顺序：

1. 继续清理 `client-next` 内部残余 legacy 命名与 renderer 适配器命名。
2. 继续把 `server-next` 的 legacy payload builder / compat 壳往外压，逐步把 legacy socket 分支收缩成更薄的适配层。
3. 继续清理 `runtimeBonuses` 内部仍保留的 legacy source tag 与兼容分支。

做到这一步，可以认为“玩家前台 next 线已经真正独立”。

### 第二阶段：再决定后端兼容面的策略

之后再明确：

- 是保留 legacy HTTP / GM 作为外层兼容壳
- 还是继续推进 next auth / next GM / next HTTP

在这之前，不建议再继续扩新的 compat。

## 当前建议口径

建议统一用下面这句描述现状：

> `client-next` 的玩家主链已经基本 next-native，shared 层的 next 低频类型名也已独立；真正还没拆掉的是 server-next 的登录/同步投影内核、后台 HTTP/GM 与 runtime 真源。

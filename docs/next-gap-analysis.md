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

## 如果目标是“正式替换旧前台”

### 当前判断

- `client-next` 代码主链已经基本 ready，不再是正式替换的主要阻塞
- 真正的 `P0` 在 `server-next` 的登录 / 会话 / bootstrap，以及替换验收证明链
- 当前更准确的进度判断是：
  - 距离“正式替换旧前台”：约还差 `20% - 30%`
  - 距离“后端真正独立、可大幅移除 legacy”：仍明显更远

### P0：正式替换旧前台前必须解决

1. `next` socket 的认证 / 会话 / bootstrap 仍由 legacy 主链驱动。
   当前 `WorldGateway.handleConnection / handleHello` 已改为依赖中性的 `WorldSessionBootstrapService`，而 `WorldSessionBootstrapService` 现在也只再依赖 `WorldPlayerAuthService / WorldPlayerSnapshotService / WorldClientEventService` 这类中性入口；其中 `WorldPlayerAuthService / WorldPlayerSnapshotService` 已不再直接注入 `LegacyAuthService`，改成依赖更窄的 `WorldLegacyPlayerSourceService`。但底层 token 规则与旧库读取仍继续依赖 legacy JWT 语义、旧 `users/players` 表以及 `loadLegacyPlayerSnapshot` 兼容装载。
2. `next` 网关行为层仍部分借 `LegacyGatewayCompatService` 完成实际业务。
   `quest navigate`、`chat`、`ack system messages`、bootstrap 待确认 logbook、以及 `WorldGateway` 里的 common error 发包都已经开始改走中性事件服务；但部分 legacy/dual emit 结果发包与 legacy 指令适配仍没有完全收完。
3. 正式替换证明链还没闭环。
   `pnpm verify:server-next` 当前不是完整替换验收入口，它不覆盖 `client-next build`、`audit:server-next-protocol`、shadow、以及带库 restore 闭环。
4. `next` 协议审计还缺“禁止 next 连接额外收到 legacy 事件”的负向断言。
   现在更像证明 next 事件存在，但还不足以证明不会回退双发。

### P1：替换后应尽快继续收口

1. `emitCompatDeltaSync` 这套高频 legacy diff/tick 仍留在 `WorldSyncService` 主服务内。
2. `loadLegacyPlayerSnapshot` 仍是 bootstrap 热路径里的自动 fallback，最好降级成显式迁移入口。
3. `runtime/persistence` 对旧快照字段和旧 runtime bonus source tag 的兼容回读仍在主装载流程里。

### 可延后

1. `LegacySocketBridgeService` 与低频 dual emit 外壳可以在替换后暂时保留。
2. legacy HTTP / GM controller 与 admin/backup/restore 面可以先作为外层 compat 壳保留。
   但前提是不再把 legacy 语义反向渗进 runtime 真源和 socket 主链。

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
- `client-next` 的地图运行时渲染适配层命名也已收口为中性语义，`MapRuntime` 不再继续引用 `LegacyCanvasTextRendererAdapter`。
- `client-next` 的本地地图记忆迁移命名也已改成版本兼容语义，`main.ts` 的 next notice -> UI 转换已收口到中性消息 ID helper。
- `shared-next` 的 `NEXT_S2C_NoticeItem` 也已把旧的 `legacyId` 协议兼容字段收口为中性语义的 `messageId`。
- `server-next` 的 `WorldSyncService` 已开始按协议分流同步计算：`protocol=next` 的连接不再进入整套 `emitCompatDeltaSync` compat/legacy 快照-diff 计算，只保留 next 仍需要的 `MapStatic / Realm / LootWindow` 辅助同步。
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
- `player-runtime / player-persistence` 对旧快照字段的回读也已继续收口到 compat helper，`legacyCompat.pendingLogbookMessages / legacyBonuses` 不再直接散落在主装载流程；`runtime:vitals_baseline` 的展示标签也已改成中性语义。

### 当前粗略完成度

- `client-next` 主链独立度：约 `80% - 85%`
- `server-next` 独立化：约 `50% - 60%`
- 想整体移除仓库中的 `legacy`：约 `25% - 35%`

### 这意味着什么

现在阻碍“彻底去掉 legacy”的主因，已经不再是客户端收发主链，而是服务端同步投影内核更深层的 legacy builder、登录体系、runtime 真源以及后台 HTTP/GM 面。

## 现在还不能整体去掉 legacy 的原因

### 1. client-next 的内部命名清洗已基本完成

`client-next/src` 里的主要 `legacy` 命名边角已经收口完成，包括：

- 地图运行时渲染适配器命名
- 本地地图记忆迁移命名
- chat / UI style 的旧存储迁移命名
- technique panel 的 fallback 层命名
- notice 消息 ID 的兼容字段命名

这意味着客户端这边剩下的重点已经不再是内部命名清洗，而是继续维持 next 主链独立，并避免新的 compat 反向渗回主路径。

### 2. server-next 的登录 / 会话 / bootstrap 仍压在 legacy 服务上

当前 `WorldGateway` 连接、Hello、GM token 校验、玩家 bootstrap、快照装载，仍依赖：

- `WorldSessionBootstrapService`
- `WorldPlayerAuthService`
- `WorldPlayerSnapshotService`
- `WorldLegacyPlayerSourceService`
- `WorldClientEventService`
- `LegacyGatewayCompatService`

这意味着 `next` 连接虽然已经独立声明 `protocol=next`，但会话体系还不是 next 自己的。

### 3. server-next 的同步投影内核仍在持续构建 compat / legacy 快照

当前 `WorldSyncService` 虽然已经把大量主实现收口到中性 helper，但 legacy socket 同步支路本身仍完整保留，主要体现在：

- `emitCompatInitialSync / emitCompatDeltaSync`
- `protocol === 'legacy'` 的协议分流
- `LegacyGmHttpCompatService` 这类 compat 注入仍在
- legacy compat 目录与少量 runtime 逻辑里仍有部分 `emitLegacy* / buildLegacy* / resolveLegacy*` 名称

所以服务端同步内核虽然已经明显收口，但还没有把 legacy 支路真正外置成薄兼容层。

另外，`next-protocol-audit` 目前也还缺“next 连接不得额外收到 legacy 事件”的负向断言，这会直接影响正式替换前的信心。

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

1. 已经先把 `WorldGateway` 对 bootstrap 的直接依赖改到中性的 `WorldSessionBootstrapService`；下一步要继续把其中的 `LegacyAuthService` 降级成旧号导入 fallback。
   现在这一步又进一步推进到了 `WorldPlayerAuthService / WorldPlayerSnapshotService / WorldLegacyPlayerSourceService / WorldClientEventService` 这层中性入口，且 `WorldSessionBootstrapService` 已不再直接注入 `LegacyGatewayCompatService`，`WorldGateway` 的 common error 发包也已统一切到 `WorldClientEventService`。下一步应继续把 `WorldLegacyPlayerSourceService` 底下的 legacy JWT/旧库读取语义收成显式旧号导入 fallback，而不是继续充当 next socket 正式认证链。
2. 再把 next handler 中仍借 `LegacyGatewayCompatService` 的 quest/chat/ack/error 这些业务入口收成中性或 next emitter。
3. 之后继续压薄 `WorldSyncService` 的 compat 高频分支，并补上协议审计的“禁止 legacy 额外事件”负向断言。
4. 最后再继续清理 `runtimeBonuses` 和旧快照回读这类迁移兼容尾巴。

做到这一步，可以认为“玩家前台 next 线已经真正独立”。

### 第二阶段：再决定后端兼容面的策略

之后再明确：

- 是保留 legacy HTTP / GM 作为外层兼容壳
- 还是继续推进 next auth / next GM / next HTTP

在这之前，不建议再继续扩新的 compat。

## 当前建议口径

建议统一用下面这句描述现状：

> `client-next` 的玩家主链已经基本 next-native；真正阻塞正式替换旧前台的，已经主要收缩到 `server-next` 的登录/会话/bootstrap 主链、部分 next handler 仍借 compat 壳，以及替换验收证明链尚未闭环。

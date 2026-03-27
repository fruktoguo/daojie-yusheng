# 网络动态数据审计

## 目标

本审计面向当前仓库的全部主要网络面，检查哪些协议仍在发送静态数据，哪些接口已经基本符合“网络只发动态数据”的目标。

审计范围：

- WebSocket 协议与发送链路
  - `packages/shared/src/protocol.ts`
  - `packages/shared/src/network-protobuf.ts`
  - `packages/server/src/game/game.gateway.ts`
  - `packages/server/src/game/tick.service.ts`
  - `packages/server/src/game/market.service.ts`
  - `packages/server/src/game/world.service.ts`
  - `packages/server/src/game/loot.service.ts`
  - `packages/server/src/game/suggestion-realtime.service.ts`
- 客户端网络入口
  - `packages/client/src/network/socket.ts`
- HTTP / GM / 认证 / 账号接口
  - `packages/server/src/game/gm.controller.ts`
  - `packages/server/src/auth/auth.controller.ts`
  - `packages/server/src/game/account.controller.ts`
  - `packages/client/src/ui/auth-api.ts`
  - `packages/client/src/gm.ts`
  - `packages/config-editor/src/main.ts`

## 审计结论

当前网络面存在两个明显问题：

1. 高频或准高频面板同步里，仍混入了大量静态定义数据。
2. 低频按需接口虽然不一定是性能热点，但仍常把完整静态详情和动态状态一起返回，缺少版本化缓存或模板化引用。

另外，当前客户端其实已经具备一部分“本地补静态数据”的能力，但协议层还没有充分利用：

- 物品本地模板：`packages/client/src/content/local-templates.ts:33`
- 功法与技能本地模板：`packages/client/src/content/local-templates.ts:38`
- 境界等级本地目录：`packages/client/src/content/local-templates.ts:47`
- 小地图静态缓存：`packages/client/src/map-static-cache.ts:220`
- 本地编辑器目录：`packages/client/src/constants/world/editor-catalog.ts:1`

这意味着至少以下几类静态字段，已经不必继续塞进高频网络包：

- 物品名、描述、基础词条、基础效果
- 功法名、功法分类、层配置、技能定义
- 技能名、描述、范围、目标模式
- 已缓存地图的元数据、小地图快照、图鉴快照

按优先级看，最需要继续收紧的是：

1. `s:techniqueUpdate`
2. `s:inventoryUpdate`
3. `s:equipmentUpdate`
4. `s:actionsUpdate`
5. `s:init`
6. `s:questUpdate`

相对可接受但仍有优化空间的是：

1. `s:marketUpdate`
2. `s:marketItemBook`
3. `s:npcShop`
4. `s:lootWindowUpdate`
5. `s:tileRuntimeDetail`
6. `s:suggestionUpdate`
7. `GET /gm/editor-catalog`
8. `GET /gm/players/:playerId`

## 设计基线

如果目标是“网络只发动态数据”，则协议层应尽量满足以下规则：

- 客户端能从本地模板、静态资源、版本化缓存还原的数据，不进入高频包。
- 高频包只发数值变化、关系变化、位置变化、显隐变化、冷却变化、状态切换。
- 低频包允许返回详情，但应优先返回 `id + version + dynamic overlay`，而不是反复返回完整定义对象。
- 首包、重同步、切图允许完整快照，但完整快照应尽量只包含“首屏必需状态”，而不是把所有面板定义一并塞进去。

## 当前客户端已具备的静态恢复能力

### 1. 物品静态信息

客户端已经能通过本地目录补齐物品静态字段：

- `resolvePreviewItem()` 会用本地模板补 `name / desc / groundLabel / grade / level / equipSlot / equipAttrs / equipStats / equipValueStats / effects / tags`。`packages/client/src/content/local-templates.ts:70`
- 背包、装备、物品提示都已经在走这套补齐逻辑：
  - `packages/client/src/ui/panels/inventory-panel.ts:11`
  - `packages/client/src/ui/panels/equipment-panel.ts:8`
  - `packages/client/src/ui/equipment-tooltip.ts:15`

结论：

- 背包和装备网络层继续传完整 `ItemStack`，已经和客户端能力重复。
- 物品网络同步完全可以收缩成 `itemId + count + 必要实例态`。

### 2. 功法与技能静态信息

客户端已经能通过本地目录补齐功法和技能定义：

- `resolvePreviewTechnique()` 会补 `name / grade / category / layers / skills`。`packages/client/src/content/local-templates.ts:144`
- `resolvePreviewSkill()` 会补 `name / desc / cooldown / cost / range / targeting / effects / unlock 条件`。`packages/client/src/content/local-templates.ts:85`
- 功法面板已经在展示前统一走本地补齐：
  - `packages/client/src/ui/panels/technique-panel.ts:22`
  - `packages/client/src/ui/panels/technique-panel.ts:206`

结论：

- `s:techniqueUpdate` 里的 `name / grade / category / skills / layers / attrCurves` 绝大多数都不该继续进入高频同步。
- `s:actionsUpdate` 里的 `name / desc / range / requiresTarget / targetMode` 也已经具备本地恢复条件。

### 3. 地图与小地图静态信息

客户端已经有地图静态缓存：

- `cacheMapMeta()` / `getCachedMapMeta()`：`packages/client/src/map-static-cache.ts:213`
- `cacheMapSnapshot()` / `getCachedMapSnapshot()`：`packages/client/src/map-static-cache.ts:227`
- `cacheUnlockedMinimapLibrary()`：`packages/client/src/map-static-cache.ts:251`
- `MapStore` 在 `init` 和 `tick` 中已经会使用这些缓存。`packages/client/src/game-map/store/map-store.ts:123`

结论：

- `s:tick` 中继续混发 `mapMeta / minimap / minimapLibrary / visibleMinimapMarkers`，只是因为协议还没拆干净，不是客户端做不到缓存。
- 这些字段更适合做独立低频同步和版本化缓存。

### 4. 仍缺少本地静态表的领域

下面这些领域目前不能完全依赖客户端本地补齐，因此不适合直接一刀切删字段：

- 任务文案与任务奖励描述
- NPC 商店对白与店铺文案
- 建议系统正文与回复
- 观察详情中的部分即时生成文本

结论：

- 这些领域应优先做“低频详情化”和“摘要/详情拆分”，而不是先强行本地模板化。

## 一、WebSocket 下行审计

### 1. `s:init`

协议位置：

- `packages/shared/src/protocol.ts:317`

发送位置：

- `packages/server/src/game/game.gateway.ts:693`

当前内容：

- `self: PlayerState`
- `mapMeta`
- `minimap`
- `visibleMinimapMarkers`
- `minimapLibrary`
- `tiles`
- `players`
- `time`
- `auraLevelBaseValue`

问题：

- `self: PlayerState` 本身包含 `inventory / equipment / techniques / actions / quests / realm / marketStorage` 等大量面板数据，静态定义和动态状态完全混合。
- `PlayerState` 里的 `inventory` 仍是完整 `ItemStack[]`，`equipment` 仍是完整 `EquipmentSlots`，`techniques` 仍是完整 `TechniqueState[]`，`actions` 仍是完整 `ActionDef[]`。`packages/shared/src/types.ts:922`
- `minimap / minimapLibrary / mapMeta` 属于静态或低频静态数据，不应与玩家动态状态强绑定。

结论：

- 作为首包，发送完整快照是合理的。
- 但当前 `s:init` 过胖，已经承担了“动态状态 + 静态定义 + 面板首包 + 小地图静态资源”的多重职责。

建议：

- 拆成 `initCore` 和若干按需面板首包。
- `self` 改成只保留基础动态玩家态。
- `inventory / equipment / techniques / actions / quests` 改为独立首包或独立缓存恢复。
- 小地图静态资源单独做版本化缓存。

### 2. `s:tick`

协议位置：

- `packages/shared/src/protocol.ts:279`

发送位置：

- `packages/server/src/game/tick.service.ts:1917`
- `packages/server/src/game/tick.service.ts:2067`

编解码位置：

- `packages/shared/src/network-protobuf.ts:14`
- `packages/shared/src/network-protobuf.ts:789`

动态字段：

- `p / e / r / threatArrowAdds / threatArrowRemoves / g / fx / t / hp / qi / f / path / time / dt`

仍混入的低频静态字段：

- `mapMeta`
- `minimap`
- `minimapLibrary`
- `visibleMinimapMarkers`
- `visibleMinimapMarkerAdds`

问题：

- `tick` 主体已经是增量思路，但仍允许在同一事件中携带静态地图元数据与整张 mini 地图快照。
- protobuf 层对 `minimap / minimapLibrary / visibleMinimapMarkers` 仍使用 `JSON.stringify` 字符串塞入二进制，而不是拆成结构化、可复用的轻量版本。`packages/shared/src/network-protobuf.ts:789`
- 切图时会触发 `resetPlayerSyncState()`，把面板增量缓存也一起清掉。`packages/server/src/game/tick.service.ts:1919`

结论：

- `s:tick` 的主体方向是对的。
- 但它仍兼做“静态重同步通道”，语义边界不够干净。

建议：

- 保留 `tick` 只做动态广播。
- 地图元数据、小地图快照、视野标记重同步拆到独立 `resync` 或 `mapStaticSync`。
- 切图时只重置地图可见性相关缓存，不重置 inventory / technique / actions / attr 面板缓存。

### 3. `s:attrUpdate`

协议位置：

- `packages/shared/src/protocol.ts:492`

发送位置：

- `packages/server/src/game/tick.service.ts:1748`
- `packages/server/src/game/game.gateway.ts:389`

问题：

- `realm?: PlayerRealmState | null` 里混有大量非纯动态字段，比如 `displayName / name / shortName / path / narrative / review / breakthroughItems / breakthrough`。`packages/shared/src/types.ts:652`
- `bonuses` 也是完整加成列表，既有动态也可能包含低频描述性来源。

结论：

- `attrUpdate` 已有差量逻辑，但 payload 仍偏“大面板快照”，不是纯动态数值流。

建议：

- 拆出纯动态资源与数值字段：`maxHp / qi / progress / progressToNext / breakthroughReady / numericStats`
- 大境界描述、突破要求、叙事文案改走低频详情或本地策划表。

### 4. `s:inventoryUpdate`

协议位置：

- `packages/shared/src/protocol.ts:509`

发送位置：

- `packages/server/src/game/tick.service.ts:1753`
- `packages/server/src/game/game.gateway.ts:391`

现状：

- 现在已经支持槽位差量。
- 但槽位里的 `item` 仍然是完整 `ItemStack`。`packages/shared/src/protocol.ts:510`

问题：

- `ItemStack` 包含 `name / desc / grade / equipSlot / equipAttrs / equipStats / equipValueStats / effects / tags / mapUnlockId / tileAuraGainAmount / allowBatchUse`。`packages/shared/src/types.ts:408`
- 这些几乎都不是高频动态字段。
- 穿脱、整理、堆叠、拆分时，仍会把一批完整物品定义一起发下去。

结论：

- 当前 `s:inventoryUpdate` 只是“整包背包”进化成了“整包物品槽位对象差量”，还没有进化成“纯动态库存变化”。

建议：

- 背包同步只发：
  - `slotIndex`
  - `instanceId` 或稳定签名
  - `itemId`
  - `count`
  - 必要实例态
- 物品名字、描述、词条、装备效果、展示标签改由客户端本地模板表补齐。

### 5. `s:equipmentUpdate`

协议位置：

- `packages/shared/src/protocol.ts:523`

发送位置：

- `packages/server/src/game/tick.service.ts:1761`

问题：

- 仍是整个 `EquipmentSlots` 整包。
- 槽位中的值仍是完整 `ItemStack | null`。

结论：

- 这是当前最明显还没做动态化的面板同步之一。

建议：

- 改成 `slot -> { itemId, instanceId, count? }`。
- 如果装备没有实例随机词条，甚至可以只发 `slot + itemId`。

### 6. `s:techniqueUpdate`

协议位置：

- `packages/shared/src/protocol.ts:527`

发送位置：

- `packages/server/src/game/tick.service.ts:1767`
- `packages/server/src/game/tick.service.ts:2387`

编解码位置：

- `packages/shared/src/network-protobuf.ts:614`
- `packages/shared/src/network-protobuf.ts:905`

动态字段：

- `techId`
- `level`
- `exp`
- `expToNext`
- `cultivatingTechId`

仍混入的静态字段：

- `name`
- `grade`
- `category`
- `skills`
- `layers`
- `attrCurves`

问题：

- `skills / layers / attrCurves` 都是功法定义，不应进入高频功法经验同步。
- protobuf 层对它们仍直接 `JSON.stringify`。`packages/shared/src/network-protobuf.ts:618`

结论：

- 这是当前最偏离“只发动态数据”目标的 WS 事件之一。

建议：

- 高频 `techniqueUpdate` 只保留动态字段。
- 功法定义改为本地策划模板或单独低频详情查询。

### 7. `s:actionsUpdate`

协议位置：

- `packages/shared/src/protocol.ts:550`

发送位置：

- `packages/server/src/game/tick.service.ts:1775`
- `packages/server/src/game/tick.service.ts:2440`

编解码位置：

- `packages/shared/src/network-protobuf.ts:939`

动态字段：

- `id`
- `cooldownLeft`
- `autoBattleEnabled`
- `autoBattleOrder`
- `skillEnabled`
- `actionOrder`
- 面板开关状态

仍混入的静态字段：

- `name`
- `type`
- `desc`
- `range`
- `requiresTarget`
- `targetMode`

结论：

- 当前动作同步仍是“定义+状态混发”。

建议：

- 高频同步只保留动作状态。
- 技能名、描述、目标模式、范围等改由本地模板或低频技能定义同步提供。

### 8. `s:lootWindowUpdate`

协议位置：

- `packages/shared/src/protocol.ts:579`

发送位置：

- `packages/server/src/game/tick.service.ts:1783`
- `packages/server/src/game/loot.service.ts:373`

问题：

- `LootWindowItemView.item` 仍是完整 `ItemStack`。`packages/shared/src/types.ts:544`
- 容器 `title / desc / grade` 也是静态详情。

结论：

- 这是按需打开的低频面板，问题不如高频同步严重。
- 但仍可进一步做轻量化。

建议：

- 低频模式下可接受。
- 若未来掉落面板刷新频率提高，应改成 `itemId + count + 可见状态`。

### 9. `s:questUpdate`

协议位置：

- `packages/shared/src/protocol.ts:634`
- `packages/shared/src/types.ts:870`

发送位置：

- `packages/server/src/game/tick.service.ts:1791`

问题：

- `QuestState` 同时包含：
  - 动态进度字段：`status / progress / required`
  - 静态文案字段：`title / desc / objectiveText / rewardText`
  - 低频详情字段：`giverName / targetMapName / submitNpcName`
  - 物品详情字段：`rewards: ItemStack[]`

结论：

- 任务面板同步仍是整块业务对象，而不是“任务进度增量”。
- 当前客户端也没有一套和物品、功法同等级的本地任务静态目录，因此这里不能简单直接删成只剩 ID。

建议：

- 动态同步只保留 `questId + status + progress + required + 当前目标引用`
- 静态任务描述、奖励说明、NPC 文案改由本地任务表或按需详情提供。

### 10. `s:tileRuntimeDetail`

协议位置：

- `packages/shared/src/protocol.ts:612`

发送位置：

- `packages/server/src/game/game.gateway.ts:570`

问题：

- `resources.label`
- `entities.name`
- `observation.lines`
- `buffs`

这些都不是纯动态数值。

结论：

- 这是观察/检查类按需详情，低频请求下可以接受。
- 不应被误用为高频同步。

建议：

- 保持按需。
- 如果后续要复用为更高频面板，应拆成“动态观测值”和“静态说明模板”。

### 11. `s:suggestionUpdate`

协议位置：

- `packages/shared/src/protocol.ts:704`
- `packages/shared/src/types.ts:1000`

发送位置：

- `packages/server/src/game/game.gateway.ts:705`
- `packages/server/src/game/game.gateway.ts:711`
- `packages/server/src/game/suggestion-realtime.service.ts:13`

问题：

- 广播的是完整 `Suggestion[]`。
- 单条建议里有 `title / description / replies / upvotes[] / downvotes[]`。

结论：

- 社交系统低频广播，可接受。
- 但如果建议量继续上升，应改分页或 diff。

建议：

- 至少拆成列表摘要和详情。
- 投票人 ID 列表不应在常规列表广播里下发。

### 12. `s:marketUpdate`

协议位置：

- `packages/shared/src/protocol.ts:584`

发送位置：

- `packages/server/src/game/game.gateway.ts:779`
- `packages/server/src/game/game.gateway.ts:882`
- `packages/server/src/game/market.service.ts:99`

问题：

- `listedItems` 和 `myOrders` 中都带完整 `ItemStack`。`packages/shared/src/types.ts:446`
- `buildListedItems()` 甚至从编辑器物品目录遍历生成完整物品摘要。`packages/server/src/game/market.service.ts:549`
- `storage` 也携带完整托管物品对象。

结论：

- 已经改成按需订阅后，风险明显下降。
- 但 payload 仍不是纯动态。

建议：

- 坊市盘面只保留 `itemKey / itemId / 价格数量统计`。
- 我的挂单只保留 `orderId / itemKey / remainingQuantity / unitPrice / status`。
- 物品名称与说明走本地模板。

### 13. `s:marketItemBook`

协议位置：

- `packages/shared/src/protocol.ts:592`

发送位置：

- `packages/server/src/game/game.gateway.ts:788`
- `packages/server/src/game/market.service.ts:109`

问题：

- `book.item` 仍是完整 `ItemStack`。

结论：

- 这是典型的按需详情接口，低频可接受。

建议：

- 若希望彻底贯彻“网络只发动态数据”，这里也应只返回 `itemKey` 与盘口价位，客户端通过本地模板渲染物品说明。

### 14. `s:marketTradeHistory`

协议位置：

- `packages/shared/src/protocol.ts:599`

发送位置：

- `packages/server/src/game/game.gateway.ts:798`

结论：

- 当前只返回成交记录摘要，没有明显静态大对象。
- 这是当前比较干净的低频事件之一。

### 15. `s:npcShop`

协议位置：

- `packages/shared/src/protocol.ts:606`
- `packages/shared/src/types.ts:494`

发送位置：

- `packages/server/src/game/game.gateway.ts:404`
- `packages/server/src/game/world.service.ts:612`

问题：

- `NpcShopView.items[].item` 仍是完整 `ItemStack`。
- `npcName / dialogue / currencyItemName` 也属于静态或低频静态文案。

结论：

- 低频按需可接受。
- 但客户端当前并没有 NPC 商店本地模板层，现阶段更适合先做“详情低频化”而不是直接删光文案字段。

建议：

- 商店协议改为：
  - `npcId`
  - `itemId`
  - `unitPrice`
  - 可选库存动态态
- 商人对白与物品说明交给本地模板。

### 16. `s:gmState`

协议位置：

- `packages/shared/src/protocol.ts:410`

发送位置：

- `packages/client/src/network/socket.ts:109`

结论：

- 这是 GM 专用状态面板，不属于玩家高频实时链路。
- 负载以动态管理数据为主，虽然较大，但属于低频管理面，可以接受。

## 二、WebSocket 上行审计

客户端上行事件大部分已经符合“只发动态意图”的要求。`packages/client/src/network/socket.ts:175`

表现较好的事件：

- `c:move`
- `c:moveTo`
- `c:navigateQuest`
- `c:action`
- `c:useItem`
- `c:dropItem`
- `c:destroyItem`
- `c:takeLoot`
- `c:equip`
- `c:unequip`
- `c:cultivate`
- `c:requestMarket`
- `c:requestNpcShop`

仍有改进空间的上行事件：

### 1. `c:updateAutoBattleSkills`

发送位置：

- `packages/client/src/network/socket.ts:330`

问题：

- 直接发送完整 `skills: AutoBattleSkillConfig[]`。

建议：

- 改成按技能 ID 的 diff。

### 2. `c:gmUpdatePlayer`

发送位置：

- `packages/client/src/network/socket.ts:230`

问题：

- GM 编辑器场景通常会提交完整玩家快照。

结论：

- 这是低频管理面，可接受。
- 若后续 GM 编辑数据更大，应按 `section` 做差量提交。

## 三、HTTP / GM / 认证接口审计

### 1. 认证与账号接口

接口位置：

- `packages/server/src/auth/auth.controller.ts:31`
- `packages/server/src/game/account.controller.ts:16`
- `packages/client/src/ui/auth-api.ts:62`

结论：

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/display-name/check`
- `POST /auth/gm/login`
- `POST /auth/gm/password`
- `POST /account/password`
- `POST /account/display-name`
- `POST /account/role-name`

这些接口返回体都较轻，没有明显静态大对象问题。

### 2. GM 管理接口

接口位置：

- `packages/server/src/game/gm.controller.ts:44`
- `packages/server/src/game/gm.service.ts:123`

#### `GET /gm/state`

位置：

- `packages/server/src/game/gm.controller.ts:56`
- `packages/server/src/game/gm.service.ts:123`

返回：

- 玩家摘要列表
- 地图 ID 列表
- 性能快照

结论：

- 动态管理面，低频可接受。
- 可进一步拆成：
  - 玩家列表
  - 性能快照
  - 地图列表

#### `GET /gm/editor-catalog`

位置：

- `packages/server/src/game/gm.controller.ts:61`
- `packages/server/src/game/gm.service.ts:231`

返回：

- `techniques`
- `items`
- `realmLevels`

问题：

- 这是典型静态目录数据。

结论：

- 当前作为 GM 编辑器低频首包可接受。
- 但最适合做版本化缓存、ETag、内容哈希缓存。

#### `GET /gm/maps`

位置：

- `packages/server/src/game/gm.controller.ts:66`

结论：

- 地图列表本身是静态或低频元数据，适合缓存。

#### `GET /gm/players/:playerId`

位置：

- `packages/server/src/game/gm.controller.ts:176`
- `packages/server/src/game/gm.service.ts:185`

问题：

- 返回 `GmManagedPlayerRecord`，本质上接近完整玩家快照。
- 会混入 inventory / equipment / techniques / actions / quests 等大量定义数据。

结论：

- 这是 GM 单人详情页，低频可接受。
- 但不是“纯动态数据”。

建议：

- 将 GM 详情拆成：
  - 基础动态态
  - 战斗与数值态
  - 背包实例态
  - 功法进度态
  - 静态定义引用

#### `GET /gm/maps/:mapId/runtime`

位置：

- `packages/server/src/game/gm.controller.ts:199`
- `packages/server/src/game/gm.service.ts:1089`

结论：

- 这是按需窗口查询，只返回局部 tiles / entities / time / timeConfig。
- 属于低频管理面，当前设计基本合理。

### 3. GM 前端与配置编辑器请求面

请求位置：

- `packages/client/src/gm.ts:1395`
- `packages/client/src/ui/auth-api.ts:62`
- `packages/config-editor/src/main.ts:263`

结论：

- 这两套前端都使用普通 JSON `fetch`，没有特殊压缩或缓存层。
- 其中最适合补缓存的是：
  - GM `editor-catalog`
  - 地图列表
  - 配置编辑器里的静态配置列表

## 四、编解码层审计

位置：

- `packages/shared/src/network-protobuf.ts:1`

现状：

- 只有 `Tick / AttrUpdate / TechniqueUpdate / ActionsUpdate` 使用 protobuf。`packages/shared/src/network-protobuf.ts:1050`
- 其他事件仍直接透传 JSON。

问题：

- 即使进入 protobuf，静态大字段仍可能先被 `JSON.stringify` 再塞入 protobuf 字符串字段。
- 这意味着“编码方式变二进制”并不能替代“协议结构瘦身”。

最明显的例子：

- `TechniqueUpdate.skillsJson` `layersJson` `attrCurvesJson`
- `Tick.minimapJson` `minimapLibraryJson` `visibleMinimapMarkersJson`

结论：

- 当前瓶颈主要不在“有没有 protobuf”，而在“是否仍然发送静态大对象”。

## 五、按优先级的改造建议

### P0：先把高频面板同步变成纯动态

- `s:techniqueUpdate`
  - 只保留 `techId / level / exp / expToNext / cultivatingTechId`
- `s:inventoryUpdate`
  - 只保留 `slotIndex / itemId / count / instanceId`
- `s:equipmentUpdate`
  - 只保留 `slot / itemId / instanceId`
- `s:actionsUpdate`
  - 只保留 `id / cooldownLeft / toggle 状态 / order`

### P1：把首包和重同步里的静态资源独立出来

- `s:init` 拆成 `initCore` + 面板首包
- `s:tick` 中的 `mapMeta / minimap / minimapLibrary / visibleMinimapMarkers` 拆到独立重同步事件

### P2：明确哪些领域先走本地模板，哪些领域先走低频详情

优先适合本地模板化的：

- 物品
- 功法
- 技能
- 动作定义
- 地图元数据与小地图静态资源

优先适合摘要/详情拆分的：

- 任务
- NPC 商店对白
- 建议系统
- 观察详情文本

## 六、建议的网络目标形态

### 玩家高频实时面

- `tick`
  - 只保留位置、显隐、血蓝、特效、动态地块、动态掉落、路径、时间
- `inventoryUpdate`
  - 只保留槽位变化、`itemId`、数量、实例态
- `equipmentUpdate`
  - 只保留槽位变化、`itemId`、实例态
- `techniqueUpdate`
  - 只保留等级、经验、主修切换
- `actionsUpdate`
  - 只保留冷却、排序、自动战斗开关
- `questProgressUpdate`
  - 只保留任务状态和进度

### 玩家低频详情面

- `initCore`
- `mapStaticSync`
- `minimapSnapshotSync`
- `panel:questDetail`
- `panel:npcShopDetail`
- `panel:marketDetail`
- `panel:observeDetail`

### 管理面

- GM / 配置编辑器 / 认证接口继续允许 JSON 详情返回
- 但静态目录接口应补版本号、ETag 或内容哈希缓存

### P2：把低频面板详情改成模板引用

- `s:questUpdate`
- `s:marketUpdate`
- `s:marketItemBook`
- `s:npcShop`
- `s:lootWindowUpdate`

这些都应尽量从“完整 ItemStack / 完整 QuestState”转向“ID + 动态态 + 本地模板渲染”。

### P3：给静态目录型 HTTP 接口加缓存

- `GET /gm/editor-catalog`
- `GET /gm/maps`
- 配置编辑器的目录型读取接口

推荐：

- ETag
- 内容版本号
- hash 命中后 304

## 六、最终判断

当前仓库并不是“网络只能发动态数据”。

更准确地说：

- 上行指令基本已经接近“只发动态意图”
- 地图 tick 主体基本接近“只发动态变化”
- 但面板同步和详情同步仍大量发送静态定义对象

如果要真正达成目标，必须把以下几类对象从高频/常规同步里剥离出去：

- `ItemStack` 的显示与配置字段
- `TechniqueState` 中的技能、层级、成长曲线定义
- `ActionDef` 中的名称、描述、目标模式、范围定义
- `QuestState` 中的任务文案与奖励详情
- `PlayerRealmState` 中的叙事文案、突破说明、静态要求
- `MapMeta / MinimapSnapshot / MinimapLibrary` 这类地图静态数据

只有当网络层普遍退化为“ID + 动态数值 + 状态变更 + 引用关系”时，才算真正完成“网络只发动态数据”的目标。

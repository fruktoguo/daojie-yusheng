# Interfaces

API、Socket 事件、HTTP 路由、跨包契约的定位清单。详细字段结构见 `data_models.md` 和 `packages/shared/src/`。

## Socket.IO 协议（主入口）

所有实时事件以 `n:c:*`（C2S）/ `n:s:*`（S2C）前缀命名，集中定义在 `packages/shared/src/protocol.ts`。

### 事件常量

```typescript
import { C2S, S2C } from '@mud/shared';
// C2S.Hello === 'n:c:hello'
// S2C.Bootstrap === 'n:s:bootstrap'
```

### 载荷映射

```typescript
import type { C2S_PayloadMap, S2C_PayloadMap } from '@mud/shared';
// C2S_PayloadMap[C2S.CastSkill] → C2S_CastSkill
// S2C_PayloadMap[S2C.PanelDelta] → S2C_PanelDelta
```

### C2S 事件分组

| 分组 | 事件 |
|------|------|
| 连接 | `Hello`、`Heartbeat`、`Ping` |
| 移动 / 意图 | `Move`、`MoveTo`、`NavigateQuest`、`UsePortal`、`UseAction` |
| 战斗 | `CastSkill`、`DebugResetSpawn` |
| 物品 / 装备 | `UseItem`、`DropItem`、`DestroyItem`、`SortInventory`、`Equip`、`Unequip`、`TakeGround`、`StartGather`、`CancelGather`、`StopLootHarvest` |
| 修炼 | `Cultivate`、`HeavenGateAction` |
| 炼丹 / 强化 | `RequestAlchemyPanel`、`SaveAlchemyPreset`、`DeleteAlchemyPreset`、`StartAlchemy`、`CancelAlchemy`、`RequestEnhancementPanel`、`StartEnhancement`、`CancelEnhancement` |
| 建筑 / 风水 | `BuildPlaceIntent`、`BuildDeconstruct`、`RoomSetRole`、`FengShuiObserve` |
| 阵法 | `CreateFormation`、`SetFormationActive`、`RefillFormation` |
| NPC | `RequestNpcShop`、`BuyNpcShopItem`、`RequestNpcQuests`、`AcceptNpcQuest`、`SubmitNpcQuest` |
| 市场 / 拍卖 | `RequestMarket`、`RequestMarketListings`、`RequestAuctionListings`、`RequestMarketItemBook`、`RequestMarketTradeHistory`、`CreateMarketSellOrder`、`CreateMarketBuyOrder`、`BuyMarketItem`、`SellMarketItem`、`CancelMarketOrder`、`ClaimMarketStorage`、`PlaceAuctionBid`、`BuyoutAuctionLot` |
| 邮件 | `RequestMailSummary`、`RequestMailPage`、`RequestMailDetail`、`MarkMailRead`、`ClaimMailAttachments`、`DeleteMail` |
| 兑换码 | `RedeemCodes` |
| 建议 | `RequestSuggestions`、`CreateSuggestion`、`VoteSuggestion`、`ReplySuggestion`、`MarkSuggestionRepliesRead`、`GmMarkSuggestionCompleted`、`GmRemoveSuggestion` |
| 属性 / 排行 | `RequestAttrDetail`、`RequestLeaderboard`、`RequestLeaderboardPlayerLocations`、`RequestWorldSummary` |
| 详情 / 任务 | `RequestDetail`、`RequestTileDetail`、`RequestQuests` |
| 自动战斗 | `UpdateAutoBattleSkills`、`UpdateAutoUsePills`、`UpdateCombatTargetingRules`、`UpdateAutoBattleTargetingMode`、`UpdateTechniqueSkillAvailability` |
| 聊天 / Ack | `Chat`、`AckSystemMessages`、`AckOfflineGainReports` |
| GM（Socket） | `GmGetState`、`GmSpawnBots`、`GmRemoveBots`、`GmUpdatePlayer`、`GmResetPlayer` |

### S2C 事件分组

| 分组 | 事件 |
|------|------|
| 首包 / 会话 | `Bootstrap`、`InitSession`、`MapEnter`、`MapStatic`、`Realm`、`Kick`、`Error`、`Pong` |
| 高频 tick | `WorldDelta`、`SelfDelta` |
| 面板增量 | `PanelDelta` |
| 战利品 / 任务 | `LootWindowUpdate`、`QuestNavigateResult`、`Quests`、`NpcQuests` |
| 通知 | `Notice`、`OfflineGainReports` |
| 建议 / 邮件 | `SuggestionUpdate`、`MailSummary`、`MailPage`、`MailDetail`、`MailOpResult`、`RedeemCodesResult` |
| 市场 | `MarketUpdate`、`MarketListings`、`AuctionListings`、`MarketOrders`、`MarketStorage`、`MarketItemBook`、`MarketTradeHistory` |
| 属性 / 排行 | `AttrDetail`、`Leaderboard`、`LeaderboardPlayerLocations`、`WorldSummary` |
| 详情 | `Detail`、`TileDetail` |
| NPC | `NpcShop` |
| 炼制 | `AlchemyPanel`、`EnhancementPanel` |
| 建筑 / 风水 | `BuildResult`、`RoomSummaryPatch`、`FengShuiOverlayPatch`、`FengShuiDetail` |
| GM | `GmState` |

### 服务端 handler 位置

所有 C2S 事件在 `packages/server/src/network/world.gateway.ts` 的 `handle*` 方法中聚合入口；具体逻辑委托给 `world-gateway-*.helper.ts`（按域拆分）和 `runtime/*` 服务。

### 客户端发包位置

`packages/client/src/network/socket-send-*.ts`（按域拆分：`runtime`、`panel`、`building`、`admin`、`social-economy`）。接收端通过 `socket-event-registry.ts` 注册到各个 `main-*-state-source.ts`。

### Envelope / 二进制编解码

- `packages/shared/src/protocol-envelope-types.ts`：envelope 结构
- `packages/shared/src/network-protobuf*.ts`：protobufjs schema 与 wire helpers；`tick-codecs` / `update-codecs` / `payload-codecs` 负责高频包压缩
- 服务端发包侧：`network/world-sync-envelope.service.ts`、`world-sync-protocol.service.ts`

## HTTP 路由

NestJS 原生 controller 注册于 `packages/server/src/http/native-http.registry.ts` + 根模块 `app.module.ts`。

### 主要 Controller

| Controller | 路径 | 职责 |
|------------|------|------|
| `HealthController` | `/health`、`/readiness` | 健康检查与就绪探针 |
| `NativeGmController`（`http/native/native-gm.controller.ts`） | `/gm/*` | GM 世界查询、玩家管理、地图运行时、建筑/风水审计、redeem code、邮件、建议、节点/lease 操作、数据库 state |
| `NativeGmAdminService` 支撑的路由 | `/gm/database/*` | 数据库备份/恢复/上传 |
| `WorldRuntimeController`（`runtime/world/world-runtime.controller.ts`） | `/world/*` | GM / 运维级别的运行时读写（玩家状态、实例迁移、flush、operation replay、outbox 查询、监控） |
| 其他 native controller | 账号注册/登录、数据库 state、GM 认证、玩家概览 | 在 `http/native/` 下按文件组织 |

### 典型路由（部分）

- `GET /gm/state` — GM 汇总
- `GET /gm/players/:id` — 玩家详情
- `POST /gm/players/:id` — 更新玩家
- `POST /gm/players/:id/reset` — 重置玩家
- `POST /gm/players/:id/ban` / `/unban`
- `POST /gm/bots/spawn` / `/remove`
- `POST /gm/mail/direct` / `/broadcast`
- `GET /gm/redeem-code-groups` / `POST /gm/redeem-code-groups`
- `GET /gm/suggestions` / `POST /gm/suggestions/:id/reply` / `/complete` / `/remove`
- `GET /gm/world/summary` / `/world/instances` / `/world/instances/:id/runtime`
- `POST /gm/world/instances/:id/flush` / `/rebuild` / `/freeze` / `/unfreeze` / `/migrate`
- `POST /gm/world/players/:id/flush` / `/migrate`
- `GET /gm/world/outbox-retry-queue` / `/world/dirty-backlog` / `/world/nodes`

具体 URL 前缀以 controller 装饰器为准；`world-runtime.controller.ts` 的路由在 `/world/*` 下。

### 鉴权

- 普通玩家 API：`Authorization: Bearer <JWT>`（`auth/player-token-verify.ts`）
- GM API：`X-Gm-Token` / GM session（`runtime-gm-auth.service.ts` + `world-gm-auth.service.ts`）
- Socket 鉴权：在 `Hello` 事件中提交 token，`world-player-auth.service.ts` + `world-player-token-codec.service.ts` 处理

## Shared API 契约

`packages/shared/src/api-contracts.ts` 定义 HTTP 请求 / 响应类型（GM 管理、账号、玩家、数据库等），前后端共用。

## 数据库 Schema 契约

没有 `.sql` 源文件。表结构由 persistence service 的 `ensure*Table()` 方法以 `CREATE TABLE IF NOT EXISTS` 的方式声明，启动时自动对齐：

- `player-domain-persistence.service.ts`：`ensurePlayerDomainTables()` 等
- `instance-domain-persistence.service.ts`：`ensureInstance*Table()` 系列
- `durable-operation.service.ts`：`ensureDurableOperationTables()`
- `mail-persistence.service.ts`：`ensureStructuredMailTables()`
- `market-persistence.service.ts`、`suggestion-persistence.service.ts`、`redeem-code-persistence.service.ts`、`gm-map-config-persistence.service.ts`、`tongtian-tower-persistence.service.ts` 各自 `ensure*Tables()`
- 迁移 / 升级：`schema-bigint-migration.ts`、`deploy-database-preflight.ts`

## 内容配置接口

### Config Editor 本地 API

`packages/config-editor/local-api.cjs` 监听本地端口（默认 `5174` 或参考启动脚本），提供：

- `GET /api/config-files` / `GET /api/config-files/:path` — 列出 / 读取 `packages/server/data/` 下 JSON
- `POST /api/config-files/:path` — 保存
- `GET /api/monsters` / `POST /api/monsters` — 怪物模板 CRUD
- `GET /api/techniques` / `POST /api/techniques` — 功法模板 CRUD
- `GET /api/maps` / `POST /api/maps/:id` — 地图文档 CRUD（包含 `hydrate` / `dehydrate`）
- `GET /api/editor-items` — 物品 catalog
- `POST /api/server/restart` — 重启调试服务端进程

### 服务端加载

运行时由 `ContentTemplateRepository`（`packages/server/src/content/content-template.repository.ts`）和 `MapTemplateRepository`（`packages/server/src/runtime/map/map-template.repository.ts`）从磁盘加载并归一化，为 runtime 提供不可变模板视图。

### 客户端 catalog 生成

构建期由 `scripts/` 下脚本生成：

- `scripts/generate-editor-catalog.mjs` → 供 GM / 编辑器下拉
- `packages/client/scripts/generate-item-sources.mjs` → 物品来源
- `packages/client/scripts/generate-building-catalog.mjs` → 建筑 catalog
- `packages/client/scripts/generate-i18n.mjs` → i18n 生成
- `scripts/sync-tutorial-mechanics.mjs` → 同步 `shared/src/tutorial-mechanics.generated.ts`

## 内部服务接口

### Durable Operation 资产 API

`packages/server/src/persistence/durable-operation.service.ts`：

- `purchaseNpcShopItem()`、`claimMailAttachments()`、`claimMarketStorage()`
- `settleMarketSellNow()`、`settleMarketBuyNow()`、`settleMarketCancelOrder()`
- `grantInventoryItems()`、`mutatePlayerWallet()`、`updateEquipmentLoadout()`
- `submitNpcQuestRewards()`
- `startActiveJobWithAssets()`、`completeActiveJobWithAssets()`、`cancelActiveJobWithAssets()`（炼丹 / 强化）
- `updateActiveJobState()`
- `getOperationReplay()`（幂等重放）

所有方法：幂等、审计、回滚、跨节点 lease 校验。

### World Runtime Facade

`runtime/world/world-runtime-gameplay-write-facade.service.ts`：统一写入口。`query/world-runtime-read-facade.service.ts`：统一读入口。

### 客户端事件 Bridge

`packages/client/src/network/socket-server-events.ts` 注册 S2C 事件，将载荷分发到各 `main-*-state-source.ts`；UI 层通过订阅 state source 响应变化。

## 测试 / 验证接口（冷路径）

### Root scripts

| 命令 | 作用 |
|------|------|
| `pnpm verify:quick` | 日常最小 server 门禁 |
| `pnpm verify:client` | 客户端专项 |
| `pnpm verify:building` / `verify:building:perf` | 房间 / 风水 smoke / perf |
| `pnpm verify:standard` | 合并前门禁 |
| `pnpm verify:release` / `:doctor` / `:local` / `:with-db` / `:shadow` / `:acceptance` / `:full` | 发布前多层门禁 |
| `pnpm audit:protocol` / `audit:boundaries` | 协议 / 边界审计 |
| `pnpm proof:*` | 边界 / 协议 / shared 类型来源等证明脚本 |

### Server scripts（`pnpm --filter @mud/server`）

- `smoke:*` — 领域冒烟（`smoke:combat`、`smoke:persistence`、`smoke:gm`、`smoke:auth-bootstrap`、`smoke:loot`、`smoke:runtime`、`smoke:session`、`smoke:progression`、`smoke:monster-*`、`smoke:player-*` 等）
- `bench:*` — 性能基准（`bench:tick`、`bench:sync`、`bench:combat`、`bench:combat-regression`、`bench:first-package`、`bench:building-room-fengshui`）
- `tool` / `report` / `bench` — 通过 `run-compiled-tool.ts` 调度任意编译后工具
- `database:backup-worker`、`outbox:worker`、`player:flush-worker`、`instance:*-worker`、`mail:*-worker`、`asset-audit-log-retention-worker`、`checkpoint:compaction-worker` — 生产 / 运维 worker

完整列表见 `packages/server/package.json`。

## 相关链路文档（项目已有）

- `docs/chains/链路总览.md`（最全）
- `docs/chains/登录链路.md`
- `docs/chains/战斗链路.md`
- `docs/chains/交易链路.md`
- `docs/chains/持久化链路.md`
- `docs/protocol-audit.md`（如果存在）

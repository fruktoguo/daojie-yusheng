# protocol.ts 拆分计划

## 现状

`protocol.ts`（约 36KB / ~960 行）将所有 C2S/S2C 事件名、Payload 接口和 PayloadMap 混合在一个文件中。
随着领域增长，文件已难以按职责快速定位和维护。

## 拆分目标

按业务领域将事件名和 Payload 接口拆分为独立文件，主文件 `protocol.ts` 保留为聚合再导出入口，确保外部消费者无需修改 import 路径。

## 拆分方案

### 领域文件划分

| 文件名 | 包含事件 |
|--------|----------|
| `protocol-core.ts` | Hello, Heartbeat, Ping/Pong, Kick, Error, InitSession, Bootstrap, MapEnter, MapStatic |
| `protocol-movement.ts` | Move, MoveTo, NavigateQuest, UsePortal, QuestNavigateResult |
| `protocol-combat.ts` | UseAction, CastSkill, UpdateAutoBattleSkills, UpdateAutoUsePills, UpdateCombatTargetingRules, UpdateAutoBattleTargetingMode, UpdateTechniqueSkillAvailability, CreateFormation, SetFormationActive, RefillFormation, HeavenGateAction |
| `protocol-inventory.ts` | UseItem, DropItem, DestroyItem, TakeGround, SortInventory, Equip, Unequip, StopLootHarvest, StartGather, CancelGather, LootWindowUpdate |
| `protocol-craft.ts` | RequestAlchemyPanel, SaveAlchemyPreset, DeleteAlchemyPreset, StartAlchemy, CancelAlchemy, RequestEnhancementPanel, StartEnhancement, CancelEnhancement, AlchemyPanel, EnhancementPanel |
| `protocol-market.ts` | RequestMarket, RequestMarketListings, RequestAuctionListings, RequestMarketItemBook, RequestMarketTradeHistory, CreateMarketSellOrder, CreateMarketBuyOrder, PlaceAuctionBid, BuyoutAuctionLot, BuyMarketItem, SellMarketItem, CancelMarketOrder, ClaimMarketStorage, MarketUpdate, MarketListings, AuctionListings, MarketOrders, MarketStorage, MarketItemBook, MarketTradeHistory |
| `protocol-mail.ts` | RequestMailSummary, RequestMailPage, RequestMailDetail, MarkMailRead, ClaimMailAttachments, DeleteMail, RedeemCodes, MailSummary, MailPage, MailDetail, RedeemCodesResult, MailOpResult |
| `protocol-quest.ts` | RequestQuests, RequestNpcQuests, AcceptNpcQuest, SubmitNpcQuest, Quests, NpcQuests |
| `protocol-social.ts` | Chat, AckSystemMessages, AckOfflineGainReports, Notice, OfflineGainReports, RequestSuggestions, CreateSuggestion, VoteSuggestion, ReplySuggestion, MarkSuggestionRepliesRead, SuggestionUpdate |
| `protocol-building.ts` | BuildPlaceIntent, BuildDeconstruct, RoomSetRole, FengShuiObserve, BuildResult, RoomSummaryPatch, FengShuiOverlayPatch, FengShuiDetail |
| `protocol-world.ts` | WorldDelta, SelfDelta, PanelDelta, Realm, RequestDetail, RequestTileDetail, Detail, TileDetail, RequestNpcShop, BuyNpcShopItem, NpcShop, Cultivate, RequestAttrDetail, AttrDetail, RequestLeaderboard, RequestLeaderboardPlayerLocations, RequestWorldSummary, Leaderboard, LeaderboardPlayerLocations, WorldSummary |
| `protocol-gm.ts` | GmGetState, GmSpawnBots, GmRemoveBots, GmUpdatePlayer, GmResetPlayer, GmMarkSuggestionCompleted, GmRemoveSuggestion, GmState |
| `protocol-debug.ts` | DebugResetSpawn |

### 主文件结构

```typescript
// protocol.ts — 聚合再导出入口
export * from './protocol-core';
export * from './protocol-movement';
export * from './protocol-combat';
export * from './protocol-inventory';
export * from './protocol-craft';
export * from './protocol-market';
export * from './protocol-mail';
export * from './protocol-quest';
export * from './protocol-social';
export * from './protocol-building';
export * from './protocol-world';
export * from './protocol-gm';
export * from './protocol-debug';

// C2S / S2C 常量对象和 PayloadMap 保留在主文件，
// 因为它们引用所有领域的事件名，是跨领域聚合层。
export const C2S = { ... } as const;
export const S2C = { ... } as const;
export interface C2S_PayloadMap { ... }
export interface S2C_PayloadMap { ... }
```

### 每个领域文件职责

1. 导出该领域的 Payload 接口（如 `S2C_MarketListings`）
2. 导出该领域需要的辅助类型
3. 不导出事件名常量（事件名常量统一在主文件的 `C2S` / `S2C` 对象中）

## 执行步骤

1. 创建各领域文件，将对应 Payload 接口搬入
2. 主文件改为 re-export + 事件名常量 + PayloadMap
3. 运行 `pnpm build:shared` 确认编译通过
4. 运行 `pnpm audit:protocol` 确认协议审计无回归
5. 运行 `pnpm build` 确认全量构建通过

## 注意事项

- 已有的 `protocol-request-payload-types.ts` 和 `protocol-response-payload-types.ts` 保持不变，它们是 Payload 字段级定义
- 拆分只影响 `protocol.ts` 中的接口声明和 re-export 结构
- 外部消费者（client/server）的 `import { ... } from '@mud/shared'` 不需要修改
- `protocol-envelope-types.ts`、`session-sync-types.ts`、`service-sync-types.ts` 等已有拆分文件保持现状

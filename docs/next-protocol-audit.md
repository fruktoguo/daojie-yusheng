# Next 协议审计报告

- 生成时间: 2026-04-02T17:35:35.457Z
- 目标服务: http://127.0.0.1:45584
- 运行模式: external-server
- 统计口径: 应用层 payload bytes；对象载荷按 `JSON.stringify(payload)` 的 UTF-8 字节数计算，二进制载荷按 `byteLength` 计算。
- 覆盖基线: 以 `server-next` 当前已声明并实际接线的 next socket 事件面为准；仍依赖 legacy 的 client-next 兼容流量不计入这份审计。

## 用例结果

| 用例 | 时长(ms) | C2S 观测 | S2C 观测 |
| --- | ---: | --- | --- |
| bootstrap-runtime | 1096 | Hello<br>Move<br>Ping<br>RequestTileDetail | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Pong<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>TileDetail<br>WorldDelta |
| heartbeat-chat | 416 | Chat<br>Heartbeat<br>Hello<br>Ping | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Pong<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| quest-navigation | 208 | Hello<br>NavigateQuest | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>QuestNavigateResult<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| portal-transfer | 207 | Hello<br>UsePortal | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| session-kick | 207 | Hello | Bootstrap<br>InitSession<br>Kick<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| error-path | 206 | Hello<br>RequestNpcShop | Bootstrap<br>Error<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| inventory-ops | 128 | DestroyItem<br>Hello<br>SortInventory | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| player-controls | 521 | DebugResetSpawn<br>HeavenGateAction<br>Hello<br>UpdateAutoBattleSkills<br>UseItem<br>UsePortal | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| npc-shop | 417 | BuyNpcShopItem<br>Hello<br>RequestNpcShop<br>UseAction | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>NpcShop<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| npc-detail-quests | 508 | Hello<br>RequestDetail<br>RequestNpcQuests<br>RequestQuests<br>UseAction | Bootstrap<br>Detail<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>NpcQuests<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| pending-logbook-ack | 113 | AckSystemMessages<br>Hello | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| gm-next | 844 | GmGetState<br>GmRemoveBots<br>GmResetPlayer<br>GmSpawnBots<br>GmUpdatePlayer<br>Hello | Bootstrap<br>GmState<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| suggestions | 611 | CreateSuggestion<br>Hello<br>MarkSuggestionRepliesRead<br>ReplySuggestion<br>RequestSuggestions<br>VoteSuggestion | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| mail | 715 | ClaimMailAttachments<br>DeleteMail<br>Hello<br>MarkMailRead<br>RequestMailDetail<br>RequestMailPage<br>RequestMailSummary | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailDetail<br>MailOpResult<br>MailPage<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| progression-combat | 739 | CastSkill<br>Cultivate<br>Equip<br>Hello<br>Unequip<br>UseItem | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| loot | 4303 | DropItem<br>Hello<br>Move<br>MoveTo<br>TakeGround | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| market | 1941 | BuyMarketItem<br>CancelMarketOrder<br>ClaimMarketStorage<br>CreateMarketBuyOrder<br>CreateMarketSellOrder<br>DropItem<br>Hello<br>RequestMarket<br>RequestMarketItemBook<br>RequestMarketTradeHistory<br>SellMarketItem | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>MarketItemBook<br>MarketTradeHistory<br>MarketUpdate<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |

## 客户端到服务端覆盖

| 事件名 | Wire Event | 已覆盖 | 次数 | 总流量 | 平均流量 | 用例 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Hello | `n:c:hello` | 是 | 24 | 2.33 KB | 99 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| Ping | `n:c:ping` | 是 | 2 | 34 B | 17 B | bootstrap-runtime<br>heartbeat-chat |
| Move | `n:c:move` | 是 | 2 | 14 B | 7 B | bootstrap-runtime<br>loot |
| MoveTo | `n:c:moveTo` | 是 | 1 | 44 B | 44 B | loot |
| NavigateQuest | `n:c:navigateQuest` | 是 | 1 | 37 B | 37 B | quest-navigation |
| UseAction | `n:c:useAction` | 是 | 2 | 84 B | 42 B | npc-detail-quests<br>npc-shop |
| RequestDetail | `n:c:requestDetail` | 是 | 1 | 39 B | 39 B | npc-detail-quests |
| RequestTileDetail | `n:c:requestTileDetail` | 是 | 1 | 14 B | 14 B | bootstrap-runtime |
| GmGetState | `n:c:gmGetState` | 是 | 1 | 2 B | 2 B | gm-next |
| GmSpawnBots | `n:c:gmSpawnBots` | 是 | 1 | 11 B | 11 B | gm-next |
| GmRemoveBots | `n:c:gmRemoveBots` | 是 | 1 | 12 B | 12 B | gm-next |
| GmUpdatePlayer | `n:c:gmUpdatePlayer` | 是 | 1 | 116 B | 116 B | gm-next |
| GmResetPlayer | `n:c:gmResetPlayer` | 是 | 1 | 53 B | 53 B | gm-next |
| RequestQuests | `n:c:requestQuests` | 是 | 1 | 2 B | 2 B | npc-detail-quests |
| RequestNpcQuests | `n:c:requestNpcQuests` | 是 | 1 | 29 B | 29 B | npc-detail-quests |
| UsePortal | `n:c:usePortal` | 是 | 2 | 4 B | 2 B | player-controls<br>portal-transfer |
| UseItem | `n:c:useItem` | 是 | 3 | 45 B | 15 B | player-controls<br>progression-combat |
| DropItem | `n:c:dropItem` | 是 | 2 | 50 B | 25 B | loot<br>market |
| DestroyItem | `n:c:destroyItem` | 是 | 1 | 25 B | 25 B | inventory-ops |
| TakeGround | `n:c:takeGround` | 是 | 1 | 41 B | 41 B | loot |
| SortInventory | `n:c:sortInventory` | 是 | 1 | 2 B | 2 B | inventory-ops |
| Equip | `n:c:equip` | 是 | 1 | 15 B | 15 B | progression-combat |
| Unequip | `n:c:unequip` | 是 | 1 | 17 B | 17 B | progression-combat |
| Cultivate | `n:c:cultivate` | 是 | 1 | 25 B | 25 B | progression-combat |
| CastSkill | `n:c:castSkill` | 是 | 1 | 82 B | 82 B | progression-combat |
| RequestSuggestions | `n:c:requestSuggestions` | 是 | 1 | 2 B | 2 B | suggestions |
| CreateSuggestion | `n:c:createSuggestion` | 是 | 1 | 88 B | 88 B | suggestions |
| VoteSuggestion | `n:c:voteSuggestion` | 是 | 1 | 67 B | 67 B | suggestions |
| ReplySuggestion | `n:c:replySuggestion` | 是 | 1 | 80 B | 80 B | suggestions |
| MarkSuggestionRepliesRead | `n:c:markSuggestionRepliesRead` | 是 | 1 | 55 B | 55 B | suggestions |
| RequestMailSummary | `n:c:requestMailSummary` | 是 | 1 | 2 B | 2 B | mail |
| RequestMailPage | `n:c:requestMailPage` | 是 | 1 | 24 B | 24 B | mail |
| RequestMailDetail | `n:c:requestMailDetail` | 是 | 1 | 30 B | 30 B | mail |
| MarkMailRead | `n:c:markMailRead` | 是 | 1 | 33 B | 33 B | mail |
| ClaimMailAttachments | `n:c:claimMailAttachments` | 是 | 1 | 33 B | 33 B | mail |
| DeleteMail | `n:c:deleteMail` | 是 | 1 | 33 B | 33 B | mail |
| RequestMarket | `n:c:requestMarket` | 是 | 3 | 6 B | 2 B | market |
| RequestMarketItemBook | `n:c:requestMarketItemBook` | 是 | 1 | 152 B | 152 B | market |
| RequestMarketTradeHistory | `n:c:requestMarketTradeHistory` | 是 | 1 | 10 B | 10 B | market |
| CreateMarketSellOrder | `n:c:createMarketSellOrder` | 是 | 2 | 84 B | 42 B | market |
| CreateMarketBuyOrder | `n:c:createMarketBuyOrder` | 是 | 2 | 100 B | 50 B | market |
| BuyMarketItem | `n:c:buyMarketItem` | 是 | 1 | 165 B | 165 B | market |
| SellMarketItem | `n:c:sellMarketItem` | 是 | 2 | 56 B | 28 B | market |
| CancelMarketOrder | `n:c:cancelMarketOrder` | 是 | 1 | 50 B | 50 B | market |
| ClaimMarketStorage | `n:c:claimMarketStorage` | 是 | 1 | 2 B | 2 B | market |
| RequestNpcShop | `n:c:requestNpcShop` | 是 | 2 | 41 B | 21 B | error-path<br>npc-shop |
| BuyNpcShopItem | `n:c:buyNpcShopItem` | 是 | 1 | 69 B | 69 B | npc-shop |
| UpdateAutoBattleSkills | `n:c:updateAutoBattleSkills` | 是 | 1 | 60 B | 60 B | player-controls |
| DebugResetSpawn | `n:c:debugResetSpawn` | 是 | 1 | 2 B | 2 B | player-controls |
| Chat | `n:c:chat` | 是 | 1 | 66 B | 66 B | heartbeat-chat |
| AckSystemMessages | `n:c:ackSystemMessages` | 是 | 1 | 49 B | 49 B | pending-logbook-ack |
| HeavenGateAction | `n:c:heavenGateAction` | 是 | 1 | 17 B | 17 B | player-controls |

## 服务端到客户端覆盖

| 事件名 | Wire Event | 已覆盖 | 次数 | 总流量 | 平均流量 | 用例 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Bootstrap | `n:s:bootstrap` | 是 | 24 | 1351.90 KB | 56.33 KB | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| InitSession | `n:s:initSession` | 是 | 24 | 2.30 KB | 98 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| MapEnter | `n:s:mapEnter` | 是 | 27 | 2.74 KB | 104 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| MapStatic | `n:s:mapStatic` | 是 | 33 | 786.71 KB | 23.84 KB | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| Realm | `n:s:realm` | 是 | 24 | 8.81 KB | 376 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| WorldDelta | `n:s:worldDelta` | 是 | 56 | 11.52 KB | 211 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| SelfDelta | `n:s:selfDelta` | 是 | 59 | 3.52 KB | 61 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| PanelDelta | `n:s:panelDelta` | 是 | 54 | 174.77 KB | 3.24 KB | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| LootWindowUpdate | `n:s:lootWindowUpdate` | 是 | 24 | 360 B | 15 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| QuestNavigateResult | `n:s:questNavigateResult` | 是 | 1 | 47 B | 47 B | quest-navigation |
| Notice | `n:s:notice` | 是 | 29 | 2.51 KB | 89 B | gm-next<br>heartbeat-chat<br>loot<br>market<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation |
| Quests | `n:s:quests` | 是 | 26 | 338 B | 13 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| NpcQuests | `n:s:npcQuests` | 是 | 2 | 126 B | 63 B | npc-detail-quests |
| SuggestionUpdate | `n:s:suggestionUpdate` | 是 | 29 | 9.34 KB | 330 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| MailSummary | `n:s:mailSummary` | 是 | 28 | 1.67 KB | 61 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| MailPage | `n:s:mailPage` | 是 | 1 | 628 B | 628 B | mail |
| MailDetail | `n:s:mailDetail` | 是 | 1 | 297 B | 297 B | mail |
| MailOpResult | `n:s:mailOpResult` | 是 | 3 | 239 B | 80 B | mail |
| MarketUpdate | `n:s:marketUpdate` | 是 | 30 | 9.67 KB | 330 B | market |
| MarketItemBook | `n:s:marketItemBook` | 是 | 1 | 572 B | 572 B | market |
| MarketTradeHistory | `n:s:marketTradeHistory` | 是 | 1 | 205 B | 205 B | market |
| Detail | `n:s:detail` | 是 | 1 | 585 B | 585 B | npc-detail-quests |
| TileDetail | `n:s:tileDetail` | 是 | 1 | 518 B | 518 B | bootstrap-runtime |
| NpcShop | `n:s:npcShop` | 是 | 2 | 8.24 KB | 4.12 KB | npc-shop |
| GmState | `n:s:gmState` | 是 | 5 | 9.49 KB | 1.90 KB | gm-next |
| Error | `n:s:error` | 是 | 1 | 64 B | 64 B | error-path |
| Kick | `n:s:kick` | 是 | 1 | 21 B | 21 B | session-kick |
| Pong | `n:s:pong` | 是 | 2 | 84 B | 42 B | bootstrap-runtime<br>heartbeat-chat |

## 流量汇总

| 方向 | 事件名 | Wire Event | 次数 | 总流量 | 平均流量 | 用例 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| s2c | Bootstrap | `n:s:bootstrap` | 24 | 1351.90 KB | 56.33 KB | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| s2c | MapStatic | `n:s:mapStatic` | 33 | 786.71 KB | 23.84 KB | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| s2c | PanelDelta | `n:s:panelDelta` | 54 | 174.77 KB | 3.24 KB | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| s2c | WorldDelta | `n:s:worldDelta` | 56 | 11.52 KB | 211 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| s2c | MarketUpdate | `n:s:marketUpdate` | 30 | 9.67 KB | 330 B | market |
| s2c | GmState | `n:s:gmState` | 5 | 9.49 KB | 1.90 KB | gm-next |
| s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 29 | 9.34 KB | 330 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| s2c | Realm | `n:s:realm` | 24 | 8.81 KB | 376 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| s2c | NpcShop | `n:s:npcShop` | 2 | 8.24 KB | 4.12 KB | npc-shop |
| s2c | SelfDelta | `n:s:selfDelta` | 59 | 3.52 KB | 61 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| s2c | MapEnter | `n:s:mapEnter` | 27 | 2.74 KB | 104 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| s2c | Notice | `n:s:notice` | 29 | 2.51 KB | 89 B | gm-next<br>heartbeat-chat<br>loot<br>market<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation |
| c2s | Hello | `n:c:hello` | 24 | 2.33 KB | 99 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| s2c | InitSession | `n:s:initSession` | 24 | 2.30 KB | 98 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| s2c | MailSummary | `n:s:mailSummary` | 28 | 1.67 KB | 61 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| s2c | MailPage | `n:s:mailPage` | 1 | 628 B | 628 B | mail |
| s2c | Detail | `n:s:detail` | 1 | 585 B | 585 B | npc-detail-quests |
| s2c | MarketItemBook | `n:s:marketItemBook` | 1 | 572 B | 572 B | market |
| s2c | TileDetail | `n:s:tileDetail` | 1 | 518 B | 518 B | bootstrap-runtime |
| s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 24 | 360 B | 15 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| s2c | Quests | `n:s:quests` | 26 | 338 B | 13 B | bootstrap-runtime<br>error-path<br>gm-next<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>suggestions |
| s2c | MailDetail | `n:s:mailDetail` | 1 | 297 B | 297 B | mail |
| s2c | MailOpResult | `n:s:mailOpResult` | 3 | 239 B | 80 B | mail |
| s2c | MarketTradeHistory | `n:s:marketTradeHistory` | 1 | 205 B | 205 B | market |
| c2s | BuyMarketItem | `n:c:buyMarketItem` | 1 | 165 B | 165 B | market |
| c2s | RequestMarketItemBook | `n:c:requestMarketItemBook` | 1 | 152 B | 152 B | market |
| s2c | NpcQuests | `n:s:npcQuests` | 2 | 126 B | 63 B | npc-detail-quests |
| c2s | GmUpdatePlayer | `n:c:gmUpdatePlayer` | 1 | 116 B | 116 B | gm-next |
| c2s | CreateMarketBuyOrder | `n:c:createMarketBuyOrder` | 2 | 100 B | 50 B | market |
| c2s | CreateSuggestion | `n:c:createSuggestion` | 1 | 88 B | 88 B | suggestions |
| c2s | CreateMarketSellOrder | `n:c:createMarketSellOrder` | 2 | 84 B | 42 B | market |
| c2s | UseAction | `n:c:useAction` | 2 | 84 B | 42 B | npc-detail-quests<br>npc-shop |
| s2c | Pong | `n:s:pong` | 2 | 84 B | 42 B | bootstrap-runtime<br>heartbeat-chat |
| c2s | CastSkill | `n:c:castSkill` | 1 | 82 B | 82 B | progression-combat |
| c2s | ReplySuggestion | `n:c:replySuggestion` | 1 | 80 B | 80 B | suggestions |
| c2s | BuyNpcShopItem | `n:c:buyNpcShopItem` | 1 | 69 B | 69 B | npc-shop |
| c2s | VoteSuggestion | `n:c:voteSuggestion` | 1 | 67 B | 67 B | suggestions |
| c2s | Chat | `n:c:chat` | 1 | 66 B | 66 B | heartbeat-chat |
| s2c | Error | `n:s:error` | 1 | 64 B | 64 B | error-path |
| c2s | UpdateAutoBattleSkills | `n:c:updateAutoBattleSkills` | 1 | 60 B | 60 B | player-controls |
| c2s | SellMarketItem | `n:c:sellMarketItem` | 2 | 56 B | 28 B | market |
| c2s | MarkSuggestionRepliesRead | `n:c:markSuggestionRepliesRead` | 1 | 55 B | 55 B | suggestions |
| c2s | GmResetPlayer | `n:c:gmResetPlayer` | 1 | 53 B | 53 B | gm-next |
| c2s | DropItem | `n:c:dropItem` | 2 | 50 B | 25 B | loot<br>market |
| c2s | CancelMarketOrder | `n:c:cancelMarketOrder` | 1 | 50 B | 50 B | market |
| c2s | AckSystemMessages | `n:c:ackSystemMessages` | 1 | 49 B | 49 B | pending-logbook-ack |
| s2c | QuestNavigateResult | `n:s:questNavigateResult` | 1 | 47 B | 47 B | quest-navigation |
| c2s | UseItem | `n:c:useItem` | 3 | 45 B | 15 B | player-controls<br>progression-combat |
| c2s | MoveTo | `n:c:moveTo` | 1 | 44 B | 44 B | loot |
| c2s | RequestNpcShop | `n:c:requestNpcShop` | 2 | 41 B | 21 B | error-path<br>npc-shop |
| c2s | TakeGround | `n:c:takeGround` | 1 | 41 B | 41 B | loot |
| c2s | RequestDetail | `n:c:requestDetail` | 1 | 39 B | 39 B | npc-detail-quests |
| c2s | NavigateQuest | `n:c:navigateQuest` | 1 | 37 B | 37 B | quest-navigation |
| c2s | Ping | `n:c:ping` | 2 | 34 B | 17 B | bootstrap-runtime<br>heartbeat-chat |
| c2s | ClaimMailAttachments | `n:c:claimMailAttachments` | 1 | 33 B | 33 B | mail |
| c2s | DeleteMail | `n:c:deleteMail` | 1 | 33 B | 33 B | mail |
| c2s | MarkMailRead | `n:c:markMailRead` | 1 | 33 B | 33 B | mail |
| c2s | RequestMailDetail | `n:c:requestMailDetail` | 1 | 30 B | 30 B | mail |
| c2s | RequestNpcQuests | `n:c:requestNpcQuests` | 1 | 29 B | 29 B | npc-detail-quests |
| c2s | Cultivate | `n:c:cultivate` | 1 | 25 B | 25 B | progression-combat |
| c2s | DestroyItem | `n:c:destroyItem` | 1 | 25 B | 25 B | inventory-ops |
| c2s | RequestMailPage | `n:c:requestMailPage` | 1 | 24 B | 24 B | mail |
| s2c | Kick | `n:s:kick` | 1 | 21 B | 21 B | session-kick |
| c2s | Heartbeat | `n:c:heartbeat` | 1 | 17 B | 17 B | heartbeat-chat |
| c2s | HeavenGateAction | `n:c:heavenGateAction` | 1 | 17 B | 17 B | player-controls |
| c2s | Unequip | `n:c:unequip` | 1 | 17 B | 17 B | progression-combat |
| c2s | Equip | `n:c:equip` | 1 | 15 B | 15 B | progression-combat |
| c2s | Move | `n:c:move` | 2 | 14 B | 7 B | bootstrap-runtime<br>loot |
| c2s | RequestTileDetail | `n:c:requestTileDetail` | 1 | 14 B | 14 B | bootstrap-runtime |
| c2s | GmRemoveBots | `n:c:gmRemoveBots` | 1 | 12 B | 12 B | gm-next |
| c2s | GmSpawnBots | `n:c:gmSpawnBots` | 1 | 11 B | 11 B | gm-next |
| c2s | RequestMarketTradeHistory | `n:c:requestMarketTradeHistory` | 1 | 10 B | 10 B | market |
| c2s | RequestMarket | `n:c:requestMarket` | 3 | 6 B | 2 B | market |
| c2s | UsePortal | `n:c:usePortal` | 2 | 4 B | 2 B | player-controls<br>portal-transfer |
| c2s | ClaimMarketStorage | `n:c:claimMarketStorage` | 1 | 2 B | 2 B | market |
| c2s | DebugResetSpawn | `n:c:debugResetSpawn` | 1 | 2 B | 2 B | player-controls |
| c2s | GmGetState | `n:c:gmGetState` | 1 | 2 B | 2 B | gm-next |
| c2s | RequestMailSummary | `n:c:requestMailSummary` | 1 | 2 B | 2 B | mail |
| c2s | RequestQuests | `n:c:requestQuests` | 1 | 2 B | 2 B | npc-detail-quests |
| c2s | RequestSuggestions | `n:c:requestSuggestions` | 1 | 2 B | 2 B | suggestions |
| c2s | SortInventory | `n:c:sortInventory` | 1 | 2 B | 2 B | inventory-ops |

## 未覆盖项

- 无。

## 备注

- 报告由 `packages/server-next/src/tools/next-protocol-audit.js` 自动生成。
- 本次审计主要是黑盒协议回归，不覆盖浏览器 UI、深色模式、手机布局。

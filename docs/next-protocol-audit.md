# Next 协议审计报告

- 生成时间: 2026-04-17T13:16:32.053Z
- 目标服务: http://127.0.0.1:45482
- 运行模式: external-server
- 统计口径: 应用层 payload bytes；对象载荷按 `JSON.stringify(payload)` 的 UTF-8 字节数计算，二进制载荷按 `byteLength` 计算。
- 覆盖基线: 以 `server-next` 当前已声明并实际接线的 next socket 事件面为准；仍依赖 legacy 的 client-next 兼容流量不计入这份审计。

## 用例结果

| 用例 | 时长(ms) | C2S 观测 | S2C 观测 |
| --- | ---: | --- | --- |
| bootstrap-runtime | 1071 | Hello<br>Move<br>Ping<br>RequestTileDetail | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Pong<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>TileDetail<br>WorldDelta |
| stat-panels | 410 | Hello<br>RequestAttrDetail<br>RequestLeaderboard<br>RequestWorldSummary | AttrDetail<br>Bootstrap<br>InitSession<br>Leaderboard<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta<br>WorldSummary |
| craft-panels | 9550 | CancelAlchemy<br>CancelEnhancement<br>DeleteAlchemyPreset<br>Equip<br>Hello<br>Move<br>RequestAlchemyPanel<br>RequestEnhancementPanel<br>SaveAlchemyPreset<br>StartAlchemy<br>StartEnhancement | AlchemyPanel<br>Bootstrap<br>EnhancementPanel<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| heartbeat-chat | 411 | Chat<br>Heartbeat<br>Hello<br>Ping | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Pong<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| quest-navigation | 206 | Hello<br>NavigateQuest | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>QuestNavigateResult<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| portal-transfer | 306 | Hello<br>UsePortal | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| session-kick | 106 | Hello | Bootstrap<br>InitSession<br>Kick<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| error-path | 207 | Hello<br>RequestNpcShop | Bootstrap<br>Error<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| inventory-ops | 116 | DestroyItem<br>Hello<br>SortInventory | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| player-controls | 3658 | DebugResetSpawn<br>HeavenGateAction<br>Hello<br>UpdateAutoBattleSkills<br>UpdateAutoBattleTargetingMode<br>UpdateAutoUsePills<br>UpdateCombatTargetingRules<br>UpdateTechniqueSkillAvailability<br>UseItem<br>UsePortal | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| npc-shop | 928 | BuyNpcShopItem<br>Hello<br>RequestNpcShop<br>UseAction | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>NpcShop<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| npc-detail-quests | 807 | AcceptNpcQuest<br>Hello<br>RequestDetail<br>RequestNpcQuests<br>RequestQuests<br>SubmitNpcQuest<br>UseAction | Bootstrap<br>Detail<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>NpcQuests<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| pending-logbook-ack | 362 | AckSystemMessages<br>Hello | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| suggestions | 612 | CreateSuggestion<br>Hello<br>MarkSuggestionRepliesRead<br>ReplySuggestion<br>RequestSuggestions<br>VoteSuggestion | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| mail | 713 | ClaimMailAttachments<br>DeleteMail<br>Hello<br>MarkMailRead<br>RequestMailDetail<br>RequestMailPage<br>RequestMailSummary | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailDetail<br>MailOpResult<br>MailPage<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| progression-combat | 4516 | CastSkill<br>Cultivate<br>Equip<br>Hello<br>Unequip<br>UseItem | AlchemyPanel<br>Bootstrap<br>EnhancementPanel<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| loot | 3985 | DropItem<br>Hello<br>Move<br>MoveTo<br>TakeGround | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| market | 3204 | BuyMarketItem<br>CancelMarketOrder<br>ClaimMarketStorage<br>CreateMarketBuyOrder<br>CreateMarketSellOrder<br>DropItem<br>Hello<br>RequestMarket<br>RequestMarketItemBook<br>RequestMarketListings<br>RequestMarketTradeHistory<br>SellMarketItem | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>MarketItemBook<br>MarketListings<br>MarketOrders<br>MarketStorage<br>MarketTradeHistory<br>MarketUpdate<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |

## 客户端到服务端覆盖

| 事件名 | Wire Event | 已覆盖 | 次数 | 总流量 | 平均流量 | 用例 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Hello | `n:c:hello` | 是 | 25 | 1.31 KB | 54 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| Ping | `n:c:ping` | 是 | 2 | 34 B | 17 B | bootstrap-runtime<br>heartbeat-chat |
| Move | `n:c:move` | 是 | 4 | 28 B | 7 B | bootstrap-runtime<br>craft-panels<br>loot |
| MoveTo | `n:c:moveTo` | 是 | 1 | 44 B | 44 B | loot |
| NavigateQuest | `n:c:navigateQuest` | 是 | 1 | 37 B | 37 B | quest-navigation |
| Heartbeat | `n:c:heartbeat` | 是 | 1 | 17 B | 17 B | heartbeat-chat |
| UseAction | `n:c:useAction` | 是 | 2 | 84 B | 42 B | npc-detail-quests<br>npc-shop |
| RequestDetail | `n:c:requestDetail` | 是 | 1 | 39 B | 39 B | npc-detail-quests |
| RequestTileDetail | `n:c:requestTileDetail` | 是 | 1 | 14 B | 14 B | bootstrap-runtime |
| RequestAttrDetail | `n:c:requestAttrDetail` | 是 | 1 | 2 B | 2 B | stat-panels |
| RequestLeaderboard | `n:c:requestLeaderboard` | 是 | 1 | 11 B | 11 B | stat-panels |
| RequestWorldSummary | `n:c:requestWorldSummary` | 是 | 1 | 2 B | 2 B | stat-panels |
| RequestAlchemyPanel | `n:c:requestAlchemyPanel` | 是 | 2 | 50 B | 25 B | craft-panels |
| SaveAlchemyPreset | `n:c:saveAlchemyPreset` | 是 | 1 | 210 B | 210 B | craft-panels |
| DeleteAlchemyPreset | `n:c:deleteAlchemyPreset` | 是 | 1 | 62 B | 62 B | craft-panels |
| StartAlchemy | `n:c:startAlchemy` | 是 | 1 | 178 B | 178 B | craft-panels |
| CancelAlchemy | `n:c:cancelAlchemy` | 是 | 1 | 2 B | 2 B | craft-panels |
| RequestEnhancementPanel | `n:c:requestEnhancementPanel` | 是 | 2 | 4 B | 2 B | craft-panels |
| StartEnhancement | `n:c:startEnhancement` | 是 | 1 | 63 B | 63 B | craft-panels |
| CancelEnhancement | `n:c:cancelEnhancement` | 是 | 1 | 2 B | 2 B | craft-panels |
| RequestQuests | `n:c:requestQuests` | 是 | 1 | 2 B | 2 B | npc-detail-quests |
| RequestNpcQuests | `n:c:requestNpcQuests` | 是 | 1 | 29 B | 29 B | npc-detail-quests |
| AcceptNpcQuest | `n:c:acceptNpcQuest` | 是 | 1 | 65 B | 65 B | npc-detail-quests |
| SubmitNpcQuest | `n:c:submitNpcQuest` | 是 | 1 | 65 B | 65 B | npc-detail-quests |
| UsePortal | `n:c:usePortal` | 是 | 2 | 4 B | 2 B | player-controls<br>portal-transfer |
| UseItem | `n:c:useItem` | 是 | 3 | 45 B | 15 B | player-controls<br>progression-combat |
| DropItem | `n:c:dropItem` | 是 | 2 | 50 B | 25 B | loot<br>market |
| DestroyItem | `n:c:destroyItem` | 是 | 1 | 25 B | 25 B | inventory-ops |
| TakeGround | `n:c:takeGround` | 是 | 1 | 41 B | 41 B | loot |
| SortInventory | `n:c:sortInventory` | 是 | 1 | 2 B | 2 B | inventory-ops |
| Equip | `n:c:equip` | 是 | 3 | 45 B | 15 B | craft-panels<br>progression-combat |
| Unequip | `n:c:unequip` | 是 | 1 | 17 B | 17 B | progression-combat |
| Cultivate | `n:c:cultivate` | 是 | 1 | 25 B | 25 B | progression-combat |
| CastSkill | `n:c:castSkill` | 是 | 1 | 68 B | 68 B | progression-combat |
| RequestSuggestions | `n:c:requestSuggestions` | 是 | 1 | 2 B | 2 B | suggestions |
| CreateSuggestion | `n:c:createSuggestion` | 是 | 1 | 72 B | 72 B | suggestions |
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
| RequestMarketListings | `n:c:requestMarketListings` | 是 | 1 | 89 B | 89 B | market |
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
| UpdateAutoUsePills | `n:c:updateAutoUsePills` | 是 | 1 | 56 B | 56 B | player-controls |
| UpdateCombatTargetingRules | `n:c:updateCombatTargetingRules` | 是 | 1 | 128 B | 128 B | player-controls |
| UpdateAutoBattleTargetingMode | `n:c:updateAutoBattleTargetingMode` | 是 | 1 | 18 B | 18 B | player-controls |
| UpdateTechniqueSkillAvailability | `n:c:updateTechniqueSkillAvailability` | 是 | 1 | 41 B | 41 B | player-controls |
| DebugResetSpawn | `n:c:debugResetSpawn` | 是 | 1 | 2 B | 2 B | player-controls |
| Chat | `n:c:chat` | 是 | 1 | 49 B | 49 B | heartbeat-chat |
| AckSystemMessages | `n:c:ackSystemMessages` | 是 | 1 | 36 B | 36 B | pending-logbook-ack |
| HeavenGateAction | `n:c:heavenGateAction` | 是 | 1 | 17 B | 17 B | player-controls |

## 服务端到客户端覆盖

| 事件名 | Wire Event | 已覆盖 | 次数 | 总流量 | 平均流量 | 用例 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Bootstrap | `n:s:bootstrap` | 是 | 25 | 1393.19 KB | 55.73 KB | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| InitSession | `n:s:initSession` | 是 | 25 | 1.70 KB | 69 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| MapEnter | `n:s:mapEnter` | 是 | 28 | 2.83 KB | 103 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| MapStatic | `n:s:mapStatic` | 是 | 505 | 2640.84 KB | 5.23 KB | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| Realm | `n:s:realm` | 是 | 30 | 11.02 KB | 376 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| WorldDelta | `n:s:worldDelta` | 是 | 57 | 13.04 KB | 234 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| SelfDelta | `n:s:selfDelta` | 是 | 73 | 3.89 KB | 55 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| PanelDelta | `n:s:panelDelta` | 是 | 67 | 267.36 KB | 3.99 KB | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| LootWindowUpdate | `n:s:lootWindowUpdate` | 是 | 25 | 375 B | 15 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| QuestNavigateResult | `n:s:questNavigateResult` | 是 | 1 | 47 B | 47 B | quest-navigation |
| Notice | `n:s:notice` | 是 | 37 | 3.31 KB | 92 B | craft-panels<br>heartbeat-chat<br>loot<br>market<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat |
| AttrDetail | `n:s:attrDetail` | 是 | 1 | 7.38 KB | 7.38 KB | stat-panels |
| Leaderboard | `n:s:leaderboard` | 是 | 1 | 1.23 KB | 1.23 KB | stat-panels |
| WorldSummary | `n:s:worldSummary` | 是 | 1 | 298 B | 298 B | stat-panels |
| AlchemyPanel | `n:s:alchemyPanel` | 是 | 11 | 123.42 KB | 11.22 KB | craft-panels<br>progression-combat |
| EnhancementPanel | `n:s:enhancementPanel` | 是 | 9 | 13.72 KB | 1.52 KB | craft-panels<br>progression-combat |
| Quests | `n:s:quests` | 是 | 27 | 351 B | 13 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| NpcQuests | `n:s:npcQuests` | 是 | 2 | 126 B | 63 B | npc-detail-quests |
| SuggestionUpdate | `n:s:suggestionUpdate` | 是 | 30 | 8.22 KB | 280 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| MailSummary | `n:s:mailSummary` | 是 | 29 | 1.73 KB | 61 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| MailPage | `n:s:mailPage` | 是 | 1 | 628 B | 628 B | mail |
| MailDetail | `n:s:mailDetail` | 是 | 1 | 297 B | 297 B | mail |
| MailOpResult | `n:s:mailOpResult` | 是 | 3 | 239 B | 80 B | mail |
| MarketUpdate | `n:s:marketUpdate` | 是 | 30 | 9.67 KB | 330 B | market |
| MarketItemBook | `n:s:marketItemBook` | 是 | 1 | 572 B | 572 B | market |
| MarketTradeHistory | `n:s:marketTradeHistory` | 是 | 2 | 562 B | 281 B | market |
| Detail | `n:s:detail` | 是 | 1 | 585 B | 585 B | npc-detail-quests |
| TileDetail | `n:s:tileDetail` | 是 | 1 | 492 B | 492 B | bootstrap-runtime |
| NpcShop | `n:s:npcShop` | 是 | 2 | 8.28 KB | 4.14 KB | npc-shop |
| Error | `n:s:error` | 是 | 1 | 64 B | 64 B | error-path |
| Kick | `n:s:kick` | 是 | 1 | 20 B | 20 B | session-kick |
| Pong | `n:s:pong` | 是 | 2 | 84 B | 42 B | bootstrap-runtime<br>heartbeat-chat |

## 流量汇总

| 方向 | 事件名 | Wire Event | 次数 | 总流量 | 平均流量 | 用例 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| s2c | MapStatic | `n:s:mapStatic` | 505 | 2640.84 KB | 5.23 KB | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| s2c | Bootstrap | `n:s:bootstrap` | 25 | 1393.19 KB | 55.73 KB | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| s2c | PanelDelta | `n:s:panelDelta` | 67 | 267.36 KB | 3.99 KB | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| s2c | AlchemyPanel | `n:s:alchemyPanel` | 11 | 123.42 KB | 11.22 KB | craft-panels<br>progression-combat |
| s2c | MarketListings | `n:s:marketListings` | 31 | 13.94 KB | 460 B | market |
| s2c | EnhancementPanel | `n:s:enhancementPanel` | 9 | 13.72 KB | 1.52 KB | craft-panels<br>progression-combat |
| s2c | WorldDelta | `n:s:worldDelta` | 57 | 13.04 KB | 234 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| s2c | Realm | `n:s:realm` | 30 | 11.02 KB | 376 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| s2c | MarketUpdate | `n:s:marketUpdate` | 30 | 9.67 KB | 330 B | market |
| s2c | NpcShop | `n:s:npcShop` | 2 | 8.28 KB | 4.14 KB | npc-shop |
| s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 30 | 8.22 KB | 280 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| s2c | AttrDetail | `n:s:attrDetail` | 1 | 7.38 KB | 7.38 KB | stat-panels |
| s2c | SelfDelta | `n:s:selfDelta` | 73 | 3.89 KB | 55 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| s2c | Notice | `n:s:notice` | 37 | 3.31 KB | 92 B | craft-panels<br>heartbeat-chat<br>loot<br>market<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat |
| s2c | MapEnter | `n:s:mapEnter` | 28 | 2.83 KB | 103 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| s2c | MarketOrders | `n:s:marketOrders` | 15 | 2.74 KB | 187 B | market |
| s2c | MailSummary | `n:s:mailSummary` | 29 | 1.73 KB | 61 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| s2c | InitSession | `n:s:initSession` | 25 | 1.70 KB | 69 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| c2s | Hello | `n:c:hello` | 25 | 1.31 KB | 54 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| s2c | Leaderboard | `n:s:leaderboard` | 1 | 1.23 KB | 1.23 KB | stat-panels |
| s2c | MailPage | `n:s:mailPage` | 1 | 628 B | 628 B | mail |
| s2c | Detail | `n:s:detail` | 1 | 585 B | 585 B | npc-detail-quests |
| s2c | MarketItemBook | `n:s:marketItemBook` | 1 | 572 B | 572 B | market |
| s2c | MarketTradeHistory | `n:s:marketTradeHistory` | 2 | 562 B | 281 B | market |
| s2c | MarketStorage | `n:s:marketStorage` | 15 | 498 B | 33 B | market |
| s2c | TileDetail | `n:s:tileDetail` | 1 | 492 B | 492 B | bootstrap-runtime |
| s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 25 | 375 B | 15 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| s2c | Quests | `n:s:quests` | 27 | 351 B | 13 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| s2c | WorldSummary | `n:s:worldSummary` | 1 | 298 B | 298 B | stat-panels |
| s2c | MailDetail | `n:s:mailDetail` | 1 | 297 B | 297 B | mail |
| s2c | MailOpResult | `n:s:mailOpResult` | 3 | 239 B | 80 B | mail |
| c2s | SaveAlchemyPreset | `n:c:saveAlchemyPreset` | 1 | 210 B | 210 B | craft-panels |
| c2s | StartAlchemy | `n:c:startAlchemy` | 1 | 178 B | 178 B | craft-panels |
| c2s | BuyMarketItem | `n:c:buyMarketItem` | 1 | 165 B | 165 B | market |
| c2s | RequestMarketItemBook | `n:c:requestMarketItemBook` | 1 | 152 B | 152 B | market |
| c2s | UpdateCombatTargetingRules | `n:c:updateCombatTargetingRules` | 1 | 128 B | 128 B | player-controls |
| s2c | NpcQuests | `n:s:npcQuests` | 2 | 126 B | 63 B | npc-detail-quests |
| c2s | CreateMarketBuyOrder | `n:c:createMarketBuyOrder` | 2 | 100 B | 50 B | market |
| c2s | RequestMarketListings | `n:c:requestMarketListings` | 1 | 89 B | 89 B | market |
| c2s | CreateMarketSellOrder | `n:c:createMarketSellOrder` | 2 | 84 B | 42 B | market |
| c2s | UseAction | `n:c:useAction` | 2 | 84 B | 42 B | npc-detail-quests<br>npc-shop |
| s2c | Pong | `n:s:pong` | 2 | 84 B | 42 B | bootstrap-runtime<br>heartbeat-chat |
| c2s | ReplySuggestion | `n:c:replySuggestion` | 1 | 80 B | 80 B | suggestions |
| c2s | CreateSuggestion | `n:c:createSuggestion` | 1 | 72 B | 72 B | suggestions |
| c2s | BuyNpcShopItem | `n:c:buyNpcShopItem` | 1 | 69 B | 69 B | npc-shop |
| c2s | CastSkill | `n:c:castSkill` | 1 | 68 B | 68 B | progression-combat |
| c2s | VoteSuggestion | `n:c:voteSuggestion` | 1 | 67 B | 67 B | suggestions |
| c2s | AcceptNpcQuest | `n:c:acceptNpcQuest` | 1 | 65 B | 65 B | npc-detail-quests |
| c2s | SubmitNpcQuest | `n:c:submitNpcQuest` | 1 | 65 B | 65 B | npc-detail-quests |
| s2c | Error | `n:s:error` | 1 | 64 B | 64 B | error-path |
| c2s | StartEnhancement | `n:c:startEnhancement` | 1 | 63 B | 63 B | craft-panels |
| c2s | DeleteAlchemyPreset | `n:c:deleteAlchemyPreset` | 1 | 62 B | 62 B | craft-panels |
| c2s | UpdateAutoBattleSkills | `n:c:updateAutoBattleSkills` | 1 | 60 B | 60 B | player-controls |
| c2s | SellMarketItem | `n:c:sellMarketItem` | 2 | 56 B | 28 B | market |
| c2s | UpdateAutoUsePills | `n:c:updateAutoUsePills` | 1 | 56 B | 56 B | player-controls |
| c2s | MarkSuggestionRepliesRead | `n:c:markSuggestionRepliesRead` | 1 | 55 B | 55 B | suggestions |
| c2s | DropItem | `n:c:dropItem` | 2 | 50 B | 25 B | loot<br>market |
| c2s | RequestAlchemyPanel | `n:c:requestAlchemyPanel` | 2 | 50 B | 25 B | craft-panels |
| c2s | CancelMarketOrder | `n:c:cancelMarketOrder` | 1 | 50 B | 50 B | market |
| c2s | Chat | `n:c:chat` | 1 | 49 B | 49 B | heartbeat-chat |
| s2c | QuestNavigateResult | `n:s:questNavigateResult` | 1 | 47 B | 47 B | quest-navigation |
| c2s | Equip | `n:c:equip` | 3 | 45 B | 15 B | craft-panels<br>progression-combat |
| c2s | UseItem | `n:c:useItem` | 3 | 45 B | 15 B | player-controls<br>progression-combat |
| c2s | MoveTo | `n:c:moveTo` | 1 | 44 B | 44 B | loot |
| c2s | RequestNpcShop | `n:c:requestNpcShop` | 2 | 41 B | 21 B | error-path<br>npc-shop |
| c2s | TakeGround | `n:c:takeGround` | 1 | 41 B | 41 B | loot |
| c2s | UpdateTechniqueSkillAvailability | `n:c:updateTechniqueSkillAvailability` | 1 | 41 B | 41 B | player-controls |
| c2s | RequestDetail | `n:c:requestDetail` | 1 | 39 B | 39 B | npc-detail-quests |
| c2s | NavigateQuest | `n:c:navigateQuest` | 1 | 37 B | 37 B | quest-navigation |
| c2s | AckSystemMessages | `n:c:ackSystemMessages` | 1 | 36 B | 36 B | pending-logbook-ack |
| c2s | Ping | `n:c:ping` | 2 | 34 B | 17 B | bootstrap-runtime<br>heartbeat-chat |
| c2s | ClaimMailAttachments | `n:c:claimMailAttachments` | 1 | 33 B | 33 B | mail |
| c2s | DeleteMail | `n:c:deleteMail` | 1 | 33 B | 33 B | mail |
| c2s | MarkMailRead | `n:c:markMailRead` | 1 | 33 B | 33 B | mail |
| c2s | RequestMailDetail | `n:c:requestMailDetail` | 1 | 30 B | 30 B | mail |
| c2s | RequestNpcQuests | `n:c:requestNpcQuests` | 1 | 29 B | 29 B | npc-detail-quests |
| c2s | Move | `n:c:move` | 4 | 28 B | 7 B | bootstrap-runtime<br>craft-panels<br>loot |
| c2s | Cultivate | `n:c:cultivate` | 1 | 25 B | 25 B | progression-combat |
| c2s | DestroyItem | `n:c:destroyItem` | 1 | 25 B | 25 B | inventory-ops |
| c2s | RequestMailPage | `n:c:requestMailPage` | 1 | 24 B | 24 B | mail |
| s2c | Kick | `n:s:kick` | 1 | 20 B | 20 B | session-kick |
| c2s | UpdateAutoBattleTargetingMode | `n:c:updateAutoBattleTargetingMode` | 1 | 18 B | 18 B | player-controls |
| c2s | Heartbeat | `n:c:heartbeat` | 1 | 17 B | 17 B | heartbeat-chat |
| c2s | HeavenGateAction | `n:c:heavenGateAction` | 1 | 17 B | 17 B | player-controls |
| c2s | Unequip | `n:c:unequip` | 1 | 17 B | 17 B | progression-combat |
| c2s | RequestTileDetail | `n:c:requestTileDetail` | 1 | 14 B | 14 B | bootstrap-runtime |
| c2s | RequestLeaderboard | `n:c:requestLeaderboard` | 1 | 11 B | 11 B | stat-panels |
| c2s | RequestMarketTradeHistory | `n:c:requestMarketTradeHistory` | 1 | 10 B | 10 B | market |
| c2s | RequestMarket | `n:c:requestMarket` | 3 | 6 B | 2 B | market |
| c2s | RequestEnhancementPanel | `n:c:requestEnhancementPanel` | 2 | 4 B | 2 B | craft-panels |
| c2s | UsePortal | `n:c:usePortal` | 2 | 4 B | 2 B | player-controls<br>portal-transfer |
| c2s | CancelAlchemy | `n:c:cancelAlchemy` | 1 | 2 B | 2 B | craft-panels |
| c2s | CancelEnhancement | `n:c:cancelEnhancement` | 1 | 2 B | 2 B | craft-panels |
| c2s | ClaimMarketStorage | `n:c:claimMarketStorage` | 1 | 2 B | 2 B | market |
| c2s | DebugResetSpawn | `n:c:debugResetSpawn` | 1 | 2 B | 2 B | player-controls |
| c2s | RequestAttrDetail | `n:c:requestAttrDetail` | 1 | 2 B | 2 B | stat-panels |
| c2s | RequestMailSummary | `n:c:requestMailSummary` | 1 | 2 B | 2 B | mail |
| c2s | RequestQuests | `n:c:requestQuests` | 1 | 2 B | 2 B | npc-detail-quests |
| c2s | RequestSuggestions | `n:c:requestSuggestions` | 1 | 2 B | 2 B | suggestions |
| c2s | RequestWorldSummary | `n:c:requestWorldSummary` | 1 | 2 B | 2 B | stat-panels |
| c2s | SortInventory | `n:c:sortInventory` | 1 | 2 B | 2 B | inventory-ops |

## 未覆盖项

- 无。

## 备注

- 报告由 `packages/server/src/tools/next-protocol-audit.js` 自动生成。
- 本次审计主要是黑盒协议回归，不覆盖浏览器 UI、深色模式、手机布局。

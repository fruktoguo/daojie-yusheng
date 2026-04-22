# Next 协议审计报告

- 生成时间: 2026-04-21T20:40:03.993Z
- 目标服务: http://127.0.0.1:46346
- 运行模式: external-server
- 统计口径: 应用层 payload bytes；对象载荷按 `JSON.stringify(payload)` 的 UTF-8 字节数计算，二进制载荷按 `byteLength` 计算；流量明细按单个包体逐条记录，不做事件级合并。
- 覆盖基线: 以 `server` 当前已声明并实际接线的 next socket 事件面为准；仍依赖 legacy 的 client-next 兼容流量不计入这份审计。

## 用例结果

| 用例 | 时长(ms) | C2S 观测 | S2C 观测 |
| --- | ---: | --- | --- |
| bootstrap-runtime | 1085 | Hello<br>Move<br>Ping<br>RequestTileDetail | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Pong<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>TileDetail<br>WorldDelta |
| stat-panels | 413 | Hello<br>RequestAttrDetail<br>RequestLeaderboard<br>RequestWorldSummary | AttrDetail<br>Bootstrap<br>InitSession<br>Leaderboard<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta<br>WorldSummary |
| craft-panels | 9463 | CancelAlchemy<br>CancelEnhancement<br>DeleteAlchemyPreset<br>Equip<br>Hello<br>Move<br>RequestAlchemyPanel<br>RequestEnhancementPanel<br>SaveAlchemyPreset<br>StartAlchemy<br>StartEnhancement | AlchemyPanel<br>Bootstrap<br>EnhancementPanel<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| heartbeat-chat | 415 | Chat<br>Heartbeat<br>Hello<br>Ping | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Pong<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| quest-navigation | 207 | Hello<br>NavigateQuest | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>QuestNavigateResult<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| portal-transfer | 408 | Hello<br>UsePortal | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| session-kick | 108 | Hello | Bootstrap<br>InitSession<br>Kick<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| error-path | 206 | Hello<br>RequestNpcShop | Bootstrap<br>Error<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| inventory-ops | 118 | DestroyItem<br>Hello<br>SortInventory | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| player-controls | 3575 | DebugResetSpawn<br>HeavenGateAction<br>Hello<br>UpdateAutoBattleSkills<br>UpdateAutoBattleTargetingMode<br>UpdateAutoUsePills<br>UpdateCombatTargetingRules<br>UpdateTechniqueSkillAvailability<br>UseItem<br>UsePortal | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| npc-shop | 931 | BuyNpcShopItem<br>Hello<br>RequestNpcShop<br>UseAction | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>NpcShop<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| npc-detail-quests | 809 | AcceptNpcQuest<br>Hello<br>RequestDetail<br>RequestNpcQuests<br>RequestQuests<br>SubmitNpcQuest<br>UseAction | Bootstrap<br>Detail<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>NpcQuests<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| pending-logbook-ack | 365 | AckSystemMessages<br>Hello | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| suggestions | 612 | CreateSuggestion<br>Hello<br>MarkSuggestionRepliesRead<br>ReplySuggestion<br>RequestSuggestions<br>VoteSuggestion | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| mail | 713 | ClaimMailAttachments<br>DeleteMail<br>Hello<br>MarkMailRead<br>RequestMailDetail<br>RequestMailPage<br>RequestMailSummary | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailDetail<br>MailOpResult<br>MailPage<br>MailSummary<br>MapEnter<br>MapStatic<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| progression-combat | 4550 | CastSkill<br>Cultivate<br>Equip<br>Hello<br>Unequip<br>UseAction<br>UseItem | AlchemyPanel<br>Bootstrap<br>EnhancementPanel<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| loot | 3997 | DropItem<br>Hello<br>Move<br>MoveTo<br>TakeGround | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |
| market | 3095 | BuyMarketItem<br>CancelMarketOrder<br>ClaimMarketStorage<br>CreateMarketBuyOrder<br>CreateMarketSellOrder<br>DropItem<br>Hello<br>RequestMarket<br>RequestMarketItemBook<br>RequestMarketListings<br>RequestMarketTradeHistory<br>SellMarketItem | Bootstrap<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>MarketItemBook<br>MarketListings<br>MarketOrders<br>MarketStorage<br>MarketTradeHistory<br>MarketUpdate<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |

## 客户端到服务端覆盖

| 事件名 | Wire Event | 已覆盖 | 次数 | 总流量 | 平均流量 | 用例 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Hello | `n:c:hello` | 是 | 25 | 1.31 KB | 54 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| Ping | `n:c:ping` | 是 | 2 | 34 B | 17 B | bootstrap-runtime<br>heartbeat-chat |
| Move | `n:c:move` | 是 | 4 | 28 B | 7 B | bootstrap-runtime<br>craft-panels<br>loot |
| MoveTo | `n:c:moveTo` | 是 | 1 | 44 B | 44 B | loot |
| NavigateQuest | `n:c:navigateQuest` | 是 | 1 | 37 B | 37 B | quest-navigation |
| Heartbeat | `n:c:heartbeat` | 是 | 1 | 17 B | 17 B | heartbeat-chat |
| UseAction | `n:c:useAction` | 是 | 3 | 126 B | 42 B | npc-detail-quests<br>npc-shop<br>progression-combat |
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
| UpdateCombatTargetingRules | `n:c:updateCombatTargetingRules` | 是 | 1 | 229 B | 229 B | player-controls |
| UpdateAutoBattleTargetingMode | `n:c:updateAutoBattleTargetingMode` | 是 | 1 | 18 B | 18 B | player-controls |
| UpdateTechniqueSkillAvailability | `n:c:updateTechniqueSkillAvailability` | 是 | 1 | 41 B | 41 B | player-controls |
| DebugResetSpawn | `n:c:debugResetSpawn` | 是 | 1 | 2 B | 2 B | player-controls |
| Chat | `n:c:chat` | 是 | 1 | 49 B | 49 B | heartbeat-chat |
| AckSystemMessages | `n:c:ackSystemMessages` | 是 | 1 | 36 B | 36 B | pending-logbook-ack |
| HeavenGateAction | `n:c:heavenGateAction` | 是 | 1 | 17 B | 17 B | player-controls |

## 服务端到客户端覆盖

| 事件名 | Wire Event | 已覆盖 | 次数 | 总流量 | 平均流量 | 用例 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Bootstrap | `n:s:bootstrap` | 是 | 25 | 121.91 KB | 4.88 KB | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| InitSession | `n:s:initSession` | 是 | 25 | 1.70 KB | 69 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| MapEnter | `n:s:mapEnter` | 是 | 28 | 2.83 KB | 103 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| MapStatic | `n:s:mapStatic` | 是 | 28 | 742.96 KB | 26.53 KB | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| Realm | `n:s:realm` | 是 | 30 | 11.10 KB | 379 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| WorldDelta | `n:s:worldDelta` | 是 | 62 | 25.17 KB | 416 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| SelfDelta | `n:s:selfDelta` | 是 | 73 | 3.89 KB | 55 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| PanelDelta | `n:s:panelDelta` | 是 | 70 | 165.49 KB | 2.36 KB | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| LootWindowUpdate | `n:s:lootWindowUpdate` | 是 | 25 | 375 B | 15 B | bootstrap-runtime<br>craft-panels<br>error-path<br>heartbeat-chat<br>inventory-ops<br>loot<br>mail<br>market<br>npc-detail-quests<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat<br>quest-navigation<br>session-kick<br>stat-panels<br>suggestions |
| QuestNavigateResult | `n:s:questNavigateResult` | 是 | 1 | 47 B | 47 B | quest-navigation |
| Notice | `n:s:notice` | 是 | 37 | 3.30 KB | 91 B | craft-panels<br>heartbeat-chat<br>loot<br>market<br>npc-shop<br>pending-logbook-ack<br>player-controls<br>portal-transfer<br>progression-combat |
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
| TileDetail | `n:s:tileDetail` | 是 | 1 | 538 B | 538 B | bootstrap-runtime |
| NpcShop | `n:s:npcShop` | 是 | 2 | 8.28 KB | 4.14 KB | npc-shop |
| Error | `n:s:error` | 是 | 1 | 64 B | 64 B | error-path |
| Kick | `n:s:kick` | 是 | 1 | 20 B | 20 B | session-kick |
| Pong | `n:s:pong` | 是 | 2 | 84 B | 42 B | bootstrap-runtime<br>heartbeat-chat |

## 流量明细

| 序号 | 方向 | 事件名 | Wire Event | 包体大小 | 用例 | Socket |
| ---: | --- | --- | --- | ---: | --- | --- |
| 1 | c2s | Hello | `n:c:hello` | 54 B | bootstrap-runtime | runtime |
| 2 | s2c | InitSession | `n:s:initSession` | 68 B | bootstrap-runtime | runtime |
| 3 | s2c | MapEnter | `n:s:mapEnter` | 104 B | bootstrap-runtime | runtime |
| 4 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 276 B | bootstrap-runtime | runtime |
| 5 | s2c | SelfDelta | `n:s:selfDelta` | 113 B | bootstrap-runtime | runtime |
| 6 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | bootstrap-runtime | runtime |
| 7 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | bootstrap-runtime | runtime |
| 8 | s2c | MapStatic | `n:s:mapStatic` | 27.22 KB | bootstrap-runtime | runtime |
| 9 | s2c | Realm | `n:s:realm` | 379 B | bootstrap-runtime | runtime |
| 10 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | bootstrap-runtime | runtime |
| 11 | s2c | Quests | `n:s:quests` | 13 B | bootstrap-runtime | runtime |
| 12 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 18 B | bootstrap-runtime | runtime |
| 13 | s2c | MailSummary | `n:s:mailSummary` | 61 B | bootstrap-runtime | runtime |
| 14 | c2s | Ping | `n:c:ping` | 17 B | bootstrap-runtime | runtime |
| 15 | s2c | Pong | `n:s:pong` | 42 B | bootstrap-runtime | runtime |
| 16 | c2s | Move | `n:c:move` | 7 B | bootstrap-runtime | runtime |
| 17 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 111 B | bootstrap-runtime | runtime |
| 18 | s2c | SelfDelta | `n:s:selfDelta` | 21 B | bootstrap-runtime | runtime |
| 19 | s2c | WorldDelta(tile+minimap) | `n:s:worldDelta` | 1.46 KB | bootstrap-runtime | runtime |
| 20 | c2s | RequestTileDetail | `n:c:requestTileDetail` | 14 B | bootstrap-runtime | runtime |
| 21 | s2c | TileDetail | `n:s:tileDetail` | 538 B | bootstrap-runtime | runtime |
| 22 | c2s | Hello | `n:c:hello` | 54 B | stat-panels | stat-panels |
| 23 | s2c | InitSession | `n:s:initSession` | 68 B | stat-panels | stat-panels |
| 24 | s2c | MapEnter | `n:s:mapEnter` | 104 B | stat-panels | stat-panels |
| 25 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 276 B | stat-panels | stat-panels |
| 26 | s2c | SelfDelta | `n:s:selfDelta` | 113 B | stat-panels | stat-panels |
| 27 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | stat-panels | stat-panels |
| 28 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | stat-panels | stat-panels |
| 29 | s2c | MapStatic | `n:s:mapStatic` | 27.22 KB | stat-panels | stat-panels |
| 30 | s2c | Realm | `n:s:realm` | 379 B | stat-panels | stat-panels |
| 31 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | stat-panels | stat-panels |
| 32 | s2c | Quests | `n:s:quests` | 13 B | stat-panels | stat-panels |
| 33 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 18 B | stat-panels | stat-panels |
| 34 | s2c | MailSummary | `n:s:mailSummary` | 61 B | stat-panels | stat-panels |
| 35 | c2s | RequestAttrDetail | `n:c:requestAttrDetail` | 2 B | stat-panels | stat-panels |
| 36 | s2c | AttrDetail | `n:s:attrDetail` | 7.38 KB | stat-panels | stat-panels |
| 37 | c2s | RequestLeaderboard | `n:c:requestLeaderboard` | 11 B | stat-panels | stat-panels |
| 38 | s2c | Leaderboard | `n:s:leaderboard` | 1.23 KB | stat-panels | stat-panels |
| 39 | c2s | RequestWorldSummary | `n:c:requestWorldSummary` | 2 B | stat-panels | stat-panels |
| 40 | s2c | WorldSummary | `n:s:worldSummary` | 298 B | stat-panels | stat-panels |
| 41 | c2s | Hello | `n:c:hello` | 54 B | craft-panels | craft-panels |
| 42 | s2c | InitSession | `n:s:initSession` | 68 B | craft-panels | craft-panels |
| 43 | s2c | MapEnter | `n:s:mapEnter` | 104 B | craft-panels | craft-panels |
| 44 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 276 B | craft-panels | craft-panels |
| 45 | s2c | SelfDelta | `n:s:selfDelta` | 113 B | craft-panels | craft-panels |
| 46 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | craft-panels | craft-panels |
| 47 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | craft-panels | craft-panels |
| 48 | s2c | MapStatic | `n:s:mapStatic` | 27.22 KB | craft-panels | craft-panels |
| 49 | s2c | Realm | `n:s:realm` | 379 B | craft-panels | craft-panels |
| 50 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | craft-panels | craft-panels |
| 51 | s2c | Quests | `n:s:quests` | 13 B | craft-panels | craft-panels |
| 52 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 18 B | craft-panels | craft-panels |
| 53 | s2c | MailSummary | `n:s:mailSummary` | 61 B | craft-panels | craft-panels |
| 54 | c2s | Equip | `n:c:equip` | 15 B | craft-panels | craft-panels |
| 55 | s2c | PanelDelta | `n:s:panelDelta` | 1.45 KB | craft-panels | craft-panels |
| 56 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 12.21 KB | craft-panels | craft-panels |
| 57 | s2c | EnhancementPanel | `n:s:enhancementPanel` | 49 B | craft-panels | craft-panels |
| 58 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | craft-panels | craft-panels |
| 59 | s2c | PanelDelta | `n:s:panelDelta` | 1.73 KB | craft-panels | craft-panels |
| 60 | s2c | Notice | `n:s:notice` | 66 B | craft-panels | craft-panels |
| 61 | c2s | RequestAlchemyPanel | `n:c:requestAlchemyPanel` | 25 B | craft-panels | craft-panels |
| 62 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 12.21 KB | craft-panels | craft-panels |
| 63 | c2s | SaveAlchemyPreset | `n:c:saveAlchemyPreset` | 210 B | craft-panels | craft-panels |
| 64 | s2c | PanelDelta | `n:s:panelDelta` | 588 B | craft-panels | craft-panels |
| 65 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 12.50 KB | craft-panels | craft-panels |
| 66 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | craft-panels | craft-panels |
| 67 | s2c | Notice | `n:s:notice` | 105 B | craft-panels | craft-panels |
| 68 | c2s | DeleteAlchemyPreset | `n:c:deleteAlchemyPreset` | 62 B | craft-panels | craft-panels |
| 69 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 12.21 KB | craft-panels | craft-panels |
| 70 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | craft-panels | craft-panels |
| 71 | s2c | Notice | `n:s:notice` | 105 B | craft-panels | craft-panels |
| 72 | c2s | RequestAlchemyPanel | `n:c:requestAlchemyPanel` | 25 B | craft-panels | craft-panels |
| 73 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 98 B | craft-panels | craft-panels |
| 74 | c2s | StartAlchemy | `n:c:startAlchemy` | 178 B | craft-panels | craft-panels |
| 75 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 12.71 KB | craft-panels | craft-panels |
| 76 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | craft-panels | craft-panels |
| 77 | s2c | PanelDelta | `n:s:panelDelta` | 118 B | craft-panels | craft-panels |
| 78 | s2c | Notice | `n:s:notice` | 86 B | craft-panels | craft-panels |
| 79 | c2s | Move | `n:c:move` | 7 B | craft-panels | craft-panels |
| 80 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 12.71 KB | craft-panels | craft-panels |
| 81 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 111 B | craft-panels | craft-panels |
| 82 | s2c | SelfDelta | `n:s:selfDelta` | 22 B | craft-panels | craft-panels |
| 83 | s2c | WorldDelta(tile+minimap) | `n:s:worldDelta` | 1.46 KB | craft-panels | craft-panels |
| 84 | s2c | Notice | `n:s:notice` | 99 B | craft-panels | craft-panels |
| 85 | c2s | CancelAlchemy | `n:c:cancelAlchemy` | 2 B | craft-panels | craft-panels |
| 86 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 12.21 KB | craft-panels | craft-panels |
| 87 | s2c | SelfDelta | `n:s:selfDelta` | 16 B | craft-panels | craft-panels |
| 88 | s2c | PanelDelta | `n:s:panelDelta` | 589 B | craft-panels | craft-panels |
| 89 | s2c | Notice | `n:s:notice` | 106 B | craft-panels | craft-panels |
| 90 | c2s | Equip | `n:c:equip` | 15 B | craft-panels | craft-panels |
| 91 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 12.18 KB | craft-panels | craft-panels |
| 92 | s2c | EnhancementPanel | `n:s:enhancementPanel` | 2.10 KB | craft-panels | craft-panels |
| 93 | s2c | SelfDelta | `n:s:selfDelta` | 16 B | craft-panels | craft-panels |
| 94 | s2c | PanelDelta | `n:s:panelDelta` | 2.31 KB | craft-panels | craft-panels |
| 95 | s2c | Notice | `n:s:notice` | 66 B | craft-panels | craft-panels |
| 96 | c2s | RequestEnhancementPanel | `n:c:requestEnhancementPanel` | 2 B | craft-panels | craft-panels |
| 97 | s2c | EnhancementPanel | `n:s:enhancementPanel` | 2.10 KB | craft-panels | craft-panels |
| 98 | c2s | RequestEnhancementPanel | `n:c:requestEnhancementPanel` | 2 B | craft-panels | craft-panels |
| 99 | s2c | EnhancementPanel | `n:s:enhancementPanel` | 2.10 KB | craft-panels | craft-panels |
| 100 | s2c | PanelDelta | `n:s:panelDelta` | 1.05 KB | craft-panels | craft-panels |
| 101 | c2s | StartEnhancement | `n:c:startEnhancement` | 63 B | craft-panels | craft-panels |
| 102 | s2c | EnhancementPanel | `n:s:enhancementPanel` | 2.48 KB | craft-panels | craft-panels |
| 103 | s2c | SelfDelta | `n:s:selfDelta` | 16 B | craft-panels | craft-panels |
| 104 | s2c | PanelDelta | `n:s:panelDelta` | 1.33 KB | craft-panels | craft-panels |
| 105 | s2c | Notice | `n:s:notice` | 106 B | craft-panels | craft-panels |
| 106 | c2s | Move | `n:c:move` | 7 B | craft-panels | craft-panels |
| 107 | s2c | EnhancementPanel | `n:s:enhancementPanel` | 2.48 KB | craft-panels | craft-panels |
| 108 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 164 B | craft-panels | craft-panels |
| 109 | s2c | SelfDelta | `n:s:selfDelta` | 22 B | craft-panels | craft-panels |
| 110 | s2c | WorldDelta(tile+minimap) | `n:s:worldDelta` | 4.52 KB | craft-panels | craft-panels |
| 111 | s2c | Notice | `n:s:notice` | 102 B | craft-panels | craft-panels |
| 112 | c2s | CancelEnhancement | `n:c:cancelEnhancement` | 2 B | craft-panels | craft-panels |
| 113 | s2c | EnhancementPanel | `n:s:enhancementPanel` | 2.32 KB | craft-panels | craft-panels |
| 114 | s2c | SelfDelta | `n:s:selfDelta` | 17 B | craft-panels | craft-panels |
| 115 | s2c | PanelDelta | `n:s:panelDelta` | 740 B | craft-panels | craft-panels |
| 116 | s2c | Notice | `n:s:notice` | 208 B | craft-panels | craft-panels |
| 117 | c2s | Hello | `n:c:hello` | 54 B | heartbeat-chat | chat:sender |
| 118 | s2c | InitSession | `n:s:initSession` | 69 B | heartbeat-chat | chat:sender |
| 119 | s2c | MapEnter | `n:s:mapEnter` | 104 B | heartbeat-chat | chat:sender |
| 120 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 278 B | heartbeat-chat | chat:sender |
| 121 | s2c | SelfDelta | `n:s:selfDelta` | 113 B | heartbeat-chat | chat:sender |
| 122 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | heartbeat-chat | chat:sender |
| 123 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | heartbeat-chat | chat:sender |
| 124 | s2c | MapStatic | `n:s:mapStatic` | 27.22 KB | heartbeat-chat | chat:sender |
| 125 | s2c | Realm | `n:s:realm` | 379 B | heartbeat-chat | chat:sender |
| 126 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | heartbeat-chat | chat:sender |
| 127 | s2c | Quests | `n:s:quests` | 13 B | heartbeat-chat | chat:sender |
| 128 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 18 B | heartbeat-chat | chat:sender |
| 129 | s2c | MailSummary | `n:s:mailSummary` | 61 B | heartbeat-chat | chat:sender |
| 130 | c2s | Hello | `n:c:hello` | 54 B | heartbeat-chat | chat:receiver |
| 131 | s2c | InitSession | `n:s:initSession` | 69 B | heartbeat-chat | chat:receiver |
| 132 | s2c | MapEnter | `n:s:mapEnter` | 104 B | heartbeat-chat | chat:receiver |
| 133 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 326 B | heartbeat-chat | chat:receiver |
| 134 | s2c | SelfDelta | `n:s:selfDelta` | 113 B | heartbeat-chat | chat:receiver |
| 135 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | heartbeat-chat | chat:receiver |
| 136 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | heartbeat-chat | chat:receiver |
| 137 | s2c | MapStatic | `n:s:mapStatic` | 27.20 KB | heartbeat-chat | chat:receiver |
| 138 | s2c | Realm | `n:s:realm` | 379 B | heartbeat-chat | chat:receiver |
| 139 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | heartbeat-chat | chat:receiver |
| 140 | s2c | Quests | `n:s:quests` | 13 B | heartbeat-chat | chat:receiver |
| 141 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 18 B | heartbeat-chat | chat:receiver |
| 142 | s2c | MailSummary | `n:s:mailSummary` | 61 B | heartbeat-chat | chat:receiver |
| 143 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 77 B | heartbeat-chat | chat:sender |
| 144 | c2s | Heartbeat | `n:c:heartbeat` | 17 B | heartbeat-chat | chat:sender |
| 145 | c2s | Ping | `n:c:ping` | 17 B | heartbeat-chat | chat:sender |
| 146 | s2c | Pong | `n:s:pong` | 42 B | heartbeat-chat | chat:sender |
| 147 | c2s | Chat | `n:c:chat` | 49 B | heartbeat-chat | chat:sender |
| 148 | s2c | Notice | `n:s:notice` | 98 B | heartbeat-chat | chat:sender |
| 149 | s2c | Notice | `n:s:notice` | 98 B | heartbeat-chat | chat:receiver |
| 150 | c2s | Hello | `n:c:hello` | 54 B | quest-navigation | navigate |
| 151 | s2c | InitSession | `n:s:initSession` | 69 B | quest-navigation | navigate |
| 152 | s2c | MapEnter | `n:s:mapEnter` | 104 B | quest-navigation | navigate |
| 153 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 278 B | quest-navigation | navigate |
| 154 | s2c | SelfDelta | `n:s:selfDelta` | 113 B | quest-navigation | navigate |
| 155 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | quest-navigation | navigate |
| 156 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | quest-navigation | navigate |
| 157 | s2c | MapStatic | `n:s:mapStatic` | 27.22 KB | quest-navigation | navigate |
| 158 | s2c | Realm | `n:s:realm` | 379 B | quest-navigation | navigate |
| 159 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | quest-navigation | navigate |
| 160 | s2c | Quests | `n:s:quests` | 13 B | quest-navigation | navigate |
| 161 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 18 B | quest-navigation | navigate |
| 162 | s2c | MailSummary | `n:s:mailSummary` | 61 B | quest-navigation | navigate |
| 163 | c2s | NavigateQuest | `n:c:navigateQuest` | 37 B | quest-navigation | navigate |
| 164 | s2c | QuestNavigateResult | `n:s:questNavigateResult` | 47 B | quest-navigation | navigate |
| 165 | c2s | Hello | `n:c:hello` | 55 B | portal-transfer | portal |
| 166 | s2c | InitSession | `n:s:initSession` | 69 B | portal-transfer | portal |
| 167 | s2c | MapEnter | `n:s:mapEnter` | 105 B | portal-transfer | portal |
| 168 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 577 B | portal-transfer | portal |
| 169 | s2c | SelfDelta | `n:s:selfDelta` | 114 B | portal-transfer | portal |
| 170 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | portal-transfer | portal |
| 171 | s2c | Bootstrap | `n:s:bootstrap` | 4.96 KB | portal-transfer | portal |
| 172 | s2c | MapStatic | `n:s:mapStatic` | 32.93 KB | portal-transfer | portal |
| 173 | s2c | Realm | `n:s:realm` | 379 B | portal-transfer | portal |
| 174 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | portal-transfer | portal |
| 175 | s2c | Quests | `n:s:quests` | 13 B | portal-transfer | portal |
| 176 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 18 B | portal-transfer | portal |
| 177 | s2c | MailSummary | `n:s:mailSummary` | 61 B | portal-transfer | portal |
| 178 | c2s | UsePortal | `n:c:usePortal` | 2 B | portal-transfer | portal |
| 179 | s2c | MapEnter | `n:s:mapEnter` | 98 B | portal-transfer | portal |
| 180 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 260 B | portal-transfer | portal |
| 181 | s2c | SelfDelta | `n:s:selfDelta` | 110 B | portal-transfer | portal |
| 182 | s2c | PanelDelta | `n:s:panelDelta` | 4.45 KB | portal-transfer | portal |
| 183 | s2c | MapStatic | `n:s:mapStatic` | 37.52 KB | portal-transfer | portal |
| 184 | s2c | WorldDelta | `n:s:worldDelta` | 40 B | portal-transfer | portal |
| 185 | s2c | Notice | `n:s:notice` | 71 B | portal-transfer | portal |
| 186 | c2s | Hello | `n:c:hello` | 54 B | session-kick | kick |
| 187 | s2c | InitSession | `n:s:initSession` | 69 B | session-kick | kick |
| 188 | s2c | MapEnter | `n:s:mapEnter` | 104 B | session-kick | kick |
| 189 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 278 B | session-kick | kick |
| 190 | s2c | SelfDelta | `n:s:selfDelta` | 113 B | session-kick | kick |
| 191 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | session-kick | kick |
| 192 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | session-kick | kick |
| 193 | s2c | MapStatic | `n:s:mapStatic` | 27.22 KB | session-kick | kick |
| 194 | s2c | Realm | `n:s:realm` | 379 B | session-kick | kick |
| 195 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | session-kick | kick |
| 196 | s2c | Quests | `n:s:quests` | 13 B | session-kick | kick |
| 197 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 18 B | session-kick | kick |
| 198 | s2c | MailSummary | `n:s:mailSummary` | 61 B | session-kick | kick |
| 199 | s2c | Kick | `n:s:kick` | 20 B | session-kick | kick |
| 200 | c2s | Hello | `n:c:hello` | 54 B | error-path | error |
| 201 | s2c | InitSession | `n:s:initSession` | 69 B | error-path | error |
| 202 | s2c | MapEnter | `n:s:mapEnter` | 104 B | error-path | error |
| 203 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 278 B | error-path | error |
| 204 | s2c | SelfDelta | `n:s:selfDelta` | 113 B | error-path | error |
| 205 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | error-path | error |
| 206 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | error-path | error |
| 207 | s2c | MapStatic | `n:s:mapStatic` | 27.22 KB | error-path | error |
| 208 | s2c | Realm | `n:s:realm` | 379 B | error-path | error |
| 209 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | error-path | error |
| 210 | s2c | Quests | `n:s:quests` | 13 B | error-path | error |
| 211 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 18 B | error-path | error |
| 212 | s2c | MailSummary | `n:s:mailSummary` | 61 B | error-path | error |
| 213 | c2s | RequestNpcShop | `n:c:requestNpcShop` | 12 B | error-path | error |
| 214 | s2c | Error | `n:s:error` | 64 B | error-path | error |
| 215 | c2s | Hello | `n:c:hello` | 54 B | inventory-ops | inventory |
| 216 | s2c | InitSession | `n:s:initSession` | 69 B | inventory-ops | inventory |
| 217 | s2c | MapEnter | `n:s:mapEnter` | 104 B | inventory-ops | inventory |
| 218 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 278 B | inventory-ops | inventory |
| 219 | s2c | SelfDelta | `n:s:selfDelta` | 113 B | inventory-ops | inventory |
| 220 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | inventory-ops | inventory |
| 221 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | inventory-ops | inventory |
| 222 | s2c | MapStatic | `n:s:mapStatic` | 27.22 KB | inventory-ops | inventory |
| 223 | s2c | Realm | `n:s:realm` | 379 B | inventory-ops | inventory |
| 224 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | inventory-ops | inventory |
| 225 | s2c | Quests | `n:s:quests` | 13 B | inventory-ops | inventory |
| 226 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 18 B | inventory-ops | inventory |
| 227 | s2c | MailSummary | `n:s:mailSummary` | 61 B | inventory-ops | inventory |
| 228 | c2s | SortInventory | `n:c:sortInventory` | 2 B | inventory-ops | inventory |
| 229 | c2s | DestroyItem | `n:c:destroyItem` | 25 B | inventory-ops | inventory |
| 230 | c2s | Hello | `n:c:hello` | 55 B | player-controls | controls |
| 231 | s2c | InitSession | `n:s:initSession` | 69 B | player-controls | controls |
| 232 | s2c | MapEnter | `n:s:mapEnter` | 105 B | player-controls | controls |
| 233 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 577 B | player-controls | controls |
| 234 | s2c | SelfDelta | `n:s:selfDelta` | 114 B | player-controls | controls |
| 235 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | player-controls | controls |
| 236 | s2c | Bootstrap | `n:s:bootstrap` | 4.96 KB | player-controls | controls |
| 237 | s2c | MapStatic | `n:s:mapStatic` | 32.93 KB | player-controls | controls |
| 238 | s2c | Realm | `n:s:realm` | 379 B | player-controls | controls |
| 239 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | player-controls | controls |
| 240 | s2c | Quests | `n:s:quests` | 13 B | player-controls | controls |
| 241 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 18 B | player-controls | controls |
| 242 | s2c | MailSummary | `n:s:mailSummary` | 61 B | player-controls | controls |
| 243 | c2s | UseItem | `n:c:useItem` | 15 B | player-controls | controls |
| 244 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | player-controls | controls |
| 245 | s2c | PanelDelta | `n:s:panelDelta` | 2.17 KB | player-controls | controls |
| 246 | s2c | Realm | `n:s:realm` | 379 B | player-controls | controls |
| 247 | s2c | Notice | `n:s:notice` | 72 B | player-controls | controls |
| 248 | c2s | UpdateAutoBattleSkills | `n:c:updateAutoBattleSkills` | 60 B | player-controls | controls |
| 249 | c2s | UpdateAutoUsePills | `n:c:updateAutoUsePills` | 56 B | player-controls | controls |
| 250 | c2s | UpdateCombatTargetingRules | `n:c:updateCombatTargetingRules` | 229 B | player-controls | controls |
| 251 | c2s | UpdateAutoBattleTargetingMode | `n:c:updateAutoBattleTargetingMode` | 18 B | player-controls | controls |
| 252 | c2s | UpdateTechniqueSkillAvailability | `n:c:updateTechniqueSkillAvailability` | 41 B | player-controls | controls |
| 253 | s2c | PanelDelta | `n:s:panelDelta` | 2.08 KB | player-controls | controls |
| 254 | c2s | UsePortal | `n:c:usePortal` | 2 B | player-controls | controls |
| 255 | s2c | MapEnter | `n:s:mapEnter` | 98 B | player-controls | controls |
| 256 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 260 B | player-controls | controls |
| 257 | s2c | SelfDelta | `n:s:selfDelta` | 110 B | player-controls | controls |
| 258 | s2c | PanelDelta | `n:s:panelDelta` | 5.58 KB | player-controls | controls |
| 259 | s2c | MapStatic | `n:s:mapStatic` | 37.52 KB | player-controls | controls |
| 260 | s2c | WorldDelta | `n:s:worldDelta` | 40 B | player-controls | controls |
| 261 | s2c | Notice | `n:s:notice` | 71 B | player-controls | controls |
| 262 | c2s | DebugResetSpawn | `n:c:debugResetSpawn` | 2 B | player-controls | controls |
| 263 | s2c | MapEnter | `n:s:mapEnter` | 104 B | player-controls | controls |
| 264 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 278 B | player-controls | controls |
| 265 | s2c | SelfDelta | `n:s:selfDelta` | 114 B | player-controls | controls |
| 266 | s2c | PanelDelta | `n:s:panelDelta` | 5.44 KB | player-controls | controls |
| 267 | s2c | MapStatic | `n:s:mapStatic` | 57.63 KB | player-controls | controls |
| 268 | s2c | WorldDelta | `n:s:worldDelta` | 41 B | player-controls | controls |
| 269 | s2c | Notice | `n:s:notice` | 69 B | player-controls | controls |
| 270 | c2s | HeavenGateAction | `n:c:heavenGateAction` | 17 B | player-controls | controls |
| 271 | s2c | Notice | `n:s:notice` | 71 B | player-controls | controls |
| 272 | c2s | Hello | `n:c:hello` | 55 B | npc-shop | shop |
| 273 | s2c | InitSession | `n:s:initSession` | 69 B | npc-shop | shop |
| 274 | s2c | MapEnter | `n:s:mapEnter` | 105 B | npc-shop | shop |
| 275 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 708 B | npc-shop | shop |
| 276 | s2c | SelfDelta | `n:s:selfDelta` | 114 B | npc-shop | shop |
| 277 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | npc-shop | shop |
| 278 | s2c | Bootstrap | `n:s:bootstrap` | 5.11 KB | npc-shop | shop |
| 279 | s2c | MapStatic | `n:s:mapStatic` | 13.75 KB | npc-shop | shop |
| 280 | s2c | Realm | `n:s:realm` | 379 B | npc-shop | shop |
| 281 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | npc-shop | shop |
| 282 | s2c | Quests | `n:s:quests` | 13 B | npc-shop | shop |
| 283 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 18 B | npc-shop | shop |
| 284 | s2c | MailSummary | `n:s:mailSummary` | 61 B | npc-shop | shop |
| 285 | c2s | RequestNpcShop | `n:c:requestNpcShop` | 29 B | npc-shop | shop |
| 286 | s2c | NpcShop | `n:s:npcShop` | 4.14 KB | npc-shop | shop |
| 287 | s2c | PanelDelta | `n:s:panelDelta` | 385 B | npc-shop | shop |
| 288 | c2s | UseAction | `n:c:useAction` | 41 B | npc-shop | shop |
| 289 | s2c | NpcShop | `n:s:npcShop` | 4.14 KB | npc-shop | shop |
| 290 | c2s | BuyNpcShopItem | `n:c:buyNpcShopItem` | 69 B | npc-shop | shop |
| 291 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | npc-shop | shop |
| 292 | s2c | PanelDelta | `n:s:panelDelta` | 618 B | npc-shop | shop |
| 293 | s2c | Notice | `n:s:notice` | 82 B | npc-shop | shop |
| 294 | c2s | Hello | `n:c:hello` | 55 B | npc-detail-quests | detail |
| 295 | s2c | InitSession | `n:s:initSession` | 69 B | npc-detail-quests | detail |
| 296 | s2c | MapEnter | `n:s:mapEnter` | 105 B | npc-detail-quests | detail |
| 297 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 708 B | npc-detail-quests | detail |
| 298 | s2c | SelfDelta | `n:s:selfDelta` | 114 B | npc-detail-quests | detail |
| 299 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | npc-detail-quests | detail |
| 300 | s2c | Bootstrap | `n:s:bootstrap` | 5.11 KB | npc-detail-quests | detail |
| 301 | s2c | MapStatic | `n:s:mapStatic` | 13.75 KB | npc-detail-quests | detail |
| 302 | s2c | Realm | `n:s:realm` | 379 B | npc-detail-quests | detail |
| 303 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | npc-detail-quests | detail |
| 304 | s2c | Quests | `n:s:quests` | 13 B | npc-detail-quests | detail |
| 305 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 18 B | npc-detail-quests | detail |
| 306 | s2c | MailSummary | `n:s:mailSummary` | 61 B | npc-detail-quests | detail |
| 307 | c2s | RequestDetail | `n:c:requestDetail` | 39 B | npc-detail-quests | detail |
| 308 | s2c | Detail | `n:s:detail` | 585 B | npc-detail-quests | detail |
| 309 | c2s | RequestQuests | `n:c:requestQuests` | 2 B | npc-detail-quests | detail |
| 310 | s2c | Quests | `n:s:quests` | 13 B | npc-detail-quests | detail |
| 311 | c2s | RequestNpcQuests | `n:c:requestNpcQuests` | 29 B | npc-detail-quests | detail |
| 312 | s2c | NpcQuests | `n:s:npcQuests` | 63 B | npc-detail-quests | detail |
| 313 | c2s | AcceptNpcQuest | `n:c:acceptNpcQuest` | 65 B | npc-detail-quests | detail |
| 314 | c2s | SubmitNpcQuest | `n:c:submitNpcQuest` | 65 B | npc-detail-quests | detail |
| 315 | c2s | UseAction | `n:c:useAction` | 43 B | npc-detail-quests | detail |
| 316 | s2c | NpcQuests | `n:s:npcQuests` | 63 B | npc-detail-quests | detail |
| 317 | s2c | Quests | `n:s:quests` | 13 B | npc-detail-quests | detail |
| 318 | c2s | Hello | `n:c:hello` | 54 B | pending-logbook-ack | logbook:first |
| 319 | s2c | InitSession | `n:s:initSession` | 69 B | pending-logbook-ack | logbook:first |
| 320 | s2c | MapEnter | `n:s:mapEnter` | 104 B | pending-logbook-ack | logbook:first |
| 321 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 278 B | pending-logbook-ack | logbook:first |
| 322 | s2c | SelfDelta | `n:s:selfDelta` | 113 B | pending-logbook-ack | logbook:first |
| 323 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | pending-logbook-ack | logbook:first |
| 324 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | pending-logbook-ack | logbook:first |
| 325 | s2c | MapStatic | `n:s:mapStatic` | 27.22 KB | pending-logbook-ack | logbook:first |
| 326 | s2c | Realm | `n:s:realm` | 379 B | pending-logbook-ack | logbook:first |
| 327 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | pending-logbook-ack | logbook:first |
| 328 | s2c | Quests | `n:s:quests` | 13 B | pending-logbook-ack | logbook:first |
| 329 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 18 B | pending-logbook-ack | logbook:first |
| 330 | s2c | MailSummary | `n:s:mailSummary` | 61 B | pending-logbook-ack | logbook:first |
| 331 | c2s | Hello | `n:c:hello` | 43 B | pending-logbook-ack | logbook |
| 332 | s2c | InitSession | `n:s:initSession` | 84 B | pending-logbook-ack | logbook |
| 333 | s2c | MapEnter | `n:s:mapEnter` | 104 B | pending-logbook-ack | logbook |
| 334 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 278 B | pending-logbook-ack | logbook |
| 335 | s2c | SelfDelta | `n:s:selfDelta` | 113 B | pending-logbook-ack | logbook |
| 336 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | pending-logbook-ack | logbook |
| 337 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | pending-logbook-ack | logbook |
| 338 | s2c | MapStatic | `n:s:mapStatic` | 27.22 KB | pending-logbook-ack | logbook |
| 339 | s2c | Realm | `n:s:realm` | 379 B | pending-logbook-ack | logbook |
| 340 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | pending-logbook-ack | logbook |
| 341 | s2c | Quests | `n:s:quests` | 13 B | pending-logbook-ack | logbook |
| 342 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 18 B | pending-logbook-ack | logbook |
| 343 | s2c | MailSummary | `n:s:mailSummary` | 61 B | pending-logbook-ack | logbook |
| 344 | s2c | Notice | `n:s:notice` | 188 B | pending-logbook-ack | logbook |
| 345 | c2s | AckSystemMessages | `n:c:ackSystemMessages` | 36 B | pending-logbook-ack | logbook |
| 346 | c2s | Hello | `n:c:hello` | 54 B | suggestions | suggestion |
| 347 | s2c | InitSession | `n:s:initSession` | 69 B | suggestions | suggestion |
| 348 | s2c | MapEnter | `n:s:mapEnter` | 104 B | suggestions | suggestion |
| 349 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 278 B | suggestions | suggestion |
| 350 | s2c | SelfDelta | `n:s:selfDelta` | 113 B | suggestions | suggestion |
| 351 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | suggestions | suggestion |
| 352 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | suggestions | suggestion |
| 353 | s2c | MapStatic | `n:s:mapStatic` | 27.22 KB | suggestions | suggestion |
| 354 | s2c | Realm | `n:s:realm` | 379 B | suggestions | suggestion |
| 355 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | suggestions | suggestion |
| 356 | s2c | Quests | `n:s:quests` | 13 B | suggestions | suggestion |
| 357 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 18 B | suggestions | suggestion |
| 358 | s2c | MailSummary | `n:s:mailSummary` | 61 B | suggestions | suggestion |
| 359 | c2s | RequestSuggestions | `n:c:requestSuggestions` | 2 B | suggestions | suggestion |
| 360 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 18 B | suggestions | suggestion |
| 361 | c2s | CreateSuggestion | `n:c:createSuggestion` | 72 B | suggestions | suggestion |
| 362 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 310 B | suggestions | suggestion |
| 363 | c2s | VoteSuggestion | `n:c:voteSuggestion` | 67 B | suggestions | suggestion |
| 364 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 328 B | suggestions | suggestion |
| 365 | c2s | ReplySuggestion | `n:c:replySuggestion` | 80 B | suggestions | suggestion |
| 366 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 679 B | suggestions | suggestion |
| 367 | c2s | MarkSuggestionRepliesRead | `n:c:markSuggestionRepliesRead` | 55 B | suggestions | suggestion |
| 368 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 679 B | suggestions | suggestion |
| 369 | c2s | Hello | `n:c:hello` | 54 B | mail | mail |
| 370 | s2c | InitSession | `n:s:initSession` | 69 B | mail | mail |
| 371 | s2c | MapEnter | `n:s:mapEnter` | 104 B | mail | mail |
| 372 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 278 B | mail | mail |
| 373 | s2c | SelfDelta | `n:s:selfDelta` | 113 B | mail | mail |
| 374 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | mail | mail |
| 375 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | mail | mail |
| 376 | s2c | MapStatic | `n:s:mapStatic` | 27.22 KB | mail | mail |
| 377 | s2c | Realm | `n:s:realm` | 379 B | mail | mail |
| 378 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | mail | mail |
| 379 | s2c | Quests | `n:s:quests` | 13 B | mail | mail |
| 380 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 679 B | mail | mail |
| 381 | s2c | MailSummary | `n:s:mailSummary` | 61 B | mail | mail |
| 382 | c2s | RequestMailSummary | `n:c:requestMailSummary` | 2 B | mail | mail |
| 383 | s2c | MailSummary | `n:s:mailSummary` | 61 B | mail | mail |
| 384 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | mail | mail |
| 385 | c2s | RequestMailPage | `n:c:requestMailPage` | 24 B | mail | mail |
| 386 | s2c | MailPage | `n:s:mailPage` | 628 B | mail | mail |
| 387 | c2s | RequestMailDetail | `n:c:requestMailDetail` | 30 B | mail | mail |
| 388 | s2c | MailDetail | `n:s:mailDetail` | 297 B | mail | mail |
| 389 | c2s | MarkMailRead | `n:c:markMailRead` | 33 B | mail | mail |
| 390 | s2c | MailOpResult | `n:s:mailOpResult` | 66 B | mail | mail |
| 391 | s2c | MailSummary | `n:s:mailSummary` | 61 B | mail | mail |
| 392 | c2s | ClaimMailAttachments | `n:c:claimMailAttachments` | 33 B | mail | mail |
| 393 | s2c | MailOpResult | `n:s:mailOpResult` | 109 B | mail | mail |
| 394 | s2c | MailSummary | `n:s:mailSummary` | 61 B | mail | mail |
| 395 | s2c | PanelDelta | `n:s:panelDelta` | 186 B | mail | mail |
| 396 | c2s | DeleteMail | `n:c:deleteMail` | 33 B | mail | mail |
| 397 | s2c | MailOpResult | `n:s:mailOpResult` | 64 B | mail | mail |
| 398 | s2c | MailSummary | `n:s:mailSummary` | 61 B | mail | mail |
| 399 | c2s | Hello | `n:c:hello` | 53 B | progression-combat | combat:attacker |
| 400 | s2c | InitSession | `n:s:initSession` | 69 B | progression-combat | combat:attacker |
| 401 | s2c | MapEnter | `n:s:mapEnter` | 98 B | progression-combat | combat:attacker |
| 402 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 183 B | progression-combat | combat:attacker |
| 403 | s2c | SelfDelta | `n:s:selfDelta` | 110 B | progression-combat | combat:attacker |
| 404 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | progression-combat | combat:attacker |
| 405 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | progression-combat | combat:attacker |
| 406 | s2c | MapStatic | `n:s:mapStatic` | 29.92 KB | progression-combat | combat:attacker |
| 407 | s2c | Realm | `n:s:realm` | 379 B | progression-combat | combat:attacker |
| 408 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | progression-combat | combat:attacker |
| 409 | s2c | Quests | `n:s:quests` | 13 B | progression-combat | combat:attacker |
| 410 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 679 B | progression-combat | combat:attacker |
| 411 | s2c | MailSummary | `n:s:mailSummary` | 61 B | progression-combat | combat:attacker |
| 412 | c2s | Hello | `n:c:hello` | 53 B | progression-combat | combat:defender |
| 413 | s2c | InitSession | `n:s:initSession` | 69 B | progression-combat | combat:defender |
| 414 | s2c | MapEnter | `n:s:mapEnter` | 98 B | progression-combat | combat:defender |
| 415 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 232 B | progression-combat | combat:defender |
| 416 | s2c | SelfDelta | `n:s:selfDelta` | 110 B | progression-combat | combat:defender |
| 417 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | progression-combat | combat:defender |
| 418 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | progression-combat | combat:defender |
| 419 | s2c | MapStatic | `n:s:mapStatic` | 31.37 KB | progression-combat | combat:defender |
| 420 | s2c | Realm | `n:s:realm` | 379 B | progression-combat | combat:defender |
| 421 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | progression-combat | combat:defender |
| 422 | s2c | Quests | `n:s:quests` | 13 B | progression-combat | combat:defender |
| 423 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 679 B | progression-combat | combat:defender |
| 424 | s2c | MailSummary | `n:s:mailSummary` | 61 B | progression-combat | combat:defender |
| 425 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 77 B | progression-combat | combat:attacker |
| 426 | c2s | UseItem | `n:c:useItem` | 15 B | progression-combat | combat:attacker |
| 427 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | progression-combat | combat:attacker |
| 428 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | progression-combat | combat:defender |
| 429 | s2c | PanelDelta | `n:s:panelDelta` | 2.15 KB | progression-combat | combat:attacker |
| 430 | s2c | Realm | `n:s:realm` | 379 B | progression-combat | combat:attacker |
| 431 | s2c | Notice | `n:s:notice` | 72 B | progression-combat | combat:attacker |
| 432 | c2s | Equip | `n:c:equip` | 15 B | progression-combat | combat:attacker |
| 433 | s2c | PanelDelta | `n:s:panelDelta` | 722 B | progression-combat | combat:attacker |
| 434 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 12.18 KB | progression-combat | combat:attacker |
| 435 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | progression-combat | combat:defender |
| 436 | s2c | EnhancementPanel | `n:s:enhancementPanel` | 49 B | progression-combat | combat:attacker |
| 437 | s2c | SelfDelta | `n:s:selfDelta` | 47 B | progression-combat | combat:attacker |
| 438 | s2c | PanelDelta | `n:s:panelDelta` | 1.84 KB | progression-combat | combat:attacker |
| 439 | s2c | Realm | `n:s:realm` | 379 B | progression-combat | combat:attacker |
| 440 | s2c | Notice | `n:s:notice` | 66 B | progression-combat | combat:attacker |
| 441 | c2s | Cultivate | `n:c:cultivate` | 25 B | progression-combat | combat:attacker |
| 442 | c2s | Unequip | `n:c:unequip` | 17 B | progression-combat | combat:attacker |
| 443 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 12.18 KB | progression-combat | combat:attacker |
| 444 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | progression-combat | combat:defender |
| 445 | s2c | EnhancementPanel | `n:s:enhancementPanel` | 49 B | progression-combat | combat:attacker |
| 446 | s2c | SelfDelta | `n:s:selfDelta` | 47 B | progression-combat | combat:attacker |
| 447 | s2c | PanelDelta | `n:s:panelDelta` | 1.83 KB | progression-combat | combat:attacker |
| 448 | s2c | Realm | `n:s:realm` | 379 B | progression-combat | combat:attacker |
| 449 | s2c | Notice | `n:s:notice` | 63 B | progression-combat | combat:attacker |
| 450 | c2s | UseItem | `n:c:useItem` | 15 B | progression-combat | combat:attacker |
| 451 | s2c | SelfDelta | `n:s:selfDelta` | 37 B | progression-combat | combat:attacker |
| 452 | s2c | SelfDelta | `n:s:selfDelta` | 17 B | progression-combat | combat:attacker |
| 453 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | progression-combat | combat:defender |
| 454 | s2c | PanelDelta | `n:s:panelDelta` | 1.20 KB | progression-combat | combat:attacker |
| 455 | s2c | Realm | `n:s:realm` | 379 B | progression-combat | combat:attacker |
| 456 | s2c | Notice | `n:s:notice` | 63 B | progression-combat | combat:attacker |
| 457 | c2s | UseAction | `n:c:useAction` | 42 B | progression-combat | combat:attacker |
| 458 | c2s | CastSkill | `n:c:castSkill` | 68 B | progression-combat | combat:attacker |
| 459 | s2c | PanelDelta | `n:s:panelDelta` | 635 B | progression-combat | combat:attacker |
| 460 | s2c | WorldDelta(fx) | `n:s:worldDelta` | 276 B | progression-combat | combat:attacker |
| 461 | s2c | WorldDelta(fx) | `n:s:worldDelta` | 276 B | progression-combat | combat:defender |
| 462 | s2c | SelfDelta | `n:s:selfDelta` | 26 B | progression-combat | combat:attacker |
| 463 | s2c | PanelDelta | `n:s:panelDelta` | 907 B | progression-combat | combat:attacker |
| 464 | s2c | SelfDelta | `n:s:selfDelta` | 23 B | progression-combat | combat:defender |
| 465 | s2c | PanelDelta | `n:s:panelDelta` | 630 B | progression-combat | combat:defender |
| 466 | c2s | Hello | `n:c:hello` | 54 B | loot | loot:dropper |
| 467 | s2c | InitSession | `n:s:initSession` | 69 B | loot | loot:dropper |
| 468 | s2c | MapEnter | `n:s:mapEnter` | 104 B | loot | loot:dropper |
| 469 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 278 B | loot | loot:dropper |
| 470 | s2c | SelfDelta | `n:s:selfDelta` | 113 B | loot | loot:dropper |
| 471 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | loot | loot:dropper |
| 472 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | loot | loot:dropper |
| 473 | s2c | MapStatic | `n:s:mapStatic` | 27.22 KB | loot | loot:dropper |
| 474 | s2c | Realm | `n:s:realm` | 379 B | loot | loot:dropper |
| 475 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | loot | loot:dropper |
| 476 | s2c | Quests | `n:s:quests` | 13 B | loot | loot:dropper |
| 477 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 679 B | loot | loot:dropper |
| 478 | s2c | MailSummary | `n:s:mailSummary` | 61 B | loot | loot:dropper |
| 479 | c2s | Hello | `n:c:hello` | 54 B | loot | loot:looter |
| 480 | s2c | InitSession | `n:s:initSession` | 69 B | loot | loot:looter |
| 481 | s2c | MapEnter | `n:s:mapEnter` | 104 B | loot | loot:looter |
| 482 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 326 B | loot | loot:looter |
| 483 | s2c | SelfDelta | `n:s:selfDelta` | 113 B | loot | loot:looter |
| 484 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | loot | loot:looter |
| 485 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | loot | loot:looter |
| 486 | s2c | MapStatic | `n:s:mapStatic` | 27.20 KB | loot | loot:looter |
| 487 | s2c | Realm | `n:s:realm` | 379 B | loot | loot:looter |
| 488 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | loot | loot:looter |
| 489 | s2c | Quests | `n:s:quests` | 13 B | loot | loot:looter |
| 490 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 679 B | loot | loot:looter |
| 491 | s2c | MailSummary | `n:s:mailSummary` | 61 B | loot | loot:looter |
| 492 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 77 B | loot | loot:dropper |
| 493 | c2s | DropItem | `n:c:dropItem` | 25 B | loot | loot:dropper |
| 494 | s2c | PanelDelta | `n:s:panelDelta` | 186 B | loot | loot:dropper |
| 495 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 160 B | loot | loot:dropper |
| 496 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 160 B | loot | loot:looter |
| 497 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | loot | loot:dropper |
| 498 | s2c | PanelDelta | `n:s:panelDelta` | 62 B | loot | loot:dropper |
| 499 | s2c | Notice | `n:s:notice` | 60 B | loot | loot:dropper |
| 500 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | loot | loot:looter |
| 501 | c2s | Move | `n:c:move` | 7 B | loot | loot:dropper |
| 502 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 113 B | loot | loot:dropper |
| 503 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 61 B | loot | loot:looter |
| 504 | s2c | SelfDelta | `n:s:selfDelta` | 21 B | loot | loot:dropper |
| 505 | s2c | WorldDelta(tile+minimap) | `n:s:worldDelta` | 1.46 KB | loot | loot:dropper |
| 506 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | loot | loot:looter |
| 507 | c2s | MoveTo | `n:c:moveTo` | 44 B | loot | loot:looter |
| 508 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 62 B | loot | loot:dropper |
| 509 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 62 B | loot | loot:looter |
| 510 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | loot | loot:dropper |
| 511 | s2c | SelfDelta | `n:s:selfDelta` | 21 B | loot | loot:looter |
| 512 | s2c | WorldDelta(tile) | `n:s:worldDelta` | 2.34 KB | loot | loot:looter |
| 513 | c2s | TakeGround | `n:c:takeGround` | 41 B | loot | loot:looter |
| 514 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 76 B | loot | loot:dropper |
| 515 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 76 B | loot | loot:looter |
| 516 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | loot | loot:dropper |
| 517 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | loot | loot:looter |
| 518 | s2c | PanelDelta | `n:s:panelDelta` | 186 B | loot | loot:looter |
| 519 | s2c | Notice | `n:s:notice` | 60 B | loot | loot:looter |
| 520 | c2s | Hello | `n:c:hello` | 55 B | market | market:seller |
| 521 | s2c | InitSession | `n:s:initSession` | 69 B | market | market:seller |
| 522 | s2c | MapEnter | `n:s:mapEnter` | 105 B | market | market:seller |
| 523 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 708 B | market | market:seller |
| 524 | s2c | SelfDelta | `n:s:selfDelta` | 114 B | market | market:seller |
| 525 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | market | market:seller |
| 526 | s2c | Bootstrap | `n:s:bootstrap` | 5.11 KB | market | market:seller |
| 527 | s2c | MapStatic | `n:s:mapStatic` | 13.75 KB | market | market:seller |
| 528 | s2c | Realm | `n:s:realm` | 379 B | market | market:seller |
| 529 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | market | market:seller |
| 530 | s2c | Quests | `n:s:quests` | 13 B | market | market:seller |
| 531 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 679 B | market | market:seller |
| 532 | s2c | MailSummary | `n:s:mailSummary` | 61 B | market | market:seller |
| 533 | c2s | Hello | `n:c:hello` | 55 B | market | market:buyer |
| 534 | s2c | InitSession | `n:s:initSession` | 69 B | market | market:buyer |
| 535 | s2c | MapEnter | `n:s:mapEnter` | 105 B | market | market:buyer |
| 536 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 757 B | market | market:buyer |
| 537 | s2c | SelfDelta | `n:s:selfDelta` | 114 B | market | market:buyer |
| 538 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | market | market:buyer |
| 539 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | market | market:buyer |
| 540 | s2c | MapStatic | `n:s:mapStatic` | 10.06 KB | market | market:buyer |
| 541 | s2c | Realm | `n:s:realm` | 379 B | market | market:buyer |
| 542 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | market | market:buyer |
| 543 | s2c | Quests | `n:s:quests` | 13 B | market | market:buyer |
| 544 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 679 B | market | market:buyer |
| 545 | s2c | MailSummary | `n:s:mailSummary` | 61 B | market | market:buyer |
| 546 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 78 B | market | market:seller |
| 547 | c2s | Hello | `n:c:hello` | 55 B | market | market:storage-seller |
| 548 | s2c | InitSession | `n:s:initSession` | 69 B | market | market:storage-seller |
| 549 | s2c | MapEnter | `n:s:mapEnter` | 105 B | market | market:storage-seller |
| 550 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 715 B | market | market:storage-seller |
| 551 | s2c | SelfDelta | `n:s:selfDelta` | 114 B | market | market:storage-seller |
| 552 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | market | market:storage-seller |
| 553 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | market | market:storage-seller |
| 554 | s2c | MapStatic | `n:s:mapStatic` | 11.84 KB | market | market:storage-seller |
| 555 | s2c | Realm | `n:s:realm` | 379 B | market | market:storage-seller |
| 556 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | market | market:storage-seller |
| 557 | s2c | Quests | `n:s:quests` | 13 B | market | market:storage-seller |
| 558 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 679 B | market | market:storage-seller |
| 559 | s2c | MailSummary | `n:s:mailSummary` | 61 B | market | market:storage-seller |
| 560 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 78 B | market | market:seller |
| 561 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 78 B | market | market:buyer |
| 562 | c2s | Hello | `n:c:hello` | 55 B | market | market:storage-buyer |
| 563 | s2c | InitSession | `n:s:initSession` | 69 B | market | market:storage-buyer |
| 564 | s2c | MapEnter | `n:s:mapEnter` | 105 B | market | market:storage-buyer |
| 565 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 764 B | market | market:storage-buyer |
| 566 | s2c | SelfDelta | `n:s:selfDelta` | 114 B | market | market:storage-buyer |
| 567 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | market | market:storage-buyer |
| 568 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | market | market:storage-buyer |
| 569 | s2c | MapStatic | `n:s:mapStatic` | 11.71 KB | market | market:storage-buyer |
| 570 | s2c | Realm | `n:s:realm` | 379 B | market | market:storage-buyer |
| 571 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | market | market:storage-buyer |
| 572 | s2c | Quests | `n:s:quests` | 13 B | market | market:storage-buyer |
| 573 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 679 B | market | market:storage-buyer |
| 574 | s2c | MailSummary | `n:s:mailSummary` | 61 B | market | market:storage-buyer |
| 575 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 78 B | market | market:seller |
| 576 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 78 B | market | market:buyer |
| 577 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 78 B | market | market:storage-seller |
| 578 | c2s | RequestMarket | `n:c:requestMarket` | 2 B | market | market:seller |
| 579 | s2c | MarketUpdate | `n:s:marketUpdate` | 115 B | market | market:seller |
| 580 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:seller |
| 581 | s2c | MarketOrders | `n:s:marketOrders` | 73 B | market | market:seller |
| 582 | s2c | MarketStorage | `n:s:marketStorage` | 12 B | market | market:seller |
| 583 | c2s | RequestMarket | `n:c:requestMarket` | 2 B | market | market:buyer |
| 584 | s2c | MarketUpdate | `n:s:marketUpdate` | 115 B | market | market:buyer |
| 585 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:buyer |
| 586 | s2c | MarketOrders | `n:s:marketOrders` | 73 B | market | market:buyer |
| 587 | s2c | MarketStorage | `n:s:marketStorage` | 12 B | market | market:buyer |
| 588 | c2s | RequestMarket | `n:c:requestMarket` | 2 B | market | market:storage-buyer |
| 589 | s2c | MarketUpdate | `n:s:marketUpdate` | 115 B | market | market:storage-buyer |
| 590 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:storage-buyer |
| 591 | s2c | MarketOrders | `n:s:marketOrders` | 73 B | market | market:storage-buyer |
| 592 | s2c | MarketStorage | `n:s:marketStorage` | 12 B | market | market:storage-buyer |
| 593 | c2s | RequestMarketListings | `n:c:requestMarketListings` | 89 B | market | market:buyer |
| 594 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:buyer |
| 595 | c2s | CreateMarketSellOrder | `n:c:createMarketSellOrder` | 42 B | market | market:seller |
| 596 | s2c | MarketOrders | `n:s:marketOrders` | 497 B | market | market:seller |
| 597 | s2c | MarketListings | `n:s:marketListings` | 909 B | market | market:buyer |
| 598 | s2c | MarketListings | `n:s:marketListings` | 909 B | market | market:storage-buyer |
| 599 | s2c | MarketStorage | `n:s:marketStorage` | 12 B | market | market:seller |
| 600 | s2c | MarketListings | `n:s:marketListings` | 909 B | market | market:seller |
| 601 | s2c | MarketUpdate | `n:s:marketUpdate` | 917 B | market | market:seller |
| 602 | s2c | MarketUpdate | `n:s:marketUpdate` | 493 B | market | market:buyer |
| 603 | s2c | MarketUpdate | `n:s:marketUpdate` | 493 B | market | market:storage-buyer |
| 604 | s2c | PanelDelta | `n:s:panelDelta` | 186 B | market | market:seller |
| 605 | s2c | PanelDelta | `n:s:panelDelta` | 385 B | market | market:buyer |
| 606 | s2c | Notice | `n:s:notice` | 87 B | market | market:seller |
| 607 | c2s | RequestMarketItemBook | `n:c:requestMarketItemBook` | 152 B | market | market:buyer |
| 608 | s2c | MarketItemBook | `n:s:marketItemBook` | 572 B | market | market:buyer |
| 609 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | market | market:seller |
| 610 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | market | market:buyer |
| 611 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | market | market:storage-seller |
| 612 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | market | market:storage-buyer |
| 613 | c2s | BuyMarketItem | `n:c:buyMarketItem` | 165 B | market | market:buyer |
| 614 | s2c | MarketOrders | `n:s:marketOrders` | 73 B | market | market:buyer |
| 615 | s2c | MarketOrders | `n:s:marketOrders` | 73 B | market | market:seller |
| 616 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:storage-buyer |
| 617 | s2c | MarketStorage | `n:s:marketStorage` | 12 B | market | market:buyer |
| 618 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:buyer |
| 619 | s2c | MarketUpdate | `n:s:marketUpdate` | 115 B | market | market:buyer |
| 620 | s2c | MarketUpdate | `n:s:marketUpdate` | 115 B | market | market:storage-buyer |
| 621 | s2c | MarketStorage | `n:s:marketStorage` | 12 B | market | market:seller |
| 622 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:seller |
| 623 | s2c | MarketUpdate | `n:s:marketUpdate` | 115 B | market | market:seller |
| 624 | c2s | RequestMarketTradeHistory | `n:c:requestMarketTradeHistory` | 10 B | market | market:buyer |
| 625 | s2c | MarketTradeHistory | `n:s:marketTradeHistory` | 205 B | market | market:buyer |
| 626 | s2c | PanelDelta | `n:s:panelDelta` | 384 B | market | market:seller |
| 627 | s2c | PanelDelta | `n:s:panelDelta` | 537 B | market | market:buyer |
| 628 | s2c | Notice | `n:s:notice` | 80 B | market | market:seller |
| 629 | s2c | Notice | `n:s:notice` | 91 B | market | market:buyer |
| 630 | c2s | CreateMarketBuyOrder | `n:c:createMarketBuyOrder` | 48 B | market | market:buyer |
| 631 | s2c | MarketOrders | `n:s:marketOrders` | 496 B | market | market:buyer |
| 632 | s2c | MarketListings | `n:s:marketListings` | 909 B | market | market:seller |
| 633 | s2c | MarketListings | `n:s:marketListings` | 909 B | market | market:storage-buyer |
| 634 | s2c | MarketStorage | `n:s:marketStorage` | 12 B | market | market:buyer |
| 635 | s2c | MarketListings | `n:s:marketListings` | 909 B | market | market:buyer |
| 636 | s2c | MarketUpdate | `n:s:marketUpdate` | 916 B | market | market:buyer |
| 637 | s2c | MarketUpdate | `n:s:marketUpdate` | 493 B | market | market:storage-buyer |
| 638 | s2c | MarketUpdate | `n:s:marketUpdate` | 493 B | market | market:seller |
| 639 | s2c | PanelDelta | `n:s:panelDelta` | 376 B | market | market:buyer |
| 640 | s2c | Notice | `n:s:notice` | 93 B | market | market:buyer |
| 641 | c2s | SellMarketItem | `n:c:sellMarketItem` | 28 B | market | market:seller |
| 642 | s2c | MarketOrders | `n:s:marketOrders` | 73 B | market | market:seller |
| 643 | s2c | MarketOrders | `n:s:marketOrders` | 73 B | market | market:buyer |
| 644 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:storage-buyer |
| 645 | s2c | MarketStorage | `n:s:marketStorage` | 12 B | market | market:seller |
| 646 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:seller |
| 647 | s2c | MarketUpdate | `n:s:marketUpdate` | 115 B | market | market:seller |
| 648 | s2c | MarketStorage | `n:s:marketStorage` | 12 B | market | market:buyer |
| 649 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:buyer |
| 650 | s2c | MarketUpdate | `n:s:marketUpdate` | 115 B | market | market:buyer |
| 651 | s2c | MarketTradeHistory | `n:s:marketTradeHistory` | 357 B | market | market:buyer |
| 652 | s2c | MarketUpdate | `n:s:marketUpdate` | 115 B | market | market:storage-buyer |
| 653 | c2s | CreateMarketSellOrder | `n:c:createMarketSellOrder` | 42 B | market | market:seller |
| 654 | s2c | MarketOrders | `n:s:marketOrders` | 497 B | market | market:seller |
| 655 | s2c | MarketListings | `n:s:marketListings` | 909 B | market | market:buyer |
| 656 | s2c | MarketListings | `n:s:marketListings` | 909 B | market | market:storage-buyer |
| 657 | s2c | MarketUpdate | `n:s:marketUpdate` | 493 B | market | market:storage-buyer |
| 658 | s2c | MarketStorage | `n:s:marketStorage` | 12 B | market | market:seller |
| 659 | s2c | MarketListings | `n:s:marketListings` | 909 B | market | market:seller |
| 660 | s2c | MarketUpdate | `n:s:marketUpdate` | 917 B | market | market:seller |
| 661 | s2c | MarketUpdate | `n:s:marketUpdate` | 493 B | market | market:buyer |
| 662 | s2c | PanelDelta | `n:s:panelDelta` | 527 B | market | market:seller |
| 663 | s2c | PanelDelta | `n:s:panelDelta` | 177 B | market | market:buyer |
| 664 | s2c | Notice | `n:s:notice` | 167 B | market | market:seller |
| 665 | s2c | Notice | `n:s:notice` | 80 B | market | market:buyer |
| 666 | c2s | CancelMarketOrder | `n:c:cancelMarketOrder` | 50 B | market | market:seller |
| 667 | s2c | MarketOrders | `n:s:marketOrders` | 73 B | market | market:seller |
| 668 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:buyer |
| 669 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:storage-buyer |
| 670 | s2c | MarketUpdate | `n:s:marketUpdate` | 115 B | market | market:buyer |
| 671 | s2c | MarketUpdate | `n:s:marketUpdate` | 115 B | market | market:storage-buyer |
| 672 | s2c | MarketStorage | `n:s:marketStorage` | 12 B | market | market:seller |
| 673 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:seller |
| 674 | s2c | MarketUpdate | `n:s:marketUpdate` | 115 B | market | market:seller |
| 675 | s2c | PanelDelta | `n:s:panelDelta` | 177 B | market | market:seller |
| 676 | s2c | Notice | `n:s:notice` | 92 B | market | market:seller |
| 677 | s2c | PanelDelta | `n:s:panelDelta` | 1.45 KB | market | market:storage-buyer |
| 678 | s2c | PanelDelta | `n:s:panelDelta` | 9.42 KB | market | market:storage-buyer |
| 679 | s2c | PanelDelta | `n:s:panelDelta` | 16.16 KB | market | market:storage-buyer |
| 680 | s2c | PanelDelta | `n:s:panelDelta` | 10.27 KB | market | market:storage-buyer |
| 681 | s2c | PanelDelta | `n:s:panelDelta` | 10.20 KB | market | market:storage-buyer |
| 682 | c2s | CreateMarketBuyOrder | `n:c:createMarketBuyOrder` | 52 B | market | market:storage-buyer |
| 683 | s2c | MarketOrders | `n:s:marketOrders` | 516 B | market | market:storage-buyer |
| 684 | s2c | MarketListings | `n:s:marketListings` | 953 B | market | market:seller |
| 685 | s2c | MarketListings | `n:s:marketListings` | 953 B | market | market:buyer |
| 686 | s2c | MarketStorage | `n:s:marketStorage` | 12 B | market | market:storage-buyer |
| 687 | s2c | MarketListings | `n:s:marketListings` | 953 B | market | market:storage-buyer |
| 688 | s2c | MarketUpdate | `n:s:marketUpdate` | 956 B | market | market:storage-buyer |
| 689 | s2c | MarketUpdate | `n:s:marketUpdate` | 513 B | market | market:seller |
| 690 | s2c | MarketUpdate | `n:s:marketUpdate` | 513 B | market | market:buyer |
| 691 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | market | market:seller |
| 692 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | market | market:buyer |
| 693 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | market | market:storage-seller |
| 694 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | market | market:storage-buyer |
| 695 | s2c | PanelDelta | `n:s:panelDelta` | 12.10 KB | market | market:storage-buyer |
| 696 | s2c | Notice | `n:s:notice` | 96 B | market | market:storage-buyer |
| 697 | c2s | SellMarketItem | `n:c:sellMarketItem` | 28 B | market | market:storage-seller |
| 698 | s2c | MarketOrders | `n:s:marketOrders` | 73 B | market | market:storage-seller |
| 699 | s2c | MarketOrders | `n:s:marketOrders` | 73 B | market | market:storage-buyer |
| 700 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:seller |
| 701 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:buyer |
| 702 | s2c | MarketStorage | `n:s:marketStorage` | 12 B | market | market:storage-seller |
| 703 | s2c | MarketStorage | `n:s:marketStorage` | 330 B | market | market:storage-buyer |
| 704 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:storage-buyer |
| 705 | s2c | MarketUpdate | `n:s:marketUpdate` | 253 B | market | market:storage-buyer |
| 706 | s2c | MarketUpdate | `n:s:marketUpdate` | 115 B | market | market:seller |
| 707 | s2c | MarketUpdate | `n:s:marketUpdate` | 115 B | market | market:buyer |
| 708 | s2c | PanelDelta | `n:s:panelDelta` | 384 B | market | market:storage-seller |
| 709 | s2c | Notice | `n:s:notice` | 83 B | market | market:storage-buyer |
| 710 | s2c | Notice | `n:s:notice` | 94 B | market | market:storage-seller |
| 711 | c2s | DropItem | `n:c:dropItem` | 25 B | market | market:storage-buyer |
| 712 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 191 B | market | market:seller |
| 713 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 191 B | market | market:buyer |
| 714 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 191 B | market | market:storage-seller |
| 715 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 191 B | market | market:storage-buyer |
| 716 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | market | market:seller |
| 717 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | market | market:buyer |
| 718 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | market | market:storage-seller |
| 719 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | market | market:storage-buyer |
| 720 | s2c | PanelDelta | `n:s:panelDelta` | 58.54 KB | market | market:storage-buyer |
| 721 | s2c | Notice | `n:s:notice` | 66 B | market | market:storage-buyer |
| 722 | c2s | ClaimMarketStorage | `n:c:claimMarketStorage` | 2 B | market | market:storage-buyer |
| 723 | s2c | MarketOrders | `n:s:marketOrders` | 73 B | market | market:storage-buyer |
| 724 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:seller |
| 725 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:buyer |
| 726 | s2c | MarketStorage | `n:s:marketStorage` | 12 B | market | market:storage-buyer |
| 727 | s2c | MarketListings | `n:s:marketListings` | 170 B | market | market:storage-buyer |
| 728 | s2c | MarketUpdate | `n:s:marketUpdate` | 115 B | market | market:storage-buyer |
| 729 | s2c | MarketUpdate | `n:s:marketUpdate` | 115 B | market | market:buyer |
| 730 | s2c | MarketUpdate | `n:s:marketUpdate` | 115 B | market | market:seller |
| 731 | s2c | PanelDelta | `n:s:panelDelta` | 202 B | market | market:storage-buyer |
| 732 | s2c | Notice | `n:s:notice` | 101 B | market | market:storage-buyer |

## 未覆盖项

- 无。

## 备注

- 报告由 `packages/server/src/tools/protocol-audit.ts` 自动生成。
- 本次审计主要是黑盒协议回归，不覆盖浏览器 UI、深色模式、手机布局。

# 协议审计报告

- 生成时间: 2026-04-22T20:58:48.630Z
- 目标服务: http://127.0.0.1:45640
- 运行模式: isolated-server
- 统计口径: 应用层 payload bytes；对象载荷按 `JSON.stringify(payload)` 的 UTF-8 字节数计算，二进制载荷按 `byteLength` 计算；流量明细按单个包体逐条记录，不做事件级合并。
- 覆盖基线: 以 `server` 当前已声明并实际接线的主线 socket 事件面为准；仍依赖 legacy 的归档兼容流量不计入这份审计。

## 用例结果

| 用例 | 时长(ms) | C2S 观测 | S2C 观测 |
| --- | ---: | --- | --- |
| craft-panels | 10062 | CancelAlchemy<br>CancelEnhancement<br>DeleteAlchemyPreset<br>Equip<br>Move<br>RequestAlchemyPanel<br>RequestEnhancementPanel<br>SaveAlchemyPreset<br>StartAlchemy<br>StartEnhancement | AlchemyPanel<br>Bootstrap<br>EnhancementPanel<br>InitSession<br>LootWindowUpdate<br>MailSummary<br>MapEnter<br>MapStatic<br>Notice<br>PanelDelta<br>Quests<br>Realm<br>SelfDelta<br>SuggestionUpdate<br>WorldDelta |

## 客户端到服务端覆盖

| 事件名 | Wire Event | 已覆盖 | 次数 | 总流量 | 平均流量 | 用例 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Hello | `n:c:hello` | 否 | 0 | 0 B | 0 B | - |
| Ping | `n:c:ping` | 否 | 0 | 0 B | 0 B | - |
| Move | `n:c:move` | 是 | 2 | 14 B | 7 B | craft-panels |
| MoveTo | `n:c:moveTo` | 否 | 0 | 0 B | 0 B | - |
| NavigateQuest | `n:c:navigateQuest` | 否 | 0 | 0 B | 0 B | - |
| Heartbeat | `n:c:heartbeat` | 否 | 0 | 0 B | 0 B | - |
| UseAction | `n:c:useAction` | 否 | 0 | 0 B | 0 B | - |
| RequestDetail | `n:c:requestDetail` | 否 | 0 | 0 B | 0 B | - |
| RequestTileDetail | `n:c:requestTileDetail` | 否 | 0 | 0 B | 0 B | - |
| RequestAttrDetail | `n:c:requestAttrDetail` | 否 | 0 | 0 B | 0 B | - |
| RequestLeaderboard | `n:c:requestLeaderboard` | 否 | 0 | 0 B | 0 B | - |
| RequestWorldSummary | `n:c:requestWorldSummary` | 否 | 0 | 0 B | 0 B | - |
| RequestAlchemyPanel | `n:c:requestAlchemyPanel` | 是 | 2 | 50 B | 25 B | craft-panels |
| SaveAlchemyPreset | `n:c:saveAlchemyPreset` | 是 | 1 | 232 B | 232 B | craft-panels |
| DeleteAlchemyPreset | `n:c:deleteAlchemyPreset` | 是 | 1 | 62 B | 62 B | craft-panels |
| StartAlchemy | `n:c:startAlchemy` | 是 | 1 | 178 B | 178 B | craft-panels |
| CancelAlchemy | `n:c:cancelAlchemy` | 是 | 1 | 2 B | 2 B | craft-panels |
| RequestEnhancementPanel | `n:c:requestEnhancementPanel` | 是 | 2 | 4 B | 2 B | craft-panels |
| StartEnhancement | `n:c:startEnhancement` | 是 | 1 | 63 B | 63 B | craft-panels |
| CancelEnhancement | `n:c:cancelEnhancement` | 是 | 1 | 2 B | 2 B | craft-panels |
| RequestQuests | `n:c:requestQuests` | 否 | 0 | 0 B | 0 B | - |
| RequestNpcQuests | `n:c:requestNpcQuests` | 否 | 0 | 0 B | 0 B | - |
| AcceptNpcQuest | `n:c:acceptNpcQuest` | 否 | 0 | 0 B | 0 B | - |
| SubmitNpcQuest | `n:c:submitNpcQuest` | 否 | 0 | 0 B | 0 B | - |
| UsePortal | `n:c:usePortal` | 否 | 0 | 0 B | 0 B | - |
| UseItem | `n:c:useItem` | 否 | 0 | 0 B | 0 B | - |
| DropItem | `n:c:dropItem` | 否 | 0 | 0 B | 0 B | - |
| DestroyItem | `n:c:destroyItem` | 否 | 0 | 0 B | 0 B | - |
| TakeGround | `n:c:takeGround` | 否 | 0 | 0 B | 0 B | - |
| SortInventory | `n:c:sortInventory` | 否 | 0 | 0 B | 0 B | - |
| Equip | `n:c:equip` | 是 | 2 | 30 B | 15 B | craft-panels |
| Unequip | `n:c:unequip` | 否 | 0 | 0 B | 0 B | - |
| Cultivate | `n:c:cultivate` | 否 | 0 | 0 B | 0 B | - |
| CastSkill | `n:c:castSkill` | 否 | 0 | 0 B | 0 B | - |
| RequestSuggestions | `n:c:requestSuggestions` | 否 | 0 | 0 B | 0 B | - |
| CreateSuggestion | `n:c:createSuggestion` | 否 | 0 | 0 B | 0 B | - |
| VoteSuggestion | `n:c:voteSuggestion` | 否 | 0 | 0 B | 0 B | - |
| ReplySuggestion | `n:c:replySuggestion` | 否 | 0 | 0 B | 0 B | - |
| MarkSuggestionRepliesRead | `n:c:markSuggestionRepliesRead` | 否 | 0 | 0 B | 0 B | - |
| RequestMailSummary | `n:c:requestMailSummary` | 否 | 0 | 0 B | 0 B | - |
| RequestMailPage | `n:c:requestMailPage` | 否 | 0 | 0 B | 0 B | - |
| RequestMailDetail | `n:c:requestMailDetail` | 否 | 0 | 0 B | 0 B | - |
| MarkMailRead | `n:c:markMailRead` | 否 | 0 | 0 B | 0 B | - |
| ClaimMailAttachments | `n:c:claimMailAttachments` | 否 | 0 | 0 B | 0 B | - |
| DeleteMail | `n:c:deleteMail` | 否 | 0 | 0 B | 0 B | - |
| RequestMarket | `n:c:requestMarket` | 否 | 0 | 0 B | 0 B | - |
| RequestMarketListings | `n:c:requestMarketListings` | 否 | 0 | 0 B | 0 B | - |
| RequestMarketItemBook | `n:c:requestMarketItemBook` | 否 | 0 | 0 B | 0 B | - |
| RequestMarketTradeHistory | `n:c:requestMarketTradeHistory` | 否 | 0 | 0 B | 0 B | - |
| CreateMarketSellOrder | `n:c:createMarketSellOrder` | 否 | 0 | 0 B | 0 B | - |
| CreateMarketBuyOrder | `n:c:createMarketBuyOrder` | 否 | 0 | 0 B | 0 B | - |
| BuyMarketItem | `n:c:buyMarketItem` | 否 | 0 | 0 B | 0 B | - |
| SellMarketItem | `n:c:sellMarketItem` | 否 | 0 | 0 B | 0 B | - |
| CancelMarketOrder | `n:c:cancelMarketOrder` | 否 | 0 | 0 B | 0 B | - |
| ClaimMarketStorage | `n:c:claimMarketStorage` | 否 | 0 | 0 B | 0 B | - |
| RequestNpcShop | `n:c:requestNpcShop` | 否 | 0 | 0 B | 0 B | - |
| BuyNpcShopItem | `n:c:buyNpcShopItem` | 否 | 0 | 0 B | 0 B | - |
| UpdateAutoBattleSkills | `n:c:updateAutoBattleSkills` | 否 | 0 | 0 B | 0 B | - |
| UpdateAutoUsePills | `n:c:updateAutoUsePills` | 否 | 0 | 0 B | 0 B | - |
| UpdateCombatTargetingRules | `n:c:updateCombatTargetingRules` | 否 | 0 | 0 B | 0 B | - |
| UpdateAutoBattleTargetingMode | `n:c:updateAutoBattleTargetingMode` | 否 | 0 | 0 B | 0 B | - |
| UpdateTechniqueSkillAvailability | `n:c:updateTechniqueSkillAvailability` | 否 | 0 | 0 B | 0 B | - |
| DebugResetSpawn | `n:c:debugResetSpawn` | 否 | 0 | 0 B | 0 B | - |
| Chat | `n:c:chat` | 否 | 0 | 0 B | 0 B | - |
| AckSystemMessages | `n:c:ackSystemMessages` | 否 | 0 | 0 B | 0 B | - |
| HeavenGateAction | `n:c:heavenGateAction` | 否 | 0 | 0 B | 0 B | - |
| GmGetState | `n:c:gmGetState` | 否 | 0 | 0 B | 0 B | - |
| GmSpawnBots | `n:c:gmSpawnBots` | 否 | 0 | 0 B | 0 B | - |
| GmRemoveBots | `n:c:gmRemoveBots` | 否 | 0 | 0 B | 0 B | - |
| GmUpdatePlayer | `n:c:gmUpdatePlayer` | 否 | 0 | 0 B | 0 B | - |
| GmResetPlayer | `n:c:gmResetPlayer` | 否 | 0 | 0 B | 0 B | - |
| GmMarkSuggestionCompleted | `n:c:gmMarkSuggestionCompleted` | 否 | 0 | 0 B | 0 B | - |
| GmRemoveSuggestion | `n:c:gmRemoveSuggestion` | 否 | 0 | 0 B | 0 B | - |
| RedeemCodes | `n:c:redeemCodes` | 否 | 0 | 0 B | 0 B | - |

## 服务端到客户端覆盖

| 事件名 | Wire Event | 已覆盖 | 次数 | 总流量 | 平均流量 | 用例 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Bootstrap | `n:s:bootstrap` | 是 | 1 | 4.83 KB | 4.83 KB | craft-panels |
| InitSession | `n:s:initSession` | 是 | 1 | 112 B | 112 B | craft-panels |
| MapEnter | `n:s:mapEnter` | 是 | 1 | 104 B | 104 B | craft-panels |
| MapStatic | `n:s:mapStatic` | 是 | 1 | 27.22 KB | 27.22 KB | craft-panels |
| Realm | `n:s:realm` | 是 | 1 | 379 B | 379 B | craft-panels |
| WorldDelta | `n:s:worldDelta` | 是 | 5 | 6.57 KB | 1.31 KB | craft-panels |
| SelfDelta | `n:s:selfDelta` | 是 | 12 | 291 B | 24 B | craft-panels |
| PanelDelta | `n:s:panelDelta` | 是 | 10 | 9.28 KB | 950 B | craft-panels |
| LootWindowUpdate | `n:s:lootWindowUpdate` | 是 | 1 | 15 B | 15 B | craft-panels |
| QuestNavigateResult | `n:s:questNavigateResult` | 否 | 0 | 0 B | 0 B | - |
| Notice | `n:s:notice` | 是 | 10 | 1.07 KB | 109 B | craft-panels |
| AttrDetail | `n:s:attrDetail` | 否 | 0 | 0 B | 0 B | - |
| Leaderboard | `n:s:leaderboard` | 否 | 0 | 0 B | 0 B | - |
| WorldSummary | `n:s:worldSummary` | 否 | 0 | 0 B | 0 B | - |
| AlchemyPanel | `n:s:alchemyPanel` | 是 | 9 | 99.08 KB | 11.01 KB | craft-panels |
| EnhancementPanel | `n:s:enhancementPanel` | 是 | 7 | 13.62 KB | 1.95 KB | craft-panels |
| Quests | `n:s:quests` | 是 | 1 | 13 B | 13 B | craft-panels |
| NpcQuests | `n:s:npcQuests` | 否 | 0 | 0 B | 0 B | - |
| SuggestionUpdate | `n:s:suggestionUpdate` | 是 | 1 | 18 B | 18 B | craft-panels |
| MailSummary | `n:s:mailSummary` | 是 | 1 | 61 B | 61 B | craft-panels |
| MailPage | `n:s:mailPage` | 否 | 0 | 0 B | 0 B | - |
| MailDetail | `n:s:mailDetail` | 否 | 0 | 0 B | 0 B | - |
| MailOpResult | `n:s:mailOpResult` | 否 | 0 | 0 B | 0 B | - |
| MarketUpdate | `n:s:marketUpdate` | 否 | 0 | 0 B | 0 B | - |
| MarketItemBook | `n:s:marketItemBook` | 否 | 0 | 0 B | 0 B | - |
| MarketTradeHistory | `n:s:marketTradeHistory` | 否 | 0 | 0 B | 0 B | - |
| Detail | `n:s:detail` | 否 | 0 | 0 B | 0 B | - |
| TileDetail | `n:s:tileDetail` | 否 | 0 | 0 B | 0 B | - |
| NpcShop | `n:s:npcShop` | 否 | 0 | 0 B | 0 B | - |
| Error | `n:s:error` | 否 | 0 | 0 B | 0 B | - |
| Kick | `n:s:kick` | 否 | 0 | 0 B | 0 B | - |
| Pong | `n:s:pong` | 否 | 0 | 0 B | 0 B | - |
| GmState | `n:s:gmState` | 否 | 0 | 0 B | 0 B | - |
| RedeemCodesResult | `n:s:redeemCodesResult` | 否 | 0 | 0 B | 0 B | - |

## 流量明细

| 序号 | 方向 | 事件名 | Wire Event | 包体大小 | 用例 | Socket |
| ---: | --- | --- | --- | ---: | --- | --- |
| 1 | s2c | InitSession | `n:s:initSession` | 112 B | craft-panels | craft-panels |
| 2 | s2c | MapEnter | `n:s:mapEnter` | 104 B | craft-panels | craft-panels |
| 3 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 298 B | craft-panels | craft-panels |
| 4 | s2c | SelfDelta | `n:s:selfDelta` | 113 B | craft-panels | craft-panels |
| 5 | s2c | PanelDelta | `n:s:panelDelta` | 127 B | craft-panels | craft-panels |
| 6 | s2c | Bootstrap | `n:s:bootstrap` | 4.83 KB | craft-panels | craft-panels |
| 7 | s2c | MapStatic | `n:s:mapStatic` | 27.22 KB | craft-panels | craft-panels |
| 8 | s2c | Realm | `n:s:realm` | 379 B | craft-panels | craft-panels |
| 9 | s2c | LootWindowUpdate | `n:s:lootWindowUpdate` | 15 B | craft-panels | craft-panels |
| 10 | s2c | Quests | `n:s:quests` | 13 B | craft-panels | craft-panels |
| 11 | s2c | SuggestionUpdate | `n:s:suggestionUpdate` | 18 B | craft-panels | craft-panels |
| 12 | s2c | MailSummary | `n:s:mailSummary` | 61 B | craft-panels | craft-panels |
| 13 | c2s | Equip | `n:c:equip` | 15 B | craft-panels | craft-panels |
| 14 | s2c | PanelDelta | `n:s:panelDelta` | 1.45 KB | craft-panels | craft-panels |
| 15 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 12.21 KB | craft-panels | craft-panels |
| 16 | s2c | EnhancementPanel | `n:s:enhancementPanel` | 49 B | craft-panels | craft-panels |
| 17 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | craft-panels | craft-panels |
| 18 | s2c | PanelDelta | `n:s:panelDelta` | 1.73 KB | craft-panels | craft-panels |
| 19 | s2c | Notice | `n:s:notice` | 66 B | craft-panels | craft-panels |
| 20 | c2s | RequestAlchemyPanel | `n:c:requestAlchemyPanel` | 25 B | craft-panels | craft-panels |
| 21 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 12.21 KB | craft-panels | craft-panels |
| 22 | c2s | SaveAlchemyPreset | `n:c:saveAlchemyPreset` | 232 B | craft-panels | craft-panels |
| 23 | s2c | PanelDelta | `n:s:panelDelta` | 588 B | craft-panels | craft-panels |
| 24 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 12.53 KB | craft-panels | craft-panels |
| 25 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | craft-panels | craft-panels |
| 26 | s2c | Notice | `n:s:notice` | 127 B | craft-panels | craft-panels |
| 27 | c2s | DeleteAlchemyPreset | `n:c:deleteAlchemyPreset` | 62 B | craft-panels | craft-panels |
| 28 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 12.21 KB | craft-panels | craft-panels |
| 29 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | craft-panels | craft-panels |
| 30 | s2c | Notice | `n:s:notice` | 127 B | craft-panels | craft-panels |
| 31 | c2s | RequestAlchemyPanel | `n:c:requestAlchemyPanel` | 25 B | craft-panels | craft-panels |
| 32 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 98 B | craft-panels | craft-panels |
| 33 | c2s | StartAlchemy | `n:c:startAlchemy` | 178 B | craft-panels | craft-panels |
| 34 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 12.71 KB | craft-panels | craft-panels |
| 35 | s2c | SelfDelta | `n:s:selfDelta` | 15 B | craft-panels | craft-panels |
| 36 | s2c | PanelDelta | `n:s:panelDelta` | 118 B | craft-panels | craft-panels |
| 37 | s2c | Notice | `n:s:notice` | 86 B | craft-panels | craft-panels |
| 38 | c2s | Move | `n:c:move` | 7 B | craft-panels | craft-panels |
| 39 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 12.71 KB | craft-panels | craft-panels |
| 40 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 133 B | craft-panels | craft-panels |
| 41 | s2c | SelfDelta | `n:s:selfDelta` | 22 B | craft-panels | craft-panels |
| 42 | s2c | WorldDelta(tile+minimap) | `n:s:worldDelta` | 1.46 KB | craft-panels | craft-panels |
| 43 | s2c | Notice | `n:s:notice` | 99 B | craft-panels | craft-panels |
| 44 | c2s | CancelAlchemy | `n:c:cancelAlchemy` | 2 B | craft-panels | craft-panels |
| 45 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 12.21 KB | craft-panels | craft-panels |
| 46 | s2c | SelfDelta | `n:s:selfDelta` | 16 B | craft-panels | craft-panels |
| 47 | s2c | PanelDelta | `n:s:panelDelta` | 589 B | craft-panels | craft-panels |
| 48 | s2c | Notice | `n:s:notice` | 106 B | craft-panels | craft-panels |
| 49 | c2s | Equip | `n:c:equip` | 15 B | craft-panels | craft-panels |
| 50 | s2c | AlchemyPanel | `n:s:alchemyPanel` | 12.18 KB | craft-panels | craft-panels |
| 51 | s2c | EnhancementPanel | `n:s:enhancementPanel` | 2.10 KB | craft-panels | craft-panels |
| 52 | s2c | SelfDelta | `n:s:selfDelta` | 16 B | craft-panels | craft-panels |
| 53 | s2c | PanelDelta | `n:s:panelDelta` | 2.31 KB | craft-panels | craft-panels |
| 54 | s2c | Notice | `n:s:notice` | 66 B | craft-panels | craft-panels |
| 55 | c2s | RequestEnhancementPanel | `n:c:requestEnhancementPanel` | 2 B | craft-panels | craft-panels |
| 56 | s2c | EnhancementPanel | `n:s:enhancementPanel` | 2.10 KB | craft-panels | craft-panels |
| 57 | c2s | RequestEnhancementPanel | `n:c:requestEnhancementPanel` | 2 B | craft-panels | craft-panels |
| 58 | s2c | EnhancementPanel | `n:s:enhancementPanel` | 2.10 KB | craft-panels | craft-panels |
| 59 | s2c | SelfDelta | `n:s:selfDelta` | 9 B | craft-panels | craft-panels |
| 60 | s2c | PanelDelta | `n:s:panelDelta` | 714 B | craft-panels | craft-panels |
| 61 | c2s | StartEnhancement | `n:c:startEnhancement` | 63 B | craft-panels | craft-panels |
| 62 | s2c | EnhancementPanel | `n:s:enhancementPanel` | 2.48 KB | craft-panels | craft-panels |
| 63 | s2c | SelfDelta | `n:s:selfDelta` | 16 B | craft-panels | craft-panels |
| 64 | s2c | PanelDelta | `n:s:panelDelta` | 1007 B | craft-panels | craft-panels |
| 65 | s2c | Notice | `n:s:notice` | 106 B | craft-panels | craft-panels |
| 66 | c2s | Move | `n:c:move` | 7 B | craft-panels | craft-panels |
| 67 | s2c | EnhancementPanel | `n:s:enhancementPanel` | 2.48 KB | craft-panels | craft-panels |
| 68 | s2c | WorldDelta(entity) | `n:s:worldDelta` | 184 B | craft-panels | craft-panels |
| 69 | s2c | SelfDelta | `n:s:selfDelta` | 22 B | craft-panels | craft-panels |
| 70 | s2c | WorldDelta(tile+minimap) | `n:s:worldDelta` | 4.52 KB | craft-panels | craft-panels |
| 71 | s2c | Notice | `n:s:notice` | 102 B | craft-panels | craft-panels |
| 72 | c2s | CancelEnhancement | `n:c:cancelEnhancement` | 2 B | craft-panels | craft-panels |
| 73 | s2c | EnhancementPanel | `n:s:enhancementPanel` | 2.32 KB | craft-panels | craft-panels |
| 74 | s2c | SelfDelta | `n:s:selfDelta` | 17 B | craft-panels | craft-panels |
| 75 | s2c | PanelDelta | `n:s:panelDelta` | 740 B | craft-panels | craft-panels |
| 76 | s2c | Notice | `n:s:notice` | 208 B | craft-panels | craft-panels |

## 未覆盖项

- c2s.Hello: `n:c:hello`
- c2s.Ping: `n:c:ping`
- c2s.MoveTo: `n:c:moveTo`
- c2s.NavigateQuest: `n:c:navigateQuest`
- c2s.Heartbeat: `n:c:heartbeat`
- c2s.UseAction: `n:c:useAction`
- c2s.RequestDetail: `n:c:requestDetail`
- c2s.RequestTileDetail: `n:c:requestTileDetail`
- c2s.RequestAttrDetail: `n:c:requestAttrDetail`
- c2s.RequestLeaderboard: `n:c:requestLeaderboard`
- c2s.RequestWorldSummary: `n:c:requestWorldSummary`
- c2s.RequestQuests: `n:c:requestQuests`
- c2s.RequestNpcQuests: `n:c:requestNpcQuests`
- c2s.AcceptNpcQuest: `n:c:acceptNpcQuest`
- c2s.SubmitNpcQuest: `n:c:submitNpcQuest`
- c2s.UsePortal: `n:c:usePortal`
- c2s.UseItem: `n:c:useItem`
- c2s.DropItem: `n:c:dropItem`
- c2s.DestroyItem: `n:c:destroyItem`
- c2s.TakeGround: `n:c:takeGround`
- c2s.SortInventory: `n:c:sortInventory`
- c2s.Unequip: `n:c:unequip`
- c2s.Cultivate: `n:c:cultivate`
- c2s.CastSkill: `n:c:castSkill`
- c2s.RequestSuggestions: `n:c:requestSuggestions`
- c2s.CreateSuggestion: `n:c:createSuggestion`
- c2s.VoteSuggestion: `n:c:voteSuggestion`
- c2s.ReplySuggestion: `n:c:replySuggestion`
- c2s.MarkSuggestionRepliesRead: `n:c:markSuggestionRepliesRead`
- c2s.RequestMailSummary: `n:c:requestMailSummary`
- c2s.RequestMailPage: `n:c:requestMailPage`
- c2s.RequestMailDetail: `n:c:requestMailDetail`
- c2s.MarkMailRead: `n:c:markMailRead`
- c2s.ClaimMailAttachments: `n:c:claimMailAttachments`
- c2s.DeleteMail: `n:c:deleteMail`
- c2s.RequestMarket: `n:c:requestMarket`
- c2s.RequestMarketListings: `n:c:requestMarketListings`
- c2s.RequestMarketItemBook: `n:c:requestMarketItemBook`
- c2s.RequestMarketTradeHistory: `n:c:requestMarketTradeHistory`
- c2s.CreateMarketSellOrder: `n:c:createMarketSellOrder`
- c2s.CreateMarketBuyOrder: `n:c:createMarketBuyOrder`
- c2s.BuyMarketItem: `n:c:buyMarketItem`
- c2s.SellMarketItem: `n:c:sellMarketItem`
- c2s.CancelMarketOrder: `n:c:cancelMarketOrder`
- c2s.ClaimMarketStorage: `n:c:claimMarketStorage`
- c2s.RequestNpcShop: `n:c:requestNpcShop`
- c2s.BuyNpcShopItem: `n:c:buyNpcShopItem`
- c2s.UpdateAutoBattleSkills: `n:c:updateAutoBattleSkills`
- c2s.UpdateAutoUsePills: `n:c:updateAutoUsePills`
- c2s.UpdateCombatTargetingRules: `n:c:updateCombatTargetingRules`
- c2s.UpdateAutoBattleTargetingMode: `n:c:updateAutoBattleTargetingMode`
- c2s.UpdateTechniqueSkillAvailability: `n:c:updateTechniqueSkillAvailability`
- c2s.DebugResetSpawn: `n:c:debugResetSpawn`
- c2s.Chat: `n:c:chat`
- c2s.AckSystemMessages: `n:c:ackSystemMessages`
- c2s.HeavenGateAction: `n:c:heavenGateAction`
- c2s.GmGetState: `n:c:gmGetState`
- c2s.GmSpawnBots: `n:c:gmSpawnBots`
- c2s.GmRemoveBots: `n:c:gmRemoveBots`
- c2s.GmUpdatePlayer: `n:c:gmUpdatePlayer`
- c2s.GmResetPlayer: `n:c:gmResetPlayer`
- c2s.GmMarkSuggestionCompleted: `n:c:gmMarkSuggestionCompleted`
- c2s.GmRemoveSuggestion: `n:c:gmRemoveSuggestion`
- c2s.RedeemCodes: `n:c:redeemCodes`
- s2c.QuestNavigateResult: `n:s:questNavigateResult`
- s2c.AttrDetail: `n:s:attrDetail`
- s2c.Leaderboard: `n:s:leaderboard`
- s2c.WorldSummary: `n:s:worldSummary`
- s2c.NpcQuests: `n:s:npcQuests`
- s2c.MailPage: `n:s:mailPage`
- s2c.MailDetail: `n:s:mailDetail`
- s2c.MailOpResult: `n:s:mailOpResult`
- s2c.MarketUpdate: `n:s:marketUpdate`
- s2c.MarketItemBook: `n:s:marketItemBook`
- s2c.MarketTradeHistory: `n:s:marketTradeHistory`
- s2c.Detail: `n:s:detail`
- s2c.TileDetail: `n:s:tileDetail`
- s2c.NpcShop: `n:s:npcShop`
- s2c.Error: `n:s:error`
- s2c.Kick: `n:s:kick`
- s2c.Pong: `n:s:pong`
- s2c.GmState: `n:s:gmState`
- s2c.RedeemCodesResult: `n:s:redeemCodesResult`

## 备注

- 报告由 `packages/server/src/tools/protocol-audit.ts` 自动生成。
- 本次审计主要是黑盒协议回归，不覆盖浏览器 UI、深色模式、手机布局。

import { NEXT_S2C, type NEXT_S2C_EventPayload } from '@mud/shared-next';
import type { SocketManager } from './network/socket';
import { bindTechniqueActivityPanelEvents } from './technique-activity-client.helpers';
/**
 * MainLowFrequencySocketBindingsOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainLowFrequencySocketBindingsOptions = {
/**
 * socket：socket相关字段。
 */

  socket: Pick<SocketManager, 'on' | 'onKick' | 'onConnectError' | 'onDisconnect'>;  
  /**
 * onLootWindowUpdate：on掉落窗口Update相关字段。
 */

  onLootWindowUpdate: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.LootWindowUpdate>) => void;  
  /**
 * onTileDetail：onTile详情状态或数据块。
 */

  onTileDetail: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.TileDetail>) => void;  
  /**
 * onDetail：on详情状态或数据块。
 */

  onDetail: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.Detail>) => void;  
  /**
 * onAttrDetail：onAttr详情状态或数据块。
 */

  onAttrDetail: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.AttrDetail>) => void;  
  /**
 * onAlchemyPanel：on炼丹面板相关字段。
 */

  onAlchemyPanel: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.AlchemyPanel>) => void;  
  /**
 * onEnhancementPanel：on强化面板相关字段。
 */

  onEnhancementPanel: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.EnhancementPanel>) => void;  
  /**
 * onLeaderboard：onLeaderboard相关字段。
 */

  onLeaderboard: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.Leaderboard>) => void;  
  /**
 * onLeaderboardPlayerLocations：玩家击杀榜坐标追索结果。
 */

  onLeaderboardPlayerLocations: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.LeaderboardPlayerLocations>) => void;
  /**
 * onWorldSummary：on世界摘要状态或数据块。
 */

  onWorldSummary: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.WorldSummary>) => void;  
  /**
 * onNpcQuests：集合字段。
 */

  onNpcQuests: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.NpcQuests>) => void;  
  /**
 * onQuests：集合字段。
 */

  onQuests: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.Quests>) => void;  
  /**
 * onQuestNavigateResult：on任务Navigate结果相关字段。
 */

  onQuestNavigateResult: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.QuestNavigateResult>) => void;  
  /**
 * onSuggestionUpdate：onSuggestionUpdate相关字段。
 */

  onSuggestionUpdate: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.SuggestionUpdate>) => void;  
  /**
 * onMailSummary：on邮件摘要状态或数据块。
 */

  onMailSummary: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MailSummary>) => void;  
  /**
 * onMailPage：on邮件Page相关字段。
 */

  onMailPage: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MailPage>) => void;  
  /**
 * onMailDetail：on邮件详情状态或数据块。
 */

  onMailDetail: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MailDetail>) => void;  
  /**
 * onRedeemCodesResult：onRedeemCode结果相关字段。
 */

  onRedeemCodesResult: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.RedeemCodesResult>) => void;  
  /**
 * onMailOpResult：on邮件Op结果相关字段。
 */

  onMailOpResult: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MailOpResult>) => void;  
  /**
 * onMarketUpdate：on坊市Update相关字段。
 */

  onMarketUpdate: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MarketUpdate>) => void;  
  /**
 * onMarketListings：on坊市Listing相关字段。
 */

  onMarketListings: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MarketListings>) => void;  
  /**
 * onMarketOrders：on坊市订单相关字段。
 */

  onMarketOrders: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MarketOrders>) => void;  
  /**
 * onMarketStorage：on坊市Storage相关字段。
 */

  onMarketStorage: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MarketStorage>) => void;  
  /**
 * onMarketItemBook：on坊市道具Book相关字段。
 */

  onMarketItemBook: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MarketItemBook>) => void;  
  /**
 * onMarketTradeHistory：on坊市TradeHistory相关字段。
 */

  onMarketTradeHistory: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MarketTradeHistory>) => void;  
  /**
 * onNpcShop：onNPCShop相关字段。
 */

  onNpcShop: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.NpcShop>) => void;  
  /**
 * onNotice：onNotice相关字段。
 */

  onNotice: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.Notice>) => void;  
  /**
 * onError：onError相关字段。
 */

  onError: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.Error>) => void;  
  /**
 * onKick：onKick相关字段。
 */

  onKick: Parameters<SocketManager['onKick']>[0];  
  /**
 * onConnectError：onConnectError相关字段。
 */

  onConnectError: Parameters<SocketManager['onConnectError']>[0];  
  /**
 * onDisconnect：onDisconnect相关字段。
 */

  onDisconnect: Parameters<SocketManager['onDisconnect']>[0];  
  /**
 * onPong：onPong相关字段。
 */

  onPong: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.Pong>) => void;
};
/**
 * bindMainLowFrequencySocketEvents：执行bindMainLowFrequencySocket事件相关逻辑。
 * @param options MainLowFrequencySocketBindingsOptions 选项参数。
 * @returns 无返回值，直接更新bindMainLowFrequencySocket事件相关状态。
 */


export function bindMainLowFrequencySocketEvents(options: MainLowFrequencySocketBindingsOptions): void {
  options.socket.on(NEXT_S2C.LootWindowUpdate, options.onLootWindowUpdate);
  options.socket.on(NEXT_S2C.TileDetail, options.onTileDetail);
  options.socket.on(NEXT_S2C.Detail, options.onDetail);
  options.socket.on(NEXT_S2C.AttrDetail, options.onAttrDetail);
  bindTechniqueActivityPanelEvents(options.socket, {
    alchemy: options.onAlchemyPanel,
    enhancement: options.onEnhancementPanel,
  });
  options.socket.on(NEXT_S2C.Leaderboard, options.onLeaderboard);
  options.socket.on(NEXT_S2C.LeaderboardPlayerLocations, options.onLeaderboardPlayerLocations);
  options.socket.on(NEXT_S2C.WorldSummary, options.onWorldSummary);
  options.socket.on(NEXT_S2C.NpcQuests, options.onNpcQuests);
  options.socket.on(NEXT_S2C.Quests, options.onQuests);
  options.socket.on(NEXT_S2C.QuestNavigateResult, options.onQuestNavigateResult);
  options.socket.on(NEXT_S2C.SuggestionUpdate, options.onSuggestionUpdate);
  options.socket.on(NEXT_S2C.MailSummary, options.onMailSummary);
  options.socket.on(NEXT_S2C.MailPage, options.onMailPage);
  options.socket.on(NEXT_S2C.MailDetail, options.onMailDetail);
  options.socket.on(NEXT_S2C.RedeemCodesResult, options.onRedeemCodesResult);
  options.socket.on(NEXT_S2C.MailOpResult, options.onMailOpResult);
  options.socket.on(NEXT_S2C.MarketUpdate, options.onMarketUpdate);
  options.socket.on(NEXT_S2C.MarketListings, options.onMarketListings);
  options.socket.on(NEXT_S2C.MarketOrders, options.onMarketOrders);
  options.socket.on(NEXT_S2C.MarketStorage, options.onMarketStorage);
  options.socket.on(NEXT_S2C.MarketItemBook, options.onMarketItemBook);
  options.socket.on(NEXT_S2C.MarketTradeHistory, options.onMarketTradeHistory);
  options.socket.on(NEXT_S2C.NpcShop, options.onNpcShop);
  options.socket.on(NEXT_S2C.Notice, options.onNotice);
  options.socket.on(NEXT_S2C.Error, options.onError);
  options.socket.onKick(options.onKick);
  options.socket.onConnectError(options.onConnectError);
  options.socket.onDisconnect(options.onDisconnect);
  options.socket.on(NEXT_S2C.Pong, options.onPong);
}

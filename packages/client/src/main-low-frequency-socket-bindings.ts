import { NEXT_S2C, type NEXT_S2C_EventPayload } from '@mud/shared-next';
import type { SocketManager } from './network/socket';
/**
 * MainLowFrequencySocketBindingsOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainLowFrequencySocketBindingsOptions = {
/**
 * socket：对象字段。
 */

  socket: Pick<SocketManager, 'on' | 'onKick' | 'onConnectError' | 'onDisconnect'>;  
  /**
 * onLootWindowUpdate：对象字段。
 */

  onLootWindowUpdate: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.LootWindowUpdate>) => void;  
  /**
 * onTileDetail：对象字段。
 */

  onTileDetail: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.TileDetail>) => void;  
  /**
 * onDetail：对象字段。
 */

  onDetail: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.Detail>) => void;  
  /**
 * onAttrDetail：对象字段。
 */

  onAttrDetail: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.AttrDetail>) => void;  
  /**
 * onAlchemyPanel：对象字段。
 */

  onAlchemyPanel: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.AlchemyPanel>) => void;  
  /**
 * onEnhancementPanel：对象字段。
 */

  onEnhancementPanel: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.EnhancementPanel>) => void;  
  /**
 * onLeaderboard：对象字段。
 */

  onLeaderboard: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.Leaderboard>) => void;  
  /**
 * onWorldSummary：对象字段。
 */

  onWorldSummary: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.WorldSummary>) => void;  
  /**
 * onNpcQuests：对象字段。
 */

  onNpcQuests: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.NpcQuests>) => void;  
  /**
 * onQuests：对象字段。
 */

  onQuests: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.Quests>) => void;  
  /**
 * onQuestNavigateResult：对象字段。
 */

  onQuestNavigateResult: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.QuestNavigateResult>) => void;  
  /**
 * onSuggestionUpdate：对象字段。
 */

  onSuggestionUpdate: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.SuggestionUpdate>) => void;  
  /**
 * onMailSummary：对象字段。
 */

  onMailSummary: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MailSummary>) => void;  
  /**
 * onMailPage：对象字段。
 */

  onMailPage: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MailPage>) => void;  
  /**
 * onMailDetail：对象字段。
 */

  onMailDetail: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MailDetail>) => void;  
  /**
 * onRedeemCodesResult：对象字段。
 */

  onRedeemCodesResult: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.RedeemCodesResult>) => void;  
  /**
 * onMailOpResult：对象字段。
 */

  onMailOpResult: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MailOpResult>) => void;  
  /**
 * onMarketUpdate：对象字段。
 */

  onMarketUpdate: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MarketUpdate>) => void;  
  /**
 * onMarketListings：对象字段。
 */

  onMarketListings: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MarketListings>) => void;  
  /**
 * onMarketOrders：对象字段。
 */

  onMarketOrders: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MarketOrders>) => void;  
  /**
 * onMarketStorage：对象字段。
 */

  onMarketStorage: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MarketStorage>) => void;  
  /**
 * onMarketItemBook：对象字段。
 */

  onMarketItemBook: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MarketItemBook>) => void;  
  /**
 * onMarketTradeHistory：对象字段。
 */

  onMarketTradeHistory: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MarketTradeHistory>) => void;  
  /**
 * onNpcShop：对象字段。
 */

  onNpcShop: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.NpcShop>) => void;  
  /**
 * onNotice：对象字段。
 */

  onNotice: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.Notice>) => void;  
  /**
 * onError：对象字段。
 */

  onError: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.Error>) => void;  
  /**
 * onKick：对象字段。
 */

  onKick: Parameters<SocketManager['onKick']>[0];  
  /**
 * onConnectError：对象字段。
 */

  onConnectError: Parameters<SocketManager['onConnectError']>[0];  
  /**
 * onDisconnect：对象字段。
 */

  onDisconnect: Parameters<SocketManager['onDisconnect']>[0];  
  /**
 * onPong：对象字段。
 */

  onPong: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.Pong>) => void;
};
/**
 * bindMainLowFrequencySocketEvents：执行核心业务逻辑。
 * @param options MainLowFrequencySocketBindingsOptions 选项参数。
 * @returns void。
 */


export function bindMainLowFrequencySocketEvents(options: MainLowFrequencySocketBindingsOptions): void {
  options.socket.on(NEXT_S2C.LootWindowUpdate, options.onLootWindowUpdate);
  options.socket.on(NEXT_S2C.TileDetail, options.onTileDetail);
  options.socket.on(NEXT_S2C.Detail, options.onDetail);
  options.socket.on(NEXT_S2C.AttrDetail, options.onAttrDetail);
  options.socket.on(NEXT_S2C.AlchemyPanel, options.onAlchemyPanel);
  options.socket.on(NEXT_S2C.EnhancementPanel, options.onEnhancementPanel);
  options.socket.on(NEXT_S2C.Leaderboard, options.onLeaderboard);
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

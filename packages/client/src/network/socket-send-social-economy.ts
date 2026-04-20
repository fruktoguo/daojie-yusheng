import { NEXT_C2S, type NEXT_C2S_EventPayload } from '@mud/shared-next';
import type { SocketEmitEvent } from './socket-send-types';
/**
 * SocialEconomySenderDeps：统一结构类型，保证协议与运行时一致性。
 */


type SocialEconomySenderDeps = {
/**
 * emitEvent：对象字段。
 */

  emitEvent: SocketEmitEvent;
};
/**
 * createSocketSocialEconomySender：构建并返回目标对象。
 * @param deps SocialEconomySenderDeps 运行时依赖。
 * @returns 函数返回值。
 */


export function createSocketSocialEconomySender(deps: SocialEconomySenderDeps) {
  return {  
  /**
 * sendRequestSuggestions：执行核心业务逻辑。
 * @returns void。
 */

    sendRequestSuggestions(): void {
      deps.emitEvent(NEXT_C2S.RequestSuggestions, {});
    },    
    /**
 * sendCreateSuggestion：执行核心业务逻辑。
 * @param title string 参数说明。
 * @param description string 参数说明。
 * @returns void。
 */


    sendCreateSuggestion(title: string, description: string): void {
      deps.emitEvent(NEXT_C2S.CreateSuggestion, { title, description });
    },    
    /**
 * sendReplySuggestion：执行核心业务逻辑。
 * @param suggestionId string suggestion ID。
 * @param content string 参数说明。
 * @returns void。
 */


    sendReplySuggestion(suggestionId: string, content: string): void {
      deps.emitEvent(NEXT_C2S.ReplySuggestion, { suggestionId, content });
    },    
    /**
 * sendVoteSuggestion：执行核心业务逻辑。
 * @param suggestionId string suggestion ID。
 * @param vote 'up' | 'down' 参数说明。
 * @returns void。
 */


    sendVoteSuggestion(suggestionId: string, vote: 'up' | 'down'): void {
      deps.emitEvent(NEXT_C2S.VoteSuggestion, { suggestionId, vote });
    },    
    /**
 * sendMarkSuggestionRepliesRead：执行核心业务逻辑。
 * @param suggestionId string suggestion ID。
 * @returns void。
 */


    sendMarkSuggestionRepliesRead(suggestionId: string): void {
      deps.emitEvent(NEXT_C2S.MarkSuggestionRepliesRead, { suggestionId });
    },    
    /**
 * sendRequestMailSummary：执行核心业务逻辑。
 * @returns void。
 */


    sendRequestMailSummary(): void {
      deps.emitEvent(NEXT_C2S.RequestMailSummary, {});
    },    
    /**
 * sendRequestMailPage：执行核心业务逻辑。
 * @param page number 参数说明。
 * @param pageSize number 参数说明。
 * @param filter NEXT_C2S_EventPayload<typeof NEXT_C2S.RequestMailPage>['filter'] 参数说明。
 * @returns void。
 */


    sendRequestMailPage(
      page: number,
      pageSize?: number,
      filter?: NEXT_C2S_EventPayload<typeof NEXT_C2S.RequestMailPage>['filter'],
    ): void {
      deps.emitEvent(NEXT_C2S.RequestMailPage, { page, pageSize, filter });
    },    
    /**
 * sendRequestMailDetail：执行核心业务逻辑。
 * @param mailId string mail ID。
 * @returns void。
 */


    sendRequestMailDetail(mailId: string): void {
      deps.emitEvent(NEXT_C2S.RequestMailDetail, { mailId });
    },    
    /**
 * sendRedeemCodes：执行核心业务逻辑。
 * @param codes string[] 参数说明。
 * @returns void。
 */


    sendRedeemCodes(codes: string[]): void {
      deps.emitEvent(NEXT_C2S.RedeemCodes, { codes });
    },    
    /**
 * sendMarkMailRead：执行核心业务逻辑。
 * @param mailIds string[] mail ID 集合。
 * @returns void。
 */


    sendMarkMailRead(mailIds: string[]): void {
      deps.emitEvent(NEXT_C2S.MarkMailRead, { mailIds });
    },    
    /**
 * sendClaimMailAttachments：执行核心业务逻辑。
 * @param mailIds string[] mail ID 集合。
 * @returns void。
 */


    sendClaimMailAttachments(mailIds: string[]): void {
      deps.emitEvent(NEXT_C2S.ClaimMailAttachments, { mailIds });
    },    
    /**
 * sendDeleteMail：执行核心业务逻辑。
 * @param mailIds string[] mail ID 集合。
 * @returns void。
 */


    sendDeleteMail(mailIds: string[]): void {
      deps.emitEvent(NEXT_C2S.DeleteMail, { mailIds });
    },    
    /**
 * sendRequestMarket：执行核心业务逻辑。
 * @returns void。
 */


    sendRequestMarket(): void {
      deps.emitEvent(NEXT_C2S.RequestMarket, {});
    },    
    /**
 * sendRequestMarketListings：执行核心业务逻辑。
 * @param payload NEXT_C2S_EventPayload<typeof NEXT_C2S.RequestMarketListings> 载荷参数。
 * @returns void。
 */


    sendRequestMarketListings(
      payload: NEXT_C2S_EventPayload<typeof NEXT_C2S.RequestMarketListings>,
    ): void {
      deps.emitEvent(NEXT_C2S.RequestMarketListings, payload);
    },    
    /**
 * sendRequestMarketItemBook：执行核心业务逻辑。
 * @param itemKey string 参数说明。
 * @returns void。
 */


    sendRequestMarketItemBook(itemKey: string): void {
      deps.emitEvent(NEXT_C2S.RequestMarketItemBook, { itemKey });
    },    
    /**
 * sendRequestMarketTradeHistory：执行核心业务逻辑。
 * @param page number 参数说明。
 * @returns void。
 */


    sendRequestMarketTradeHistory(page: number): void {
      deps.emitEvent(NEXT_C2S.RequestMarketTradeHistory, { page });
    },    
    /**
 * sendCreateMarketSellOrder：执行核心业务逻辑。
 * @param slotIndex number 参数说明。
 * @param quantity number 参数说明。
 * @param unitPrice number 参数说明。
 * @returns void。
 */


    sendCreateMarketSellOrder(slotIndex: number, quantity: number, unitPrice: number): void {
      deps.emitEvent(NEXT_C2S.CreateMarketSellOrder, { slotIndex, quantity, unitPrice });
    },    
    /**
 * sendCreateMarketBuyOrder：执行核心业务逻辑。
 * @param itemKey string 参数说明。
 * @param quantity number 参数说明。
 * @param unitPrice number 参数说明。
 * @returns void。
 */


    sendCreateMarketBuyOrder(itemKey: string, quantity: number, unitPrice: number): void {
      deps.emitEvent(NEXT_C2S.CreateMarketBuyOrder, { itemKey, quantity, unitPrice });
    },    
    /**
 * sendBuyMarketItem：执行核心业务逻辑。
 * @param itemKey string 参数说明。
 * @param quantity number 参数说明。
 * @returns void。
 */


    sendBuyMarketItem(itemKey: string, quantity: number): void {
      deps.emitEvent(NEXT_C2S.BuyMarketItem, { itemKey, quantity });
    },    
    /**
 * sendSellMarketItem：执行核心业务逻辑。
 * @param slotIndex number 参数说明。
 * @param quantity number 参数说明。
 * @returns void。
 */


    sendSellMarketItem(slotIndex: number, quantity: number): void {
      deps.emitEvent(NEXT_C2S.SellMarketItem, { slotIndex, quantity });
    },    
    /**
 * sendCancelMarketOrder：执行核心业务逻辑。
 * @param orderId string order ID。
 * @returns void。
 */


    sendCancelMarketOrder(orderId: string): void {
      deps.emitEvent(NEXT_C2S.CancelMarketOrder, { orderId });
    },    
    /**
 * sendClaimMarketStorage：执行核心业务逻辑。
 * @returns void。
 */


    sendClaimMarketStorage(): void {
      deps.emitEvent(NEXT_C2S.ClaimMarketStorage, {});
    },    
    /**
 * sendChat：执行核心业务逻辑。
 * @param message string 参数说明。
 * @returns void。
 */


    sendChat(message: string): void {
      deps.emitEvent(NEXT_C2S.Chat, { message });
    },    
    /**
 * ackSystemMessages：执行核心业务逻辑。
 * @param ids string[] 参数说明。
 * @returns void。
 */


    ackSystemMessages(ids: string[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (ids.length === 0) {
        return;
      }
      deps.emitEvent(NEXT_C2S.AckSystemMessages, { ids });
    },
  };
}
/**
 * SocketSocialEconomySender：统一结构类型，保证协议与运行时一致性。
 */


export type SocketSocialEconomySender = ReturnType<typeof createSocketSocialEconomySender>;

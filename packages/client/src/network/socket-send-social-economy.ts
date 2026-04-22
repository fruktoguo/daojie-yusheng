import { C2S, type ClientToServerEventPayload } from '@mud/shared';
import type { SocketEmitEvent } from './socket-send-types';
/**
 * SocialEconomySenderDeps：统一结构类型，保证协议与运行时一致性。
 */


type SocialEconomySenderDeps = {
/**
 * emitEvent：事件相关字段。
 */

  emitEvent: SocketEmitEvent;
};
/**
 * createSocketSocialEconomySender：构建并返回目标对象。
 * @param deps SocialEconomySenderDeps 运行时依赖。
 * @returns 无返回值，直接更新SocketSocialEconomySender相关状态。
 */


export function createSocketSocialEconomySender(deps: SocialEconomySenderDeps) {
  return {  
  /**
 * sendRequestSuggestions：执行sendRequestSuggestion相关逻辑。
 * @returns 无返回值，直接更新sendRequestSuggestion相关状态。
 */

    sendRequestSuggestions(): void {
      deps.emitEvent(C2S.RequestSuggestions, {});
    },    
    /**
 * sendCreateSuggestion：构建sendCreateSuggestion。
 * @param title string 参数说明。
 * @param description string 参数说明。
 * @returns 无返回值，直接更新sendCreateSuggestion相关状态。
 */


    sendCreateSuggestion(title: string, description: string): void {
      deps.emitEvent(C2S.CreateSuggestion, { title, description });
    },    
    /**
 * sendReplySuggestion：执行sendReplySuggestion相关逻辑。
 * @param suggestionId string suggestion ID。
 * @param content string 参数说明。
 * @returns 无返回值，直接更新sendReplySuggestion相关状态。
 */


    sendReplySuggestion(suggestionId: string, content: string): void {
      deps.emitEvent(C2S.ReplySuggestion, { suggestionId, content });
    },    
    /**
 * sendVoteSuggestion：执行sendVoteSuggestion相关逻辑。
 * @param suggestionId string suggestion ID。
 * @param vote 'up' | 'down' 参数说明。
 * @returns 无返回值，直接更新sendVoteSuggestion相关状态。
 */


    sendVoteSuggestion(suggestionId: string, vote: 'up' | 'down'): void {
      deps.emitEvent(C2S.VoteSuggestion, { suggestionId, vote });
    },    
    /**
 * sendMarkSuggestionRepliesRead：读取sendMarkSuggestionReplyRead并返回结果。
 * @param suggestionId string suggestion ID。
 * @returns 无返回值，直接更新sendMarkSuggestionReplyRead相关状态。
 */


    sendMarkSuggestionRepliesRead(suggestionId: string): void {
      deps.emitEvent(C2S.MarkSuggestionRepliesRead, { suggestionId });
    },    
    /**
 * sendRequestMailSummary：执行sendRequest邮件摘要相关逻辑。
 * @returns 无返回值，直接更新sendRequest邮件摘要相关状态。
 */


    sendRequestMailSummary(): void {
      deps.emitEvent(C2S.RequestMailSummary, {});
    },    
    /**
 * sendRequestMailPage：执行sendRequest邮件Page相关逻辑。
 * @param page number 参数说明。
 * @param pageSize number 参数说明。
 * @param filter ClientToServerEventPayload<typeof C2S.RequestMailPage>['filter'] 参数说明。
 * @returns 无返回值，直接更新sendRequest邮件Page相关状态。
 */


    sendRequestMailPage(
      page: number,
      pageSize?: number,
      filter?: ClientToServerEventPayload<typeof C2S.RequestMailPage>['filter'],
    ): void {
      deps.emitEvent(C2S.RequestMailPage, { page, pageSize, filter });
    },    
    /**
 * sendRequestMailDetail：执行sendRequest邮件详情相关逻辑。
 * @param mailId string mail ID。
 * @returns 无返回值，直接更新sendRequest邮件详情相关状态。
 */


    sendRequestMailDetail(mailId: string): void {
      deps.emitEvent(C2S.RequestMailDetail, { mailId });
    },    
    /**
 * sendRedeemCodes：执行sendRedeemCode相关逻辑。
 * @param codes string[] 参数说明。
 * @returns 无返回值，直接更新sendRedeemCode相关状态。
 */


    sendRedeemCodes(codes: string[]): void {
      deps.emitEvent(C2S.RedeemCodes, { codes });
    },    
    /**
 * sendMarkMailRead：读取sendMark邮件Read并返回结果。
 * @param mailIds string[] mail ID 集合。
 * @returns 无返回值，直接更新sendMark邮件Read相关状态。
 */


    sendMarkMailRead(mailIds: string[]): void {
      deps.emitEvent(C2S.MarkMailRead, { mailIds });
    },    
    /**
 * sendClaimMailAttachments：执行sendClaim邮件Attachment相关逻辑。
 * @param mailIds string[] mail ID 集合。
 * @returns 无返回值，直接更新sendClaim邮件Attachment相关状态。
 */


    sendClaimMailAttachments(mailIds: string[]): void {
      deps.emitEvent(C2S.ClaimMailAttachments, { mailIds });
    },    
    /**
 * sendDeleteMail：处理sendDelete邮件并更新相关状态。
 * @param mailIds string[] mail ID 集合。
 * @returns 无返回值，直接更新sendDelete邮件相关状态。
 */


    sendDeleteMail(mailIds: string[]): void {
      deps.emitEvent(C2S.DeleteMail, { mailIds });
    },    
    /**
 * sendRequestMarket：处理sendRequest坊市并更新相关状态。
 * @returns 无返回值，直接更新sendRequest坊市相关状态。
 */


    sendRequestMarket(): void {
      deps.emitEvent(C2S.RequestMarket, {});
    },    
    /**
 * sendRequestMarketListings：读取sendRequest坊市Listing并返回结果。
 * @param payload ClientToServerEventPayload<typeof C2S.RequestMarketListings> 载荷参数。
 * @returns 无返回值，直接更新sendRequest坊市Listing相关状态。
 */


    sendRequestMarketListings(
      payload: ClientToServerEventPayload<typeof C2S.RequestMarketListings>,
    ): void {
      deps.emitEvent(C2S.RequestMarketListings, payload);
    },    
    /**
 * sendRequestMarketItemBook：处理sendRequest坊市道具Book并更新相关状态。
 * @param itemKey string 参数说明。
 * @returns 无返回值，直接更新sendRequest坊市道具Book相关状态。
 */


    sendRequestMarketItemBook(itemKey: string): void {
      deps.emitEvent(C2S.RequestMarketItemBook, { itemKey });
    },    
    /**
 * sendRequestMarketTradeHistory：判断sendRequest坊市Trade历史是否满足条件。
 * @param page number 参数说明。
 * @returns 无返回值，直接更新sendRequest坊市TradeHistory相关状态。
 */


    sendRequestMarketTradeHistory(page: number): void {
      deps.emitEvent(C2S.RequestMarketTradeHistory, { page });
    },    
    /**
 * sendCreateMarketSellOrder：构建sendCreate坊市Sell订单。
 * @param slotIndex number 参数说明。
 * @param quantity number 参数说明。
 * @param unitPrice number 参数说明。
 * @returns 无返回值，直接更新sendCreate坊市Sell订单相关状态。
 */


    sendCreateMarketSellOrder(slotIndex: number, quantity: number, unitPrice: number): void {
      deps.emitEvent(C2S.CreateMarketSellOrder, { slotIndex, quantity, unitPrice });
    },    
    /**
 * sendCreateMarketBuyOrder：构建sendCreate坊市Buy订单。
 * @param itemKey string 参数说明。
 * @param quantity number 参数说明。
 * @param unitPrice number 参数说明。
 * @returns 无返回值，直接更新sendCreate坊市Buy订单相关状态。
 */


    sendCreateMarketBuyOrder(itemKey: string, quantity: number, unitPrice: number): void {
      deps.emitEvent(C2S.CreateMarketBuyOrder, { itemKey, quantity, unitPrice });
    },    
    /**
 * sendBuyMarketItem：处理sendBuy坊市道具并更新相关状态。
 * @param itemKey string 参数说明。
 * @param quantity number 参数说明。
 * @returns 无返回值，直接更新sendBuy坊市道具相关状态。
 */


    sendBuyMarketItem(itemKey: string, quantity: number): void {
      deps.emitEvent(C2S.BuyMarketItem, { itemKey, quantity });
    },    
    /**
 * sendSellMarketItem：处理sendSell坊市道具并更新相关状态。
 * @param slotIndex number 参数说明。
 * @param quantity number 参数说明。
 * @returns 无返回值，直接更新sendSell坊市道具相关状态。
 */


    sendSellMarketItem(slotIndex: number, quantity: number): void {
      deps.emitEvent(C2S.SellMarketItem, { slotIndex, quantity });
    },    
    /**
 * sendCancelMarketOrder：判断sendCancel坊市订单是否满足条件。
 * @param orderId string order ID。
 * @returns 无返回值，直接更新sendCancel坊市订单相关状态。
 */


    sendCancelMarketOrder(orderId: string): void {
      deps.emitEvent(C2S.CancelMarketOrder, { orderId });
    },    
    /**
 * sendClaimMarketStorage：处理sendClaim坊市Storage并更新相关状态。
 * @returns 无返回值，直接更新sendClaim坊市Storage相关状态。
 */


    sendClaimMarketStorage(): void {
      deps.emitEvent(C2S.ClaimMarketStorage, {});
    },    
    /**
 * sendChat：执行sendChat相关逻辑。
 * @param message string 参数说明。
 * @returns 无返回值，直接更新sendChat相关状态。
 */


    sendChat(message: string): void {
      deps.emitEvent(C2S.Chat, { message });
    },    
    /**
 * ackSystemMessages：执行ackSystemMessage相关逻辑。
 * @param ids string[] 参数说明。
 * @returns 无返回值，直接更新ackSystemMessage相关状态。
 */


    ackSystemMessages(ids: string[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (ids.length === 0) {
        return;
      }
      deps.emitEvent(C2S.AckSystemMessages, { ids });
    },
  };
}
/**
 * SocketSocialEconomySender：统一结构类型，保证协议与运行时一致性。
 */


export type SocketSocialEconomySender = ReturnType<typeof createSocketSocialEconomySender>;

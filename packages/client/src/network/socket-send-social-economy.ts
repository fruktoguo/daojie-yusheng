import { NEXT_C2S, type NEXT_C2S_EventPayload } from '@mud/shared-next';
import type { SocketEmitEvent } from './socket-send-types';

type SocialEconomySenderDeps = {
  emitEvent: SocketEmitEvent;
};

export function createSocketSocialEconomySender(deps: SocialEconomySenderDeps) {
  return {
    sendRequestSuggestions(): void {
      deps.emitEvent(NEXT_C2S.RequestSuggestions, {});
    },

    sendCreateSuggestion(title: string, description: string): void {
      deps.emitEvent(NEXT_C2S.CreateSuggestion, { title, description });
    },

    sendReplySuggestion(suggestionId: string, content: string): void {
      deps.emitEvent(NEXT_C2S.ReplySuggestion, { suggestionId, content });
    },

    sendVoteSuggestion(suggestionId: string, vote: 'up' | 'down'): void {
      deps.emitEvent(NEXT_C2S.VoteSuggestion, { suggestionId, vote });
    },

    sendMarkSuggestionRepliesRead(suggestionId: string): void {
      deps.emitEvent(NEXT_C2S.MarkSuggestionRepliesRead, { suggestionId });
    },

    sendRequestMailSummary(): void {
      deps.emitEvent(NEXT_C2S.RequestMailSummary, {});
    },

    sendRequestMailPage(
      page: number,
      pageSize?: number,
      filter?: NEXT_C2S_EventPayload<typeof NEXT_C2S.RequestMailPage>['filter'],
    ): void {
      deps.emitEvent(NEXT_C2S.RequestMailPage, { page, pageSize, filter });
    },

    sendRequestMailDetail(mailId: string): void {
      deps.emitEvent(NEXT_C2S.RequestMailDetail, { mailId });
    },

    sendRedeemCodes(codes: string[]): void {
      deps.emitEvent(NEXT_C2S.RedeemCodes, { codes });
    },

    sendMarkMailRead(mailIds: string[]): void {
      deps.emitEvent(NEXT_C2S.MarkMailRead, { mailIds });
    },

    sendClaimMailAttachments(mailIds: string[]): void {
      deps.emitEvent(NEXT_C2S.ClaimMailAttachments, { mailIds });
    },

    sendDeleteMail(mailIds: string[]): void {
      deps.emitEvent(NEXT_C2S.DeleteMail, { mailIds });
    },

    sendRequestMarket(): void {
      deps.emitEvent(NEXT_C2S.RequestMarket, {});
    },

    sendRequestMarketListings(
      payload: NEXT_C2S_EventPayload<typeof NEXT_C2S.RequestMarketListings>,
    ): void {
      deps.emitEvent(NEXT_C2S.RequestMarketListings, payload);
    },

    sendRequestMarketItemBook(itemKey: string): void {
      deps.emitEvent(NEXT_C2S.RequestMarketItemBook, { itemKey });
    },

    sendRequestMarketTradeHistory(page: number): void {
      deps.emitEvent(NEXT_C2S.RequestMarketTradeHistory, { page });
    },

    sendCreateMarketSellOrder(slotIndex: number, quantity: number, unitPrice: number): void {
      deps.emitEvent(NEXT_C2S.CreateMarketSellOrder, { slotIndex, quantity, unitPrice });
    },

    sendCreateMarketBuyOrder(itemKey: string, quantity: number, unitPrice: number): void {
      deps.emitEvent(NEXT_C2S.CreateMarketBuyOrder, { itemKey, quantity, unitPrice });
    },

    sendBuyMarketItem(itemKey: string, quantity: number): void {
      deps.emitEvent(NEXT_C2S.BuyMarketItem, { itemKey, quantity });
    },

    sendSellMarketItem(slotIndex: number, quantity: number): void {
      deps.emitEvent(NEXT_C2S.SellMarketItem, { slotIndex, quantity });
    },

    sendCancelMarketOrder(orderId: string): void {
      deps.emitEvent(NEXT_C2S.CancelMarketOrder, { orderId });
    },

    sendClaimMarketStorage(): void {
      deps.emitEvent(NEXT_C2S.ClaimMarketStorage, {});
    },

    sendChat(message: string): void {
      deps.emitEvent(NEXT_C2S.Chat, { message });
    },

    ackSystemMessages(ids: string[]): void {
      if (ids.length === 0) {
        return;
      }
      deps.emitEvent(NEXT_C2S.AckSystemMessages, { ids });
    },
  };
}

export type SocketSocialEconomySender = ReturnType<typeof createSocketSocialEconomySender>;

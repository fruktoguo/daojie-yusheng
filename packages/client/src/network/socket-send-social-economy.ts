/**
 * 本文件属于客户端网络层，负责 socket 生命周期、发包封装或服务端事件消费。
 *
 * 维护时要使用共享协议事件名和最小字段，避免把服务端权威判断下沉到客户端。
 */
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

function buildInventoryItemRef(itemInstanceId: string): { itemInstanceId: string } {
  return { itemInstanceId };
}
/**
 * createSocketSocialEconomySender：构建并返回目标对象。
 * @param deps SocialEconomySenderDeps 运行时依赖。
 * @returns 无返回值，直接更新SocketSocialEconomySender相关状态。
 */


export function createSocketSocialEconomySender(deps: SocialEconomySenderDeps) {
  return {
    sendRequestActivityStatus(): void {
      deps.emitEvent(C2S.RequestActivityStatus, {});
    },
    sendClaimMeritMonthCard(): void {
      deps.emitEvent(C2S.ClaimMeritMonthCard, {});
    },
    sendClaimDailySignIn(): void {
      deps.emitEvent(C2S.ClaimDailySignIn, {});
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
 * sendRequestAuctionListings：读取sendRequest拍卖行Listing并返回结果。
 * @param payload ClientToServerEventPayload<typeof C2S.RequestAuctionListings> 载荷参数。
 * @returns 无返回值，直接更新sendRequest拍卖行Listing相关状态。
 */


    sendRequestAuctionListings(
      payload: ClientToServerEventPayload<typeof C2S.RequestAuctionListings>,
    ): void {
      deps.emitEvent(C2S.RequestAuctionListings, payload);
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


    sendRequestMarketTradeHistory(page: number, source: 'market' | 'auction' = 'market', scope: 'all' | 'mine' = 'mine'): void {
      deps.emitEvent(C2S.RequestMarketTradeHistory, { page, source, scope });
    },
    /**
 * sendCreateMarketSellOrder：构建sendCreate坊市Sell订单。
 * @param itemInstanceId string 背包物品实例 ID。
 * @param quantity number 参数说明。
 * @param unitPrice number 参数说明。
 * @returns 无返回值，直接更新sendCreate坊市Sell订单相关状态。
 */


    sendCreateMarketSellOrder(
      itemInstanceId: string,
      quantity: number,
      unitPrice: number,
      listingMode?: ClientToServerEventPayload<typeof C2S.CreateMarketSellOrder>['listingMode'],
      buyoutPrice?: ClientToServerEventPayload<typeof C2S.CreateMarketSellOrder>['buyoutPrice'],
      auctionDurationHours?: ClientToServerEventPayload<typeof C2S.CreateMarketSellOrder>['auctionDurationHours'],
    ): void {
      deps.emitEvent(C2S.CreateMarketSellOrder, {
        itemRef: buildInventoryItemRef(itemInstanceId),
        quantity,
        unitPrice,
        listingMode,
        buyoutPrice,
        ...(auctionDurationHours !== undefined ? { auctionDurationHours } : {}),
      });
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
 * sendPlaceAuctionBid：提交拍卖行加价。
 * @param lotId string 拍品 ID。
 * @param itemKey string 道具Key标识。
 * @param unitPrice number 出价价格。
 * @returns 无返回值，直接提交拍卖行加价意图。
 */


    sendPlaceAuctionBid(lotId: string, itemKey: string, unitPrice: number): void {
      deps.emitEvent(C2S.PlaceAuctionBid, { lotId, itemKey, unitPrice });
    },
    /**
 * sendBuyoutAuctionLot：提交拍卖行一口价。
 * @param lotId string 拍品 ID。
 * @param itemKey string 道具Key标识。
 * @returns 无返回值，直接提交拍卖行一口价意图。
 */


    sendBuyoutAuctionLot(lotId: string, itemKey: string): void {
      deps.emitEvent(C2S.BuyoutAuctionLot, { lotId, itemKey });
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
    /** 购买天道商店固定商品。 */
    sendBuyHeavenlyDaoShopItem(itemId: string, quantity: number): void {
      deps.emitEvent(C2S.BuyHeavenlyDaoShopItem, { itemId, quantity });
    },
    /**
 * sendSellMarketItem：处理sendSell坊市道具并更新相关状态。
 * @param itemInstanceId string 背包物品实例 ID。
 * @param quantity number 参数说明。
 * @returns 无返回值，直接更新sendSell坊市道具相关状态。
 */


    sendSellMarketItem(itemInstanceId: string, quantity: number): void {
      deps.emitEvent(C2S.SellMarketItem, {
        itemRef: buildInventoryItemRef(itemInstanceId),
        quantity,
      });
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
    ackOfflineGainReports(reportIds: string[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (reportIds.length === 0) {
        return;
      }
      deps.emitEvent(C2S.AckOfflineGainReports, { reportIds });
    },
    requestOfflineGainReports(): void {
      deps.emitEvent(C2S.RequestOfflineGainReports, {});
    },
  };
}
/**
 * SocketSocialEconomySender：统一结构类型，保证协议与运行时一致性。
 */


export type SocketSocialEconomySender = ReturnType<typeof createSocketSocialEconomySender>;

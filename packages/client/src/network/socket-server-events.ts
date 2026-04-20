import { NEXT_S2C, type NEXT_S2C_EventName, type NEXT_S2C_EventPayload } from '@mud/shared-next';
/**
 * BoundServerEventName：统一结构类型，保证协议与运行时一致性。
 */


export type BoundServerEventName = Exclude<NEXT_S2C_EventName, typeof NEXT_S2C.Kick>;
/**
 * ServerEventCallback：统一结构类型，保证协议与运行时一致性。
 */

export type ServerEventCallback<TEvent extends BoundServerEventName> = (data: NEXT_S2C_EventPayload<TEvent>) => void;
/**
 * ServerEventCallbackBuckets：统一结构类型，保证协议与运行时一致性。
 */

export type ServerEventCallbackBuckets = {
  [TEvent in BoundServerEventName]?: Array<ServerEventCallback<TEvent>>;
};

export const SESSION_SERVER_EVENTS = [
  NEXT_S2C.Bootstrap,
  NEXT_S2C.InitSession,
  NEXT_S2C.MapEnter,
  NEXT_S2C.MapStatic,
  NEXT_S2C.Realm,
  NEXT_S2C.WorldDelta,
  NEXT_S2C.SelfDelta,
  NEXT_S2C.PanelDelta,
  NEXT_S2C.Notice,
  NEXT_S2C.Pong,
  NEXT_S2C.Error,
] as const satisfies BoundServerEventName[];

export const GAMEPLAY_SERVER_EVENTS = [
  NEXT_S2C.LootWindowUpdate,
  NEXT_S2C.TileDetail,
  NEXT_S2C.Detail,
  NEXT_S2C.Quests,
  NEXT_S2C.NpcQuests,
  NEXT_S2C.QuestNavigateResult,
  NEXT_S2C.SuggestionUpdate,
  NEXT_S2C.MailSummary,
  NEXT_S2C.MailPage,
  NEXT_S2C.MailDetail,
  NEXT_S2C.RedeemCodesResult,
  NEXT_S2C.MailOpResult,
  NEXT_S2C.MarketUpdate,
  NEXT_S2C.MarketListings,
  NEXT_S2C.MarketOrders,
  NEXT_S2C.MarketStorage,
  NEXT_S2C.MarketItemBook,
  NEXT_S2C.MarketTradeHistory,
  NEXT_S2C.AttrDetail,
  NEXT_S2C.Leaderboard,
  NEXT_S2C.WorldSummary,
  NEXT_S2C.NpcShop,
  NEXT_S2C.AlchemyPanel,
  NEXT_S2C.EnhancementPanel,
  NEXT_S2C.GmState,
] as const satisfies BoundServerEventName[];

/**
 * 本文件属于客户端网络层，负责 socket 生命周期、发包封装或服务端事件消费。
 *
 * 维护时要使用共享协议事件名和最小字段，避免把服务端权威判断下沉到客户端。
 */
import { S2C, type ServerToClientEventName, type ServerToClientEventPayload } from '@mud/shared';
/**
 * BoundServerEventName：统一结构类型，保证协议与运行时一致性。
 */


export type BoundServerEventName = Exclude<ServerToClientEventName, typeof S2C.Kick>;
/**
 * ServerEventCallback：统一结构类型，保证协议与运行时一致性。
 */

export type ServerEventCallback<TEvent extends BoundServerEventName> = (data: ServerToClientEventPayload<TEvent>) => void;
/**
 * ServerEventCallbackBuckets：统一结构类型，保证协议与运行时一致性。
 */

export type ServerEventCallbackBuckets = {
  [TEvent in BoundServerEventName]?: Array<ServerEventCallback<TEvent>>;
};

export const SESSION_SERVER_EVENTS = [
  S2C.Bootstrap,
  S2C.InitSession,
  S2C.MapEnter,
  S2C.MapStatic,
  S2C.MinimapLibraryManifest,
  S2C.MinimapLibraryDelta,
  S2C.Realm,
  S2C.WorldDelta,
  S2C.SelfDelta,
  S2C.PanelDelta,
  S2C.SyncEnvelope,
  S2C.Notice,
  S2C.Pong,
  S2C.Error,
] as const satisfies BoundServerEventName[];

export const GAMEPLAY_SERVER_EVENTS = [
  S2C.LootWindowUpdate,
  S2C.TileDetail,
  S2C.Detail,
  S2C.Quests,
  S2C.NpcQuests,
  S2C.QuestNavigateResult,
  S2C.OfflineGainReports,
  S2C.ActivityStatus,
  S2C.ActivityOperationResult,
  S2C.MailSummary,
  S2C.MailPage,
  S2C.MailDetail,
  S2C.RedeemCodesResult,
  S2C.MailOpResult,
  S2C.MarketUpdate,
  S2C.MarketListings,
  S2C.AuctionListings,
  S2C.MarketOrders,
  S2C.MarketStorage,
  S2C.MarketItemBook,
  S2C.MarketTradeHistory,
  S2C.AttrDetail,
  S2C.Leaderboard,
  S2C.LeaderboardPlayerLocations,
  S2C.WorldSummary,
  S2C.NpcShop,
  S2C.BuildResult,
  S2C.RoomSummaryPatch,
  S2C.FengShuiOverlayPatch,
  S2C.FengShuiDetail,
  S2C.AlchemyPanel,
  S2C.EnhancementPanel,
  S2C.TechniqueActivityTasks,
  S2C.GmState,
  S2C.ContentTemplates,
  S2C.TechniqueGenerationStatus,
  S2C.TechniqueGenerationResult,
] as const satisfies BoundServerEventName[];

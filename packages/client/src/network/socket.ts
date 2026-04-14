/**
 * Socket.IO 网络管理器 —— 封装客户端与服务端的双向通信，提供类型安全的事件收发接口
 */

import { io, Socket } from 'socket.io-client';
import {
  C2S, S2C, C2S_Move, C2S_MoveTo, C2S_NavigateQuest, C2S_NavigateMapPoint, C2S_GmGetState, C2S_GmSpawnBots, C2S_GmRemoveBots, C2S_GmUpdatePlayer, C2S_GmResetPlayer, C2S_Action, C2S_UpdateAutoBattleSkills, C2S_UpdateAutoUsePills, C2S_UpdateCombatTargetingRules, C2S_UpdateAutoBattleTargetingMode, C2S_UpdateTechniqueSkillAvailability, C2S_DebugResetSpawn, C2S_UseItem, C2S_DropItem, C2S_DestroyItem,
  C2S_TakeLoot, C2S_CloseLootWindow, C2S_StopLootHarvest, C2S_SortInventory, C2S_Equip, C2S_Unequip, C2S_Cultivate, C2S_Chat, C2S_AckSystemMessages,
  C2S_Heartbeat,
  C2S_InspectTileRuntime,
  C2S_Ping,
  C2S_RequestSuggestions,
  C2S_RequestMailSummary,
  C2S_RequestMailPage,
  C2S_RequestMailDetail,
  C2S_RedeemCodes,
  C2S_MarkMailRead,
  C2S_ClaimMailAttachments,
  C2S_DeleteMail,
  C2S_RequestMarket,
  C2S_RequestMarketListings,
  C2S_RequestMarketItemBook,
  C2S_RequestMarketTradeHistory,
  C2S_RequestAttrDetail,
  C2S_RequestLeaderboard,
  C2S_RequestWorldSummary,
  C2S_CreateMarketSellOrder,
  C2S_CreateMarketBuyOrder,
  C2S_BuyMarketItem,
  C2S_SellMarketItem,
  C2S_CancelMarketOrder,
  C2S_ClaimMarketStorage,
  C2S_RequestNpcShop,
  C2S_BuyNpcShopItem,
  C2S_RequestAlchemyPanel,
  C2S_SaveAlchemyPreset,
  C2S_DeleteAlchemyPreset,
  C2S_StartAlchemy,
  C2S_CancelAlchemy,
  C2S_RequestEnhancementPanel,
  C2S_StartEnhancement,
  C2S_CancelEnhancement,
  C2S_HeavenGateAction,
  S2C_Tick, S2C_Init, S2C_MapStaticSync, S2C_RealmUpdate, S2C_AttrUpdate, S2C_InventoryUpdate,
  S2C_EquipmentUpdate, S2C_TechniqueUpdate, S2C_ActionsUpdate, S2C_LootWindowUpdate, S2C_QuestUpdate, S2C_QuestNavigateResult, S2C_SystemMsg, S2C_GmState,
  S2C_SuggestionUpdate,
  S2C_MailSummary,
  S2C_MailPage,
  S2C_MailDetail,
  S2C_RedeemCodesResult,
  S2C_MailOpResult,
  S2C_MarketUpdate,
  S2C_MarketListings,
  S2C_MarketOrders,
  S2C_MarketStorage,
  S2C_MarketItemBook,
  S2C_MarketTradeHistory,
  S2C_AttrDetail,
  S2C_Leaderboard,
  S2C_WorldSummary,
  S2C_NpcShop,
  S2C_AlchemyPanel,
  S2C_EnhancementPanel,
  S2C_Pong,
  S2C_TileRuntimeDetail,
  S2C_Error, decodeServerEventPayload, encodeClientEventPayload,
  AutoBattleSkillConfig, AutoBattleTargetingMode, AutoUsePillConfig, CombatTargetingRules, Direction, EquipSlot, PLAYER_HEARTBEAT_INTERVAL_MS,
  SOCKET_CONNECT_TIMEOUT_MS, SOCKET_RECONNECTION_ATTEMPTS, SOCKET_RECONNECTION_DELAY_MS,
  SOCKET_RECONNECTION_DELAY_MAX_MS, SOCKET_TRANSPORTS,
} from '@mud/shared';

/** 客户端 Socket.IO 连接管理，负责协议编解码与事件分发 */
export class SocketManager {
/** socket：定义该变量以承载业务值。 */
  private socket: Socket | null = null;
/** accessToken：定义该变量以承载业务值。 */
  private accessToken: string | null = null;
/** heartbeatTimer：定义该变量以承载业务值。 */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private onTickCallbacks: Array<(data: S2C_Tick) => void> = [];
  private onKickCallbacks: Array<() => void> = [];
  private onInitCallbacks: Array<(data: S2C_Init) => void> = [];
  private onMapStaticSyncCallbacks: Array<(data: S2C_MapStaticSync) => void> = [];
  private onRealmUpdateCallbacks: Array<(data: S2C_RealmUpdate) => void> = [];
  private onAttrUpdateCallbacks: Array<(data: S2C_AttrUpdate) => void> = [];
  private onInventoryUpdateCallbacks: Array<(data: S2C_InventoryUpdate) => void> = [];
  private onEquipmentUpdateCallbacks: Array<(data: S2C_EquipmentUpdate) => void> = [];
  private onTechniqueUpdateCallbacks: Array<(data: S2C_TechniqueUpdate) => void> = [];
  private onActionsUpdateCallbacks: Array<(data: S2C_ActionsUpdate) => void> = [];
  private onLootWindowUpdateCallbacks: Array<(data: S2C_LootWindowUpdate) => void> = [];
  private onTileRuntimeDetailCallbacks: Array<(data: S2C_TileRuntimeDetail) => void> = [];
  private onQuestUpdateCallbacks: Array<(data: S2C_QuestUpdate) => void> = [];
  private onQuestNavigateResultCallbacks: Array<(data: S2C_QuestNavigateResult) => void> = [];
  private onSystemMsgCallbacks: Array<(data: S2C_SystemMsg) => void> = [];
  private onErrorCallbacks: Array<(data: S2C_Error) => void> = [];
  private onGmStateCallbacks: Array<(data: S2C_GmState) => void> = [];
  private onSuggestionUpdateCallbacks: Array<(data: S2C_SuggestionUpdate) => void> = [];
  private onMailSummaryCallbacks: Array<(data: S2C_MailSummary) => void> = [];
  private onMailPageCallbacks: Array<(data: S2C_MailPage) => void> = [];
  private onMailDetailCallbacks: Array<(data: S2C_MailDetail) => void> = [];
  private onRedeemCodesResultCallbacks: Array<(data: S2C_RedeemCodesResult) => void> = [];
  private onMailOpResultCallbacks: Array<(data: S2C_MailOpResult) => void> = [];
  private onMarketUpdateCallbacks: Array<(data: S2C_MarketUpdate) => void> = [];
  private onMarketListingsCallbacks: Array<(data: S2C_MarketListings) => void> = [];
  private onMarketOrdersCallbacks: Array<(data: S2C_MarketOrders) => void> = [];
  private onMarketStorageCallbacks: Array<(data: S2C_MarketStorage) => void> = [];
  private onMarketItemBookCallbacks: Array<(data: S2C_MarketItemBook) => void> = [];
  private onMarketTradeHistoryCallbacks: Array<(data: S2C_MarketTradeHistory) => void> = [];
  private onAttrDetailCallbacks: Array<(data: S2C_AttrDetail) => void> = [];
  private onLeaderboardCallbacks: Array<(data: S2C_Leaderboard) => void> = [];
  private onWorldSummaryCallbacks: Array<(data: S2C_WorldSummary) => void> = [];
  private onNpcShopCallbacks: Array<(data: S2C_NpcShop) => void> = [];
  private onAlchemyPanelCallbacks: Array<(data: S2C_AlchemyPanel) => void> = [];
  private onEnhancementPanelCallbacks: Array<(data: S2C_EnhancementPanel) => void> = [];
  private onPongCallbacks: Array<(data: S2C_Pong) => void> = [];
  private onDisconnectCallbacks: Array<(reason: string) => void> = [];
  private onConnectErrorCallbacks: Array<(message: string) => void> = [];

  /** 建立 WebSocket 连接并绑定所有服务端事件 */
  connect(token: string) {
    this.accessToken = token;
    this.disposeSocket({ clearToken: false });
    this.socket = io({
      auth: { token },
      // Swarm rolling updates and reverse proxies can route polling requests
      // to a different task, while a single WebSocket connection avoids SID drift.
      transports: [...SOCKET_TRANSPORTS],
      reconnection: true,
      reconnectionAttempts: SOCKET_RECONNECTION_ATTEMPTS,
      reconnectionDelay: SOCKET_RECONNECTION_DELAY_MS,
      reconnectionDelayMax: SOCKET_RECONNECTION_DELAY_MAX_MS,
      timeout: SOCKET_CONNECT_TIMEOUT_MS,
    });

    this.socket.on('connect', () => {
      this.startHeartbeat();
      this.sendHeartbeat();
    });

    this.bindServerEvent(S2C.Init, this.onInitCallbacks);
    this.bindServerEvent(S2C.Tick, this.onTickCallbacks);
    this.bindServerEvent(S2C.MapStaticSync, this.onMapStaticSyncCallbacks);
    this.bindServerEvent(S2C.RealmUpdate, this.onRealmUpdateCallbacks);
    this.bindServerEvent(S2C.AttrUpdate, this.onAttrUpdateCallbacks);
    this.bindServerEvent(S2C.InventoryUpdate, this.onInventoryUpdateCallbacks);
    this.bindServerEvent(S2C.EquipmentUpdate, this.onEquipmentUpdateCallbacks);
    this.bindServerEvent(S2C.TechniqueUpdate, this.onTechniqueUpdateCallbacks);
    this.bindServerEvent(S2C.ActionsUpdate, this.onActionsUpdateCallbacks);
    this.bindServerEvent(S2C.LootWindowUpdate, this.onLootWindowUpdateCallbacks);
    this.bindServerEvent(S2C.TileRuntimeDetail, this.onTileRuntimeDetailCallbacks);
    this.bindServerEvent(S2C.QuestUpdate, this.onQuestUpdateCallbacks);
    this.bindServerEvent(S2C.QuestNavigateResult, this.onQuestNavigateResultCallbacks);
    this.bindServerEvent(S2C.SystemMsg, this.onSystemMsgCallbacks);
    this.bindServerEvent(S2C.SuggestionUpdate, this.onSuggestionUpdateCallbacks);
    this.bindServerEvent(S2C.MailSummary, this.onMailSummaryCallbacks);
    this.bindServerEvent(S2C.MailPage, this.onMailPageCallbacks);
    this.bindServerEvent(S2C.MailDetail, this.onMailDetailCallbacks);
    this.bindServerEvent(S2C.RedeemCodesResult, this.onRedeemCodesResultCallbacks);
    this.bindServerEvent(S2C.MailOpResult, this.onMailOpResultCallbacks);
    this.bindServerEvent(S2C.MarketUpdate, this.onMarketUpdateCallbacks);
    this.bindServerEvent(S2C.MarketListings, this.onMarketListingsCallbacks);
    this.bindServerEvent(S2C.MarketOrders, this.onMarketOrdersCallbacks);
    this.bindServerEvent(S2C.MarketStorage, this.onMarketStorageCallbacks);
    this.bindServerEvent(S2C.MarketItemBook, this.onMarketItemBookCallbacks);
    this.bindServerEvent(S2C.MarketTradeHistory, this.onMarketTradeHistoryCallbacks);
    this.bindServerEvent(S2C.AttrDetail, this.onAttrDetailCallbacks);
    this.bindServerEvent(S2C.Leaderboard, this.onLeaderboardCallbacks);
    this.bindServerEvent(S2C.WorldSummary, this.onWorldSummaryCallbacks);
    this.bindServerEvent(S2C.NpcShop, this.onNpcShopCallbacks);
    this.bindServerEvent(S2C.AlchemyPanel, this.onAlchemyPanelCallbacks);
    this.bindServerEvent(S2C.EnhancementPanel, this.onEnhancementPanelCallbacks);
    this.bindServerEvent(S2C.Pong, this.onPongCallbacks);
    this.bindServerEvent(S2C.Error, this.onErrorCallbacks);
    this.bindServerEvent(S2C.GmState, this.onGmStateCallbacks);
    this.socket.on(S2C.Kick, () => {
      this.onKickCallbacks.forEach(cb => cb());
      this.disconnect();
    });

    this.socket.on('disconnect', (reason: string) => {
      this.stopHeartbeat();
      this.onDisconnectCallbacks.forEach(cb => cb(reason));
    });

    this.socket.on('connect_error', (error: Error) => {
      this.onConnectErrorCallbacks.forEach(cb => cb(error.message));
    });
  }

  /** 绑定服务端事件，自动解码 protobuf 载荷后分发给回调 */
  private bindServerEvent<T>(event: string, callbacks: Array<(data: T) => void>): void {
    this.socket?.on(event, (raw: unknown) => {
/** data：定义该变量以承载业务值。 */
      const data = decodeServerEventPayload<T>(event, raw);
      callbacks.forEach(cb => cb(data));
    });
  }

  /** 向服务端发送事件，自动编码载荷 */
  private emitServer<T>(event: string, payload: T): void {
    this.socket?.emit(event, encodeClientEventPayload(event, payload));
  }

/** disconnect：处理当前场景中的对应操作。 */
  disconnect() {
    this.disposeSocket({ clearToken: true });
  }

/** reconnect：执行对应的业务逻辑。 */
  reconnect(token?: string): boolean {
/** nextToken：定义该变量以承载业务值。 */
    const nextToken = token ?? this.accessToken;
    if (!nextToken) {
      return false;
    }
    this.connect(nextToken);
    return true;
  }

/** disposeSocket：处理当前场景中的对应操作。 */
  private disposeSocket(options: { clearToken: boolean }) {
    if (options.clearToken) {
      this.accessToken = null;
    }
    this.stopHeartbeat();
    this.socket?.disconnect();
    this.socket = null;
  }

/** startHeartbeat：执行对应的业务逻辑。 */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, PLAYER_HEARTBEAT_INTERVAL_MS);
  }

/** stopHeartbeat：执行对应的业务逻辑。 */
  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) {
      return;
    }
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

/** sendHeartbeat：执行对应的业务逻辑。 */
  private sendHeartbeat(): void {
    this.emitServer(C2S.Heartbeat, { clientAt: Date.now() } satisfies C2S_Heartbeat);
  }

  sendPing(clientAt = Date.now()): number {
    this.emitServer(C2S.Ping, { clientAt } satisfies C2S_Ping);
    return clientAt;
  }

/** sendMove：处理当前场景中的对应操作。 */
  sendMove(direction: Direction) {
    this.emitServer(C2S.Move, { d: direction } satisfies C2S_Move);
  }

  sendMoveTo(
    x: number,
    y: number,
    options?: {
      ignoreVisibilityLimit?: boolean;
      allowNearestReachable?: boolean;
      packedPath?: string;
      packedPathSteps?: number;
      pathStartX?: number;
      pathStartY?: number;
    },
  ) {
    this.emitServer(C2S.MoveTo, {
      x,
      y,
      ignoreVisibilityLimit: options?.ignoreVisibilityLimit,
      allowNearestReachable: options?.allowNearestReachable,
      packedPath: options?.packedPath,
      packedPathSteps: options?.packedPathSteps,
      pathStartX: options?.pathStartX,
      pathStartY: options?.pathStartY,
    } satisfies C2S_MoveTo);
  }

/** sendNavigateQuest：处理当前场景中的对应操作。 */
  sendNavigateQuest(questId: string) {
    this.emitServer(C2S.NavigateQuest, {
      questId,
    } satisfies C2S_NavigateQuest);
  }

/** sendNavigateMapPoint：处理当前场景中的对应操作。 */
  sendNavigateMapPoint(mapId: string, x: number, y: number) {
    this.emitServer(C2S.NavigateMapPoint, {
      mapId,
      x,
      y,
    } satisfies C2S_NavigateMapPoint);
  }

/** sendGmGetState：处理当前场景中的对应操作。 */
  sendGmGetState() {
    this.emitServer(C2S.GmGetState, {} satisfies C2S_GmGetState);
  }

/** sendGmSpawnBots：处理当前场景中的对应操作。 */
  sendGmSpawnBots(count: number) {
    this.emitServer(C2S.GmSpawnBots, { count } satisfies C2S_GmSpawnBots);
  }

/** sendGmRemoveBots：处理当前场景中的对应操作。 */
  sendGmRemoveBots(playerIds?: string[], all = false) {
    this.emitServer(C2S.GmRemoveBots, { playerIds, all } satisfies C2S_GmRemoveBots);
  }

/** sendGmUpdatePlayer：处理当前场景中的对应操作。 */
  sendGmUpdatePlayer(payload: C2S_GmUpdatePlayer) {
    this.emitServer(C2S.GmUpdatePlayer, payload satisfies C2S_GmUpdatePlayer);
  }

/** sendGmResetPlayer：处理当前场景中的对应操作。 */
  sendGmResetPlayer(playerId: string) {
    this.emitServer(C2S.GmResetPlayer, { playerId } satisfies C2S_GmResetPlayer);
  }

/** sendUseItem：处理当前场景中的对应操作。 */
  sendUseItem(slotIndex: number, count?: number) {
    this.emitServer(C2S.UseItem, { slotIndex, count } satisfies C2S_UseItem);
  }

/** sendDropItem：处理当前场景中的对应操作。 */
  sendDropItem(slotIndex: number, count: number) {
    this.emitServer(C2S.DropItem, { slotIndex, count } satisfies C2S_DropItem);
  }

/** sendDestroyItem：处理当前场景中的对应操作。 */
  sendDestroyItem(slotIndex: number, count: number) {
    this.emitServer(C2S.DestroyItem, { slotIndex, count } satisfies C2S_DestroyItem);
  }

/** sendTakeLoot：处理当前场景中的对应操作。 */
  sendTakeLoot(sourceId: string, itemKey?: string, takeAll = false) {
    this.emitServer(C2S.TakeLoot, { sourceId, itemKey, takeAll } satisfies C2S_TakeLoot);
  }

/** sendCloseLootWindow：处理当前场景中的对应操作。 */
  sendCloseLootWindow() {
    this.emitServer(C2S.CloseLootWindow, {} satisfies C2S_CloseLootWindow);
  }

/** sendStopLootHarvest：处理当前场景中的对应操作。 */
  sendStopLootHarvest() {
    this.emitServer(C2S.StopLootHarvest, {} satisfies C2S_StopLootHarvest);
  }

/** sendSortInventory：处理当前场景中的对应操作。 */
  sendSortInventory() {
    this.emitServer(C2S.SortInventory, {} satisfies C2S_SortInventory);
  }

/** sendInspectTileRuntime：处理当前场景中的对应操作。 */
  sendInspectTileRuntime(x: number, y: number) {
    this.emitServer(C2S.InspectTileRuntime, { x, y } satisfies C2S_InspectTileRuntime);
  }

/** sendEquip：处理当前场景中的对应操作。 */
  sendEquip(slotIndex: number) {
    this.emitServer(C2S.Equip, { slotIndex } satisfies C2S_Equip);
  }

/** sendUnequip：处理当前场景中的对应操作。 */
  sendUnequip(slot: EquipSlot) {
    this.emitServer(C2S.Unequip, { slot } satisfies C2S_Unequip);
  }

/** sendCultivate：处理当前场景中的对应操作。 */
  sendCultivate(techId: string | null) {
    this.emitServer(C2S.Cultivate, { techId } satisfies C2S_Cultivate);
  }

/** sendRequestSuggestions：处理当前场景中的对应操作。 */
  sendRequestSuggestions() {
    this.emitServer(C2S.RequestSuggestions, {} satisfies C2S_RequestSuggestions);
  }

/** sendRequestMailSummary：处理当前场景中的对应操作。 */
  sendRequestMailSummary() {
    this.emitServer(C2S.RequestMailSummary, {} satisfies C2S_RequestMailSummary);
  }

/** sendRequestMailPage：处理当前场景中的对应操作。 */
  sendRequestMailPage(page: number, pageSize?: number, filter?: C2S_RequestMailPage['filter']) {
    this.emitServer(C2S.RequestMailPage, { page, pageSize, filter } satisfies C2S_RequestMailPage);
  }

/** sendRequestMailDetail：处理当前场景中的对应操作。 */
  sendRequestMailDetail(mailId: string) {
    this.emitServer(C2S.RequestMailDetail, { mailId } satisfies C2S_RequestMailDetail);
  }

/** sendRedeemCodes：处理当前场景中的对应操作。 */
  sendRedeemCodes(codes: string[]) {
    this.emitServer(C2S.RedeemCodes, { codes } satisfies C2S_RedeemCodes);
  }

/** sendMarkMailRead：处理当前场景中的对应操作。 */
  sendMarkMailRead(mailIds: string[]) {
    this.emitServer(C2S.MarkMailRead, { mailIds } satisfies C2S_MarkMailRead);
  }

/** sendClaimMailAttachments：处理当前场景中的对应操作。 */
  sendClaimMailAttachments(mailIds: string[]) {
    this.emitServer(C2S.ClaimMailAttachments, { mailIds } satisfies C2S_ClaimMailAttachments);
  }

/** sendDeleteMail：处理当前场景中的对应操作。 */
  sendDeleteMail(mailIds: string[]) {
    this.emitServer(C2S.DeleteMail, { mailIds } satisfies C2S_DeleteMail);
  }

/** sendRequestMarket：处理当前场景中的对应操作。 */
  sendRequestMarket() {
    this.emitServer(C2S.RequestMarket, {} satisfies C2S_RequestMarket);
  }

/** sendRequestMarketListings：处理当前场景中的对应操作。 */
  sendRequestMarketListings(payload: C2S_RequestMarketListings) {
    this.emitServer(C2S.RequestMarketListings, payload satisfies C2S_RequestMarketListings);
  }

/** sendRequestMarketItemBook：处理当前场景中的对应操作。 */
  sendRequestMarketItemBook(itemKey: string) {
    this.emitServer(C2S.RequestMarketItemBook, { itemKey } satisfies C2S_RequestMarketItemBook);
  }

/** sendRequestMarketTradeHistory：处理当前场景中的对应操作。 */
  sendRequestMarketTradeHistory(page: number) {
    this.emitServer(C2S.RequestMarketTradeHistory, { page } satisfies C2S_RequestMarketTradeHistory);
  }

/** sendRequestAttrDetail：处理当前场景中的对应操作。 */
  sendRequestAttrDetail() {
    this.emitServer(C2S.RequestAttrDetail, {} satisfies C2S_RequestAttrDetail);
  }

/** sendRequestLeaderboard：处理当前场景中的对应操作。 */
  sendRequestLeaderboard(limit?: number) {
    this.emitServer(C2S.RequestLeaderboard, { limit } satisfies C2S_RequestLeaderboard);
  }

/** sendRequestWorldSummary：处理当前场景中的对应操作。 */
  sendRequestWorldSummary() {
    this.emitServer(C2S.RequestWorldSummary, {} satisfies C2S_RequestWorldSummary);
  }

/** sendCreateMarketSellOrder：处理当前场景中的对应操作。 */
  sendCreateMarketSellOrder(slotIndex: number, quantity: number, unitPrice: number) {
    this.emitServer(C2S.CreateMarketSellOrder, { slotIndex, quantity, unitPrice } satisfies C2S_CreateMarketSellOrder);
  }

/** sendCreateMarketBuyOrder：处理当前场景中的对应操作。 */
  sendCreateMarketBuyOrder(itemKey: string, quantity: number, unitPrice: number) {
    this.emitServer(C2S.CreateMarketBuyOrder, { itemKey, quantity, unitPrice } satisfies C2S_CreateMarketBuyOrder);
  }

/** sendBuyMarketItem：处理当前场景中的对应操作。 */
  sendBuyMarketItem(itemKey: string, quantity: number) {
    this.emitServer(C2S.BuyMarketItem, { itemKey, quantity } satisfies C2S_BuyMarketItem);
  }

/** sendSellMarketItem：处理当前场景中的对应操作。 */
  sendSellMarketItem(slotIndex: number, quantity: number) {
    this.emitServer(C2S.SellMarketItem, { slotIndex, quantity } satisfies C2S_SellMarketItem);
  }

/** sendCancelMarketOrder：处理当前场景中的对应操作。 */
  sendCancelMarketOrder(orderId: string) {
    this.emitServer(C2S.CancelMarketOrder, { orderId } satisfies C2S_CancelMarketOrder);
  }

/** sendClaimMarketStorage：处理当前场景中的对应操作。 */
  sendClaimMarketStorage() {
    this.emitServer(C2S.ClaimMarketStorage, {} satisfies C2S_ClaimMarketStorage);
  }

/** sendRequestNpcShop：处理当前场景中的对应操作。 */
  sendRequestNpcShop(npcId: string) {
    this.emitServer(C2S.RequestNpcShop, { npcId } satisfies C2S_RequestNpcShop);
  }

/** sendBuyNpcShopItem：处理当前场景中的对应操作。 */
  sendBuyNpcShopItem(npcId: string, itemId: string, quantity: number) {
    this.emitServer(C2S.BuyNpcShopItem, { npcId, itemId, quantity } satisfies C2S_BuyNpcShopItem);
  }

/** sendRequestAlchemyPanel：处理当前场景中的对应操作。 */
  sendRequestAlchemyPanel(knownCatalogVersion?: number) {
    this.emitServer(C2S.RequestAlchemyPanel, { knownCatalogVersion } satisfies C2S_RequestAlchemyPanel);
  }

/** sendSaveAlchemyPreset：处理当前场景中的对应操作。 */
  sendSaveAlchemyPreset(payload: C2S_SaveAlchemyPreset) {
    this.emitServer(C2S.SaveAlchemyPreset, payload);
  }

/** sendDeleteAlchemyPreset：处理当前场景中的对应操作。 */
  sendDeleteAlchemyPreset(presetId: string) {
    this.emitServer(C2S.DeleteAlchemyPreset, { presetId } satisfies C2S_DeleteAlchemyPreset);
  }

/** sendStartAlchemy：处理当前场景中的对应操作。 */
  sendStartAlchemy(payload: C2S_StartAlchemy) {
    this.emitServer(C2S.StartAlchemy, payload);
  }

/** sendCancelAlchemy：处理当前场景中的对应操作。 */
  sendCancelAlchemy() {
    this.emitServer(C2S.CancelAlchemy, {} satisfies C2S_CancelAlchemy);
  }

/** sendRequestEnhancementPanel：处理当前场景中的对应操作。 */
  sendRequestEnhancementPanel() {
    this.emitServer(C2S.RequestEnhancementPanel, {} satisfies C2S_RequestEnhancementPanel);
  }

/** sendStartEnhancement：处理当前场景中的对应操作。 */
  sendStartEnhancement(payload: C2S_StartEnhancement) {
    this.emitServer(C2S.StartEnhancement, payload);
  }

/** sendCancelEnhancement：处理当前场景中的对应操作。 */
  sendCancelEnhancement() {
    this.emitServer(C2S.CancelEnhancement, {} satisfies C2S_CancelEnhancement);
  }

/** sendHeavenGateAction：处理当前场景中的对应操作。 */
  sendHeavenGateAction(action: C2S_HeavenGateAction['action'], element?: C2S_HeavenGateAction['element']) {
    this.emitServer(C2S.HeavenGateAction, { action, element } satisfies C2S_HeavenGateAction);
  }

/** sendAction：处理当前场景中的对应操作。 */
  sendAction(actionId: string, target?: string) {
    this.emitServer(C2S.Action, { actionId, type: actionId, target } satisfies C2S_Action);
  }

/** sendUpdateAutoBattleSkills：处理当前场景中的对应操作。 */
  sendUpdateAutoBattleSkills(skills: AutoBattleSkillConfig[]) {
    this.emitServer(C2S.UpdateAutoBattleSkills, { skills } satisfies C2S_UpdateAutoBattleSkills);
  }

/** sendUpdateAutoUsePills：处理当前场景中的对应操作。 */
  sendUpdateAutoUsePills(pills: AutoUsePillConfig[]) {
    this.emitServer(C2S.UpdateAutoUsePills, { pills } satisfies C2S_UpdateAutoUsePills);
  }

/** sendUpdateCombatTargetingRules：处理当前场景中的对应操作。 */
  sendUpdateCombatTargetingRules(combatTargetingRules: CombatTargetingRules) {
    this.emitServer(C2S.UpdateCombatTargetingRules, { combatTargetingRules } satisfies C2S_UpdateCombatTargetingRules);
  }

/** sendUpdateAutoBattleTargetingMode：处理当前场景中的对应操作。 */
  sendUpdateAutoBattleTargetingMode(mode: AutoBattleTargetingMode) {
    this.emitServer(C2S.UpdateAutoBattleTargetingMode, { mode } satisfies C2S_UpdateAutoBattleTargetingMode);
  }

/** sendUpdateTechniqueSkillAvailability：处理当前场景中的对应操作。 */
  sendUpdateTechniqueSkillAvailability(techId: string, enabled: boolean) {
    this.emitServer(C2S.UpdateTechniqueSkillAvailability, { techId, enabled } satisfies C2S_UpdateTechniqueSkillAvailability);
  }

/** sendDebugResetSpawn：处理当前场景中的对应操作。 */
  sendDebugResetSpawn() {
    this.emitServer(C2S.DebugResetSpawn, { force: true } satisfies C2S_DebugResetSpawn);
    this.emitServer(C2S.Action, { actionId: 'debug:reset_spawn', type: 'debug:reset_spawn' } satisfies C2S_Action);
  }

/** sendChat：处理当前场景中的对应操作。 */
  sendChat(message: string) {
    this.emitServer(C2S.Chat, { message } satisfies C2S_Chat);
  }

/** ackSystemMessages：处理当前场景中的对应操作。 */
  ackSystemMessages(ids: string[]) {
    if (ids.length === 0) {
      return;
    }
    this.emitServer(C2S.AckSystemMessages, { ids } satisfies C2S_AckSystemMessages);
  }

  onInit(cb: (data: S2C_Init) => void) { this.onInitCallbacks.push(cb); }
  onTick(cb: (data: S2C_Tick) => void) { this.onTickCallbacks.push(cb); }
  onMapStaticSync(cb: (data: S2C_MapStaticSync) => void) { this.onMapStaticSyncCallbacks.push(cb); }
  onRealmUpdate(cb: (data: S2C_RealmUpdate) => void) { this.onRealmUpdateCallbacks.push(cb); }
  onKick(cb: () => void) { this.onKickCallbacks.push(cb); }
  onAttrUpdate(cb: (data: S2C_AttrUpdate) => void) { this.onAttrUpdateCallbacks.push(cb); }
  onInventoryUpdate(cb: (data: S2C_InventoryUpdate) => void) { this.onInventoryUpdateCallbacks.push(cb); }
  onEquipmentUpdate(cb: (data: S2C_EquipmentUpdate) => void) { this.onEquipmentUpdateCallbacks.push(cb); }
  onTechniqueUpdate(cb: (data: S2C_TechniqueUpdate) => void) { this.onTechniqueUpdateCallbacks.push(cb); }
  onActionsUpdate(cb: (data: S2C_ActionsUpdate) => void) { this.onActionsUpdateCallbacks.push(cb); }
  onLootWindowUpdate(cb: (data: S2C_LootWindowUpdate) => void) { this.onLootWindowUpdateCallbacks.push(cb); }
  onTileRuntimeDetail(cb: (data: S2C_TileRuntimeDetail) => void) { this.onTileRuntimeDetailCallbacks.push(cb); }
  onQuestUpdate(cb: (data: S2C_QuestUpdate) => void) { this.onQuestUpdateCallbacks.push(cb); }
  onQuestNavigateResult(cb: (data: S2C_QuestNavigateResult) => void) { this.onQuestNavigateResultCallbacks.push(cb); }
  onSystemMsg(cb: (data: S2C_SystemMsg) => void) { this.onSystemMsgCallbacks.push(cb); }
  onSuggestionUpdate(cb: (data: S2C_SuggestionUpdate) => void) { this.onSuggestionUpdateCallbacks.push(cb); }
  onMailSummary(cb: (data: S2C_MailSummary) => void) { this.onMailSummaryCallbacks.push(cb); }
  onMailPage(cb: (data: S2C_MailPage) => void) { this.onMailPageCallbacks.push(cb); }
  onMailDetail(cb: (data: S2C_MailDetail) => void) { this.onMailDetailCallbacks.push(cb); }
  onRedeemCodesResult(cb: (data: S2C_RedeemCodesResult) => void) { this.onRedeemCodesResultCallbacks.push(cb); }
  onMailOpResult(cb: (data: S2C_MailOpResult) => void) { this.onMailOpResultCallbacks.push(cb); }
  onMarketUpdate(cb: (data: S2C_MarketUpdate) => void) { this.onMarketUpdateCallbacks.push(cb); }
  onMarketListings(cb: (data: S2C_MarketListings) => void) { this.onMarketListingsCallbacks.push(cb); }
  onMarketOrders(cb: (data: S2C_MarketOrders) => void) { this.onMarketOrdersCallbacks.push(cb); }
  onMarketStorage(cb: (data: S2C_MarketStorage) => void) { this.onMarketStorageCallbacks.push(cb); }
  onMarketItemBook(cb: (data: S2C_MarketItemBook) => void) { this.onMarketItemBookCallbacks.push(cb); }
  onMarketTradeHistory(cb: (data: S2C_MarketTradeHistory) => void) { this.onMarketTradeHistoryCallbacks.push(cb); }
  onAttrDetail(cb: (data: S2C_AttrDetail) => void) { this.onAttrDetailCallbacks.push(cb); }
  onLeaderboard(cb: (data: S2C_Leaderboard) => void) { this.onLeaderboardCallbacks.push(cb); }
  onWorldSummary(cb: (data: S2C_WorldSummary) => void) { this.onWorldSummaryCallbacks.push(cb); }
  onNpcShop(cb: (data: S2C_NpcShop) => void) { this.onNpcShopCallbacks.push(cb); }
  onAlchemyPanel(cb: (data: S2C_AlchemyPanel) => void) { this.onAlchemyPanelCallbacks.push(cb); }
  onEnhancementPanel(cb: (data: S2C_EnhancementPanel) => void) { this.onEnhancementPanelCallbacks.push(cb); }
  onPong(cb: (data: S2C_Pong) => void) { this.onPongCallbacks.push(cb); }
  onError(cb: (data: S2C_Error) => void) { this.onErrorCallbacks.push(cb); }
  onGmState(cb: (data: S2C_GmState) => void) { this.onGmStateCallbacks.push(cb); }
  onDisconnect(cb: (reason: string) => void) { this.onDisconnectCallbacks.push(cb); }
  onConnectError(cb: (message: string) => void) { this.onConnectErrorCallbacks.push(cb); }

/** emit：处理当前场景中的对应操作。 */
  emit(event: string, payload: any) {
    this.emitServer(event, payload);
  }

/** connected：执行对应的业务逻辑。 */
  get connected(): boolean {
    return this.socket?.connected ?? false;
  }
}

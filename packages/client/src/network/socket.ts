/**
 * Socket.IO 网络管理器 —— 封装客户端与服务端的双向通信，提供类型安全的事件收发接口
 */

import { io, Socket } from 'socket.io-client';
import type { NEXT_S2C_MapStatic, NEXT_S2C_Realm } from '@mud/shared-next';
import { logNextMovement } from '../debug/movement-debug';
import {
  NEXT_C2S,
  NEXT_S2C,
  NEXT_S2C_InitSession,
  NEXT_S2C_MapEnter,
  NEXT_S2C_WorldDelta,
  NEXT_S2C_SelfDelta,
  NEXT_S2C_PanelDelta,
  NEXT_S2C_Notice,
  NEXT_S2C_NpcQuests,
  NEXT_S2C_Detail,
  NEXT_S2C_TileDetail,
  NEXT_S2C_Bootstrap,
  decodeServerEventPayload, encodeClientEventPayload,
  AutoBattleSkillConfig, AutoUsePillConfig, AutoBattleTargetingMode, CombatTargetingRules, Direction, EquipSlot, PLAYER_HEARTBEAT_INTERVAL_MS,
  SOCKET_CONNECT_TIMEOUT_MS, SOCKET_RECONNECTION_ATTEMPTS, SOCKET_RECONNECTION_DELAY_MS,
  SOCKET_RECONNECTION_DELAY_MAX_MS, SOCKET_TRANSPORTS,
} from '@mud/shared-next';

/** 客户端 Socket.IO 连接管理，负责协议编解码与事件分发 */
export class SocketManager {
/** socket：定义该变量以承载业务值。 */
  private socket: Socket | null = null;
/** accessToken：定义该变量以承载业务值。 */
  private accessToken: string | null = null;
/** heartbeatTimer：定义该变量以承载业务值。 */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private onKickCallbacks: Array<() => void> = [];
  private onBootstrapCallbacks: Array<(data: NEXT_S2C_Bootstrap) => void> = [];
  private onNextInitSessionCallbacks: Array<(data: NEXT_S2C_InitSession) => void> = [];
  private onNextMapEnterCallbacks: Array<(data: NEXT_S2C_MapEnter) => void> = [];
  private onNextWorldDeltaCallbacks: Array<(data: NEXT_S2C_WorldDelta) => void> = [];
  private onNextSelfDeltaCallbacks: Array<(data: NEXT_S2C_SelfDelta) => void> = [];
  private onNextPanelDeltaCallbacks: Array<(data: NEXT_S2C_PanelDelta) => void> = [];
  private onNextNoticeCallbacks: Array<(data: NEXT_S2C_Notice) => void> = [];
  private onNextNpcQuestsCallbacks: Array<(data: NEXT_S2C_NpcQuests) => void> = [];
  private onNextDetailCallbacks: Array<(data: NEXT_S2C_Detail) => void> = [];
  private onNextTileDetailCallbacks: Array<(data: NEXT_S2C_TileDetail) => void> = [];
  private onMapStaticCallbacks: Array<(data: NEXT_S2C_MapStatic) => void> = [];
  private onRealmCallbacks: Array<(data: NEXT_S2C_Realm) => void> = [];
  private onLootWindowUpdateCallbacks: Array<(data: any) => void> = [];
  private onQuestUpdateCallbacks: Array<(data: any) => void> = [];
  private onQuestNavigateResultCallbacks: Array<(data: any) => void> = [];
  private onSystemMsgCallbacks: Array<(data: any) => void> = [];
  private onErrorCallbacks: Array<(data: any) => void> = [];
  private onGmStateCallbacks: Array<(data: any) => void> = [];
  private onSuggestionUpdateCallbacks: Array<(data: any) => void> = [];
  private onMailSummaryCallbacks: Array<(data: any) => void> = [];
  private onMailPageCallbacks: Array<(data: any) => void> = [];
  private onMailDetailCallbacks: Array<(data: any) => void> = [];
  private onRedeemCodesResultCallbacks: Array<(data: any) => void> = [];
  private onMailOpResultCallbacks: Array<(data: any) => void> = [];
  private onMarketUpdateCallbacks: Array<(data: any) => void> = [];
  private onMarketListingsCallbacks: Array<(data: any) => void> = [];
  private onMarketOrdersCallbacks: Array<(data: any) => void> = [];
  private onMarketStorageCallbacks: Array<(data: any) => void> = [];
  private onMarketItemBookCallbacks: Array<(data: any) => void> = [];
  private onMarketTradeHistoryCallbacks: Array<(data: any) => void> = [];
  private onAttrDetailCallbacks: Array<(data: any) => void> = [];
  private onLeaderboardCallbacks: Array<(data: any) => void> = [];
  private onWorldSummaryCallbacks: Array<(data: any) => void> = [];
  private onNpcShopCallbacks: Array<(data: any) => void> = [];
  private onAlchemyPanelCallbacks: Array<(data: any) => void> = [];
  private onEnhancementPanelCallbacks: Array<(data: any) => void> = [];
  private onPongCallbacks: Array<(data: any) => void> = [];
  private onDisconnectCallbacks: Array<(reason: string) => void> = [];
  private onConnectErrorCallbacks: Array<(message: string) => void> = [];
  /** 建立 WebSocket 连接并绑定所有服务端事件 */
  connect(token: string) {
    this.accessToken = token;
    this.disposeSocket({ clearToken: false });
    this.socket = io({
      auth: { token, protocol: 'next' },
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
      this.sendHello();
    });

    this.bindServerEvent(NEXT_S2C.Bootstrap, this.onBootstrapCallbacks);
    this.bindServerEvent(NEXT_S2C.InitSession, this.onNextInitSessionCallbacks);
    this.bindServerEvent(NEXT_S2C.MapEnter, this.onNextMapEnterCallbacks);
    this.bindServerEvent(NEXT_S2C.MapStatic, this.onMapStaticCallbacks);
    this.bindServerEvent(NEXT_S2C.Realm, this.onRealmCallbacks);
    this.bindServerEvent(NEXT_S2C.WorldDelta, this.onNextWorldDeltaCallbacks);
    this.bindServerEvent(NEXT_S2C.SelfDelta, this.onNextSelfDeltaCallbacks);
    this.bindServerEvent(NEXT_S2C.PanelDelta, this.onNextPanelDeltaCallbacks);
    this.bindServerEvent(NEXT_S2C.Notice, this.onNextNoticeCallbacks);
    this.bindServerEvent(NEXT_S2C.LootWindowUpdate, this.onLootWindowUpdateCallbacks);
    this.bindServerEvent(NEXT_S2C.TileDetail, this.onNextTileDetailCallbacks);
    this.bindServerEvent(NEXT_S2C.Detail, this.onNextDetailCallbacks);
    this.bindServerEvent(NEXT_S2C.Quests, this.onQuestUpdateCallbacks);
    this.bindServerEvent(NEXT_S2C.NpcQuests, this.onNextNpcQuestsCallbacks);
    this.bindServerEvent(NEXT_S2C.QuestNavigateResult, this.onQuestNavigateResultCallbacks);
    this.bindServerEvent(NEXT_S2C.SuggestionUpdate, this.onSuggestionUpdateCallbacks);
    this.bindServerEvent(NEXT_S2C.MailSummary, this.onMailSummaryCallbacks);
    this.bindServerEvent(NEXT_S2C.MailPage, this.onMailPageCallbacks);
    this.bindServerEvent(NEXT_S2C.MailDetail, this.onMailDetailCallbacks);
    this.bindServerEvent(NEXT_S2C.RedeemCodesResult, this.onRedeemCodesResultCallbacks);
    this.bindServerEvent(NEXT_S2C.MailOpResult, this.onMailOpResultCallbacks);
    this.bindServerEvent(NEXT_S2C.MarketUpdate, this.onMarketUpdateCallbacks);
    this.bindServerEvent(NEXT_S2C.MarketListings, this.onMarketListingsCallbacks);
    this.bindServerEvent(NEXT_S2C.MarketOrders, this.onMarketOrdersCallbacks);
    this.bindServerEvent(NEXT_S2C.MarketStorage, this.onMarketStorageCallbacks);
    this.bindServerEvent(NEXT_S2C.MarketItemBook, this.onMarketItemBookCallbacks);
    this.bindServerEvent(NEXT_S2C.MarketTradeHistory, this.onMarketTradeHistoryCallbacks);
    this.bindServerEvent(NEXT_S2C.AttrDetail, this.onAttrDetailCallbacks);
    this.bindServerEvent(NEXT_S2C.Leaderboard, this.onLeaderboardCallbacks);
    this.bindServerEvent(NEXT_S2C.WorldSummary, this.onWorldSummaryCallbacks);
    this.bindServerEvent(NEXT_S2C.NpcShop, this.onNpcShopCallbacks);
    this.bindServerEvent(NEXT_S2C.AlchemyPanel, this.onAlchemyPanelCallbacks);
    this.bindServerEvent(NEXT_S2C.EnhancementPanel, this.onEnhancementPanelCallbacks);
    this.bindServerEvent(NEXT_S2C.Pong, this.onPongCallbacks);
    this.bindServerEvent(NEXT_S2C.Error, this.onErrorCallbacks);
    this.bindServerEvent(NEXT_S2C.GmState, this.onGmStateCallbacks);
    this.socket.on(NEXT_S2C.Kick, () => {
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
    this.emitServer(NEXT_C2S.Heartbeat, { clientAt: Date.now() });
  }

/** sendHello：执行对应的业务逻辑。 */
  private sendHello(): void {
    this.emitServer(NEXT_C2S.Hello, {});
  }

  sendPing(clientAt = Date.now()): number {
    this.emitServer(NEXT_C2S.Ping, { clientAt });
    return clientAt;
  }

/** sendMove：处理当前场景中的对应操作。 */
  sendMove(direction: Direction) {
    logNextMovement('client.emit.move', {
      direction,
      connected: this.socket?.connected ?? false,
    });
    this.emitServer(NEXT_C2S.Move, { d: direction });
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
    logNextMovement('client.emit.moveTo', {
      x,
      y,
/** allowNearestReachable：定义该变量以承载业务值。 */
      allowNearestReachable: options?.allowNearestReachable === true,
/** ignoreVisibilityLimit：定义该变量以承载业务值。 */
      ignoreVisibilityLimit: options?.ignoreVisibilityLimit === true,
      packedPathSteps: options?.packedPathSteps ?? null,
      packedPath: options?.packedPath ?? null,
      pathStartX: options?.pathStartX ?? null,
      pathStartY: options?.pathStartY ?? null,
      connected: this.socket?.connected ?? false,
    });
    this.emitServer(NEXT_C2S.MoveTo, {
      x,
      y,
      ignoreVisibilityLimit: options?.ignoreVisibilityLimit,
      allowNearestReachable: options?.allowNearestReachable,
      packedPath: options?.packedPath,
      packedPathSteps: options?.packedPathSteps,
      pathStartX: options?.pathStartX,
      pathStartY: options?.pathStartY,
    });
  }

/** sendNavigateQuest：处理当前场景中的对应操作。 */
  sendNavigateQuest(questId: string) {
    logNextMovement('client.emit.navigateQuest', { questId });
    this.emitServer(NEXT_C2S.NavigateQuest, {
      questId,
    });
  }

/** sendRequestQuests：处理当前场景中的对应操作。 */
  sendRequestQuests() {
    this.emitServer(NEXT_C2S.RequestQuests, {});
  }

/** sendRequestNpcQuests：处理当前场景中的对应操作。 */
  sendRequestNpcQuests(npcId: string) {
    this.emitServer(NEXT_C2S.RequestNpcQuests, { npcId });
  }

/** sendAcceptNpcQuest：处理当前场景中的对应操作。 */
  sendAcceptNpcQuest(npcId: string, questId: string) {
    this.emitServer(NEXT_C2S.AcceptNpcQuest, { npcId, questId });
  }

/** sendSubmitNpcQuest：处理当前场景中的对应操作。 */
  sendSubmitNpcQuest(npcId: string, questId: string) {
    this.emitServer(NEXT_C2S.SubmitNpcQuest, { npcId, questId });
  }

  /** sendRequestDetail：处理当前场景中的对应操作。 */
  sendRequestDetail(kind: string, id: string) {
    this.emitServer(NEXT_C2S.RequestDetail, { kind, id });
  }

/** sendGmGetState：处理当前场景中的对应操作。 */
  sendGmGetState() {
    this.emitServer(NEXT_C2S.GmGetState, {});
  }

/** sendGmSpawnBots：处理当前场景中的对应操作。 */
  sendGmSpawnBots(count: number) {
    this.emitServer(NEXT_C2S.GmSpawnBots, { count });
  }

/** sendGmRemoveBots：处理当前场景中的对应操作。 */
  sendGmRemoveBots(playerIds?: string[], all = false) {
    this.emitServer(NEXT_C2S.GmRemoveBots, { playerIds, all });
  }

  /** sendGmUpdatePlayer：处理当前场景中的对应操作。 */
  sendGmUpdatePlayer(payload: any) {
    this.emitServer(NEXT_C2S.GmUpdatePlayer, payload);
  }

/** sendGmResetPlayer：处理当前场景中的对应操作。 */
  sendGmResetPlayer(playerId: string) {
    this.emitServer(NEXT_C2S.GmResetPlayer, { playerId });
  }

/** sendUseItem：处理当前场景中的对应操作。 */
  sendUseItem(slotIndex: number, count?: number) {
    this.emitServer(NEXT_C2S.UseItem, { slotIndex, count });
  }

/** sendDropItem：处理当前场景中的对应操作。 */
  sendDropItem(slotIndex: number, count: number) {
    this.emitServer(NEXT_C2S.DropItem, { slotIndex, count });
  }

/** sendDestroyItem：处理当前场景中的对应操作。 */
  sendDestroyItem(slotIndex: number, count: number) {
    this.emitServer(NEXT_C2S.DestroyItem, { slotIndex, count });
  }

/** sendTakeLoot：处理当前场景中的对应操作。 */
  sendTakeLoot(sourceId: string, itemKey?: string, takeAll = false) {
    this.emitServer(NEXT_C2S.TakeGround, { sourceId, itemKey, takeAll });
  }

/** sendSortInventory：处理当前场景中的对应操作。 */
  sendSortInventory() {
    this.emitServer(NEXT_C2S.SortInventory, {});
  }

/** sendInspectTileRuntime：处理当前场景中的对应操作。 */
  sendInspectTileRuntime(x: number, y: number) {
    this.emitServer(NEXT_C2S.RequestTileDetail, { x, y });
  }

/** sendEquip：处理当前场景中的对应操作。 */
  sendEquip(slotIndex: number) {
    this.emitServer(NEXT_C2S.Equip, { slotIndex });
  }

/** sendUnequip：处理当前场景中的对应操作。 */
  sendUnequip(slot: EquipSlot) {
    this.emitServer(NEXT_C2S.Unequip, { slot });
  }

/** sendCultivate：处理当前场景中的对应操作。 */
  sendCultivate(techId: string | null) {
    this.emitServer(NEXT_C2S.Cultivate, { techId });
  }

/** sendCastSkill：处理当前场景中的对应操作。 */
  sendCastSkill(skillId: string, target?: string) {
/** payload：定义该变量以承载业务值。 */
    const payload: {
/** skillId：定义该变量以承载业务值。 */
      skillId: string;
      targetPlayerId?: string | null;
      targetMonsterId?: string | null;
      targetRef?: string | null;
    } = { skillId };
    if (target) {
      if (target.startsWith('player:')) {
        payload.targetPlayerId = target.slice('player:'.length) || null;
      } else if (target.startsWith('tile:')) {
        payload.targetRef = target;
      } else {
        payload.targetMonsterId = target;
      }
    }
    this.emitServer(NEXT_C2S.CastSkill, payload);
  }

/** sendRequestSuggestions：处理当前场景中的对应操作。 */
  sendRequestSuggestions() {
    this.emitServer(NEXT_C2S.RequestSuggestions, {});
  }

  sendCreateSuggestion(title: string, description: string) {
    this.emitServer(NEXT_C2S.CreateSuggestion, { title, description });
  }

  sendReplySuggestion(suggestionId: string, content: string) {
    this.emitServer(NEXT_C2S.ReplySuggestion, { suggestionId, content });
  }

  sendVoteSuggestion(suggestionId: string, vote: 'up' | 'down') {
    this.emitServer(NEXT_C2S.VoteSuggestion, { suggestionId, vote });
  }

  sendMarkSuggestionRepliesRead(suggestionId: string) {
    this.emitServer(NEXT_C2S.MarkSuggestionRepliesRead, { suggestionId });
  }

/** sendRequestMailSummary：处理当前场景中的对应操作。 */
  sendRequestMailSummary() {
    this.emitServer(NEXT_C2S.RequestMailSummary, {});
  }

/** sendRequestMailPage：处理当前场景中的对应操作。 */
  sendRequestMailPage(page: number, pageSize?: number, filter?: any) {
    this.emitServer(NEXT_C2S.RequestMailPage, { page, pageSize, filter });
  }

/** sendRequestMailDetail：处理当前场景中的对应操作。 */
  sendRequestMailDetail(mailId: string) {
    this.emitServer(NEXT_C2S.RequestMailDetail, { mailId });
  }

/** sendRedeemCodes：处理当前场景中的对应操作。 */
  sendRedeemCodes(codes: string[]) {
    this.emitServer(NEXT_C2S.RedeemCodes, { codes });
  }

/** sendMarkMailRead：处理当前场景中的对应操作。 */
  sendMarkMailRead(mailIds: string[]) {
    this.emitServer(NEXT_C2S.MarkMailRead, { mailIds });
  }

/** sendClaimMailAttachments：处理当前场景中的对应操作。 */
  sendClaimMailAttachments(mailIds: string[]) {
    this.emitServer(NEXT_C2S.ClaimMailAttachments, { mailIds });
  }

/** sendDeleteMail：处理当前场景中的对应操作。 */
  sendDeleteMail(mailIds: string[]) {
    this.emitServer(NEXT_C2S.DeleteMail, { mailIds });
  }

  /** sendRequestMarket：处理当前场景中的对应操作。 */
  sendRequestMarket() {
    this.emitServer(NEXT_C2S.RequestMarket, {});
  }

  /** sendRequestMarketListings：处理当前场景中的对应操作。 */
  sendRequestMarketListings(payload: any) {
    this.emitServer(NEXT_C2S.RequestMarketListings, payload);
  }

/** sendRequestMarketItemBook：处理当前场景中的对应操作。 */
  sendRequestMarketItemBook(itemKey: string) {
    this.emitServer(NEXT_C2S.RequestMarketItemBook, { itemKey });
  }

  /** sendRequestMarketTradeHistory：处理当前场景中的对应操作。 */
  sendRequestMarketTradeHistory(page: number) {
    this.emitServer(NEXT_C2S.RequestMarketTradeHistory, { page });
  }

  /** sendRequestAttrDetail：处理当前场景中的对应操作。 */
  sendRequestAttrDetail() {
    this.emitServer(NEXT_C2S.RequestAttrDetail, {});
  }

  /** sendRequestLeaderboard：处理当前场景中的对应操作。 */
  sendRequestLeaderboard(limit?: number) {
    this.emitServer(NEXT_C2S.RequestLeaderboard, { limit });
  }

  /** sendRequestWorldSummary：处理当前场景中的对应操作。 */
  sendRequestWorldSummary() {
    this.emitServer(NEXT_C2S.RequestWorldSummary, {});
  }

/** sendCreateMarketSellOrder：处理当前场景中的对应操作。 */
  sendCreateMarketSellOrder(slotIndex: number, quantity: number, unitPrice: number) {
    this.emitServer(NEXT_C2S.CreateMarketSellOrder, { slotIndex, quantity, unitPrice });
  }

/** sendCreateMarketBuyOrder：处理当前场景中的对应操作。 */
  sendCreateMarketBuyOrder(itemKey: string, quantity: number, unitPrice: number) {
    this.emitServer(NEXT_C2S.CreateMarketBuyOrder, { itemKey, quantity, unitPrice });
  }

/** sendBuyMarketItem：处理当前场景中的对应操作。 */
  sendBuyMarketItem(itemKey: string, quantity: number) {
    this.emitServer(NEXT_C2S.BuyMarketItem, { itemKey, quantity });
  }

/** sendSellMarketItem：处理当前场景中的对应操作。 */
  sendSellMarketItem(slotIndex: number, quantity: number) {
    this.emitServer(NEXT_C2S.SellMarketItem, { slotIndex, quantity });
  }

/** sendCancelMarketOrder：处理当前场景中的对应操作。 */
  sendCancelMarketOrder(orderId: string) {
    this.emitServer(NEXT_C2S.CancelMarketOrder, { orderId });
  }

/** sendClaimMarketStorage：处理当前场景中的对应操作。 */
  sendClaimMarketStorage() {
    this.emitServer(NEXT_C2S.ClaimMarketStorage, {});
  }

/** sendRequestNpcShop：处理当前场景中的对应操作。 */
  sendRequestNpcShop(npcId: string) {
    this.emitServer(NEXT_C2S.RequestNpcShop, { npcId });
  }

  /** sendBuyNpcShopItem：处理当前场景中的对应操作。 */
  sendBuyNpcShopItem(npcId: string, itemId: string, quantity: number) {
    this.emitServer(NEXT_C2S.BuyNpcShopItem, { npcId, itemId, quantity });
  }

  /** sendRequestAlchemyPanel：处理当前场景中的对应操作。 */
  sendRequestAlchemyPanel(knownCatalogVersion?: number) {
    this.emitServer(NEXT_C2S.RequestAlchemyPanel, { knownCatalogVersion });
  }

  /** sendSaveAlchemyPreset：处理当前场景中的对应操作。 */
  sendSaveAlchemyPreset(payload: any) {
    this.emitServer(NEXT_C2S.SaveAlchemyPreset, payload);
  }

  /** sendDeleteAlchemyPreset：处理当前场景中的对应操作。 */
  sendDeleteAlchemyPreset(presetId: string) {
    this.emitServer(NEXT_C2S.DeleteAlchemyPreset, { presetId });
  }

  /** sendStartAlchemy：处理当前场景中的对应操作。 */
  sendStartAlchemy(payload: any) {
    this.emitServer(NEXT_C2S.StartAlchemy, payload);
  }

  /** sendCancelAlchemy：处理当前场景中的对应操作。 */
  sendCancelAlchemy() {
    this.emitServer(NEXT_C2S.CancelAlchemy, {});
  }

  /** sendRequestEnhancementPanel：处理当前场景中的对应操作。 */
  sendRequestEnhancementPanel() {
    this.emitServer(NEXT_C2S.RequestEnhancementPanel, {});
  }

  /** sendStartEnhancement：处理当前场景中的对应操作。 */
  sendStartEnhancement(payload: any) {
    this.emitServer(NEXT_C2S.StartEnhancement, payload);
  }

  /** sendCancelEnhancement：处理当前场景中的对应操作。 */
  sendCancelEnhancement() {
    this.emitServer(NEXT_C2S.CancelEnhancement, {});
  }

  /** sendHeavenGateAction：处理当前场景中的对应操作。 */
  sendHeavenGateAction(action: any, element?: any) {
    this.emitServer(NEXT_C2S.HeavenGateAction, { action, element });
  }

/** sendAction：处理当前场景中的对应操作。 */
  sendAction(actionId: string, target?: string) {
    if (!target && actionId === 'portal:travel') {
      this.emitServer(NEXT_C2S.UsePortal, {});
      return;
    }
    this.emitServer(NEXT_C2S.UseAction, { actionId, target });
  }

  /** sendUpdateAutoBattleSkills：处理当前场景中的对应操作。 */
  sendUpdateAutoBattleSkills(skills: AutoBattleSkillConfig[]) {
    this.emitServer(NEXT_C2S.UpdateAutoBattleSkills, { skills });
  }

  /** sendUpdateAutoUsePills：处理当前场景中的对应操作。 */
  sendUpdateAutoUsePills(pills: AutoUsePillConfig[]) {
    this.emitServer(NEXT_C2S.UpdateAutoUsePills, { pills });
  }

  /** sendUpdateCombatTargetingRules：处理当前场景中的对应操作。 */
  sendUpdateCombatTargetingRules(combatTargetingRules: CombatTargetingRules) {
    this.emitServer(NEXT_C2S.UpdateCombatTargetingRules, { combatTargetingRules });
  }

  /** sendUpdateAutoBattleTargetingMode：处理当前场景中的对应操作。 */
  sendUpdateAutoBattleTargetingMode(mode: AutoBattleTargetingMode) {
    this.emitServer(NEXT_C2S.UpdateAutoBattleTargetingMode, { mode });
  }

/** sendUpdateTechniqueSkillAvailability：处理当前场景中的对应操作。 */
  sendUpdateTechniqueSkillAvailability(techId: string, enabled: boolean) {
    this.emitServer(NEXT_C2S.UpdateTechniqueSkillAvailability, { techId, enabled });
  }

/** sendDebugResetSpawn：处理当前场景中的对应操作。 */
  sendDebugResetSpawn() {
    this.emitServer(NEXT_C2S.DebugResetSpawn, { force: true });
  }

/** sendChat：处理当前场景中的对应操作。 */
  sendChat(message: string) {
    this.emitServer(NEXT_C2S.Chat, { message });
  }

/** ackSystemMessages：处理当前场景中的对应操作。 */
  ackSystemMessages(ids: string[]) {
    if (ids.length === 0) {
      return;
    }
    this.emitServer(NEXT_C2S.AckSystemMessages, { ids });
  }

  onBootstrap(cb: (data: NEXT_S2C_Bootstrap) => void) { this.onBootstrapCallbacks.push(cb); }
  onNextInitSession(cb: (data: NEXT_S2C_InitSession) => void) { this.onNextInitSessionCallbacks.push(cb); }
  onNextMapEnter(cb: (data: NEXT_S2C_MapEnter) => void) { this.onNextMapEnterCallbacks.push(cb); }
  onNextWorldDelta(cb: (data: NEXT_S2C_WorldDelta) => void) { this.onNextWorldDeltaCallbacks.push(cb); }
  onNextSelfDelta(cb: (data: NEXT_S2C_SelfDelta) => void) { this.onNextSelfDeltaCallbacks.push(cb); }
  onNextPanelDelta(cb: (data: NEXT_S2C_PanelDelta) => void) { this.onNextPanelDeltaCallbacks.push(cb); }
  onNextNotice(cb: (data: NEXT_S2C_Notice) => void) { this.onNextNoticeCallbacks.push(cb); }
  onNextNpcQuests(cb: (data: NEXT_S2C_NpcQuests) => void) { this.onNextNpcQuestsCallbacks.push(cb); }
  onNextDetail(cb: (data: NEXT_S2C_Detail) => void) { this.onNextDetailCallbacks.push(cb); }
  onNextTileDetail(cb: (data: NEXT_S2C_TileDetail) => void) { this.onNextTileDetailCallbacks.push(cb); }
  onMapStatic(cb: (data: NEXT_S2C_MapStatic) => void) { this.onMapStaticCallbacks.push(cb); }
  onRealm(cb: (data: NEXT_S2C_Realm) => void) { this.onRealmCallbacks.push(cb); }
  onKick(cb: () => void) { this.onKickCallbacks.push(cb); }
  onLootWindowUpdate(cb: (data: any) => void) { this.onLootWindowUpdateCallbacks.push(cb); }
  onQuestUpdate(cb: (data: any) => void) { this.onQuestUpdateCallbacks.push(cb); }
  onQuestNavigateResult(cb: (data: any) => void) { this.onQuestNavigateResultCallbacks.push(cb); }
  onSystemMsg(cb: (data: any) => void) { this.onSystemMsgCallbacks.push(cb); }
  onSuggestionUpdate(cb: (data: any) => void) { this.onSuggestionUpdateCallbacks.push(cb); }
  onMailSummary(cb: (data: any) => void) { this.onMailSummaryCallbacks.push(cb); }
  onMailPage(cb: (data: any) => void) { this.onMailPageCallbacks.push(cb); }
  onMailDetail(cb: (data: any) => void) { this.onMailDetailCallbacks.push(cb); }
  onRedeemCodesResult(cb: (data: any) => void) { this.onRedeemCodesResultCallbacks.push(cb); }
  onMailOpResult(cb: (data: any) => void) { this.onMailOpResultCallbacks.push(cb); }
  onMarketUpdate(cb: (data: any) => void) { this.onMarketUpdateCallbacks.push(cb); }
  onMarketListings(cb: (data: any) => void) { this.onMarketListingsCallbacks.push(cb); }
  onMarketOrders(cb: (data: any) => void) { this.onMarketOrdersCallbacks.push(cb); }
  onMarketStorage(cb: (data: any) => void) { this.onMarketStorageCallbacks.push(cb); }
  onMarketItemBook(cb: (data: any) => void) { this.onMarketItemBookCallbacks.push(cb); }
  onMarketTradeHistory(cb: (data: any) => void) { this.onMarketTradeHistoryCallbacks.push(cb); }
  onAttrDetail(cb: (data: any) => void) { this.onAttrDetailCallbacks.push(cb); }
  onLeaderboard(cb: (data: any) => void) { this.onLeaderboardCallbacks.push(cb); }
  onWorldSummary(cb: (data: any) => void) { this.onWorldSummaryCallbacks.push(cb); }
  onNpcShop(cb: (data: any) => void) { this.onNpcShopCallbacks.push(cb); }
  onAlchemyPanel(cb: (data: any) => void) { this.onAlchemyPanelCallbacks.push(cb); }
  onEnhancementPanel(cb: (data: any) => void) { this.onEnhancementPanelCallbacks.push(cb); }
  onPong(cb: (data: any) => void) { this.onPongCallbacks.push(cb); }
  onError(cb: (data: any) => void) { this.onErrorCallbacks.push(cb); }
  onGmState(cb: (data: any) => void) { this.onGmStateCallbacks.push(cb); }
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

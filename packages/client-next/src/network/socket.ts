/**
 * Socket.IO 网络管理器 —— 封装客户端与服务端的双向通信，提供类型安全的事件收发接口
 */

import { io, Socket } from 'socket.io-client';
import type { NEXT_S2C_MapStatic, NEXT_S2C_Realm } from '@mud/shared-next';
import { logNextMovement } from '../debug/movement-debug';
import {
  NEXT_C2S,
  NEXT_S2C,
  C2S_Move, C2S_MoveTo, C2S_NavigateQuest, C2S_GmGetState, C2S_GmSpawnBots, C2S_GmRemoveBots, C2S_GmUpdatePlayer, C2S_GmResetPlayer, C2S_Action, C2S_UpdateAutoBattleSkills, C2S_DebugResetSpawn, C2S_UseItem, C2S_DropItem, C2S_DestroyItem,
  C2S_TakeLoot, C2S_SortInventory, C2S_Equip, C2S_Unequip, C2S_Cultivate, C2S_Chat, C2S_AckSystemMessages,
  C2S_UpdateTechniqueSkillAvailability,
  C2S_Heartbeat,
  C2S_InspectTileRuntime,
  C2S_Ping,
  C2S_RequestSuggestions,
  C2S_RequestMailSummary,
  C2S_RequestMailPage,
  C2S_RequestMailDetail,
  C2S_RequestQuests,
  C2S_RequestNpcQuests,
  C2S_AcceptNpcQuest,
  C2S_SubmitNpcQuest,
  C2S_RequestDetail,
  C2S_RedeemCodes,
  C2S_MarkMailRead,
  C2S_ClaimMailAttachments,
  C2S_DeleteMail,
  C2S_RequestMarket,
  C2S_RequestMarketItemBook,
  C2S_RequestMarketTradeHistory,
  C2S_CreateMarketSellOrder,
  C2S_CreateMarketBuyOrder,
  C2S_BuyMarketItem,
  C2S_SellMarketItem,
  C2S_CancelMarketOrder,
  C2S_ClaimMarketStorage,
  C2S_RequestNpcShop,
  C2S_BuyNpcShopItem,
  C2S_HeavenGateAction,
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
  S2C_MapStaticSync, S2C_RealmUpdate, S2C_LootWindowUpdate, S2C_QuestUpdate, S2C_QuestNavigateResult, S2C_SystemMsg, S2C_GmState,
  S2C_SuggestionUpdate,
  S2C_MailSummary,
  S2C_MailPage,
  S2C_MailDetail,
  S2C_RedeemCodesResult,
  S2C_MailOpResult,
  S2C_MarketUpdate,
  S2C_MarketItemBook,
  S2C_MarketTradeHistory,
  S2C_NpcShop,
  S2C_Pong,
  S2C_Error, decodeServerEventPayload, encodeClientEventPayload,
  AutoBattleSkillConfig, Direction, EquipSlot, PLAYER_HEARTBEAT_INTERVAL_MS,
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
  private onLootWindowUpdateCallbacks: Array<(data: S2C_LootWindowUpdate) => void> = [];
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
  private onMarketItemBookCallbacks: Array<(data: S2C_MarketItemBook) => void> = [];
  private onMarketTradeHistoryCallbacks: Array<(data: S2C_MarketTradeHistory) => void> = [];
  private onNpcShopCallbacks: Array<(data: S2C_NpcShop) => void> = [];
  private onPongCallbacks: Array<(data: S2C_Pong) => void> = [];
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
    this.bindServerEvent(NEXT_S2C.MarketItemBook, this.onMarketItemBookCallbacks);
    this.bindServerEvent(NEXT_S2C.MarketTradeHistory, this.onMarketTradeHistoryCallbacks);
    this.bindServerEvent(NEXT_S2C.NpcShop, this.onNpcShopCallbacks);
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
    this.emitServer(NEXT_C2S.Heartbeat, { clientAt: Date.now() } satisfies C2S_Heartbeat);
  }

/** sendHello：执行对应的业务逻辑。 */
  private sendHello(): void {
    this.emitServer(NEXT_C2S.Hello, {});
  }

  sendPing(clientAt = Date.now()): number {
    this.emitServer(NEXT_C2S.Ping, { clientAt } satisfies C2S_Ping);
    return clientAt;
  }

/** sendMove：处理当前场景中的对应操作。 */
  sendMove(direction: Direction) {
    logNextMovement('client.emit.move', {
      direction,
      connected: this.socket?.connected ?? false,
    });
    this.emitServer(NEXT_C2S.Move, { d: direction } satisfies C2S_Move);
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
    } satisfies C2S_MoveTo);
  }

/** sendNavigateQuest：处理当前场景中的对应操作。 */
  sendNavigateQuest(questId: string) {
    logNextMovement('client.emit.navigateQuest', { questId });
    this.emitServer(NEXT_C2S.NavigateQuest, {
      questId,
    } satisfies C2S_NavigateQuest);
  }

/** sendRequestQuests：处理当前场景中的对应操作。 */
  sendRequestQuests() {
    this.emitServer(NEXT_C2S.RequestQuests, {} satisfies C2S_RequestQuests);
  }

/** sendRequestNpcQuests：处理当前场景中的对应操作。 */
  sendRequestNpcQuests(npcId: string) {
    this.emitServer(NEXT_C2S.RequestNpcQuests, { npcId } satisfies C2S_RequestNpcQuests);
  }

/** sendAcceptNpcQuest：处理当前场景中的对应操作。 */
  sendAcceptNpcQuest(npcId: string, questId: string) {
    this.emitServer(NEXT_C2S.AcceptNpcQuest, { npcId, questId } satisfies C2S_AcceptNpcQuest);
  }

/** sendSubmitNpcQuest：处理当前场景中的对应操作。 */
  sendSubmitNpcQuest(npcId: string, questId: string) {
    this.emitServer(NEXT_C2S.SubmitNpcQuest, { npcId, questId } satisfies C2S_SubmitNpcQuest);
  }

/** sendRequestDetail：处理当前场景中的对应操作。 */
  sendRequestDetail(kind: C2S_RequestDetail['kind'], id: string) {
    this.emitServer(NEXT_C2S.RequestDetail, { kind, id } satisfies C2S_RequestDetail);
  }

/** sendGmGetState：处理当前场景中的对应操作。 */
  sendGmGetState() {
    this.emitServer(NEXT_C2S.GmGetState, {} satisfies C2S_GmGetState);
  }

/** sendGmSpawnBots：处理当前场景中的对应操作。 */
  sendGmSpawnBots(count: number) {
    this.emitServer(NEXT_C2S.GmSpawnBots, { count } satisfies C2S_GmSpawnBots);
  }

/** sendGmRemoveBots：处理当前场景中的对应操作。 */
  sendGmRemoveBots(playerIds?: string[], all = false) {
    this.emitServer(NEXT_C2S.GmRemoveBots, { playerIds, all } satisfies C2S_GmRemoveBots);
  }

/** sendGmUpdatePlayer：处理当前场景中的对应操作。 */
  sendGmUpdatePlayer(payload: C2S_GmUpdatePlayer) {
    this.emitServer(NEXT_C2S.GmUpdatePlayer, payload satisfies C2S_GmUpdatePlayer);
  }

/** sendGmResetPlayer：处理当前场景中的对应操作。 */
  sendGmResetPlayer(playerId: string) {
    this.emitServer(NEXT_C2S.GmResetPlayer, { playerId } satisfies C2S_GmResetPlayer);
  }

/** sendUseItem：处理当前场景中的对应操作。 */
  sendUseItem(slotIndex: number, count?: number) {
    this.emitServer(NEXT_C2S.UseItem, { slotIndex, count } satisfies C2S_UseItem);
  }

/** sendDropItem：处理当前场景中的对应操作。 */
  sendDropItem(slotIndex: number, count: number) {
    this.emitServer(NEXT_C2S.DropItem, { slotIndex, count } satisfies C2S_DropItem);
  }

/** sendDestroyItem：处理当前场景中的对应操作。 */
  sendDestroyItem(slotIndex: number, count: number) {
    this.emitServer(NEXT_C2S.DestroyItem, { slotIndex, count } satisfies C2S_DestroyItem);
  }

/** sendTakeLoot：处理当前场景中的对应操作。 */
  sendTakeLoot(sourceId: string, itemKey?: string, takeAll = false) {
    this.emitServer(NEXT_C2S.TakeGround, { sourceId, itemKey, takeAll } satisfies C2S_TakeLoot);
  }

/** sendSortInventory：处理当前场景中的对应操作。 */
  sendSortInventory() {
    this.emitServer(NEXT_C2S.SortInventory, {} satisfies C2S_SortInventory);
  }

/** sendInspectTileRuntime：处理当前场景中的对应操作。 */
  sendInspectTileRuntime(x: number, y: number) {
    this.emitServer(NEXT_C2S.RequestTileDetail, { x, y } satisfies C2S_InspectTileRuntime);
  }

/** sendEquip：处理当前场景中的对应操作。 */
  sendEquip(slotIndex: number) {
    this.emitServer(NEXT_C2S.Equip, { slotIndex } satisfies C2S_Equip);
  }

/** sendUnequip：处理当前场景中的对应操作。 */
  sendUnequip(slot: EquipSlot) {
    this.emitServer(NEXT_C2S.Unequip, { slot } satisfies C2S_Unequip);
  }

/** sendCultivate：处理当前场景中的对应操作。 */
  sendCultivate(techId: string | null) {
    this.emitServer(NEXT_C2S.Cultivate, { techId } satisfies C2S_Cultivate);
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
    this.emitServer(NEXT_C2S.RequestSuggestions, {} satisfies C2S_RequestSuggestions);
  }

/** sendRequestMailSummary：处理当前场景中的对应操作。 */
  sendRequestMailSummary() {
    this.emitServer(NEXT_C2S.RequestMailSummary, {} satisfies C2S_RequestMailSummary);
  }

/** sendRequestMailPage：处理当前场景中的对应操作。 */
  sendRequestMailPage(page: number, pageSize?: number, filter?: C2S_RequestMailPage['filter']) {
    this.emitServer(NEXT_C2S.RequestMailPage, { page, pageSize, filter } satisfies C2S_RequestMailPage);
  }

/** sendRequestMailDetail：处理当前场景中的对应操作。 */
  sendRequestMailDetail(mailId: string) {
    this.emitServer(NEXT_C2S.RequestMailDetail, { mailId } satisfies C2S_RequestMailDetail);
  }

/** sendRedeemCodes：处理当前场景中的对应操作。 */
  sendRedeemCodes(codes: string[]) {
    this.emitServer(NEXT_C2S.RedeemCodes, { codes } satisfies C2S_RedeemCodes);
  }

/** sendMarkMailRead：处理当前场景中的对应操作。 */
  sendMarkMailRead(mailIds: string[]) {
    this.emitServer(NEXT_C2S.MarkMailRead, { mailIds } satisfies C2S_MarkMailRead);
  }

/** sendClaimMailAttachments：处理当前场景中的对应操作。 */
  sendClaimMailAttachments(mailIds: string[]) {
    this.emitServer(NEXT_C2S.ClaimMailAttachments, { mailIds } satisfies C2S_ClaimMailAttachments);
  }

/** sendDeleteMail：处理当前场景中的对应操作。 */
  sendDeleteMail(mailIds: string[]) {
    this.emitServer(NEXT_C2S.DeleteMail, { mailIds } satisfies C2S_DeleteMail);
  }

/** sendRequestMarket：处理当前场景中的对应操作。 */
  sendRequestMarket() {
    this.emitServer(NEXT_C2S.RequestMarket, {} satisfies C2S_RequestMarket);
  }

/** sendRequestMarketItemBook：处理当前场景中的对应操作。 */
  sendRequestMarketItemBook(itemKey: string) {
    this.emitServer(NEXT_C2S.RequestMarketItemBook, { itemKey } satisfies C2S_RequestMarketItemBook);
  }

/** sendRequestMarketTradeHistory：处理当前场景中的对应操作。 */
  sendRequestMarketTradeHistory(page: number) {
    this.emitServer(NEXT_C2S.RequestMarketTradeHistory, { page } satisfies C2S_RequestMarketTradeHistory);
  }

/** sendCreateMarketSellOrder：处理当前场景中的对应操作。 */
  sendCreateMarketSellOrder(slotIndex: number, quantity: number, unitPrice: number) {
    this.emitServer(NEXT_C2S.CreateMarketSellOrder, { slotIndex, quantity, unitPrice } satisfies C2S_CreateMarketSellOrder);
  }

/** sendCreateMarketBuyOrder：处理当前场景中的对应操作。 */
  sendCreateMarketBuyOrder(itemId: string, quantity: number, unitPrice: number) {
    this.emitServer(NEXT_C2S.CreateMarketBuyOrder, { itemId, quantity, unitPrice } satisfies C2S_CreateMarketBuyOrder);
  }

/** sendBuyMarketItem：处理当前场景中的对应操作。 */
  sendBuyMarketItem(itemKey: string, quantity: number) {
    this.emitServer(NEXT_C2S.BuyMarketItem, { itemKey, quantity } satisfies C2S_BuyMarketItem);
  }

/** sendSellMarketItem：处理当前场景中的对应操作。 */
  sendSellMarketItem(slotIndex: number, quantity: number) {
    this.emitServer(NEXT_C2S.SellMarketItem, { slotIndex, quantity } satisfies C2S_SellMarketItem);
  }

/** sendCancelMarketOrder：处理当前场景中的对应操作。 */
  sendCancelMarketOrder(orderId: string) {
    this.emitServer(NEXT_C2S.CancelMarketOrder, { orderId } satisfies C2S_CancelMarketOrder);
  }

/** sendClaimMarketStorage：处理当前场景中的对应操作。 */
  sendClaimMarketStorage() {
    this.emitServer(NEXT_C2S.ClaimMarketStorage, {} satisfies C2S_ClaimMarketStorage);
  }

/** sendRequestNpcShop：处理当前场景中的对应操作。 */
  sendRequestNpcShop(npcId: string) {
    this.emitServer(NEXT_C2S.RequestNpcShop, { npcId } satisfies C2S_RequestNpcShop);
  }

/** sendBuyNpcShopItem：处理当前场景中的对应操作。 */
  sendBuyNpcShopItem(npcId: string, itemId: string, quantity: number) {
    this.emitServer(NEXT_C2S.BuyNpcShopItem, { npcId, itemId, quantity } satisfies C2S_BuyNpcShopItem);
  }

/** sendHeavenGateAction：处理当前场景中的对应操作。 */
  sendHeavenGateAction(action: C2S_HeavenGateAction['action'], element?: C2S_HeavenGateAction['element']) {
    this.emitServer(NEXT_C2S.HeavenGateAction, { action, element } satisfies C2S_HeavenGateAction);
  }

/** sendAction：处理当前场景中的对应操作。 */
  sendAction(actionId: string, target?: string) {
    if (!target && actionId === 'portal:travel') {
      this.emitServer(NEXT_C2S.UsePortal, {});
      return;
    }
    this.emitServer(NEXT_C2S.UseAction, { actionId, target } satisfies C2S_Action);
  }

/** sendUpdateAutoBattleSkills：处理当前场景中的对应操作。 */
  sendUpdateAutoBattleSkills(skills: AutoBattleSkillConfig[]) {
    this.emitServer(NEXT_C2S.UpdateAutoBattleSkills, { skills } satisfies C2S_UpdateAutoBattleSkills);
  }

/** sendUpdateTechniqueSkillAvailability：处理当前场景中的对应操作。 */
  sendUpdateTechniqueSkillAvailability(techId: string, enabled: boolean) {
    this.emitServer(NEXT_C2S.UpdateTechniqueSkillAvailability, { techId, enabled } satisfies C2S_UpdateTechniqueSkillAvailability);
  }

/** sendDebugResetSpawn：处理当前场景中的对应操作。 */
  sendDebugResetSpawn() {
    this.emitServer(NEXT_C2S.DebugResetSpawn, { force: true } satisfies C2S_DebugResetSpawn);
  }

/** sendChat：处理当前场景中的对应操作。 */
  sendChat(message: string) {
    this.emitServer(NEXT_C2S.Chat, { message } satisfies C2S_Chat);
  }

/** ackSystemMessages：处理当前场景中的对应操作。 */
  ackSystemMessages(ids: string[]) {
    if (ids.length === 0) {
      return;
    }
    this.emitServer(NEXT_C2S.AckSystemMessages, { ids } satisfies C2S_AckSystemMessages);
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
  onMapStaticSync(cb: (data: S2C_MapStaticSync) => void) { this.onMapStaticCallbacks.push(cb as unknown as (data: NEXT_S2C_MapStatic) => void); }
  onRealmUpdate(cb: (data: S2C_RealmUpdate) => void) { this.onRealmCallbacks.push(cb as unknown as (data: NEXT_S2C_Realm) => void); }
  onKick(cb: () => void) { this.onKickCallbacks.push(cb); }
  onLootWindowUpdate(cb: (data: S2C_LootWindowUpdate) => void) { this.onLootWindowUpdateCallbacks.push(cb); }
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
  onMarketItemBook(cb: (data: S2C_MarketItemBook) => void) { this.onMarketItemBookCallbacks.push(cb); }
  onMarketTradeHistory(cb: (data: S2C_MarketTradeHistory) => void) { this.onMarketTradeHistoryCallbacks.push(cb); }
  onNpcShop(cb: (data: S2C_NpcShop) => void) { this.onNpcShopCallbacks.push(cb); }
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


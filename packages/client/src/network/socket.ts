/**
 * Socket.IO 网络管理器 —— 封装客户端与服务端的双向通信，提供类型安全的事件收发接口
 */
// TODO(next:T21): 清理 client-next 事件表面的旧命名兼容层，把对外 API 完全收成 next-native 命名。

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

/** 客户端 Socket.IO 连接管理器，负责连接生命周期、协议编解码和事件分发。 */
export class SocketManager {
  /** 当前持有的 Socket.IO 连接实例。 */
  private socket: Socket | null = null;
  /** 连接使用的访问令牌，便于断线后重连。 */
  private accessToken: string | null = null;
  /** 心跳定时器，用于周期性向服务端报活。 */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  /** 被踢下线时触发的回调集合。 */
  private onKickCallbacks: Array<() => void> = [];
  /** 首包 Bootstrap 事件回调集合。 */
  private onBootstrapCallbacks: Array<(data: NEXT_S2C_Bootstrap) => void> = [];
  /** 新版会话初始化事件回调集合。 */
  private onNextInitSessionCallbacks: Array<(data: NEXT_S2C_InitSession) => void> = [];
  /** 新版地图入场事件回调集合。 */
  private onNextMapEnterCallbacks: Array<(data: NEXT_S2C_MapEnter) => void> = [];
  /** 世界级增量事件回调集合。 */
  private onNextWorldDeltaCallbacks: Array<(data: NEXT_S2C_WorldDelta) => void> = [];
  /** 自身状态增量事件回调集合。 */
  private onNextSelfDeltaCallbacks: Array<(data: NEXT_S2C_SelfDelta) => void> = [];
  /** 面板增量事件回调集合。 */
  private onNextPanelDeltaCallbacks: Array<(data: NEXT_S2C_PanelDelta) => void> = [];
  /** 通知类事件回调集合。 */
  private onNextNoticeCallbacks: Array<(data: NEXT_S2C_Notice) => void> = [];
  /** NPC 任务列表回调集合。 */
  private onNextNpcQuestsCallbacks: Array<(data: NEXT_S2C_NpcQuests) => void> = [];
  /** 详情面板回调集合。 */
  private onNextDetailCallbacks: Array<(data: NEXT_S2C_Detail) => void> = [];
  /** 地块详情回调集合。 */
  private onNextTileDetailCallbacks: Array<(data: NEXT_S2C_TileDetail) => void> = [];
  /** 地图静态数据回调集合。 */
  private onMapStaticCallbacks: Array<(data: NEXT_S2C_MapStatic) => void> = [];
  /** 境界信息回调集合。 */
  private onRealmCallbacks: Array<(data: NEXT_S2C_Realm) => void> = [];
  /** 战利品窗口更新回调集合。 */
  private onLootWindowUpdateCallbacks: Array<(data: any) => void> = [];
  /** 任务状态更新回调集合。 */
  private onQuestUpdateCallbacks: Array<(data: any) => void> = [];
  /** 任务导航结果回调集合。 */
  private onQuestNavigateResultCallbacks: Array<(data: any) => void> = [];
  /** 系统消息回调集合。 */
  private onSystemMsgCallbacks: Array<(data: any) => void> = [];
  /** 服务端错误事件回调集合。 */
  private onErrorCallbacks: Array<(data: any) => void> = [];
  /** GM 面板状态回调集合。 */
  private onGmStateCallbacks: Array<(data: any) => void> = [];
  /** 建议面板更新回调集合。 */
  private onSuggestionUpdateCallbacks: Array<(data: any) => void> = [];
  /** 邮件摘要回调集合。 */
  private onMailSummaryCallbacks: Array<(data: any) => void> = [];
  /** 邮件分页回调集合。 */
  private onMailPageCallbacks: Array<(data: any) => void> = [];
  /** 邮件详情回调集合。 */
  private onMailDetailCallbacks: Array<(data: any) => void> = [];
  /** 兑换码结果回调集合。 */
  private onRedeemCodesResultCallbacks: Array<(data: any) => void> = [];
  /** 邮件操作结果回调集合。 */
  private onMailOpResultCallbacks: Array<(data: any) => void> = [];
  /** 市场概览更新回调集合。 */
  private onMarketUpdateCallbacks: Array<(data: any) => void> = [];
  /** 市场挂单列表回调集合。 */
  private onMarketListingsCallbacks: Array<(data: any) => void> = [];
  /** 市场订单回调集合。 */
  private onMarketOrdersCallbacks: Array<(data: any) => void> = [];
  /** 市场仓储回调集合。 */
  private onMarketStorageCallbacks: Array<(data: any) => void> = [];
  /** 市场物品图鉴回调集合。 */
  private onMarketItemBookCallbacks: Array<(data: any) => void> = [];
  /** 市场交易历史回调集合。 */
  private onMarketTradeHistoryCallbacks: Array<(data: any) => void> = [];
  /** 属性详情回调集合。 */
  private onAttrDetailCallbacks: Array<(data: any) => void> = [];
  /** 排行榜回调集合。 */
  private onLeaderboardCallbacks: Array<(data: any) => void> = [];
  /** 世界摘要回调集合。 */
  private onWorldSummaryCallbacks: Array<(data: any) => void> = [];
  /** NPC 商店回调集合。 */
  private onNpcShopCallbacks: Array<(data: any) => void> = [];
  /** 炼丹面板回调集合。 */
  private onAlchemyPanelCallbacks: Array<(data: any) => void> = [];
  /** 强化面板回调集合。 */
  private onEnhancementPanelCallbacks: Array<(data: any) => void> = [];
  /** 心跳响应回调集合。 */
  private onPongCallbacks: Array<(data: any) => void> = [];
  /** 断开连接回调集合。 */
  private onDisconnectCallbacks: Array<(reason: string) => void> = [];
  /** 连接失败回调集合。 */
  private onConnectErrorCallbacks: Array<(message: string) => void> = [];
  /** 建立 WebSocket 连接并绑定所有服务端事件。 */
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

  /** 绑定服务端事件，自动解码载荷后再分发给回调。 */
  private bindServerEvent<T>(event: string, callbacks: Array<(data: T) => void>): void {
    this.socket?.on(event, (raw: unknown) => {
      const data = decodeServerEventPayload<T>(event, raw);
      callbacks.forEach(cb => cb(data));
    });
  }

  /** 向服务端发送事件，自动编码载荷。 */
  private emitServer<T>(event: string, payload: T): void {
    this.socket?.emit(event, encodeClientEventPayload(event, payload));
  }

  /** 断开当前连接并清理 token。 */
  disconnect() {
    this.disposeSocket({ clearToken: true });
  }

  /** 使用已有 token 重新发起连接。 */
  reconnect(token?: string): boolean {
    const nextToken = token ?? this.accessToken;
    if (!nextToken) {
      return false;
    }
    this.connect(nextToken);
    return true;
  }

  /** 释放 Socket 实例并按需清除 token。 */
  private disposeSocket(options: { clearToken: boolean }) {
    if (options.clearToken) {
      this.accessToken = null;
    }
    this.stopHeartbeat();
    this.socket?.disconnect();
    this.socket = null;
  }

  /** 开启周期性心跳。 */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, PLAYER_HEARTBEAT_INTERVAL_MS);
  }

  /** 停止心跳定时器。 */
  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) {
      return;
    }
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  /** 向服务端发送心跳包。 */
  private sendHeartbeat(): void {
    this.emitServer(NEXT_C2S.Heartbeat, { clientAt: Date.now() });
  }

  /** 发送握手消息，完成客户端就绪声明。 */
  private sendHello(): void {
    this.emitServer(NEXT_C2S.Hello, {});
  }

  sendPing(clientAt = Date.now()): number {
    this.emitServer(NEXT_C2S.Ping, { clientAt });
    return clientAt;
  }

  /** 发送移动指令。 */
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
      allowNearestReachable: options?.allowNearestReachable === true,
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

  /** 发送任务导航请求。 */
  sendNavigateQuest(questId: string) {
    logNextMovement('client.emit.navigateQuest', { questId });
    this.emitServer(NEXT_C2S.NavigateQuest, {
      questId,
    });
  }

  /** 申请刷新当前任务列表。 */
  sendRequestQuests() {
    this.emitServer(NEXT_C2S.RequestQuests, {});
  }

  /** 申请刷新某个 NPC 的任务列表。 */
  sendRequestNpcQuests(npcId: string) {
    this.emitServer(NEXT_C2S.RequestNpcQuests, { npcId });
  }

  /** 接受 NPC 任务。 */
  sendAcceptNpcQuest(npcId: string, questId: string) {
    this.emitServer(NEXT_C2S.AcceptNpcQuest, { npcId, questId });
  }

  /** 提交 NPC 任务。 */
  sendSubmitNpcQuest(npcId: string, questId: string) {
    this.emitServer(NEXT_C2S.SubmitNpcQuest, { npcId, questId });
  }

  /** 申请指定对象的详情数据。 */
  sendRequestDetail(kind: string, id: string) {
    this.emitServer(NEXT_C2S.RequestDetail, { kind, id });
  }

  /** 读取 GM 当前状态。 */
  sendGmGetState() {
    this.emitServer(NEXT_C2S.GmGetState, {});
  }

  /** 让 GM 生成测试机器人。 */
  sendGmSpawnBots(count: number) {
    this.emitServer(NEXT_C2S.GmSpawnBots, { count });
  }

  /** 删除 GM 生成的测试机器人。 */
  sendGmRemoveBots(playerIds?: string[], all = false) {
    this.emitServer(NEXT_C2S.GmRemoveBots, { playerIds, all });
  }

  /** 更新 GM 面板中的玩家状态。 */
  sendGmUpdatePlayer(payload: any) {
    this.emitServer(NEXT_C2S.GmUpdatePlayer, payload);
  }

  /** 重置 GM 目标玩家。 */
  sendGmResetPlayer(playerId: string) {
    this.emitServer(NEXT_C2S.GmResetPlayer, { playerId });
  }

  /** 使用物品。 */
  sendUseItem(slotIndex: number, count?: number) {
    this.emitServer(NEXT_C2S.UseItem, { slotIndex, count });
  }

  /** 丢弃物品。 */
  sendDropItem(slotIndex: number, count: number) {
    this.emitServer(NEXT_C2S.DropItem, { slotIndex, count });
  }

  /** 销毁物品。 */
  sendDestroyItem(slotIndex: number, count: number) {
    this.emitServer(NEXT_C2S.DestroyItem, { slotIndex, count });
  }

  /** 领取战利品。 */
  sendTakeLoot(sourceId: string, itemKey?: string, takeAll = false) {
    this.emitServer(NEXT_C2S.TakeGround, { sourceId, itemKey, takeAll });
  }

  /** 请求背包排序。 */
  sendSortInventory() {
    this.emitServer(NEXT_C2S.SortInventory, {});
  }

  /** 请求查看地块运行时信息。 */
  sendInspectTileRuntime(x: number, y: number) {
    this.emitServer(NEXT_C2S.RequestTileDetail, { x, y });
  }

  /** 装备指定物品。 */
  sendEquip(slotIndex: number) {
    this.emitServer(NEXT_C2S.Equip, { slotIndex });
  }

  /** 卸下指定装备槽。 */
  sendUnequip(slot: EquipSlot) {
    this.emitServer(NEXT_C2S.Unequip, { slot });
  }

  /** 请求开始或切换修炼。 */
  sendCultivate(techId: string | null) {
    this.emitServer(NEXT_C2S.Cultivate, { techId });
  }

  /** 释放技能。 */
  sendCastSkill(skillId: string, target?: string) {
    const payload: {
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

  /** 请求建议面板数据。 */
  sendRequestSuggestions() {
    this.emitServer(NEXT_C2S.RequestSuggestions, {});
  }

  /** 新建一条建议。 */
  sendCreateSuggestion(title: string, description: string) {
    this.emitServer(NEXT_C2S.CreateSuggestion, { title, description });
  }

  /** 回复某条建议。 */
  sendReplySuggestion(suggestionId: string, content: string) {
    this.emitServer(NEXT_C2S.ReplySuggestion, { suggestionId, content });
  }

  /** 给建议投票。 */
  sendVoteSuggestion(suggestionId: string, vote: 'up' | 'down') {
    this.emitServer(NEXT_C2S.VoteSuggestion, { suggestionId, vote });
  }

  /** 标记建议回复已读。 */
  sendMarkSuggestionRepliesRead(suggestionId: string) {
    this.emitServer(NEXT_C2S.MarkSuggestionRepliesRead, { suggestionId });
  }

  /** 请求邮件摘要。 */
  sendRequestMailSummary() {
    this.emitServer(NEXT_C2S.RequestMailSummary, {});
  }

  /** 请求邮件分页。 */
  sendRequestMailPage(page: number, pageSize?: number, filter?: any) {
    this.emitServer(NEXT_C2S.RequestMailPage, { page, pageSize, filter });
  }

  /** 请求邮件详情。 */
  sendRequestMailDetail(mailId: string) {
    this.emitServer(NEXT_C2S.RequestMailDetail, { mailId });
  }

  /** 兑换礼包码。 */
  sendRedeemCodes(codes: string[]) {
    this.emitServer(NEXT_C2S.RedeemCodes, { codes });
  }

  /** 标记邮件为已读。 */
  sendMarkMailRead(mailIds: string[]) {
    this.emitServer(NEXT_C2S.MarkMailRead, { mailIds });
  }

  /** 领取邮件附件。 */
  sendClaimMailAttachments(mailIds: string[]) {
    this.emitServer(NEXT_C2S.ClaimMailAttachments, { mailIds });
  }

  /** 删除邮件。 */
  sendDeleteMail(mailIds: string[]) {
    this.emitServer(NEXT_C2S.DeleteMail, { mailIds });
  }

  /** 请求市场概览。 */
  sendRequestMarket() {
    this.emitServer(NEXT_C2S.RequestMarket, {});
  }

  /** 请求市场挂单列表。 */
  sendRequestMarketListings(payload: any) {
    this.emitServer(NEXT_C2S.RequestMarketListings, payload);
  }

  /** 请求市场物品图鉴。 */
  sendRequestMarketItemBook(itemKey: string) {
    this.emitServer(NEXT_C2S.RequestMarketItemBook, { itemKey });
  }

  /** 请求市场交易历史。 */
  sendRequestMarketTradeHistory(page: number) {
    this.emitServer(NEXT_C2S.RequestMarketTradeHistory, { page });
  }

  /** 请求属性详情。 */
  sendRequestAttrDetail() {
    this.emitServer(NEXT_C2S.RequestAttrDetail, {});
  }

  /** 请求排行榜数据。 */
  sendRequestLeaderboard(limit?: number) {
    this.emitServer(NEXT_C2S.RequestLeaderboard, { limit });
  }

  /** 请求世界摘要。 */
  sendRequestWorldSummary() {
    this.emitServer(NEXT_C2S.RequestWorldSummary, {});
  }

  /** 创建市场卖单。 */
  sendCreateMarketSellOrder(slotIndex: number, quantity: number, unitPrice: number) {
    this.emitServer(NEXT_C2S.CreateMarketSellOrder, { slotIndex, quantity, unitPrice });
  }

  /** 创建市场买单。 */
  sendCreateMarketBuyOrder(itemKey: string, quantity: number, unitPrice: number) {
    this.emitServer(NEXT_C2S.CreateMarketBuyOrder, { itemKey, quantity, unitPrice });
  }

  /** 直接购买市场物品。 */
  sendBuyMarketItem(itemKey: string, quantity: number) {
    this.emitServer(NEXT_C2S.BuyMarketItem, { itemKey, quantity });
  }

  /** 直接出售背包里的市场物品。 */
  sendSellMarketItem(slotIndex: number, quantity: number) {
    this.emitServer(NEXT_C2S.SellMarketItem, { slotIndex, quantity });
  }

  /** 取消市场订单。 */
  sendCancelMarketOrder(orderId: string) {
    this.emitServer(NEXT_C2S.CancelMarketOrder, { orderId });
  }

  /** 领取市场仓储。 */
  sendClaimMarketStorage() {
    this.emitServer(NEXT_C2S.ClaimMarketStorage, {});
  }

  /** 请求 NPC 商店数据。 */
  sendRequestNpcShop(npcId: string) {
    this.emitServer(NEXT_C2S.RequestNpcShop, { npcId });
  }

  /** 从 NPC 商店购买物品。 */
  sendBuyNpcShopItem(npcId: string, itemId: string, quantity: number) {
    this.emitServer(NEXT_C2S.BuyNpcShopItem, { npcId, itemId, quantity });
  }

  /** 请求炼丹面板。 */
  sendRequestAlchemyPanel(knownCatalogVersion?: number) {
    this.emitServer(NEXT_C2S.RequestAlchemyPanel, { knownCatalogVersion });
  }

  /** 保存炼丹预设。 */
  sendSaveAlchemyPreset(payload: any) {
    this.emitServer(NEXT_C2S.SaveAlchemyPreset, payload);
  }

  /** 删除炼丹预设。 */
  sendDeleteAlchemyPreset(presetId: string) {
    this.emitServer(NEXT_C2S.DeleteAlchemyPreset, { presetId });
  }

  /** 开始炼丹。 */
  sendStartAlchemy(payload: any) {
    this.emitServer(NEXT_C2S.StartAlchemy, payload);
  }

  /** 取消炼丹。 */
  sendCancelAlchemy() {
    this.emitServer(NEXT_C2S.CancelAlchemy, {});
  }

  /** 请求强化面板。 */
  sendRequestEnhancementPanel() {
    this.emitServer(NEXT_C2S.RequestEnhancementPanel, {});
  }

  /** 开始强化。 */
  sendStartEnhancement(payload: any) {
    this.emitServer(NEXT_C2S.StartEnhancement, payload);
  }

  /** 取消强化。 */
  sendCancelEnhancement() {
    this.emitServer(NEXT_C2S.CancelEnhancement, {});
  }

  /** 发送天门相关动作。 */
  sendHeavenGateAction(action: any, element?: any) {
    this.emitServer(NEXT_C2S.HeavenGateAction, { action, element });
  }

  /** 发送通用动作指令。 */
  sendAction(actionId: string, target?: string) {
    if (!target && actionId === 'portal:travel') {
      this.emitServer(NEXT_C2S.UsePortal, {});
      return;
    }
    this.emitServer(NEXT_C2S.UseAction, { actionId, target });
  }

  /** 更新自动战斗技能配置。 */
  sendUpdateAutoBattleSkills(skills: AutoBattleSkillConfig[]) {
    this.emitServer(NEXT_C2S.UpdateAutoBattleSkills, { skills });
  }

  /** 更新自动用药配置。 */
  sendUpdateAutoUsePills(pills: AutoUsePillConfig[]) {
    this.emitServer(NEXT_C2S.UpdateAutoUsePills, { pills });
  }

  /** 更新战斗目标选择规则。 */
  sendUpdateCombatTargetingRules(combatTargetingRules: CombatTargetingRules) {
    this.emitServer(NEXT_C2S.UpdateCombatTargetingRules, { combatTargetingRules });
  }

  /** 更新自动战斗寻敌模式。 */
  sendUpdateAutoBattleTargetingMode(mode: AutoBattleTargetingMode) {
    this.emitServer(NEXT_C2S.UpdateAutoBattleTargetingMode, { mode });
  }

  /** 更新功法技能启用状态。 */
  sendUpdateTechniqueSkillAvailability(techId: string, enabled: boolean) {
    this.emitServer(NEXT_C2S.UpdateTechniqueSkillAvailability, { techId, enabled });
  }

  /** 发送调试用重置刷怪指令。 */
  sendDebugResetSpawn() {
    this.emitServer(NEXT_C2S.DebugResetSpawn, { force: true });
  }

  /** 发送聊天消息。 */
  sendChat(message: string) {
    this.emitServer(NEXT_C2S.Chat, { message });
  }

  /** 确认已读系统消息。 */
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

  /** 透传通用发包接口。 */
  emit(event: string, payload: any) {
    this.emitServer(event, payload);
  }

  /** 当前连接是否处于已连接状态。 */
  get connected(): boolean {
    return this.socket?.connected ?? false;
  }
}

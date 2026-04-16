/**
 * Socket.IO 网络管理器 —— 封装客户端与服务端的双向通信，提供类型安全的事件收发接口
 */

import { io, Socket } from 'socket.io-client';
import { logNextMovement } from '../debug/movement-debug';
import {
  AutoBattleSkillConfig,
  AutoBattleTargetingMode,
  AutoUsePillConfig,
  CombatTargetingRules,
  decodeServerEventPayload,
  Direction,
  encodeClientEventPayload,
  EquipSlot,
  NEXT_C2S,
  NEXT_C2S_EventName,
  NEXT_C2S_EventPayload,
  NEXT_S2C,
  NEXT_S2C_EventName,
  NEXT_S2C_EventPayload,
  PLAYER_HEARTBEAT_INTERVAL_MS,
  SOCKET_CONNECT_TIMEOUT_MS,
  SOCKET_RECONNECTION_ATTEMPTS,
  SOCKET_RECONNECTION_DELAY_MAX_MS,
  SOCKET_RECONNECTION_DELAY_MS,
  SOCKET_TRANSPORTS,
} from '@mud/shared-next';

type BoundServerEventName = Exclude<NEXT_S2C_EventName, typeof NEXT_S2C.Kick>;
type ServerEventCallback<TEvent extends BoundServerEventName> = (data: NEXT_S2C_EventPayload<TEvent>) => void;
type ServerEventCallbackBuckets = {
  [TEvent in BoundServerEventName]?: Array<ServerEventCallback<TEvent>>;
};

/** 客户端 Socket.IO 连接管理器，负责连接生命周期、协议编解码和事件分发。 */
export class SocketManager {
  /** 当前持有的 Socket.IO 连接实例。 */
  private socket: Socket | null = null;
  /** 连接使用的访问令牌，便于断线后重连。 */
  private accessToken: string | null = null;
  /** 心跳定时器，用于周期性向服务端报活。 */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  /** 各服务端事件的订阅回调桶。 */
  private readonly serverEventCallbacks: ServerEventCallbackBuckets = {};
  /** 被踢下线时触发的回调集合。 */
  private readonly onKickCallbacks: Array<() => void> = [];
  /** 断开连接回调集合。 */
  private readonly onDisconnectCallbacks: Array<(reason: string) => void> = [];
  /** 连接失败回调集合。 */
  private readonly onConnectErrorCallbacks: Array<(message: string) => void> = [];

  /** 建立 WebSocket 连接并绑定所有服务端事件。 */
  connect(token: string): void {
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

    this.bindServerEvent(NEXT_S2C.Bootstrap);
    this.bindServerEvent(NEXT_S2C.InitSession);
    this.bindServerEvent(NEXT_S2C.MapEnter);
    this.bindServerEvent(NEXT_S2C.MapStatic);
    this.bindServerEvent(NEXT_S2C.Realm);
    this.bindServerEvent(NEXT_S2C.WorldDelta);
    this.bindServerEvent(NEXT_S2C.SelfDelta);
    this.bindServerEvent(NEXT_S2C.PanelDelta);
    this.bindServerEvent(NEXT_S2C.Notice);
    this.bindServerEvent(NEXT_S2C.LootWindowUpdate);
    this.bindServerEvent(NEXT_S2C.TileDetail);
    this.bindServerEvent(NEXT_S2C.Detail);
    this.bindServerEvent(NEXT_S2C.Quests);
    this.bindServerEvent(NEXT_S2C.NpcQuests);
    this.bindServerEvent(NEXT_S2C.QuestNavigateResult);
    this.bindServerEvent(NEXT_S2C.SuggestionUpdate);
    this.bindServerEvent(NEXT_S2C.MailSummary);
    this.bindServerEvent(NEXT_S2C.MailPage);
    this.bindServerEvent(NEXT_S2C.MailDetail);
    this.bindServerEvent(NEXT_S2C.RedeemCodesResult);
    this.bindServerEvent(NEXT_S2C.MailOpResult);
    this.bindServerEvent(NEXT_S2C.MarketUpdate);
    this.bindServerEvent(NEXT_S2C.MarketListings);
    this.bindServerEvent(NEXT_S2C.MarketOrders);
    this.bindServerEvent(NEXT_S2C.MarketStorage);
    this.bindServerEvent(NEXT_S2C.MarketItemBook);
    this.bindServerEvent(NEXT_S2C.MarketTradeHistory);
    this.bindServerEvent(NEXT_S2C.AttrDetail);
    this.bindServerEvent(NEXT_S2C.Leaderboard);
    this.bindServerEvent(NEXT_S2C.WorldSummary);
    this.bindServerEvent(NEXT_S2C.NpcShop);
    this.bindServerEvent(NEXT_S2C.AlchemyPanel);
    this.bindServerEvent(NEXT_S2C.EnhancementPanel);
    this.bindServerEvent(NEXT_S2C.Pong);
    this.bindServerEvent(NEXT_S2C.Error);
    this.bindServerEvent(NEXT_S2C.GmState);

    this.socket.on(NEXT_S2C.Kick, () => {
      this.onKickCallbacks.forEach((cb) => cb());
      this.disconnect();
    });

    this.socket.on('disconnect', (reason: string) => {
      this.stopHeartbeat();
      this.onDisconnectCallbacks.forEach((cb) => cb(reason));
    });

    this.socket.on('connect_error', (error: Error) => {
      this.onConnectErrorCallbacks.forEach((cb) => cb(error.message));
    });
  }

  /** 返回指定服务端事件的回调桶，不存在时按需初始化。 */
  private getServerEventCallbacks<TEvent extends BoundServerEventName>(
    event: TEvent,
  ): Array<ServerEventCallback<TEvent>> {
    const existing = this.serverEventCallbacks[event] as Array<ServerEventCallback<TEvent>> | undefined;
    if (existing) {
      return existing;
    }
    const next: Array<ServerEventCallback<TEvent>> = [];
    this.serverEventCallbacks[event] = next as ServerEventCallbackBuckets[TEvent];
    return next;
  }

  /** 注册服务端事件订阅。 */
  private onServerEvent<TEvent extends BoundServerEventName>(
    event: TEvent,
    cb: ServerEventCallback<TEvent>,
  ): void {
    this.getServerEventCallbacks(event).push(cb);
  }

  /** 绑定服务端事件，自动解码载荷后再分发给回调。 */
  private bindServerEvent<TEvent extends BoundServerEventName>(event: TEvent): void {
    const listener = ((raw: unknown) => {
      const data = decodeServerEventPayload<NEXT_S2C_EventPayload<TEvent>>(event, raw);
      for (const callback of this.getServerEventCallbacks(event)) {
        callback(data);
      }
    }) as (payload: unknown) => void;
    const socket = this.socket as Socket<any, any> | null;
    socket?.on(event as never, listener as never);
  }

  /** 向服务端发送事件，自动编码载荷。 */
  private sendEvent<TEvent extends NEXT_C2S_EventName>(
    event: TEvent,
    payload: NEXT_C2S_EventPayload<TEvent>,
  ): void {
    this.socket?.emit(event, encodeClientEventPayload(event, payload));
  }

  /** 断开当前连接并清理 token。 */
  disconnect(): void {
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
  private disposeSocket(options: { clearToken: boolean }): void {
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
    this.sendEvent(NEXT_C2S.Heartbeat, { clientAt: Date.now() });
  }

  /** 发送握手消息，完成客户端就绪声明。 */
  private sendHello(): void {
    this.sendEvent(NEXT_C2S.Hello, {});
  }

  sendPing(clientAt = Date.now()): number {
    this.sendEvent(NEXT_C2S.Ping, { clientAt });
    return clientAt;
  }

  /** 发送移动指令。 */
  sendMove(direction: Direction): void {
    logNextMovement('client.emit.move', {
      direction,
      connected: this.socket?.connected ?? false,
    });
    this.sendEvent(NEXT_C2S.Move, { d: direction });
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
  ): void {
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
    this.sendEvent(NEXT_C2S.MoveTo, {
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
  sendNavigateQuest(questId: string): void {
    logNextMovement('client.emit.navigateQuest', { questId });
    this.sendEvent(NEXT_C2S.NavigateQuest, { questId });
  }

  /** 申请刷新当前任务列表。 */
  sendRequestQuests(): void {
    this.sendEvent(NEXT_C2S.RequestQuests, {});
  }

  /** 申请刷新某个 NPC 的任务列表。 */
  sendRequestNpcQuests(npcId: string): void {
    this.sendEvent(NEXT_C2S.RequestNpcQuests, { npcId });
  }

  /** 接受 NPC 任务。 */
  sendAcceptNpcQuest(npcId: string, questId: string): void {
    this.sendEvent(NEXT_C2S.AcceptNpcQuest, { npcId, questId });
  }

  /** 提交 NPC 任务。 */
  sendSubmitNpcQuest(npcId: string, questId: string): void {
    this.sendEvent(NEXT_C2S.SubmitNpcQuest, { npcId, questId });
  }

  /** 申请指定对象的详情数据。 */
  sendRequestDetail(
    kind: NEXT_C2S_EventPayload<typeof NEXT_C2S.RequestDetail>['kind'],
    id: string,
  ): void {
    this.sendEvent(NEXT_C2S.RequestDetail, { kind, id });
  }

  /** 读取 GM 当前状态。 */
  sendGmGetState(): void {
    this.sendEvent(NEXT_C2S.GmGetState, {});
  }

  /** 让 GM 生成测试机器人。 */
  sendGmSpawnBots(count: number): void {
    this.sendEvent(NEXT_C2S.GmSpawnBots, { count });
  }

  /** 删除 GM 生成的测试机器人。 */
  sendGmRemoveBots(playerIds?: string[], all = false): void {
    this.sendEvent(NEXT_C2S.GmRemoveBots, { playerIds, all });
  }

  /** 更新 GM 面板中的玩家状态。 */
  sendGmUpdatePlayer(
    payload: NEXT_C2S_EventPayload<typeof NEXT_C2S.GmUpdatePlayer>,
  ): void {
    this.sendEvent(NEXT_C2S.GmUpdatePlayer, payload);
  }

  /** 重置 GM 目标玩家。 */
  sendGmResetPlayer(playerId: string): void {
    this.sendEvent(NEXT_C2S.GmResetPlayer, { playerId });
  }

  /** 使用物品。 */
  sendUseItem(slotIndex: number, count?: number): void {
    this.sendEvent(NEXT_C2S.UseItem, { slotIndex, count });
  }

  /** 丢弃物品。 */
  sendDropItem(slotIndex: number, count: number): void {
    this.sendEvent(NEXT_C2S.DropItem, { slotIndex, count });
  }

  /** 销毁物品。 */
  sendDestroyItem(slotIndex: number, count: number): void {
    this.sendEvent(NEXT_C2S.DestroyItem, { slotIndex, count });
  }

  /** 领取战利品。 */
  sendTakeLoot(sourceId: string, itemKey?: string, takeAll = false): void {
    this.sendEvent(NEXT_C2S.TakeGround, { sourceId, itemKey, takeAll });
  }

  /** 请求背包排序。 */
  sendSortInventory(): void {
    this.sendEvent(NEXT_C2S.SortInventory, {});
  }

  /** 请求查看地块运行时信息。 */
  sendInspectTileRuntime(x: number, y: number): void {
    this.sendEvent(NEXT_C2S.RequestTileDetail, { x, y });
  }

  /** 装备指定物品。 */
  sendEquip(slotIndex: number): void {
    this.sendEvent(NEXT_C2S.Equip, { slotIndex });
  }

  /** 卸下指定装备槽。 */
  sendUnequip(slot: EquipSlot): void {
    this.sendEvent(NEXT_C2S.Unequip, { slot });
  }

  /** 请求开始或切换修炼。 */
  sendCultivate(techId: string | null): void {
    this.sendEvent(NEXT_C2S.Cultivate, { techId });
  }

  /** 释放技能。 */
  sendCastSkill(skillId: string, target?: string): void {
    const payload: NEXT_C2S_EventPayload<typeof NEXT_C2S.CastSkill> = { skillId };
    if (target) {
      if (target.startsWith('player:')) {
        payload.targetPlayerId = target.slice('player:'.length) || null;
      } else if (target.startsWith('tile:')) {
        payload.targetRef = target;
      } else {
        payload.targetMonsterId = target;
      }
    }
    this.sendEvent(NEXT_C2S.CastSkill, payload);
  }

  /** 请求建议面板数据。 */
  sendRequestSuggestions(): void {
    this.sendEvent(NEXT_C2S.RequestSuggestions, {});
  }

  /** 新建一条建议。 */
  sendCreateSuggestion(title: string, description: string): void {
    this.sendEvent(NEXT_C2S.CreateSuggestion, { title, description });
  }

  /** 回复某条建议。 */
  sendReplySuggestion(suggestionId: string, content: string): void {
    this.sendEvent(NEXT_C2S.ReplySuggestion, { suggestionId, content });
  }

  /** 给建议投票。 */
  sendVoteSuggestion(suggestionId: string, vote: 'up' | 'down'): void {
    this.sendEvent(NEXT_C2S.VoteSuggestion, { suggestionId, vote });
  }

  /** 标记建议回复已读。 */
  sendMarkSuggestionRepliesRead(suggestionId: string): void {
    this.sendEvent(NEXT_C2S.MarkSuggestionRepliesRead, { suggestionId });
  }

  /** 请求邮件摘要。 */
  sendRequestMailSummary(): void {
    this.sendEvent(NEXT_C2S.RequestMailSummary, {});
  }

  /** 请求邮件分页。 */
  sendRequestMailPage(
    page: number,
    pageSize?: number,
    filter?: NEXT_C2S_EventPayload<typeof NEXT_C2S.RequestMailPage>['filter'],
  ): void {
    this.sendEvent(NEXT_C2S.RequestMailPage, { page, pageSize, filter });
  }

  /** 请求邮件详情。 */
  sendRequestMailDetail(mailId: string): void {
    this.sendEvent(NEXT_C2S.RequestMailDetail, { mailId });
  }

  /** 兑换礼包码。 */
  sendRedeemCodes(codes: string[]): void {
    this.sendEvent(NEXT_C2S.RedeemCodes, { codes });
  }

  /** 标记邮件为已读。 */
  sendMarkMailRead(mailIds: string[]): void {
    this.sendEvent(NEXT_C2S.MarkMailRead, { mailIds });
  }

  /** 领取邮件附件。 */
  sendClaimMailAttachments(mailIds: string[]): void {
    this.sendEvent(NEXT_C2S.ClaimMailAttachments, { mailIds });
  }

  /** 删除邮件。 */
  sendDeleteMail(mailIds: string[]): void {
    this.sendEvent(NEXT_C2S.DeleteMail, { mailIds });
  }

  /** 请求市场概览。 */
  sendRequestMarket(): void {
    this.sendEvent(NEXT_C2S.RequestMarket, {});
  }

  /** 请求市场挂单列表。 */
  sendRequestMarketListings(
    payload: NEXT_C2S_EventPayload<typeof NEXT_C2S.RequestMarketListings>,
  ): void {
    this.sendEvent(NEXT_C2S.RequestMarketListings, payload);
  }

  /** 请求市场物品图鉴。 */
  sendRequestMarketItemBook(itemKey: string): void {
    this.sendEvent(NEXT_C2S.RequestMarketItemBook, { itemKey });
  }

  /** 请求市场交易历史。 */
  sendRequestMarketTradeHistory(page: number): void {
    this.sendEvent(NEXT_C2S.RequestMarketTradeHistory, { page });
  }

  /** 请求属性详情。 */
  sendRequestAttrDetail(): void {
    this.sendEvent(NEXT_C2S.RequestAttrDetail, {});
  }

  /** 请求排行榜数据。 */
  sendRequestLeaderboard(
    limit?: NEXT_C2S_EventPayload<typeof NEXT_C2S.RequestLeaderboard>['limit'],
  ): void {
    this.sendEvent(NEXT_C2S.RequestLeaderboard, { limit });
  }

  /** 请求世界摘要。 */
  sendRequestWorldSummary(): void {
    this.sendEvent(NEXT_C2S.RequestWorldSummary, {});
  }

  /** 创建市场卖单。 */
  sendCreateMarketSellOrder(slotIndex: number, quantity: number, unitPrice: number): void {
    this.sendEvent(NEXT_C2S.CreateMarketSellOrder, { slotIndex, quantity, unitPrice });
  }

  /** 创建市场买单。 */
  sendCreateMarketBuyOrder(itemKey: string, quantity: number, unitPrice: number): void {
    this.sendEvent(NEXT_C2S.CreateMarketBuyOrder, { itemKey, quantity, unitPrice });
  }

  /** 直接购买市场物品。 */
  sendBuyMarketItem(itemKey: string, quantity: number): void {
    this.sendEvent(NEXT_C2S.BuyMarketItem, { itemKey, quantity });
  }

  /** 直接出售背包里的市场物品。 */
  sendSellMarketItem(slotIndex: number, quantity: number): void {
    this.sendEvent(NEXT_C2S.SellMarketItem, { slotIndex, quantity });
  }

  /** 取消市场订单。 */
  sendCancelMarketOrder(orderId: string): void {
    this.sendEvent(NEXT_C2S.CancelMarketOrder, { orderId });
  }

  /** 领取市场仓储。 */
  sendClaimMarketStorage(): void {
    this.sendEvent(NEXT_C2S.ClaimMarketStorage, {});
  }

  /** 请求 NPC 商店数据。 */
  sendRequestNpcShop(npcId: string): void {
    this.sendEvent(NEXT_C2S.RequestNpcShop, { npcId });
  }

  /** 从 NPC 商店购买物品。 */
  sendBuyNpcShopItem(npcId: string, itemId: string, quantity: number): void {
    this.sendEvent(NEXT_C2S.BuyNpcShopItem, { npcId, itemId, quantity });
  }

  /** 请求炼丹面板。 */
  sendRequestAlchemyPanel(knownCatalogVersion?: number): void {
    this.sendEvent(NEXT_C2S.RequestAlchemyPanel, { knownCatalogVersion });
  }

  /** 保存炼丹预设。 */
  sendSaveAlchemyPreset(
    payload: NEXT_C2S_EventPayload<typeof NEXT_C2S.SaveAlchemyPreset>,
  ): void {
    this.sendEvent(NEXT_C2S.SaveAlchemyPreset, payload);
  }

  /** 删除炼丹预设。 */
  sendDeleteAlchemyPreset(presetId: string): void {
    this.sendEvent(NEXT_C2S.DeleteAlchemyPreset, { presetId });
  }

  /** 开始炼丹。 */
  sendStartAlchemy(
    payload: NEXT_C2S_EventPayload<typeof NEXT_C2S.StartAlchemy>,
  ): void {
    this.sendEvent(NEXT_C2S.StartAlchemy, payload);
  }

  /** 取消炼丹。 */
  sendCancelAlchemy(): void {
    this.sendEvent(NEXT_C2S.CancelAlchemy, {});
  }

  /** 请求强化面板。 */
  sendRequestEnhancementPanel(): void {
    this.sendEvent(NEXT_C2S.RequestEnhancementPanel, {});
  }

  /** 开始强化。 */
  sendStartEnhancement(
    payload: NEXT_C2S_EventPayload<typeof NEXT_C2S.StartEnhancement>,
  ): void {
    this.sendEvent(NEXT_C2S.StartEnhancement, payload);
  }

  /** 取消强化。 */
  sendCancelEnhancement(): void {
    this.sendEvent(NEXT_C2S.CancelEnhancement, {});
  }

  /** 发送天门相关动作。 */
  sendHeavenGateAction(
    action: NEXT_C2S_EventPayload<typeof NEXT_C2S.HeavenGateAction>['action'],
    element?: NEXT_C2S_EventPayload<typeof NEXT_C2S.HeavenGateAction>['element'],
  ): void {
    this.sendEvent(NEXT_C2S.HeavenGateAction, { action, element });
  }

  /** 发送通用动作指令。 */
  sendAction(actionId: string, target?: string): void {
    if (!target && actionId === 'portal:travel') {
      this.sendEvent(NEXT_C2S.UsePortal, {});
      return;
    }
    this.sendEvent(NEXT_C2S.UseAction, { actionId, target });
  }

  /** 更新自动战斗技能配置。 */
  sendUpdateAutoBattleSkills(skills: AutoBattleSkillConfig[]): void {
    this.sendEvent(NEXT_C2S.UpdateAutoBattleSkills, { skills });
  }

  /** 更新自动用药配置。 */
  sendUpdateAutoUsePills(pills: AutoUsePillConfig[]): void {
    this.sendEvent(NEXT_C2S.UpdateAutoUsePills, { pills });
  }

  /** 更新战斗目标选择规则。 */
  sendUpdateCombatTargetingRules(combatTargetingRules: CombatTargetingRules): void {
    this.sendEvent(NEXT_C2S.UpdateCombatTargetingRules, { combatTargetingRules });
  }

  /** 更新自动战斗寻敌模式。 */
  sendUpdateAutoBattleTargetingMode(mode: AutoBattleTargetingMode): void {
    this.sendEvent(NEXT_C2S.UpdateAutoBattleTargetingMode, { mode });
  }

  /** 更新功法技能启用状态。 */
  sendUpdateTechniqueSkillAvailability(techId: string, enabled: boolean): void {
    this.sendEvent(NEXT_C2S.UpdateTechniqueSkillAvailability, { techId, enabled });
  }

  /** 发送调试用重置刷怪指令。 */
  sendDebugResetSpawn(): void {
    this.sendEvent(NEXT_C2S.DebugResetSpawn, { force: true });
  }

  /** 发送聊天消息。 */
  sendChat(message: string): void {
    this.sendEvent(NEXT_C2S.Chat, { message });
  }

  /** 确认已读系统消息。 */
  ackSystemMessages(ids: string[]): void {
    if (ids.length === 0) {
      return;
    }
    this.sendEvent(NEXT_C2S.AckSystemMessages, { ids });
  }

  onBootstrap(cb: ServerEventCallback<typeof NEXT_S2C.Bootstrap>): void {
    this.onServerEvent(NEXT_S2C.Bootstrap, cb);
  }

  onInitSession(cb: ServerEventCallback<typeof NEXT_S2C.InitSession>): void {
    this.onServerEvent(NEXT_S2C.InitSession, cb);
  }

  onMapEnter(cb: ServerEventCallback<typeof NEXT_S2C.MapEnter>): void {
    this.onServerEvent(NEXT_S2C.MapEnter, cb);
  }

  onWorldDelta(cb: ServerEventCallback<typeof NEXT_S2C.WorldDelta>): void {
    this.onServerEvent(NEXT_S2C.WorldDelta, cb);
  }

  onSelfDelta(cb: ServerEventCallback<typeof NEXT_S2C.SelfDelta>): void {
    this.onServerEvent(NEXT_S2C.SelfDelta, cb);
  }

  onPanelDelta(cb: ServerEventCallback<typeof NEXT_S2C.PanelDelta>): void {
    this.onServerEvent(NEXT_S2C.PanelDelta, cb);
  }

  onNotice(cb: ServerEventCallback<typeof NEXT_S2C.Notice>): void {
    this.onServerEvent(NEXT_S2C.Notice, cb);
  }

  onNpcQuests(cb: ServerEventCallback<typeof NEXT_S2C.NpcQuests>): void {
    this.onServerEvent(NEXT_S2C.NpcQuests, cb);
  }

  onDetail(cb: ServerEventCallback<typeof NEXT_S2C.Detail>): void {
    this.onServerEvent(NEXT_S2C.Detail, cb);
  }

  onTileDetail(cb: ServerEventCallback<typeof NEXT_S2C.TileDetail>): void {
    this.onServerEvent(NEXT_S2C.TileDetail, cb);
  }

  onMapStatic(cb: ServerEventCallback<typeof NEXT_S2C.MapStatic>): void {
    this.onServerEvent(NEXT_S2C.MapStatic, cb);
  }

  onRealm(cb: ServerEventCallback<typeof NEXT_S2C.Realm>): void {
    this.onServerEvent(NEXT_S2C.Realm, cb);
  }

  onKick(cb: () => void): void {
    this.onKickCallbacks.push(cb);
  }

  onLootWindowUpdate(cb: ServerEventCallback<typeof NEXT_S2C.LootWindowUpdate>): void {
    this.onServerEvent(NEXT_S2C.LootWindowUpdate, cb);
  }

  onQuests(cb: ServerEventCallback<typeof NEXT_S2C.Quests>): void {
    this.onServerEvent(NEXT_S2C.Quests, cb);
  }

  onQuestNavigateResult(cb: ServerEventCallback<typeof NEXT_S2C.QuestNavigateResult>): void {
    this.onServerEvent(NEXT_S2C.QuestNavigateResult, cb);
  }

  onSuggestionUpdate(cb: ServerEventCallback<typeof NEXT_S2C.SuggestionUpdate>): void {
    this.onServerEvent(NEXT_S2C.SuggestionUpdate, cb);
  }

  onMailSummary(cb: ServerEventCallback<typeof NEXT_S2C.MailSummary>): void {
    this.onServerEvent(NEXT_S2C.MailSummary, cb);
  }

  onMailPage(cb: ServerEventCallback<typeof NEXT_S2C.MailPage>): void {
    this.onServerEvent(NEXT_S2C.MailPage, cb);
  }

  onMailDetail(cb: ServerEventCallback<typeof NEXT_S2C.MailDetail>): void {
    this.onServerEvent(NEXT_S2C.MailDetail, cb);
  }

  onRedeemCodesResult(cb: ServerEventCallback<typeof NEXT_S2C.RedeemCodesResult>): void {
    this.onServerEvent(NEXT_S2C.RedeemCodesResult, cb);
  }

  onMailOpResult(cb: ServerEventCallback<typeof NEXT_S2C.MailOpResult>): void {
    this.onServerEvent(NEXT_S2C.MailOpResult, cb);
  }

  onMarketUpdate(cb: ServerEventCallback<typeof NEXT_S2C.MarketUpdate>): void {
    this.onServerEvent(NEXT_S2C.MarketUpdate, cb);
  }

  onMarketListings(cb: ServerEventCallback<typeof NEXT_S2C.MarketListings>): void {
    this.onServerEvent(NEXT_S2C.MarketListings, cb);
  }

  onMarketOrders(cb: ServerEventCallback<typeof NEXT_S2C.MarketOrders>): void {
    this.onServerEvent(NEXT_S2C.MarketOrders, cb);
  }

  onMarketStorage(cb: ServerEventCallback<typeof NEXT_S2C.MarketStorage>): void {
    this.onServerEvent(NEXT_S2C.MarketStorage, cb);
  }

  onMarketItemBook(cb: ServerEventCallback<typeof NEXT_S2C.MarketItemBook>): void {
    this.onServerEvent(NEXT_S2C.MarketItemBook, cb);
  }

  onMarketTradeHistory(cb: ServerEventCallback<typeof NEXT_S2C.MarketTradeHistory>): void {
    this.onServerEvent(NEXT_S2C.MarketTradeHistory, cb);
  }

  onAttrDetail(cb: ServerEventCallback<typeof NEXT_S2C.AttrDetail>): void {
    this.onServerEvent(NEXT_S2C.AttrDetail, cb);
  }

  onLeaderboard(cb: ServerEventCallback<typeof NEXT_S2C.Leaderboard>): void {
    this.onServerEvent(NEXT_S2C.Leaderboard, cb);
  }

  onWorldSummary(cb: ServerEventCallback<typeof NEXT_S2C.WorldSummary>): void {
    this.onServerEvent(NEXT_S2C.WorldSummary, cb);
  }

  onNpcShop(cb: ServerEventCallback<typeof NEXT_S2C.NpcShop>): void {
    this.onServerEvent(NEXT_S2C.NpcShop, cb);
  }

  onAlchemyPanel(cb: ServerEventCallback<typeof NEXT_S2C.AlchemyPanel>): void {
    this.onServerEvent(NEXT_S2C.AlchemyPanel, cb);
  }

  onEnhancementPanel(cb: ServerEventCallback<typeof NEXT_S2C.EnhancementPanel>): void {
    this.onServerEvent(NEXT_S2C.EnhancementPanel, cb);
  }

  onPong(cb: ServerEventCallback<typeof NEXT_S2C.Pong>): void {
    this.onServerEvent(NEXT_S2C.Pong, cb);
  }

  onError(cb: ServerEventCallback<typeof NEXT_S2C.Error>): void {
    this.onServerEvent(NEXT_S2C.Error, cb);
  }

  onGmState(cb: ServerEventCallback<typeof NEXT_S2C.GmState>): void {
    this.onServerEvent(NEXT_S2C.GmState, cb);
  }

  onDisconnect(cb: (reason: string) => void): void {
    this.onDisconnectCallbacks.push(cb);
  }

  onConnectError(cb: (message: string) => void): void {
    this.onConnectErrorCallbacks.push(cb);
  }

  /** 透传通用发包接口。 */
  emit<TEvent extends NEXT_C2S_EventName>(
    event: TEvent,
    payload: NEXT_C2S_EventPayload<TEvent>,
  ): void {
    this.sendEvent(event, payload);
  }

  /** 当前连接是否处于已连接状态。 */
  get connected(): boolean {
    return this.socket?.connected ?? false;
  }
}

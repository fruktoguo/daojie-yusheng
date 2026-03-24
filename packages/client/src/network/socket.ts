/**
 * Socket.IO 网络管理器 —— 封装客户端与服务端的双向通信，提供类型安全的事件收发接口
 */

import { io, Socket } from 'socket.io-client';
import {
  C2S, S2C, C2S_Move, C2S_MoveTo, C2S_GmGetState, C2S_GmSpawnBots, C2S_GmRemoveBots, C2S_GmUpdatePlayer, C2S_GmResetPlayer, C2S_Action, C2S_UpdateAutoBattleSkills, C2S_DebugResetSpawn, C2S_UseItem, C2S_DropItem, C2S_DestroyItem,
  C2S_TakeLoot, C2S_SortInventory, C2S_Equip, C2S_Unequip, C2S_Cultivate, C2S_Chat,
  C2S_Heartbeat,
  C2S_InspectTileRuntime,
  C2S_Ping,
  S2C_Tick, S2C_Init, S2C_AttrUpdate, S2C_InventoryUpdate,
  S2C_EquipmentUpdate, S2C_TechniqueUpdate, S2C_ActionsUpdate, S2C_LootWindowUpdate, S2C_QuestUpdate, S2C_SystemMsg, S2C_GmState,
  S2C_SuggestionUpdate,
  S2C_Pong,
  S2C_TileRuntimeDetail,
  S2C_Error, decodeServerEventPayload, encodeClientEventPayload,
  AutoBattleSkillConfig, Direction, EquipSlot, PLAYER_HEARTBEAT_INTERVAL_MS,
  SOCKET_CONNECT_TIMEOUT_MS, SOCKET_RECONNECTION_ATTEMPTS, SOCKET_RECONNECTION_DELAY_MS,
  SOCKET_RECONNECTION_DELAY_MAX_MS, SOCKET_TRANSPORTS,
} from '@mud/shared';

/** 客户端 Socket.IO 连接管理，负责协议编解码与事件分发 */
export class SocketManager {
  private socket: Socket | null = null;
  private accessToken: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private onTickCallbacks: Array<(data: S2C_Tick) => void> = [];
  private onKickCallbacks: Array<() => void> = [];
  private onInitCallbacks: Array<(data: S2C_Init) => void> = [];
  private onAttrUpdateCallbacks: Array<(data: S2C_AttrUpdate) => void> = [];
  private onInventoryUpdateCallbacks: Array<(data: S2C_InventoryUpdate) => void> = [];
  private onEquipmentUpdateCallbacks: Array<(data: S2C_EquipmentUpdate) => void> = [];
  private onTechniqueUpdateCallbacks: Array<(data: S2C_TechniqueUpdate) => void> = [];
  private onActionsUpdateCallbacks: Array<(data: S2C_ActionsUpdate) => void> = [];
  private onLootWindowUpdateCallbacks: Array<(data: S2C_LootWindowUpdate) => void> = [];
  private onTileRuntimeDetailCallbacks: Array<(data: S2C_TileRuntimeDetail) => void> = [];
  private onQuestUpdateCallbacks: Array<(data: S2C_QuestUpdate) => void> = [];
  private onSystemMsgCallbacks: Array<(data: S2C_SystemMsg) => void> = [];
  private onErrorCallbacks: Array<(data: S2C_Error) => void> = [];
  private onGmStateCallbacks: Array<(data: S2C_GmState) => void> = [];
  private onSuggestionUpdateCallbacks: Array<(data: S2C_SuggestionUpdate) => void> = [];
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
    this.bindServerEvent(S2C.AttrUpdate, this.onAttrUpdateCallbacks);
    this.bindServerEvent(S2C.InventoryUpdate, this.onInventoryUpdateCallbacks);
    this.bindServerEvent(S2C.EquipmentUpdate, this.onEquipmentUpdateCallbacks);
    this.bindServerEvent(S2C.TechniqueUpdate, this.onTechniqueUpdateCallbacks);
    this.bindServerEvent(S2C.ActionsUpdate, this.onActionsUpdateCallbacks);
    this.bindServerEvent(S2C.LootWindowUpdate, this.onLootWindowUpdateCallbacks);
    this.bindServerEvent(S2C.TileRuntimeDetail, this.onTileRuntimeDetailCallbacks);
    this.bindServerEvent(S2C.QuestUpdate, this.onQuestUpdateCallbacks);
    this.bindServerEvent(S2C.SystemMsg, this.onSystemMsgCallbacks);
    this.bindServerEvent(S2C.SuggestionUpdate, this.onSuggestionUpdateCallbacks);
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
      const data = decodeServerEventPayload<T>(event, raw);
      callbacks.forEach(cb => cb(data));
    });
  }

  /** 向服务端发送事件，自动编码载荷 */
  private emitServer<T>(event: string, payload: T): void {
    this.socket?.emit(event, encodeClientEventPayload(event, payload));
  }

  disconnect() {
    this.disposeSocket({ clearToken: true });
  }

  reconnect(token?: string): boolean {
    const nextToken = token ?? this.accessToken;
    if (!nextToken) {
      return false;
    }
    this.connect(nextToken);
    return true;
  }

  private disposeSocket(options: { clearToken: boolean }) {
    if (options.clearToken) {
      this.accessToken = null;
    }
    this.stopHeartbeat();
    this.socket?.disconnect();
    this.socket = null;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, PLAYER_HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) {
      return;
    }
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private sendHeartbeat(): void {
    this.emitServer(C2S.Heartbeat, { clientAt: Date.now() } satisfies C2S_Heartbeat);
  }

  sendPing(clientAt = Date.now()): number {
    this.emitServer(C2S.Ping, { clientAt } satisfies C2S_Ping);
    return clientAt;
  }

  sendMove(direction: Direction) {
    this.emitServer(C2S.Move, { d: direction } satisfies C2S_Move);
  }

  sendMoveTo(x: number, y: number, options?: { ignoreVisibilityLimit?: boolean; allowNearestReachable?: boolean }) {
    this.emitServer(C2S.MoveTo, {
      x,
      y,
      ignoreVisibilityLimit: options?.ignoreVisibilityLimit,
      allowNearestReachable: options?.allowNearestReachable,
    } satisfies C2S_MoveTo);
  }

  sendGmGetState() {
    this.emitServer(C2S.GmGetState, {} satisfies C2S_GmGetState);
  }

  sendGmSpawnBots(count: number) {
    this.emitServer(C2S.GmSpawnBots, { count } satisfies C2S_GmSpawnBots);
  }

  sendGmRemoveBots(playerIds?: string[], all = false) {
    this.emitServer(C2S.GmRemoveBots, { playerIds, all } satisfies C2S_GmRemoveBots);
  }

  sendGmUpdatePlayer(payload: C2S_GmUpdatePlayer) {
    this.emitServer(C2S.GmUpdatePlayer, payload satisfies C2S_GmUpdatePlayer);
  }

  sendGmResetPlayer(playerId: string) {
    this.emitServer(C2S.GmResetPlayer, { playerId } satisfies C2S_GmResetPlayer);
  }

  sendUseItem(slotIndex: number, count?: number) {
    this.emitServer(C2S.UseItem, { slotIndex, count } satisfies C2S_UseItem);
  }

  sendDropItem(slotIndex: number, count: number) {
    this.emitServer(C2S.DropItem, { slotIndex, count } satisfies C2S_DropItem);
  }

  sendDestroyItem(slotIndex: number, count: number) {
    this.emitServer(C2S.DestroyItem, { slotIndex, count } satisfies C2S_DestroyItem);
  }

  sendTakeLoot(sourceId: string, itemKey?: string, takeAll = false) {
    this.emitServer(C2S.TakeLoot, { sourceId, itemKey, takeAll } satisfies C2S_TakeLoot);
  }

  sendSortInventory() {
    this.emitServer(C2S.SortInventory, {} satisfies C2S_SortInventory);
  }

  sendInspectTileRuntime(x: number, y: number) {
    this.emitServer(C2S.InspectTileRuntime, { x, y } satisfies C2S_InspectTileRuntime);
  }

  sendEquip(slotIndex: number) {
    this.emitServer(C2S.Equip, { slotIndex } satisfies C2S_Equip);
  }

  sendUnequip(slot: EquipSlot) {
    this.emitServer(C2S.Unequip, { slot } satisfies C2S_Unequip);
  }

  sendCultivate(techId: string | null) {
    this.emitServer(C2S.Cultivate, { techId } satisfies C2S_Cultivate);
  }

  sendAction(actionId: string, target?: string) {
    this.emitServer(C2S.Action, { actionId, type: actionId, target } satisfies C2S_Action);
  }

  sendUpdateAutoBattleSkills(skills: AutoBattleSkillConfig[]) {
    this.emitServer(C2S.UpdateAutoBattleSkills, { skills } satisfies C2S_UpdateAutoBattleSkills);
  }

  sendDebugResetSpawn() {
    this.emitServer(C2S.DebugResetSpawn, { force: true } satisfies C2S_DebugResetSpawn);
    this.emitServer(C2S.Action, { actionId: 'debug:reset_spawn', type: 'debug:reset_spawn' } satisfies C2S_Action);
  }

  sendChat(message: string) {
    this.emitServer(C2S.Chat, { message } satisfies C2S_Chat);
  }

  onInit(cb: (data: S2C_Init) => void) { this.onInitCallbacks.push(cb); }
  onTick(cb: (data: S2C_Tick) => void) { this.onTickCallbacks.push(cb); }
  onKick(cb: () => void) { this.onKickCallbacks.push(cb); }
  onAttrUpdate(cb: (data: S2C_AttrUpdate) => void) { this.onAttrUpdateCallbacks.push(cb); }
  onInventoryUpdate(cb: (data: S2C_InventoryUpdate) => void) { this.onInventoryUpdateCallbacks.push(cb); }
  onEquipmentUpdate(cb: (data: S2C_EquipmentUpdate) => void) { this.onEquipmentUpdateCallbacks.push(cb); }
  onTechniqueUpdate(cb: (data: S2C_TechniqueUpdate) => void) { this.onTechniqueUpdateCallbacks.push(cb); }
  onActionsUpdate(cb: (data: S2C_ActionsUpdate) => void) { this.onActionsUpdateCallbacks.push(cb); }
  onLootWindowUpdate(cb: (data: S2C_LootWindowUpdate) => void) { this.onLootWindowUpdateCallbacks.push(cb); }
  onTileRuntimeDetail(cb: (data: S2C_TileRuntimeDetail) => void) { this.onTileRuntimeDetailCallbacks.push(cb); }
  onQuestUpdate(cb: (data: S2C_QuestUpdate) => void) { this.onQuestUpdateCallbacks.push(cb); }
  onSystemMsg(cb: (data: S2C_SystemMsg) => void) { this.onSystemMsgCallbacks.push(cb); }
  onSuggestionUpdate(cb: (data: S2C_SuggestionUpdate) => void) { this.onSuggestionUpdateCallbacks.push(cb); }
  onPong(cb: (data: S2C_Pong) => void) { this.onPongCallbacks.push(cb); }
  onError(cb: (data: S2C_Error) => void) { this.onErrorCallbacks.push(cb); }
  onGmState(cb: (data: S2C_GmState) => void) { this.onGmStateCallbacks.push(cb); }
  onDisconnect(cb: (reason: string) => void) { this.onDisconnectCallbacks.push(cb); }
  onConnectError(cb: (message: string) => void) { this.onConnectErrorCallbacks.push(cb); }

  emit(event: string, payload: any) {
    this.emitServer(event, payload);
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }
}

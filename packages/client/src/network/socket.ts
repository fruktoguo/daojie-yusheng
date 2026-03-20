import { io, Socket } from 'socket.io-client';
import {
  C2S, S2C, C2S_Move, C2S_MoveTo, C2S_GmGetState, C2S_GmSpawnBots, C2S_GmRemoveBots, C2S_GmUpdatePlayer, C2S_GmResetPlayer, C2S_Action, C2S_UpdateAutoBattleSkills, C2S_DebugResetSpawn, C2S_UseItem, C2S_DropItem,
  C2S_SortInventory, C2S_Equip, C2S_Unequip, C2S_Cultivate, C2S_Chat,
  S2C_Tick, S2C_Init, S2C_AttrUpdate, S2C_InventoryUpdate,
  S2C_EquipmentUpdate, S2C_TechniqueUpdate, S2C_ActionsUpdate, S2C_QuestUpdate, S2C_SystemMsg, S2C_GmState,
  S2C_Error,
  AutoBattleSkillConfig, Direction, EquipSlot,
} from '@mud/shared';

export class SocketManager {
  private socket: Socket | null = null;
  private onTickCallbacks: Array<(data: S2C_Tick) => void> = [];
  private onKickCallbacks: Array<() => void> = [];
  private onInitCallbacks: Array<(data: S2C_Init) => void> = [];
  private onAttrUpdateCallbacks: Array<(data: S2C_AttrUpdate) => void> = [];
  private onInventoryUpdateCallbacks: Array<(data: S2C_InventoryUpdate) => void> = [];
  private onEquipmentUpdateCallbacks: Array<(data: S2C_EquipmentUpdate) => void> = [];
  private onTechniqueUpdateCallbacks: Array<(data: S2C_TechniqueUpdate) => void> = [];
  private onActionsUpdateCallbacks: Array<(data: S2C_ActionsUpdate) => void> = [];
  private onQuestUpdateCallbacks: Array<(data: S2C_QuestUpdate) => void> = [];
  private onSystemMsgCallbacks: Array<(data: S2C_SystemMsg) => void> = [];
  private onErrorCallbacks: Array<(data: S2C_Error) => void> = [];
  private onGmStateCallbacks: Array<(data: S2C_GmState) => void> = [];
  private onDisconnectCallbacks: Array<(reason: string) => void> = [];
  private onConnectErrorCallbacks: Array<(message: string) => void> = [];

  connect(token: string) {
    this.disconnect();
    this.socket = io({
      auth: { token },
      // Swarm rolling updates and reverse proxies can route polling requests
      // to a different task, while a single WebSocket connection avoids SID drift.
      transports: ['websocket'],
    });

    this.socket.on(S2C.Init, (data: S2C_Init) => {
      this.onInitCallbacks.forEach(cb => cb(data));
    });

    this.socket.on(S2C.Tick, (data: S2C_Tick) => {
      this.onTickCallbacks.forEach(cb => cb(data));
    });

    this.socket.on(S2C.Kick, () => {
      this.onKickCallbacks.forEach(cb => cb());
      this.disconnect();
    });

    this.socket.on(S2C.AttrUpdate, (data: S2C_AttrUpdate) => {
      this.onAttrUpdateCallbacks.forEach(cb => cb(data));
    });

    this.socket.on(S2C.InventoryUpdate, (data: S2C_InventoryUpdate) => {
      this.onInventoryUpdateCallbacks.forEach(cb => cb(data));
    });

    this.socket.on(S2C.EquipmentUpdate, (data: S2C_EquipmentUpdate) => {
      this.onEquipmentUpdateCallbacks.forEach(cb => cb(data));
    });

    this.socket.on(S2C.TechniqueUpdate, (data: S2C_TechniqueUpdate) => {
      this.onTechniqueUpdateCallbacks.forEach(cb => cb(data));
    });

    this.socket.on(S2C.ActionsUpdate, (data: S2C_ActionsUpdate) => {
      this.onActionsUpdateCallbacks.forEach(cb => cb(data));
    });

    this.socket.on(S2C.QuestUpdate, (data: S2C_QuestUpdate) => {
      this.onQuestUpdateCallbacks.forEach(cb => cb(data));
    });

    this.socket.on(S2C.SystemMsg, (data: S2C_SystemMsg) => {
      this.onSystemMsgCallbacks.forEach(cb => cb(data));
    });

    this.socket.on(S2C.Error, (data: S2C_Error) => {
      this.onErrorCallbacks.forEach(cb => cb(data));
    });

    this.socket.on(S2C.GmState, (data: S2C_GmState) => {
      this.onGmStateCallbacks.forEach(cb => cb(data));
    });

    this.socket.on('disconnect', (reason: string) => {
      this.onDisconnectCallbacks.forEach(cb => cb(reason));
    });

    this.socket.on('connect_error', (error: Error) => {
      this.onConnectErrorCallbacks.forEach(cb => cb(error.message));
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  sendMove(direction: Direction) {
    this.socket?.emit(C2S.Move, { d: direction } satisfies C2S_Move);
  }

  sendMoveTo(x: number, y: number, options?: { ignoreVisibilityLimit?: boolean; allowNearestReachable?: boolean }) {
    this.socket?.emit(C2S.MoveTo, {
      x,
      y,
      ignoreVisibilityLimit: options?.ignoreVisibilityLimit,
      allowNearestReachable: options?.allowNearestReachable,
    } satisfies C2S_MoveTo);
  }

  sendGmGetState() {
    this.socket?.emit(C2S.GmGetState, {} satisfies C2S_GmGetState);
  }

  sendGmSpawnBots(count: number) {
    this.socket?.emit(C2S.GmSpawnBots, { count } satisfies C2S_GmSpawnBots);
  }

  sendGmRemoveBots(playerIds?: string[], all = false) {
    this.socket?.emit(C2S.GmRemoveBots, { playerIds, all } satisfies C2S_GmRemoveBots);
  }

  sendGmUpdatePlayer(payload: C2S_GmUpdatePlayer) {
    this.socket?.emit(C2S.GmUpdatePlayer, payload satisfies C2S_GmUpdatePlayer);
  }

  sendGmResetPlayer(playerId: string) {
    this.socket?.emit(C2S.GmResetPlayer, { playerId } satisfies C2S_GmResetPlayer);
  }

  sendUseItem(slotIndex: number) {
    this.socket?.emit(C2S.UseItem, { slotIndex } satisfies C2S_UseItem);
  }

  sendDropItem(slotIndex: number, count: number) {
    this.socket?.emit(C2S.DropItem, { slotIndex, count } satisfies C2S_DropItem);
  }

  sendSortInventory() {
    this.socket?.emit(C2S.SortInventory, {} satisfies C2S_SortInventory);
  }

  sendEquip(slotIndex: number) {
    this.socket?.emit(C2S.Equip, { slotIndex } satisfies C2S_Equip);
  }

  sendUnequip(slot: EquipSlot) {
    this.socket?.emit(C2S.Unequip, { slot } satisfies C2S_Unequip);
  }

  sendCultivate(techId: string | null) {
    this.socket?.emit(C2S.Cultivate, { techId } satisfies C2S_Cultivate);
  }

  sendAction(actionId: string, target?: string) {
    this.socket?.emit(C2S.Action, { actionId, type: actionId, target } satisfies C2S_Action);
  }

  sendUpdateAutoBattleSkills(skills: AutoBattleSkillConfig[]) {
    this.socket?.emit(C2S.UpdateAutoBattleSkills, { skills } satisfies C2S_UpdateAutoBattleSkills);
  }

  sendDebugResetSpawn() {
    this.socket?.emit(C2S.DebugResetSpawn, { force: true } satisfies C2S_DebugResetSpawn);
    this.socket?.emit(C2S.Action, { actionId: 'debug:reset_spawn', type: 'debug:reset_spawn' } satisfies C2S_Action);
  }

  sendChat(message: string) {
    this.socket?.emit(C2S.Chat, { message } satisfies C2S_Chat);
  }

  onInit(cb: (data: S2C_Init) => void) { this.onInitCallbacks.push(cb); }
  onTick(cb: (data: S2C_Tick) => void) { this.onTickCallbacks.push(cb); }
  onKick(cb: () => void) { this.onKickCallbacks.push(cb); }
  onAttrUpdate(cb: (data: S2C_AttrUpdate) => void) { this.onAttrUpdateCallbacks.push(cb); }
  onInventoryUpdate(cb: (data: S2C_InventoryUpdate) => void) { this.onInventoryUpdateCallbacks.push(cb); }
  onEquipmentUpdate(cb: (data: S2C_EquipmentUpdate) => void) { this.onEquipmentUpdateCallbacks.push(cb); }
  onTechniqueUpdate(cb: (data: S2C_TechniqueUpdate) => void) { this.onTechniqueUpdateCallbacks.push(cb); }
  onActionsUpdate(cb: (data: S2C_ActionsUpdate) => void) { this.onActionsUpdateCallbacks.push(cb); }
  onQuestUpdate(cb: (data: S2C_QuestUpdate) => void) { this.onQuestUpdateCallbacks.push(cb); }
  onSystemMsg(cb: (data: S2C_SystemMsg) => void) { this.onSystemMsgCallbacks.push(cb); }
  onError(cb: (data: S2C_Error) => void) { this.onErrorCallbacks.push(cb); }
  onGmState(cb: (data: S2C_GmState) => void) { this.onGmStateCallbacks.push(cb); }
  onDisconnect(cb: (reason: string) => void) { this.onDisconnectCallbacks.push(cb); }
  onConnectError(cb: (message: string) => void) { this.onConnectErrorCallbacks.push(cb); }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }
}

import { NEXT_C2S, type NEXT_C2S_EventPayload } from '@mud/shared-next';
import type { SocketEmitEvent } from './socket-send-types';
/**
 * AdminSenderDeps：统一结构类型，保证协议与运行时一致性。
 */


type AdminSenderDeps = {
/**
 * emitEvent：事件相关字段。
 */

  emitEvent: SocketEmitEvent;
};
/**
 * createSocketAdminSender：构建并返回目标对象。
 * @param deps AdminSenderDeps 运行时依赖。
 * @returns 无返回值，直接更新SocketAdminSender相关状态。
 */


export function createSocketAdminSender(deps: AdminSenderDeps) {
  return {  
  /**
 * sendGmGetState：读取sendGMGet状态并返回结果。
 * @returns 无返回值，直接更新sendGMGet状态相关状态。
 */

    sendGmGetState(): void {
      deps.emitEvent(NEXT_C2S.GmGetState, {});
    },    
    /**
 * sendGmSpawnBots：执行sendGMSpawnBot相关逻辑。
 * @param count number 数量。
 * @returns 无返回值，直接更新sendGMSpawnBot相关状态。
 */


    sendGmSpawnBots(count: number): void {
      deps.emitEvent(NEXT_C2S.GmSpawnBots, { count });
    },    
    /**
 * sendGmRemoveBots：处理sendGMRemoveBot并更新相关状态。
 * @param playerIds string[] player ID 集合。
 * @param all 参数说明。
 * @returns 无返回值，直接更新sendGMRemoveBot相关状态。
 */


    sendGmRemoveBots(playerIds?: string[], all = false): void {
      deps.emitEvent(NEXT_C2S.GmRemoveBots, { playerIds, all });
    },    
    /**
 * sendGmUpdatePlayer：处理sendGMUpdate玩家并更新相关状态。
 * @param payload NEXT_C2S_EventPayload<typeof NEXT_C2S.GmUpdatePlayer> 载荷参数。
 * @returns 无返回值，直接更新sendGMUpdate玩家相关状态。
 */


    sendGmUpdatePlayer(
      payload: NEXT_C2S_EventPayload<typeof NEXT_C2S.GmUpdatePlayer>,
    ): void {
      deps.emitEvent(NEXT_C2S.GmUpdatePlayer, payload);
    },    
    /**
 * sendGmResetPlayer：执行sendGMReset玩家相关逻辑。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，直接更新sendGMReset玩家相关状态。
 */


    sendGmResetPlayer(playerId: string): void {
      deps.emitEvent(NEXT_C2S.GmResetPlayer, { playerId });
    },    
    /**
 * sendDebugResetSpawn：执行sendDebugResetSpawn相关逻辑。
 * @returns 无返回值，直接更新sendDebugResetSpawn相关状态。
 */


    sendDebugResetSpawn(): void {
      deps.emitEvent(NEXT_C2S.DebugResetSpawn, { force: true });
    },
  };
}
/**
 * SocketAdminSender：统一结构类型，保证协议与运行时一致性。
 */


export type SocketAdminSender = ReturnType<typeof createSocketAdminSender>;

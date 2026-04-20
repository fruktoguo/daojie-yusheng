import { NEXT_C2S, type NEXT_C2S_EventPayload } from '@mud/shared-next';
import type { SocketEmitEvent } from './socket-send-types';
/**
 * AdminSenderDeps：统一结构类型，保证协议与运行时一致性。
 */


type AdminSenderDeps = {
/**
 * emitEvent：对象字段。
 */

  emitEvent: SocketEmitEvent;
};
/**
 * createSocketAdminSender：构建并返回目标对象。
 * @param deps AdminSenderDeps 运行时依赖。
 * @returns 函数返回值。
 */


export function createSocketAdminSender(deps: AdminSenderDeps) {
  return {  
  /**
 * sendGmGetState：执行核心业务逻辑。
 * @returns void。
 */

    sendGmGetState(): void {
      deps.emitEvent(NEXT_C2S.GmGetState, {});
    },    
    /**
 * sendGmSpawnBots：执行核心业务逻辑。
 * @param count number 数量。
 * @returns void。
 */


    sendGmSpawnBots(count: number): void {
      deps.emitEvent(NEXT_C2S.GmSpawnBots, { count });
    },    
    /**
 * sendGmRemoveBots：执行核心业务逻辑。
 * @param playerIds string[] player ID 集合。
 * @param all 参数说明。
 * @returns void。
 */


    sendGmRemoveBots(playerIds?: string[], all = false): void {
      deps.emitEvent(NEXT_C2S.GmRemoveBots, { playerIds, all });
    },    
    /**
 * sendGmUpdatePlayer：执行核心业务逻辑。
 * @param payload NEXT_C2S_EventPayload<typeof NEXT_C2S.GmUpdatePlayer> 载荷参数。
 * @returns void。
 */


    sendGmUpdatePlayer(
      payload: NEXT_C2S_EventPayload<typeof NEXT_C2S.GmUpdatePlayer>,
    ): void {
      deps.emitEvent(NEXT_C2S.GmUpdatePlayer, payload);
    },    
    /**
 * sendGmResetPlayer：执行核心业务逻辑。
 * @param playerId string 玩家 ID。
 * @returns void。
 */


    sendGmResetPlayer(playerId: string): void {
      deps.emitEvent(NEXT_C2S.GmResetPlayer, { playerId });
    },    
    /**
 * sendDebugResetSpawn：执行核心业务逻辑。
 * @returns void。
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

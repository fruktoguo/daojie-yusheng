/**
 * 协议投影服务。
 * 负责将 tile detail、loot 交互等数据按当前协议版本投影并下发给客户端。
 */

import { Inject, Injectable } from '@nestjs/common';
import { S2C, type S2C_PayloadMap } from '@mud/shared';
import type { Socket } from 'socket.io';

import { WorldClientEventService } from './world-client-event.service';

type TileDetailPayload = S2C_PayloadMap[typeof S2C.TileDetail];

interface WorldClientEventEmitter {
  emitLootWindowUpdate(client: Socket, playerId: string, x: number, y: number): void;
}

/** 协议投影发射结果 */
export interface ProjectionEmission {
  protocol: 'mainline';
  emitMainline: true;
}

/** 协议投影服务：封装 tile detail 和 loot 交互的下发逻辑 */
@Injectable()
export class WorldProtocolProjectionService {
  constructor(
    @Inject(WorldClientEventService)
    private readonly worldClientEventService: WorldClientEventEmitter,
  ) {}

  /** 下发 tile detail 给指定客户端 */
  emitTileDetail(client: Socket, payload: TileDetailPayload): void {
    client.emit(S2C.TileDetail, payload);
  }

  /** 下发 tile detail 并触发 loot 窗口更新 */
  emitTileLootInteraction(client: Socket, playerId: string, payload: TileDetailPayload): void {
    this.emitTileDetail(client, payload);
    this.worldClientEventService.emitLootWindowUpdate(client, playerId, payload.x, payload.y);
  }

  /** 解析当前 socket 的协议投影模式（当前仅 mainline） */
  resolveProjectionEmission(_client: Socket): ProjectionEmission {
    return {
      protocol: 'mainline',
      emitMainline: true,
    };
  }
}

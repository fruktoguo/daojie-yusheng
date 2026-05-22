/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
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

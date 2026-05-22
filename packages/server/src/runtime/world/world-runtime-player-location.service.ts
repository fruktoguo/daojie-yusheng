/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Injectable } from '@nestjs/common';

/** 玩家运行时位置信息（实例 ID + 会话 ID） */
export interface RuntimePlayerLocation {
  instanceId: string;
  sessionId?: string;
}

@Injectable()
export class WorldRuntimePlayerLocationService {
  readonly playerLocations = new Map<string, RuntimePlayerLocation>();

  getPlayerLocation(playerId: string): RuntimePlayerLocation | null {
    return this.playerLocations.get(playerId) ?? null;
  }

  setPlayerLocation(playerId: string, location: RuntimePlayerLocation): void {
    this.playerLocations.set(playerId, location);
  }

  clearPlayerLocation(playerId: string): void {
    this.playerLocations.delete(playerId);
  }

  getPlayerLocationCount(): number {
    return this.playerLocations.size;
  }

  listConnectedPlayerIds(): IterableIterator<string> {
    return this.playerLocations.keys();
  }

  resetState(): void {
    this.playerLocations.clear();
  }
}

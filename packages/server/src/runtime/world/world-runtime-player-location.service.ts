/**
 * 玩家位置索引服务
 * 维护在线玩家到所在实例的映射关系，支持快速查询和清理
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

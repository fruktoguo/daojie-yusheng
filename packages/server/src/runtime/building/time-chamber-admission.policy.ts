/** 密室准入策略独立于传送实现，后续扩为多人时只调整这里和持久化容量。 */
import { Injectable } from '@nestjs/common';

@Injectable()
export class TimeChamberAdmissionPolicy {
  canEnter(
    instance: any,
    playerId: string,
    capacity: number,
    retainedPlayerIds: Iterable<string> = [],
  ): { ok: boolean; reason?: string } {
    const occupantPlayerIds = new Set<string>();
    for (const occupantPlayerId of typeof instance?.listPlayerIds === 'function' ? instance.listPlayerIds() : []) {
      if (typeof occupantPlayerId === 'string' && occupantPlayerId.trim()) {
        occupantPlayerIds.add(occupantPlayerId.trim());
      }
    }
    for (const occupantPlayerId of retainedPlayerIds) {
      if (typeof occupantPlayerId === 'string' && occupantPlayerId.trim()) {
        occupantPlayerIds.add(occupantPlayerId.trim());
      }
    }
    if (occupantPlayerIds.has(playerId)) {
      return { ok: true };
    }
    const normalizedCapacity = Math.max(1, Math.trunc(Number(capacity) || 1));
    return occupantPlayerIds.size < normalizedCapacity
      ? { ok: true }
      : { ok: false, reason: 'time_chamber_full' };
  }
}

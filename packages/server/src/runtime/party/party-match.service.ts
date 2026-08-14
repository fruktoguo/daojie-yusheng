import { Injectable } from '@nestjs/common';
import type { PartyMatchQueueView } from '@mud/shared';
import type { PartyMatchEntry } from './party-runtime.types';

@Injectable()
export class PartyMatchService {
  private readonly entries = new Map<string, PartyMatchEntry>();

  join(entry: PartyMatchEntry): void {
    if (this.entries.size >= 10_000 && !this.entries.has(entry.playerId)) {
      throw new Error('match_queue_full');
    }
    this.entries.set(entry.playerId, entry);
  }

  leave(playerId: string): void {
    this.entries.delete(playerId);
  }

  get(playerId: string): PartyMatchEntry | null {
    return this.entries.get(playerId) ?? null;
  }

  list(): PartyMatchEntry[] {
    return Array.from(this.entries.values()).sort((left, right) => left.joinedAt - right.joinedAt || left.playerId.localeCompare(right.playerId));
  }

  view(playerId: string, now = Date.now()): PartyMatchQueueView {
    const entry = this.entries.get(playerId);
    if (!entry) return { queued: false };
    return {
      queued: true,
      purpose: entry.purpose,
      joinedAt: entry.joinedAt,
      initialRealmTolerance: 5,
      currentRealmTolerance: tolerance(entry, now),
    };
  }

  compatible(left: PartyMatchEntry, right: PartyMatchEntry, now = Date.now()): boolean {
    if (left.playerId === right.playerId || left.purpose !== right.purpose) return false;
    return Math.abs(left.realmLv - right.realmLv) <= Math.min(tolerance(left, now), tolerance(right, now));
  }
}

function tolerance(entry: PartyMatchEntry, now: number): number {
  return Math.min(10, 5 + Math.floor(Math.max(0, now - entry.joinedAt) / 30_000));
}

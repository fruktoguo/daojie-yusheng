import type { PartyExpMode, PartyLootMode } from '@mud/shared';

export interface PartyCombatMemberSnapshot {
  playerId: string;
  joinedAt: number;
}

export interface PartyCombatSnapshot {
  partyId: string;
  expMode: PartyExpMode;
  lootMode: PartyLootMode;
  friendlyFireEnabled: boolean;
  lootCursor: number;
  members: PartyCombatMemberSnapshot[];
}

const snapshots = new Map<string, PartyCombatSnapshot>();
let cursorSink: ((partyId: string, cursor: number) => void) | null = null;

export function setPartyCombatSnapshot(snapshot: PartyCombatSnapshot): void {
  snapshots.set(snapshot.partyId, {
    ...snapshot,
    members: [...snapshot.members].sort((left, right) => left.joinedAt - right.joinedAt || left.playerId.localeCompare(right.playerId)),
  });
}

export function deletePartyCombatSnapshot(partyId: string): void {
  snapshots.delete(partyId);
}

export function getPartyCombatSnapshot(partyId: unknown): PartyCombatSnapshot | null {
  return typeof partyId === 'string' ? snapshots.get(partyId) ?? null : null;
}

export function arePlayersInSameParty(left: { partyId?: unknown } | null | undefined, right: { partyId?: unknown } | null | undefined): boolean {
  const leftId = typeof left?.partyId === 'string' ? left.partyId : '';
  const rightId = typeof right?.partyId === 'string' ? right.partyId : '';
  return Boolean(leftId && leftId === rightId && snapshots.has(leftId));
}

export function isPartyFriendlyFireEnabled(partyId: unknown): boolean {
  return getPartyCombatSnapshot(partyId)?.friendlyFireEnabled === true;
}

export function registerPartyLootCursorSink(sink: ((partyId: string, cursor: number) => void) | null): void {
  cursorSink = sink;
}

export function advancePartyLootCursor(partyId: string, delta = 1): number {
  const snapshot = snapshots.get(partyId);
  if (!snapshot || delta <= 0) return snapshot?.lootCursor ?? 0;
  const start = snapshot.lootCursor;
  snapshot.lootCursor += delta;
  cursorSink?.(partyId, snapshot.lootCursor);
  return start;
}

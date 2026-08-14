import { PARTY_REWARD_RANGE } from '@mud/shared';
import {
  advancePartyLootCursor,
  getPartyCombatSnapshot,
} from './party-combat-registry';

export interface PartyRewardParticipant {
  playerId: string;
  contribution: number;
  realmLv: number;
}

const supportByMonster = new Map<string, Set<string>>();
const supportByInstance = new Map<string, PartySupportEvent[]>();
const SUPPORT_MONSTER_LIMIT = 8_192;
const SUPPORT_WINDOW_TICKS = 30;
const SUPPORT_INSTANCE_EVENT_LIMIT = 1_024;

interface PartySupportEvent {
  supporterPlayerId: string;
  targetPlayerId: string;
  tick: number;
}

export function recordPartyMonsterSupport(
  instanceId: string,
  monsterRuntimeId: string,
  playerId: string,
): void {
  const key = supportKey(instanceId, monsterRuntimeId);
  let players = supportByMonster.get(key);
  if (!players) {
    while (supportByMonster.size >= SUPPORT_MONSTER_LIMIT) supportByMonster.delete(supportByMonster.keys().next().value);
    players = new Set<string>();
    supportByMonster.set(key, players);
  }
  if (players.size < 25) players.add(playerId);
}

export function recordPartyMemberSupport(
  instanceId: string,
  supporterPlayerId: string,
  targetPlayerId: string,
  tick: number,
): void {
  if (!instanceId || !supporterPlayerId || !targetPlayerId || supporterPlayerId === targetPlayerId) return;
  const normalizedTick = Math.max(0, Math.trunc(Number(tick) || 0));
  const cutoff = normalizedTick - SUPPORT_WINDOW_TICKS;
  const events = (supportByInstance.get(instanceId) ?? []).filter((entry) => entry.tick >= cutoff);
  const duplicate = events.some((entry) => (
    entry.supporterPlayerId === supporterPlayerId
    && entry.targetPlayerId === targetPlayerId
    && entry.tick === normalizedTick
  ));
  if (!duplicate) events.push({ supporterPlayerId, targetPlayerId, tick: normalizedTick });
  if (events.length > SUPPORT_INSTANCE_EVENT_LIMIT) {
    events.splice(0, events.length - SUPPORT_INSTANCE_EVENT_LIMIT);
  }
  supportByInstance.set(instanceId, events);
}

export function clearPartyMonsterSupport(instanceId: string, monsterRuntimeId: string): void {
  supportByMonster.delete(supportKey(instanceId, monsterRuntimeId));
}

export function clearPartyPlayerSupport(instanceId: string, playerId: string): void {
  if (!instanceId || !playerId) return;
  const retainedEvents = (supportByInstance.get(instanceId) ?? []).filter((entry) => (
    entry.supporterPlayerId !== playerId && entry.targetPlayerId !== playerId
  ));
  if (retainedEvents.length > 0) supportByInstance.set(instanceId, retainedEvents);
  else supportByInstance.delete(instanceId);
  const prefix = `${instanceId}\n`;
  for (const [key, playerIds] of supportByMonster) {
    if (!key.startsWith(prefix)) continue;
    playerIds.delete(playerId);
    if (playerIds.size === 0) supportByMonster.delete(key);
  }
}

export function clearPartyInstanceSupport(instanceId: string): void {
  if (!instanceId) return;
  supportByInstance.delete(instanceId);
  const prefix = `${instanceId}\n`;
  for (const key of supportByMonster.keys()) {
    if (key.startsWith(prefix)) supportByMonster.delete(key);
  }
}

export function clearAllPartySupport(): void {
  supportByMonster.clear();
  supportByInstance.clear();
}

export function resolvePartyExperienceParticipants(
  raw: PartyRewardParticipant[],
  instance: any,
  monster: any,
  getPlayer: (playerId: string) => any,
): PartyRewardParticipant[] {
  const damageByPlayer = new Map(raw.map((entry) => [entry.playerId, Math.max(0, entry.contribution)]));
  const processedParties = new Set<string>();
  const result: PartyRewardParticipant[] = [];
  for (const participant of raw) {
    const player = getPlayer(participant.playerId);
    const partyId = typeof player?.partyId === 'string' ? player.partyId : '';
    const snapshot = getPartyCombatSnapshot(partyId);
    if (!snapshot || snapshot.expMode !== 'equal') {
      result.push(participant);
      continue;
    }
    if (processedParties.has(partyId)) continue;
    processedParties.add(partyId);
    const memberIds = new Set(snapshot.members.map((member) => member.playerId));
    let partyContribution = 0;
    for (const entry of raw) {
      if (memberIds.has(entry.playerId)) partyContribution += Math.max(0, entry.contribution);
    }
    const eligible = resolveEligibleMembers(snapshot, damageByPlayer, instance, monster, getPlayer);
    if (partyContribution <= 0 || eligible.length === 0) {
      for (const entry of raw) if (memberIds.has(entry.playerId)) result.push(entry);
      continue;
    }
    const share = partyContribution / eligible.length;
    for (const member of eligible) {
      result.push({
        playerId: member.playerId,
        contribution: share,
        realmLv: Math.max(1, Math.floor(member.player?.realm?.realmLv ?? 1)),
      });
    }
  }
  return result;
}

export function resolvePartyLootRecipients(
  killerPlayerId: string,
  itemStackCount: number,
  raw: PartyRewardParticipant[],
  instance: any,
  monster: any,
  getPlayer: (playerId: string) => any,
): string[] {
  if (itemStackCount <= 0) return [];
  const killer = getPlayer(killerPlayerId);
  const partyId = typeof killer?.partyId === 'string' ? killer.partyId : '';
  const snapshot = getPartyCombatSnapshot(partyId);
  if (!snapshot || snapshot.lootMode !== 'round_robin') return Array(itemStackCount).fill(killerPlayerId);
  const memberIds = new Set(snapshot.members.map((member) => member.playerId));
  const partyHasContribution = raw.some((entry) => entry.contribution > 0 && memberIds.has(entry.playerId));
  if (!partyHasContribution) return Array(itemStackCount).fill(killerPlayerId);
  const damageByPlayer = new Map(raw.map((entry) => [entry.playerId, Math.max(0, entry.contribution)]));
  const eligible = resolveEligibleMembers(snapshot, damageByPlayer, instance, monster, getPlayer);
  if (eligible.length === 0) return Array(itemStackCount).fill(killerPlayerId);
  const start = advancePartyLootCursor(partyId, itemStackCount);
  return Array.from({ length: itemStackCount }, (_, index) => eligible[(start + index) % eligible.length].playerId);
}

function resolveEligibleMembers(
  snapshot: NonNullable<ReturnType<typeof getPartyCombatSnapshot>>,
  damageByPlayer: Map<string, number>,
  instance: any,
  monster: any,
  getPlayer: (playerId: string) => any,
): Array<{ playerId: string; player: any }> {
  const instanceId = String(instance?.meta?.instanceId ?? '');
  const support = new Set(
    supportByMonster.get(supportKey(instanceId, String(monster?.runtimeId ?? ''))) ?? [],
  );
  const currentTick = Math.max(0, Math.trunc(Number(instance?.tick) || 0));
  const cutoff = currentTick - SUPPORT_WINDOW_TICKS;
  const contributorIds = new Set(
    [...damageByPlayer.entries()]
      .filter(([, contribution]) => contribution > 0)
      .map(([playerId]) => playerId),
  );
  const retainedEvents: PartySupportEvent[] = [];
  for (const event of supportByInstance.get(instanceId) ?? []) {
    if (event.tick < cutoff) continue;
    retainedEvents.push(event);
    if (contributorIds.has(event.targetPlayerId)) support.add(event.supporterPlayerId);
  }
  if (retainedEvents.length > 0) supportByInstance.set(instanceId, retainedEvents);
  else supportByInstance.delete(instanceId);
  const eligible: Array<{ playerId: string; player: any }> = [];
  for (const member of snapshot.members) {
    const player = getPlayer(member.playerId);
    if (!player || player.instanceId !== instanceId || Number(player.hp) <= 0) continue;
    const distance = Math.max(
      Math.abs(Math.trunc(Number(player.x) || 0) - Math.trunc(Number(monster?.x) || 0)),
      Math.abs(Math.trunc(Number(player.y) || 0) - Math.trunc(Number(monster?.y) || 0)),
    );
    if (distance > PARTY_REWARD_RANGE) continue;
    if ((damageByPlayer.get(member.playerId) ?? 0) <= 0 && !support.has(member.playerId)) continue;
    eligible.push({ playerId: member.playerId, player });
  }
  return eligible;
}

function supportKey(instanceId: string, monsterRuntimeId: string): string {
  return `${instanceId}\n${monsterRuntimeId}`;
}

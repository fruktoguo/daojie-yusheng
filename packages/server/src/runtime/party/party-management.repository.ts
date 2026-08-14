import { Injectable } from '@nestjs/common';
import type { PartyExpMode, PartyLootMode } from '@mud/shared';
import { PartyDatabaseService, lockPartyPlayers, writePartyAudit } from './party-database.service';
import { loadPartyByPlayerFrom, loadPartyFrom } from './party-persistence.helpers';
import type { PartyMutationResult } from './party-runtime.types';

@Injectable()
export class PartyManagementRepository {
  constructor(private readonly database: PartyDatabaseService) {}

  async leave(playerId: string): Promise<PartyMutationResult> {
    if (!this.database.isEnabled()) return { ok: false, reason: 'party_persistence_disabled' };
    return this.database.transaction(async (client) => {
      await lockPartyPlayers(client, [playerId]);
      const party = await loadPartyByPlayerFrom(client, playerId, true);
      if (!party) return { ok: true, affectedPlayerIds: [playerId], removedPlayerIds: [playerId] };
      if (party.leaderPlayerId === playerId && party.members.length > 1) return { ok: false, reason: 'leader_transfer_required' };
      if (party.members.length === 1) {
        return disbandLocked(client, party.partyId, party.members.map((member) => member.playerId), playerId, 'last_member_leave');
      }
      const now = Date.now();
      await client.query('DELETE FROM player_party_member WHERE player_id = $1 AND party_id = $2', [playerId, party.partyId]);
      await client.query('UPDATE player_party SET revision = revision + 1, updated_at_ms = $2 WHERE party_id = $1', [party.partyId, now]);
      await writePartyAudit(client, {
        partyId: party.partyId,
        operation: 'leave',
        actorPlayerId: playerId,
        source: 'manual',
        partyRevision: party.revision + 1,
        createdAt: now,
      });
      return {
        ok: true,
        partyId: party.partyId,
        affectedPlayerIds: party.members.map((member) => member.playerId),
        removedPlayerIds: [playerId],
        revision: party.revision + 1,
      };
    });
  }

  async removeMember(actorId: string, targetId: string): Promise<PartyMutationResult> {
    if (!this.database.isEnabled()) return { ok: false, reason: 'party_persistence_disabled' };
    return this.database.transaction(async (client) => {
      await lockPartyPlayers(client, [actorId, targetId]);
      const party = await loadPartyByPlayerFrom(client, actorId, true);
      if (!party || party.leaderPlayerId !== actorId) return { ok: false, reason: 'leader_required' };
      if (targetId === actorId) return { ok: false, reason: 'invalid_target' };
      if (!party.members.some((member) => member.playerId === targetId)) {
        return { ok: true, partyId: party.partyId, affectedPlayerIds: [actorId, targetId], revision: party.revision };
      }
      const now = Date.now();
      await client.query('DELETE FROM player_party_member WHERE player_id = $1 AND party_id = $2', [targetId, party.partyId]);
      await client.query('UPDATE player_party SET revision = revision + 1, updated_at_ms = $2 WHERE party_id = $1', [party.partyId, now]);
      await writePartyAudit(client, {
        partyId: party.partyId,
        operation: 'remove_member',
        actorPlayerId: actorId,
        targetPlayerId: targetId,
        source: 'manual',
        partyRevision: party.revision + 1,
        createdAt: now,
      });
      return { ok: true, partyId: party.partyId, affectedPlayerIds: party.members.map((member) => member.playerId), removedPlayerIds: [targetId], revision: party.revision + 1 };
    });
  }

  async transferLeader(actorId: string, targetId: string): Promise<PartyMutationResult> {
    if (!this.database.isEnabled()) return { ok: false, reason: 'party_persistence_disabled' };
    return this.database.transaction(async (client) => {
      await lockPartyPlayers(client, [actorId, targetId]);
      const party = await loadPartyByPlayerFrom(client, actorId, true);
      if (!party) return { ok: false, reason: 'party_not_found' };
      if (party.leaderPlayerId === targetId) return { ok: true, partyId: party.partyId, affectedPlayerIds: party.members.map((member) => member.playerId), revision: party.revision };
      if (party.leaderPlayerId !== actorId) return { ok: false, reason: 'leader_required' };
      if (targetId === actorId || !party.members.some((member) => member.playerId === targetId)) return { ok: false, reason: 'member_not_found' };
      const now = Date.now();
      await client.query("UPDATE player_party_member SET role = CASE WHEN player_id = $2 THEN 'leader' ELSE 'member' END WHERE party_id = $1", [party.partyId, targetId]);
      await client.query('UPDATE player_party SET leader_player_id = $2, revision = revision + 1, updated_at_ms = $3 WHERE party_id = $1', [party.partyId, targetId, now]);
      await writePartyAudit(client, {
        partyId: party.partyId,
        operation: 'transfer_leader',
        actorPlayerId: actorId,
        targetPlayerId: targetId,
        source: 'manual',
        partyRevision: party.revision + 1,
        createdAt: now,
      });
      return { ok: true, partyId: party.partyId, affectedPlayerIds: party.members.map((member) => member.playerId), revision: party.revision + 1 };
    });
  }

  async disband(actorId: string): Promise<PartyMutationResult> {
    if (!this.database.isEnabled()) return { ok: false, reason: 'party_persistence_disabled' };
    return this.database.transaction(async (client) => {
      const party = await loadPartyByPlayerFrom(client, actorId, true);
      if (!party) return { ok: true, affectedPlayerIds: [actorId], removedPlayerIds: [actorId] };
      if (party.leaderPlayerId !== actorId) return { ok: false, reason: 'leader_required' };
      return disbandLocked(client, party.partyId, party.members.map((member) => member.playerId), actorId, 'manual');
    });
  }

  async updateSettings(
    actorId: string,
    expectedRevision: number,
    patch: { expMode?: PartyExpMode; lootMode?: PartyLootMode; friendlyFireEnabled?: boolean },
  ): Promise<PartyMutationResult> {
    if (!this.database.isEnabled()) return { ok: false, reason: 'party_persistence_disabled' };
    return this.database.transaction(async (client) => {
      const party = await loadPartyByPlayerFrom(client, actorId, true);
      if (!party || party.leaderPlayerId !== actorId) return { ok: false, reason: 'leader_required' };
      const nextExpMode = patch.expMode ?? party.expMode;
      const nextLootMode = patch.lootMode ?? party.lootMode;
      const nextFriendlyFire = patch.friendlyFireEnabled ?? party.friendlyFireEnabled;
      const sameAsCurrent = nextExpMode === party.expMode
        && nextLootMode === party.lootMode
        && nextFriendlyFire === party.friendlyFireEnabled;
      if (party.settingsRevision !== expectedRevision) {
        if (sameAsCurrent && expectedRevision === party.settingsRevision - 1) {
          return { ok: true, partyId: party.partyId, affectedPlayerIds: party.members.map((member) => member.playerId), revision: party.revision, settingsRevision: party.settingsRevision };
        }
        return { ok: false, reason: 'revision_conflict', partyId: party.partyId, settingsRevision: party.settingsRevision };
      }
      const now = Date.now();
      await client.query(
        `UPDATE player_party SET exp_mode = $2, loot_mode = $3, friendly_fire_enabled = $4,
          settings_revision = settings_revision + 1, revision = revision + 1, updated_at_ms = $5 WHERE party_id = $1`,
        [party.partyId, nextExpMode, nextLootMode, nextFriendlyFire, now],
      );
      await writePartyAudit(client, {
        partyId: party.partyId,
        operation: 'update_settings',
        actorPlayerId: actorId,
        source: 'manual',
        partyRevision: party.revision + 1,
        details: {
          expMode: nextExpMode,
          lootMode: nextLootMode,
          friendlyFireEnabled: nextFriendlyFire,
          settingsRevision: party.settingsRevision + 1,
        },
        createdAt: now,
      });
      return { ok: true, partyId: party.partyId, affectedPlayerIds: party.members.map((member) => member.playerId), revision: party.revision + 1, settingsRevision: party.settingsRevision + 1 };
    });
  }

  async advanceLootCursor(partyId: string, targetCursor: number): Promise<void> {
    const pool = this.database.getPool();
    if (!pool || targetCursor <= 0) return;
    await pool.query(
      'UPDATE player_party SET loot_cursor = GREATEST(loot_cursor, $2), updated_at_ms = $3 WHERE party_id = $1',
      [partyId, targetCursor, Date.now()],
    );
  }

  async refreshMemberProfile(playerId: string, playerNo: number | undefined, name: string, realmLv: number): Promise<void> {
    const pool = this.database.getPool();
    if (!pool) return;
    await pool.query('UPDATE player_party_member SET player_no = $2, player_name = $3, realm_lv = $4 WHERE player_id = $1', [playerId, playerNo ?? null, name, realmLv]);
  }
}

async function disbandLocked(
  client: any,
  partyId: string,
  memberIds: string[],
  actorPlayerId: string,
  source: 'manual' | 'last_member_leave',
): Promise<PartyMutationResult> {
  const now = Date.now();
  await writePartyAudit(client, {
    partyId,
    operation: 'disband',
    actorPlayerId,
    source,
    details: { memberCount: memberIds.length },
    createdAt: now,
  });
  await client.query('DELETE FROM player_party_invite WHERE party_id = $1', [partyId]);
  await client.query('DELETE FROM player_party_application WHERE party_id = $1', [partyId]);
  await client.query('DELETE FROM player_party_recruitment WHERE party_id = $1', [partyId]);
  await client.query('DELETE FROM player_party_member WHERE party_id = $1', [partyId]);
  await client.query('DELETE FROM player_party WHERE party_id = $1', [partyId]);
  return { ok: true, partyId, affectedPlayerIds: memberIds, removedPlayerIds: memberIds };
}

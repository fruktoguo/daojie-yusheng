import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PARTY_INVITE_TTL_MS, PARTY_MAX_MEMBERS } from '@mud/shared';
import { PartyDatabaseService, lockPartyPlayer, writePartyAudit } from './party-database.service';
import { loadPartyByPlayerFrom, loadPartyFrom } from './party-persistence.helpers';
import type { PartyMemberProfile, PartyMutationResult, PartyRecord } from './party-runtime.types';

@Injectable()
export class PartyMembershipRepository {
  constructor(private readonly database: PartyDatabaseService) {}

  async getPartyByPlayer(playerId: string): Promise<PartyRecord | null> {
    const pool = this.database.getPool();
    return pool ? loadPartyByPlayerFrom(pool, playerId) : null;
  }

  async getParty(partyId: string): Promise<PartyRecord | null> {
    const pool = this.database.getPool();
    return pool ? loadPartyFrom(pool, partyId) : null;
  }

  async createParty(profile: PartyMemberProfile, source: 'manual' | 'match' = 'manual'): Promise<PartyMutationResult> {
    if (!this.database.isEnabled()) return { ok: false, reason: 'party_persistence_disabled' };
    return this.database.transaction(async (client) => {
      await lockPartyPlayer(client, profile.playerId);
      const existing = await loadPartyByPlayerFrom(client, profile.playerId, true);
      if (existing) return { ok: false, reason: 'already_in_party', partyId: existing.partyId };
      const now = Date.now();
      const partyId = randomUUID();
      await client.query(
        `INSERT INTO player_party (party_id, leader_player_id, created_at_ms, updated_at_ms)
         VALUES ($1, $2, $3, $3)`,
        [partyId, profile.playerId, now],
      );
      await insertMember(client, partyId, profile, 'leader', now);
      await writePartyAudit(client, {
        partyId,
        operation: 'create',
        actorPlayerId: profile.playerId,
        source,
        partyRevision: 1,
        createdAt: now,
      });
      return { ok: true, partyId, affectedPlayerIds: [profile.playerId], revision: 1, settingsRevision: 1 };
    });
  }

  async createInvite(fromPlayerId: string, targetPlayerId: string): Promise<{ ok: boolean; reason?: string; inviteId?: string; partyId?: string }> {
    if (!this.database.isEnabled()) return { ok: false, reason: 'party_persistence_disabled' };
    return this.database.transaction(async (client) => {
      await lockPartyPlayer(client, targetPlayerId);
      const party = await loadPartyByPlayerFrom(client, fromPlayerId, true);
      if (!party || party.leaderPlayerId !== fromPlayerId) return { ok: false, reason: 'leader_required' };
      if (party.members.length >= PARTY_MAX_MEMBERS) return { ok: false, reason: 'party_full' };
      if (await loadPartyByPlayerFrom(client, targetPlayerId, true)) return { ok: false, reason: 'target_already_in_party' };
      const now = Date.now();
      const pending = await client.query(
        `SELECT invite_id FROM player_party_invite
          WHERE party_id = $1 AND to_player_id = $2 AND status = 'pending' AND expires_at_ms > $3
          ORDER BY created_at_ms DESC LIMIT 1 FOR UPDATE`,
        [party.partyId, targetPlayerId, now],
      );
      if (pending.rows?.[0]) return { ok: false, reason: 'invite_duplicated', inviteId: pending.rows[0].invite_id, partyId: party.partyId };
      const inviteId = randomUUID();
      await client.query(
        `INSERT INTO player_party_invite
          (invite_id, party_id, from_player_id, to_player_id, status, created_at_ms, expires_at_ms, updated_at_ms)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6, $5)`,
        [inviteId, party.partyId, fromPlayerId, targetPlayerId, now, now + PARTY_INVITE_TTL_MS],
      );
      return { ok: true, inviteId, partyId: party.partyId };
    });
  }

  async respondInvite(profile: PartyMemberProfile, inviteId: string, accept: boolean): Promise<PartyMutationResult> {
    if (!this.database.isEnabled()) return { ok: false, reason: 'party_persistence_disabled' };
    return this.database.transaction(async (client) => {
      await lockPartyPlayer(client, profile.playerId);
      const loaded = await client.query('SELECT * FROM player_party_invite WHERE invite_id = $1 FOR UPDATE', [inviteId]);
      const invite = loaded.rows?.[0];
      const now = Date.now();
      if (!invite || invite.to_player_id !== profile.playerId || invite.expires_at_ms <= now) {
        return { ok: false, reason: 'invite_not_found' };
      }
      if (invite.status !== 'pending') {
        const existing = await loadPartyByPlayerFrom(client, profile.playerId, true);
        return invite.status === 'accepted' && existing?.partyId === invite.party_id
          ? { ok: true, partyId: existing.partyId, affectedPlayerIds: existing.members.map((member) => member.playerId) }
          : { ok: false, reason: 'invite_closed' };
      }
      if (!accept) {
        await client.query("UPDATE player_party_invite SET status = 'rejected', updated_at_ms = $2 WHERE invite_id = $1", [inviteId, now]);
        return { ok: true, affectedPlayerIds: [profile.playerId] };
      }
      const existing = await loadPartyByPlayerFrom(client, profile.playerId, true);
      if (existing) return { ok: false, reason: 'already_in_party', partyId: existing.partyId };
      const party = await loadPartyFrom(client, invite.party_id, true);
      if (!party) return { ok: false, reason: 'party_not_found' };
      if (party.members.length >= PARTY_MAX_MEMBERS) return { ok: false, reason: 'party_full' };
      await insertMember(client, party.partyId, profile, 'member', now);
      await client.query("UPDATE player_party_invite SET status = 'accepted', updated_at_ms = $2 WHERE invite_id = $1", [inviteId, now]);
      await closePlayerAdmissions(client, profile.playerId, now);
      await client.query('UPDATE player_party SET revision = revision + 1, updated_at_ms = $2 WHERE party_id = $1', [party.partyId, now]);
      await writePartyAudit(client, {
        partyId: party.partyId,
        operation: 'join',
        actorPlayerId: profile.playerId,
        targetPlayerId: invite.from_player_id,
        source: 'invite',
        partyRevision: party.revision + 1,
        details: { inviteId },
        createdAt: now,
      });
      return {
        ok: true,
        partyId: party.partyId,
        affectedPlayerIds: [...party.members.map((member) => member.playerId), profile.playerId],
        revision: party.revision + 1,
      };
    });
  }

  async addMatchedMember(partyId: string, profile: PartyMemberProfile): Promise<PartyMutationResult> {
    if (!this.database.isEnabled()) return { ok: false, reason: 'party_persistence_disabled' };
    return this.database.transaction(async (client) => {
      await lockPartyPlayer(client, profile.playerId);
      if (await loadPartyByPlayerFrom(client, profile.playerId, true)) return { ok: false, reason: 'already_in_party' };
      const party = await loadPartyFrom(client, partyId, true);
      if (!party || party.members.length >= PARTY_MAX_MEMBERS) return { ok: false, reason: party ? 'party_full' : 'party_not_found' };
      const now = Date.now();
      await insertMember(client, partyId, profile, 'member', now);
      await closePlayerAdmissions(client, profile.playerId, now);
      await client.query('UPDATE player_party SET revision = revision + 1, updated_at_ms = $2 WHERE party_id = $1', [partyId, now]);
      await writePartyAudit(client, {
        partyId,
        operation: 'join',
        actorPlayerId: profile.playerId,
        source: 'match',
        partyRevision: party.revision + 1,
        createdAt: now,
      });
      return { ok: true, partyId, affectedPlayerIds: [...party.members.map((member) => member.playerId), profile.playerId], revision: party.revision + 1 };
    });
  }
}

async function insertMember(client: any, partyId: string, profile: PartyMemberProfile, role: 'leader' | 'member', joinedAt: number): Promise<void> {
  await client.query(
    `INSERT INTO player_party_member (player_id, party_id, role, player_no, player_name, realm_lv, joined_at_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [profile.playerId, partyId, role, profile.playerNo ?? null, profile.name, profile.realmLv, joinedAt],
  );
}

async function closePlayerAdmissions(client: any, playerId: string, now: number): Promise<void> {
  await client.query("UPDATE player_party_invite SET status = 'closed', updated_at_ms = $2 WHERE to_player_id = $1 AND status = 'pending'", [playerId, now]);
  await client.query("UPDATE player_party_application SET status = 'closed', updated_at_ms = $2 WHERE player_id = $1 AND status = 'pending'", [playerId, now]);
}

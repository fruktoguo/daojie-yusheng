import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PARTY_MAX_MEMBERS, PARTY_RECRUITMENT_TTL_MS, type PartyPurpose } from '@mud/shared';
import { PartyDatabaseService, lockPartyPlayer } from './party-database.service';
import { loadPartyByPlayerFrom, loadPartyFrom } from './party-persistence.helpers';
import { rowToRecruitment } from './party-invite-query.repository';
import type {
  PartyApplicationRecord,
  PartyMemberProfile,
  PartyMutationResult,
  PartyRecruitmentRecord,
} from './party-runtime.types';

@Injectable()
export class PartyRecruitmentRepository {
  constructor(private readonly database: PartyDatabaseService) {}

  async publish(
    actorId: string,
    expectedRevision: number,
    input: { purpose: PartyPurpose; minRealmLv: number; maxRealmLv: number; note: string },
  ): Promise<PartyMutationResult> {
    if (!this.database.isEnabled()) return { ok: false, reason: 'party_persistence_disabled' };
    return this.database.transaction(async (client) => {
      const party = await loadPartyByPlayerFrom(client, actorId, true);
      if (!party || party.leaderPlayerId !== actorId) return { ok: false, reason: 'leader_required' };
      if (party.revision !== expectedRevision) return { ok: false, reason: 'revision_conflict', partyId: party.partyId, revision: party.revision };
      if (party.members.length >= PARTY_MAX_MEMBERS) return { ok: false, reason: 'party_full' };
      const now = Date.now();
      const listingId = randomUUID();
      await client.query(
        `INSERT INTO player_party_recruitment
          (listing_id, party_id, leader_player_id, purpose, min_realm_lv, max_realm_lv, note, created_at_ms, expires_at_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (party_id) DO UPDATE SET listing_id = EXCLUDED.listing_id,
           leader_player_id = EXCLUDED.leader_player_id, purpose = EXCLUDED.purpose,
           min_realm_lv = EXCLUDED.min_realm_lv, max_realm_lv = EXCLUDED.max_realm_lv,
           note = EXCLUDED.note, created_at_ms = EXCLUDED.created_at_ms, expires_at_ms = EXCLUDED.expires_at_ms`,
        [listingId, party.partyId, actorId, input.purpose, input.minRealmLv, input.maxRealmLv, input.note, now, now + PARTY_RECRUITMENT_TTL_MS],
      );
      await client.query('UPDATE player_party SET revision = revision + 1, updated_at_ms = $2 WHERE party_id = $1', [party.partyId, now]);
      return { ok: true, partyId: party.partyId, affectedPlayerIds: party.members.map((member) => member.playerId), revision: party.revision + 1 };
    });
  }

  async close(actorId: string, expectedRevision: number): Promise<PartyMutationResult> {
    if (!this.database.isEnabled()) return { ok: false, reason: 'party_persistence_disabled' };
    return this.database.transaction(async (client) => {
      const party = await loadPartyByPlayerFrom(client, actorId, true);
      if (!party || party.leaderPlayerId !== actorId) return { ok: false, reason: 'leader_required' };
      if (party.revision !== expectedRevision) return { ok: false, reason: 'revision_conflict', partyId: party.partyId, revision: party.revision };
      await client.query('DELETE FROM player_party_recruitment WHERE party_id = $1', [party.partyId]);
      await client.query('UPDATE player_party SET revision = revision + 1, updated_at_ms = $2 WHERE party_id = $1', [party.partyId, Date.now()]);
      return { ok: true, partyId: party.partyId, affectedPlayerIds: party.members.map((member) => member.playerId), revision: party.revision + 1 };
    });
  }

  async listActive(purpose?: PartyPurpose): Promise<PartyRecruitmentRecord[]> {
    const pool = this.database.getPool();
    if (!pool) return [];
    const result = await pool.query(
      `SELECT r.listing_id, r.party_id, r.leader_player_id, r.purpose, r.min_realm_lv, r.max_realm_lv,
              r.note, r.created_at_ms, r.expires_at_ms, leader.player_name AS leader_name,
              (SELECT COUNT(*) FROM player_party_member count_member WHERE count_member.party_id = r.party_id) AS member_count
         FROM player_party_recruitment r
         LEFT JOIN player_party_member leader ON leader.player_id = r.leader_player_id
        WHERE r.expires_at_ms > $1 AND ($2::varchar IS NULL OR r.purpose = $2)
          AND (SELECT COUNT(*) FROM player_party_member active_member WHERE active_member.party_id = r.party_id) < $3
        ORDER BY r.created_at_ms DESC LIMIT 200`,
      [Date.now(), purpose ?? null, PARTY_MAX_MEMBERS],
    );
    return (result.rows ?? []).map(rowToRecruitment);
  }

  async apply(profile: PartyMemberProfile, listingId: string): Promise<{ ok: boolean; reason?: string; partyId?: string; leaderPlayerId?: string }> {
    if (!this.database.isEnabled()) return { ok: false, reason: 'party_persistence_disabled' };
    return this.database.transaction(async (client) => {
      await lockPartyPlayer(client, profile.playerId);
      if (await loadPartyByPlayerFrom(client, profile.playerId, true)) return { ok: false, reason: 'already_in_party' };
      const listingResult = await client.query('SELECT * FROM player_party_recruitment WHERE listing_id = $1 FOR UPDATE', [listingId]);
      const listing = listingResult.rows?.[0];
      if (!listing || Number(listing.expires_at_ms) <= Date.now()) return { ok: false, reason: 'recruitment_not_found' };
      if (profile.realmLv < listing.min_realm_lv || profile.realmLv > listing.max_realm_lv) return { ok: false, reason: 'realm_out_of_range' };
      const party = await loadPartyFrom(client, listing.party_id, true);
      if (!party || party.members.length >= PARTY_MAX_MEMBERS) return { ok: false, reason: party ? 'party_full' : 'party_not_found' };
      const now = Date.now();
      const existing = await client.query(
        `SELECT application_id FROM player_party_application
          WHERE party_id = $1 AND player_id = $2 AND status = 'pending' AND expires_at_ms > $3 LIMIT 1`,
        [party.partyId, profile.playerId, now],
      );
      if (!existing.rows?.[0]) {
        await client.query(
          `INSERT INTO player_party_application
            (application_id, party_id, player_id, player_no, player_name, realm_lv, status, created_at_ms, expires_at_ms, updated_at_ms)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $7)`,
          [randomUUID(), party.partyId, profile.playerId, profile.playerNo ?? null, profile.name, profile.realmLv, now, Math.min(Number(listing.expires_at_ms), now + PARTY_RECRUITMENT_TTL_MS)],
        );
      }
      return { ok: true, partyId: party.partyId, leaderPlayerId: party.leaderPlayerId };
    });
  }

  async closeWhenFull(partyId: string): Promise<void> {
    const pool = this.database.getPool();
    if (!pool) return;
    await pool.query(
      `DELETE FROM player_party_recruitment WHERE party_id = $1
        AND (SELECT COUNT(*) FROM player_party_member WHERE party_id = $1) >= $2`,
      [partyId, PARTY_MAX_MEMBERS],
    );
  }

  async listApplications(partyId: string): Promise<PartyApplicationRecord[]> {
    const pool = this.database.getPool();
    if (!pool) return [];
    const result = await pool.query(
      `SELECT * FROM player_party_application
        WHERE party_id = $1 AND status = 'pending' AND expires_at_ms > $2
        ORDER BY created_at_ms ASC LIMIT 100`,
      [partyId, Date.now()],
    );
    return (result.rows ?? []).map((row) => ({
      applicationId: row.application_id,
      partyId: row.party_id,
      profile: {
        playerId: row.player_id,
        ...(Number.isFinite(Number(row.player_no)) ? { playerNo: Number(row.player_no) } : {}),
        name: String(row.player_name || row.player_id),
        realmLv: Math.max(1, Number(row.realm_lv) || 1),
      },
      createdAt: Number(row.created_at_ms) || 0,
      expiresAt: Number(row.expires_at_ms) || 0,
    }));
  }
}

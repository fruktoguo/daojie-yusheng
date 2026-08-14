import { Injectable } from '@nestjs/common';
import type { PartyInviteRecord } from './party-runtime.types';
import { PartyDatabaseService } from './party-database.service';

@Injectable()
export class PartyInviteQueryRepository {
  constructor(private readonly database: PartyDatabaseService) {}

  async listIncoming(playerId: string): Promise<PartyInviteRecord[]> {
    const pool = this.database.getPool();
    if (!pool) return [];
    const result = await pool.query(
      `SELECT invite_id, party_id, from_player_id, to_player_id, created_at_ms, expires_at_ms
         FROM player_party_invite
        WHERE to_player_id = $1 AND status = 'pending' AND expires_at_ms > $2
        ORDER BY created_at_ms DESC LIMIT 100`,
      [playerId, Date.now()],
    );
    return (result.rows ?? []).map((row) => ({
      inviteId: row.invite_id,
      partyId: row.party_id,
      fromPlayerId: row.from_player_id,
      toPlayerId: row.to_player_id,
      createdAt: Number(row.created_at_ms) || 0,
      expiresAt: Number(row.expires_at_ms) || 0,
    }));
  }
}

export function rowToRecruitment(row: any) {
  return {
    listingId: row.listing_id,
    partyId: row.party_id,
    leaderPlayerId: row.leader_player_id,
    ...(row.leader_name ? { leaderName: String(row.leader_name) } : {}),
    ...(Number.isFinite(Number(row.member_count)) ? { memberCount: Number(row.member_count) } : {}),
    purpose: row.purpose,
    minRealmLv: Math.max(1, Number(row.min_realm_lv) || 1),
    maxRealmLv: Math.max(1, Number(row.max_realm_lv) || 1),
    note: String(row.note || ''),
    createdAt: Number(row.created_at_ms) || 0,
    expiresAt: Number(row.expires_at_ms) || 0,
  };
}

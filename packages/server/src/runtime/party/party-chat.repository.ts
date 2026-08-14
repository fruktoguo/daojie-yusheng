import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ChatHistoryCursorView } from '@mud/shared';
import { PartyDatabaseService } from './party-database.service';
import type { PartyChatRecord, PartyMemberProfile } from './party-runtime.types';

@Injectable()
export class PartyChatRepository {
  constructor(private readonly database: PartyDatabaseService) {}

  async create(profile: PartyMemberProfile, text: string): Promise<{ ok: boolean; reason?: string; message?: PartyChatRecord }> {
    if (!this.database.isEnabled()) return { ok: false, reason: 'party_persistence_disabled' };
    return this.database.transaction(async (client) => {
      const membership = await client.query('SELECT party_id FROM player_party_member WHERE player_id = $1 FOR SHARE', [profile.playerId]);
      const partyId = membership.rows?.[0]?.party_id;
      if (!partyId) return { ok: false, reason: 'not_in_party' };
      const message: PartyChatRecord = {
        messageId: randomUUID(),
        partyId,
        fromPlayerId: profile.playerId,
        fromName: profile.name,
        text,
        sentAt: Date.now(),
      };
      await client.query(
        `INSERT INTO player_party_message
          (message_id, party_id, from_player_id, from_name, text, sent_at_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [message.messageId, message.partyId, message.fromPlayerId, message.fromName, message.text, message.sentAt],
      );
      return { ok: true, message };
    });
  }

  async history(
    playerId: string,
    cursor?: ChatHistoryCursorView,
  ): Promise<{ ok: boolean; reason?: string; partyId?: string; messages?: PartyChatRecord[] }> {
    const pool = this.database.getPool();
    if (!pool) return { ok: false, reason: 'party_persistence_disabled' };
    const membership = await pool.query('SELECT party_id FROM player_party_member WHERE player_id = $1', [playerId]);
    const partyId = membership.rows?.[0]?.party_id;
    if (!partyId) return { ok: false, reason: 'not_in_party' };
    const occurredAt = Math.max(0, Math.trunc(Number(cursor?.occurredAt) || 0));
    const messageId = typeof cursor?.messageId === 'string' ? cursor.messageId.slice(0, 160) : '';
    const result = await pool.query(
      `SELECT message_id, party_id, from_player_id, from_name, text, sent_at_ms
         FROM player_party_message
        WHERE party_id = $1 AND (sent_at_ms > $2 OR (sent_at_ms = $2 AND message_id > $3))
        ORDER BY sent_at_ms DESC, message_id DESC LIMIT 101`,
      [partyId, occurredAt, messageId],
    );
    return { ok: true, partyId, messages: (result.rows ?? []).slice(0, 100).reverse().map(rowToMessage) };
  }

  async prune(partyId: string): Promise<void> {
    const pool = this.database.getPool();
    if (!pool) return;
    await pool.query(
      `DELETE FROM player_party_message WHERE party_id = $1 AND message_id NOT IN (
         SELECT message_id FROM player_party_message WHERE party_id = $1
         ORDER BY sent_at_ms DESC, message_id DESC LIMIT 100
       )`,
      [partyId],
    );
  }
}

function rowToMessage(row: any): PartyChatRecord {
  return {
    messageId: row.message_id,
    partyId: row.party_id,
    fromPlayerId: row.from_player_id,
    fromName: String(row.from_name || row.from_player_id),
    text: String(row.text || ''),
    sentAt: Number(row.sent_at_ms) || 0,
  };
}

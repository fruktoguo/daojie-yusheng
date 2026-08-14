import { Injectable } from '@nestjs/common';
import { PARTY_MAX_MEMBERS } from '@mud/shared';
import { PartyDatabaseService, lockPartyPlayer, writePartyAudit } from './party-database.service';
import { loadPartyByPlayerFrom, loadPartyFrom } from './party-persistence.helpers';
import type { PartyMutationResult } from './party-runtime.types';

@Injectable()
export class PartyApplicationCommandRepository {
  constructor(private readonly database: PartyDatabaseService) {}

  async respond(actorId: string, applicationId: string, accept: boolean): Promise<PartyMutationResult> {
    if (!this.database.isEnabled()) return { ok: false, reason: 'party_persistence_disabled' };
    return this.database.transaction(async (client) => {
      const preview = await client.query('SELECT * FROM player_party_application WHERE application_id = $1', [applicationId]);
      const previewApplication = preview.rows?.[0];
      const now = Date.now();
      if (!previewApplication || previewApplication.status !== 'pending' || Number(previewApplication.expires_at_ms) <= now) {
        return { ok: false, reason: 'application_not_found' };
      }
      await lockPartyPlayer(client, previewApplication.player_id);
      const loaded = await client.query('SELECT * FROM player_party_application WHERE application_id = $1 FOR UPDATE', [applicationId]);
      const application = loaded.rows?.[0];
      if (!application || application.status !== 'pending' || Number(application.expires_at_ms) <= now) {
        return { ok: false, reason: 'application_not_found' };
      }
      const party = await loadPartyByPlayerFrom(client, actorId, true);
      if (!party || party.partyId !== application.party_id || party.leaderPlayerId !== actorId) return { ok: false, reason: 'leader_required' };
      if (!accept) {
        await client.query("UPDATE player_party_application SET status = 'rejected', updated_at_ms = $2 WHERE application_id = $1", [applicationId, now]);
        return { ok: true, partyId: party.partyId, affectedPlayerIds: [actorId, application.player_id] };
      }
      if (await loadPartyByPlayerFrom(client, application.player_id, true)) return { ok: false, reason: 'target_already_in_party' };
      const lockedParty = await loadPartyFrom(client, party.partyId, true);
      if (!lockedParty || lockedParty.members.length >= PARTY_MAX_MEMBERS) return { ok: false, reason: 'party_full' };
      await client.query(
        `INSERT INTO player_party_member (player_id, party_id, role, player_no, player_name, realm_lv, joined_at_ms)
         VALUES ($1, $2, 'member', $3, $4, $5, $6)`,
        [application.player_id, party.partyId, application.player_no, application.player_name, application.realm_lv, now],
      );
      await client.query("UPDATE player_party_application SET status = 'accepted', updated_at_ms = $2 WHERE application_id = $1", [applicationId, now]);
      await client.query("UPDATE player_party_application SET status = 'closed', updated_at_ms = $2 WHERE player_id = $1 AND status = 'pending'", [application.player_id, now]);
      await client.query("UPDATE player_party_invite SET status = 'closed', updated_at_ms = $2 WHERE to_player_id = $1 AND status = 'pending'", [application.player_id, now]);
      await client.query('UPDATE player_party SET revision = revision + 1, updated_at_ms = $2 WHERE party_id = $1', [party.partyId, now]);
      await writePartyAudit(client, {
        partyId: party.partyId,
        operation: 'join',
        actorPlayerId: application.player_id,
        targetPlayerId: actorId,
        source: 'recruitment',
        partyRevision: party.revision + 1,
        details: { applicationId },
        createdAt: now,
      });
      return {
        ok: true,
        partyId: party.partyId,
        affectedPlayerIds: [...party.members.map((member) => member.playerId), application.player_id],
        revision: party.revision + 1,
      };
    });
  }
}

import type { PartyRecord, QueryClient } from './party-runtime.types';

export async function loadPartyByPlayerFrom(
  client: QueryClient,
  playerId: string,
  forUpdate = false,
): Promise<PartyRecord | null> {
  const membership = await client.query(
    `SELECT party_id FROM player_party_member WHERE player_id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [playerId],
  );
  const partyId = membership.rows?.[0]?.party_id;
  return partyId ? loadPartyFrom(client, partyId, forUpdate) : null;
}

export async function loadPartyFrom(
  client: QueryClient,
  partyId: string,
  forUpdate = false,
): Promise<PartyRecord | null> {
  const partyResult = await client.query(
    `SELECT party_id, leader_player_id, exp_mode, loot_mode, friendly_fire_enabled,
            settings_revision, revision, loot_cursor, created_at_ms
       FROM player_party WHERE party_id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [partyId],
  );
  const row = partyResult.rows?.[0];
  if (!row) return null;
  const membersResult = await client.query(
    `SELECT player_id, party_id, role, player_no, player_name, realm_lv, joined_at_ms
       FROM player_party_member WHERE party_id = $1
       ORDER BY joined_at_ms ASC, player_id ASC`,
    [partyId],
  );
  return {
    partyId: row.party_id,
    leaderPlayerId: row.leader_player_id,
    expMode: row.exp_mode === 'equal' ? 'equal' : 'contribution',
    lootMode: row.loot_mode === 'round_robin' ? 'round_robin' : 'killer',
    friendlyFireEnabled: row.friendly_fire_enabled === true,
    settingsRevision: Math.max(1, Number(row.settings_revision) || 1),
    revision: Math.max(1, Number(row.revision) || 1),
    lootCursor: Math.max(0, Number(row.loot_cursor) || 0),
    createdAt: Math.max(0, Number(row.created_at_ms) || 0),
    members: (membersResult.rows ?? []).map((member) => ({
      partyId: member.party_id,
      playerId: member.player_id,
      ...(Number.isFinite(Number(member.player_no)) ? { playerNo: Number(member.player_no) } : {}),
      name: String(member.player_name || member.player_id),
      realmLv: Math.max(1, Number(member.realm_lv) || 1),
      role: member.role === 'leader' ? 'leader' : 'member',
      joinedAt: Math.max(0, Number(member.joined_at_ms) || 0),
    })),
  };
}

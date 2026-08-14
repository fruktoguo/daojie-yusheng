import type { PartyPool } from './party-runtime.types';

export async function ensurePartyTables(pool: PartyPool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS player_party (
      party_id varchar(160) PRIMARY KEY,
      leader_player_id varchar(100) NOT NULL,
      exp_mode varchar(24) NOT NULL DEFAULT 'contribution',
      loot_mode varchar(24) NOT NULL DEFAULT 'killer',
      friendly_fire_enabled boolean NOT NULL DEFAULT false,
      settings_revision integer NOT NULL DEFAULT 1,
      revision bigint NOT NULL DEFAULT 1,
      loot_cursor bigint NOT NULL DEFAULT 0,
      created_at_ms bigint NOT NULL,
      updated_at_ms bigint NOT NULL
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS player_party_member (
      player_id varchar(100) PRIMARY KEY,
      party_id varchar(160) NOT NULL,
      role varchar(16) NOT NULL,
      player_no bigint,
      player_name varchar(120) NOT NULL,
      realm_lv integer NOT NULL DEFAULT 1,
      joined_at_ms bigint NOT NULL
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS player_party_member_party_idx ON player_party_member(party_id, joined_at_ms, player_id)');
    await client.query(`CREATE TABLE IF NOT EXISTS player_party_invite (
      invite_id varchar(160) PRIMARY KEY,
      party_id varchar(160) NOT NULL,
      from_player_id varchar(100) NOT NULL,
      to_player_id varchar(100) NOT NULL,
      status varchar(24) NOT NULL,
      created_at_ms bigint NOT NULL,
      expires_at_ms bigint NOT NULL,
      updated_at_ms bigint NOT NULL
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS player_party_invite_target_idx ON player_party_invite(to_player_id, status, expires_at_ms DESC)');
    await client.query(`CREATE TABLE IF NOT EXISTS player_party_recruitment (
      listing_id varchar(160) PRIMARY KEY,
      party_id varchar(160) NOT NULL UNIQUE,
      leader_player_id varchar(100) NOT NULL,
      purpose varchar(24) NOT NULL,
      min_realm_lv integer NOT NULL,
      max_realm_lv integer NOT NULL,
      note varchar(600) NOT NULL,
      created_at_ms bigint NOT NULL,
      expires_at_ms bigint NOT NULL
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS player_party_recruitment_active_idx ON player_party_recruitment(expires_at_ms DESC, purpose)');
    await client.query(`CREATE TABLE IF NOT EXISTS player_party_application (
      application_id varchar(160) PRIMARY KEY,
      party_id varchar(160) NOT NULL,
      player_id varchar(100) NOT NULL,
      player_no bigint,
      player_name varchar(120) NOT NULL,
      realm_lv integer NOT NULL,
      status varchar(24) NOT NULL,
      created_at_ms bigint NOT NULL,
      expires_at_ms bigint NOT NULL,
      updated_at_ms bigint NOT NULL
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS player_party_application_party_idx ON player_party_application(party_id, status, expires_at_ms DESC)');
    await client.query(`CREATE TABLE IF NOT EXISTS player_party_message (
      message_id varchar(160) PRIMARY KEY,
      party_id varchar(160) NOT NULL,
      from_player_id varchar(100) NOT NULL,
      from_name varchar(120) NOT NULL,
      text varchar(600) NOT NULL,
      sent_at_ms bigint NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS player_party_message_history_idx ON player_party_message(party_id, sent_at_ms DESC, message_id DESC)');
    await client.query(`CREATE TABLE IF NOT EXISTS player_party_audit (
      audit_id varchar(160) PRIMARY KEY,
      party_id varchar(160) NOT NULL,
      operation varchar(48) NOT NULL,
      actor_player_id varchar(100) NOT NULL,
      target_player_id varchar(100),
      source varchar(32) NOT NULL,
      party_revision bigint,
      details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at_ms bigint NOT NULL
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS player_party_audit_party_idx ON player_party_audit(party_id, created_at_ms DESC, audit_id DESC)');
  } finally {
    client.release();
  }
}

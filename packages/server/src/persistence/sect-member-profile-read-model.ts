/**
 * 宗门成员低频展示读模型。
 *
 * 角色名以身份表为真源，境界以玩家属性分域为真源；调用方应批量读取并缓存，
 * 禁止把本查询放进 tick 或按成员逐条执行。
 */
import type { Pool } from 'pg';

export interface PersistedSectMemberProfile {
  playerId: string;
  playerName: string | null;
  displayName: string | null;
  username: string | null;
  realmLv: number | null;
}

interface SectMemberProfileRow {
  player_id?: unknown;
  player_name?: unknown;
  display_name?: unknown;
  username?: unknown;
  realm_payload?: unknown;
}

/** 一次查询批量补齐宗门成员角色名与境界。 */
export async function loadSectMemberProfiles(
  pool: Pick<Pool, 'query'> | null | undefined,
  playerIds: Iterable<string> | null | undefined,
): Promise<Map<string, PersistedSectMemberProfile>> {
  const normalizedPlayerIds = Array.from(new Set(Array.from(playerIds ?? [])
    .map(normalizeString)
    .filter((playerId) => playerId.length > 0)));
  if (!pool || normalizedPlayerIds.length === 0) {
    return new Map();
  }

  const result = await pool.query<SectMemberProfileRow>(
    `
      WITH requested(player_id) AS (
        SELECT DISTINCT unnest($1::varchar[])
      )
      SELECT
        requested.player_id,
        COALESCE(identity_main.player_name, identity_mirror.player_name) AS player_name,
        COALESCE(identity_main.display_name, identity_mirror.display_name) AS display_name,
        COALESCE(identity_main.username, identity_mirror.username) AS username,
        attr.realm_payload
      FROM requested
      LEFT JOIN server_player_identity identity_main
        ON identity_main.player_id = requested.player_id
      LEFT JOIN player_identity identity_mirror
        ON identity_mirror.player_id = requested.player_id
      LEFT JOIN player_attr_state attr
        ON attr.player_id = requested.player_id
    `,
    [normalizedPlayerIds],
  );

  const profiles = new Map<string, PersistedSectMemberProfile>();
  for (const row of result.rows ?? []) {
    const playerId = normalizeString(row.player_id);
    if (!playerId) {
      continue;
    }
    const realm = asRecord(decodeJsonValue(row.realm_payload));
    profiles.set(playerId, {
      playerId,
      playerName: normalizeNullableString(row.player_name),
      displayName: normalizeNullableString(row.display_name),
      username: normalizeNullableString(row.username),
      realmLv: normalizePositiveInteger(realm?.realmLv),
    });
  }
  return profiles;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableString(value: unknown): string | null {
  return normalizeString(value) || null;
}

function normalizePositiveInteger(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : null;
}

function decodeJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

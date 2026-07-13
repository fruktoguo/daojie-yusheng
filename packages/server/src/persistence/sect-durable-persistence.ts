/**
 * 宗门关键变更的跨域持久化边界。
 *
 * `server_sect`、玩家宗门归属与建宗/迁宗令所在背包必须在同一事务内提交，
 * 避免进程在分域 flush 之间退出后留下“宗门已建立但令牌仍在”或成员双重归属。
 */
import type { Pool, PoolClient } from 'pg';

import {
  savePlayerSnapshotProjectionDomainsWithClient,
  type PlayerSnapshotProjectionDomainWriteOptions,
} from './player-domain-persistence.service';
import type { PersistedPlayerSnapshot } from './player-persistence.service';
import { isTransientPostgresError } from './pg-error-utils';
import { SECT_CORE_CHAR, SECT_TEMPLATE_PREFIX } from '../constants/gameplay/sect';

export const SECT_TABLE = 'server_sect';
const PLAYER_SECT_MEMBERSHIP_TABLE = 'player_sect_membership';
const PLAYER_RECOVERY_WATERMARK_TABLE = 'player_recovery_watermark';
const INSTANCE_FORMATION_STATE_TABLE = 'instance_formation_state';
const PLAYER_LOCK_NAMESPACE = 7101;
const SECT_LOCK_NAMESPACE = 7104;
const FORMATION_LOCK_NAMESPACE = 7105;

export interface DurableSectSnapshot {
  sectId: string;
  name: string;
  mark: string;
  founderPlayerId: string;
  leaderPlayerId: string;
  status: string;
  entranceInstanceId: string;
  entranceTemplateId: string;
  entranceX: number;
  entranceY: number;
  sectInstanceId: string;
  sectTemplateId: string;
  createdAt: number;
  updatedAt: number;
  [key: string]: unknown;
}

export interface DurableSectWrite {
  expectedUpdatedAtMs: number | null;
  snapshot: DurableSectSnapshot | null;
  sectId: string;
}

export interface DurableSectPlayerProjectionWrite {
  playerId: string;
  snapshot: PersistedPlayerSnapshot;
  domains: string[];
  options?: PlayerSnapshotProjectionDomainWriteOptions;
  expectedRuntimeOwnerId?: string | null;
  expectedSessionEpoch?: number | null;
}

export interface DurableSectMembershipWrite {
  playerId: string;
  sectId: string | null;
  updatedAtMs: number;
}

export interface DurableSectFormationWrite {
  formationInstanceId: string;
  instanceId: string;
  removedAtMs?: number;
  snapshot: Record<string, unknown> | null;
}

export interface DurableFormationWriteFence {
  /** 新建阵法必须确认同 ID 行不存在，避免碰撞时扣除玩家资产。 */
  expectAbsent?: boolean;
  /** 更新阵法允许数据库暂时落后，但拒绝覆盖比运行态基线更新的行。 */
  expectedUpdatedAtMs?: number | null;
}

export interface PersistDurableSectMutationInput {
  sectWrites: DurableSectWrite[];
  playerProjectionWrites?: DurableSectPlayerProjectionWrite[];
  membershipWrites?: DurableSectMembershipWrite[];
  formationWrites?: DurableSectFormationWrite[];
}

export class SectDurableCommitOutcomeUnknownError extends Error {
  constructor(readonly cause: unknown) {
    super('sect_durable_commit_outcome_unknown');
  }
}

/** 尚未进入 COMMIT unknown 阶段时的正常关停取消，不得登记资产 fence。 */
export class SectDurableMutationStoppedError extends Error {
  constructor() {
    super('sect_durable_mutation_stopped');
  }
}

export interface SectCorePersistenceRepairReport {
  sectRowsUpdated: number;
  overlayRowsUpdated: number;
}

/** 启动期确保宗门真源表与查询索引存在。 */
export async function ensureSectTable(pool: Pick<Pool, 'connect'>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SECT_TABLE} (
        sect_id varchar(180) PRIMARY KEY,
        name varchar(120) NOT NULL,
        mark varchar(16) NOT NULL,
        founder_player_id varchar(100) NOT NULL,
        leader_player_id varchar(100) NOT NULL,
        status varchar(32) NOT NULL,
        entrance_instance_id varchar(180) NOT NULL,
        entrance_template_id varchar(120) NOT NULL,
        entrance_x bigint NOT NULL DEFAULT 0,
        entrance_y bigint NOT NULL DEFAULT 0,
        sect_instance_id varchar(180) NOT NULL,
        sect_template_id varchar(180) NOT NULL,
        created_at_ms bigint NOT NULL,
        updated_at_ms bigint NOT NULL,
        raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS server_sect_leader_idx
      ON ${SECT_TABLE}(leader_player_id, status)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS server_sect_template_idx
      ON ${SECT_TABLE}(sect_template_id)
    `);
  } finally {
    client.release();
  }
}

/** 把历史宗门核心坐标与传送门投影修复为当前契约。 */
export async function repairPersistedSectCoreState(
  pool: Pick<Pool, 'connect'>,
): Promise<SectCorePersistenceRepairReport> {
  const client = await pool.connect();
  let clientReleased = false;
  try {
    await client.query('BEGIN');
    const report = await repairPersistedSectCoreStateWithClient(client);
    await client.query('COMMIT');
    return report;
  } catch (error: unknown) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError: unknown) {
      client.release(true);
      clientReleased = true;
      throw new AggregateError(
        [error, rollbackError],
        'sect_core_persistence_repair_and_rollback_failed',
      );
    }
    throw error;
  } finally {
    if (!clientReleased) {
      client.release();
    }
  }
}

export async function repairPersistedSectCoreStateWithClient(
  client: Pick<PoolClient, 'query'>,
): Promise<SectCorePersistenceRepairReport> {
  const sectResult = await client.query(`
    WITH patched AS (
      SELECT
        sect_id,
        ('${SECT_TEMPLATE_PREFIX}' || sect_id) AS stable_template_id,
        jsonb_set(
          jsonb_set(
            jsonb_set(COALESCE(raw_payload, '{}'::jsonb), '{coreX}', '0'::jsonb, true),
            '{coreY}', '0'::jsonb,
            true
          ),
          '{sectTemplateId}',
          to_jsonb('${SECT_TEMPLATE_PREFIX}' || sect_id),
          true
        ) AS next_payload
      FROM ${SECT_TABLE}
    )
    UPDATE ${SECT_TABLE} target
    SET
      sect_template_id = patched.stable_template_id,
      raw_payload = patched.next_payload,
      updated_at = now()
    FROM patched
    WHERE target.sect_id = patched.sect_id
      AND (
        target.sect_template_id IS DISTINCT FROM patched.stable_template_id
        OR target.raw_payload IS DISTINCT FROM patched.next_payload
      )
  `);

  const overlayTableResult = await client.query("SELECT to_regclass('instance_overlay_chunk') AS table_name");
  if (!overlayTableResult.rows?.[0]?.table_name) {
    return { sectRowsUpdated: sectResult.rowCount ?? 0, overlayRowsUpdated: 0 };
  }

  const overlayResult = await client.query(`
    WITH canonical AS (
      SELECT
        sect_id,
        sect_instance_id AS instance_id,
        jsonb_build_object(
          'id', 'sect_core:0,0',
          'x', 0,
          'y', 0,
          'targetMapId', COALESCE(NULLIF(btrim(entrance_template_id), ''), NULLIF(btrim(raw_payload->>'entranceTemplateId'), ''), 'yunlai_town'),
          'targetInstanceId', COALESCE(NULLIF(btrim(entrance_instance_id), ''), NULLIF(btrim(raw_payload->>'entranceInstanceId'), ''), NULL),
          'targetX', entrance_x,
          'targetY', entrance_y,
          'direction', 'two_way',
          'kind', 'sect_core',
          'trigger', 'manual',
          'hidden', false,
          'name', name || '宗门核心',
          'char', '${SECT_CORE_CHAR}',
          'color', '#d8c37a',
          'sectId', sect_id
        ) AS portal
      FROM ${SECT_TABLE}
      WHERE COALESCE(status, 'active') <> 'dissolved'
        AND NULLIF(btrim(sect_instance_id), '') IS NOT NULL
    )
    INSERT INTO instance_overlay_chunk(
      instance_id,
      patch_kind,
      chunk_key,
      patch_version,
      patch_payload,
      updated_at
    )
    SELECT
      instance_id,
      'portal',
      'runtime_portals',
      1,
      jsonb_build_object('version', 1, 'portals', jsonb_build_array(portal)),
      now()
    FROM canonical
    ON CONFLICT (instance_id, patch_kind, chunk_key)
    DO UPDATE SET
      patch_version = instance_overlay_chunk.patch_version + 1,
      patch_payload = jsonb_build_object(
        'version',
        COALESCE((instance_overlay_chunk.patch_payload->>'version')::bigint, 1),
        'portals',
        COALESCE(
          (
            SELECT jsonb_agg(entry)
            FROM jsonb_array_elements(COALESCE(instance_overlay_chunk.patch_payload->'portals', '[]'::jsonb)) AS entry
            WHERE COALESCE(entry->>'sectId', '') <> (EXCLUDED.patch_payload->'portals'->0->>'sectId')
          ),
          '[]'::jsonb
        ) || (EXCLUDED.patch_payload->'portals')
      ),
      updated_at = now()
    WHERE EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(instance_overlay_chunk.patch_payload->'portals', '[]'::jsonb)) AS entry
      WHERE COALESCE(entry->>'sectId', '') = (EXCLUDED.patch_payload->'portals'->0->>'sectId')
        AND entry IS DISTINCT FROM (EXCLUDED.patch_payload->'portals'->0)
    )
    OR NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(instance_overlay_chunk.patch_payload->'portals', '[]'::jsonb)) AS entry
      WHERE entry = (EXCLUDED.patch_payload->'portals'->0)
    )
  `);

  return {
    sectRowsUpdated: sectResult.rowCount ?? 0,
    overlayRowsUpdated: overlayResult.rowCount ?? 0,
  };
}

export interface SettleDurableSectMutationOptions {
  /** 关停时允许调用方终止等待；正常运行必须持续到结果可判定。 */
  shouldContinue?: () => boolean;
  onReadbackError?: (error: unknown, attempt: number) => void;
  retryDelayMs?: number;
  stopSignal?: Promise<void>;
}

/**
 * 将 COMMIT 回包丢失收敛为确定结果。
 *
 * 调用方必须在整个等待期持有宗门与玩家资产锁，这样重试使用的投影不会被之后的运行态变更
 * 越过。事务未落地时只会幂等重试；事务已落地时通过完整后态回读直接返回。
 */
export async function persistDurableSectMutationUntilSettled(
  pool: Pick<Pool, 'connect'>,
  input: PersistDurableSectMutationInput,
  options: SettleDurableSectMutationOptions = {},
): Promise<void> {
  const retryDelayMs = Math.max(10, Math.min(5_000, Math.trunc(Number(options.retryDelayMs) || 250)));
  let unknownError: SectDurableCommitOutcomeUnknownError | null = null;
  let observedUnknownOutcome = false;
  let requiresReadback = false;
  let retryFailure: unknown = null;
  let readbackAttempt = 0;

  while (options.shouldContinue?.() !== false) {
    if (!requiresReadback) {
      try {
        await persistDurableSectMutation(pool, input);
        return;
      } catch (error: unknown) {
        if (error instanceof SectDurableCommitOutcomeUnknownError) {
          unknownError = error;
          observedUnknownOutcome = true;
          requiresReadback = true;
        } else if (observedUnknownOutcome && isTransientPostgresError(error)) {
          readbackAttempt += 1;
          options.onReadbackError?.(error, readbackAttempt);
          await waitForDurableSectReconciliation(retryDelayMs);
          continue;
        } else if (observedUnknownOutcome) {
          // 首次负回读与 COMMIT 可见性之间仍可能存在竞态。CAS、presence fence 或约束失败
          // 都必须先再做一次完整后态回读，确认原 COMMIT 未落地后才能作为普通失败抛出。
          retryFailure = error;
          requiresReadback = true;
        } else {
          throw error;
        }
      }
    }

    let applied = false;
    try {
      readbackAttempt += 1;
      applied = await waitForDurableSectReadbackOrStop(
        isDurableSectMutationApplied(pool, input),
        options.stopSignal,
      );
    } catch (error: unknown) {
      if (error instanceof SectDurableReconciliationStoppedError) {
        break;
      }
      options.onReadbackError?.(error, readbackAttempt);
      await waitForDurableSectReconciliation(retryDelayMs);
      continue;
    }
    if (applied) {
      return;
    }
    if (retryFailure) {
      throw retryFailure;
    }
    // 已确认旧事务未落地，下一轮可安全重试相同 CAS mutation。
    requiresReadback = false;

    await waitForDurableSectReconciliation(retryDelayMs);
  }

  if (!observedUnknownOutcome) {
    throw new SectDurableMutationStoppedError();
  }
  throw unknownError ?? new SectDurableCommitOutcomeUnknownError('sect_durable_reconciliation_stopped');
}

/** 在单一事务内提交宗门、背包与玩家宗门归属。 */
export async function persistDurableSectMutation(
  pool: Pick<Pool, 'connect'>,
  input: PersistDurableSectMutationInput,
): Promise<void> {
  const sectWrites = normalizeSectWrites(input.sectWrites);
  const playerProjectionWrites = normalizePlayerProjectionWrites(input.playerProjectionWrites ?? []);
  const projectedPlayerIds = new Set(playerProjectionWrites.map((write) => write.playerId));
  const membershipWrites = normalizeMembershipWrites(input.membershipWrites ?? [])
    .filter((write) => !projectedPlayerIds.has(write.playerId));
  const formationWrites = normalizeFormationWrites(input.formationWrites ?? []);
  const playerIds = Array.from(new Set([
    ...playerProjectionWrites.map((write) => write.playerId),
    ...membershipWrites.map((write) => write.playerId),
  ])).sort();

  if (sectWrites.length === 0 && playerIds.length === 0 && formationWrites.length === 0) {
    return;
  }

  const client = await pool.connect();
  let commitAttempted = false;
  let clientReleased = false;
  try {
    await client.query('BEGIN');
    for (const playerId of playerIds) {
      await client.query(
        'SELECT pg_advisory_xact_lock($1::integer, hashtext($2))',
        [PLAYER_LOCK_NAMESPACE, playerId],
      );
    }
    for (const write of sectWrites) {
      await client.query(
        'SELECT pg_advisory_xact_lock($1::integer, hashtext($2))',
        [SECT_LOCK_NAMESPACE, write.sectId],
      );
    }
    for (const write of formationWrites) {
      await client.query(
        'SELECT pg_advisory_xact_lock($1::integer, hashtext($2))',
        [FORMATION_LOCK_NAMESPACE, write.formationInstanceId],
      );
    }

    for (const write of playerProjectionWrites) {
      await assertPlayerPresenceFence(client, write);
    }
    for (const write of sectWrites) {
      await assertSectWriteFence(client, write);
    }
    for (const write of sectWrites) {
      if (write.snapshot) {
        await upsertSectSnapshotWithClient(client, write.snapshot);
      } else {
        await client.query(
          `DELETE FROM ${SECT_TABLE} WHERE sect_id = $1 AND updated_at_ms <= $2`,
          [write.sectId, normalizeTimestamp(write.expectedUpdatedAtMs, Date.now())],
        );
      }
    }
    for (const write of playerProjectionWrites) {
      await savePlayerSnapshotProjectionDomainsWithClient(
        client,
        write.playerId,
        write.snapshot,
        write.domains,
        write.options ?? {},
      );
    }
    for (const write of membershipWrites) {
      await replacePlayerSectMembershipWithClient(client, write);
    }
    for (const write of formationWrites) {
      await persistSectFormationWrite(client, write);
    }
    commitAttempted = true;
    await client.query('COMMIT');
    commitAttempted = false;
  } catch (error: unknown) {
    if (commitAttempted) {
      client.release(true);
      clientReleased = true;
      throw new SectDurableCommitOutcomeUnknownError(error);
    }
    try {
      await client.query('ROLLBACK');
    } catch {
      client.release(true);
      clientReleased = true;
    }
    throw error;
  } finally {
    if (!clientReleased) {
      client.release();
    }
  }
}

/** COMMIT 回包丢失后，从宗门版本、阵法位置和玩家水位确认事务是否已经整体可见。 */
export async function isDurableSectMutationApplied(
  pool: Pick<Pool, 'connect'>,
  input: PersistDurableSectMutationInput,
): Promise<boolean> {
  const sectWrites = normalizeSectWrites(input.sectWrites);
  const playerProjectionWrites = normalizePlayerProjectionWrites(input.playerProjectionWrites ?? []);
  const projectedPlayerIds = new Set(playerProjectionWrites.map((write) => write.playerId));
  const membershipWrites = normalizeMembershipWrites(input.membershipWrites ?? [])
    .filter((write) => !projectedPlayerIds.has(write.playerId));
  const formationWrites = normalizeFormationWrites(input.formationWrites ?? []);
  const client = await pool.connect();
  try {
    for (const write of sectWrites) {
      const result = await client.query<{ updated_at_ms: unknown }>(
        `SELECT updated_at_ms FROM ${SECT_TABLE} WHERE sect_id = $1`,
        [write.sectId],
      );
      if (!write.snapshot) {
        if ((result.rowCount ?? 0) > 0) {
          return false;
        }
        continue;
      }
      if (
        (result.rowCount ?? 0) === 0
        || normalizeTimestamp(result.rows[0]?.updated_at_ms, 0) !== normalizeTimestamp(write.snapshot.updatedAt, 0)
      ) {
        return false;
      }
    }
    for (const write of formationWrites) {
      const result = await client.query<{ instance_id: unknown; updated_at_ms: unknown }>(
        `SELECT instance_id, updated_at_ms FROM ${INSTANCE_FORMATION_STATE_TABLE} WHERE formation_instance_id = $1`,
        [write.formationInstanceId],
      );
      if (!write.snapshot) {
        if ((result.rowCount ?? 0) > 0) {
          return false;
        }
        continue;
      }
      if (
        (result.rowCount ?? 0) !== 1
        || normalizeRequiredString(result.rows[0]?.instance_id) !== write.instanceId
        || normalizeTimestamp(result.rows[0]?.updated_at_ms, 0) < normalizeTimestamp(write.snapshot.updatedAt, 0)
      ) {
        return false;
      }
    }
    for (const write of playerProjectionWrites) {
      const versionSeed = normalizeTimestamp(write.snapshot.savedAt, 0);
      const watermark = await client.query<{
        inventory_version: unknown;
        sect_membership_version: unknown;
      }>(
        `
          SELECT inventory_version, sect_membership_version
          FROM ${PLAYER_RECOVERY_WATERMARK_TABLE}
          WHERE player_id = $1
        `,
        [write.playerId],
      );
      if ((watermark.rowCount ?? 0) === 0) {
        return false;
      }
      const row = watermark.rows[0];
      if (
        write.domains.includes('inventory')
        && normalizeTimestamp(row?.inventory_version, 0) < versionSeed
      ) {
        return false;
      }
      if (
        write.domains.includes('sect_membership')
        && normalizeTimestamp(row?.sect_membership_version, 0) < versionSeed
      ) {
        return false;
      }
      if (write.domains.includes('sect_membership')) {
        const membership = await client.query<{ sect_id: unknown }>(
          `SELECT sect_id FROM ${PLAYER_SECT_MEMBERSHIP_TABLE} WHERE player_id = $1`,
          [write.playerId],
        );
        const persistedSectId = normalizeOptionalString(membership.rows[0]?.sect_id);
        if (persistedSectId !== normalizeOptionalString(write.snapshot.sectId)) {
          return false;
        }
      }
    }
    for (const write of membershipWrites) {
      const result = await client.query<{ sect_id: unknown; updated_at_ms: unknown }>(
        `SELECT sect_id, updated_at_ms FROM ${PLAYER_SECT_MEMBERSHIP_TABLE} WHERE player_id = $1`,
        [write.playerId],
      );
      if (
        (result.rowCount ?? 0) === 0
        || normalizeOptionalString(result.rows[0]?.sect_id) !== write.sectId
        || normalizeTimestamp(result.rows[0]?.updated_at_ms, 0) < write.updatedAtMs
      ) {
        return false;
      }
    }
    return true;
  } finally {
    client.release();
  }
}

/** 普通宗门 debounce flush 复用相同的单行 CAS 写语义。 */
export async function persistSectSnapshotsWithClient(
  client: PoolClient,
  snapshots: readonly DurableSectSnapshot[],
): Promise<void> {
  for (const snapshot of snapshots) {
    await upsertSectSnapshotWithClient(client, snapshot);
  }
}

async function assertPlayerPresenceFence(
  client: PoolClient,
  write: DurableSectPlayerProjectionWrite,
): Promise<void> {
  const expectedEpoch = normalizePositiveInteger(write.expectedSessionEpoch);
  const expectedOwnerId = normalizeOptionalString(write.expectedRuntimeOwnerId);
  if (expectedEpoch === null && !expectedOwnerId) {
    return;
  }
  const result = await client.query<{
    runtime_owner_id: unknown;
    session_epoch: unknown;
  }>(
    `
      SELECT runtime_owner_id, session_epoch
      FROM player_presence
      WHERE player_id = $1
      FOR UPDATE
    `,
    [write.playerId],
  );
  if ((result.rowCount ?? 0) === 0) {
    throw new Error(`sect_mutation_session_missing:${write.playerId}`);
  }
  const persistedEpoch = normalizePositiveInteger(result.rows[0]?.session_epoch) ?? 0;
  if (expectedEpoch !== null && expectedEpoch < persistedEpoch) {
    throw new Error(`sect_mutation_stale_session:${write.playerId}`);
  }
  const persistedOwnerId = normalizeOptionalString(result.rows[0]?.runtime_owner_id);
  if (
    expectedEpoch !== null
    && expectedEpoch === persistedEpoch
    && expectedOwnerId
    && persistedOwnerId
    && expectedOwnerId !== persistedOwnerId
  ) {
    throw new Error(`sect_mutation_stale_owner:${write.playerId}`);
  }
}

async function assertSectWriteFence(client: PoolClient, write: DurableSectWrite): Promise<void> {
  const result = await client.query<{ updated_at_ms: unknown }>(
    `SELECT updated_at_ms FROM ${SECT_TABLE} WHERE sect_id = $1 FOR UPDATE`,
    [write.sectId],
  );
  if (write.expectedUpdatedAtMs === null) {
    if ((result.rowCount ?? 0) > 0) {
      throw new Error(`sect_mutation_already_exists:${write.sectId}`);
    }
    return;
  }
  if ((result.rowCount ?? 0) === 0) {
    throw new Error(`sect_mutation_missing:${write.sectId}`);
  }
  const persistedUpdatedAt = normalizeTimestamp(result.rows[0]?.updated_at_ms, 0);
  if (persistedUpdatedAt !== normalizeTimestamp(write.expectedUpdatedAtMs, 0)) {
    throw new Error(`sect_mutation_stale_revision:${write.sectId}`);
  }
}

async function upsertSectSnapshotWithClient(
  client: PoolClient,
  sect: DurableSectSnapshot,
): Promise<void> {
  await client.query(
    `
      INSERT INTO ${SECT_TABLE}(
        sect_id,
        name,
        mark,
        founder_player_id,
        leader_player_id,
        status,
        entrance_instance_id,
        entrance_template_id,
        entrance_x,
        entrance_y,
        sect_instance_id,
        sect_template_id,
        created_at_ms,
        updated_at_ms,
        raw_payload,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, now())
      ON CONFLICT (sect_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        mark = EXCLUDED.mark,
        founder_player_id = EXCLUDED.founder_player_id,
        leader_player_id = EXCLUDED.leader_player_id,
        status = EXCLUDED.status,
        entrance_instance_id = EXCLUDED.entrance_instance_id,
        entrance_template_id = EXCLUDED.entrance_template_id,
        entrance_x = EXCLUDED.entrance_x,
        entrance_y = EXCLUDED.entrance_y,
        sect_instance_id = EXCLUDED.sect_instance_id,
        sect_template_id = EXCLUDED.sect_template_id,
        created_at_ms = LEAST(${SECT_TABLE}.created_at_ms, EXCLUDED.created_at_ms),
        updated_at_ms = EXCLUDED.updated_at_ms,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = now()
      WHERE ${SECT_TABLE}.updated_at_ms < EXCLUDED.updated_at_ms
    `,
    [
      sect.sectId,
      sect.name,
      sect.mark,
      sect.founderPlayerId,
      sect.leaderPlayerId,
      sect.status,
      sect.entranceInstanceId,
      sect.entranceTemplateId,
      Math.trunc(sect.entranceX),
      Math.trunc(sect.entranceY),
      sect.sectInstanceId,
      sect.sectTemplateId,
      normalizeTimestamp(sect.createdAt, Date.now()),
      normalizeTimestamp(sect.updatedAt, Date.now()),
      JSON.stringify(sect),
    ],
  );
}

async function replacePlayerSectMembershipWithClient(
  client: PoolClient,
  write: DurableSectMembershipWrite,
): Promise<void> {
  const updatedAtMs = normalizeTimestamp(write.updatedAtMs, Date.now());
  await client.query(
    `
      INSERT INTO ${PLAYER_SECT_MEMBERSHIP_TABLE}(player_id, sect_id, updated_at_ms, updated_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        sect_id = EXCLUDED.sect_id,
        updated_at_ms = EXCLUDED.updated_at_ms,
        updated_at = now()
      WHERE ${PLAYER_SECT_MEMBERSHIP_TABLE}.updated_at_ms <= EXCLUDED.updated_at_ms
    `,
    [write.playerId, write.sectId, updatedAtMs],
  );
  await client.query(
    `
      INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(player_id, sect_membership_version, updated_at)
      VALUES ($1, $2, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        sect_membership_version = GREATEST(
          ${PLAYER_RECOVERY_WATERMARK_TABLE}.sect_membership_version,
          EXCLUDED.sect_membership_version
        ),
        updated_at = now()
    `,
    [write.playerId, updatedAtMs],
  );
}

async function persistSectFormationWrite(
  client: PoolClient,
  write: DurableSectFormationWrite,
): Promise<void> {
  const writeVersion = write.snapshot
    ? normalizeTimestamp(write.snapshot.updatedAt, 0)
    : normalizeTimestamp(write.removedAtMs, Date.now());
  await client.query(
    `DELETE FROM ${INSTANCE_FORMATION_STATE_TABLE}
     WHERE formation_instance_id = $1
       AND updated_at_ms <= $2`,
    [write.formationInstanceId, writeVersion],
  );
  if (!write.snapshot) {
    return;
  }
  const newer = await client.query(
    `SELECT 1 FROM ${INSTANCE_FORMATION_STATE_TABLE}
     WHERE formation_instance_id = $1
     LIMIT 1`,
    [write.formationInstanceId],
  );
  if ((newer.rowCount ?? 0) > 0) {
    return;
  }
  const formation = write.snapshot;
  await client.query(
    `
      INSERT INTO ${INSTANCE_FORMATION_STATE_TABLE}(
        instance_id,
        formation_instance_id,
        owner_player_id,
        owner_sect_id,
        formation_id,
        lifecycle,
        disk_item_id,
        disk_tier,
        disk_multiplier,
        spirit_stone_count,
        qi_cost,
        x,
        y,
        eye_instance_id,
        eye_x,
        eye_y,
        allocation_payload,
        active,
        remaining_aura_budget,
        remaining_qi_budget,
        remaining_spirit_stone_budget,
        created_at_ms,
        updated_at_ms,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17::jsonb, $18, $19, $20,
        $21, $22, $23, now()
      )
    `,
    [
      write.instanceId,
      write.formationInstanceId,
      normalizeRequiredString(formation.ownerPlayerId),
      normalizeOptionalString(formation.ownerSectId),
      normalizeRequiredString(formation.formationId),
      normalizeRequiredString(formation.lifecycle),
      normalizeRequiredString(formation.diskItemId),
      normalizeRequiredString(formation.diskTier),
      normalizeFiniteNumber(formation.diskMultiplier, 1),
      normalizeFiniteNumber(formation.spiritStoneCount, 1),
      normalizeFiniteNumber(formation.qiCost, 0),
      normalizeFiniteNumber(formation.x, 0),
      normalizeFiniteNumber(formation.y, 0),
      normalizeRequiredString(formation.eyeInstanceId) || write.instanceId,
      normalizeFiniteNumber(formation.eyeX, 0),
      normalizeFiniteNumber(formation.eyeY, 0),
      JSON.stringify(normalizeJsonObject(formation.allocation)),
      formation.active !== false,
      normalizeFiniteNumber(formation.remainingAuraBudget, 0),
      normalizeFiniteNumber(formation.remainingQiBudget, 0),
      normalizeFiniteNumber(formation.remainingSpiritStoneBudget, 0),
      normalizeTimestamp(formation.createdAt, Date.now()),
      normalizeTimestamp(formation.updatedAt, Date.now()),
    ],
  );
}

/**
 * 在已经持有玩家资产事务的连接中提交单条阵法后态。
 *
 * 该入口复用宗门与普通阵法相同的 advisory lock，并在扣除玩家资产前校验阵法版本；
 * 实例 lease/epoch 必须由外层 durable operation 在同一事务中先行校验。
 */
export async function persistDurableFormationWriteWithClient(
  client: PoolClient,
  input: DurableSectFormationWrite,
  fence: DurableFormationWriteFence = {},
): Promise<void> {
  const write = normalizeFormationWrites([input])[0];
  if (!write?.snapshot) {
    throw new Error('durable_formation_snapshot_required');
  }
  const nextUpdatedAtMs = normalizeTimestamp(write.snapshot.updatedAt, 0);
  if (nextUpdatedAtMs <= 0) {
    throw new Error(`durable_formation_revision_invalid:${write.formationInstanceId}`);
  }
  const expectedUpdatedAtMs = fence.expectedUpdatedAtMs == null
    ? null
    : normalizeTimestamp(fence.expectedUpdatedAtMs, 0);
  if (expectedUpdatedAtMs !== null && nextUpdatedAtMs <= expectedUpdatedAtMs) {
    throw new Error(`durable_formation_revision_not_advanced:${write.formationInstanceId}`);
  }

  await client.query(
    'SELECT pg_advisory_xact_lock($1::integer, hashtext($2))',
    [FORMATION_LOCK_NAMESPACE, write.formationInstanceId],
  );
  const current = await client.query<{
    instance_id: unknown;
    updated_at_ms: unknown;
  }>(
    `SELECT instance_id, updated_at_ms
     FROM ${INSTANCE_FORMATION_STATE_TABLE}
     WHERE formation_instance_id = $1
     FOR UPDATE`,
    [write.formationInstanceId],
  );
  if (fence.expectAbsent === true && (current.rowCount ?? 0) > 0) {
    throw new Error(`durable_formation_already_exists:${write.formationInstanceId}`);
  }
  if (expectedUpdatedAtMs !== null) {
    const currentRow = current.rows[0] ?? null;
    const currentInstanceId = normalizeRequiredString(currentRow?.instance_id);
    const currentUpdatedAtMs = normalizeTimestamp(currentRow?.updated_at_ms, 0);
    if (
      !currentRow
      || currentInstanceId !== write.instanceId
      || currentUpdatedAtMs > expectedUpdatedAtMs
    ) {
      throw new Error(
        `durable_formation_revision_conflict:${write.formationInstanceId}:expected=${expectedUpdatedAtMs}:actual=${currentUpdatedAtMs || 'missing'}`,
      );
    }
  }

  await persistSectFormationWrite(client, write);
  const persisted = await client.query<{
    instance_id: unknown;
    updated_at_ms: unknown;
  }>(
    `SELECT instance_id, updated_at_ms
     FROM ${INSTANCE_FORMATION_STATE_TABLE}
     WHERE formation_instance_id = $1`,
    [write.formationInstanceId],
  );
  const persistedRow = persisted.rows[0] ?? null;
  if (
    normalizeRequiredString(persistedRow?.instance_id) !== write.instanceId
    || normalizeTimestamp(persistedRow?.updated_at_ms, 0) !== nextUpdatedAtMs
  ) {
    throw new Error(`durable_formation_write_not_applied:${write.formationInstanceId}`);
  }
}

function normalizeSectWrites(input: readonly DurableSectWrite[]): DurableSectWrite[] {
  const bySectId = new Map<string, DurableSectWrite>();
  for (const entry of input ?? []) {
    const sectId = normalizeRequiredString(entry?.sectId);
    if (!sectId) {
      continue;
    }
    const expectedUpdatedAtMs = entry.expectedUpdatedAtMs === null
      ? null
      : normalizeTimestamp(entry.expectedUpdatedAtMs, 0);
    const snapshot = entry.snapshot;
    if (
      snapshot
      && expectedUpdatedAtMs !== null
      && normalizeTimestamp(snapshot.updatedAt, 0) <= expectedUpdatedAtMs
    ) {
      throw new Error(`sect_mutation_revision_not_advanced:${sectId}`);
    }
    bySectId.set(sectId, {
      sectId,
      expectedUpdatedAtMs,
      snapshot,
    });
  }
  return Array.from(bySectId.values()).sort((left, right) => left.sectId.localeCompare(right.sectId));
}

function normalizePlayerProjectionWrites(
  input: readonly DurableSectPlayerProjectionWrite[],
): DurableSectPlayerProjectionWrite[] {
  const byPlayerId = new Map<string, DurableSectPlayerProjectionWrite>();
  for (const entry of input ?? []) {
    const playerId = normalizeRequiredString(entry?.playerId);
    if (!playerId || !entry?.snapshot) {
      continue;
    }
    byPlayerId.set(playerId, {
      ...entry,
      playerId,
      domains: Array.from(new Set(entry.domains.map(normalizeRequiredString).filter(Boolean))).sort(),
    });
  }
  return Array.from(byPlayerId.values()).sort((left, right) => left.playerId.localeCompare(right.playerId));
}

function normalizeMembershipWrites(
  input: readonly DurableSectMembershipWrite[],
): DurableSectMembershipWrite[] {
  const byPlayerId = new Map<string, DurableSectMembershipWrite>();
  for (const entry of input ?? []) {
    const playerId = normalizeRequiredString(entry?.playerId);
    if (!playerId) {
      continue;
    }
    byPlayerId.set(playerId, {
      playerId,
      sectId: normalizeOptionalString(entry.sectId),
      updatedAtMs: normalizeTimestamp(entry.updatedAtMs, Date.now()),
    });
  }
  return Array.from(byPlayerId.values()).sort((left, right) => left.playerId.localeCompare(right.playerId));
}

function normalizeFormationWrites(
  input: readonly DurableSectFormationWrite[],
): DurableSectFormationWrite[] {
  const byFormationId = new Map<string, DurableSectFormationWrite>();
  for (const entry of input ?? []) {
    const formationInstanceId = normalizeRequiredString(entry?.formationInstanceId);
    const instanceId = normalizeRequiredString(entry?.instanceId);
    if (!formationInstanceId || !instanceId) {
      continue;
    }
    byFormationId.set(formationInstanceId, {
      formationInstanceId,
      instanceId,
      removedAtMs: normalizeTimestamp(entry.removedAtMs, Date.now()),
      snapshot: entry.snapshot && typeof entry.snapshot === 'object'
        ? { ...entry.snapshot }
        : null,
    });
  }
  return Array.from(byFormationId.values())
    .sort((left, right) => left.formationInstanceId.localeCompare(right.formationInstanceId));
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeRequiredString(value);
  return normalized || null;
}

function waitForDurableSectReconciliation(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

class SectDurableReconciliationStoppedError extends Error {
  constructor() {
    super('sect_durable_reconciliation_stopped');
  }
}

function waitForDurableSectReadbackOrStop<TResult>(
  operation: Promise<TResult>,
  stopSignal?: Promise<void>,
): Promise<TResult> {
  if (!stopSignal) {
    return operation;
  }
  return Promise.race([
    operation,
    stopSignal.then(() => {
      throw new SectDurableReconciliationStoppedError();
    }),
  ]);
}

function normalizePositiveInteger(value: unknown): number | null {
  const normalized = Math.trunc(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  const normalized = Math.trunc(Number(value));
  return Number.isFinite(normalized) && normalized >= 0
    ? normalized
    : Math.max(0, Math.trunc(fallback));
}

function normalizeFiniteNumber(value: unknown, fallback: number): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

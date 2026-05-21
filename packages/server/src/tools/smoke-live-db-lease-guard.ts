import { Pool } from 'pg';

export const SERVER_SMOKE_ALLOW_LIVE_DB_SERVER_ENV = 'SERVER_SMOKE_ALLOW_LIVE_DB_SERVER';

interface ActiveLeaseOwnerRow {
  assigned_node_id?: unknown;
  lease_count?: unknown;
  min_lease_expire_at?: unknown;
  max_lease_expire_at?: unknown;
  sample_instance_ids?: unknown;
}

interface StaleLeaseReclaimRow {
  reclaimed_count?: unknown;
  sample_instance_ids?: unknown;
}

export interface ActiveLeaseOwnerSummary {
  assignedNodeId: string;
  leaseCount: number;
  minLeaseExpireAt: string;
  maxLeaseExpireAt: string;
  sampleInstanceIds: string[];
}

export interface StaleLeaseReclaimSummary {
  reclaimedCount: number;
  sampleInstanceIds: string[];
}

export interface AssertNoActiveInstanceLeasesForSmokeInput {
  databaseUrl: string;
  context: string;
}

export function normalizeSmokeNodeId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBooleanEnv(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function shouldAllowLiveDbSmokeServer(): boolean {
  return normalizeBooleanEnv(process.env[SERVER_SMOKE_ALLOW_LIVE_DB_SERVER_ENV]);
}

export function resolveSmokeServerNodeEnv(
  databaseUrl: string,
  requestedNodeId: string,
): Record<string, string> {
  const normalizedNodeId = normalizeSmokeNodeId(requestedNodeId);
  if (normalizedNodeId) {
    return { SERVER_NODE_ID: normalizedNodeId };
  }
  return databaseUrl.trim() ? {} : { SERVER_NODE_ID: 'server-smoke-suite' };
}

export function resolveSmokeForceReclaimEnv(databaseUrl: string): string {
  const explicit = typeof process.env.SERVER_FORCE_RECLAIM_STALE_LEASES === 'string'
    ? process.env.SERVER_FORCE_RECLAIM_STALE_LEASES.trim()
    : '';
  if (explicit) {
    return explicit;
  }
  return databaseUrl.trim() ? '0' : '1';
}

export function shouldForceReclaimStaleLeasesForSmoke(): boolean {
  return normalizeBooleanEnv(process.env.SERVER_FORCE_RECLAIM_STALE_LEASES);
}

export function formatActiveLeaseOwnersForSmoke(owners: ActiveLeaseOwnerSummary[]): string {
  return owners.map((owner) => {
    const samples = owner.sampleInstanceIds.length > 0
      ? ` samples=${owner.sampleInstanceIds.join(',')}`
      : '';
    return `${owner.assignedNodeId} x${owner.leaseCount} maxExpire=${owner.maxLeaseExpireAt}${samples}`;
  }).join('; ');
}

export function buildLiveDbLeaseRefusalMessage(
  context: string,
  owners: ActiveLeaseOwnerSummary[],
): string {
  return `${context} refused to start DB-backed smoke server because shared instance lease metadata exists: `
    + `${formatActiveLeaseOwnersForSmoke(owners)}. `
    + 'Use an isolated database or clear smoke-owned instance lease metadata before running this proof. '
    + `Set ${SERVER_SMOKE_ALLOW_LIVE_DB_SERVER_ENV}=1 only for an isolated maintenance proof.`;
}

function normalizeDateText(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

function normalizeInstanceIdArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0)
    : [];
}

function normalizeActiveLeaseOwnerRow(row: ActiveLeaseOwnerRow): ActiveLeaseOwnerSummary | null {
  const assignedNodeId = normalizeSmokeNodeId(row.assigned_node_id);
  if (!assignedNodeId) {
    return null;
  }
  const leaseCount = Number.isFinite(Number(row.lease_count))
    ? Math.max(0, Math.trunc(Number(row.lease_count)))
    : 0;
  const sampleInstanceIds = normalizeInstanceIdArray(row.sample_instance_ids);
  return {
    assignedNodeId,
    leaseCount,
    minLeaseExpireAt: normalizeDateText(row.min_lease_expire_at),
    maxLeaseExpireAt: normalizeDateText(row.max_lease_expire_at),
    sampleInstanceIds,
  };
}

export async function loadActiveInstanceLeaseOwnersForSmoke(
  databaseUrl: string,
): Promise<ActiveLeaseOwnerSummary[]> {
  if (!databaseUrl.trim()) {
    return [];
  }
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 3000,
  });
  try {
    const result = await pool.query(`
      WITH existing_leases AS (
        SELECT
          instance_id,
          COALESCE(NULLIF(btrim(assigned_node_id), ''), '<unassigned>') AS assigned_node_id,
          lease_expire_at
        FROM instance_catalog
        WHERE (
            (assigned_node_id IS NOT NULL AND btrim(assigned_node_id) <> '')
            OR (lease_token IS NOT NULL AND btrim(lease_token) <> '')
          )
          AND COALESCE(status, 'active') <> 'destroyed'
      )
      SELECT
        owner.assigned_node_id,
        COUNT(*)::int AS lease_count,
        MIN(owner.lease_expire_at) AS min_lease_expire_at,
        MAX(owner.lease_expire_at) AS max_lease_expire_at,
        ARRAY(
          SELECT sample.instance_id
          FROM existing_leases sample
          WHERE sample.assigned_node_id = owner.assigned_node_id
          ORDER BY sample.instance_id
          LIMIT 5
        ) AS sample_instance_ids
      FROM existing_leases owner
      GROUP BY owner.assigned_node_id
      ORDER BY lease_count DESC, owner.assigned_node_id
      LIMIT 8
    `);
    return result.rows
      .map((row: ActiveLeaseOwnerRow) => normalizeActiveLeaseOwnerRow(row))
      .filter((row: ActiveLeaseOwnerSummary | null): row is ActiveLeaseOwnerSummary => row !== null);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function reclaimStaleInstanceLeasesForSmoke(
  databaseUrl: string,
): Promise<StaleLeaseReclaimSummary> {
  if (!databaseUrl.trim()) {
    return {
      reclaimedCount: 0,
      sampleInstanceIds: [],
    };
  }
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 3000,
  });
  try {
    const result = await pool.query(`
      WITH reclaimed_leases AS (
        UPDATE instance_catalog
        SET
          assigned_node_id = NULL,
          lease_token = NULL,
          lease_expire_at = NULL,
          last_active_at = NOW()
        WHERE COALESCE(status, 'active') <> 'destroyed'
          AND lease_expire_at IS NOT NULL
          AND lease_expire_at <= NOW()
          AND (
            (assigned_node_id IS NOT NULL AND btrim(assigned_node_id) <> '')
            OR (lease_token IS NOT NULL AND btrim(lease_token) <> '')
          )
        RETURNING instance_id
      )
      SELECT
        COUNT(*)::int AS reclaimed_count,
        COALESCE(
          ARRAY(
            SELECT instance_id
            FROM reclaimed_leases
            ORDER BY instance_id
            LIMIT 8
          ),
          ARRAY[]::text[]
        ) AS sample_instance_ids
      FROM reclaimed_leases
    `);
    const row = result.rows[0] as StaleLeaseReclaimRow | undefined;
    return {
      reclaimedCount: Number.isFinite(Number(row?.reclaimed_count)) ? Math.max(0, Math.trunc(Number(row?.reclaimed_count))) : 0,
      sampleInstanceIds: normalizeInstanceIdArray(row?.sample_instance_ids),
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function assertNoActiveInstanceLeasesForSmoke(
  input: AssertNoActiveInstanceLeasesForSmokeInput,
): Promise<void> {
  if (!input.databaseUrl.trim()) {
    return;
  }

  if (shouldForceReclaimStaleLeasesForSmoke()) {
    const reclaimed = await reclaimStaleInstanceLeasesForSmoke(input.databaseUrl);
    if (reclaimed.reclaimedCount > 0) {
      console.log(JSON.stringify({
        ok: true,
        context: input.context,
        reclaimedStaleInstanceLeases: reclaimed.reclaimedCount,
        sampleInstanceIds: reclaimed.sampleInstanceIds,
      }));
    }
  }

  if (shouldAllowLiveDbSmokeServer()) {
    return;
  }

  const owners = await loadActiveInstanceLeaseOwnersForSmoke(input.databaseUrl);
  if (owners.length === 0) {
    return;
  }
  throw new Error(buildLiveDbLeaseRefusalMessage(input.context, owners));
}

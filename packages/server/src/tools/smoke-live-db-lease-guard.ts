import { Pool } from 'pg';

export const SERVER_SMOKE_ALLOW_LIVE_DB_SERVER_ENV = 'SERVER_SMOKE_ALLOW_LIVE_DB_SERVER';

interface ActiveLeaseOwnerRow {
  assigned_node_id?: unknown;
  lease_count?: unknown;
  min_lease_expire_at?: unknown;
  max_lease_expire_at?: unknown;
  sample_instance_ids?: unknown;
}

export interface ActiveLeaseOwnerSummary {
  assignedNodeId: string;
  leaseCount: number;
  minLeaseExpireAt: string;
  maxLeaseExpireAt: string;
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
  return `${context} refused to start DB-backed smoke server because active instance leases exist: `
    + `${formatActiveLeaseOwnersForSmoke(owners)}. `
    + 'Stop the running server, use an isolated database, or wait for stale leases to expire. '
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

function normalizeActiveLeaseOwnerRow(row: ActiveLeaseOwnerRow): ActiveLeaseOwnerSummary | null {
  const assignedNodeId = normalizeSmokeNodeId(row.assigned_node_id);
  if (!assignedNodeId) {
    return null;
  }
  const leaseCount = Number.isFinite(Number(row.lease_count))
    ? Math.max(0, Math.trunc(Number(row.lease_count)))
    : 0;
  const sampleInstanceIds = Array.isArray(row.sample_instance_ids)
    ? row.sample_instance_ids
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0)
    : [];
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
      WITH active_leases AS (
        SELECT instance_id, assigned_node_id, lease_expire_at
        FROM instance_catalog
        WHERE assigned_node_id IS NOT NULL
          AND btrim(assigned_node_id) <> ''
          AND lease_expire_at IS NOT NULL
          AND lease_expire_at > now()
          AND COALESCE(status, 'active') <> 'destroyed'
      )
      SELECT
        owner.assigned_node_id,
        COUNT(*)::int AS lease_count,
        MIN(owner.lease_expire_at) AS min_lease_expire_at,
        MAX(owner.lease_expire_at) AS max_lease_expire_at,
        ARRAY(
          SELECT sample.instance_id
          FROM active_leases sample
          WHERE sample.assigned_node_id = owner.assigned_node_id
          ORDER BY sample.instance_id
          LIMIT 5
        ) AS sample_instance_ids
      FROM active_leases owner
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

export async function assertNoActiveInstanceLeasesForSmoke(
  input: AssertNoActiveInstanceLeasesForSmokeInput,
): Promise<void> {
  if (!input.databaseUrl.trim() || shouldAllowLiveDbSmokeServer()) {
    return;
  }
  const owners = await loadActiveInstanceLeaseOwnersForSmoke(input.databaseUrl);
  if (owners.length === 0) {
    return;
  }
  throw new Error(buildLiveDbLeaseRefusalMessage(input.context, owners));
}

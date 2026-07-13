import type { PoolClient } from 'pg';

const INSTANCE_FLUSH_LEDGER_TABLE = 'instance_flush_ledger';

export interface InstanceFlushLedgerClaim {
  ownershipEpoch: number;
  latestVersion: number;
  claimOwnerId: string;
  fencingToken: string | null;
}

export function normalizeInstanceFlushLedgerClaim(input: {
  ownershipEpoch: number;
  latestVersion: number;
  claimOwnerId: string;
  fencingToken?: string | null;
} | null | undefined): InstanceFlushLedgerClaim | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const ownershipEpoch = Math.trunc(Number(input.ownershipEpoch));
  const latestVersion = Math.trunc(Number(input.latestVersion));
  const claimOwnerId = normalizeRequiredString(input.claimOwnerId);
  const fencingToken = normalizeRequiredString(input.fencingToken) || null;
  if (
    !Number.isSafeInteger(ownershipEpoch)
    || ownershipEpoch < 0
    || !Number.isSafeInteger(latestVersion)
    || latestVersion < 0
    || !claimOwnerId
  ) {
    return null;
  }
  return { ownershipEpoch, latestVersion, claimOwnerId, fencingToken };
}

export async function isCurrentClaimedInstanceFlushPayload(
  client: PoolClient,
  instanceIdInput: string,
  domainInput: string,
  claim: InstanceFlushLedgerClaim,
): Promise<boolean> {
  const instanceId = normalizeRequiredString(instanceIdInput);
  const domain = normalizeRequiredString(domainInput);
  if (!instanceId || !domain) {
    return false;
  }
  const result = await client.query(
    `SELECT 1
     FROM ${INSTANCE_FLUSH_LEDGER_TABLE}
     WHERE instance_id = $1
       AND domain = $2
       AND ownership_epoch = $3
       AND latest_version = $4
       AND claimed_by = $5
       AND claim_until IS NOT NULL
       AND claim_until >= now()
       AND fencing_token IS NOT DISTINCT FROM $6::varchar
       AND payload_jsonb IS NOT NULL
       AND latest_version > flushed_version
     LIMIT 1`,
    [instanceId, domain, claim.ownershipEpoch, claim.latestVersion, claim.claimOwnerId, claim.fencingToken],
  );
  return (result.rowCount ?? 0) === 1;
}

/** 把已完整落库的实例域推进到单调 barrier，并使旧 claim/payload 失效。 */
export async function persistInstanceFlushLedgerBarrier(
  client: PoolClient,
  input: { instanceId: string; domain: string; ownershipEpoch: number; version: number },
): Promise<void> {
  const normalized = normalizeLedgerWriteInput(input);
  const result = await client.query(
    `INSERT INTO ${INSTANCE_FLUSH_LEDGER_TABLE}(
       instance_id, domain, ownership_epoch, latest_version, flushed_version,
       priority, payload_jsonb, updated_at
     )
     VALUES ($1, $2, $3, $4, $4, 'low', NULL, now())
     ON CONFLICT (instance_id, domain, ownership_epoch)
     DO UPDATE SET
       latest_version = GREATEST(${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version, EXCLUDED.latest_version),
       flushed_version = EXCLUDED.latest_version,
       dirty_since_at = NULL,
       next_attempt_at = NULL,
       claimed_by = NULL,
       claim_until = NULL,
       payload_jsonb = NULL,
       failure_category = NULL,
       retry_after = NULL,
       updated_at = now()
     WHERE EXCLUDED.latest_version >= ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version`,
    [normalized.instanceId, normalized.domain, normalized.ownershipEpoch, normalized.version],
  );
  if ((result.rowCount ?? 0) !== 1) {
    throw new Error(`instance_flush_ledger_barrier_rejected:${normalized.instanceId}:${normalized.domain}:${normalized.version}`);
  }
}

/**
 * 用事务内生成的累计 payload 取代当前 ledger 行；来源后态已在同一事务落库，
 * 其余同域 dirty 由该 payload 在崩溃后继续回放。
 */
export async function supersedeInstanceFlushLedgerPayload(
  client: PoolClient,
  input: {
    instanceId: string;
    domain: string;
    ownershipEpoch: number;
    version: number;
    payload: unknown;
  },
): Promise<void> {
  const normalized = normalizeLedgerWriteInput(input);
  const payload = normalizeJsonObject(input.payload);
  if (Object.keys(payload).length === 0) {
    throw new Error(`instance_flush_ledger_payload_required:${normalized.instanceId}:${normalized.domain}`);
  }
  const fencingToken = buildDurableSourceFencingToken(normalized.domain, normalized.ownershipEpoch, normalized.version);
  const result = await client.query(
    `INSERT INTO ${INSTANCE_FLUSH_LEDGER_TABLE}(
       instance_id, domain, ownership_epoch, priority, latest_version, flushed_version,
       dirty_since_at, next_attempt_at, claimed_by, claim_until,
       fencing_token, idempotency_key, payload_jsonb, updated_at
     )
     VALUES ($1, $2, $3, 'high', $4, 0, now(), now(), NULL, NULL, $5, $5, $6::jsonb, now())
     ON CONFLICT (instance_id, domain, ownership_epoch)
     DO UPDATE SET
       priority = 'high',
       latest_version = EXCLUDED.latest_version,
       dirty_since_at = COALESCE(${INSTANCE_FLUSH_LEDGER_TABLE}.dirty_since_at, now()),
       next_attempt_at = now(),
       claimed_by = NULL,
       claim_until = NULL,
       runtime_owner_id = NULL,
       fencing_token = EXCLUDED.fencing_token,
       idempotency_key = EXCLUDED.idempotency_key,
       payload_jsonb = EXCLUDED.payload_jsonb,
       failure_category = NULL,
       retry_after = NULL,
       updated_at = now()
     WHERE EXCLUDED.latest_version > ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version`,
    [
      normalized.instanceId,
      normalized.domain,
      normalized.ownershipEpoch,
      normalized.version,
      fencingToken,
      JSON.stringify(payload),
    ],
  );
  if ((result.rowCount ?? 0) !== 1) {
    throw new Error(`instance_flush_ledger_payload_supersede_rejected:${normalized.instanceId}:${normalized.domain}:${normalized.version}`);
  }
}

function normalizeLedgerWriteInput(input: {
  instanceId: string;
  domain: string;
  ownershipEpoch: number;
  version: number;
}): { instanceId: string; domain: string; ownershipEpoch: number; version: number } {
  const instanceId = normalizeRequiredString(input.instanceId);
  const domain = normalizeRequiredString(input.domain);
  const ownershipEpoch = Math.trunc(Number(input.ownershipEpoch));
  const version = Math.trunc(Number(input.version));
  if (
    !instanceId
    || !domain
    || !Number.isSafeInteger(ownershipEpoch)
    || ownershipEpoch <= 0
    || !Number.isSafeInteger(version)
    || version <= 0
  ) {
    throw new Error('invalid_instance_flush_ledger_write_input');
  }
  return { instanceId, domain, ownershipEpoch, version };
}

function buildDurableSourceFencingToken(domain: string, ownershipEpoch: number, version: number): string {
  return `durable-source:${domain}:${ownershipEpoch}:${version}`.slice(0, 120);
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  try {
    const parsed = JSON.parse(JSON.stringify(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

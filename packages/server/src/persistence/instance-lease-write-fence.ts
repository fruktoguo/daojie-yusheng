import type { PoolClient } from 'pg';

export interface InstanceLeaseWriteFence {
  instanceId: string;
  assignedNodeId: string;
  leaseToken: string;
  ownershipEpoch: number;
}

export interface AssertInstanceLeaseWriteFenceInput {
  instanceId: string;
  expectedAssignedNodeId?: string | null;
  expectedLeaseToken?: string | null;
  expectedOwnershipEpoch?: number | null;
  requiredCurrentNodeId?: string | null;
  conflictCode?: string;
}

/** 在实例领域写事务内锁定并校验 catalog lease，阻断 handoff 后的旧 writer。 */
export async function assertInstanceLeaseWriteFence(
  client: PoolClient,
  input: AssertInstanceLeaseWriteFenceInput,
): Promise<void> {
  const instanceId = normalizeRequiredString(input.instanceId);
  if (!instanceId) {
    throw new Error('instance_lease_fence_instance_id_required');
  }
  const expectedAssignedNodeId = normalizeRequiredString(input.expectedAssignedNodeId);
  const expectedLeaseToken = normalizeRequiredString(input.expectedLeaseToken);
  const requiredCurrentNodeId = normalizeRequiredString(input.requiredCurrentNodeId);
  const expectedOwnershipEpoch = normalizeOptionalInteger(input.expectedOwnershipEpoch);
  const result = await client.query<{
    assigned_node_id: unknown;
    lease_token: unknown;
    lease_expire_at: unknown;
    ownership_epoch: unknown;
    status: unknown;
    runtime_status: unknown;
  }>(
    `SELECT assigned_node_id, lease_token, lease_expire_at, ownership_epoch, status, runtime_status
     FROM instance_catalog
     WHERE instance_id = $1
     FOR UPDATE`,
    [instanceId],
  );
  const row = result.rows[0] ?? null;
  const assignedNodeId = normalizeRequiredString(row?.assigned_node_id);
  const leaseToken = normalizeRequiredString(row?.lease_token);
  const ownershipEpoch = normalizeOptionalInteger(row?.ownership_epoch);
  const leaseExpireAt = row?.lease_expire_at ? new Date(row.lease_expire_at as string | Date).getTime() : 0;
  const status = normalizeRequiredString(row?.status);
  const runtimeStatus = normalizeRequiredString(row?.runtime_status);
  if (
    !row
    || !assignedNodeId
    || !leaseToken
    || (requiredCurrentNodeId && assignedNodeId !== requiredCurrentNodeId)
    || (expectedAssignedNodeId && assignedNodeId !== expectedAssignedNodeId)
    || (expectedLeaseToken && leaseToken !== expectedLeaseToken)
    || (expectedOwnershipEpoch !== null && ownershipEpoch !== expectedOwnershipEpoch)
    || !Number.isFinite(leaseExpireAt)
    || leaseExpireAt <= Date.now()
    || status === 'destroyed'
    || runtimeStatus === 'fenced'
    || runtimeStatus === 'stopped'
  ) {
    throw new Error([
      normalizeRequiredString(input.conflictCode) || 'instance_lease_fencing_conflict',
      `instanceId=${instanceId}`,
      `requiredCurrentNodeId=${requiredCurrentNodeId || 'null'}`,
      `expectedNodeId=${expectedAssignedNodeId || 'null'}`,
      `expectedLeaseToken=${expectedLeaseToken || 'null'}`,
      `expectedOwnershipEpoch=${expectedOwnershipEpoch ?? 'null'}`,
      `actualNodeId=${assignedNodeId || 'null'}`,
      `actualLeaseToken=${leaseToken || 'null'}`,
      `actualOwnershipEpoch=${ownershipEpoch ?? 'null'}`,
    ].join(':'));
  }
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const normalized = Math.trunc(Number(value));
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
}

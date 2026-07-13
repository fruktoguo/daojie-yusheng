import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { DurableOperationService } from '../persistence/durable-operation.service';
import { FlushLedgerService } from '../persistence/flush-ledger.service';
import { InstanceDomainPersistenceService } from '../persistence/instance-domain-persistence.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

const databaseUrl = resolveServerDatabaseUrl();
async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: 'with-db 下验证地块资源物品会把背包扣除、实例资源绝对后态、flush ledger barrier、outbox 与双资产审计提交为同一事务，并阻断已认领旧 payload 的迟到覆盖。',
      excludes: '无数据库时不证明真实事务或跨进程 claim 竞争。',
      completionMapping: 'release:proof:with-db.tile-resource-use-durable',
    }, null, 2));
    return;
  }

  const now = Date.now();
  const playerId = `tile_resource_use_${now.toString(36)}_${randomUUID().slice(0, 8)}`;
  const instanceId = `instance:${playerId}`;
  const operationId = `op:${playerId}:tile-resource-use`;
  const runtimeOwnerId = `runtime:${playerId}`;
  const assignedNodeId = 'node:tile-resource-use-smoke';
  const leaseToken = `lease:${instanceId}:7`;
  const itemInstanceId = randomUUID();
  const ownershipEpoch = 7;
  const ledgerVersion = now + 100;
  const pool = new Pool({ connectionString: databaseUrl });
  const databasePoolProvider = new DatabasePoolProvider();
  const durable = new DurableOperationService({
    getNodeId() {
      return assignedNodeId;
    },
  } as never, databasePoolProvider);
  const ledger = new FlushLedgerService(databasePoolProvider);
  const instancePersistence = new InstanceDomainPersistenceService(databasePoolProvider);

  try {
    await durable.onModuleInit();
    await ledger.onModuleInit();
    await instancePersistence.onModuleInit();
    await cleanup(pool, playerId, instanceId);
    await seedFixture(pool, {
      playerId,
      instanceId,
      runtimeOwnerId,
      assignedNodeId,
      leaseToken,
      ownershipEpoch,
      itemInstanceId,
      now,
    });
    await ledger.upsertInstanceFlushLedger({
      instanceId,
      domain: 'tile_resource',
      ownershipEpoch,
      latestVersion: 10,
      priority: 'low',
      fencingToken: 'tile-resource-use-smoke-fence',
      payloadJson: {
        kind: 'instance_domain_delta',
        domain: 'tile_resource',
        upserts: [{ resourceKey: 'sha.refined.neutral', tileIndex: 18, value: 1 }],
        deletes: [],
        revision: 10,
      },
    });
    const claimedRows = await ledger.claimInstanceFlushLedger({
      workerId: 'tile-resource-use-smoke-old-worker',
      id: instanceId,
      domain: 'tile_resource',
      ownershipEpoch,
      limit: 1,
      payloadRequired: true,
    });
    const oldClaim = claimedRows[0];
    assert.ok(oldClaim?.claimed_by, '必须先模拟 worker 已认领旧 payload');

    const request = buildRequest({
      operationId,
      playerId,
      instanceId,
      runtimeOwnerId,
      assignedNodeId,
      leaseToken,
      ownershipEpoch,
      ledgerVersion,
      itemInstanceId,
    });
    await assert.rejects(
      durable.grantInventoryItems({ ...request, operationId: `${operationId}:stale-lease`, expectedLeaseToken: `${leaseToken}:stale` }),
      /instance_lease_fencing_conflict/,
    );
    assert.equal(await readInventoryCount(pool, playerId), 2);
    assert.equal(await readTileResourceValue(pool, instanceId, 'sha.refined.neutral', 18), 4);

    const result = await durable.grantInventoryItems(request);
    assert.equal(result.ok, true);
    assert.equal(result.alreadyCommitted, false);
    assert.equal(await readInventoryCount(pool, playerId), 1);
    assert.equal(await readTileResourceValue(pool, instanceId, 'ore', 6), 3);
    assert.equal(await readTileResourceValue(pool, instanceId, 'sha.refined.neutral', 18), 14);

    const lateApplied = await instancePersistence.saveTileResourceDeltaBatch([{
      instanceId,
      upserts: [{ resourceKey: 'sha.refined.neutral', tileIndex: 18, value: 1 }],
      deletes: [],
      ledgerClaim: {
        ownershipEpoch,
        latestVersion: 10,
        claimOwnerId: String(oldClaim.claimed_by),
        fencingToken: typeof oldClaim.fencing_token === 'string' ? oldClaim.fencing_token : null,
      },
    }]);
    assert.deepEqual(lateApplied, [], 'durable barrier 后旧 claim 不得再写入地块资源');
    assert.equal(await readTileResourceValue(pool, instanceId, 'sha.refined.neutral', 18), 14);

    const replay = await durable.grantInventoryItems(request);
    assert.equal(replay.alreadyCommitted, true);
    assert.equal(await readInventoryCount(pool, playerId), 1);
    assert.equal(await readTileResourceValue(pool, instanceId, 'sha.refined.neutral', 18), 14);

    const ledgerRow = (await pool.query(
      `SELECT latest_version, flushed_version, claimed_by, payload_jsonb
       FROM instance_flush_ledger
       WHERE instance_id = $1 AND domain = 'tile_resource' AND ownership_epoch = $2`,
      [instanceId, ownershipEpoch],
    )).rows[0];
    assert.equal(Number(ledgerRow?.latest_version), ledgerVersion);
    assert.equal(Number(ledgerRow?.flushed_version), ledgerVersion);
    assert.equal(ledgerRow?.claimed_by, null);
    assert.equal(ledgerRow?.payload_jsonb, null);

    const auditRows = (await pool.query(
      'SELECT asset_type, action FROM asset_audit_log WHERE operation_id = $1 ORDER BY asset_type ASC',
      [operationId],
    )).rows;
    assert.deepEqual(auditRows, [
      { asset_type: 'inventory', action: 'remove' },
      { asset_type: 'tile_resource', action: 'increase' },
    ]);
    const outboxRows = (await pool.query(
      'SELECT topic, status FROM outbox_event WHERE operation_id = $1',
      [operationId],
    )).rows;
    assert.deepEqual(outboxRows, [{ topic: 'player.inventory.removed', status: 'ready' }]);

    console.log(JSON.stringify({
      ok: true,
      case: 'tile-resource-use-durable',
      answers: '真实 PostgreSQL 已证明错误 lease 全量拒绝；正确请求把背包、累计地块资源、ledger barrier、outbox 和 inventory/tile_resource 双审计同事务提交；事务后旧 worker claim 无法迟到覆盖；同 operationId 重放不重复扣物或加资源。',
      excludes: '不模拟真实网络断线时 COMMIT 回包丢失，也不证明多节点同时续租；对应运行时由 presence/lease fence 与 COMMIT unknown 收敛链约束。',
      completionMapping: 'release:proof:with-db.tile-resource-use-durable',
    }, null, 2));
  } finally {
    await cleanup(pool, playerId, instanceId).catch(() => undefined);
    await instancePersistence.onModuleDestroy().catch(() => undefined);
    await ledger.onModuleDestroy().catch(() => undefined);
    await durable.onModuleDestroy().catch(() => undefined);
    await databasePoolProvider.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

function buildRequest(input: {
  operationId: string;
  playerId: string;
  instanceId: string;
  runtimeOwnerId: string;
  assignedNodeId: string;
  leaseToken: string;
  ownershipEpoch: number;
  ledgerVersion: number;
  itemInstanceId: string;
}) {
  return {
    operationId: input.operationId,
    playerId: input.playerId,
    expectedRuntimeOwnerId: input.runtimeOwnerId,
    expectedSessionEpoch: 5,
    expectedInstanceId: input.instanceId,
    expectedAssignedNodeId: input.assignedNodeId,
    expectedLeaseToken: input.leaseToken,
    expectedOwnershipEpoch: input.ownershipEpoch,
    sourceType: 'tile_resource_use',
    sourceRefId: `stone.blood_essence:${input.itemInstanceId}:18`,
    inventoryAction: 'remove' as const,
    sourceMutation: {
      kind: 'tile_resource' as const,
      instanceId: input.instanceId,
      ownershipEpoch: input.ownershipEpoch,
      flushLedgerVersion: input.ledgerVersion,
      upserts: [
        { resourceKey: 'ore', tileIndex: 6, value: 3 },
        { resourceKey: 'sha.refined.neutral', tileIndex: 18, value: 14 },
      ],
      deletes: [],
      gains: [{ resourceKey: 'sha.refined.neutral', tileIndex: 18, amount: 10, nextValue: 14 }],
    },
    grantedItems: [{
      itemId: 'stone.blood_essence',
      itemInstanceId: input.itemInstanceId,
      count: 1,
      rawPayload: { itemId: 'stone.blood_essence', itemInstanceId: input.itemInstanceId, count: 1 },
    }],
    nextInventoryItems: [{
      itemId: 'stone.blood_essence',
      itemInstanceId: input.itemInstanceId,
      count: 1,
      rawPayload: { itemId: 'stone.blood_essence', itemInstanceId: input.itemInstanceId, count: 1 },
    }],
  };
}

async function seedFixture(pool: Pool, input: {
  playerId: string;
  instanceId: string;
  runtimeOwnerId: string;
  assignedNodeId: string;
  leaseToken: string;
  ownershipEpoch: number;
  itemInstanceId: string;
  now: number;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO player_presence(
         player_id, online, in_world, last_heartbeat_at, runtime_owner_id, session_epoch, updated_at
       ) VALUES ($1, true, true, $2, $3, 5, now())`,
      [input.playerId, input.now, input.runtimeOwnerId],
    );
    await client.query(
      `INSERT INTO player_inventory_item(
         item_instance_id, player_id, slot_index, item_id, count, raw_payload, updated_at
       ) VALUES ($1, $2, 0, 'stone.blood_essence', 2, $3::jsonb, now())`,
      [
        input.itemInstanceId,
        input.playerId,
        JSON.stringify({ itemId: 'stone.blood_essence', itemInstanceId: input.itemInstanceId, count: 2 }),
      ],
    );
    await client.query(
      `INSERT INTO instance_catalog(
         instance_id, template_id, instance_type, persistent_policy, status, runtime_status,
         assigned_node_id, lease_token, lease_expire_at, ownership_epoch,
         cluster_id, shard_key, route_domain, created_at, last_active_at, last_persisted_at
       ) VALUES (
         $1, 'tile-resource-use-smoke', 'public', 'persistent', 'active', 'running',
         $2, $3, $4::timestamptz, $5, 'default', $1, 'public', now(), now(), now()
       )`,
      [
        input.instanceId,
        input.assignedNodeId,
        input.leaseToken,
        new Date(Date.now() + 60_000).toISOString(),
        input.ownershipEpoch,
      ],
    );
    await client.query(
      `INSERT INTO instance_tile_resource_state(instance_id, resource_key, tile_index, value, updated_at)
       VALUES ($1, 'ore', 6, 3, now()), ($1, 'sha.refined.neutral', 18, 4, now())`,
      [input.instanceId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function readInventoryCount(pool: Pool, playerId: string): Promise<number> {
  const result = await pool.query(
    `SELECT count FROM player_inventory_item
     WHERE player_id = $1 AND item_id = 'stone.blood_essence'`,
    [playerId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function readTileResourceValue(
  pool: Pool,
  instanceId: string,
  resourceKey: string,
  tileIndex: number,
): Promise<number> {
  const result = await pool.query(
    `SELECT value FROM instance_tile_resource_state
     WHERE instance_id = $1 AND resource_key = $2 AND tile_index = $3`,
    [instanceId, resourceKey, tileIndex],
  );
  return Number(result.rows[0]?.value ?? 0);
}

async function cleanup(pool: Pool, playerId: string, instanceId: string): Promise<void> {
  await pool.query('DELETE FROM durable_operation_log WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM outbox_event WHERE partition_key = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM asset_audit_log WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_inventory_item WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_recovery_watermark WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_presence WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_flush_ledger WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_tile_resource_state WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_catalog WHERE instance_id = $1', [instanceId]).catch(() => undefined);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

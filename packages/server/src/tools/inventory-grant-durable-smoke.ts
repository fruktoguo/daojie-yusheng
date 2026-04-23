import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DurableOperationService } from '../persistence/durable-operation.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: 'with-db 下 grantInventoryItems 会在同一事务内提交 player_inventory_item/watermark/outbox/audit，并执行 runtime_owner_id + session_epoch + instance lease fencing',
      excludes: '不证明真实战斗 tick 编排、地面/容器状态一致性或更泛化的世界资产 intent 编排',
    }, null, 2));
    return;
  }

  const now = Date.now();
  const playerId = `invgrant_${now.toString(36)}`;
  const operationId = `op:${playerId}:inventory-grant:1`;
  const runtimeOwnerId = `runtime:${playerId}:1`;
  const leasedInstanceId = `instance:${playerId}:lease`;

  const pool = new Pool({ connectionString: databaseUrl });
  const service = new DurableOperationService({
    getNodeId() {
      return 'node:inventory-grant-smoke';
    },
  } as never);

  try {
    await service.onModuleInit();
    await cleanupPlayer(pool, playerId);
    await seedInventoryGrantFixture(pool, {
      playerId,
      runtimeOwnerId,
      sessionEpoch: 9,
      now,
    });
    await seedInstanceCatalogFixture(pool, {
      instanceId: leasedInstanceId,
      assignedNodeId: 'node:inventory-grant-smoke',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
      ownershipEpoch: 4,
    });

    let rejected = false;
    try {
      await service.grantInventoryItems({
        operationId: `${operationId}:wrong-owner`,
        playerId,
        expectedRuntimeOwnerId: `${runtimeOwnerId}:stale`,
        expectedSessionEpoch: 9,
        expectedInstanceId: leasedInstanceId,
        expectedAssignedNodeId: 'node:inventory-grant-smoke',
        expectedOwnershipEpoch: 4,
        sourceType: 'monster_loot',
        sourceRefId: 'monster:rat:1',
        grantedItems: buildGrantedInventoryItems(),
        nextInventoryItems: buildNextInventoryItems(),
      });
    } catch (error) {
      rejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!rejected) {
      throw new Error('expected stale owner rejection before inventory grant durable settlement');
    }

    rejected = false;
    try {
      await service.grantInventoryItems({
        operationId: `${operationId}:wrong-session`,
        playerId,
        expectedRuntimeOwnerId: runtimeOwnerId,
        expectedSessionEpoch: 10,
        expectedInstanceId: leasedInstanceId,
        expectedAssignedNodeId: 'node:inventory-grant-smoke',
        expectedOwnershipEpoch: 4,
        sourceType: 'monster_loot',
        sourceRefId: 'monster:rat:1',
        grantedItems: buildGrantedInventoryItems(),
        nextInventoryItems: buildNextInventoryItems(),
      });
    } catch (error) {
      rejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!rejected) {
      throw new Error('expected stale session rejection before inventory grant durable settlement');
    }

    rejected = false;
    try {
      await service.grantInventoryItems({
        operationId: `${operationId}:wrong-lease`,
        playerId,
        expectedRuntimeOwnerId: runtimeOwnerId,
        expectedSessionEpoch: 9,
        expectedInstanceId: leasedInstanceId,
        expectedAssignedNodeId: 'node:inventory-grant-smoke',
        expectedOwnershipEpoch: 5,
        sourceType: 'monster_loot',
        sourceRefId: 'monster:rat:1',
        grantedItems: buildGrantedInventoryItems(),
        nextInventoryItems: buildNextInventoryItems(),
      });
    } catch (error) {
      rejected = String(error instanceof Error ? error.message : error).includes('instance_lease_fencing_conflict');
    }
    if (!rejected) {
      throw new Error('expected stale lease rejection before inventory grant durable settlement');
    }

    const rejectedInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [playerId],
    );
    if (
      rejectedInventoryRows.length !== 1
      || rejectedInventoryRows[0]?.item_id !== 'moon_grass'
      || Number(rejectedInventoryRows[0]?.count) !== 1
    ) {
      throw new Error(`unexpected inventory rows after rejection: ${JSON.stringify(rejectedInventoryRows)}`);
    }

    const firstResult = await service.grantInventoryItems({
      operationId,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 9,
      expectedInstanceId: leasedInstanceId,
      expectedAssignedNodeId: 'node:inventory-grant-smoke',
      expectedOwnershipEpoch: 4,
      sourceType: 'monster_loot',
      sourceRefId: 'monster:rat:1',
      grantedItems: buildGrantedInventoryItems(),
      nextInventoryItems: buildNextInventoryItems(),
    });
    if (!firstResult.ok || firstResult.alreadyCommitted || firstResult.grantedCount !== 2) {
      throw new Error(`unexpected inventory grant durable result: ${JSON.stringify(firstResult)}`);
    }

    const replayResult = await service.grantInventoryItems({
      operationId,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 9,
      expectedInstanceId: leasedInstanceId,
      expectedAssignedNodeId: 'node:inventory-grant-smoke',
      expectedOwnershipEpoch: 4,
      sourceType: 'monster_loot',
      sourceRefId: 'monster:rat:1',
      grantedItems: buildGrantedInventoryItems(),
      nextInventoryItems: buildNextInventoryItems(),
    });
    if (!replayResult.ok || !replayResult.alreadyCommitted) {
      throw new Error(`unexpected inventory grant replay result: ${JSON.stringify(replayResult)}`);
    }

    const inventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [playerId],
    );
    const operationRow = await fetchSingleRow(
      pool,
      'SELECT status, committed_at FROM durable_operation_log WHERE operation_id = $1',
      [operationId],
    );
    const outboxRows = await fetchRows(
      pool,
      'SELECT topic, status FROM outbox_event WHERE operation_id = $1 ORDER BY event_id ASC',
      [operationId],
    );
    const auditRows = await fetchRows(
      pool,
      'SELECT asset_type, action FROM asset_audit_log WHERE operation_id = $1 ORDER BY log_id ASC',
      [operationId],
    );
    const watermarkRow = await fetchSingleRow(
      pool,
      'SELECT inventory_version FROM player_recovery_watermark WHERE player_id = $1',
      [playerId],
    );

    if (
      inventoryRows.length !== 2
      || inventoryRows[0]?.item_id !== 'moon_grass'
      || Number(inventoryRows[0]?.count) !== 1
      || inventoryRows[1]?.item_id !== 'rat_tail'
      || Number(inventoryRows[1]?.count) !== 2
    ) {
      throw new Error(`unexpected granted inventory rows: ${JSON.stringify(inventoryRows)}`);
    }
    if (!operationRow || operationRow.status !== 'committed' || !operationRow.committed_at) {
      throw new Error(`unexpected durable operation row: ${JSON.stringify(operationRow)}`);
    }
    if (
      outboxRows.length !== 1
      || outboxRows[0]?.topic !== 'player.inventory.granted'
      || outboxRows[0]?.status !== 'ready'
    ) {
      throw new Error(`unexpected outbox rows: ${JSON.stringify(outboxRows)}`);
    }
    if (
      auditRows.length !== 1
      || auditRows[0]?.asset_type !== 'inventory'
      || auditRows[0]?.action !== 'grant'
    ) {
      throw new Error(`unexpected audit rows: ${JSON.stringify(auditRows)}`);
    }
    if (!watermarkRow || Number(watermarkRow.inventory_version) <= 0) {
      throw new Error(`unexpected watermark row: ${JSON.stringify(watermarkRow)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      case: 'inventory-grant-durable',
      answers: 'with-db 下 grantInventoryItems 现已验证 runtime_owner_id + session_epoch + instance lease fencing、幂等回放、拒绝不污染真源，以及 player_inventory_item/watermark/outbox/audit 的同事务提交',
      excludes: '不证明真实战斗 tick 编排、地面/容器状态一致性或更泛化的世界资产 intent 编排',
      completionMapping: 'replace-ready:proof:with-db.inventory-grant-durable',
      firstResult,
      replayResult,
    }, null, 2));
  } finally {
    await cleanupPlayer(pool, playerId).catch(() => undefined);
    await service.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

function buildGrantedInventoryItems() {
  return [
    {
      itemId: 'rat_tail',
      count: 2,
      rawPayload: {
        itemId: 'rat_tail',
        count: 2,
      },
    },
  ];
}

function buildNextInventoryItems() {
  return [
    {
      itemId: 'moon_grass',
      count: 1,
      rawPayload: {
        itemId: 'moon_grass',
        count: 1,
      },
    },
    {
      itemId: 'rat_tail',
      count: 2,
      rawPayload: {
        itemId: 'rat_tail',
        count: 2,
      },
    },
  ];
}

async function seedInventoryGrantFixture(
  pool: Pool,
  input: { playerId: string; runtimeOwnerId: string; sessionEpoch: number; now: number },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_inventory_item(
          item_instance_id,
          player_id,
          slot_index,
          item_id,
          count,
          raw_payload,
          updated_at
        )
        VALUES ($1, $2, 0, $3, $4, $5::jsonb, now())
      `,
      [
        `inventory:${input.playerId}:0`,
        input.playerId,
        'moon_grass',
        1,
        JSON.stringify({
          itemId: 'moon_grass',
          count: 1,
        }),
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function seedInstanceCatalogFixture(
  pool: Pool,
  input: {
    instanceId: string;
    assignedNodeId: string;
    leaseExpireAt: string;
    ownershipEpoch: number;
  },
): Promise<void> {
  await pool.query(
    `
      INSERT INTO instance_catalog(
        instance_id,
        template_id,
        instance_type,
        persistent_policy,
        status,
        runtime_status,
        assigned_node_id,
        lease_token,
        lease_expire_at,
        ownership_epoch,
        cluster_id,
        shard_key,
        route_domain,
        created_at,
        last_active_at,
        last_persisted_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10, $11, $12, $13, now(), now(), now())
      ON CONFLICT (instance_id)
      DO UPDATE SET
        assigned_node_id = EXCLUDED.assigned_node_id,
        lease_token = EXCLUDED.lease_token,
        lease_expire_at = EXCLUDED.lease_expire_at,
        ownership_epoch = EXCLUDED.ownership_epoch,
        status = EXCLUDED.status,
        runtime_status = EXCLUDED.runtime_status,
        last_active_at = now(),
        last_persisted_at = now()
    `,
    [
      input.instanceId,
      'public:yunlai_town',
      'public',
      'persistent',
      'active',
      'running',
      input.assignedNodeId,
      `lease:${input.instanceId}:${input.ownershipEpoch}`,
      input.leaseExpireAt,
      input.ownershipEpoch,
      'default',
      input.instanceId,
      'public',
    ],
  );
}

async function cleanupPlayer(pool: Pool, playerId: string): Promise<void> {
  await pool.query('DELETE FROM durable_operation_log WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM outbox_event WHERE partition_key = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM asset_audit_log WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_inventory_item WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_presence WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_recovery_watermark WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_catalog WHERE shard_key = $1', [`instance:${playerId}:lease`]).catch(() => undefined);
}

async function fetchRows(pool: Pool, sql: string, params: readonly unknown[]) {
  const result = await pool.query(sql, [...params]);
  return Array.isArray(result.rows) ? result.rows : [];
}

async function fetchSingleRow(pool: Pool, sql: string, params: readonly unknown[]) {
  const rows = await fetchRows(pool, sql, params);
  return rows[0] ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

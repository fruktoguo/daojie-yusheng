import { Pool } from 'pg';
import { MAX_INSTANCE_TICK_SPEED } from '@mud/shared';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
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
      answers: 'with-db 下会验证灵石背包扣减与密室燃料增加处于同一 durable 事务，并验证幂等回放和失败回滚',
      excludes: '未提供数据库时不证明真实事务',
    }, null, 2));
    return;
  }

  const stamp = `${Date.now().toString(36)}_${process.pid.toString(36)}`;
  const playerId = `time_chamber_fuel_${stamp}`;
  const runtimeOwnerId = `runtime:${playerId}`;
  const instanceId = `instance:${playerId}`;
  const buildingId = `building:${playerId}`;
  const chamberInstanceId = `time-chamber:${playerId}`;
  const operationId = `time-chamber-fuel:${playerId}:1`;
  const nodeId = `node:${playerId}`;
  const pool = new Pool({ connectionString: databaseUrl });
  const databasePoolProvider = new DatabasePoolProvider();
  const service = new DurableOperationService({ getNodeId: () => nodeId } as never, databasePoolProvider);

  try {
    await service.onModuleInit();
    await ensureTimeChamberTable(pool);
    await cleanup(pool, playerId, instanceId, buildingId);
    await seedFixture(pool, {
      playerId,
      runtimeOwnerId,
      instanceId,
      buildingId,
      chamberInstanceId,
      nodeId,
    });

    const mutation = buildMutation({
      operationId,
      playerId,
      runtimeOwnerId,
      instanceId,
      buildingId,
      chamberInstanceId,
      nodeId,
    });
    const firstResult = await service.grantInventoryItems(mutation);
    if (!firstResult.ok || firstResult.alreadyCommitted) {
      throw new Error(`密室燃料首次事务结果异常：${JSON.stringify(firstResult)}`);
    }
    await assertState(pool, playerId, instanceId, buildingId, 3, 72_100, 2);

    const replayResult = await service.grantInventoryItems(mutation);
    if (!replayResult.ok || !replayResult.alreadyCommitted) {
      throw new Error(`密室燃料幂等回放结果异常：${JSON.stringify(replayResult)}`);
    }
    await assertState(pool, playerId, instanceId, buildingId, 3, 72_100, 2);

    let rollbackRejected = false;
    try {
      await service.grantInventoryItems({
        ...mutation,
        operationId: `${operationId}:rollback`,
        sourceMutation: {
          ...mutation.sourceMutation,
          buildingId: `${buildingId}:missing`,
        },
        nextInventoryItems: [],
      });
    } catch (error) {
      rollbackRejected = String(error instanceof Error ? error.message : error).includes('time_chamber_state_not_found');
    }
    if (!rollbackRejected) {
      throw new Error('密室状态不存在时 durable 事务应拒绝并回滚');
    }
    await assertState(pool, playerId, instanceId, buildingId, 3, 72_100, 2);

    const audit = await pool.query(
      'SELECT action FROM asset_audit_log WHERE operation_id = $1 ORDER BY created_at ASC',
      [operationId],
    );
    const outbox = await pool.query(
      'SELECT topic, status FROM outbox_event WHERE operation_id = $1 ORDER BY created_at ASC',
      [operationId],
    );
    if (audit.rows?.[0]?.action !== 'transfer') {
      throw new Error(`密室燃料资产审计缺失：${JSON.stringify(audit.rows)}`);
    }
    if (outbox.rows?.[0]?.topic !== 'player.inventory.transferred' || outbox.rows?.[0]?.status !== 'ready') {
      throw new Error(`密室燃料 outbox 异常：${JSON.stringify(outbox.rows)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      case: 'time-chamber-durable-fuel',
      answers: '灵石扣减、密室燃料增加、watermark、outbox 和资产审计同事务提交；相同 operationId 回放不重复扣石或加油；密室状态缺失时整个事务回滚。',
      excludes: '不启动 socket 客户端，不证明控制台 DOM 交互。',
      completionMapping: 'release:proof:with-db.time-chamber-durable-fuel',
    }, null, 2));
  } finally {
    await cleanup(pool, playerId, instanceId, buildingId).catch(() => undefined);
    await service.onModuleDestroy().catch(() => undefined);
    await databasePoolProvider.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

function buildMutation(input: {
  operationId: string;
  playerId: string;
  runtimeOwnerId: string;
  instanceId: string;
  buildingId: string;
  chamberInstanceId: string;
  nodeId: string;
}) {
  return {
    operationId: input.operationId,
    playerId: input.playerId,
    expectedRuntimeOwnerId: input.runtimeOwnerId,
    expectedSessionEpoch: 7,
    expectedInstanceId: input.instanceId,
    expectedAssignedNodeId: input.nodeId,
    expectedOwnershipEpoch: 3,
    sourceType: 'time_chamber_fuel',
    sourceRefId: input.chamberInstanceId,
    inventoryAction: 'transfer' as const,
    grantedItems: [{
      itemId: 'spirit_stone',
      count: 2,
      rawPayload: { itemId: 'spirit_stone', count: 2 },
    }],
    nextInventoryItems: [{
      itemId: 'spirit_stone',
      count: 3,
      rawPayload: { itemId: 'spirit_stone', count: 3 },
    }],
    sourceMutation: {
      kind: 'time_chamber_fuel' as const,
      instanceId: input.instanceId,
      buildingId: input.buildingId,
      fuelUnits: 72_000,
    },
  };
}

async function ensureTimeChamberTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS instance_time_chamber_state (
      source_instance_id varchar(180) NOT NULL,
      building_id varchar(180) NOT NULL,
      chamber_instance_id varchar(180) NOT NULL UNIQUE,
      template_id varchar(180) NOT NULL,
      owner_player_id varchar(100) NOT NULL,
      display_name varchar(40) NOT NULL,
      size_tier varchar(16) NOT NULL CHECK (size_tier IN ('small', 'medium', 'large')),
      capacity integer NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 100),
      configured_speed integer NOT NULL DEFAULT 1 CHECK (configured_speed BETWEEN 1 AND ${MAX_INSTANCE_TICK_SPEED}),
      fuel_units bigint NOT NULL DEFAULT 0 CHECK (fuel_units >= 0),
      revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (source_instance_id, building_id)
    )
  `);
}

async function seedFixture(pool: Pool, input: {
  playerId: string;
  runtimeOwnerId: string;
  instanceId: string;
  buildingId: string;
  chamberInstanceId: string;
  nodeId: string;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO player_presence(player_id, online, in_world, last_heartbeat_at, runtime_owner_id, session_epoch, updated_at)
       VALUES ($1, true, true, $2, $3, 7, now())`,
      [input.playerId, Date.now(), input.runtimeOwnerId],
    );
    await client.query(
      `INSERT INTO player_inventory_item(item_instance_id, player_id, slot_index, item_id, count, raw_payload, updated_at)
       VALUES ($1, $2, 0, 'spirit_stone', 5, $3::jsonb, now())`,
      [`inventory:${input.playerId}:0`, input.playerId, JSON.stringify({ itemId: 'spirit_stone', count: 5 })],
    );
    await client.query(
      `INSERT INTO instance_catalog(
         instance_id, template_id, instance_type, persistent_policy, status, runtime_status,
         assigned_node_id, lease_token, lease_expire_at, ownership_epoch,
         cluster_id, shard_key, route_domain, created_at, last_active_at, last_persisted_at
       ) VALUES ($1, 'public:yunlai_town', 'public', 'persistent', 'active', 'running',
         $2, $3, $4::timestamptz, 3, 'default', $1, 'public', now(), now(), now())`,
      [input.instanceId, input.nodeId, `lease:${input.instanceId}`, new Date(Date.now() + 60_000).toISOString()],
    );
    await client.query(
      `INSERT INTO instance_time_chamber_state(
         source_instance_id, building_id, chamber_instance_id, template_id, owner_player_id,
         display_name, size_tier, capacity, configured_speed, fuel_units, revision
       ) VALUES ($1, $2, $3, $4, $5, '事务烟测密室', 'small', 1, 1, 100, 1)`,
      [input.instanceId, input.buildingId, input.chamberInstanceId, `template:${input.chamberInstanceId}`, input.playerId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function assertState(
  pool: Pool,
  playerId: string,
  instanceId: string,
  buildingId: string,
  expectedStoneCount: number,
  expectedFuelUnits: number,
  expectedRevision: number,
): Promise<void> {
  const inventory = await pool.query(
    'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
    [playerId],
  );
  const chamber = await pool.query(
    'SELECT fuel_units, revision FROM instance_time_chamber_state WHERE source_instance_id = $1 AND building_id = $2',
    [instanceId, buildingId],
  );
  if (inventory.rows.length !== 1 || inventory.rows[0]?.item_id !== 'spirit_stone' || Number(inventory.rows[0]?.count) !== expectedStoneCount) {
    throw new Error(`灵石背包状态异常：${JSON.stringify(inventory.rows)}`);
  }
  if (Number(chamber.rows?.[0]?.fuel_units) !== expectedFuelUnits || Number(chamber.rows?.[0]?.revision) !== expectedRevision) {
    throw new Error(`密室燃料状态异常：${JSON.stringify(chamber.rows)}`);
  }
}

async function cleanup(pool: Pool, playerId: string, instanceId: string, buildingId: string): Promise<void> {
  await pool.query('DELETE FROM outbox_event WHERE partition_key = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM asset_audit_log WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM durable_operation_log WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_recovery_watermark WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_inventory_item WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_presence WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query(
    'DELETE FROM instance_time_chamber_state WHERE source_instance_id = $1 AND building_id = $2',
    [instanceId, buildingId],
  ).catch(() => undefined);
  await pool.query('DELETE FROM instance_catalog WHERE instance_id = $1', [instanceId]).catch(() => undefined);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});

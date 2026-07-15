import { Pool } from 'pg';
import {
  calculateTimeChamberOperatingCostPerHour,
  MAX_INSTANCE_TICK_SPEED,
} from '@mud/shared';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { DurableOperationService } from '../persistence/durable-operation.service';
import { TimeChamberAdmissionPolicy } from '../runtime/building/time-chamber-admission.policy';
import { TimeChamberRuntimeService } from '../runtime/building/time-chamber-runtime.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: 'with-db 下会验证投燃料、购买与续期时段、收益入账和领取均与背包变更处于同一 durable 事务，并验证重叠时段增量计费、幂等回放和失败回滚',
      excludes: '未提供数据库时不证明真实事务',
    }, null, 2));
    return;
  }

  const stamp = `${Date.now().toString(36)}_${process.pid.toString(36)}`;
  const ownerPlayerId = `time_chamber_owner_${stamp}`;
  const renterPlayerId = `time_chamber_renter_${stamp}`;
  const coveredPlayerId = `time_chamber_covered_${stamp}`;
  const ownerRuntimeOwnerId = `runtime:${ownerPlayerId}`;
  const renterRuntimeOwnerId = `runtime:${renterPlayerId}`;
  const instanceId = `instance:${ownerPlayerId}`;
  const buildingId = `building:${ownerPlayerId}`;
  const chamberInstanceId = `time-chamber:${ownerPlayerId}`;
  const fuelOperationId = `time-chamber-fuel:${ownerPlayerId}:1`;
  const activationOperationId = `time-chamber-activation:${renterPlayerId}:1`;
  const extensionOperationId = `time-chamber-activation:${renterPlayerId}:2`;
  const ownerActivationOperationId = `time-chamber-activation:${ownerPlayerId}:1`;
  const revenueOperationId = `time-chamber-revenue:${ownerPlayerId}:1`;
  const nodeId = `node:${ownerPlayerId}`;
  const pool = new Pool({ connectionString: databaseUrl });
  const databasePoolProvider = new DatabasePoolProvider();
  const service = new DurableOperationService({ getNodeId: () => nodeId } as never, databasePoolProvider);

  try {
    await service.onModuleInit();
    await ensureTimeChamberTable(pool);
    await cleanup(pool, [ownerPlayerId, renterPlayerId], instanceId, chamberInstanceId, buildingId);
    await seedFixture(pool, {
      ownerPlayerId,
      renterPlayerId,
      ownerRuntimeOwnerId,
      renterRuntimeOwnerId,
      instanceId,
      buildingId,
      chamberInstanceId,
      nodeId,
    });

    const fuelMutation = buildFuelMutation({
      operationId: fuelOperationId,
      playerId: ownerPlayerId,
      runtimeOwnerId: ownerRuntimeOwnerId,
      instanceId,
      buildingId,
      chamberInstanceId,
      nodeId,
    });
    const firstResult = await service.grantInventoryItems(fuelMutation);
    if (!firstResult.ok || firstResult.alreadyCommitted) {
      throw new Error(`密室燃料首次事务结果异常：${JSON.stringify(firstResult)}`);
    }
    await assertInventoryCount(pool, ownerPlayerId, 0);
    await assertInventoryCount(pool, renterPlayerId, 20);
    await assertChamberState(pool, instanceId, buildingId, {
      fuelUnits: 10_072_000,
      revenueSpiritStones: 0,
      revision: 2,
    });

    const replayResult = await service.grantInventoryItems(fuelMutation);
    if (!replayResult.ok || !replayResult.alreadyCommitted) {
      throw new Error(`密室燃料幂等回放结果异常：${JSON.stringify(replayResult)}`);
    }
    await assertInventoryCount(pool, ownerPlayerId, 0);
    await assertChamberState(pool, instanceId, buildingId, {
      fuelUnits: 10_072_000,
      revenueSpiritStones: 0,
      revision: 2,
    });

    let rollbackRejected = false;
    try {
      await service.grantInventoryItems({
        ...fuelMutation,
        operationId: `${fuelOperationId}:rollback`,
        playerId: renterPlayerId,
        expectedRuntimeOwnerId: renterRuntimeOwnerId,
        grantedItems: [buildSpiritStoneSnapshot(2)],
        nextInventoryItems: [buildSpiritStoneSnapshot(18)],
        sourceMutation: {
          ...fuelMutation.sourceMutation,
          buildingId: `${buildingId}:missing`,
        },
      });
    } catch (error) {
      rollbackRejected = String(error instanceof Error ? error.message : error).includes('time_chamber_state_not_found');
    }
    if (!rollbackRejected) {
      throw new Error('密室状态不存在时 durable 事务应拒绝并回滚');
    }
    await assertInventoryCount(pool, ownerPlayerId, 0);
    await assertInventoryCount(pool, renterPlayerId, 20);
    await assertChamberState(pool, instanceId, buildingId, {
      fuelUnits: 10_072_000,
      revenueSpiritStones: 0,
      revision: 2,
    });

    const audit = await pool.query(
      'SELECT action FROM asset_audit_log WHERE operation_id = $1 ORDER BY created_at ASC',
      [fuelOperationId],
    );
    const outbox = await pool.query(
      'SELECT topic, status FROM outbox_event WHERE operation_id = $1 ORDER BY created_at ASC',
      [fuelOperationId],
    );
    if (audit.rows?.[0]?.action !== 'transfer') {
      throw new Error(`密室燃料资产审计缺失：${JSON.stringify(audit.rows)}`);
    }
    if (outbox.rows?.[0]?.topic !== 'player.inventory.transferred' || outbox.rows?.[0]?.status !== 'ready') {
      throw new Error(`密室燃料 outbox 异常：${JSON.stringify(outbox.rows)}`);
    }

    await seedCoveredUsage(pool, {
      instanceId,
      buildingId,
      chamberInstanceId,
      playerId: coveredPlayerId,
    });
    const activationMutation = buildActivationMutation({
      operationId: activationOperationId,
      playerId: renterPlayerId,
      runtimeOwnerId: renterRuntimeOwnerId,
      instanceId,
      buildingId,
      chamberInstanceId,
      nodeId,
      currentStoneCount: 20,
      chargedSpiritStones: 3,
      durationHours: 1,
      expectedRevision: 2,
    });
    const activationResult = await service.grantInventoryItems(activationMutation);
    if (!activationResult.ok || activationResult.alreadyCommitted) {
      throw new Error(`密室首次开启事务结果异常：${JSON.stringify(activationResult)}`);
    }
    await assertInventoryCount(pool, renterPlayerId, 17);
    await assertChamberState(pool, instanceId, buildingId, {
      fuelUnits: 10_072_000,
      revenueSpiritStones: 3,
      revision: 3,
    });
    const firstUsage = await readUsage(pool, instanceId, buildingId, renterPlayerId);
    if (firstUsage.paidSpiritStones !== 3 || firstUsage.operatingFuelUnits !== 0) {
      throw new Error(`被既有时段覆盖的首次开启不应重复预扣运行成本：${JSON.stringify(firstUsage)}`);
    }
    const activationReplay = await service.grantInventoryItems(activationMutation);
    if (!activationReplay.ok || !activationReplay.alreadyCommitted) {
      throw new Error(`密室首次开启幂等回放异常：${JSON.stringify(activationReplay)}`);
    }
    await assertInventoryCount(pool, renterPlayerId, 17);

    const roomEndBeforeExtension = await readLatestUsageExpiry(pool, instanceId, buildingId);
    const extensionMutation = buildActivationMutation({
      operationId: extensionOperationId,
      playerId: renterPlayerId,
      runtimeOwnerId: renterRuntimeOwnerId,
      instanceId,
      buildingId,
      chamberInstanceId,
      nodeId,
      currentStoneCount: 17,
      chargedSpiritStones: 6,
      durationHours: 2,
      expectedRevision: 3,
    });
    const extensionResult = await service.grantInventoryItems(extensionMutation);
    if (!extensionResult.ok || extensionResult.alreadyCommitted) {
      throw new Error(`密室续期事务结果异常：${JSON.stringify(extensionResult)}`);
    }
    const extendedUsage = await readUsage(pool, instanceId, buildingId, renterPlayerId);
    const additionalActiveMs = Math.max(0, extendedUsage.expiresAtMs - roomEndBeforeExtension);
    const operatingCostPerHour = calculateTimeChamberOperatingCostPerHour(2, 3);
    const expectedAdditionalFuelUnits = Number((
      BigInt(operatingCostPerHour) * 36_000n * BigInt(additionalActiveMs) + 3_600_000n - 1n
    ) / 3_600_000n);
    if (additionalActiveMs <= 0
      || extendedUsage.paidSpiritStones !== 9
      || extendedUsage.operatingFuelUnits !== expectedAdditionalFuelUnits) {
      throw new Error(`密室续期增量区间计费异常：${JSON.stringify({ roomEndBeforeExtension, additionalActiveMs, expectedAdditionalFuelUnits, extendedUsage })}`);
    }
    const fuelAfterExtension = 10_072_000 - expectedAdditionalFuelUnits;
    await assertInventoryCount(pool, renterPlayerId, 11);
    await assertChamberState(pool, instanceId, buildingId, {
      fuelUnits: fuelAfterExtension,
      revenueSpiritStones: 9,
      revision: 4,
    });
    const extensionReplay = await service.grantInventoryItems(extensionMutation);
    if (!extensionReplay.ok || !extensionReplay.alreadyCommitted) {
      throw new Error(`密室续期幂等回放异常：${JSON.stringify(extensionReplay)}`);
    }

    let staleRevisionRejected = false;
    try {
      await service.grantInventoryItems({
        ...buildActivationMutation({
          operationId: `${extensionOperationId}:stale`,
          playerId: renterPlayerId,
          runtimeOwnerId: renterRuntimeOwnerId,
          instanceId,
          buildingId,
          chamberInstanceId,
          nodeId,
          currentStoneCount: 11,
          chargedSpiritStones: 3,
          durationHours: 1,
          expectedRevision: 3,
        }),
      });
    } catch (error) {
      staleRevisionRejected = String(error instanceof Error ? error.message : error).includes('time_chamber_revision_conflict');
    }
    if (!staleRevisionRejected) throw new Error('旧 revision 的密室开启事务应拒绝并回滚');
    await assertInventoryCount(pool, renterPlayerId, 11);
    await assertChamberState(pool, instanceId, buildingId, {
      fuelUnits: fuelAfterExtension,
      revenueSpiritStones: 9,
      revision: 4,
    });

    const ownerActivationMutation = buildActivationMutation({
      operationId: ownerActivationOperationId,
      playerId: ownerPlayerId,
      runtimeOwnerId: ownerRuntimeOwnerId,
      instanceId,
      buildingId,
      chamberInstanceId,
      nodeId,
      currentStoneCount: 0,
      chargedSpiritStones: 0,
      durationHours: 1,
      expectedRevision: 4,
    });
    const ownerActivationResult = await service.grantInventoryItems(ownerActivationMutation);
    if (!ownerActivationResult.ok || ownerActivationResult.alreadyCommitted) {
      throw new Error(`建造者零收费开启事务异常：${JSON.stringify(ownerActivationResult)}`);
    }
    await assertInventoryCount(pool, ownerPlayerId, 0);
    await assertChamberState(pool, instanceId, buildingId, {
      fuelUnits: fuelAfterExtension,
      revenueSpiritStones: 9,
      revision: 5,
    });

    const revenueMutation = buildRevenueMutation({
      operationId: revenueOperationId,
      playerId: ownerPlayerId,
      runtimeOwnerId: ownerRuntimeOwnerId,
      instanceId,
      buildingId,
      chamberInstanceId,
      nodeId,
      claimedSpiritStones: 5,
      expectedRevision: 5,
    });
    const revenueResult = await service.grantInventoryItems(revenueMutation);
    if (!revenueResult.ok || revenueResult.alreadyCommitted) {
      throw new Error(`密室收益领取事务异常：${JSON.stringify(revenueResult)}`);
    }
    await assertInventoryCount(pool, ownerPlayerId, 5);
    await assertChamberState(pool, instanceId, buildingId, {
      fuelUnits: fuelAfterExtension,
      revenueSpiritStones: 4,
      revision: 6,
    });
    const revenueReplay = await service.grantInventoryItems(revenueMutation);
    if (!revenueReplay.ok || !revenueReplay.alreadyCommitted) {
      throw new Error(`密室收益领取幂等回放异常：${JSON.stringify(revenueReplay)}`);
    }

    await pool.query(
      'DELETE FROM instance_time_chamber_usage WHERE source_instance_id = $1 AND building_id = $2',
      [instanceId, buildingId],
    );

    await assertDeconstructLeaseFence(pool, {
      instanceId,
      buildingId,
      chamberInstanceId,
      playerId: ownerPlayerId,
      nodeId,
    });

    console.log(JSON.stringify({
      ok: true,
      case: 'time-chamber-durable-fuel',
      answers: '投燃料支持消耗最后一组灵石；租客付费、重叠时段增量预扣、收益入账、建造者零收费开启与收益领取均和背包快照同事务提交；相同 operationId 回放不重复变更资产；revision 冲突完整回滚；拆除仍受远端 lease 与 ownership epoch 围栏保护。',
      excludes: '不启动 socket 客户端，不证明控制台 DOM 交互。',
      completionMapping: 'release:proof:with-db.time-chamber-durable-fuel',
    }, null, 2));
  } finally {
    await cleanup(pool, [ownerPlayerId, renterPlayerId], instanceId, chamberInstanceId, buildingId).catch(() => undefined);
    await service.onModuleDestroy().catch(() => undefined);
    await databasePoolProvider.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

function buildFuelMutation(input: {
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
    grantedItems: [buildSpiritStoneSnapshot(2)],
    nextInventoryItems: [],
    sourceMutation: {
      kind: 'time_chamber_fuel' as const,
      instanceId: input.instanceId,
      buildingId: input.buildingId,
      fuelUnits: 72_000,
    },
  };
}

function buildActivationMutation(input: {
  operationId: string;
  playerId: string;
  runtimeOwnerId: string;
  instanceId: string;
  buildingId: string;
  chamberInstanceId: string;
  nodeId: string;
  currentStoneCount: number;
  chargedSpiritStones: number;
  durationHours: number;
  expectedRevision: number;
}) {
  const nextStoneCount = input.currentStoneCount - input.chargedSpiritStones;
  return {
    operationId: input.operationId,
    playerId: input.playerId,
    expectedRuntimeOwnerId: input.runtimeOwnerId,
    expectedSessionEpoch: 7,
    expectedInstanceId: input.instanceId,
    expectedAssignedNodeId: input.nodeId,
    expectedOwnershipEpoch: 3,
    sourceType: 'time_chamber_activation',
    sourceRefId: input.chamberInstanceId,
    inventoryAction: 'transfer' as const,
    grantedItems: input.chargedSpiritStones > 0 ? [buildSpiritStoneSnapshot(input.chargedSpiritStones)] : [],
    nextInventoryItems: nextStoneCount > 0 ? [buildSpiritStoneSnapshot(nextStoneCount)] : [],
    sourceMutation: {
      kind: 'time_chamber_activation' as const,
      instanceId: input.instanceId,
      buildingId: input.buildingId,
      chamberInstanceId: input.chamberInstanceId,
      playerId: input.playerId,
      durationHours: input.durationHours,
      expectedRevision: input.expectedRevision,
      chargedSpiritStones: input.chargedSpiritStones,
      fuelUnitsPerSpiritStone: 36_000,
    },
  };
}

function buildRevenueMutation(input: {
  operationId: string;
  playerId: string;
  runtimeOwnerId: string;
  instanceId: string;
  buildingId: string;
  chamberInstanceId: string;
  nodeId: string;
  claimedSpiritStones: number;
  expectedRevision: number;
}) {
  return {
    operationId: input.operationId,
    playerId: input.playerId,
    expectedRuntimeOwnerId: input.runtimeOwnerId,
    expectedSessionEpoch: 7,
    expectedInstanceId: input.instanceId,
    expectedAssignedNodeId: input.nodeId,
    expectedOwnershipEpoch: 3,
    sourceType: 'time_chamber_revenue_claim',
    sourceRefId: input.chamberInstanceId,
    inventoryAction: 'grant' as const,
    grantedItems: [buildSpiritStoneSnapshot(input.claimedSpiritStones)],
    nextInventoryItems: [buildSpiritStoneSnapshot(input.claimedSpiritStones)],
    sourceMutation: {
      kind: 'time_chamber_revenue' as const,
      instanceId: input.instanceId,
      buildingId: input.buildingId,
      ownerPlayerId: input.playerId,
      expectedRevision: input.expectedRevision,
      claimedSpiritStones: input.claimedSpiritStones,
    },
  };
}

function buildSpiritStoneSnapshot(count: number) {
  return {
    itemId: 'spirit_stone',
    count,
    rawPayload: { itemId: 'spirit_stone', count },
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
      hourly_fee bigint NOT NULL DEFAULT 0 CHECK (hourly_fee BETWEEN 0 AND 10000000),
      fuel_units bigint NOT NULL DEFAULT 0 CHECK (fuel_units >= 0),
      revenue_spirit_stones bigint NOT NULL DEFAULT 0 CHECK (revenue_spirit_stones >= 0),
      revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (source_instance_id, building_id)
    )
  `);
  await pool.query('ALTER TABLE instance_time_chamber_state ADD COLUMN IF NOT EXISTS hourly_fee bigint NOT NULL DEFAULT 0');
  await pool.query('ALTER TABLE instance_time_chamber_state ADD COLUMN IF NOT EXISTS revenue_spirit_stones bigint NOT NULL DEFAULT 0');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS instance_time_chamber_usage (
      source_instance_id varchar(180) NOT NULL,
      building_id varchar(180) NOT NULL,
      chamber_instance_id varchar(180) NOT NULL,
      player_id varchar(100) NOT NULL,
      started_at_ms bigint NOT NULL CHECK (started_at_ms >= 0),
      expires_at_ms bigint NOT NULL CHECK (expires_at_ms > started_at_ms),
      quoted_hourly_fee bigint NOT NULL DEFAULT 0 CHECK (quoted_hourly_fee >= 0),
      paid_spirit_stones bigint NOT NULL DEFAULT 0 CHECK (paid_spirit_stones >= 0),
      operating_fuel_units bigint NOT NULL DEFAULT 0 CHECK (operating_fuel_units >= 0),
      last_operation_id varchar(180) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (source_instance_id, building_id, player_id),
      FOREIGN KEY (source_instance_id, building_id)
        REFERENCES instance_time_chamber_state(source_instance_id, building_id)
        ON DELETE CASCADE
    )
  `);
}

async function seedFixture(pool: Pool, input: {
  ownerPlayerId: string;
  renterPlayerId: string;
  ownerRuntimeOwnerId: string;
  renterRuntimeOwnerId: string;
  instanceId: string;
  buildingId: string;
  chamberInstanceId: string;
  nodeId: string;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [playerId, runtimeOwnerId] of [
      [input.ownerPlayerId, input.ownerRuntimeOwnerId],
      [input.renterPlayerId, input.renterRuntimeOwnerId],
    ] as const) {
      await client.query(
        `INSERT INTO player_presence(player_id, online, in_world, last_heartbeat_at, runtime_owner_id, session_epoch, updated_at)
         VALUES ($1, true, true, $2, $3, 7, now())`,
        [playerId, Date.now(), runtimeOwnerId],
      );
    }
    for (const [playerId, count] of [
      [input.ownerPlayerId, 2],
      [input.renterPlayerId, 20],
    ] as const) {
      await client.query(
        `INSERT INTO player_inventory_item(item_instance_id, player_id, slot_index, item_id, count, raw_payload, updated_at)
         VALUES ($1, $2, 0, 'spirit_stone', $3, $4::jsonb, now())`,
        [`inventory:${playerId}:0`, playerId, count, JSON.stringify({ itemId: 'spirit_stone', count })],
      );
    }
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
         display_name, size_tier, capacity, configured_speed, hourly_fee,
         fuel_units, revenue_spirit_stones, revision
       ) VALUES ($1, $2, $3, $4, $5, '事务烟测密室', 'small', 3, 2, 3, 10000000, 0, 1)`,
      [input.instanceId, input.buildingId, input.chamberInstanceId, `template:${input.chamberInstanceId}`, input.ownerPlayerId],
    );
    await client.query(
      `INSERT INTO instance_catalog(
         instance_id, template_id, instance_type, persistent_policy, status, runtime_status,
         assigned_node_id, lease_token, lease_expire_at, ownership_epoch, metadata_version,
         cluster_id, shard_key, route_domain, created_at, last_active_at, last_persisted_at
       ) VALUES ($1, $2, 'time_chamber', 'persistent', 'active', 'leased',
         $3, $4, $5::timestamptz, 5, 5, 'default', $1, $6, now(), now(), now())`,
      [
        input.chamberInstanceId,
        `template:${input.chamberInstanceId}`,
        `node:remote:${input.ownerPlayerId}`,
        `lease:remote:${input.ownerPlayerId}`,
        new Date(Date.now() + 60_000).toISOString(),
        `time-chamber:${input.chamberInstanceId}`,
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

async function seedCoveredUsage(pool: Pool, input: {
  instanceId: string;
  buildingId: string;
  chamberInstanceId: string;
  playerId: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO instance_time_chamber_usage(
       source_instance_id, building_id, chamber_instance_id, player_id,
       started_at_ms, expires_at_ms, quoted_hourly_fee, paid_spirit_stones,
       operating_fuel_units, last_operation_id
     )
     SELECT $1, $2, $3, $4, now_ms, now_ms + 7200000, 3, 0, 0, $5
       FROM (SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now_ms) clock`,
    [input.instanceId, input.buildingId, input.chamberInstanceId, input.playerId, `covered:${input.playerId}`],
  );
}

async function assertInventoryCount(pool: Pool, playerId: string, expectedStoneCount: number): Promise<void> {
  const inventory = await pool.query(
    'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
    [playerId],
  );
  if (expectedStoneCount === 0) {
    if (inventory.rows.length !== 0) throw new Error(`灵石背包应为空：${JSON.stringify(inventory.rows)}`);
    return;
  }
  if (inventory.rows.length !== 1
    || inventory.rows[0]?.item_id !== 'spirit_stone'
    || Number(inventory.rows[0]?.count) !== expectedStoneCount) {
    throw new Error(`灵石背包状态异常：${JSON.stringify(inventory.rows)}`);
  }
}

async function assertChamberState(
  pool: Pool,
  instanceId: string,
  buildingId: string,
  expected: { fuelUnits: number; revenueSpiritStones: number; revision: number },
): Promise<void> {
  const chamber = await pool.query(
    `SELECT fuel_units, revenue_spirit_stones, revision
       FROM instance_time_chamber_state
      WHERE source_instance_id = $1 AND building_id = $2`,
    [instanceId, buildingId],
  );
  if (Number(chamber.rows?.[0]?.fuel_units) !== expected.fuelUnits
    || Number(chamber.rows?.[0]?.revenue_spirit_stones) !== expected.revenueSpiritStones
    || Number(chamber.rows?.[0]?.revision) !== expected.revision) {
    throw new Error(`密室经营状态异常：${JSON.stringify(chamber.rows)}`);
  }
}

async function readUsage(pool: Pool, instanceId: string, buildingId: string, playerId: string): Promise<{
  expiresAtMs: number;
  paidSpiritStones: number;
  operatingFuelUnits: number;
}> {
  const result = await pool.query(
    `SELECT expires_at_ms, paid_spirit_stones, operating_fuel_units
       FROM instance_time_chamber_usage
      WHERE source_instance_id = $1 AND building_id = $2 AND player_id = $3`,
    [instanceId, buildingId, playerId],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`密室使用时段缺失：${playerId}`);
  return {
    expiresAtMs: Number(row.expires_at_ms),
    paidSpiritStones: Number(row.paid_spirit_stones),
    operatingFuelUnits: Number(row.operating_fuel_units),
  };
}

async function readLatestUsageExpiry(pool: Pool, instanceId: string, buildingId: string): Promise<number> {
  const result = await pool.query(
    `SELECT max(expires_at_ms)::bigint AS expires_at_ms
       FROM instance_time_chamber_usage
      WHERE source_instance_id = $1 AND building_id = $2`,
    [instanceId, buildingId],
  );
  const expiresAtMs = Number(result.rows?.[0]?.expires_at_ms);
  if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= 0) throw new Error('密室使用截止时间读取失败');
  return expiresAtMs;
}

async function assertDeconstructLeaseFence(pool: Pool, input: {
  instanceId: string;
  buildingId: string;
  chamberInstanceId: string;
  playerId: string;
  nodeId: string;
}): Promise<void> {
  const localLeaseToken = `lease:local:${input.playerId}`;
  const persistedState = await pool.query(
    `SELECT capacity, configured_speed, hourly_fee, fuel_units, revenue_spirit_stones, revision
       FROM instance_time_chamber_state
      WHERE source_instance_id = $1 AND building_id = $2`,
    [input.instanceId, input.buildingId],
  );
  const stateRow = persistedState.rows[0];
  if (!stateRow) throw new Error('拆除围栏测试缺少密室状态');
  const expectedRevision = Number(stateRow.revision);
  const state = {
    sourceInstanceId: input.instanceId,
    buildingId: input.buildingId,
    chamberInstanceId: input.chamberInstanceId,
    templateId: `template:${input.chamberInstanceId}`,
    ownerPlayerId: input.playerId,
    displayName: '事务烟测密室',
    sizeTier: 'small',
    capacity: Number(stateRow.capacity),
    configuredSpeed: Number(stateRow.configured_speed),
    databaseFuelUnits: Number(stateRow.fuel_units),
    hourlyFee: Number(stateRow.hourly_fee),
    revenueSpiritStones: Number(stateRow.revenue_spirit_stones),
    fuelUnitsPerSpiritStone: 36_000,
    maxSpeed: MAX_INSTANCE_TICK_SPEED,
    allowedSizeTiers: ['small', 'medium', 'large'],
    revision: expectedRevision,
  };
  const runtimeInstance = {
    meta: {
      assignedNodeId: input.nodeId,
      leaseToken: localLeaseToken,
      ownershipEpoch: 4,
      runtimeStatus: 'leased',
      status: 'active',
    },
    listPlayerIds: () => [],
    canReplaceEmptyRuntimeTemplate: () => true,
  };
  const runtime = {
    getInstanceRuntime: (instanceId: string) => instanceId === input.chamberInstanceId ? runtimeInstance : null,
    isInstanceLeaseWritable: () => true,
    worldRuntimeInstanceStateService: { deleteInstanceRuntime(): void {} },
    worldRuntimeTickProgressService: { clearInstance(): void {} },
    worldRuntimeLootContainerService: { removeInstanceState(): void {} },
    runtimeEventBusService: { discardInstance(): void {} },
    worldRuntimeFormationService: {
      listRuntimeFormations: () => [],
      releaseInstance(): void {},
    },
  };
  const timeChamberService = new TimeChamberRuntimeService(
    {} as never,
    { unregisterRuntimeMapTemplate(): boolean { return true; } } as never,
    {
      playerDomainPersistenceService: {
        isEnabled: () => true,
        hasRetainedPlayersInInstance: async () => false,
      },
    } as never,
    {} as never,
    { registerOrUpdate(): void {}, unregister(): void {} } as never,
    new TimeChamberAdmissionPolicy(),
  );
  const internals = timeChamberService as any;
  internals.pool = pool;
  internals.enabled = true;
  internals.storeState(state);

  const rejected = await timeChamberService.prepareDeconstruct(input.instanceId, input.buildingId, runtime);
  if (rejected.ok !== false || rejected.reason !== 'time_chamber_unavailable') {
    throw new Error(`远端活跃 lease 未阻止密室拆除：${JSON.stringify(rejected)}`);
  }
  const retained = await pool.query(
    `SELECT c.status, c.runtime_status, c.assigned_node_id, c.ownership_epoch, s.revision
       FROM instance_catalog c
       JOIN instance_time_chamber_state s ON s.chamber_instance_id = c.instance_id
      WHERE c.instance_id = $1`,
    [input.chamberInstanceId],
  );
  if (retained.rows.length !== 1
    || retained.rows[0]?.status !== 'active'
    || retained.rows[0]?.runtime_status !== 'leased'
    || retained.rows[0]?.assigned_node_id !== `node:remote:${input.playerId}`
    || Number(retained.rows[0]?.ownership_epoch) !== 5
    || Number(retained.rows[0]?.revision) !== expectedRevision) {
    throw new Error(`远端 lease 冲突后密室状态被误改：${JSON.stringify(retained.rows)}`);
  }

  await pool.query(
    `UPDATE instance_catalog
        SET assigned_node_id = $2, lease_token = $3,
            lease_expire_at = $4::timestamptz, ownership_epoch = 6, metadata_version = 6
      WHERE instance_id = $1`,
    [input.chamberInstanceId, input.nodeId, localLeaseToken, new Date(Date.now() + 60_000).toISOString()],
  );
  runtimeInstance.meta.ownershipEpoch = 6;
  const completed = await timeChamberService.prepareDeconstruct(input.instanceId, input.buildingId, runtime);
  if (completed.ok !== true) {
    throw new Error(`本地精确 lease 未能完成密室拆除：${JSON.stringify(completed)}`);
  }
  const destroyed = await pool.query(
    `SELECT status, runtime_status, assigned_node_id, lease_token, ownership_epoch, metadata_version
       FROM instance_catalog WHERE instance_id = $1`,
    [input.chamberInstanceId],
  );
  const remainingState = await pool.query(
    'SELECT 1 FROM instance_time_chamber_state WHERE source_instance_id = $1 AND building_id = $2',
    [input.instanceId, input.buildingId],
  );
  if (destroyed.rows.length !== 1
    || destroyed.rows[0]?.status !== 'destroyed'
    || destroyed.rows[0]?.runtime_status !== 'stopped'
    || destroyed.rows[0]?.assigned_node_id !== null
    || destroyed.rows[0]?.lease_token !== null
    || Number(destroyed.rows[0]?.ownership_epoch) !== 7
    || Number(destroyed.rows[0]?.metadata_version) < 7
    || remainingState.rows.length !== 0) {
    throw new Error(`密室拆除事务结果异常：catalog=${JSON.stringify(destroyed.rows)} state=${JSON.stringify(remainingState.rows)}`);
  }
}

async function cleanup(
  pool: Pool,
  playerIds: string[],
  instanceId: string,
  chamberInstanceId: string,
  buildingId: string,
): Promise<void> {
  await pool.query('DELETE FROM outbox_event WHERE partition_key = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM asset_audit_log WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM durable_operation_log WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM player_recovery_watermark WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM player_inventory_item WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM player_presence WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query(
    'DELETE FROM instance_time_chamber_usage WHERE source_instance_id = $1 AND building_id = $2',
    [instanceId, buildingId],
  ).catch(() => undefined);
  await pool.query(
    'DELETE FROM instance_time_chamber_state WHERE source_instance_id = $1 AND building_id = $2',
    [instanceId, buildingId],
  ).catch(() => undefined);
  await pool.query('DELETE FROM instance_catalog WHERE instance_id = ANY($1::varchar[])', [[instanceId, chamberInstanceId]]).catch(() => undefined);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});

import { Pool } from 'pg';
import {
  calculateTimeChamberActivationCost,
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
      answers: 'with-db 下会验证开启者直接付费、全室开启锁、幂等回放、失败回滚和拆除租约围栏',
      excludes: '未提供数据库时不证明真实事务',
    }, null, 2));
    return;
  }

  const stamp = `${Date.now().toString(36)}_${process.pid.toString(36)}`;
  const ownerPlayerId = `time_chamber_owner_${stamp}`;
  const openerPlayerId = `time_chamber_opener_${stamp}`;
  const ownerRuntimeOwnerId = `runtime:${ownerPlayerId}`;
  const openerRuntimeOwnerId = `runtime:${openerPlayerId}`;
  const instanceId = `instance:${ownerPlayerId}`;
  const buildingId = `building:${ownerPlayerId}`;
  const chamberInstanceId = `time-chamber:${ownerPlayerId}`;
  const activationOperationId = `time-chamber-activation:${openerPlayerId}:1`;
  const ownerActivationOperationId = `time-chamber-activation:${ownerPlayerId}:1`;
  const nodeId = `node:${ownerPlayerId}`;
  const pool = new Pool({ connectionString: databaseUrl });
  const databasePoolProvider = new DatabasePoolProvider();
  const service = new DurableOperationService({ getNodeId: () => nodeId } as never, databasePoolProvider);
  const activationCost = calculateTimeChamberActivationCost(2, 3, 1);

  try {
    await service.onModuleInit();
    await ensureTimeChamberTable(pool);
    await cleanup(pool, [ownerPlayerId, openerPlayerId], instanceId, chamberInstanceId, buildingId);
    await seedFixture(pool, {
      ownerPlayerId,
      openerPlayerId,
      ownerRuntimeOwnerId,
      openerRuntimeOwnerId,
      instanceId,
      buildingId,
      chamberInstanceId,
      nodeId,
    });

    const activationMutation = buildActivationMutation({
      operationId: activationOperationId,
      playerId: openerPlayerId,
      runtimeOwnerId: openerRuntimeOwnerId,
      instanceId,
      buildingId,
      chamberInstanceId,
      nodeId,
      currentStoneCount: 500,
      chargedSpiritStones: activationCost,
      durationHours: 1,
      expectedRevision: 1,
    });
    const activationResult = await service.grantInventoryItems(activationMutation);
    if (!activationResult.ok || activationResult.alreadyCommitted) {
      throw new Error(`密室首次开启事务结果异常：${JSON.stringify(activationResult)}`);
    }
    await assertInventoryCount(pool, openerPlayerId, 500 - activationCost);
    const firstState = await readChamberState(pool, instanceId, buildingId);
    if (
      firstState.revision !== 2
      || firstState.activationPlayerId !== openerPlayerId
      || firstState.activationSpiritStones !== activationCost
      || firstState.activeStartedAt === null
      || firstState.activeExpiresAt === null
      || firstState.activeExpiresAt - firstState.activeStartedAt !== 3_600_000
    ) {
      throw new Error(`密室全室开启状态异常：${JSON.stringify(firstState)}`);
    }

    const replayResult = await service.grantInventoryItems(activationMutation);
    if (!replayResult.ok || !replayResult.alreadyCommitted) {
      throw new Error(`密室开启幂等回放异常：${JSON.stringify(replayResult)}`);
    }
    await assertInventoryCount(pool, openerPlayerId, 500 - activationCost);

    let repeatedActivationRejected = false;
    try {
      await service.grantInventoryItems(buildActivationMutation({
        operationId: `${activationOperationId}:repeat`,
        playerId: openerPlayerId,
        runtimeOwnerId: openerRuntimeOwnerId,
        instanceId,
        buildingId,
        chamberInstanceId,
        nodeId,
        currentStoneCount: 500 - activationCost,
        chargedSpiritStones: activationCost,
        durationHours: 1,
        expectedRevision: 2,
      }));
    } catch (error) {
      repeatedActivationRejected = String(error instanceof Error ? error.message : error).includes('time_chamber_already_active');
    }
    if (!repeatedActivationRejected) throw new Error('密室开启期间必须拒绝重复开启或续时');
    await assertInventoryCount(pool, openerPlayerId, 500 - activationCost);

    await pool.query(
      `UPDATE instance_time_chamber_state
          SET active_started_at_ms = NULL, active_expires_at_ms = NULL,
              activation_player_id = NULL, activation_spirit_stones = 0,
              revision = revision + 1
        WHERE source_instance_id = $1 AND building_id = $2`,
      [instanceId, buildingId],
    );
    let priceMismatchRejected = false;
    try {
      await service.grantInventoryItems(buildActivationMutation({
        operationId: `${activationOperationId}:wrong-price`,
        playerId: openerPlayerId,
        runtimeOwnerId: openerRuntimeOwnerId,
        instanceId,
        buildingId,
        chamberInstanceId,
        nodeId,
        currentStoneCount: 500 - activationCost,
        chargedSpiritStones: activationCost - 1,
        durationHours: 1,
        expectedRevision: 3,
      }));
    } catch (error) {
      priceMismatchRejected = String(error instanceof Error ? error.message : error).includes('time_chamber_price_changed');
    }
    if (!priceMismatchRejected) throw new Error('客户端报价与权威公式不一致时应拒绝并回滚');
    await assertInventoryCount(pool, openerPlayerId, 500 - activationCost);

    const ownerMutation = buildActivationMutation({
      operationId: ownerActivationOperationId,
      playerId: ownerPlayerId,
      runtimeOwnerId: ownerRuntimeOwnerId,
      instanceId,
      buildingId,
      chamberInstanceId,
      nodeId,
      currentStoneCount: 500,
      chargedSpiritStones: activationCost,
      durationHours: 1,
      expectedRevision: 3,
    });
    const ownerResult = await service.grantInventoryItems(ownerMutation);
    if (!ownerResult.ok || ownerResult.alreadyCommitted) {
      throw new Error(`建造者付费开启事务异常：${JSON.stringify(ownerResult)}`);
    }
    await assertInventoryCount(pool, ownerPlayerId, 500 - activationCost);

    const audit = await pool.query(
      'SELECT action FROM asset_audit_log WHERE operation_id = $1 ORDER BY created_at ASC',
      [activationOperationId],
    );
    const outbox = await pool.query(
      'SELECT topic, status FROM outbox_event WHERE operation_id = $1 ORDER BY created_at ASC',
      [activationOperationId],
    );
    if (!audit.rows.some((row) => row.action === 'activate')) {
      throw new Error(`密室开启审计缺失：${JSON.stringify(audit.rows)}`);
    }
    if (
      outbox.rows?.[0]?.topic !== 'player.inventory.transferred'
      || (outbox.rows?.[0]?.status !== 'ready' && outbox.rows?.[0]?.status !== 'delivered')
    ) {
      throw new Error(`密室开启 outbox 异常：${JSON.stringify(outbox.rows)}`);
    }

    await pool.query(
      `UPDATE instance_time_chamber_state
          SET active_started_at_ms = NULL, active_expires_at_ms = NULL,
              activation_player_id = NULL, activation_spirit_stones = 0,
              revision = revision + 1
        WHERE source_instance_id = $1 AND building_id = $2`,
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
      answers: '开启者按倍率、容量和时长直接支付；建造者无免费特例；开启状态与背包扣款同事务提交；重复开启、错误报价会完整回滚；相同 operationId 不重复扣款；拆除仍受 lease 与 ownership epoch 围栏保护。',
      excludes: '不启动 socket 客户端，不证明控制台 DOM 交互与真实时间到期传送。',
      completionMapping: 'release:proof:with-db.time-chamber-durable-fuel',
    }, null, 2));
  } finally {
    await cleanup(pool, [ownerPlayerId, openerPlayerId], instanceId, chamberInstanceId, buildingId).catch(() => undefined);
    await service.onModuleDestroy().catch(() => undefined);
    await databasePoolProvider.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
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
      active_started_at_ms bigint,
      active_expires_at_ms bigint,
      activation_player_id varchar(100),
      activation_spirit_stones bigint NOT NULL DEFAULT 0,
      revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (source_instance_id, building_id)
    )
  `);
  await pool.query('ALTER TABLE instance_time_chamber_state ADD COLUMN IF NOT EXISTS active_started_at_ms bigint');
  await pool.query('ALTER TABLE instance_time_chamber_state ADD COLUMN IF NOT EXISTS active_expires_at_ms bigint');
  await pool.query('ALTER TABLE instance_time_chamber_state ADD COLUMN IF NOT EXISTS activation_player_id varchar(100)');
  await pool.query('ALTER TABLE instance_time_chamber_state ADD COLUMN IF NOT EXISTS activation_spirit_stones bigint NOT NULL DEFAULT 0');
}

async function seedFixture(pool: Pool, input: {
  ownerPlayerId: string;
  openerPlayerId: string;
  ownerRuntimeOwnerId: string;
  openerRuntimeOwnerId: string;
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
      [input.openerPlayerId, input.openerRuntimeOwnerId],
    ] as const) {
      await client.query(
        `INSERT INTO player_presence(player_id, online, in_world, last_heartbeat_at, runtime_owner_id, session_epoch, updated_at)
         VALUES ($1, true, true, $2, $3, 7, now())`,
        [playerId, Date.now(), runtimeOwnerId],
      );
      await client.query(
        `INSERT INTO player_inventory_item(item_instance_id, player_id, slot_index, item_id, count, raw_payload, updated_at)
         VALUES ($1, $2, 0, 'spirit_stone', 500, $3::jsonb, now())`,
        [`inventory:${playerId}:0`, playerId, JSON.stringify({ itemId: 'spirit_stone', count: 500 })],
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
         display_name, size_tier, capacity, configured_speed, revision
       ) VALUES ($1, $2, $3, $4, $5, '事务烟测密室', 'small', 3, 2, 1)`,
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

async function assertInventoryCount(pool: Pool, playerId: string, expectedStoneCount: number): Promise<void> {
  const inventory = await pool.query(
    'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
    [playerId],
  );
  if (inventory.rows.length !== 1
    || inventory.rows[0]?.item_id !== 'spirit_stone'
    || Number(inventory.rows[0]?.count) !== expectedStoneCount) {
    throw new Error(`灵石背包状态异常：${JSON.stringify(inventory.rows)}`);
  }
}

async function readChamberState(pool: Pool, instanceId: string, buildingId: string): Promise<{
  activeStartedAt: number | null;
  activeExpiresAt: number | null;
  activationPlayerId: string | null;
  activationSpiritStones: number;
  revision: number;
}> {
  const result = await pool.query(
    `SELECT active_started_at_ms, active_expires_at_ms, activation_player_id,
            activation_spirit_stones, revision
       FROM instance_time_chamber_state
      WHERE source_instance_id = $1 AND building_id = $2`,
    [instanceId, buildingId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('密室状态缺失');
  return {
    activeStartedAt: row.active_started_at_ms === null ? null : Number(row.active_started_at_ms),
    activeExpiresAt: row.active_expires_at_ms === null ? null : Number(row.active_expires_at_ms),
    activationPlayerId: typeof row.activation_player_id === 'string' ? row.activation_player_id : null,
    activationSpiritStones: Number(row.activation_spirit_stones),
    revision: Number(row.revision),
  };
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
    `SELECT capacity, configured_speed, active_started_at_ms, active_expires_at_ms,
            activation_player_id, activation_spirit_stones, revision
       FROM instance_time_chamber_state
      WHERE source_instance_id = $1 AND building_id = $2`,
    [input.instanceId, input.buildingId],
  );
  const stateRow = persistedState.rows[0];
  if (!stateRow) throw new Error('拆除围栏测试缺少密室状态');
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
    activeStartedAt: stateRow.active_started_at_ms === null ? null : Number(stateRow.active_started_at_ms),
    activeExpiresAt: stateRow.active_expires_at_ms === null ? null : Number(stateRow.active_expires_at_ms),
    activationPlayerId: stateRow.activation_player_id ?? null,
    activationSpiritStones: Number(stateRow.activation_spirit_stones),
    maxSpeed: MAX_INSTANCE_TICK_SPEED,
    allowedSizeTiers: ['small', 'medium', 'large'],
    revision: Number(stateRow.revision),
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
    worldRuntimeFormationService: { listRuntimeFormations: () => [], releaseInstance(): void {} },
  };
  const timeChamberService = new TimeChamberRuntimeService(
    {} as never,
    { unregisterRuntimeMapTemplate(): boolean { return true; } } as never,
    { playerDomainPersistenceService: { isEnabled: () => true, hasRetainedPlayersInInstance: async () => false } } as never,
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

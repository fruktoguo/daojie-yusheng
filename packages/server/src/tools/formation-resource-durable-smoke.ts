import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { DurableOperationService } from '../persistence/durable-operation.service';
import type { PersistedPlayerSnapshot } from '../persistence/player-persistence.service';
import { WorldRuntimeFormationService } from '../runtime/world/world-runtime-formation.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

const databaseUrl = resolveServerDatabaseUrl();
const spiritStoneItemInstanceId = randomUUID();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: 'with-db 下阵法资源事务会原子提交玩家 inventory/wallet/vitals、formation、watermark、outbox 与 audit，并校验 presence、实例 lease/epoch 和阵法版本。',
    }, null, 2));
    return;
  }

  const now = Date.now();
  const playerId = `formation_resource_${now.toString(36)}`;
  const runtimeOwnerId = `runtime:${playerId}:1`;
  const instanceId = `instance:${playerId}:lease`;
  const formationInstanceId = `formation:${instanceId}:1`;
  const operationPrefix = `op:${playerId}:formation-resource`;
  const nodeId = 'node:formation-resource-durable-smoke';
  const leaseToken = `lease:${instanceId}`;
  const pool = new Pool({ connectionString: databaseUrl });
  const databasePoolProvider = new DatabasePoolProvider();
  const durable = new DurableOperationService({ getNodeId: () => nodeId } as never, databasePoolProvider);
  const formationPersistence = new WorldRuntimeFormationService({}, {}, databasePoolProvider);

  try {
    await durable.onModuleInit();
    await formationPersistence.onModuleInit();
    if (!durable.isEnabled()) {
      throw new Error('durable-operation service not enabled');
    }
    await cleanupFixture(pool, playerId, instanceId, formationInstanceId, operationPrefix);
    await seedFixture(pool, {
      playerId,
      runtimeOwnerId,
      sessionEpoch: 6,
      instanceId,
      nodeId,
      ownershipEpoch: 9,
      now,
    });

    const deploySnapshot = buildPlayerSnapshot(now + 10, instanceId, 70, 900);
    const deployFormation = buildFormationSnapshot(formationInstanceId, instanceId, now + 20, 30, 3_000);
    let rejected = false;
    try {
      await durable.commitFormationResourceMutation({
        operationId: `${operationPrefix}:wrong-token`,
        playerId,
        expectedRuntimeOwnerId: runtimeOwnerId,
        expectedSessionEpoch: 6,
        expectedInstanceId: instanceId,
        expectedAssignedNodeId: nodeId,
        expectedLeaseToken: `${leaseToken}:stale`,
        expectedOwnershipEpoch: 9,
        action: 'deploy',
        formationWrite: {
          formationInstanceId,
          instanceId,
          snapshot: deployFormation,
        },
        expectFormationAbsent: true,
        nextPlayerSnapshot: deploySnapshot,
        spiritStoneCount: 30,
        qiAmount: 100,
        diskItemInstanceId: `disk:${playerId}:1`,
      });
    }
    catch (error) {
      rejected = String(error instanceof Error ? error.message : error).includes('instance_lease_fencing_conflict');
    }
    if (!rejected) {
      throw new Error('expected instance lease token fencing rejection');
    }
    await assertFixtureState(pool, {
      playerId,
      formationInstanceId,
      expectedSpiritStones: 100,
      expectedQi: 1_000,
      expectedFormationUpdatedAt: null,
    });

    const deployInput = {
      operationId: `${operationPrefix}:deploy`,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 6,
      expectedInstanceId: instanceId,
      expectedAssignedNodeId: nodeId,
      expectedLeaseToken: leaseToken,
      expectedOwnershipEpoch: 9,
      action: 'deploy' as const,
      formationWrite: {
        formationInstanceId,
        instanceId,
        snapshot: deployFormation,
      },
      expectFormationAbsent: true,
      nextPlayerSnapshot: deploySnapshot,
      spiritStoneCount: 30,
      qiAmount: 100,
      diskItemInstanceId: `disk:${playerId}:1`,
    };
    const firstResult = await durable.commitFormationResourceMutation(deployInput);
    if (!firstResult.ok || firstResult.alreadyCommitted || firstResult.action !== 'deploy') {
      throw new Error(`unexpected formation deploy result: ${JSON.stringify(firstResult)}`);
    }
    const replayResult = await durable.commitFormationResourceMutation(deployInput);
    if (!replayResult.ok || !replayResult.alreadyCommitted) {
      throw new Error(`unexpected formation deploy replay result: ${JSON.stringify(replayResult)}`);
    }
    await assertFixtureState(pool, {
      playerId,
      formationInstanceId,
      expectedSpiritStones: 70,
      expectedQi: 900,
      expectedFormationUpdatedAt: now + 20,
      expectedFormationSpiritStones: 30,
    });

    rejected = false;
    try {
      await durable.commitFormationResourceMutation({
        ...deployInput,
        operationId: `${operationPrefix}:collision`,
        nextPlayerSnapshot: buildPlayerSnapshot(now + 30, instanceId, 60, 850),
      });
    }
    catch (error) {
      rejected = String(error instanceof Error ? error.message : error).includes('durable_formation_already_exists');
    }
    if (!rejected) {
      throw new Error('expected formation id collision rejection');
    }

    const refillFormation = buildFormationSnapshot(formationInstanceId, instanceId, now + 21, 40, 3_050);
    rejected = false;
    try {
      await durable.commitFormationResourceMutation({
        ...deployInput,
        operationId: `${operationPrefix}:stale-refill`,
        action: 'refill',
        expectFormationAbsent: false,
        expectedFormationUpdatedAtMs: now + 19,
        formationWrite: {
          formationInstanceId,
          instanceId,
          snapshot: refillFormation,
        },
        nextPlayerSnapshot: buildPlayerSnapshot(now + 31, instanceId, 60, 850),
        spiritStoneCount: 10,
        qiAmount: 50,
        diskItemInstanceId: null,
      });
    }
    catch (error) {
      rejected = String(error instanceof Error ? error.message : error).includes('durable_formation_revision_conflict');
    }
    if (!rejected) {
      throw new Error('expected stale formation revision rejection');
    }
    await assertFixtureState(pool, {
      playerId,
      formationInstanceId,
      expectedSpiritStones: 70,
      expectedQi: 900,
      expectedFormationUpdatedAt: now + 20,
      expectedFormationSpiritStones: 30,
    });

    const refillResult = await durable.commitFormationResourceMutation({
      ...deployInput,
      operationId: `${operationPrefix}:refill`,
      action: 'refill',
      expectFormationAbsent: false,
      expectedFormationUpdatedAtMs: now + 20,
      formationWrite: {
        formationInstanceId,
        instanceId,
        snapshot: refillFormation,
      },
      nextPlayerSnapshot: buildPlayerSnapshot(now + 32, instanceId, 60, 850),
      spiritStoneCount: 10,
      qiAmount: 50,
      diskItemInstanceId: null,
    });
    if (!refillResult.ok || refillResult.alreadyCommitted || refillResult.action !== 'refill') {
      throw new Error(`unexpected formation refill result: ${JSON.stringify(refillResult)}`);
    }
    await assertFixtureState(pool, {
      playerId,
      formationInstanceId,
      expectedSpiritStones: 60,
      expectedQi: 850,
      expectedFormationUpdatedAt: now + 21,
      expectedFormationSpiritStones: 40,
    });

    const maintenanceFormation = buildFormationSnapshot(formationInstanceId, instanceId, now + 22, 40, 3_070);
    const maintenanceJob = buildFormationMaintenanceJob(playerId, formationInstanceId, 2);
    const maintenanceSnapshot = buildPlayerSnapshot(now + 33, instanceId, 60, 840);
    if (!maintenanceSnapshot.progression) {
      throw new Error('formation maintenance snapshot progression missing');
    }
    maintenanceSnapshot.progression = {
      ...maintenanceSnapshot.progression,
      formationSkill: { level: 2, exp: 1, expToNext: 60 },
      formationJob: { ...maintenanceJob.detailJson as Record<string, unknown> },
    };
    const maintenanceInput = {
      operationId: `${operationPrefix}:maintenance:1`,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 6,
      expectedInstanceId: instanceId,
      expectedAssignedNodeId: nodeId,
      expectedLeaseToken: leaseToken,
      expectedOwnershipEpoch: 9,
      formationWrite: {
        formationInstanceId,
        instanceId,
        snapshot: maintenanceFormation,
      },
      expectedFormationUpdatedAtMs: now + 21,
      expectedJobRunId: maintenanceJob.jobRunId,
      expectedJobVersion: 1,
      nextActiveJob: maintenanceJob,
      nextPlayerSnapshot: maintenanceSnapshot,
      qiAmount: 10,
      formationQiAmount: 20,
    };
    const maintenanceResult = await durable.commitFormationMaintenanceMutation(maintenanceInput);
    if (!maintenanceResult.ok || maintenanceResult.alreadyCommitted || maintenanceResult.jobVersion !== 2) {
      throw new Error(`unexpected formation maintenance result: ${JSON.stringify(maintenanceResult)}`);
    }
    const maintenanceReplay = await durable.commitFormationMaintenanceMutation(maintenanceInput);
    if (!maintenanceReplay.ok || !maintenanceReplay.alreadyCommitted) {
      throw new Error(`unexpected formation maintenance replay: ${JSON.stringify(maintenanceReplay)}`);
    }
    await assertFixtureState(pool, {
      playerId,
      formationInstanceId,
      expectedSpiritStones: 60,
      expectedQi: 840,
      expectedFormationUpdatedAt: now + 22,
      expectedFormationSpiritStones: 40,
    });
    await assertFormationMaintenanceState(pool, playerId, maintenanceJob.jobRunId, 2, 2, 1);

    rejected = false;
    try {
      await durable.commitFormationMaintenanceMutation({
        ...maintenanceInput,
        operationId: `${operationPrefix}:maintenance:stale-job`,
        expectedFormationUpdatedAtMs: now + 22,
        expectedJobVersion: 1,
        nextActiveJob: buildFormationMaintenanceJob(playerId, formationInstanceId, 2),
        formationWrite: {
          formationInstanceId,
          instanceId,
          snapshot: buildFormationSnapshot(formationInstanceId, instanceId, now + 23, 40, 3_090),
        },
        nextPlayerSnapshot: buildMaintenancePlayerSnapshot(now + 34, instanceId, 60, 830, playerId, formationInstanceId, 2, 2),
      });
    }
    catch (error) {
      rejected = String(error instanceof Error ? error.message : error).includes('formation_maintenance_job_fencing_conflict');
    }
    if (!rejected) {
      throw new Error('expected stale formation maintenance job rejection');
    }
    await assertFixtureState(pool, {
      playerId,
      formationInstanceId,
      expectedSpiritStones: 60,
      expectedQi: 840,
      expectedFormationUpdatedAt: now + 22,
      expectedFormationSpiritStones: 40,
    });

    const operationRows = await fetchRows(
      pool,
      'SELECT operation_type, status FROM durable_operation_log WHERE player_id = $1 ORDER BY operation_id ASC',
      [playerId],
    );
    const outboxRows = await fetchRows(
      pool,
      'SELECT topic, status FROM outbox_event WHERE operation_id LIKE $1 ORDER BY operation_id ASC',
      [`${operationPrefix}:%`],
    );
    const auditRows = await fetchRows(
      pool,
      'SELECT asset_type, action FROM asset_audit_log WHERE operation_id LIKE $1 ORDER BY operation_id ASC',
      [`${operationPrefix}:%`],
    );
    const watermark = await fetchSingleRow(
      pool,
      'SELECT inventory_version, wallet_version, vitals_version, profession_version, active_job_version FROM player_recovery_watermark WHERE player_id = $1',
      [playerId],
    );
    const operationTypes = operationRows.map((row) => row.operation_type).sort();
    if (
      operationRows.length !== 3
      || operationRows.some((row) => row.status !== 'committed')
      || JSON.stringify(operationTypes) !== JSON.stringify([
        'formation_maintenance_tick',
        'formation_resource_deploy',
        'formation_resource_refill',
      ])
    ) {
      throw new Error(`unexpected formation durable operation rows: ${JSON.stringify(operationRows)}`);
    }
    const outboxTopics = outboxRows.map((row) => row.topic).sort();
    if (
      outboxRows.length !== 3
      || JSON.stringify(outboxTopics) !== JSON.stringify([
        'formation.maintenance.tick',
        'formation.resource.deploy',
        'formation.resource.refill',
      ])
      || outboxRows.some((row) => row.status !== 'ready')
    ) {
      throw new Error(`unexpected formation outbox rows: ${JSON.stringify(outboxRows)}`);
    }
    const auditKinds = auditRows.map((row) => `${row.asset_type}:${row.action}`).sort();
    if (
      auditRows.length !== 3
      || JSON.stringify(auditKinds) !== JSON.stringify([
        'formation_maintenance:tick',
        'formation_resource:deploy',
        'formation_resource:refill',
      ])
    ) {
      throw new Error(`unexpected formation audit rows: ${JSON.stringify(auditRows)}`);
    }
    if (
      !watermark
      || Number(watermark.inventory_version) <= 0
      || Number(watermark.wallet_version) <= 0
      || Number(watermark.vitals_version) <= 0
      || Number(watermark.profession_version) <= 0
      || Number(watermark.active_job_version) <= 0
    ) {
      throw new Error(`unexpected formation recovery watermark: ${JSON.stringify(watermark)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      case: 'formation-resource-durable',
      answers: '真实 PostgreSQL 已证明布阵/补给及阵法维护 tick 的 presence + instance node/token/epoch + formation/job revision fencing；维护会把 vitals/profession/active_job/formation/watermark/outbox/audit 同事务提交，拒绝不污染真源且精确重放不重复。',
      firstResult,
      replayResult,
      refillResult,
      maintenanceResult,
      maintenanceReplay,
    }, null, 2));
  }
  finally {
    await cleanupFixture(pool, playerId, instanceId, formationInstanceId, operationPrefix).catch(() => undefined);
    await formationPersistence.closePersistencePool().catch(() => undefined);
    await durable.onModuleDestroy().catch(() => undefined);
    await databasePoolProvider.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

function buildPlayerSnapshot(
  savedAt: number,
  instanceId: string,
  spiritStoneCount: number,
  qi: number,
): PersistedPlayerSnapshot {
  return {
    version: 1,
    savedAt,
    placement: { instanceId, templateId: 'yunlai_town', x: 1, y: 1, facing: 1 },
    worldPreference: { linePreset: 'real' },
    vitals: { hp: 100, maxHp: 100, qi, maxQi: 1_000 },
    progression: {
      foundation: 0,
      combatExp: 0,
      bodyTraining: null,
      alchemySkill: null,
      gatherSkill: null,
      gatherJob: null,
      alchemyPresets: [],
      alchemyJob: null,
      enhancementSkill: null,
      enhancementSkillLevel: 1,
      enhancementJob: null,
      enhancementRecords: [],
      boneAgeBaseYears: 16,
      lifeElapsedTicks: 0,
      lifespanYears: null,
      realm: null,
      heavenGate: null,
      spiritualRoots: null,
    },
    inventory: {
      revision: 2,
      capacity: 24,
      items: spiritStoneCount > 0
        ? [{
            itemId: 'spirit_stone',
            itemInstanceId: spiritStoneItemInstanceId,
            count: spiritStoneCount,
            rawPayload: {
              itemId: 'spirit_stone',
              itemInstanceId: spiritStoneItemInstanceId,
              count: spiritStoneCount,
            },
          }]
        : [],
    },
    wallet: {
      balances: spiritStoneCount > 0
        ? [{ walletType: 'spirit_stone', balance: spiritStoneCount, frozenBalance: 0, version: 2 }]
        : [],
    },
  } as PersistedPlayerSnapshot;
}

function buildFormationMaintenanceJob(
  playerId: string,
  formationInstanceId: string,
  jobVersion: number,
): {
  jobRunId: string;
  jobType: 'formation';
  status: string;
  phase: string;
  startedAt: number;
  pausedTicks: number;
  totalTicks: number;
  remainingTicks: number;
  successRate: number;
  speedRate: number;
  jobVersion: number;
  detailJson: Record<string, unknown>;
} {
  const jobRunId = `job:${playerId}:formation:maintenance`;
  const detailJson = {
    jobRunId,
    jobType: 'formation',
    formationInstanceId,
    formationName: '聚灵阵',
    phase: 'maintaining',
    startedAt: 100,
    pausedTicks: 0,
    totalTicks: 1,
    remainingTicks: 1,
    workTotalTicks: 1,
    workRemainingTicks: 1,
    successRate: 1,
    maintenanceRate: 10,
    jobVersion,
  };
  return {
    jobRunId,
    jobType: 'formation',
    status: 'running',
    phase: 'maintaining',
    startedAt: 100,
    pausedTicks: 0,
    totalTicks: 1,
    remainingTicks: 1,
    successRate: 1,
    speedRate: 10,
    jobVersion,
    detailJson,
  };
}

function buildMaintenancePlayerSnapshot(
  savedAt: number,
  instanceId: string,
  spiritStoneCount: number,
  qi: number,
  playerId: string,
  formationInstanceId: string,
  jobVersion: number,
  formationSkillExp: number,
): PersistedPlayerSnapshot {
  const snapshot = buildPlayerSnapshot(savedAt, instanceId, spiritStoneCount, qi);
  const job = buildFormationMaintenanceJob(playerId, formationInstanceId, jobVersion);
  if (!snapshot.progression) {
    throw new Error('formation maintenance snapshot progression missing');
  }
  snapshot.progression = {
    ...snapshot.progression,
    formationSkill: { level: 2, exp: formationSkillExp, expToNext: 60 },
    formationJob: { ...job.detailJson },
  };
  return snapshot;
}

function buildFormationSnapshot(
  formationInstanceId: string,
  instanceId: string,
  updatedAt: number,
  remainingSpiritStoneBudget: number,
  remainingQiBudget: number,
): Record<string, unknown> {
  return {
    id: formationInstanceId,
    instanceId,
    ownerPlayerId: 'formation-resource-owner',
    ownerSectId: null,
    formationId: 'spirit_gathering',
    lifecycle: 'deployed',
    diskItemId: 'formation_disk.mortal',
    diskTier: 'mortal',
    diskMultiplier: 1,
    spiritStoneCount: remainingSpiritStoneBudget,
    qiCost: 100,
    x: 1,
    y: 1,
    eyeInstanceId: instanceId,
    eyeX: 1,
    eyeY: 1,
    allocation: {},
    active: true,
    remainingAuraBudget: remainingQiBudget,
    remainingQiBudget,
    remainingSpiritStoneBudget,
    createdAt: updatedAt - 10,
    updatedAt,
  };
}

async function seedFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    instanceId: string;
    nodeId: string;
    ownershipEpoch: number;
    now: number;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO player_presence(player_id, online, in_world, last_heartbeat_at, runtime_owner_id, session_epoch, updated_at)
     VALUES ($1, true, true, $2, $3, $4, now())`,
    [input.playerId, input.now, input.runtimeOwnerId, input.sessionEpoch],
  );
  await pool.query(
    `INSERT INTO player_inventory_item(player_id, slot_index, item_id, count, item_instance_id, raw_payload, updated_at)
     VALUES
       ($1, 0, 'formation_disk.mortal', 1, $2, $3::jsonb, now()),
       ($1, 1, 'spirit_stone', 100, $4, $5::jsonb, now())`,
    [
      input.playerId,
      `disk:${input.playerId}:1`,
      JSON.stringify({ itemId: 'formation_disk.mortal', itemInstanceId: `disk:${input.playerId}:1`, count: 1 }),
      spiritStoneItemInstanceId,
      JSON.stringify({ itemId: 'spirit_stone', itemInstanceId: spiritStoneItemInstanceId, count: 100 }),
    ],
  );
  await pool.query(
    `INSERT INTO player_wallet(player_id, wallet_type, balance, frozen_balance, version, updated_at)
     VALUES ($1, 'spirit_stone', 100, 0, 1, now())`,
    [input.playerId],
  );
  await pool.query(
    `INSERT INTO player_vitals(player_id, hp, max_hp, qi, max_qi, updated_at)
     VALUES ($1, 100, 100, 1000, 1000, now())`,
    [input.playerId],
  );
  await pool.query(
    `INSERT INTO player_recovery_watermark(player_id, inventory_version, wallet_version, vitals_version, updated_at)
     VALUES ($1, 0, 0, 0, now())
     ON CONFLICT (player_id) DO NOTHING`,
    [input.playerId],
  );
  await pool.query(
    `INSERT INTO instance_catalog(
       instance_id, template_id, instance_type, persistent_policy, status, runtime_status,
       assigned_node_id, lease_token, lease_expire_at, ownership_epoch,
       cluster_id, shard_key, route_domain, created_at, last_active_at, last_persisted_at
     )
     VALUES ($1, 'yunlai_town', 'public', 'persistent', 'active', 'leased', $2, $3, $4::timestamptz, $5,
       'cluster:default', $1, 'world', now(), now(), now())`,
    [
      input.instanceId,
      input.nodeId,
      `lease:${input.instanceId}`,
      new Date(Date.now() + 60_000).toISOString(),
      input.ownershipEpoch,
    ],
  );
}

async function assertFixtureState(
  pool: Pool,
  input: {
    playerId: string;
    formationInstanceId: string;
    expectedSpiritStones: number;
    expectedQi: number;
    expectedFormationUpdatedAt: number | null;
    expectedFormationSpiritStones?: number;
  },
): Promise<void> {
  const inventoryRows = await fetchRows(
    pool,
    'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
    [input.playerId],
  );
  const wallet = await fetchSingleRow(
    pool,
    "SELECT balance FROM player_wallet WHERE player_id = $1 AND wallet_type = 'spirit_stone'",
    [input.playerId],
  );
  const vitals = await fetchSingleRow(pool, 'SELECT qi FROM player_vitals WHERE player_id = $1', [input.playerId]);
  const formation = await fetchSingleRow(
    pool,
    'SELECT updated_at_ms, remaining_spirit_stone_budget FROM instance_formation_state WHERE formation_instance_id = $1',
    [input.formationInstanceId],
  );
  const spiritStoneRow = inventoryRows.find((row) => row.item_id === 'spirit_stone') ?? null;
  if (
    Number(spiritStoneRow?.count ?? 0) !== input.expectedSpiritStones
    || Number(wallet?.balance ?? 0) !== input.expectedSpiritStones
    || Number(vitals?.qi ?? 0) !== input.expectedQi
  ) {
    throw new Error(`unexpected formation player asset state: ${JSON.stringify({ inventoryRows, wallet, vitals })}`);
  }
  if (input.expectedFormationUpdatedAt === null) {
    if (formation) {
      throw new Error(`formation row should be absent: ${JSON.stringify(formation)}`);
    }
    return;
  }
  if (
    !formation
    || Number(formation.updated_at_ms) !== input.expectedFormationUpdatedAt
    || Number(formation.remaining_spirit_stone_budget) !== input.expectedFormationSpiritStones
  ) {
    throw new Error(`unexpected formation row: ${JSON.stringify(formation)}`);
  }
}

async function assertFormationMaintenanceState(
  pool: Pool,
  playerId: string,
  expectedJobRunId: string,
  expectedJobVersion: number,
  expectedProfessionLevel: number,
  expectedProfessionExp: number,
): Promise<void> {
  const activeJob = await fetchSingleRow(
    pool,
    'SELECT job_run_id, job_type, job_version FROM player_active_job WHERE player_id = $1',
    [playerId],
  );
  const profession = await fetchSingleRow(
    pool,
    "SELECT level, exp FROM player_profession_state WHERE player_id = $1 AND profession_type = 'formation'",
    [playerId],
  );
  if (
    activeJob?.job_run_id !== expectedJobRunId
    || activeJob?.job_type !== 'formation'
    || Number(activeJob?.job_version ?? 0) !== expectedJobVersion
    || Number(profession?.level ?? 0) !== expectedProfessionLevel
    || Number(profession?.exp ?? 0) !== expectedProfessionExp
  ) {
    throw new Error(`unexpected formation maintenance state: ${JSON.stringify({ activeJob, profession })}`);
  }
}

async function cleanupFixture(
  pool: Pool,
  playerId: string,
  instanceId: string,
  formationInstanceId: string,
  operationPrefix: string,
): Promise<void> {
  await pool.query('DELETE FROM asset_audit_log WHERE operation_id LIKE $1', [`${operationPrefix}:%`]).catch(() => undefined);
  await pool.query('DELETE FROM outbox_event WHERE operation_id LIKE $1', [`${operationPrefix}:%`]).catch(() => undefined);
  await pool.query('DELETE FROM durable_operation_log WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_formation_state WHERE formation_instance_id = $1', [formationInstanceId]).catch(() => undefined);
  for (const table of [
    'player_inventory_item',
    'player_wallet',
    'player_vitals',
    'player_active_job',
    'player_technique_activity_queue',
    'player_profession_state',
    'player_presence',
    'player_recovery_watermark',
  ]) {
    await pool.query(`DELETE FROM ${table} WHERE player_id = $1`, [playerId]).catch(() => undefined);
  }
  await pool.query('DELETE FROM instance_catalog WHERE instance_id = $1', [instanceId]).catch(() => undefined);
}

async function fetchRows(pool: Pool, sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
  return (await pool.query(sql, params)).rows;
}

async function fetchSingleRow(pool: Pool, sql: string, params: unknown[]): Promise<Record<string, unknown> | null> {
  return (await pool.query(sql, params)).rows[0] ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

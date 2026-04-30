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
      answers: 'with-db 下 submitNpcQuestRewards 会在同一事务内提交 player_inventory_item/player_wallet/watermark/outbox/audit，并执行 runtime_owner_id + session_epoch + instance lease fencing',
      excludes: '不证明 quest_state 本身已与奖励资产放进同一事务，也不证明更通用的世界 tick 资产 intent 编排',
    }, null, 2));
    return;
  }

  const now = Date.now();
  const playerId = `npcquest_${now.toString(36)}`;
  const operationId = `op:${playerId}:npc-quest-submit:quest-ready`;
  const runtimeOwnerId = `runtime:${playerId}:1`;
  const leasedInstanceId = `instance:${playerId}:lease`;

  const pool = new Pool({ connectionString: databaseUrl });
  const service = new DurableOperationService({
    getNodeId() {
      return 'node:npc-quest-reward-smoke';
    },
  } as never);

  try {
    await service.onModuleInit();
    await cleanupPlayer(pool, playerId);
    await seedQuestRewardFixture(pool, {
      playerId,
      runtimeOwnerId,
      sessionEpoch: 6,
      now,
    });
    await seedInstanceCatalogFixture(pool, {
      instanceId: leasedInstanceId,
      assignedNodeId: 'node:npc-quest-reward-smoke',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
      ownershipEpoch: 9,
    });

    let rejected = false;
    try {
      await service.submitNpcQuestRewards({
        operationId: `${operationId}:wrong-owner`,
        playerId,
        expectedRuntimeOwnerId: `${runtimeOwnerId}:stale`,
        expectedSessionEpoch: 6,
        expectedInstanceId: leasedInstanceId,
        expectedAssignedNodeId: 'node:npc-quest-reward-smoke',
        expectedOwnershipEpoch: 9,
        questId: 'quest:ready',
        nextInventoryItems: buildNextInventoryItems(),
        nextWalletBalances: buildNextWalletBalances(),
        nextQuestEntries: buildNextQuestEntries(),
      });
    } catch (error) {
      rejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!rejected) {
      throw new Error('expected stale owner rejection before npc quest reward durable settlement');
    }

    rejected = false;
    try {
      await service.submitNpcQuestRewards({
        operationId: `${operationId}:wrong-session`,
        playerId,
        expectedRuntimeOwnerId: runtimeOwnerId,
        expectedSessionEpoch: 7,
        expectedInstanceId: leasedInstanceId,
        expectedAssignedNodeId: 'node:npc-quest-reward-smoke',
        expectedOwnershipEpoch: 9,
        questId: 'quest:ready',
        nextInventoryItems: buildNextInventoryItems(),
        nextWalletBalances: buildNextWalletBalances(),
        nextQuestEntries: buildNextQuestEntries(),
      });
    } catch (error) {
      rejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!rejected) {
      throw new Error('expected stale session rejection before npc quest reward durable settlement');
    }

    rejected = false;
    try {
      await service.submitNpcQuestRewards({
        operationId: `${operationId}:wrong-lease`,
        playerId,
        expectedRuntimeOwnerId: runtimeOwnerId,
        expectedSessionEpoch: 6,
        expectedInstanceId: leasedInstanceId,
        expectedAssignedNodeId: 'node:npc-quest-reward-smoke',
        expectedOwnershipEpoch: 10,
        questId: 'quest:ready',
        nextInventoryItems: buildNextInventoryItems(),
        nextWalletBalances: buildNextWalletBalances(),
        nextQuestEntries: buildNextQuestEntries(),
      });
    } catch (error) {
      rejected = String(error instanceof Error ? error.message : error).includes('instance_lease_fencing_conflict');
    }
    if (!rejected) {
      throw new Error('expected stale lease rejection before npc quest reward durable settlement');
    }

    const rejectedInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [playerId],
    );
    const rejectedWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [playerId],
    );
    if (
      rejectedInventoryRows.length !== 1
      || rejectedInventoryRows[0]?.item_id !== 'quest_token'
      || Number(rejectedInventoryRows[0]?.count) !== 1
    ) {
      throw new Error(`unexpected inventory rows after rejection: ${JSON.stringify(rejectedInventoryRows)}`);
    }
    if (
      rejectedWalletRows.length !== 1
      || rejectedWalletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(rejectedWalletRows[0]?.balance) !== 0
    ) {
      throw new Error(`unexpected wallet rows after rejection: ${JSON.stringify(rejectedWalletRows)}`);
    }

    const firstResult = await service.submitNpcQuestRewards({
      operationId,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 6,
      expectedInstanceId: leasedInstanceId,
      expectedAssignedNodeId: 'node:npc-quest-reward-smoke',
      expectedOwnershipEpoch: 9,
      questId: 'quest:ready',
      nextInventoryItems: buildNextInventoryItems(),
      nextWalletBalances: buildNextWalletBalances(),
      nextQuestEntries: buildNextQuestEntries(),
    });
    if (
      !firstResult.ok
      || firstResult.alreadyCommitted
      || firstResult.questId !== 'quest:ready'
    ) {
      throw new Error(`unexpected npc quest reward durable result: ${JSON.stringify(firstResult)}`);
    }

    const replayResult = await service.submitNpcQuestRewards({
      operationId,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 6,
      expectedInstanceId: leasedInstanceId,
      expectedAssignedNodeId: 'node:npc-quest-reward-smoke',
      expectedOwnershipEpoch: 9,
      questId: 'quest:ready',
      nextInventoryItems: buildNextInventoryItems(),
      nextWalletBalances: buildNextWalletBalances(),
      nextQuestEntries: buildNextQuestEntries(),
    });
    if (!replayResult.ok || !replayResult.alreadyCommitted) {
      throw new Error(`unexpected npc quest reward replay result: ${JSON.stringify(replayResult)}`);
    }

    const inventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [playerId],
    );
    const walletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [playerId],
    );
    const questRows = await fetchRows(
      pool,
      'SELECT quest_id, status FROM player_quest_progress WHERE player_id = $1 ORDER BY quest_id ASC',
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
      'SELECT inventory_version, wallet_version, quest_version FROM player_recovery_watermark WHERE player_id = $1',
      [playerId],
    );

    if (
      inventoryRows.length !== 1
      || inventoryRows[0]?.item_id !== 'rat_tail'
      || Number(inventoryRows[0]?.count) !== 2
    ) {
      throw new Error(`unexpected quest reward inventory rows: ${JSON.stringify(inventoryRows)}`);
    }
    if (
      walletRows.length !== 1
      || walletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(walletRows[0]?.balance) !== 3
    ) {
      throw new Error(`unexpected quest reward wallet rows: ${JSON.stringify(walletRows)}`);
    }
    if (
      questRows.length !== 2
      || questRows[0]?.quest_id !== 'quest:next'
      || questRows[0]?.status !== 'active'
      || questRows[1]?.quest_id !== 'quest:ready'
      || questRows[1]?.status !== 'completed'
    ) {
      throw new Error(`unexpected quest rows after durable submit settlement: ${JSON.stringify(questRows)}`);
    }
    if (!operationRow || operationRow.status !== 'committed' || !operationRow.committed_at) {
      throw new Error(`unexpected durable operation row: ${JSON.stringify(operationRow)}`);
    }
    if (
      outboxRows.length !== 1
      || outboxRows[0]?.topic !== 'player.quest.submitted'
      || outboxRows[0]?.status !== 'ready'
    ) {
      throw new Error(`unexpected outbox rows: ${JSON.stringify(outboxRows)}`);
    }
    if (
      auditRows.length !== 1
      || auditRows[0]?.asset_type !== 'quest'
      || auditRows[0]?.action !== 'submit'
    ) {
      throw new Error(`unexpected audit rows: ${JSON.stringify(auditRows)}`);
    }
    if (
      !watermarkRow
      || Number(watermarkRow.inventory_version) <= 0
      || Number(watermarkRow.wallet_version) <= 0
      || Number(watermarkRow.quest_version) <= 0
    ) {
      throw new Error(`unexpected watermark row: ${JSON.stringify(watermarkRow)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      case: 'npc-quest-reward-durable',
      answers: 'with-db 下 submitNpcQuestRewards 现已验证 runtime_owner_id + session_epoch + instance lease fencing、幂等回放、拒绝不污染真源，以及 player_inventory_item/player_wallet/player_quest_progress/watermark/outbox/audit 的同事务提交',
      excludes: '不证明更通用的世界 tick 资产 intent 编排',
      completionMapping: 'release:proof:with-db.npc-quest-reward-durable',
      firstResult,
      replayResult,
    }, null, 2));
  } finally {
    await cleanupPlayer(pool, playerId).catch(() => undefined);
    await service.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

function buildNextInventoryItems() {
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

function buildNextWalletBalances() {
  return [
    {
      walletType: 'spirit_stone',
      balance: 3,
      frozenBalance: 0,
      version: 1,
    },
  ];
}

function buildNextQuestEntries() {
  return [
    {
      questId: 'quest:ready',
      status: 'completed',
      progressPayload: null,
      rawPayload: {
        id: 'quest:ready',
        questId: 'quest:ready',
        status: 'completed',
        progress: null,
      },
    },
    {
      questId: 'quest:next',
      status: 'active',
      progressPayload: null,
      rawPayload: {
        id: 'quest:next',
        questId: 'quest:next',
        status: 'active',
        progress: null,
      },
    },
  ];
}

async function seedQuestRewardFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    now: number;
  },
): Promise<void> {
  await pool.query(
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
      VALUES ($1, true, true, $2, $3, $4, now())
    `,
    [input.playerId, input.now, input.runtimeOwnerId, input.sessionEpoch],
  );

  await pool.query(
    `
      INSERT INTO player_inventory_item(
        player_id,
        slot_index,
        item_id,
        count,
        item_instance_id,
        raw_payload,
        updated_at
      )
      VALUES ($1, 0, 'quest_token', 1, $2, $3::jsonb, now())
    `,
    [
      input.playerId,
      `inst:${input.playerId}:quest-token`,
      JSON.stringify({ itemId: 'quest_token', count: 1 }),
    ],
  );

  await pool.query(
    `
      INSERT INTO player_wallet(
        player_id,
        wallet_type,
        balance,
        frozen_balance,
        version,
        updated_at
      )
      VALUES ($1, 'spirit_stone', 0, 0, 0, now())
    `,
    [input.playerId],
  );

  await pool.query(
    `
      INSERT INTO player_recovery_watermark(
        player_id,
        inventory_version,
        wallet_version,
        quest_version,
        updated_at
      )
      VALUES ($1, 0, 0, 0, now())
      ON CONFLICT (player_id)
      DO NOTHING
    `,
    [input.playerId],
  );

  await pool.query(
    `
      INSERT INTO player_quest_progress(
        player_id,
        quest_id,
        status,
        progress_payload,
        raw_payload,
        updated_at
      )
      VALUES ($1, 'quest:ready', 'ready', 'null'::jsonb, $2::jsonb, now())
    `,
    [
      input.playerId,
      JSON.stringify({
        id: 'quest:ready',
        questId: 'quest:ready',
        status: 'ready',
        progress: null,
      }),
    ],
  );
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
      VALUES ($1, 'public:yunlai_town', 'public', 'persistent', 'active', 'leased', $2, $3, $4::timestamptz, $5, 'cluster:default', $1, 'world', now(), now(), now())
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
    [input.instanceId, input.assignedNodeId, `lease:${input.instanceId}`, input.leaseExpireAt, input.ownershipEpoch],
  );
}

async function fetchRows(pool: Pool, sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function fetchSingleRow(pool: Pool, sql: string, params: unknown[]): Promise<Record<string, unknown> | null> {
  const result = await pool.query(sql, params);
  return result.rows[0] ?? null;
}

async function cleanupPlayer(pool: Pool, playerId: string): Promise<void> {
  const tables = [
    'asset_audit_log',
    'outbox_event',
    'durable_operation_log',
    'player_quest_progress',
    'player_inventory_item',
    'player_wallet',
    'player_presence',
    'player_recovery_watermark',
  ];
  for (const table of tables) {
    await pool.query(`DELETE FROM ${table} WHERE player_id = $1`, [playerId]).catch(() => undefined);
  }
  await pool.query(
    `DELETE FROM instance_catalog WHERE instance_id = $1`,
    [`instance:${playerId}:lease`],
  ).catch(() => undefined);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
